export type ReadingStatus = 'ok' | 'blank' | 'stale' | 'error' | 'ocr_fail';

// ---------------------------------------------------------------------------
// Variance events + noise limits
// Kept here so both the poller (server) and web app (browser) share one source.
// ---------------------------------------------------------------------------

export interface VarianceEvent {
  name: string;
  dates: string[];   // YYYY-MM-DD
  limitDb: number;
  note?: string;
}

/** All permitted variance events for the current year, ordered by first date. */
export const VARIANCE_EVENTS: VarianceEvent[] = [
  {
    name: 'Rose Cup Races',
    dates: ['2026-07-10', '2026-07-11', '2026-07-12'],
    limitDb: 112,
  },
  {
    name: 'NTT IndyCar Series',
    dates: ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'],
    limitDb: 115,
    note: '+ 2 TBD test days',
  },
  {
    name: 'Sovren / ABFM',
    dates: ['2026-09-04', '2026-09-05', '2026-09-06'],
    limitDb: 110,
  },
];

export const DEFAULT_LIMIT_DB = 103;

/** Returns the applicable dB limit for a given date string (YYYY-MM-DD). */
export function getLimitForDate(dateStr: string): number {
  for (const event of VARIANCE_EVENTS) {
    if (event.dates.includes(dateStr)) return event.limitDb;
  }
  return DEFAULT_LIMIT_DB;
}

/** Returns the variance event active on the given date, or null. */
export function getEventForDate(dateStr: string): VarianceEvent | null {
  return VARIANCE_EVENTS.find(e => e.dates.includes(dateStr)) ?? null;
}

export interface Reading {
  id: number;
  ts: number;        // Unix ms
  raw_db: number | null;
  status: ReadingStatus;
}

export interface DailySummary {
  date: string;      // 'YYYY-MM-DD'
  high_db: number | null;
  violation_count: number;
  reading_count: number;
  error_count: number;
}

export interface DayBlock {
  bucket_start: number;   // Unix ms — start of 10-min bucket
  high_db: number | null;
  reading_count: number;
  /** Most common non-ok status in this bucket; null when all readings were ok or bucket is empty. */
  dominant_status?: ReadingStatus | null;
}

export interface WsMessage {
  ts: number;
  raw_db: number | null;
  status: ReadingStatus;
}
