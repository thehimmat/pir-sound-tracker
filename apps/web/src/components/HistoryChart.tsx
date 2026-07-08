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
import { getLimitForDate, DEFAULT_LIMIT_DB } from '../utils/varianceEvents.js';

interface Props {
  summaries: DailySummary[];
  onDayClick: (date: string) => void;
}

export function HistoryChart({ summaries, onDayClick }: Props) {
  // Cells render in data order, so build them from the same reversed array
  const data = [...summaries].reverse();
  return (
    // role="img" flattens recharts' SVG internals; the table below the chart
    // is the accessible route to the same data.
    <div role="img" aria-label={`Bar chart of daily high dB for the last ${data.length} days. The same data is in the table below.`}>
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        onClick={(e) => {
          if (e?.activeLabel) onDayClick(e.activeLabel as string);
        }}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#7c8ba1', fontSize: 11 }} tickLine={false} />
        <YAxis domain={[0, 130]} tick={{ fill: '#7c8ba1', fontSize: 11 }} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#22c55e' }}
          formatter={(v: number) => [`${v.toFixed(1)} dB`, 'High']}
        />
        <ReferenceLine y={DEFAULT_LIMIT_DB} stroke="#ef4444" strokeDasharray="6 3" />
        <Bar dataKey="high_db" radius={[3, 3, 0, 0]}>
          {data.map(s => (
            <Cell
              key={s.date}
              fill={s.high_db !== null && s.high_db >= getLimitForDate(s.date) ? '#ef4444' : '#22c55e'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
