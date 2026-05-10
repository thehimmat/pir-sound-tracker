import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { Reading } from '@pir/types';

interface Props {
  readings: Reading[];
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ReadingsChart({ readings }: Props) {
  const data = readings
    .filter(r => r.status === 'ok' && r.raw_db !== null)
    .map(r => ({ ts: r.ts, db: r.raw_db as number, time: fmt(r.ts) }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="time"
          tick={{ fill: '#64748b', fontSize: 11 }}
          interval="preserveStartEnd"
          tickLine={false}
        />
        <YAxis
          domain={[30, 130]}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#22c55e' }}
          formatter={(v: number) => [`${v.toFixed(1)} dB`, 'Level']}
        />
        <ReferenceLine y={105} stroke="#ef4444" strokeDasharray="6 3" label={{ value: '105 dB', fill: '#ef4444', fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="db"
          stroke="#22c55e"
          dot={false}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
