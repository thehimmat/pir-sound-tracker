import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit-tests for inoperational detection logic extracted from the poller.
 * These test the decision logic in isolation without spawning the full poller.
 */

// --- Brightness check ---
const BLANK_THRESHOLD = 240;

function isBlank(avgBrightness: number): boolean {
  return avgBrightness > BLANK_THRESHOLD;
}

describe('blank detection', () => {
  it('flags near-white image as blank', () => {
    assert.ok(isBlank(245));
  });

  it('does not flag a normal image', () => {
    assert.ok(!isBlank(128));
  });

  it('boundary: 240 is NOT blank', () => {
    assert.ok(!isBlank(240));
  });

  it('boundary: 241 IS blank', () => {
    assert.ok(isBlank(241));
  });
});

// --- Stale detection ---
const STALE_AFTER_MS = 10_000;

interface StaleState {
  prevHash: string | null;
  staleFirstTs: number | null;
}

function checkStale(
  state: StaleState,
  currentHash: string,
  now: number,
): { isStale: boolean; state: StaleState } {
  if (currentHash !== state.prevHash) {
    return { isStale: false, state: { prevHash: currentHash, staleFirstTs: null } };
  }
  const firstTs = state.staleFirstTs ?? now;
  const isStale = (now - firstTs) > STALE_AFTER_MS;
  return { isStale, state: { prevHash: currentHash, staleFirstTs: firstTs } };
}

describe('stale detection', () => {
  it('not stale when hash changes each tick', () => {
    let state: StaleState = { prevHash: null, staleFirstTs: null };
    const now = 1000;
    ({ state } = checkStale(state, 'abc', now));
    const { isStale } = checkStale(state, 'def', now + 1000);
    assert.ok(!isStale);
  });

  it('not stale immediately after repeat hash', () => {
    let state: StaleState = { prevHash: 'abc', staleFirstTs: null };
    const now = 1000;
    const { isStale } = checkStale(state, 'abc', now);
    assert.ok(!isStale);
  });

  it('becomes stale after >10s of same hash', () => {
    let state: StaleState = { prevHash: 'abc', staleFirstTs: 0 };
    const { isStale } = checkStale(state, 'abc', 11_000);
    assert.ok(isStale);
  });

  it('resets stale when hash changes mid-stream', () => {
    let state: StaleState = { prevHash: 'abc', staleFirstTs: 0 };
    // Still stale...
    ({ state } = checkStale(state, 'abc', 11_000));
    // But now a new hash arrives
    const { isStale } = checkStale(state, 'xyz', 12_000);
    assert.ok(!isStale);
  });
});
