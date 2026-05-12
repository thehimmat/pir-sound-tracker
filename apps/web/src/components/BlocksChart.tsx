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
  limitDb?: number;
}

function fmtBucket(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function BlocksChart({ blocks, selectedBucket, onBlockClick, limitDb = 103 }: Props) {
  if (blocks.length === 0) {
    return <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>No data for this day.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={blocks}
        margin={{ top: 8, right: 20, bottom: 0, left: 0 }}
        barCategoryGap="20%"
        onClick={(e) => {
          const b = e?.activePayload?.[0]?.payload as DayBlock | undefined;
          if (b && b.high_db !== null) onBlockClick(b.bucket_start);
        }}
      >
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
          padding={{ left: 10, right: 10 }}
        />
        <YAxis domain={[30, 130]} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#22c55e' }}
          labelFormatter={(ts: number) => fmtBucket(ts) + '–' + fmtBucket(ts + 600_000)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) =>
            v == null
              ? [<span style={{ color: '#64748b', fontStyle: 'italic' }}>No data collected</span>, '']
              : [`${(v as number).toFixed(1)} dB`, 'Peak']
          }
          cursor={{ fill: '#ffffff08' }}
        />
        <ReferenceLine y={limitDb} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `${limitDb} dB`, fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
        <Bar dataKey="high_db" maxBarSize={4} radius={[1, 1, 0, 0]} isAnimationActive={false} style={{ cursor: 'pointer' }}>
          {blocks.map(b => (
            <Cell
              key={b.bucket_start}
              fill={
                b.high_db === null
                  ? '#1e293b'
                  : b.bucket_start === selectedBucket
                    ? '#3b82f6'
                    : b.high_db >= limitDb
                      ? '#ef4444'
                      : '#22c55e'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
