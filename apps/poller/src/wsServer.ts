import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { WsMessage } from '@pir/types';

// Live readings are pushed straight from the poller over a WebSocket that
// shares the health HTTP server (port 8080). Fly's http_service already
// exposes that port, so browsers connect to wss://<app>.fly.dev/ws and no
// Supabase Realtime (billed per message per client) is involved.

export const WS_PATH = '/ws';
const HEARTBEAT_MS = 30_000;

interface LiveSocket extends WebSocket {
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let lastMessage: string | null = null;

/** Attach the WebSocket endpoint at WS_PATH to an existing HTTP server. */
export function attachWsServer(server: Server): void {
  closeWsServer();
  wss = new WebSocketServer({ server, path: WS_PATH });

  wss.on('connection', (socket: LiveSocket) => {
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('error', () => socket.terminate());
    // New viewers get the current reading immediately instead of waiting a poll.
    if (lastMessage !== null) socket.send(lastMessage);
  });

  // Drop clients that stopped answering pings (closed laptops, dead NATs) so
  // they don't accumulate on the poller.
  heartbeat = setInterval(() => {
    wss?.clients.forEach(client => {
      const socket = client as LiveSocket;
      if (socket.isAlive === false) { socket.terminate(); return; }
      socket.isAlive = false;
      socket.ping();
    });
  }, HEARTBEAT_MS);
  heartbeat.unref();

  console.log(`[ws] attached at ${WS_PATH}`);
}

export function broadcast(msg: WsMessage): void {
  const payload = JSON.stringify(msg);
  lastMessage = payload;
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function getWsClientCount(): number {
  return wss?.clients.size ?? 0;
}

export function closeWsServer(): void {
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (!wss) return;
  wss.clients.forEach(client => client.terminate());
  wss.close();
  wss = null;
  lastMessage = null;
}
