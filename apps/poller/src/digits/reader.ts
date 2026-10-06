import { decodePngGrey, type GreyImage } from './pngGrey.js';
import { binariseRoi, segment, makeClassifier, type Glyph } from './glyphs.js';
import type { DigitModel } from './train.js';

// Template-matching reader for the XL2's big LAFmax number.
//
// Rejects instead of guessing: a glyph farther than maxDist from every
// template, or within minMargin of a second template, rejects the whole frame,
// as does any reading that breaks the learned layout. A rejected frame falls
// back to Tesseract (see meterReader.ts).

export const READER_DEFAULTS = Object.freeze({
  // Thresholds from 1,754 labelled frames: identical digits are pixel-identical
  // (distance 0, at most 0.006 under synthetic shifts and noise); the closest
  // pair of different digits (6 vs 8) is 0.14 apart.
  maxDist: 0.05,
  minMargin: 0.05,
  maxShift: 3,          // alignment search window, px
  sizeTol: 6,           // template candidate if w and h within this, px
  maxSpeckArea: 300,    // total ink in dropped specks before the frame counts as noisy
  maxInkFraction: 0.5,  // more ink than this is not a reading screen
  maxGlyphs: 6,
  layoutTol: 4,         // px slack on learned advances and baseline offsets
  minValue: 20,
  maxValue: 140,
});

export type RejectReason =
  | 'decode-error' | 'unexpected-size' | 'not-a-reading' | 'noisy' | 'no-glyphs' | 'too-many-glyphs'
  | 'clipped-glyph' | 'unknown-glyph' | 'ambiguous-glyph' | 'bad-format' | 'bad-layout' | 'out-of-range';

export type ReadResult =
  | { ok: true; value: number; text: string; confidence: number }
  | { ok: false; reason: RejectReason; detail?: string };

const FORMAT = /^[1-9]\d{0,2}\.\d$/;
const reject = (reason: RejectReason, detail?: string): ReadResult => ({ ok: false, reason, detail });

export function createDigitReader(model: DigitModel, options: Partial<typeof READER_DEFAULTS> = {}) {
  const o = { ...READER_DEFAULTS, ...options };
  const classify = makeClassifier(model.chars, { sizeTol: o.sizeTol, maxShift: o.maxShift, capDist: o.maxDist + o.minMargin });
  const { layout } = model;
  const roiPx = model.roi.width * model.roi.height;
  const work = { lab: new Int32Array(roiPx), stack: new Int32Array(roiPx) };

  function checkLayout(glyphs: Glyph[], text: string): string | null {
    const bottoms = glyphs.filter((_, i) => text[i] !== '.').map(g => g.y1);
    const base = [...bottoms].sort((a, b) => a - b)[bottoms.length >> 1];
    if (Math.max(...bottoms) - Math.min(...bottoms) > layout.digitBottomSpread + o.layoutTol) return 'digit baselines differ';
    const off = glyphs[text.indexOf('.')].y1 - base;
    if (off < layout.dotBottom[0] - o.layoutTol || off > layout.dotBottom[1] + o.layoutTol) return `decimal point ${off} px from baseline`;
    for (let i = 1; i < glyphs.length; i++) {
      const k = (text[i - 1] === '.' ? 'p' : 'd') + (text[i] === '.' ? 'p' : 'd');
      const range = layout.delta[k];
      const d = (glyphs[i].x0 + glyphs[i].x1) / 2 - (glyphs[i - 1].x0 + glyphs[i - 1].x1) / 2;
      if (!range || d < range[0] - o.layoutTol || d > range[1] + o.layoutTol) return `advance ${d} px between glyphs ${i - 1} and ${i} (${k})`;
    }
    return null;
  }

  function readGrey(grey: GreyImage): ReadResult {
    if (grey.width !== model.frame.width || grey.height !== model.frame.height) {
      return reject('unexpected-size', `${grey.width}x${grey.height}`);
    }
    const bin = binariseRoi(grey, model.roi, model.threshold);
    let ink = 0;
    for (let i = 0; i < bin.data.length; i++) ink += bin.data[i];
    if (ink > o.maxInkFraction * bin.data.length) return reject('not-a-reading', `ink fraction ${(ink / bin.data.length).toFixed(2)}`);
    const { glyphs, speckArea } = segment(bin, { minArea: model.minArea, work });
    if (speckArea > o.maxSpeckArea) return reject('noisy', `${speckArea} px of specks`);
    if (!glyphs.length) return reject('no-glyphs');
    if (glyphs.length > o.maxGlyphs) return reject('too-many-glyphs', `${glyphs.length}`);
    if (glyphs.some(g => g.touchesBorder)) return reject('clipped-glyph');

    const matches = glyphs.map(classify);
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (!(m.dist <= o.maxDist)) {
        return reject('unknown-glyph', `glyph ${i} (${glyphs[i].w}x${glyphs[i].h}): ` + (m.char ? `nearest '${m.char}' at ${m.dist.toFixed(3)}` : 'no template close'));
      }
      if (m.secondDist - m.dist < o.minMargin) {
        return reject('ambiguous-glyph', `glyph ${i}: '${m.char}' ${m.dist.toFixed(3)} vs '${m.second}' ${m.secondDist.toFixed(3)}`);
      }
    }
    const text = matches.map(m => m.char).join('');
    if (!FORMAT.test(text)) return reject('bad-format', text);
    const bad = checkLayout(glyphs, text);
    if (bad) return reject('bad-layout', `${text}: ${bad}`);
    const value = Number(text);
    if (value < o.minValue || value > o.maxValue) return reject('out-of-range', text);
    return { ok: true, value, text, confidence: Math.min(...matches.map(m => 1 - m.dist / o.maxDist)) };
  }

  function readPng(buf: Buffer): ReadResult {
    let grey: GreyImage;
    try { grey = decodePngGrey(buf); } catch (e) { return reject('decode-error', e instanceof Error ? e.message : String(e)); }
    return readGrey(grey);
  }

  return { readPng, readGrey };
}

export type DigitReader = ReturnType<typeof createDigitReader>;
