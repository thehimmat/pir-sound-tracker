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

// Stale detection is tested against the real module in staleDetector.test.ts.
