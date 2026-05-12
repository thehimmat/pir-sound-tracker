export interface VarianceEvent {
  name: string;
  dates: string[];   // YYYY-MM-DD
  limitDb: number;
  note?: string;
}

/** All known variance events, ordered by first date. */
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

/**
 * Returns the applicable dB limit for a given date string (YYYY-MM-DD).
 * Falls back to the standard 103 dBA operational limit.
 */
export function getLimitForDate(dateStr: string): number {
  for (const event of VARIANCE_EVENTS) {
    if (event.dates.includes(dateStr)) return event.limitDb;
  }
  return DEFAULT_LIMIT_DB;
}

/**
 * Returns the variance event active on the given date, or null.
 */
export function getEventForDate(dateStr: string): VarianceEvent | null {
  return VARIANCE_EVENTS.find(e => e.dates.includes(dateStr)) ?? null;
}
