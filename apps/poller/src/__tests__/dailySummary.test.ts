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

  it('calculates high_db and violation_count correctly', async () => {
    if (!process.env.SUPABASE_URL) return;
    const base = new Date('2000-01-15T00:00:00').getTime();
    await insertReading(base + 1000, 80.0, 'ok');
    await insertReading(base + 2000, 106.5, 'ok');   // violation
    await insertReading(base + 3000, 104.9, 'ok');   // not a violation
    await insertReading(base + 4000, 110.0, 'ok');   // violation + new high

    const s = await getDailySummary('2000-01-15');
    assert.equal(s.high_db, 110.0);
    assert.equal(s.violation_count, 2);
    assert.equal(s.reading_count, 4);
  });
});

describe('getAllDailySummaries', () => {
  it('returns an array', async () => {
    if (!process.env.SUPABASE_URL) return;
    const summaries = await getAllDailySummaries();
    assert.ok(Array.isArray(summaries));
  });
});
