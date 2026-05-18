import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';

// Use monotonic timestamps (performance.now()) so NTP step-corrections on
// container startup don't cause the health check to see a stale poll.
let lastPollMono:  number | null = null;
let lastOkMono:    number | null = null;

// Wall-clock timestamps for the /health response body (informational only)
let lastPollTs: number | null = null;

/** Call once per poll cycle so the health endpoint reflects live state. */
export function recordPoll(ts: number, isOk: boolean): void {
  lastPollMono = performance.now();
  lastPollTs   = ts;
  if (isOk) {
    lastOkMono = performance.now();
  }
}

/**
 * Start a minimal HTTP server on `port`.
 *
 * GET /ping   — always 200 while the process is alive (used by Fly's internal check)
 * GET /health — smart check for UptimeRobot:
 *   200  { status: "ok",    lastPollAgoMs, lastOkAgoMs }   — poll loop alive
 *   503  { status: "stale", lastPollAgoMs, lastOkAgoMs }   — loop stalled (>10s since last poll)
 *   503  { status: "starting" }                            — not yet polled once
 */
export function startHealthServer(port: number): void {
  const server = createServer((req, res) => {
    // Fly's internal liveness check — always 200 if the process is running
    if (req.url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (req.url !== '/health') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }

    const mono          = performance.now();
    const lastPollAgoMs = lastPollMono != null ? Math.round(mono - lastPollMono) : null;
    const lastOkAgoMs   = lastOkMono   != null ? Math.round(mono - lastOkMono)   : null;

    // Consider healthy if we've polled within the last 60 min (monotonic — NTP-safe).
    // This means /health returns 503 only after a genuine hour-long outage on our side,
    // so UptimeRobot (free tier, no alert-delay support) only fires after real downtime.
    const alive = lastPollAgoMs != null && lastPollAgoMs < 3_600_000;
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
