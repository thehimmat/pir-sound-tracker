import type { Reading } from '@pir/types';
import { classifyReading } from '../utils/varianceEvents.js';

interface Props {
  readings: Reading[];
}

export function SummaryBar({ readings }: Props) {
  const valid = readings.filter(r => r.status === 'ok' && r.raw_db !== null);

  let highDb: number | null = null;
  let highTs = 0;
  let loud = 0;
  let over = 0;
  for (const r of valid) {
    const db = r.raw_db as number;
    if (highDb === null || db > highDb) { highDb = db; highTs = r.ts; }
    const s = classifyReading(db, r.ts);
    if (s === 'over_limit_report') over++;
    else if (s === 'loud_document') loud++;
  }

  const highStatus = highDb !== null ? classifyReading(highDb, highTs) : null;
  const highColor = highStatus === 'over_limit_report' ? '#ef4444'
    : highStatus === 'loud_document' ? '#f59e0b'
    : '#e2e8f0';

  return (
    <div style={{
      display: 'flex',
      gap: 24,
      padding: '10px 16px',
      background: '#1e293b',
      borderRadius: 8,
      marginBottom: 12,
      fontSize: 13,
      color: '#94a3b8',
    }}>
      <span>
        High:{' '}
        <strong style={{ color: highColor }}>
          {highDb !== null ? `${highDb.toFixed(1)} dB` : '—'}
        </strong>
      </span>
      <span>
        Loud:{' '}
        <strong style={{ color: loud > 0 ? '#f59e0b' : '#e2e8f0' }}>
          {loud}
        </strong>
      </span>
      <span>
        Over limit:{' '}
        <strong style={{ color: over > 0 ? '#ef4444' : '#e2e8f0' }}>
          {over}
        </strong>
      </span>
    </div>
  );
}
