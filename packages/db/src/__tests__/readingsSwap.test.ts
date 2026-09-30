import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb as freshDbWith, insert, between, archive, approx, count, T0, MIN, type Db, type Row } from './pgHarness.js';

// Exercises supabase/migrations/20260930_readings_swap.sql: replacing the
// bloated `readings` table with a slim copy of the un-archived rows.

const freshDb = () => freshDbWith(['20260929_readings_archive.sql', '20260930_readings_swap.sql']);

const summaryCalls = (db: Db) => count(db, 'select n from summary_calls');

async function columns(db: Db, table: string): Promise<string[]> {
  const { rows } = await db.query<{ c: string }>(
    `select column_name as c from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`, [table]);
  return rows.map(r => r.c);
}

// Minute 0 is archived; minutes 1–3 stay raw. SPLIT falls inside minute 2.
const ROWS: Row[] = [
  { ts: T0 + 1000,           raw_db: 70.1, status: 'ok' },
  { ts: T0 + MIN + 2000,     raw_db: 71.2, status: 'ok' },
  { ts: T0 + MIN + 3000,     raw_db: null, status: 'ocr_fail' },
  { ts: T0 + 2 * MIN + 4000, raw_db: 95.5, status: 'ok' },
  { ts: T0 + 3 * MIN + 5000, raw_db: 72.0, status: 'ok' },
];
const SPLIT = T0 + 2 * MIN;

describe('readings table swap', () => {
  let db: Db;
  let callsBefore: number;

  beforeEach(async () => {
    db = await freshDb();
    await insert(db, ROWS);
    await archive(db, T0 + MIN);
    callsBefore = await summaryCalls(db);
  });

  it('prepare copies un-archived rows before the split without touching readings', async () => {
    const copied = await count(db, `select readings_swap_prepare(${SPLIT}) as n`);
    assert.equal(copied, 2);
    assert.equal(await count(db, 'select count(*) as n from readings_new'), 2);
    assert.equal(await count(db, 'select count(*) as n from readings'), ROWS.length);
    assert.equal(await summaryCalls(db), callsBefore);
  });

  it('cutover moves the rest across and swaps the table names', async () => {
    await db.query(`select readings_swap_prepare(${SPLIT})`);
    const copied = await count(db, `select readings_swap_cutover(${SPLIT}) as n`);
    assert.equal(copied, 2);

    assert.deepEqual(await columns(db, 'readings'), ['ts', 'raw_db', 'status']);
    assert.deepEqual(await columns(db, 'readings_old'), ['id', 'ts', 'raw_db', 'status']);
    assert.equal(await count(db, 'select count(*) as n from readings'), 4);
    assert.equal(await count(db, 'select count(*) as n from readings_old'), ROWS.length);
    assert.deepEqual(await columns(db, 'readings_new'), []);
    // Copying rows must not re-run the daily summary trigger.
    assert.equal(await summaryCalls(db), callsBefore);
  });

  it('keeps readings_between results identical across the swap', async () => {
    const before = approx(await between(db, T0, null));
    await db.query(`select readings_swap_prepare(${SPLIT})`);
    await db.query(`select readings_swap_cutover(${SPLIT})`);
    assert.deepEqual(approx(await between(db, T0, null)), before);
  });

  it('fires the daily summary trigger once per new insert', async () => {
    await db.query(`select readings_swap_prepare(${SPLIT})`);
    await db.query(`select readings_swap_cutover(${SPLIT})`);
    await insert(db, [{ ts: T0 + 10 * MIN, raw_db: 60, status: 'ok' }, { ts: T0 + 11 * MIN, raw_db: null, status: 'error' }]);
    assert.equal(await summaryCalls(db), callsBefore + 2);
    assert.equal(await count(db, 'select count(*) as n from readings_old'), ROWS.length);
  });

  it('recreates the ts index, row-level security and the public read policy', async () => {
    await db.query(`select readings_swap_prepare(${SPLIT})`);
    await db.query(`select readings_swap_cutover(${SPLIT})`);

    const { rows: idx } = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and tablename = 'readings'`);
    assert.deepEqual(idx.map(r => r.indexname), ['idx_readings_ts']);

    await db.exec('set role anon');
    assert.equal(await count(db, 'select count(*) as n from readings'), 4);
    await assert.rejects(db.query(`insert into readings (ts, raw_db, status) values (1, 1, 'ok')`), /row-level security/);
    await db.exec('reset role');
  });

  it('still lets the nightly job archive and delete from the new table', async () => {
    await db.query(`select readings_swap_prepare(${SPLIT})`);
    await db.query(`select readings_swap_cutover(${SPLIT})`);
    const before = approx(await between(db, T0, null));
    await archive(db, T0 + 3 * MIN, true);
    assert.equal(await count(db, 'select count(*) as n from readings'), 1);
    assert.deepEqual(approx(await between(db, T0, null)), before);
  });

  it('refuses to cut over if prepare has not run', async () => {
    await assert.rejects(db.query(`select readings_swap_cutover(${SPLIT})`), /readings_new/);
    assert.deepEqual(await columns(db, 'readings'), ['id', 'ts', 'raw_db', 'status']);
  });

  it('does not let the public API roles run the swap', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(`select readings_swap_prepare(${SPLIT})`), /permission denied/);
      await assert.rejects(db.query(`select readings_swap_cutover(${SPLIT})`), /permission denied/);
      await db.exec('reset role');
    }
  });
});
