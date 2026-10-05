import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LatestFrame, msUntilNextTick, startFetchClock, type FetchResult } from '../frameFeed.js';

const frame = (ts: number): FetchResult => ({ ts, fetchMs: 100, buf: Buffer.from([ts % 256]) });
const failed = (ts: number): FetchResult => ({ ts, fetchMs: 100, error: 'HTTP 503' });

describe('LatestFrame', () => {
  it('hands over a frame that was offered before next() was called', async () => {
    const slot = new LatestFrame();
    slot.offer(frame(1_000));
    assert.equal((await slot.next()).ts, 1_000);
  });

  it('resolves a waiting next() when a frame arrives', async () => {
    const slot = new LatestFrame();
    const pending = slot.next();
    slot.offer(frame(1_000));
    assert.equal((await pending).ts, 1_000);
  });

  it('gives the newest frame when processing fell behind, and counts the ones skipped', async () => {
    const slot = new LatestFrame();
    slot.offer(frame(1_000));
    slot.offer(frame(2_000));
    slot.offer(frame(3_000));
    assert.equal((await slot.next()).ts, 3_000);
    assert.equal(slot.skipped, 2);
  });

  it('ignores a slow fetch that finishes after a newer one', async () => {
    const slot = new LatestFrame();
    slot.offer(frame(2_000));
    slot.offer(frame(1_000)); // started earlier, finished later
    assert.equal((await slot.next()).ts, 2_000);
    assert.equal(slot.skipped, 1);
  });

  it('ignores a late fetch older than a frame already handed over', async () => {
    const slot = new LatestFrame();
    slot.offer(frame(2_000));
    await slot.next();
    slot.offer(frame(1_000));
    slot.offer(frame(3_000));
    assert.equal((await slot.next()).ts, 3_000);
  });

  it('passes failed fetches through so the second is still recorded', async () => {
    const slot = new LatestFrame();
    slot.offer(failed(1_000));
    const r = await slot.next();
    assert.equal(r.ts, 1_000);
    assert.equal(r.error, 'HTTP 503');
  });
});

describe('msUntilNextTick', () => {
  it('waits until the next whole second', () => {
    assert.equal(msUntilNextTick(10_250, 1_000), 750);
  });

  it('waits a full interval when exactly on a tick', () => {
    assert.equal(msUntilNextTick(10_000, 1_000), 1_000);
  });
});

describe('startFetchClock', () => {
  afterEach(() => mock.timers.reset());

  function setup(opts: { maxInFlight?: number } = {}) {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10_000 });
    const results: FetchResult[] = [];
    const releases: Array<(buf: Buffer) => void> = [];
    let started = 0;
    const clock = startFetchClock({
      intervalMs: 1_000,
      maxInFlight: opts.maxInFlight ?? 3,
      fetchFrame: () => { started++; return new Promise<Buffer>(r => releases.push(r)); },
      onResult: r => results.push(r),
    });
    return { clock, results, releases, started: () => started };
  }

  // Lets resolved fetch promises run their .then handlers.
  const settle = () => new Promise<void>(r => setImmediate(r));

  it('starts a fetch on every whole second, without waiting for the last one', () => {
    const t = setup();
    assert.equal(t.started(), 1);              // first fetch right away
    mock.timers.tick(1_000);
    mock.timers.tick(1_000);
    assert.equal(t.started(), 3);
    t.clock.stop();
  });

  it('stamps each result with the second its fetch started', async () => {
    const t = setup();
    mock.timers.tick(1_000);                   // second fetch at 11_000
    t.releases[1](Buffer.from([1]));
    t.releases[0](Buffer.from([0]));
    await settle();
    assert.deepEqual(t.results.map(r => r.ts), [11_000, 10_000]);
    t.clock.stop();
  });

  it('reports a failed fetch as an error result', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10_000 });
    const results: FetchResult[] = [];
    const clock = startFetchClock({
      intervalMs: 1_000,
      maxInFlight: 3,
      fetchFrame: () => Promise.reject(new Error('HTTP 503')),
      onResult: r => results.push(r),
    });
    await settle();
    assert.equal(results.length, 1);
    assert.equal(results[0].ts, 10_000);
    assert.equal(results[0].error, 'HTTP 503');
    assert.equal(results[0].buf, undefined);
    clock.stop();
  });

  it('skips a tick when maxInFlight fetches are still running', () => {
    const t = setup({ maxInFlight: 2 });
    mock.timers.tick(1_000);                   // 2 in flight
    mock.timers.tick(1_000);                   // skipped
    assert.equal(t.started(), 2);
    assert.equal(t.clock.skippedTicks, 1);
    t.clock.stop();
  });

  it('stops starting fetches after stop()', () => {
    const t = setup();
    t.clock.stop();
    mock.timers.tick(5_000);
    assert.equal(t.started(), 1);
  });
});
