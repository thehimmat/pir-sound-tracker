import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RAW_WINDOW_DAYS, mayBeArchived } from '@pir/types';

// The web app uses mayBeArchived() to warn that older days take longer to
// load. It must agree with the nightly archive job, which keeps 7 days raw
// (supabase/migrations/20260930_readings_nightly_archive.sql).

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

describe('mayBeArchived', () => {
  it('matches the 7-day raw window kept by the nightly job', () => {
    assert.equal(RAW_WINDOW_DAYS, 7);
  });

  it('is false for anything inside the raw window', () => {
    assert.equal(mayBeArchived(NOW, NOW), false);
    assert.equal(mayBeArchived(NOW - 3 * DAY, NOW), false);
    assert.equal(mayBeArchived(NOW - 7 * DAY + 1, NOW), false);
  });

  it('is true once a range starts more than 7 days ago', () => {
    assert.equal(mayBeArchived(NOW - 7 * DAY - 1, NOW), true);
    assert.equal(mayBeArchived(NOW - 120 * DAY, NOW), true);
  });

  it('defaults to the current time', () => {
    assert.equal(mayBeArchived(Date.now() - 30 * DAY), true);
    assert.equal(mayBeArchived(Date.now()), false);
  });
});
