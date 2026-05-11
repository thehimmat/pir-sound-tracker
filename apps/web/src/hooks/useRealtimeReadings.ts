import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { WsMessage } from '@pir/types';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function useRealtimeReadings(onReading: (msg: WsMessage) => void) {
  const [connected, setConnected] = useState(false);
  const onReadingRef = useRef(onReading);
  onReadingRef.current = onReading;

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const channel = supabase
      .channel('readings-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'readings' },
        (payload) => {
          const row = payload.new as { ts: number; raw_db: number | null; status: string };
          onReadingRef.current({
            ts:     row.ts,
            raw_db: row.raw_db,
            status: row.status as WsMessage['status'],
          });
        },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  return connected;
}
