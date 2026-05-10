import 'dotenv/config';
import { config } from './config.js';
import { avgBrightness, preprocessImage } from './preprocess.js';
import { ocrImage, terminateOcr } from './ocr.js';
import { parseDbReading } from './parser.js';
import { simpleHash } from './imageHash.js';
import { nextMockReading } from './mock.js';
import { broadcast, startWsServer } from './wsServer.js';
import { getDb, insertReading } from '@pir/db';
import type { ReadingStatus, WsMessage } from '@pir/types';

// Ensure DB is open before polling starts
getDb(config.dbPath);

startWsServer(config.wsPort);

let prevHash: string | null = null;
let staleFirstTs: number | null = null;

async function fetchImageBuffer(): Promise<Buffer> {
  const url = `${config.imageUrl}&t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
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
      } catch {
        status = 'error';
        write(ts, null, status);
        return;
      }

      // 2. Blank check
      const brightness = await avgBrightness(imgBuf);
      if (brightness > 240) {
        status = 'blank';
        write(ts, null, status);
        return;
      }

      // 3. Stale check
      const hash = simpleHash(imgBuf);
      if (hash === prevHash) {
        if (staleFirstTs === null) staleFirstTs = ts;
        if (ts - staleFirstTs > config.staleAfterMs) {
          status = 'stale';
          write(ts, null, status);
          return;
        }
      } else {
        prevHash = hash;
        staleFirstTs = null;
      }

      // 4 & 5. Preprocess + OCR
      const processed = await preprocessImage(imgBuf);
      const ocrText   = await ocrImage(processed);

      // 6. Parse
      const parsed = parseDbReading(ocrText);
      if (parsed === null) {
        status = 'ocr_fail';
        console.warn(`[poller] OCR_FAIL — raw text: "${ocrText.trim()}"`);
      } else {
        raw_db = parsed;
        status = 'ok';
      }
    }
  } catch (err) {
    console.error('[poller] unexpected error:', err);
    status = 'error';
  }

  write(ts, raw_db, status);
}

function write(ts: number, raw_db: number | null, status: ReadingStatus): void {
  insertReading(ts, raw_db, status);
  const msg: WsMessage = { ts, raw_db, status };
  broadcast(msg);
  if (status !== 'ok') {
    console.log(`[poller] ${new Date(ts).toISOString()} status=${status}`);
  } else {
    console.log(`[poller] ${new Date(ts).toISOString()} db=${raw_db} dB`);
  }
}

// Poll loop — fire immediately, then every POLL_MS
async function run(): Promise<void> {
  console.log(`[poller] starting — mock=${config.mockMode} poll=${config.pollMs}ms`);
  await poll();
  setInterval(() => { poll().catch(console.error); }, config.pollMs);
}

run().catch(err => { console.error(err); process.exit(1); });

process.on('SIGINT',  async () => { await terminateOcr(); process.exit(0); });
process.on('SIGTERM', async () => { await terminateOcr(); process.exit(0); });
