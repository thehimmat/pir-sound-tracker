import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { WebSocket } from 'ws';
import type { WsMessage } from '@pir/types';
import { attachWsServer, broadcast, getWsClientCount, closeWsServer } from '../wsServer.js';
import { createHealthServer } from '../healthServer.js';

function listen(server: Server): Promise<number> {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

// Messages are queued from the moment the socket is created: the server's
// replay can land in the same tick as 'open', before a test attaches a listener.
const inbox = new WeakMap<WebSocket, { queue: WsMessage[]; waiters: Array<(m: WsMessage) => void> }>();

function connect(port: number, path = '/ws'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    const box = { queue: [] as WsMessage[], waiters: [] as Array<(m: WsMessage) => void> };
    inbox.set(ws, box);
    ws.on('message', data => {
      const msg = JSON.parse(data.toString()) as WsMessage;
      const waiter = box.waiters.shift();
      if (waiter) waiter(msg); else box.queue.push(msg);
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws: WebSocket): Promise<WsMessage> {
  const box = inbox.get(ws)!;
  const queued = box.queue.shift();
  if (queued) return Promise.resolve(queued);
  return new Promise(resolve => box.waiters.push(resolve));
}

function closed(ws: WebSocket): Promise<void> {
  return new Promise(resolve => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.once('close', () => resolve());
    ws.close();
  });
}

describe('wsServer on the health HTTP server', () => {
  let server: Server;
  let port: number;

  before(async () => {
    server = createServer((_req, res) => { res.writeHead(404); res.end(); });
    attachWsServer(server);
    port = await listen(server);
  });

  after(async () => {
    closeWsServer();
    await new Promise(resolve => server.close(resolve));
  });

  it('delivers broadcast messages to connected clients', async () => {
    const ws = await connect(port);
    const msg: WsMessage = { ts: 1_700_000_000_000, raw_db: 71.2, status: 'ok' };
    const received = nextMessage(ws);
    broadcast(msg);
    assert.deepEqual(await received, msg);
    await closed(ws);
  });

  it('replays the latest reading to a client as soon as it connects', async () => {
    const msg: WsMessage = { ts: 1_700_000_001_000, raw_db: 68.4, status: 'ok' };
    broadcast(msg);                       // nobody connected yet
    const ws = await connect(port);
    assert.deepEqual(await nextMessage(ws), msg);
    await closed(ws);
  });

  it('rejects upgrades on paths other than /ws', async () => {
    await assert.rejects(connect(port, '/health'));
  });

  it('tracks the number of open clients', async () => {
    assert.equal(getWsClientCount(), 0);
    const a = await connect(port);
    const b = await connect(port);
    assert.equal(getWsClientCount(), 2);
    await closed(a);
    await closed(b);
    // close events on the server side land on the next tick
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(getWsClientCount(), 0);
  });
});

describe('createHealthServer', () => {
  let server: Server;
  let port: number;

  before(async () => {
    server = createHealthServer();
    attachWsServer(server);
    port = await listen(server);
  });

  after(async () => {
    closeWsServer();
    await new Promise(resolve => server.close(resolve));
  });

  it('serves /ping and reports the WebSocket client count on /health', async () => {
    const ping = await get(port, '/ping');
    assert.equal(ping.status, 200);

    const ws = await connect(port);
    const health = await get(port, '/health');
    const body = JSON.parse(health.body) as { wsClients: number };
    assert.equal(body.wsClients, 1);
    await closed(ws);
  });
});

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = '';
      res.on('data', (d: Buffer) => { body += d.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}
