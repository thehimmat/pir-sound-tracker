import React, { useState } from 'react';
import type { DailySummary, Reading } from '@pir/types';
import { useApi } from '../hooks/useApi.js';
import { HistoryChart } from './HistoryChart.js';
import { ReadingsChart } from './ReadingsChart.js';
import { SummaryBar } from './SummaryBar.js';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function HistoryView() {
  const { data: summaries, loading } = useApi<DailySummary[]>('/api/summary/history');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayReadings, setDayReadings] = useState<Reading[] | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  const handleDayClick = (date: string) => {
    setSelectedDate(date);
    setDayLoading(true);
    fetch(`${API_URL}/api/readings/day/${date}`)
      .then(r => r.json())
      .then((d: Reading[]) => { setDayReadings(d); setDayLoading(false); })
      .catch(() => setDayLoading(false));
  };

  if (loading) return <div style={{ color: '#64748b', padding: '40px 0', textAlign: 'center' }}>Loading…</div>;

  const rows = summaries ?? [];

  return (
    <div>
      {rows.length === 0 ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>No historical data yet.</div>
      ) : (
        <>
          <HistoryChart summaries={rows} onDayClick={handleDayClick} />
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>High dB</Th>
                <Th>Violations</Th>
                <Th>Readings</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr
                  key={s.date}
                  onClick={() => handleDayClick(s.date)}
                  style={{ cursor: 'pointer', background: selectedDate === s.date ? '#1e293b' : 'transparent' }}
                >
                  <Td>{s.date}</Td>
                  <Td style={{ color: s.high_db !== null && s.high_db >= 105 ? '#ef4444' : '#e2e8f0' }}>
                    {s.high_db !== null ? `${s.high_db.toFixed(1)} dB` : '—'}
                  </Td>
                  <Td style={{ color: s.violation_count > 0 ? '#ef4444' : '#e2e8f0' }}>
                    {s.violation_count}
                  </Td>
                  <Td>{s.reading_count}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedDate && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>{selectedDate}</div>
              {dayLoading
                ? <div style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>Loading…</div>
                : dayReadings && (
                  <>
                    <SummaryBar readings={dayReadings} />
                    <ReadingsChart readings={dayReadings} />
                  </>
                )
              }
            </div>
          )}
        </>
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 20,
  fontSize: 13,
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', borderBottom: '1px solid #1e293b' }}>
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '8px 12px', borderBottom: '1px solid #0f1117', ...style }}>
      {children}
    </td>
  );
}
