import React, { useState, useEffect } from 'react';
import type { DayBlock, Reading } from '@pir/types';
import { BlocksChart } from './BlocksChart.js';
import { ReadingsChart } from './ReadingsChart.js';
import { SummaryBar } from './SummaryBar.js';
import { getLimitForDate, getEventForDate } from '../utils/varianceEvents.js';

const TEN_MIN       = 10 * 60 * 1000;
const REFRESH_MS    = 2 * 60 * 1000; // re-fetch blocks every 2 min when viewing today
const API_URL = import.meta.env.VITE_API_URL ?? '';

interface Props {
  date: string; // YYYY-MM-DD
}

function snapToBucket(ts: number): number {
  return Math.floor(ts / TEN_MIN) * TEN_MIN;
}

function localDayBounds(dateStr: string): [number, number] {
  const start = new Date(dateStr + 'T00:00:00').getTime(); // local midnight in browser
  return [start, start + 86_400_000];
}

/** Fill every 10-min slot from day start to now (or day end) with null where data is absent. */
function fillGaps(blocks: DayBlock[], dateStr: string): DayBlock[] {
  const [dayStart, dayEnd] = localDayBounds(dateStr);
  const ceiling = Math.min(dayEnd, Date.now());
  const byStart = new Map(blocks.map(b => [b.bucket_start, b]));
  const filled: DayBlock[] = [];
  for (let t = dayStart; t < ceiling; t += TEN_MIN) {
    filled.push(byStart.get(t) ?? { bucket_start: t, high_db: null, reading_count: 0 });
  }
  return filled;
}

function parseTimeInput(dateStr: string, timeStr: string): number | null {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(h, min, 0, 0);
  return snapToBucket(d.getTime());
}

export function DayView({ date }: Props) {
  const [blocks, setBlocks]           = useState<DayBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [windowReadings, setWindowReadings] = useState<Reading[]>([]);
  const [windowLoading, setWindowLoading]   = useState(false);
  const [timeInput, setTimeInput]     = useState('');
  const [timeError, setTimeError]     = useState('');

  const isToday = date === new Date().toLocaleDateString('sv');
  const limitDb = getLimitForDate(date);
  const varianceEvent = getEventForDate(date);

  function loadBlocks() {
    const [from, to] = localDayBounds(date);
    fetch(`${API_URL}/api/readings/blocks/${date}?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: DayBlock[]) => { setBlocks(fillGaps(d, date)); setBlocksLoading(false); })
      .catch(() => setBlocksLoading(false));
  }

  useEffect(() => {
    setBlocksLoading(true);
    setSelectedBucket(null);
    setWindowReadings([]);
    loadBlocks();

    if (!isToday) return;
    const id = setInterval(loadBlocks, REFRESH_MS);
    return () => clearInterval(id);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  function fetchWindow(bucketStart: number) {
    setSelectedBucket(bucketStart);
    setWindowLoading(true);
    const from = bucketStart;
    const to   = bucketStart + TEN_MIN;
    fetch(`${API_URL}/api/readings/window?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: Reading[]) => { setWindowReadings(d); setWindowLoading(false); })
      .catch(() => setWindowLoading(false));
  }

  function stepWindow(dir: -1 | 1) {
    if (selectedBucket === null) return;
    fetchWindow(selectedBucket + dir * TEN_MIN);
  }

  function handleTimeJump(e: React.FormEvent) {
    e.preventDefault();
    setTimeError('');
    const bucket = parseTimeInput(date, timeInput);
    if (bucket === null) { setTimeError('Enter time as HH:MM'); return; }
    fetchWindow(bucket);
  }

  const fmtBucket = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (blocksLoading) {
    return <div style={{ color: '#64748b', padding: '40px 0', textAlign: 'center' }}>Loading…</div>;
  }

  return (
    <div>
      {varianceEvent && (
        <div style={{
          background: '#7c2d12',
          border: '1px solid #ef4444',
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 14,
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
            <span style={{ marginLeft: 8, color: '#fca5a5' }}>
              · Permitted limit: <strong style={{ color: '#fef2f2' }}>{varianceEvent.limitDb} dBA</strong>
            </span>
          </span>
        </div>
      )}
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
        Peak dB per 10-min block — click a bar to inspect
      </div>
      <BlocksChart blocks={blocks} selectedBucket={selectedBucket} onBlockClick={fetchWindow} limitDb={limitDb} />

      {selectedBucket !== null && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <button onClick={() => stepWindow(-1)} style={navBtn}>‹ 10 min</button>
            <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
              {fmtBucket(selectedBucket)} – {fmtBucket(selectedBucket + TEN_MIN)}
            </span>
            <button onClick={() => stepWindow(1)} style={navBtn}>10 min ›</button>

            <form onSubmit={handleTimeJump} style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                placeholder="HH:MM"
                style={inputStyle}
              />
              <button type="submit" style={navBtn}>Jump</button>
              {timeError && <span style={{ color: '#ef4444', fontSize: 11 }}>{timeError}</span>}
            </form>
          </div>

          {windowLoading ? (
            <div style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>Loading…</div>
          ) : (
            <>
              <SummaryBar readings={windowReadings} limitDb={limitDb} />
              <ReadingsChart readings={windowReadings} tickIntervalMs={60_000} limitDb={limitDb} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: '5px 12px',
  background: '#1e293b',
  color: '#94a3b8',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  padding: '5px 10px',
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  fontSize: 13,
  width: 80,
};
