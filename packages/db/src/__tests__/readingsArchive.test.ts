import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb as freshDbWith, insert, between, archive, approx, genericPlanOfFunction, T0, MIN, type Db, type Row } from './pgHarness.js';

// Exercises supabase/migrations/20260929_readings_archive.sql against an
// in-process Postgres (PGlite), starting from the live `readings` shape.

const freshDb = () => freshDbWith(['20260929_readings_archive.sql', '20261001_readings_between_bounded_scan.sql']);

async function archivedBefore(db: Db): Promise<number> {
  const { rows } = await db.query<{ v: string }>('select archived_before as v from readings_archive_state');
  return Number(rows[0].v);
}

async function slots(db: Db, minuteTs: number): Promise<(number | null)[]> {
  const { rows } = await db.query<{ slots: (number | null)[] }>(
    'select slots from readings_archive where minute_ts = $1', [minuteTs]);
  return rows[0].slots;
}

describe('readings slot encoding', () => {
  let db: Db;
  beforeEach(async () => { db = await freshDb(); });

  it('stores ok readings as tenths of a dB and statuses as negative codes', async () => {
    const { rows } = await db.query<{ ok: number; odd: number; error: number; blank: number; stale: number; ocr: number }>(`
      select readings_slot_encode(71.2::real, 'ok')         as ok,
             readings_slot_encode(91.38::real, 'ok')        as odd,
             readings_slot_encode(null, 'error')            as error,
             readings_slot_encode(null, 'blank')            as blank,
             readings_slot_encode(null, 'stale')            as stale,
             readings_slot_encode(null, 'ocr_fail')         as ocr`);
    assert.deepEqual(rows[0], { ok: 712, odd: 914, error: -1, blank: -2, stale: -3, ocr: -4 });
  });

  it('decodes every slot back to the original status and value', async () => {
    const { rows } = await db.query<{ s: number; status: string; db: number | null }>(`
      select s, readings_slot_status(s::smallint) as status, readings_slot_db(s::smallint) as db
      from unnest(array[712, 0, -1, -2, -3, -4]) as s`);
    assert.deepEqual(approx(rows.map(r => ({ ts: r.s, raw_db: r.db, status: r.status }))), [
      { ts: 712, raw_db: 71.2, status: 'ok' },
      { ts: 0,   raw_db: 0,    status: 'ok' },
      { ts: -1,  raw_db: null, status: 'error' },
      { ts: -2,  raw_db: null, status: 'blank' },
      { ts: -3,  raw_db: null, status: 'stale' },
      { ts: -4,  raw_db: null, status: 'ocr_fail' },
    ]);
  });
});

describe('archive_readings', () => {
  let db: Db;
  beforeEach(async () => { db = await freshDb(); });

  it('packs a minute into 60 per-second slots with gaps left empty', async () => {
    await insert(db, [
      { ts: T0 + 0 * 1000 + 123, raw_db: 70.1, status: 'ok' },
      { ts: T0 + 5 * 1000 + 900, raw_db: null, status: 'ocr_fail' },
      { ts: T0 + 59 * 1000 + 1,  raw_db: 88.8, status: 'ok' },
    ]);
    assert.equal(await archive(db, T0 + MIN), 1);

    const s = await slots(db, T0);
    assert.equal(s.length, 60);
    assert.equal(s[0], 701);
    assert.equal(s[5], -4);
    assert.equal(s[59], 888);
    assert.equal(s.filter(v => v !== null).length, 3);

    const { rows } = await db.query<{ max_tenths: number }>('select max_tenths from readings_archive');
    assert.equal(rows[0].max_tenths, 888);
  });

  it('keeps one reading per second: ok beats a failure, then the loudest ok wins', async () => {
    await insert(db, [
      { ts: T0 + 1000,       raw_db: null, status: 'error' },
      { ts: T0 + 1500,       raw_db: 65.0, status: 'ok' },
      { ts: T0 + 2000,       raw_db: 80.0, status: 'ok' },
      { ts: T0 + 2999,       raw_db: 82.5, status: 'ok' },
      { ts: T0 + 3000,       raw_db: null, status: 'ocr_fail' },
      { ts: T0 + 3400,       raw_db: null, status: 'error' },
    ]);
    await archive(db, T0 + MIN);
    const s = await slots(db, T0);
    assert.equal(s[1], 650);
    assert.equal(s[2], 825);
    assert.equal(s[3], -1);
  });

  it('only archives whole minutes before the cutoff and advances the cutoff', async () => {
    await insert(db, [
      { ts: T0 + 10_000,       raw_db: 60, status: 'ok' },
      { ts: T0 + MIN + 10_000, raw_db: 61, status: 'ok' },
    ]);
    // Cutoff in the middle of the second minute: only the first minute is packed.
    assert.equal(await archive(db, T0 + MIN + 30_000), 1);
    assert.equal(await archivedBefore(db), T0 + MIN);
    // Same cutoff again is a no-op.
    assert.equal(await archive(db, T0 + MIN + 30_000), 0);
    // An earlier cutoff never moves it backwards.
    assert.equal(await archive(db, T0), 0);
    assert.equal(await archivedBefore(db), T0 + MIN);
  });

  it('leaves raw rows in place by default and removes them when asked', async () => {
    await insert(db, [
      { ts: T0 + 1000,       raw_db: 60, status: 'ok' },
      { ts: T0 + MIN + 1000, raw_db: 61, status: 'ok' },
      { ts: T0 + 2 * MIN,    raw_db: 62, status: 'ok' },
    ]);
    await archive(db, T0 + MIN);
    let { rows } = await db.query<{ n: number }>('select count(*)::int as n from readings');
    assert.equal(rows[0].n, 3);

    await archive(db, T0 + 2 * MIN, true);
    ({ rows } = await db.query<{ n: number }>('select count(*)::int as n from readings'));
    // Only the second minute's row is deleted: the first minute was archived
    // earlier without delete, and the third minute is not archived yet.
    assert.equal(rows[0].n, 2);
  });
});

describe('readings_between', () => {
  let db: Db;
  const rows: Row[] = [
    { ts: T0 + 1000,           raw_db: 70.1, status: 'ok' },
    { ts: T0 + 2000,           raw_db: null, status: 'blank' },
    { ts: T0 + 30_000,         raw_db: 95.5, status: 'ok' },
    { ts: T0 + MIN + 4000,     raw_db: 71.2, status: 'ok' },
    { ts: T0 + 2 * MIN + 5000, raw_db: 91.0, status: 'ok' },
    { ts: T0 + 2 * MIN + 6000, raw_db: null, status: 'stale' },
  ];
  beforeEach(async () => { db = await freshDb(); await insert(db, rows); });

  it('returns the raw table unchanged before anything is archived', async () => {
    assert.deepEqual(approx(await between(db, T0, T0 + 3 * MIN)), rows);
  });

  it('serves archived minutes per second and newer minutes from the raw table', async () => {
    await archive(db, T0 + 2 * MIN);
    assert.deepEqual(approx(await between(db, T0, T0 + 3 * MIN)), rows);
  });

  it('does not return raw rows that were archived but kept', async () => {
    await archive(db, T0 + MIN);
    const got = await between(db, T0, T0 + MIN);
    assert.equal(got.length, 3);
  });

  it('respects from/to at one-second resolution inside an archived minute', async () => {
    await archive(db, T0 + 3 * MIN);
    assert.deepEqual(approx(await between(db, T0 + 2000, T0 + 30_000)), [rows[1]]);
    assert.deepEqual(approx(await between(db, T0 + 1500, T0 + 30_001)), [rows[1], rows[2]]);
  });

  it('treats a null upper bound as open-ended', async () => {
    await archive(db, T0 + MIN);
    assert.deepEqual(approx(await between(db, T0 + MIN, null)), rows.slice(3));
  });

  it('filters to ok readings at or above min_db from both sources', async () => {
    await archive(db, T0 + 2 * MIN);
    assert.deepEqual(approx(await between(db, T0, null, 90)), [rows[2], rows[4]]);
  });
});

describe('get_day_blocks over the archive', () => {
  it('returns the same 10-minute blocks before and after archiving', async () => {
    const db = await freshDb();
    const data: Row[] = [];
    const statuses = ['ok', 'ok', 'ok', 'error', 'ok', 'ocr_fail', 'ok', 'error'];
    for (let i = 0; i < 1500; i++) {
      const status = statuses[i % statuses.length];
      data.push({ ts: T0 + i * 3000, raw_db: status === 'ok' ? 60 + (i % 400) / 10 : null, status });
    }
    await insert(db, data);

    const q = `select bucket_start, high_db, reading_count, dominant_status from get_day_blocks($1, $2)`;
    const before = (await db.query(q, [T0, T0 + 86_400_000])).rows;
    await archive(db, T0 + 50 * MIN);   // part archived, part raw
    const after = (await db.query(q, [T0, T0 + 86_400_000])).rows;

    assert.ok(before.length > 5);
    assert.deepEqual(after, before);
  });
});

describe('permissions', () => {
  it('does not let the public API roles run archive_readings', async () => {
    const db = await freshDb();
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select archive_readings(0, true)'), /permission denied/);
      await db.exec('reset role');
    }
  });

  it('lets the public API roles read through readings_between', async () => {
    const db = await freshDb();
    await insert(db, [{ ts: T0 + 1000, raw_db: 70, status: 'ok' }, { ts: T0 + MIN + 1000, raw_db: 71, status: 'ok' }]);
    await archive(db, T0 + MIN);
    await db.exec('set role anon');
    assert.equal((await between(db, T0, null)).length, 2);
    await db.exec('reset role');
  });
});

describe('readings_between query plan', () => {
  const PARAMS = [
    { name: 'p_from', type: 'bigint' },
    { name: 'p_to', type: 'bigint' },
    { name: 'p_min_db', type: 'real' },
  ];
  const archiveScans = (nodes: Awaited<ReturnType<typeof genericPlanOfFunction>>) =>
    nodes.filter(n => n['Relation Name'] === 'readings_archive');

  async function db2() {
    return freshDbWith(['20260929_readings_archive.sql', '20261001_readings_between_bounded_scan.sql']);
  }

  it('bounds the archive index scan on both ends, so old windows do not unpack later minutes', async () => {
    const db = await db2();
    const scans = archiveScans(await genericPlanOfFunction(db, 'readings_between', PARAMS, [T0, T0 + MIN, null]));
    assert.equal(scans.length, 1);
    // An index scan reports 'Index Cond'; a bitmap heap scan reports 'Recheck Cond'.
    const cond = scans[0]['Index Cond'] ?? scans[0]['Recheck Cond'] ?? '';
    assert.match(cond, /minute_ts >=/);
    assert.match(cond, /minute_ts </);
  });

  it('skips quiet minutes before unpacking them when min_db is set', async () => {
    const db = await db2();
    const scans = archiveScans(await genericPlanOfFunction(db, 'readings_between', PARAMS, [T0, null, 90]));
    assert.match(scans[0].Filter ?? '', /max_tenths/);
  });
});
