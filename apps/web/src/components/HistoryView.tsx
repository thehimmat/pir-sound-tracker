import React, { useState } from 'react';
import type { DailySummary } from '@pir/types';
import { useApi } from '../hooks/useApi.js';
import { DayView } from './DayView.js';

export function HistoryView() {
  const { data: summaries, loading } = useApi<DailySummary[]>('/api/summary/history');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (loading) return <div style={{ color: '#64748b', padding: '40px 0', textAlign: 'center' }}>Loading…</div>;

  const rows = summaries ?? [];

  if (rows.length === 0) {
    return <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>No historical data yet.</div>;
  }

  return (
    <div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>High dB</Th>
            <Th>Violations</Th>
            <Th>Good reads</Th>
            <Th title="Poll attempts where the source display was unreachable or unreadable">Failed</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => (
            <tr
              key={s.date}
              onClick={() => setSelectedDate(s.date === selectedDate ? null : s.date)}
              style={{ cursor: 'pointer', background: selectedDate === s.date ? '#1e293b' : 'transparent' }}
            >
              <Td>{s.date}</Td>
              <Td style={{ color: s.high_db !== null && s.high_db >= 103 ? '#ef4444' : '#e2e8f0' }}>
                {s.high_db !== null ? `${s.high_db.toFixed(1)} dB` : '—'}
              </Td>
              <Td style={{ color: s.violation_count > 0 ? '#ef4444' : '#e2e8f0' }}>
                {s.violation_count}
              </Td>
              <Td>{s.reading_count.toLocaleString()}</Td>
              <Td
                style={{ color: s.error_count > 0 ? '#f59e0b' : '#475569' }}
                title={s.error_count > 0 ? `${s.error_count} seconds where the source display was unreachable or unreadable` : undefined}
              >
                {s.error_count > 0 ? s.error_count.toLocaleString() : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedDate && (
        <div style={{ marginTop: 28, borderTop: '1px solid #1e293b', paddingTop: 20 }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>{selectedDate}</div>
          <DayView date={selectedDate} />
        </div>
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

function Th({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th title={title} style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', borderBottom: '1px solid #1e293b', cursor: title ? 'help' : undefined }}>
      {children}
    </th>
  );
}

function Td({ children, style, title }: { children: React.ReactNode; style?: React.CSSProperties; title?: string }) {
  return (
    <td title={title} style={{ padding: '8px 12px', borderBottom: '1px solid #0f1117', ...style }}>
      {children}
    </td>
  );
}
