import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import type { Reading, DailySummary, ReadingStatus } from '@pir/types';

export type { Reading, DailySummary, ReadingStatus };

let _db: DatabaseSync | null = null;

export function getDb(dbPath?: string): DatabaseSync {
  if (_db) return _db;

  const resolved = dbPath ?? process.env.DB_PATH ?? './data/readings.db';
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new DatabaseSync(resolved);
  migrate(_db);
  return _db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS readings (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      raw_db  REAL,
      status  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings (ts);
  `);
}

export function insertReading(
  ts: number,
  raw_db: number | null,
  status: ReadingStatus,
): void {
  getDb()
    .prepare('INSERT INTO readings (ts, raw_db, status) VALUES (?, ?, ?)')
    .run(ts, raw_db, status);
}

export function getReadingsSince(fromTs: number): Reading[] {
  return getDb()
    .prepare('SELECT * FROM readings WHERE ts >= ? ORDER BY ts ASC')
    .all(fromTs) as unknown as Reading[];
}

export function getReadingsForDay(dateStr: string): Reading[] {
  const start = new Date(dateStr + 'T00:00:00').getTime();
  const end   = start + 86_400_000;
  return getDb()
    .prepare('SELECT * FROM readings WHERE ts >= ? AND ts < ? ORDER BY ts ASC')
    .all(start, end) as unknown as Reading[];
}

export function getDailySummary(dateStr: string): DailySummary {
  const start = new Date(dateStr + 'T00:00:00').getTime();
  const end   = start + 86_400_000;
  const row = getDb()
    .prepare(`
      SELECT
        MAX(raw_db) AS high_db,
        COUNT(CASE WHEN raw_db >= 105 THEN 1 END) AS violation_count,
        COUNT(*) AS reading_count
      FROM readings
      WHERE ts >= ? AND ts < ?
    `)
    .get(start, end) as { high_db: number | null; violation_count: number; reading_count: number };

  return {
    date: dateStr,
    high_db: row.high_db,
    violation_count: row.violation_count,
    reading_count: row.reading_count,
  };
}

export function getAllDailySummaries(): DailySummary[] {
  const rows = getDb()
    .prepare(`
      SELECT
        date(ts / 1000, 'unixepoch', 'localtime') AS date,
        MAX(raw_db) AS high_db,
        COUNT(CASE WHEN raw_db >= 105 THEN 1 END) AS violation_count,
        COUNT(*) AS reading_count
      FROM readings
      GROUP BY date
      ORDER BY date DESC
    `)
    .all() as Array<{ date: string; high_db: number | null; violation_count: number; reading_count: number }>;

  return rows.map(r => ({
    date: r.date,
    high_db: r.high_db,
    violation_count: r.violation_count,
    reading_count: r.reading_count,
  }));
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
