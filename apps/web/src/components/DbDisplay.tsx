import type { ReadingStatus } from '@pir/types';

interface Props {
  value: number | null;
  status: ReadingStatus | null;
  limitDb?: number;
}

function dbColor(value: number | null, limitDb: number): string {
  if (value === null) return '#94a3b8';
  if (value >= limitDb) return '#ef4444';
  if (value >= limitDb - 13) return '#f59e0b'; // amber within ~13 dB of limit
  return '#22c55e';
}

const STATUS_LABELS: Record<string, string> = {
  blank:    'BLANK',
  stale:    'STALE',
  error:    'ERROR',
  ocr_fail: 'OCR FAIL',
};

export function DbDisplay({ value, status, limitDb = 103 }: Props) {
  const color = dbColor(value, limitDb);
  const label = status && status !== 'ok' ? STATUS_LABELS[status] ?? status.toUpperCase() : null;

  const waiting = value === null && status === null;

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{
        fontSize: 96,
        fontWeight: 700,
        color,
        lineHeight: 1,
        letterSpacing: '-2px',
        animation: waiting ? 'fade-pulse 2s ease-in-out infinite' : undefined,
      }}>
        {value !== null ? value.toFixed(1) : '--'}
      </div>
      <div style={{ fontSize: 28, color: '#94a3b8', marginTop: 4 }}>dB</div>
      <span style={{
        display: 'inline-block',
        marginTop: 12,
        padding: '4px 14px',
        borderRadius: 6,
        background: '#1e293b',
        color: '#f59e0b',
        fontSize: 13,
        letterSpacing: 1,
        visibility: label ? 'visible' : 'hidden',
      }}>
        {label ?? 'OK'}
      </span>
    </div>
  );
}
