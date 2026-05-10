import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { getDb, insertReading, getDailySummary, getAllDailySummaries, closeDb } from '@pir/db';

const TMP_DB = path.join(os.tmpdir(), `pir-test-${Date.now()}.db`);

before(() => {
  process.env.DB_PATH = TMP_DB;
  getDb(TMP_DB);
});

after(() => {
  closeDb();
  fs.rmSync(TMP_DB, { force: true });
});

describe('getDailySummary', () => {
  it('returns zero counts for a day with no readings', () => {
    const s = getDailySummary('2099-01-01');
    assert.equal(s.high_db, null);
    assert.equal(s.violation_count, 0);
    assert.equal(s.reading_count, 0);
  });

  it('calculates high_db and violation_count correctly', () => {
    // 2000-01-01 local midnight
    const base = new Date('2000-01-01T00:00:00').getTime();
    insertReading(base + 1000, 80.0, 'ok');
    insertReading(base + 2000, 106.5, 'ok');  // violation
    insertReading(base + 3000, 104.9, 'ok');  // not a violation
    insertReading(base + 4000, 110.0, 'ok');  // violation + new high

    const s = getDailySummary('2000-01-01');
    assert.equal(s.high_db, 110.0);
    assert.equal(s.violation_count, 2);
    assert.equal(s.reading_count, 4);
  });

  it('ignores null raw_db rows in high_db but counts them', () => {
    const base = new Date('2000-01-02T00:00:00').getTime();
    insertReading(base + 1000, null, 'blank');
    insertReading(base + 2000, 95.0, 'ok');

    const s = getDailySummary('2000-01-02');
    assert.equal(s.high_db, 95.0);
    assert.equal(s.violation_count, 0);
    assert.equal(s.reading_count, 2);
  });
});

describe('getAllDailySummaries', () => {
  it('returns entries for days that have readings', () => {
    const summaries = getAllDailySummaries();
    const dates = summaries.map(s => s.date);
    assert.ok(dates.includes('2000-01-01'));
    assert.ok(dates.includes('2000-01-02'));
  });

  it('returns most recent day first', () => {
    const summaries = getAllDailySummaries();
    const dates = summaries.map(s => s.date);
    const jan02idx = dates.indexOf('2000-01-02');
    const jan01idx = dates.indexOf('2000-01-01');
    assert.ok(jan02idx < jan01idx, 'Jan 02 should appear before Jan 01 (DESC order)');
  });
});
