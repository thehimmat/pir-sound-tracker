import { createServer } from 'node:http';

// Updated by the main poll loop after every cycle
let lastPollTs: number | null = null;
let lastOkTs:   number | null = null;

/** Call once per poll cycle so the health endpoint reflects live state. */
export function recordPoll(ts: number, isOk: boolean): void {
  lastPollTs = ts;
  if (isOk) lastOkTs = ts;
}

/**
 * Start a minimal HTTP server on `port`.
 *
 * GET /health
 *   200  { status: "ok",    lastPollAgoMs, lastOkAgoMs }   — poll loop alive
 *   503  { status: "stale", lastPollAgoMs, lastOkAgoMs }   — loop stalled (>10s since last poll)
 *   503  { status: "starting" }                            — not yet polled once
 */
export function startHealthServer(port: number): void {
  const server = createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }

    const now           = Date.now();
    const lastPollAgoMs = lastPollTs != null ? now - lastPollTs : null;
    const lastOkAgoMs   = lastOkTs   != null ? now - lastOkTs   : null;

    // Consider healthy if we've polled within the last 10 s
    const alive = lastPollAgoMs != null && lastPollAgoMs < 10_000;
    const code  = alive ? 200 : 503;

    const body = JSON.stringify({
      status:       alive                ? 'ok' : lastPollTs == null ? 'starting' : 'stale',
      lastPollAgoMs,
      lastOkAgoMs,
    });

    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(body);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] listening on http://0.0.0.0:${port}/health`);
  });
}
