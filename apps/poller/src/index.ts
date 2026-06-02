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
import { broadcast, startWsServer } from './wsServer.js';
import { startHealthServer, recordPoll, getPollAgeMs } from './healthServer.js';
import { insertReading } from '@pir/db';
import type { ReadingStatus, WsMessage } from '@pir/types';

startWsServer(config.wsPort);

let prevHash: string | null = null;
let staleFirstTs: number | null = null;

// Consecutive non-ok tracking for escalated logging
let consecutiveFailCount = 0;
let consecutiveFailStatus: ReadingStatus | null = null;

// Running totals for periodic stats
let statOk = 0;
let statFail = 0;
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

async function poll(): Promise<void> {
  const ts = Date.now();
  let raw_db: number | null = null;
  let status: ReadingStatus = 'ok';

  try {
    if (config.mockMode) {
      raw_db = nextMockReading();
      status = 'ok';
    } else {
      // 1. Fetch
      let imgBuf: Buffer;
      try {
        imgBuf = await fetchImageBuffer();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[poller] fetch error: ${msg}`);
        status = 'error';
      }

      if (status !== 'error') {
        // 2. Blank check
        const brightness = await avgBrightness(imgBuf!);
        if (brightness > 240) {
          status = 'blank';
        } else {
          // 3. Stale check
          const hash = simpleHash(imgBuf!);
          if (hash === prevHash) {
            if (staleFirstTs === null) staleFirstTs = ts;
            if (ts - staleFirstTs > config.staleAfterMs) status = 'stale';
          } else {
            prevHash = hash;
            staleFirstTs = null;
          }

          if (status === 'ok') {
            // 4 & 5. Preprocess + OCR
            const processed = await preprocessImage(imgBuf!);
            const { text: ocrText, confidence } = await ocrImage(processed);

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

  // Health and broadcast are synchronous — never blocked by DB latency
  recordPoll(ts, status === 'ok');
  const msg: WsMessage = { ts, raw_db, status };
  broadcast(msg);

  if (status !== 'ok') {
    // Only log first occurrence + escalation points (handled above) to avoid log spam
    if (consecutiveFailCount === 1) {
      console.log(`[poller] ${new Date(ts).toISOString()} status=${status}`);
    }
  } else {
    console.log(`[poller] ${new Date(ts).toISOString()} db=${raw_db} dB`);
  }

  // DB write is fire-and-forget — never blocks the poll loop
  insertReading(ts, raw_db, status).catch(err => {
    console.error('[poller] supabase write error:', err instanceof Error ? err.message : err);
  });
}

async function run(): Promise<void> {
  const imageHost = config.imageUrl ? (() => { try { return new URL(config.imageUrl).hostname; } catch { return '(invalid url)'; } })() : '(not set)';
  console.log(`[poller] starting — mock=${config.mockMode} poll=${config.pollMs}ms ws=${config.wsPort} health=${config.healthPort} imageHost=${imageHost}`);
  const mem = process.memoryUsage();
  console.log(`[poller] initial memory — rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB`);

  startHealthServer(config.healthPort);

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
    console.log(`[poller] 5-min stats — ok=${statOk} fail=${statFail} total=${total} (${total > 0 ? Math.round(statOk / total * 100) : 0}% ok) | rss=${Math.round(mem.rss / 1024 / 1024)}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
    statOk = 0;
    statFail = 0;
  }, 5 * 60 * 1000);

  // Sequential poll loop: wait for each poll to complete before scheduling the next.
  // This prevents concurrent poll accumulation when OCR is slow (e.g. Tesseract takes
  // 2-3s under load), which was causing memory spikes from stacked image buffers.
  async function loopOnce(): Promise<void> {
    const start = Date.now();
    await poll().catch(console.error);
    const elapsed = Date.now() - start;
    const delay = Math.max(0, config.pollMs - elapsed);
    setTimeout(loopOnce, delay);
  }

  loopOnce();
}

run().catch(err => { console.error('[poller] startup error:', err); process.exit(1); });

process.on('SIGINT',  async () => { clearInterval(statIntervalHandle); await terminateOcr(); process.exit(0); });
process.on('SIGTERM', async () => { clearInterval(statIntervalHandle); await terminateOcr(); process.exit(0); });

process.on('unhandledRejection', (reason) => {
  console.error('[poller] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[poller] uncaughtException:', err);
  process.exit(1);
});
