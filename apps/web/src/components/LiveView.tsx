import React, { useState, useCallback, useRef } from 'react';
import type { Reading, WsMessage } from '@pir/types';
import { useRealtimeReadings } from '../hooks/useRealtimeReadings.js';
import { useApi } from '../hooks/useApi.js';
import { DbDisplay } from './DbDisplay.js';
import { ReadingsChart } from './ReadingsChart.js';
import { SummaryBar } from './SummaryBar.js';

const OFFLINE_THRESHOLD_MS = 10_000;

export function LiveView() {
  const [latest, setLatest] = useState<WsMessage | null>(null);
  const [liveReadings, setLiveReadings] = useState<Reading[]>([]);
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedOffline, setFeedOffline] = useState(false);

  const { data: hourReadings } = useApi<Reading[]>('/api/readings/hour');

  const connected = useRealtimeReadings(useCallback((msg: WsMessage) => {
    setLatest(msg);
    setLiveReadings(prev => {
      const cutoff = Date.now() - 10 * 60 * 1000;
      return [...prev, msg as unknown as Reading].filter(r => r.ts >= cutoff);
    });
    if (msg.status === 'ok') {
      if (offlineTimer.current) { clearTimeout(offlineTimer.current); offlineTimer.current = null; }
      setFeedOffline(false);
    } else if (!offlineTimer.current) {
      offlineTimer.current = setTimeout(() => {
        setFeedOffline(true);
        offlineTimer.current = null;
      }, OFFLINE_THRESHOLD_MS);
    }
  }, []));

  const cutoff = Date.now() - 10 * 60 * 1000;
  const allReadings: Reading[] = [
    ...(hourReadings ?? []),
    ...liveReadings,
  ].filter((r, i, arr) => r.ts >= cutoff && arr.findIndex(x => x.ts === r.ts) === i)
   .sort((a, b) => a.ts - b.ts);

  return (
    <div>
      {!connected && (
        <div style={bannerStyle('#7c3aed')}>Connecting to live feed…</div>
      )}
      {feedOffline && (
        <div style={bannerStyle('#b91c1c')}>Feed offline — meter not reporting</div>
      )}
      <DbDisplay value={latest?.raw_db ?? null} status={latest?.status ?? null} />
      <SummaryBar readings={allReadings} />
      <ReadingsChart readings={allReadings} tickIntervalMs={60_000} />
    </div>
  );
}

function bannerStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', padding: '8px 16px',
    borderRadius: 6, marginBottom: 12, fontSize: 13, textAlign: 'center',
  };
}
