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

// Normal PIR rules (non-event days), all in track-local time:
// Tue-Sun 9:00 AM-10:00 PM the limit is 103 dBA; Mondays and any time
// outside 9:00 AM-10:00 PM it drops to 90 dBA.
export const RESTRICTED_LIMIT_DB   = 90;
export const OPERATING_START_HOUR  = 9;   // 9:00 AM
export const OPERATING_END_HOUR    = 22;  // 10:00 PM

// Warning buffer below the limit that marks a reading "loud": 3 dB by
// default, 5 dB during quiet hours (10:00 PM-8:00 AM).
export const WARNING_BUFFER_DB       = 3;
export const QUIET_WARNING_BUFFER_DB = 5;
export const QUIET_START_HOUR        = 22; // 10:00 PM
export const QUIET_END_HOUR          = 8;  // 8:00 AM

/** Classification of a single dB reading against the active limit. */
export type NoiseStatus = 'normal' | 'loud_document' | 'over_limit_report';

export const NOISE_STATUS_LABELS: Record<NoiseStatus, string> = {
  normal: 'Normal',
  loud_document: 'Loud — document',
  over_limit_report: 'Over limit — report',
};

// The track lives in Portland; limits are defined in local wall-clock time,
// so all day/hour math must use this zone no matter where the code runs
// (the poller runs on Fly in UTC, browsers can be anywhere).
const TRACK_TZ = 'America/Los_Angeles';

const trackTimeFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRACK_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
  weekday: 'short',
});

interface TrackTimeParts {
  dateStr: string;   // YYYY-MM-DD at the track
  weekday: string;   // 'Mon', 'Tue', ...
  hour: number;      // 0-23 at the track
}

function getTrackTimeParts(ts: number): TrackTimeParts {
  const parts = trackTimeFmt.formatToParts(new Date(ts));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
    hour: parseInt(get('hour'), 10),
  };
}

/** Returns the trackside date string (YYYY-MM-DD) for a timestamp. */
export function getTrackDateStr(ts: number): string {
  return getTrackTimeParts(ts).dateStr;
}

/**
 * Returns the daytime dB limit for a given date string (YYYY-MM-DD):
 * event limit on variance days, 90 on Mondays, otherwise 103. Does not
 * account for time of day; use getActiveLimit(ts) for that.
 */
export function getLimitForDate(dateStr: string): number {
  for (const event of VARIANCE_EVENTS) {
    if (event.dates.includes(dateStr)) return event.limitDb;
  }
  if (weekdayOfDate(dateStr) === 1) return RESTRICTED_LIMIT_DB; // Monday
  return DEFAULT_LIMIT_DB;
}

/** Day of week (0=Sun..6=Sat) for a calendar date string, timezone-free. */
function weekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Returns the variance event active on the given date, or null. */
export function getEventForDate(dateStr: string): VarianceEvent | null {
  return VARIANCE_EVENTS.find(e => e.dates.includes(dateStr)) ?? null;
}

/** Returns the dB limit in effect at the given timestamp (track-local rules). */
export function getActiveLimit(ts: number): number {
  const { dateStr, weekday, hour } = getTrackTimeParts(ts);
  const event = getEventForDate(dateStr);
  if (event) return event.limitDb;
  if (weekday === 'Mon') return RESTRICTED_LIMIT_DB;
  if (hour < OPERATING_START_HOUR || hour >= OPERATING_END_HOUR) return RESTRICTED_LIMIT_DB;
  return DEFAULT_LIMIT_DB;
}

/** Warning buffer in dB at the given timestamp: 5 during quiet hours, else 3. */
export function getWarningBuffer(ts: number): number {
  const { hour } = getTrackTimeParts(ts);
  return (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR)
    ? QUIET_WARNING_BUFFER_DB
    : WARNING_BUFFER_DB;
}

/** Classifies a dB reading against the limit in effect at its timestamp. */
export function classifyReading(db: number, ts: number): NoiseStatus {
  const limit = getActiveLimit(ts);
  if (db >= limit) return 'over_limit_report';
  if (db >= limit - getWarningBuffer(ts)) return 'loud_document';
  return 'normal';
}

/** True during track operating hours (9:00 AM to 10:00 PM, track time). */
export function isOperatingHours(ts: number): boolean {
  const { hour } = getTrackTimeParts(ts);
  return hour >= OPERATING_START_HOUR && hour < OPERATING_END_HOUR;
}

/** True during quiet hours (10:00 PM to 8:00 AM, track time). */
export function isQuietHours(ts: number): boolean {
  const { hour } = getTrackTimeParts(ts);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** Human-readable summary of the rules in effect at a timestamp. */
export interface DayStatus {
  dateStr: string;               // YYYY-MM-DD at the track
  event: VarianceEvent | null;   // active variance event, if any
  isMonday: boolean;
  inOperatingHours: boolean;
  inQuietHours: boolean;
  limitDb: number;               // limit in effect right now
  headline: string;              // e.g. "Race day: Rose Cup Races"
  hoursNote: string;             // e.g. "Operating hours (9:00 AM to 10:00 PM)"
}

export function getDayStatus(ts: number): DayStatus {
  const { dateStr, weekday } = getTrackTimeParts(ts);
  const event = getEventForDate(dateStr);
  const isMonday = weekday === 'Mon';
  const inOperatingHours = isOperatingHours(ts);
  const inQuietHours = isQuietHours(ts);
  const limitDb = getActiveLimit(ts);

  const headline = event
    ? `Race day: ${event.name}`
    : isMonday
      ? `Monday: ${RESTRICTED_LIMIT_DB} dBA limit all day`
      : 'Normal operating day';

  const hoursNote = inOperatingHours
    ? 'Operating hours (9:00 AM to 10:00 PM)'
    : inQuietHours
      ? 'Quiet hours (10:00 PM to 8:00 AM)'
      : 'Outside operating hours';

  return { dateStr, event, isMonday, inOperatingHours, inQuietHours, limitDb, headline, hoursNote };
}

export interface Reading {
  ts: number;        // Unix ms (whole seconds for archived readings)
  raw_db: number | null;
  status: ReadingStatus;
}

export interface DailySummary {
  date: string;      // 'YYYY-MM-DD'
  high_db: number | null;
  violation_count: number;  // readings at or above the active limit
  loud_count: number;       // readings within the warning buffer, below the limit
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
