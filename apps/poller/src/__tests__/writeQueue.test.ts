import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WriteQueue, flushDelayMs, type QueuedReading } from '../writeQueue.js';

function row(ts: number): QueuedReading {
  return { ts, raw_db: 50 + ts / 10, status: 'ok' };
}

// insertBatch stub: records every batch it receives and fails while `failing` is set.
function fakeDb() {
  const state = {
    failing: false,
    batches: [] as QueuedReading[][],
    insertBatch: async (rows: QueuedReading[]) => {
      if (state.failing) throw new Error('db down');
      state.batches.push(rows);
    },
  };
  return state;
}

const tsOf = (rows: QueuedReading[]) => rows.map(r => r.ts);

describe('WriteQueue', () => {
  it('sends queued readings in order and empties the queue', async () => {
    const db = fakeDb();
    const q = new WriteQueue({ insertBatch: db.insertBatch });
    q.enqueue(row(1)); q.enqueue(row(2)); q.enqueue(row(3));

    assert.equal(await q.flush(), true);
    assert.deepEqual(db.batches.map(tsOf), [[1, 2, 3]]);
    assert.equal(q.size, 0);
  });

  it('reports success without calling the database when empty', async () => {
    const db = fakeDb();
    const q = new WriteQueue({ insertBatch: db.insertBatch });

    assert.equal(await q.flush(), true);
    assert.equal(db.batches.length, 0);
  });

  it('keeps readings after a failed write and sends them before newer ones', async () => {
    const db = fakeDb();
    const q = new WriteQueue({ insertBatch: db.insertBatch });
    q.enqueue(row(1)); q.enqueue(row(2));

    db.failing = true;
    assert.equal(await q.flush(), false);
    assert.equal(q.size, 2);

    q.enqueue(row(3));
    db.failing = false;
    assert.equal(await q.flush(), true);
    assert.deepEqual(db.batches.map(tsOf), [[1, 2, 3]]);
    assert.equal(q.size, 0);
  });

  it('sends at most batchSize readings per flush, oldest first', async () => {
    const db = fakeDb();
    const q = new WriteQueue({ insertBatch: db.insertBatch, batchSize: 2 });
    for (let ts = 1; ts <= 5; ts++) q.enqueue(row(ts));

    await q.flush();
    assert.deepEqual(db.batches.map(tsOf), [[1, 2]]);
    assert.equal(q.size, 3);
  });

  it('drops the oldest readings past maxRows and counts them', () => {
    const q = new WriteQueue({ insertBatch: fakeDb().insertBatch, maxRows: 3 });
    for (let ts = 1; ts <= 5; ts++) q.enqueue(row(ts));

    assert.equal(q.size, 3);
    assert.equal(q.dropped, 2);
  });

  it('keeps the newest readings when a failed batch goes back over the cap', async () => {
    const db = fakeDb();
    const q = new WriteQueue({ insertBatch: db.insertBatch, maxRows: 3 });
    q.enqueue(row(1)); q.enqueue(row(2));

    db.failing = true;
    const pending = q.flush();           // rows 1 and 2 are in flight
    q.enqueue(row(3)); q.enqueue(row(4)); // arrive during the failing write
    await pending;

    assert.equal(q.size, 3);
    assert.equal(q.dropped, 1);
    db.failing = false;
    await q.flush();
    assert.deepEqual(db.batches.map(tsOf), [[2, 3, 4]]);
  });

  it('does not send the same readings twice when flushes overlap', async () => {
    let release!: () => void;
    const batches: number[][] = [];
    const q = new WriteQueue({
      insertBatch: rows => {
        batches.push(tsOf(rows));
        return new Promise<void>(r => { release = r; });
      },
    });
    q.enqueue(row(1));

    const first = q.flush();
    const second = await q.flush(); // first is still in flight
    release();
    await first;

    assert.equal(second, false);
    assert.deepEqual(batches, [[1]]);
  });
});

describe('flushDelayMs', () => {
  it('uses the base delay while writes succeed', () => {
    assert.equal(flushDelayMs(0), 1_000);
  });

  it('doubles after each consecutive failure', () => {
    assert.deepEqual([1, 2, 3].map(n => flushDelayMs(n)), [2_000, 4_000, 8_000]);
  });

  it('caps the backoff at 30 seconds', () => {
    assert.equal(flushDelayMs(10), 30_000);
    assert.equal(flushDelayMs(1_000), 30_000);
  });
});
