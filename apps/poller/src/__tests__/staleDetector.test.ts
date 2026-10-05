import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StaleDetector } from '../staleDetector.js';

describe('StaleDetector', () => {
  it('is not stale while the frame changes every second', () => {
    const d = new StaleDetector(30_000);
    for (let s = 0; s < 120; s++) {
      assert.equal(d.check(`frame-${s}`, s * 1_000), false);
    }
  });

  it('is not stale the moment a frame repeats', () => {
    const d = new StaleDetector(30_000);
    d.check('a', 0);
    assert.equal(d.check('a', 1_000), false);
  });

  it('stays ok through 30 s of identical frames (a quiet night)', () => {
    const d = new StaleDetector(30_000);
    for (let s = 0; s <= 30; s++) {
      assert.equal(d.check('a', s * 1_000), false, `second ${s}`);
    }
  });

  it('turns stale once identical frames run past 30 s', () => {
    const d = new StaleDetector(30_000);
    for (let s = 0; s <= 30; s++) d.check('a', s * 1_000);
    assert.equal(d.check('a', 31_000), true);
    assert.equal(d.check('a', 45_000), true);
  });

  it('measures from the first time the frame was seen, not the first repeat', () => {
    const d = new StaleDetector(30_000);
    d.check('a', 0);
    d.check('a', 20_000);
    assert.equal(d.check('a', 30_001), true);
  });

  it('recovers as soon as a new frame arrives', () => {
    const d = new StaleDetector(30_000);
    for (let s = 0; s <= 40; s++) d.check('a', s * 1_000);
    assert.equal(d.check('b', 41_000), false);
    assert.equal(d.check('b', 42_000), false);
  });

  it('starts a fresh 30 s window after recovering', () => {
    const d = new StaleDetector(30_000);
    for (let s = 0; s <= 40; s++) d.check('a', s * 1_000);
    d.check('b', 41_000);
    assert.equal(d.check('a', 42_000), false);
    assert.equal(d.check('a', 72_000), false);
    assert.equal(d.check('a', 72_001), true);
  });
});
