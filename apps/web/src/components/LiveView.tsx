import React, { useState, useCallback, useRef } from 'react';
import type { Reading, WsMessage } from '@pir/types';
import { useRealtimeReadings } from '../hooks/useRealtimeReadings.js';
import { useApi } from '../hooks/useApi.js';
import { DbDisplay } from './DbDisplay.js';
import { ReadingsChart } from './ReadingsChart.js';
import { SummaryBar } from './SummaryBar.js';
import { getLimitForDate, getEventForDate } from '../utils/varianceEvents.js';

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

  const today = new Date().toLocaleDateString('sv');
  const limitDb = getLimitForDate(today);
  const varianceEvent = getEventForDate(today);

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
      {varianceEvent && (
        <div style={{
          background: '#7c2d12',
          border: '1px solid #ef4444',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: '#fca5a5',
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span>
            <strong style={{ color: '#fef2f2' }}>Variance event day — {varianceEvent.name}</strong>
            {varianceEvent.note && <span style={{ color: '#f87171' }}> ({varianceEvent.note})</span>}
            <span style={{ marginLeft: 8 }}>
              · Permitted limit today: <strong style={{ color: '#fef2f2' }}>{varianceEvent.limitDb} dBA</strong>
            </span>
          </span>
        </div>
      )}
      <DbDisplay value={latest?.raw_db ?? null} status={latest?.status ?? null} limitDb={limitDb} />
      <SummaryBar readings={allReadings} limitDb={limitDb} />
      <ReadingsChart readings={allReadings} tickIntervalMs={60_000} limitDb={limitDb} />
    </div>
  );
}

function bannerStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', padding: '8px 16px',
    borderRadius: 6, marginBottom: 12, fontSize: 13, textAlign: 'center',
  };
}
