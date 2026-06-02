# Poller Stability — Root Causes & History

## What the poller does

A Node.js process running on Fly.io (`sjc` region) that:
1. Fetches a JPEG image from PIR's noise monitor URL every second
2. Crops, preprocesses with Sharp, and OCRs with Tesseract.js (LSTM engine)
3. Writes each result to Supabase as a row with status: `ok | error | blank | stale | ocr_fail`
4. Broadcasts readings over WebSocket to connected browsers
5. Exposes `/ping` (always 200) and `/health` (503 if silent >60 min) for monitoring

---

## Root cause #1 — OOM kills (primary instability cause)

**Memory footprint at rest:** ~390MB RSS
- Tesseract.js LSTM model: ~150MB loaded into Node.js heap
- Sharp (libvips): ~50MB
- Node.js runtime + V8 heap: ~100MB
- Image buffers during processing: ~50–100MB

**Original VM size:** 512MB → left only ~120MB headroom. Any spike (Tesseract
worker restart, large JPEG, memory fragmentation) pushed it over and triggered
a Linux OOM kill.

**Pattern when OOM loop occurs:**
1. Process starts → runs ~1–5 minutes → OOM killed (SIGKILL)
2. Fly detects non-zero exit → restarts (with backoff)
3. Restart → OOM kill again
4. After enough failures, Fly's backoff gives up → machine stays `stopped`
5. No automatic recovery from `stopped` state without manual intervention

**Fix applied (May 2026):** VM bumped to **1GB** in `fly.toml`.
```toml
[[vm]]
  memory = "1gb"
```
Headroom is now ~600MB, well clear of the observed RSS.

**Status:** Resolved. With 1GB the OOM loop has not recurred.

---

## Root cause #2 — Two Fly machines running simultaneously

**Discovered:** Late May 2026 when history counts showed days with >86,400 rows
(max possible from 1 machine × 1 poll/sec).

**Cause:** Fly.io provisions 2 machines by default for HTTP services for redundancy.
Both machines polled and wrote to Supabase every second → up to ~172,800 rows/day,
inflating all historical counts. Confirmed by two machine IDs in deploy output:
`48e0e39c77e768` and `e826333f762628`.

**Fix applied:** Destroyed duplicate machine. Added to `fly.toml`:
```toml
[http_service]
  min_machines_running = 1
  max_machines_running = 1
```
Also added restart policy to ensure Fly recovers from crashes:
```toml
[[restart]]
  policy = "on-failure"
```

**Status:** Resolved. One machine running. Historical data prior to fix is inflated
(can't be corrected retroactively).

---

## Root cause #3 — Health check clock bug (NTP step-correction)

**Symptom:** `/health` endpoint returned 503 immediately after container start,
causing UptimeRobot false alerts and Fly routing the machine out of service.

**Cause:** Fly containers start with their clock ~60–65s behind UTC. NTP corrects
this within the first minute. The health check was computing elapsed time using
`Date.now()` for both `lastPollTs` and `now`, so after NTP stepped the clock
forward 65s, `lastPollAgoMs` appeared as 65,000ms → exceeded the 10s stale
threshold → 503.

**Fix applied:** Replaced `Date.now()` with `performance.now()` (monotonic clock)
for elapsed-time calculation in `healthServer.ts`. NTP corrections no longer
affect the elapsed-time measurement.

---

## Root cause #4 — Supabase cold-start blocking the poll loop

**Symptom:** Health check showed stale on first startup; poll loop appeared frozen
for 60–65s after container start.

**Cause:** `recordPoll()` was called *after* `insertReading()`. Supabase's cold
TLS handshake takes ~65s on first connection. The health check saw no poll for
65s and returned 503.

**Fix applied:** Moved `recordPoll()` and `broadcast()` to *before* `insertReading()`
in `poll()`. DB write is now fire-and-forget (`.catch` for logging only). Health
reflects poll loop cadence, not storage latency.

---

## Root cause #5 — `/health` endpoint alerting on brief Fly restarts

**Symptom:** UptimeRobot sending 10+ emails/day. Fly machine restarts lasting
5–30 minutes each time would trigger immediate down + up email pairs.

**Cause:** Original `/health` stale threshold was 10 seconds. UptimeRobot free
tier doesn't support alert-delay thresholds (the `_60_0` parameter in
`alert_contacts` is silently ignored on free plans).

**Fixes applied (layered):**
1. Split `/ping` (always 200, Fly liveness) from `/health` (smart stale check,
   UptimeRobot target) in `healthServer.ts`
2. Raised `/health` stale threshold from 10s → **60 minutes** — only returns 503
   after a genuine hour of silence
3. Pointed UptimeRobot at **Vercel `/api/health`** instead of the Fly URL directly.
   Vercel queries the DB: returns 503 only if no DB row in last 60 min. This means
   brief Fly machine restarts are invisible to UptimeRobot as long as the DB has
   recent data.
4. UptimeRobot check interval set to 30 min (free tier caps at 5 min minimum;
   30 min was accepted but 60 min was not)

**Status:** Resolved. Emails now only fire for genuine hour-long outages.

---

## PIR's site outages (not our fault)

| Period | Duration | Status in DB |
|--------|----------|--------------|
| May 11–18, 2026 | ~7 days | 87,622 consecutive `error` rows (HTTP 503 from PIR) |

PIR's noise monitor page (`portlandraceway.com/?/about/noise_information`) went
down returning HTTP 503. Our poller was running fine throughout — it just recorded
`error` status for every poll. The site came back May 18 at 10:34 AM PT.

**How to distinguish PIR outage vs our outage:**
- PIR down → DB has rows with `status = 'error'` (poller was running, PIR wasn't)
- Our poller down → DB has no rows at all for that window

---

## OCR failure rate fix — leading-digit '5' bug

**Symptom:** ~7–8% OCR failure rate specifically when the leading digit was 5
(e.g., 57.6 dB would fail; 47.6 would not). Confirmed by DB query grouping
failure rates by 10s decade.

**Root cause:** `CROP_H=34%` extended into the "LAFmax/dB" label row at ~76% from
the top of the image. Tesseract (digit-only whitelist) read part of the button
outline as "3" and prepended it to the reading: `57.6` → `357.6` → rejected as
>150 dB → `ocr_fail`.

**Fix applied:**
- `CROP_H`: 34 → **28** (crop ends at ~74%, above the label row)
- Scale: 2× → **4×** (more pixels → better Tesseract LSTM confidence)

**Status:** Resolved. 0 failures in post-fix test on known-failing frames.

---

## Monitoring setup

| Component | URL | Purpose |
|-----------|-----|---------|
| UptimeRobot | `https://pir-sound-tracker.vercel.app/api/health` | Emails if no DB row for >60 min |
| Fly liveness | `/ping` on Fly machine | Fly's internal check, always 200 |
| Vercel health API | `api/health.ts` | Queries DB, used by UptimeRobot |

---

## Root cause #6 — Concurrent poll accumulation (memory spikes under slow OCR)

**Symptom:** Intermittent OOM crashes even with 1GB VM; memory spikes visible in
5-minute stats logs.

**Cause:** Poll loop used `setInterval` at 1s intervals but did not await each poll.
When Tesseract took 2-3s under load, polls piled up concurrently: each held a
JPEG buffer in memory and queued a `worker.recognize()` call. With a 30s OCR
timeout you could accumulate ~30 concurrent polls before the timeout triggered
`process.exit(1)`. That's 30x the normal buffer memory plus V8 heap pressure from
30 pending promises.

**Fix applied (June 2026):** Replaced `setInterval` with a recursive `setTimeout`
loop in `index.ts`. Each poll completes fully before the next is scheduled. The
loop still targets 1s cadence: if a poll finishes in 800ms, the next starts after
a 200ms delay; if a poll takes 1.5s, the next starts immediately (0ms delay).

Also hardened `ocr.ts`: non-timeout worker errors now terminate and null the worker
so the next poll gets a fresh one, rather than reusing a potentially corrupted
worker state.

**Follow-up research (June 2026):** Investigated whether the sequential loop would
reduce DB write frequency below 1/second. Key findings:

- Source image is **240×320 px** (tiny PNG, ~6.8KB). After crop (46% top, 28%
  height) and 4x upscale, preprocessed image is **960×360px** — much smaller than
  originally estimated.
- Locally (Apple Silicon), LSTM OCR on this image takes **~25ms** per call after
  worker initialization. Even at 10× slower on Fly's shared AMD EPYC, that's
  ~250ms, giving total poll times of ~400–800ms — well under 1s.
- Legacy OCR (OEM 0) was considered but cannot be used: the baked `eng.traineddata`
  only contains the LSTM model. The legacy engine components are absent.
- **Conclusion:** the sequential loop is expected to maintain ~1s cadence in normal
  operation. The risk scenario is an occasional slow fetch or Tesseract spike
  causing one poll to run long — but nothing cascades since polls are sequential.

**Added (June 2026):** Per-phase timing (`fetch=Xms pre=Xms ocr=Xms`) is now logged
on every poll line and averaged in the 5-minute stats, so actual Fly performance is
visible in logs and can be compared against these estimates.

---

## Root cause #7 — Tesseract.js WASM starves event loop, OCR timeout can never fire

**Symptom:** OOM kill at 843MB RSS on a 1GB VM. The process started at 83MB and
grew to 843MB within ~2 minutes — sometimes even while all fetches were aborting
and no OCR appeared to be running.

**Root cause:** Tesseract.js runs the OCR engine in a WASM module inside a Node.js
`worker_thread`. On a 1-vCPU shared Fly machine, the WASM thread monopolizes the
CPU when processing (or getting stuck on) an image. This starves the main event
loop, so the `setTimeout`-based OCR timeout callback never gets scheduled.
Meanwhile, the WASM heap grows unboundedly. By the time the Linux OOM killer fires,
the `process.exit(1)` timeout has still not run.

The `/health` endpoint failing its Fly service check mid-run confirmed event loop
starvation — the HTTP server could not respond while WASM was running.

**Fix applied (June 2026):** Replaced `tesseract.js` entirely with the
**Tesseract CLI** (`child_process.spawn`). Each OCR call spawns a fresh `tesseract`
subprocess:
- `child.kill('SIGKILL')` on timeout is an OS-level kill — fires regardless of
  CPU load or event loop state
- The subprocess's memory is separate from the Node.js process — a hung or
  runaway Tesseract cannot OOM the poller
- No worker thread, no WASM heap, no GC pressure in the main process
- Each call is stateless — no "degraded worker" accumulation

**Dockerfile change:** Added `tesseract-ocr` apt package. Removed the `gzip` step
(the CLI needs uncompressed `.traineddata`; `tesseract.js` needed `.gz`).

**Measured timings on Fly (June 2026):** fetch 75–1263ms, preprocess 33–55ms,
OCR 142–168ms (2168ms first call, cold start). Total per poll ~1–1.5s, maintaining
approximately 1 row/second in the DB.

---

## Current configuration (as of June 2026)

```toml
# apps/poller/fly.toml
[[vm]]
  memory   = "1gb"
  cpu_kind = "shared"
  cpus     = 1

[http_service]
  min_machines_running = 1
  max_machines_running = 1
  auto_stop_machines   = false
  auto_start_machines  = false

[[restart]]
  policy = "on-failure"
```

**Poll rate:** 1 second  
**Region:** sjc (San Jose)  
**Supabase project:** `hrbcaifwpztqsdyjpqfh` (us-west-1)
