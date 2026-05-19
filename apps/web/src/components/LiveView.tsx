import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Reading, WsMessage } from '@pir/types';
import { useRealtimeReadings } from '../hooks/useRealtimeReadings.js';
import { useApi } from '../hooks/useApi.js';
import { DbDisplay } from './DbDisplay.js';
import { ReadingsChart } from './ReadingsChart.js';
import { SummaryBar } from './SummaryBar.js';
import { getLimitForDate, getEventForDate } from '../utils/varianceEvents.js';

const OFFLINE_THRESHOLD_MS = 10_000;
const HISTORY_TIMEOUT_MS   = 15_000;

export function LiveView() {
  const [latest, setLatest] = useState<WsMessage | null>(null);
  const [liveReadings, setLiveReadings] = useState<Reading[]>([]);
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedOffline, setFeedOffline] = useState(false);

  const { data: hourReadings, loading: historyLoading, error: historyError, refetch: refetchHistory } =
    useApi<Reading[]>('/api/readings/hour');

  // Track whether loading has stalled beyond our timeout
  const [historyTimedOut, setHistoryTimedOut] = useState(false);
  useEffect(() => {
    if (!historyLoading) { setHistoryTimedOut(false); return; }
    const id = setTimeout(() => setHistoryTimedOut(true), HISTORY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [historyLoading]);

  useRealtimeReadings(useCallback((msg: WsMessage) => {
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

  const windowEnd   = Date.now();
  const windowStart = windowEnd - 10 * 60 * 1000;

  const cutoff = windowStart;
  const allReadings: Reading[] = [
    ...(hourReadings ?? []),
    ...liveReadings,
  ].filter((r, i, arr) => r.ts >= cutoff && arr.findIndex(x => x.ts === r.ts) === i)
   .sort((a, b) => a.ts - b.ts);

  return (
    <div>
      {feedOffline && latest?.status !== 'ok' && (
        <div style={bannerStyle('#b91c1c')}>
          {latest?.status === 'error'
            ? "PIR's website is unreachable"
            : latest?.status === 'blank'
              ? "PIR's noise display appears to be off"
              : latest?.status === 'stale'
                ? "PIR's noise display is frozen — image not updating"
                : 'Feed offline — meter not reporting'}
          {(latest?.status === 'error' || latest?.status === 'blank' || latest?.status === 'stale') && (
            <> · <a
              href="https://portlandraceway.com/?/about/noise_information"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#fca5a5', textDecoration: 'underline' }}
            >check PIR's site</a></>
          )}
        </div>
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
      {hourReadings === null ? (
        <ChartPlaceholder
          timedOut={historyTimedOut}
          error={historyError}
          onRetry={refetchHistory}
        />
      ) : (
        <ReadingsChart
          readings={allReadings}
          tickIntervalMs={60_000}
          limitDb={limitDb}
          domainStart={windowStart}
          domainEnd={windowEnd}
        />
      )}
    </div>
  );
}

function bannerStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', padding: '8px 16px',
    borderRadius: 6, marginBottom: 12, fontSize: 13, textAlign: 'center',
  };
}

interface PlaceholderProps {
  timedOut?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function ChartPlaceholder({ timedOut, error, onRetry }: PlaceholderProps) {
  const hasProblem = timedOut || error;

  return (
    <div style={{
      height: 260,
      borderRadius: 8,
      background: '#0f1117',
      border: `1px solid ${hasProblem ? '#334155' : '#1e293b'}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {!hasProblem && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, #22c55e18 50%, transparent 100%)',
          animation: 'chart-sweep 2.4s ease-in-out infinite',
          transformOrigin: 'left center',
        }} />
      )}
      {hasProblem ? (
        <>
          <div style={{ fontSize: 13, color: '#64748b', zIndex: 1 }}>
            {error
              ? `Failed to load history: ${error}`
              : 'Taking longer than expected…'}
          </div>
          <button
            onClick={onRetry}
            style={{
              padding: '6px 16px',
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              zIndex: 1,
            }}
          >
            Retry
          </button>
        </>
      ) : (
        <div style={{ fontSize: 13, color: '#475569', zIndex: 1 }}>
          Loading…
        </div>
      )}
    </div>
  );
}
