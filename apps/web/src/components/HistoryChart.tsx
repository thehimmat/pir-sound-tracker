import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DailySummary } from '@pir/types';

interface Props {
  summaries: DailySummary[];
  onDayClick: (date: string) => void;
}

export function HistoryChart({ summaries, onDayClick }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={[...summaries].reverse()}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        onClick={(e) => {
          if (e?.activeLabel) onDayClick(e.activeLabel as string);
        }}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
        <YAxis domain={[0, 130]} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#22c55e' }}
          formatter={(v: number) => [`${v.toFixed(1)} dB`, 'High']}
        />
        <ReferenceLine y={103} stroke="#ef4444" strokeDasharray="6 3" />
        <Bar dataKey="high_db" radius={[3, 3, 0, 0]}>
          {summaries.map(s => (
            <Cell
              key={s.date}
              fill={s.high_db !== null && s.high_db >= 103 ? '#ef4444' : '#22c55e'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
