# Capture Rate & Supabase Cost — Assessment (Sep 2026)

Goal of the app: store one reading per second whenever PIR's meter is publishing.
This doc records where we actually are, why, and what drives the Supabase bill.
Evidence comes from the production DB, Fly logs and machine status pulled on
2026-09-23.

---

## TL;DR

- We capture **~34% of seconds** (~29k rows/day of a possible 86,400). Before
  Sep 10 it was ~48% (~42k/day). We have **never** been at 1 reading/second.
- The Sep 10 drop lines up to the hour with a **Fly host migration**
  (07:05 PT). After it, OCR went from ~150 ms to ~2 s average, consistent
  with Fly's shared-CPU quota throttling.
- The losses are **not** PIR outages: rows arrive steadily around the clock,
  just every ~3 s instead of every 1 s.
- The DB is **503 MB**, just over the Free tier's 500 MB cap — almost
  certainly what forced the Pro upgrade. ~46% of that is two indexes.

---

## 1. Capture rate

### What the DB shows

| Period | Rows/day | % of 86,400 | Rows/hour |
|---|---|---|---|
| Jun 3 – Sep 9 | ~41–43k | ~48% | ~1,750 |
| Sep 10 – now | ~29–30k | ~34% | ~1,200 |

Last 6 h gap distribution between consecutive rows: 17% under 1.5 s, 25%
1.5–2.5 s, 24% 2.5–3.5 s, 30% 3.5–5 s, 5% 5–15 s. No gaps over 15 s, so
there were no outages in that window. The loop is simply slow.

Failure rate (`error`/`blank`/`stale`/`ocr_fail`) is only ~2–3%/day, so
failures are a minor contributor. Almost all the loss is **seconds we never
polled**.

### Sep 10: host migration

`fly machine status` shows machine `e826333f762628` was **created with
`migrated=true` on 2026-09-10 07:05 PT**. Hourly row counts that morning:

```
06:00  1,751
07:00  1,464   ← migration at 07:05
08:00  1,219
09:00  1,208   (steady ~1,200/h ever since)
```

No code was deployed around then (last commit Jul 22).

### Why the loop is slow — Fly logs (2026-09-23 12:42–12:44 UTC)

5-min stats: `ok=99 fail=2 total=101 | avg fetch=894ms pre=127ms ocr=1980ms | rss=165MB`

That is 101 polls in 300 s (one every ~3 s). The June baseline in
`poller-stability.md` was fetch 75–1263 ms, pre 33–55 ms, **OCR 142–168 ms**.

Per-poll timings show two patterns:

1. **OCR is 10–25× slower and erratic** (195 ms – 4.3 s). The slowest OCR
   (2–4 s) and the preprocess spikes (250–770 ms) come right after a fast
   fetch, when the CPU had no idle time before the work. After a ~1 s fetch
   (idle), OCR is back to 200–380 ms.
2. **Fetch time is bimodal.** Fetches are either ~70 ms or ~0.9–1.7 s. In the
   sample, all 9 of 9 ~70 ms fetches returned **the same dB as the previous
   poll**, so a fast fetch appears to return the previous (cached) frame and
   a slow fetch a new one. The DB agrees: ~20% of consecutive `ok` readings
   since Sep 10 repeat the previous value (28% in the week before, when we
   polled faster).

### Most likely cause: Fly shared-CPU throttling

The machine is `shared-cpu-1x`. Per Fly's docs, that guarantees only **6.25%
of a core** (5 ms per 80 ms). It can burst to 100% from a balance that starts
at 5 s on machine start and fills only while usage is *below* baseline. Once
the balance is empty, the process is paused for the rest of each 80 ms slice.

The poller spawns a fresh `tesseract` process on every poll, which loads the
LSTM model, plus 2–3 Sharp decodes. Sustained, that's well above 6.25%, so the
balance can't recover and CPU-heavy phases stretch out. That matches the
"slow after no idle time" pattern above.

Why it changed on Sep 10 isn't proven. The new machine's burst balance reset,
and/or the new host enforces quotas more strictly than the old one did (Fly
rolled quota enforcement out gradually). **To confirm:** `fly dashboard` →
Metrics → CPU throttling / quota balance, before vs after Sep 10.

### Structural limits, independent of the throttling

These already capped us at ~48% before the migration:

- **Serial loop.** Fetch → brightness decode → metadata decode → preprocess
  decode → spawn tesseract → schedule next. Every ms spent anywhere is a ms
  not sampling. A single ~1 s fetch alone uses the whole 1 s budget.
- **Duplicate frames are fully processed.** The stale check only flags after
  10 s of identical frames. Until then every duplicate is OCR'd and stored
  as a new row.
- **Aliasing.** The source produces roughly one new frame per second, so
  polling at exactly 1 Hz with jitter will sometimes hit the same frame twice
  and skip the next. Capturing every frame needs faster sampling plus
  de-duplication.

### Not the cause

- The local `flyctl` version. It's only the deploy/log CLI and doesn't run on
  the machine.
- Memory. RSS is 165 MB on a 1 GB VM. The 1 GB size dates from the old
  in-process `tesseract.js`; 512 MB would be plenty now.
- Supabase write latency. Inserts are fire-and-forget and don't block the
  loop (mean insert time 1.0 ms).

---

## 2. Supabase cost

Org plan: **Pro**. Project `hrbcaifwpztqsdyjpqfh`, created 2026-05-11.

### Storage is what pushed us off Free

| Object | Size |
|---|---|
| Whole DB | **503 MB** (Free cap: 500 MB) |
| `readings` heap | 264 MB (~5.2M rows) |
| `readings_pkey` on `id` | 113 MB |
| `idx_readings_ts` on `ts` | 113 MB |
| Everything else | ~1 MB |

- **~94 bytes per reading** all-in (~50 heap + ~43 index).
- **The `id` column and its index are unused.** No app code reads `id`, and
  every query filters or orders by `ts`. That's 113 MB of index plus 8 B/row
  for nothing.
- `ts` is a plain btree. Rows are inserted in time order, so a BRIN index
  (a few hundred KB) or making `ts` itself the primary key would cover the
  same queries.
- **Growth.** At today's 29k rows/day, ~2.7 MB/day (~80 MB/month). At the
  target of 86,400/day on this schema, **~8 MB/day (~245 MB/month, ~3 GB/yr)**.
  Fixing capture without changing storage makes the DB grow 3× faster.
- The data compresses very well. It's small numbers that change slowly, one
  per second. Packing a minute of readings into one row (e.g. a `smallint[60]`
  of tenths of a dB) would be roughly 180–200 B/minute, about 100 MB/year at a
  full 1 Hz, with every second kept.

### Realtime (secondary, usage not verified)

- The Live view subscribes to `postgres_changes` INSERTs on `readings`.
  Supabase bills a message per change *per connected client*. At 1 Hz, one
  tab left open for a month is ~2.6M messages. Free includes 2M/month and the
  overage is $2.50 per 1M.
- It also costs DB work. Realtime's WAL polling query has run 206k times
  (~1.2M ms total), the second-largest DB load after the inserts.
- The poller already runs its own WebSocket server (`wsServer.ts`, port 3001),
  but the web app doesn't use it. Port 3001 isn't exposed in `fly.toml`, and
  `useWebSocket.ts` is unused.
- **To check:** Supabase dashboard → Billing/Usage → Realtime messages and
  egress. If the bill is more than $25/month, those line items show why.

### Minor

- `get_daily_summary(date_str)` filters with `to_char(ts…) = date_str`, which
  can't use an index and scans every row. It's only reached via
  `/api/summary/today`, which the web app doesn't call.
- `ta_bookings` and `atb_bookings` (~200 KB, `public` schema) aren't part of
  this app. If the project moves plans, they move with it.

---

## 3. Corrections to earlier notes

- `poller-stability.md` predicted the sequential loop would "maintain ~1 s
  cadence". In practice it never has: ~2 s per poll from June to Sep 9, ~3 s
  since.
- An earlier in-conversation estimate said about half of polls were duplicate
  frames. The data says **~20%**, though those duplicates are also the polls
  with the slowest OCR, so their share of CPU is higher.

---

## Sources

- Fly CPU quotas: [CPU Performance · Fly Docs](https://fly.io/docs/machines/cpu-performance/),
  [CPU Quotas Update · Fly community](https://community.fly.io/t/cpu-quotas-update/23473)
- Supabase limits: [Realtime Pricing · Supabase Docs](https://supabase.com/docs/guides/realtime/pricing),
  [About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase)
- Production data: `daily_summaries`, `readings`, `pg_stat_statements`,
  `pg_stat_user_indexes` (queried 2026-09-23)
