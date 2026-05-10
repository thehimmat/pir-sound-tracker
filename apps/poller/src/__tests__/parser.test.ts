import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDbReading } from '../parser.js';

describe('parseDbReading', () => {
  it('parses a clean float string', () => {
    assert.equal(parseDbReading('72.3'), 72.3);
  });

  it('parses when surrounded by noise', () => {
    assert.equal(parseDbReading('  dB  88.5  \n'), 88.5);
  });

  it('parses integer read as float', () => {
    assert.equal(parseDbReading('105'), 105.0);
  });

  it('returns null for empty string', () => {
    assert.equal(parseDbReading(''), null);
  });

  it('returns null for out-of-range low value', () => {
    assert.equal(parseDbReading('10.0'), null);
  });

  it('returns null for out-of-range high value', () => {
    assert.equal(parseDbReading('200.0'), null);
  });

  it('returns null for non-numeric OCR garbage', () => {
    assert.equal(parseDbReading('??!!'), null);
  });

  it('handles OCR artefacts like leading/trailing dots', () => {
    // '88.5.' — the second token '.' should be skipped, first valid wins
    assert.equal(parseDbReading('88.5.'), 88.5);
  });

  it('returns first valid number in multi-token output', () => {
    assert.equal(parseDbReading('LAFmax 95.2 dB'), 95.2);
  });

  it('respects minimum boundary exactly', () => {
    assert.equal(parseDbReading('20.0'), 20.0);
  });

  it('respects maximum boundary exactly', () => {
    assert.equal(parseDbReading('150.0'), 150.0);
  });
});
