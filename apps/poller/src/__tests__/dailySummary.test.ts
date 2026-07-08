import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { insertReading, getDailySummary, getAllDailySummaries } from '@pir/db';

// Point at the real Supabase project (needs env vars set)
// Run with: SUPABASE_URL=... SUPABASE_ANON_KEY=... node --test dist/__tests__/dailySummary.test.js

before(() => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('[skip] dailySummary tests require SUPABASE_URL and SUPABASE_ANON_KEY');
  }
});

describe('getDailySummary', () => {
  it('returns zero counts for a day with no readings', async () => {
    if (!process.env.SUPABASE_URL) return;
    const s = await getDailySummary('2099-01-01');
    assert.equal(s.high_db, null);
    assert.equal(s.violation_count, 0);
    assert.equal(s.reading_count, 0);
  });

  it('calculates high_db, violation_count and loud_count correctly', async () => {
    if (!process.env.SUPABASE_URL) return;
    // Midnight Pacific: quiet hours, so the active limit is 90 dBA with a
    // 5 dB warning buffer. Note: inserted rows persist, so a rerun against
    // the same date double-counts (pre-existing limitation of this test).
    const base = new Date('2000-01-15T00:00:00').getTime();
    await insertReading(base + 1000, 80.0, 'ok');    // normal
    await insertReading(base + 2000, 86.0, 'ok');    // loud (>= 90 - 5)
    await insertReading(base + 3000, 106.5, 'ok');   // over limit
    await insertReading(base + 4000, 104.9, 'ok');   // over limit (90 at night)
    await insertReading(base + 5000, 110.0, 'ok');   // over limit + new high

    const s = await getDailySummary('2000-01-15');
    assert.equal(s.high_db, 110.0);
    assert.equal(s.violation_count, 3);
    assert.equal(s.loud_count, 1);
    assert.equal(s.reading_count, 5);
  });
});

describe('getAllDailySummaries', () => {
  it('returns an array', async () => {
    if (!process.env.SUPABASE_URL) return;
    const summaries = await getAllDailySummaries();
    assert.ok(Array.isArray(summaries));
  });
});
