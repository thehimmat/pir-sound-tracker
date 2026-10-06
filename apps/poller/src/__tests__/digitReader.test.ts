import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { decodePngGrey, isCompletePng } from '../digits/pngGrey.js';
import { binariseRoi, segment, packGlyph, glyphDistance, DIGIT_ROI, type BinaryImage } from '../digits/glyphs.js';
import { buildModel, type DigitModel, type GlyphTemplate } from '../digits/train.js';
import { createDigitReader, type ReadResult } from '../digits/reader.js';
import { DIGIT_MODEL } from '../digits/digitModel.js';
import { fixture, fixtureGrey, fixtureModel, TRAIN, HELD_OUT, renderNumber, perturb, rng } from './digitHelpers.js';

const ALL_FIXTURES = [...TRAIN, ...HELD_OUT];
const reader = () => createDigitReader(fixtureModel());

function rejects(out: ReadResult, reason?: string) {
  assert.equal(out.ok, false, `expected reject, got ${JSON.stringify(out)}`);
  if (!out.ok && reason) assert.equal(out.reason, reason, JSON.stringify(out));
}
function reads(out: ReadResult, value: number, label = '') {
  assert.equal(out.ok, true, `${label}: ${JSON.stringify(out)}`);
  if (out.ok) assert.equal(out.value, value, label);
}

describe('decodePngGrey', () => {
  it('matches sharp greyscale byte for byte on real frames', async () => {
    for (const v of ALL_FIXTURES) {
      const buf = fixture(v);
      const ours = decodePngGrey(buf);
      const theirs = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
      assert.equal(ours.width, theirs.info.width);
      assert.equal(ours.height, theirs.info.height);
      assert.ok(Buffer.from(ours.data).equals(theirs.data), `${v}: pixels differ`);
    }
  });

  it('throws on truncated and non-PNG input', () => {
    assert.throws(() => decodePngGrey(fixture('corrupt-0')));
    assert.throws(() => decodePngGrey(fixture('corrupt-1')));
    assert.throws(() => decodePngGrey(Buffer.from('not a png')));
    assert.throws(() => decodePngGrey(Buffer.alloc(0)));
  });
});

describe('isCompletePng', () => {
  it('is true for whole frames and false for truncated ones', () => {
    assert.equal(isCompletePng(fixture('53.6')), true);
    assert.equal(isCompletePng(fixture('corrupt-0')), false);
    assert.equal(isCompletePng(fixture('53.6').subarray(0, 2771)), false);
    assert.equal(isCompletePng(Buffer.alloc(0)), false);
  });
});

describe('glyph segmentation and matching', () => {
  const blankBin = (w: number, h: number): BinaryImage => ({ data: new Uint8Array(w * h), width: w, height: h, left: 0, top: 0 });
  const rect = (bin: BinaryImage, x0: number, y0: number, x1: number, y1: number, v = 1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bin.data[y * bin.width + x] = v;
  };

  it('finds the four glyphs of 53.6 left to right, in frame coordinates', () => {
    const { glyphs, speckCount } = segment(binariseRoi(fixtureGrey('53.6'), DIGIT_ROI));
    assert.equal(speckCount, 0);
    assert.deepEqual(glyphs.map(g => [g.x0, g.x1]), [[33, 74], [84, 125], [140, 150], [164, 208]]);
    assert.equal(glyphs[2].w, 11); assert.equal(glyphs[2].h, 13); // the decimal point
  });

  it('drops specks below minArea and reports them', () => {
    const bin = blankBin(100, 50);
    rect(bin, 10, 10, 30, 40);
    rect(bin, 60, 5, 61, 6);
    const { glyphs, speckCount, speckArea } = segment(bin, { minArea: 20 });
    assert.equal(glyphs.length, 1);
    assert.equal(speckCount, 1);
    assert.equal(speckArea, 4);
  });

  it('merges pieces that overlap in x into one glyph', () => {
    const bin = blankBin(100, 50);
    rect(bin, 10, 5, 30, 20);
    rect(bin, 12, 25, 28, 45);
    rect(bin, 50, 5, 70, 45);
    const { glyphs } = segment(bin, { minArea: 20 });
    assert.equal(glyphs.length, 2);
    assert.deepEqual([glyphs[0].x0, glyphs[0].x1, glyphs[0].y0, glyphs[0].y1], [10, 30, 5, 45]);
  });

  it('a digit has distance 0 to itself in any position and a large distance to other digits', () => {
    const g = segment(binariseRoi(fixtureGrey('53.6'), DIGIT_ROI)).glyphs.map(packGlyph);
    const h = segment(binariseRoi(fixtureGrey('56.5'), DIGIT_ROI)).glyphs.map(packGlyph);
    assert.equal(glyphDistance(g[0], h[0]).dist, 0);  // '5' tens vs '5' tens
    assert.equal(glyphDistance(g[0], h[3]).dist, 0);  // '5' tens vs '5' tenths
    assert.ok(glyphDistance(g[1], g[3]).dist > 0.1);  // '3' vs '6'
  });

  it('ignores a 1-px change in stroke weight', () => {
    const a = blankBin(60, 80), b = blankBin(60, 80);
    rect(a, 10, 10, 40, 70); rect(a, 20, 20, 30, 60, 0);
    rect(b, 9, 9, 41, 71); rect(b, 21, 21, 29, 59, 0);
    const pa = packGlyph(segment(a, { minArea: 1 }).glyphs[0]);
    const pb = packGlyph(segment(b, { minArea: 1 }).glyphs[0]);
    assert.equal(glyphDistance(pa, pb).dist, 0);
  });
});

describe('buildModel', () => {
  it('learns one template per glyph 0-9 and "."', () => {
    const m = fixtureModel();
    assert.deepEqual(Object.keys(m.chars).sort(), ['.', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    for (const t of Object.values(m.chars)) {
      assert.equal(t.rows.length, t.h);
      assert.ok(t.rows.every(r => r.length === t.w));
    }
    assert.equal(m.stats.framesUsed, TRAIN.length);
  });

  it('skips frames whose glyph count does not match the label', () => {
    const m = buildModel([
      { grey: fixtureGrey('53.6'), label: '53.6' },
      { grey: fixtureGrey('72.9'), label: '172.9' },
    ]);
    assert.equal(m.stats.framesUsed, 1);
    assert.equal(m.stats.framesSkipped, 1);
  });

  it('survives a JSON round trip', () => {
    const r = createDigitReader(JSON.parse(JSON.stringify(fixtureModel())) as DigitModel);
    reads(r.readGrey(fixtureGrey('56.5')), 56.5);
  });
});

describe('createDigitReader on real frames', () => {
  it('reads every training fixture exactly', () => {
    const r = reader();
    for (const v of TRAIN) reads(r.readPng(fixture(v)), Number(v), v);
  });

  it('reads values never used for training, incl. 55.5 and 77.7 that Tesseract fails on', () => {
    const r = reader();
    for (const v of HELD_OUT) reads(r.readPng(fixture(v)), Number(v), v);
  });

  it('the shipped production model reads every fixture', () => {
    const r = createDigitReader(DIGIT_MODEL);
    for (const v of ALL_FIXTURES) reads(r.readPng(fixture(v)), Number(v), v);
  });

  it('rejects corrupt input as decode-error', () => {
    const r = reader();
    rejects(r.readPng(fixture('corrupt-0')), 'decode-error');
    rejects(r.readPng(Buffer.from('not a png')), 'decode-error');
  });

  it('rejects a blank screen, an all-dark screen and a frame of unexpected size', () => {
    const r = reader();
    const g = fixtureGrey('53.6');
    rejects(r.readGrey({ ...g, data: new Uint8Array(g.data.length).fill(229) }), 'no-glyphs');
    rejects(r.readGrey({ ...g, data: new Uint8Array(g.data.length) }));
    rejects(r.readGrey({ data: new Uint8Array(100 * 100).fill(229), width: 100, height: 100 }), 'unexpected-size');
  });
});

describe('createDigitReader on synthetic layouts (method, not real frames)', () => {
  it('reads a digit seen only in the tenths position in the tens position (96.3)', () => {
    reads(reader().readGrey(renderNumber(fixtureModel(), '96.3', { align: 'trained' })), 96.3);
  });

  it('reads centred 3-digit values', () => {
    const r = reader(), m = fixtureModel();
    for (const v of ['100.0', '102.3', '110.7', '119.9', '130.0', '99.9', '90.0']) {
      reads(r.readGrey(renderNumber(m, v, { align: 'centre' })), Number(v), v);
    }
  });

  it('reads through 1-2 px shifts, light noise and threshold variation', () => {
    const r = reader(), m = fixtureModel(), rand = rng(7);
    for (const [sx, sy] of [[-2, -2], [2, 2], [-1, 2], [2, -1]]) {
      reads(r.readGrey(renderNumber(m, '104.8', { shiftX: sx, shiftY: sy })), 104.8, `${sx},${sy}`);
    }
    for (const [noise, bias] of [[0.003, 0], [0, 30], [0, -30], [0.002, 20]]) {
      const g = perturb(renderNumber(m, '123.4'), { noise, blur: bias !== 0, bias, rand });
      reads(r.readGrey(g), 123.4, `noise=${noise} bias=${bias}`);
    }
  });

  it('rejects a glyph clipped by the screen edge', () => {
    rejects(reader().readGrey(renderNumber(fixtureModel(), '102.3', { align: 'trained' })), 'clipped-glyph');
  });

  it('rejects malformed numbers and implausible values', () => {
    const r = reader(), m = fixtureModel();
    rejects(r.readGrey(renderNumber(m, '536')), 'bad-format');
    rejects(r.readGrey(renderNumber(m, '5.3.6')), 'bad-format');
    rejects(r.readGrey(renderNumber(m, '05.3', { align: 'trained' })), 'bad-format');
    rejects(r.readGrey(renderNumber(m, '9.5')), 'out-of-range');
    rejects(r.readGrey(renderNumber(m, '199.5')), 'out-of-range');
  });

  it('rejects a raised decimal point and a gap where a digit is missing', () => {
    const m = fixtureModel();
    rejects(reader().readGrey(renderNumber(m, '53.6', { align: 'trained', raiseDot: 25 })), 'bad-layout');
    rejects(reader().readGrey(renderNumber(m, '10.5', { gapAfter: { 0: 52 } })), 'bad-layout');
  });

  it('rejects an unfamiliar glyph instead of forcing it to the nearest template', () => {
    const m = fixtureModel();
    const five = m.chars['5'];
    const flip = (t: GlyphTemplate): GlyphTemplate => ({ ...t, rows: t.rows.map(r => [...r].reverse().join('')) });
    const erase = (t: GlyphTemplate): GlyphTemplate => ({ ...t, rows: t.rows.map(r => r.slice(0, Math.round(r.length * 0.65)).padEnd(r.length, '.')) });
    const block: GlyphTemplate = { ...five, w: 40, h: 70, bearing: 0, rows: Array.from({ length: 70 }, () => '#'.repeat(40)) };
    for (const [name, glyph] of Object.entries({ mirrored7: flip(m.chars['7']), halfErased5: erase(five), block })) {
      const out = reader().readGrey(renderNumber(m, '5?.3', { align: 'trained', glyphs: { '?': { ...glyph, top: five.top, bearing: 0 } } }));
      rejects(out, 'unknown-glyph');
      assert.ok(!out.ok && out.detail, name);
    }
  });

  it('rejects a glyph that matches two templates equally', () => {
    const m = structuredClone(fixtureModel());
    m.chars['3'] = structuredClone(m.chars['8']);
    rejects(createDigitReader(m).readGrey(renderNumber(fixtureModel(), '58.6', { align: 'trained' })), 'ambiguous-glyph');
  });

  it('rejects, never misreads, a digit absent from training', () => {
    const m = buildModel(TRAIN.filter(v => v !== '74.1').map(v => ({ grey: fixtureGrey(v), label: v })));
    assert.equal(m.chars['4'], undefined);
    const r = createDigitReader(m);
    rejects(r.readPng(fixture('74.1')), 'unknown-glyph');
    rejects(r.readGrey(renderNumber(fixtureModel(), '104.2')), 'unknown-glyph');
  });
});
