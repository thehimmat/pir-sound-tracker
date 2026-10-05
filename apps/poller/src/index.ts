import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });

import { config } from './config.js';
import { avgBrightness, preprocessImage } from './preprocess.js';
import { ocrImage, terminateOcr } from './ocr.js';
import { parseDbReading } from './parser.js';
import { simpleHash } from './imageHash.js';
import { nextMockReading } from './mock.js';
import { broadcast, attachWsServer, WS_PATH } from './wsServer.js';
import { startHealthServer, recordPoll, getPollAgeMs } from './healthServer.js';
import { insertReadings } from '@pir/db';
import { WriteQueue, flushDelayMs } from './writeQueue.js';
import { StaleDetector } from './staleDetector.js';
import { LatestFrame, startFetchClock, type FetchClock, type FetchResult } from './frameFeed.js';
import type { ReadingStatus, WsMessage } from '@pir/types';
import { getActiveLimit } from '@pir/types';
import { sendViolationAlert } from './notify.js';

// Readings wait here until the database accepts them (up to an hour at 1 Hz).
const writeQueue = new WriteQueue({ insertBatch: insertReadings });
let flushFailures = 0;
let loggedDropped = 0;

const staleDetector = new StaleDetector(config.staleAfterMs);
const frames = new LatestFrame();
let fetchClock: FetchClock | null = null;

// Consecutive non-ok tracking for escalated logging
let consecutiveFailCount = 0;
let consecutiveFailStatus: ReadingStatus | null = null;

// Violation alert tracking
const VIOLATION_SUSTAINED_MS = 60_000;   // alert after 60s above limit
const REALERT_MS              = 30 * 60_000; // re-alert if still violating after 30 min
let violationStartTs: number | null = null;
let lastAlertTs: number | null = null;

// Running totals for periodic stats
let statOk = 0;
let statFail = 0;
let statTotalFetchMs = 0;
let statTotalPreprocessMs = 0;
let statTotalOcrMs = 0;
let statOcrCount = 0;
let statSupersededAt = 0;   // frames.skipped at the last stats line
let statSkippedTicksAt = 0; // fetchClock.skippedTicks at the last stats line
let statIntervalHandle: ReturnType<typeof setInterval>;

const FETCH_TIMEOUT_MS = 10_000;

async function fetchImageBuffer(): Promise<Buffer> {
  const url = `${config.imageUrl}&t=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('empty response body');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// Turns one fetched frame into a reading. Runs one frame at a time, always
// on the newest frame the fetch clock has delivered (see frameFeed.ts).
async function processFrame(frame: FetchResult): Promise<void> {
  const ts = frame.ts;
  let raw_db: number | null = null;
  let status: ReadingStatus = 'ok';

  // Per-phase timing (ms). Populated for the phases that actually run.
  let tFetch = 0, tPreprocess = 0, tOcr = 0;

  try {
    if (config.mockMode) {
      raw_db = nextMockReading();
      status = 'ok';
    } else if (frame.error !== undefined || !frame.buf) {
      // 1. Fetch failed
      console.error(`[poller] fetch error: ${frame.error ?? 'no frame'}`);
      status = 'error';
    } else {
      const imgBuf = frame.buf;
      tFetch = frame.fetchMs;

      // 2. Blank check
      const brightness = await avgBrightness(imgBuf);
      if (brightness > 240) {
        status = 'blank';
      } else {
        // 3. Stale check: the same frame for more than 30 s. No OCR once stale.
        if (staleDetector.check(simpleHash(imgBuf), ts)) status = 'stale';

        if (status === 'ok') {
          // 4 & 5. Preprocess + OCR
          const t1 = Date.now();
          const processed = await preprocessImage(imgBuf);
            tPreprocess = Date.now() - t1;

          const t2 = Date.now();
          const { text: ocrText, confidence } = await ocrImage(processed);
          tOcr = Date.now() - t2;

          // 6. Parse
          const parsed = parseDbReading(ocrText);
          if (parsed === null) {
            status = 'ocr_fail';
            console.warn(`[poller] OCR_FAIL — confidence=${confidence.toFixed(0)}% raw="${ocrText.trim()}"`);
          } else {
            raw_db = parsed;
          }
        }
      }
    }
  } catch (err) {
    console.error('[poller] unexpected error:', err);
    status = 'error';
  }

  // Consecutive failure escalation
  if (status !== 'ok') {
    if (status === consecutiveFailStatus) {
      consecutiveFailCount++;
    } else {
      consecutiveFailCount = 1;
      consecutiveFailStatus = status;
    }
    // Escalate log after 10 consecutive same-status failures (10s at 1s poll)
    if (consecutiveFailCount === 10 || consecutiveFailCount % 60 === 0) {
      console.error(`[poller] status=${status} for ${consecutiveFailCount} consecutive polls (~${Math.round(consecutiveFailCount * config.pollMs / 1000)}s)`);
    }
    statFail++;
  } else {
    if (consecutiveFailCount > 0) {
      console.log(`[poller] recovered from ${consecutiveFailCount}× ${consecutiveFailStatus} — back to ok`);
    }
    consecutiveFailCount = 0;
    consecutiveFailStatus = null;
    statOk++;
  }

  // Accumulate timing stats
  if (tFetch)     { statTotalFetchMs     += tFetch; }
  if (tPreprocess){ statTotalPreprocessMs += tPreprocess; }
  if (tOcr)       { statTotalOcrMs += tOcr; statOcrCount++; }

  // Health and broadcast are synchronous — never blocked by DB latency
  recordPoll(ts, status === 'ok');
  const msg: WsMessage = { ts, raw_db, status };
  broadcast(msg);

  const timingStr = tFetch || tPreprocess || tOcr
    ? ` (fetch=${tFetch}ms pre=${tPreprocess}ms ocr=${tOcr}ms)`
    : '';

  if (status !== 'ok') {
    // Only log first occurrence + escalation points (handled above) to avoid log spam
    if (consecutiveFailCount === 1) {
      console.log(`[poller] ${new Date(ts).toISOString()} status=${status}${timingStr}`);
    }
  } else {
    console.log(`[poller] ${new Date(ts).toISOString()} db=${raw_db} dB${timingStr}`);
  }

  // Queued for the flush loop — a slow or failing database never blocks polling
  writeQueue.enqueue({ ts, raw_db, status });

  // Violation alert: fire after 60s of sustained readings above the active
  // limit (variance events, Monday and after-hours 90 dBA, track-local time)
  if (status === 'ok' && raw_db !== null) {
    const limitDb = getActiveLimit(ts);
    if (raw_db >= limitDb) {
      if (violationStartTs === null) violationStartTs = ts;
      const sustainedMs = ts - violationStartTs;
      const sinceLastAlert = lastAlertTs === null ? Infinity : ts - lastAlertTs;
      if (sustainedMs >= VIOLATION_SUSTAINED_MS && sinceLastAlert >= REALERT_MS) {
        lastAlertTs = ts;
        sendViolationAlert(raw_db, limitDb).catch(err => {
          console.error('[notify] alert error:', err instanceof Error ? err.message : err);
        });
      }
    } else {
      violationStartTs = null; // reading back below limit — reset sustained timer
    }
  } else if (status !== 'ok') {
    violationStartTs = null;
  }
}

async function run(): Promise<void> {
  const imageHost = config.imageUrl ? (() => { try { return new URL(config.imageUrl).hostname; } catch { return '(invalid url)'; } })() : '(not set)';
  console.log(`[poller] starting — mock=${config.mockMode} poll=${config.pollMs}ms health=${config.healthPort} ws=${WS_PATH} imageHost=${imageHost}`);
  const mem = process.memoryUsage();
  console.log(`[poller] initial memory — rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB`);

  // One HTTP server carries /ping, /health and the live-readings WebSocket.
  const server = startHealthServer(config.healthPort);
  attachWsServer(server);

  // Watchdog: if poll loop stalls for >2 minutes, exit so Fly restarts us automatically.
  // The OCR 30s timeout handles the most common hang (Tesseract worker degradation);
  // this is a backstop for any other unforeseen stall scenario.
  const WATCHDOG_STALL_MS = 120_000;
  setInterval(() => {
    const ageMs = getPollAgeMs();
    if (ageMs !== null && ageMs > WATCHDOG_STALL_MS) {
      console.error(`[poller] watchdog: loop stalled ${Math.round(ageMs / 1000)}s — exiting for auto-restart`);
      process.exit(1);
    }
  }, 15_000);

  // Log stats + memory every 5 minutes
  statIntervalHandle = setInterval(() => {
    const total = statOk + statFail;
    const mem = process.memoryUsage();
    const avgFetch     = total      > 0 ? Math.round(statTotalFetchMs / total)         : 0;
    const avgPreprocess= total      > 0 ? Math.round(statTotalPreprocessMs / total)    : 0;
    const avgOcr       = statOcrCount > 0 ? Math.round(statTotalOcrMs / statOcrCount)  : 0;
    console.log(
      `[poller] 5-min stats — ok=${statOk} fail=${statFail} total=${total}` +
      ` (${total > 0 ? Math.round(statOk / total * 100) : 0}% ok)` +
      ` | avg fetch=${avgFetch}ms pre=${avgPreprocess}ms ocr=${avgOcr}ms` +
      ` | rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}MB` +
      ` | queued=${writeQueue.size} dropped=${writeQueue.dropped}` +
      ` | superseded=${frames.skipped - statSupersededAt} skippedTicks=${(fetchClock?.skippedTicks ?? 0) - statSkippedTicksAt}`
    );
    statSupersededAt = frames.skipped;
    statSkippedTicksAt = fetchClock?.skippedTicks ?? 0;
    statOk = statFail = 0;
    statTotalFetchMs = statTotalPreprocessMs = statTotalOcrMs = statOcrCount = 0;
  }, 5 * 60 * 1000);

  // Fetch clock: a fetch starts on every whole second (POLL_MS), whether or
  // not the last one has finished, up to 3 at once. Results go into `frames`,
  // which keeps only the newest.
  fetchClock = startFetchClock({
    intervalMs: config.pollMs,
    maxInFlight: 3,
    fetchFrame: config.mockMode ? async () => Buffer.alloc(0) : fetchImageBuffer,
    onResult: result => frames.offer(result),
  });

  // Processing loop: one frame at a time, always the newest. Frames that
  // arrive while OCR is busy replace each other, so at most one image buffer
  // waits here and memory can't stack up when OCR is slow.
  async function processLoop(): Promise<void> {
    for (;;) {
      const frame = await frames.next();
      await processFrame(frame).catch(console.error);
    }
  }

  processLoop();

  // Write loop: one batch per tick, every second while healthy, backing off
  // to 30 s while the database is failing. Each batch goes out in order.
  async function flushOnce(): Promise<void> {
    const ok = await writeQueue.flush().catch(() => false);
    if (ok) {
      if (flushFailures > 0) console.log(`[poller] supabase writes recovered after ${flushFailures} failed attempts — ${writeQueue.size} readings still queued`);
      flushFailures = 0;
    } else if (writeQueue.size > 0) {
      flushFailures++;
      if (flushFailures === 1 || flushFailures % 10 === 0) {
        console.error(`[poller] supabase write failed (${flushFailures}× in a row) — ${writeQueue.size} readings queued`);
      }
    }
    if (writeQueue.dropped > loggedDropped) {
      console.error(`[poller] write queue full — dropped ${writeQueue.dropped - loggedDropped} oldest readings (${writeQueue.dropped} total)`);
      loggedDropped = writeQueue.dropped;
    }
    setTimeout(flushOnce, flushDelayMs(flushFailures));
  }

  flushOnce();
}

// On shutdown (deploys, restarts) keep writing what is still queued for up to
// 4 s, inside the 5 s Fly allows between SIGTERM and SIGKILL.
async function shutdown(): Promise<void> {
  clearInterval(statIntervalHandle);
  fetchClock?.stop();
  await terminateOcr();
  const deadline = Date.now() + 4_000;
  while (writeQueue.size > 0 && Date.now() < deadline) {
    // flush() is false while the write loop's batch is in flight or the
    // database is failing; wait a moment and try again until the deadline.
    if (!(await writeQueue.flush())) await new Promise(r => setTimeout(r, 200));
  }
  if (writeQueue.size > 0) console.error(`[poller] exiting with ${writeQueue.size} unwritten readings`);
  process.exit(0);
}

run().catch(err => { console.error('[poller] startup error:', err); process.exit(1); });

process.on('SIGINT',  () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

process.on('unhandledRejection', (reason) => {
  console.error('[poller] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[poller] uncaughtException:', err);
  process.exit(1);
});
