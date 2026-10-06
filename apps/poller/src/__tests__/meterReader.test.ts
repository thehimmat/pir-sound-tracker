import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readValue, meanBrightness, fetchCompleteFrame } from '../meterReader.js';
import { createDigitReader } from '../digits/reader.js';
import { DIGIT_MODEL } from '../digits/digitModel.js';
import { fixture, fixtureGrey, renderNumber } from './digitHelpers.js';

const reader = createDigitReader(DIGIT_MODEL);

describe('meanBrightness', () => {
  it('averages every pixel', () => {
    assert.equal(meanBrightness({ data: new Uint8Array([0, 255, 255, 250]), width: 2, height: 2 }), 190);
  });

  it('puts a normal frame well below the 240 blank threshold', () => {
    const b = meanBrightness(fixtureGrey('53.6'));
    assert.ok(b > 120 && b < 200, `brightness=${b}`);
  });
});

describe('readValue', () => {
  it('uses the template reader and never calls Tesseract when it succeeds', async () => {
    let calls = 0;
    const r = await readValue(fixtureGrey('55.5'), fixture('55.5'), { reader, fallback: async () => { calls++; return 0; } });
    assert.deepEqual(r, { raw_db: 55.5, via: 'template' });
    assert.equal(calls, 0);
  });

  it('falls back to Tesseract when the template reader rejects, and keeps the reason', async () => {
    const grey = renderNumber(DIGIT_MODEL, '102.3', { align: 'trained' }); // clipped: template rejects
    const r = await readValue(grey, Buffer.alloc(0), { reader, fallback: async () => 102.3 });
    assert.deepEqual(r, { raw_db: 102.3, via: 'tesseract', rejectReason: 'clipped-glyph' });
  });

  it('reports no value when both readers fail', async () => {
    const grey = renderNumber(DIGIT_MODEL, '102.3', { align: 'trained' });
    const r = await readValue(grey, Buffer.alloc(0), { reader, fallback: async () => null });
    assert.deepEqual(r, { raw_db: null, via: 'none', rejectReason: 'clipped-glyph' });
  });

  it('treats a fallback error as no value', async () => {
    const grey = renderNumber(DIGIT_MODEL, '102.3', { align: 'trained' });
    const r = await readValue(grey, Buffer.alloc(0), { reader, fallback: async () => { throw new Error('tesseract exited 1'); } });
    assert.equal(r.raw_db, null);
    assert.equal(r.via, 'none');
  });
});

describe('fetchCompleteFrame', () => {
  it('returns the first frame when it is complete', async () => {
    let calls = 0;
    const r = await fetchCompleteFrame(async () => { calls++; return fixture('53.6'); });
    assert.equal(calls, 1);
    assert.equal(r.refetched, false);
    assert.ok(r.buf.equals(fixture('53.6')));
  });

  it('fetches again once when the first frame is truncated', async () => {
    const frames = [fixture('corrupt-0'), fixture('53.6')];
    const r = await fetchCompleteFrame(async () => frames.shift()!);
    assert.equal(r.refetched, true);
    assert.ok(r.buf.equals(fixture('53.6')));
  });

  it('returns the second frame even if it is also truncated (decoding will reject it)', async () => {
    let calls = 0;
    const r = await fetchCompleteFrame(async () => { calls++; return fixture('corrupt-0'); });
    assert.equal(calls, 2);
    assert.equal(r.refetched, true);
  });
});
