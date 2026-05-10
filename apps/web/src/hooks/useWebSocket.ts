import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsMessage } from '@pir/types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001';
const RECONNECT_DELAY_MS = 2000;

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsMessage;
        onMessageRef.current(msg);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return connected;
}
