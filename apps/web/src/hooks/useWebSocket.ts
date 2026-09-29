import { useEffect, useRef, useState } from 'react';
import type { WsMessage } from '@pir/types';

// Live readings come straight from the poller's WebSocket (attached to its
// health server at /ws), not from Supabase Realtime. Override with
// VITE_WS_URL; otherwise dev talks to a local poller and production builds
// talk to the Fly app.
const WS_URL: string =
  import.meta.env.VITE_WS_URL
  ?? (import.meta.env.PROD
    ? 'wss://pir-sound-tracker-poller.fly.dev/ws'
    : 'ws://localhost:8080/ws');

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/** Delay before reconnect attempt `attempt` (0-based): doubling, capped, with jitter. */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt);
  return Math.round(base * (0.5 + random() * 0.5));
}

interface Options {
  /** Called after the socket re-opens following a drop, so callers can backfill the gap. */
  onReconnect?: () => void;
}

export function useWebSocket(onMessage: (msg: WsMessage) => void, options: Options = {}) {
  const [connected, setConnected] = useState(false);
  const onMessageRef   = useRef(onMessage);
  const onReconnectRef = useRef(options.onReconnect);
  onMessageRef.current   = onMessage;
  onReconnectRef.current = options.onReconnect;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let hadConnection = false;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        if (hadConnection) onReconnectRef.current?.();
        hadConnection = true;
      };

      ws.onmessage = (ev) => {
        try {
          onMessageRef.current(JSON.parse(ev.data as string) as WsMessage);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        timer = setTimeout(connect, reconnectDelayMs(attempt++));
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return connected;
}
