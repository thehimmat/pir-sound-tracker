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
import type { DayBlock } from '@pir/types';

interface Props {
  blocks: DayBlock[];
  selectedBucket: number | null;
  onBlockClick: (bucketStart: number) => void;
}

function fmtBucket(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function BlocksChart({ blocks, selectedBucket, onBlockClick }: Props) {
  if (blocks.length === 0) {
    return <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>No data for this day.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={blocks} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        onClick={(e) => { if (e?.activePayload?.[0]) onBlockClick((e.activePayload[0].payload as DayBlock).bucket_start); }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="bucket_start"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={fmtBucket}
          ticks={blocks.filter((_, i) => i % 6 === 0).map(b => b.bucket_start)}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          padding={{ left: 60, right: 20 }}
        />
        <YAxis domain={[30, 130]} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#22c55e' }}
          labelFormatter={(ts: number) => fmtBucket(ts) + '–' + fmtBucket(ts + 600_000)}
          formatter={(v: number) => [`${v.toFixed(1)} dB`, 'Peak']}
          cursor={{ fill: '#1e293b' }}
        />
        <ReferenceLine y={103} stroke="#ef4444" strokeDasharray="6 3" />
        <Bar dataKey="high_db" maxBarSize={8} radius={[2, 2, 0, 0]} isAnimationActive={false} style={{ cursor: 'pointer' }}>
          {blocks.map(b => (
            <Cell
              key={b.bucket_start}
              fill={b.bucket_start === selectedBucket ? '#3b82f6' : (b.high_db ?? 0) >= 103 ? '#ef4444' : '#22c55e'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
