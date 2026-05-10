import { WebSocketServer, WebSocket } from 'ws';
import type { WsMessage } from '@pir/types';

let wss: WebSocketServer | null = null;

export function startWsServer(port: number): void {
  wss = new WebSocketServer({ port });
  console.log(`[ws] listening on ws://localhost:${port}`);
}

export function broadcast(msg: WsMessage): void {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
