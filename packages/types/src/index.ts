export type ReadingStatus = 'ok' | 'blank' | 'stale' | 'error' | 'ocr_fail';

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
}

export interface WsMessage {
  ts: number;
  raw_db: number | null;
  status: ReadingStatus;
}
