import type { ReadingStatus } from '@pir/types';
import { NOISE_STATUS_LABELS, type NoiseStatus } from '../utils/varianceEvents.js';

interface Props {
  value: number | null;
  status: ReadingStatus | null;
  /** Classification of the current reading; null while waiting or on read failure. */
  noiseStatus: NoiseStatus | null;
}

const NOISE_COLORS: Record<NoiseStatus, string> = {
  normal: '#22c55e',
  loud_document: '#f59e0b',
  over_limit_report: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  blank:    'BLANK',
  stale:    'STALE',
  error:    'ERROR',
  ocr_fail: 'OCR FAIL',
};

export function DbDisplay({ value, status, noiseStatus }: Props) {
  const color = value === null || noiseStatus === null ? '#94a3b8' : NOISE_COLORS[noiseStatus];
  const readFailLabel = status && status !== 'ok' ? STATUS_LABELS[status] ?? status.toUpperCase() : null;
  const noiseLabel = !readFailLabel && value !== null && noiseStatus !== null
    ? NOISE_STATUS_LABELS[noiseStatus]
    : null;
  const label = readFailLabel ?? noiseLabel;

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
        color: readFailLabel ? '#f59e0b' : color,
        fontSize: 13,
        letterSpacing: 1,
        visibility: label ? 'visible' : 'hidden',
      }}>
        {label ?? 'OK'}
      </span>
    </div>
  );
}
