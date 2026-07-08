import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DailySummary } from '@pir/types';
import { useApi } from '../hooks/useApi.js';
import { DayView } from './DayView.js';
import { getLimitForDate } from '../utils/varianceEvents.js';

interface MonthGroup {
  key: string;    // 'YYYY-MM'
  label: string;  // 'June 2026'
  days: DailySummary[];
  maxHigh: number | null;
  avgHigh: number | null;
  loud: number;
  over: number;
  reads: number;
  failed: number;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** Group day summaries (sorted newest-first) into months, newest month first. */
function groupByMonth(rows: DailySummary[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const s of rows) {
    const key = s.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: monthLabel(key), days: [], maxHigh: null, avgHigh: null, loud: 0, over: 0, reads: 0, failed: 0 };
      groups.push(g);
    }
    g.days.push(s);
    if (s.high_db !== null && (g.maxHigh === null || s.high_db > g.maxHigh)) g.maxHigh = s.high_db;
    g.loud   += s.loud_count;
    g.over   += s.violation_count;
    g.reads  += s.reading_count;
    g.failed += s.error_count;
  }
  for (const g of groups) {
    const highs = g.days.filter(d => d.high_db !== null).map(d => d.high_db as number);
    g.avgHigh = highs.length > 0 ? highs.reduce((a, b) => a + b, 0) / highs.length : null;
  }
  return groups;
}

export function HistoryView() {
  const { data: summaries, loading } = useApi<DailySummary[]>('/api/summary/history');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Newest month starts expanded, older months collapsed; clicks override.
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});

  if (loading) return <div style={{ color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>Loading…</div>;

  const rows = summaries ?? [];

  if (rows.length === 0) {
    return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>No historical data yet.</div>;
  }

  const groups = groupByMonth(rows);
  const isExpanded = (key: string, idx: number) => expandOverrides[key] ?? (idx === 0);
  const toggleMonth = (key: string, idx: number) =>
    setExpandOverrides(prev => ({ ...prev, [key]: !isExpanded(key, idx) }));
  const toggleDay = (date: string) => setSelectedDate(date === selectedDate ? null : date);

  return (
    <div>
      {selectedDate && (
        <div style={{ marginBottom: 28, borderBottom: '1px solid #1e293b', paddingBottom: 20 }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>{selectedDate}</div>
          <DayView date={selectedDate} />
        </div>
      )}

      {/* Wrapper scrolls horizontally so the table never forces the page wider on phones */}
      <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th title="Daily high; monthly rows show the month's max and average of daily highs">High dB</Th>
            <Th title="Readings within the warning buffer of the limit (3 dB, or 5 dB during quiet hours)">Loud</Th>
            <Th title="Readings at or above the active limit">Over limit</Th>
            <Th>Good reads</Th>
            <Th title="Poll attempts where the source display was unreachable or unreadable">Failed</Th>
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const expanded = isExpanded(g.key, gi);
          return (
            <tbody key={g.key}>
              <tr style={{ background: '#151a24' }}>
                <Td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    onClick={() => toggleMonth(g.key, gi)}
                    aria-expanded={expanded}
                    style={monthBtnStyle}
                  >
                    {expanded
                      ? <ChevronDown size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                      : <ChevronRight size={14} aria-hidden="true" style={{ flexShrink: 0 }} />}
                    {g.label}
                    <span style={{ color: '#7c8ba1', fontWeight: 400 }}>· {g.days.length} days</span>
                  </button>
                </Td>
                <Td style={{ whiteSpace: 'nowrap' }}>
                  <strong style={{ color: g.maxHigh !== null && g.over > 0 ? '#ef4444' : '#e2e8f0' }}>
                    {g.maxHigh !== null ? g.maxHigh.toFixed(1) : '—'}
                  </strong>
                  {g.avgHigh !== null && (
                    <span style={{ color: '#7c8ba1', fontSize: 11 }}> max · {g.avgHigh.toFixed(1)} avg</span>
                  )}
                </Td>
                <Td style={{ fontWeight: 600, color: g.loud > 0 ? '#f59e0b' : '#e2e8f0' }}>
                  {g.loud.toLocaleString()}
                </Td>
                <Td style={{ fontWeight: 600, color: g.over > 0 ? '#ef4444' : '#e2e8f0' }}>
                  {g.over.toLocaleString()}
                </Td>
                <Td style={{ fontWeight: 600 }}>{g.reads.toLocaleString()}</Td>
                <Td style={{ fontWeight: 600, color: g.failed > 0 ? '#f59e0b' : '#7c8ba1' }}>
                  {g.failed > 0 ? g.failed.toLocaleString() : '—'}
                </Td>
              </tr>

              {expanded && g.days.map(s => (
                <tr
                  key={s.date}
                  onClick={() => toggleDay(s.date)}
                  style={{ cursor: 'pointer', background: selectedDate === s.date ? '#1e293b' : 'transparent' }}
                >
                  <Td>
                    {/* Real button so the day drill-down is keyboard-reachable */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDay(s.date); }}
                      aria-expanded={selectedDate === s.date}
                      aria-label={`${s.date}: show day detail`}
                      style={dateBtnStyle}
                    >
                      {s.date}
                    </button>
                  </Td>
                  <Td style={{ color: s.high_db !== null && s.high_db >= getLimitForDate(s.date) ? '#ef4444' : '#e2e8f0' }}>
                    {s.high_db !== null ? `${s.high_db.toFixed(1)} dB` : '—'}
                  </Td>
                  <Td style={{ color: s.loud_count > 0 ? '#f59e0b' : '#e2e8f0' }}>
                    {s.loud_count}
                  </Td>
                  <Td style={{ color: s.violation_count > 0 ? '#ef4444' : '#e2e8f0' }}>
                    {s.violation_count}
                  </Td>
                  <Td>{s.reading_count.toLocaleString()}</Td>
                  <Td
                    style={{ color: s.error_count > 0 ? '#f59e0b' : '#7c8ba1' }}
                    title={s.error_count > 0 ? `${s.error_count} seconds where the source display was unreachable or unreadable` : undefined}
                  >
                    {s.error_count > 0 ? s.error_count.toLocaleString() : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      </div>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const dateBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#e2e8f0',
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'underline',
  textDecorationColor: '#334155',
};

const monthBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

function Th({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th scope="col" title={title} style={{ textAlign: 'left', padding: '8px 12px', color: '#94a3b8', borderBottom: '1px solid #1e293b', cursor: title ? 'help' : undefined, whiteSpace: 'nowrap' }}>
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
