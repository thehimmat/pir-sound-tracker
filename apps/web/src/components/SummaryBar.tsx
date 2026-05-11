import React from 'react';
import type { Reading } from '@pir/types';

interface Props {
  readings: Reading[];
}

export function SummaryBar({ readings }: Props) {
  const valid = readings.filter(r => r.status === 'ok' && r.raw_db !== null);
  const highDb = valid.length > 0
    ? Math.max(...valid.map(r => r.raw_db as number))
    : null;
  const violations = valid.filter(r => (r.raw_db as number) >= 103).length;

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
        <strong style={{ color: highDb !== null && highDb >= 103 ? '#ef4444' : '#e2e8f0' }}>
          {highDb !== null ? `${highDb.toFixed(1)} dB` : '—'}
        </strong>
      </span>
      <span>
        Violations:{' '}
        <strong style={{ color: violations > 0 ? '#ef4444' : '#e2e8f0' }}>
          {violations}
        </strong>
      </span>
    </div>
  );
}
