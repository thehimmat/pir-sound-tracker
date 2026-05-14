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
  tickIntervalMs?: number;
  limitDb?: number;
  /** Pin the x-axis to a fixed window (epoch ms). When provided, ticks are
   *  computed from this range so labels are always spread even if data is sparse. */
  domainStart?: number;
  domainEnd?: number;
}

const TEN_MIN = 10 * 60 * 1000;

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function computeTicks(intervalMs: number, start: number, end: number): number[] {
  const first = Math.ceil(start / intervalMs) * intervalMs;
  const ticks: number[] = [];
  for (let t = first; t <= end; t += intervalMs) ticks.push(t);
  return ticks;
}

export function ReadingsChart({ readings, tickIntervalMs = TEN_MIN, limitDb = 103, domainStart, domainEnd }: Props) {
  const data = readings
    .filter(r => r.status === 'ok' && r.raw_db !== null)
    .map(r => ({ ts: r.ts, db: r.raw_db as number }));

  // Use explicit domain bounds if provided; fall back to data extent
  const xMin = domainStart ?? (data.length > 0 ? data[0].ts : Date.now() - TEN_MIN);
  const xMax = domainEnd   ?? (data.length > 0 ? data[data.length - 1].ts : Date.now());

  return (
    <>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={[xMin, xMax]}
          ticks={computeTicks(tickIntervalMs, xMin, xMax)}
          tickFormatter={fmt}
          tick={{ fill: '#64748b', fontSize: 11 }}
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
          labelFormatter={(ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          formatter={(v: number) => [`${v.toFixed(1)} dB`, 'Level']}
        />
        <ReferenceLine y={limitDb} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `${limitDb} dB`, fill: '#ef4444', fontSize: 11 }} />
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
    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#475569' }}>
      Isolated dips may be read errors — the OCR occasionally misreads a digit on the display rather than reflecting a real drop in noise level.
    </p>
    </>
  );
}
