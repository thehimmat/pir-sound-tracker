import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePngGrey, type GreyImage } from '../digits/pngGrey.js';
import { buildModel, type DigitModel, type GlyphTemplate } from '../digits/train.js';

// Real PIR frames, named by their LAFmax reading. Tests run from dist/__tests__.
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/digits');

export const fixture = (name: string): Buffer => readFileSync(`${FIXTURES}/${name}.png`);
export const fixtureGrey = (name: string): GreyImage => decodePngGrey(fixture(name));

// Training fixtures cover every digit 0-9 at least once.
export const TRAIN = ['53.6', '72.9', '60.1', '86.9', '74.1'];
// Values never used for training.
export const HELD_OUT = ['56.5', '55.5', '77.7', '71.1'];

let cached: DigitModel | undefined;
export function fixtureModel(): DigitModel {
  cached ??= buildModel(TRAIN.map(v => ({ grey: fixtureGrey(v), label: v })));
  return cached;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Synthetic frames composed from real glyph templates. TEST INFRASTRUCTURE ONLY:
// it exercises the reader on layouts no real frame has shown yet (90+ dB,
// 3 digits); it says nothing about what the meter really draws for those.
const BG = 229, INK = 0;

type ExtraGlyph = GlyphTemplate;
interface RenderOptions {
  /** 'trained': the decimal point sits where it does in real 2-digit frames
   *  (a 3-digit number runs off the left edge). 'centre': ink centred on screen. */
  align?: 'trained' | 'centre';
  shiftX?: number;
  shiftY?: number;
  glyphs?: Record<string, ExtraGlyph>;
  gapAfter?: Record<number, number>;
  raiseDot?: number;
}

export function renderNumber(model: DigitModel, text: string, opts: RenderOptions = {}): GreyImage {
  const { align = 'centre', shiftX = 0, shiftY = 0, glyphs = {}, gapAfter = {}, raiseDot = 0 } = opts;
  const { width: W, height: H } = model.frame;
  const [c0, c1, cp, c3] = model.layout.cells;
  const adv: Record<string, number> = { dd: c1 - c0, dp: cp - c1, pd: c3 - cp, pp: cp - c1 };
  const kind = (ch: string) => (ch === '.' ? 'p' : 'd');
  const chars = [...text].map(ch => glyphs[ch] ?? model.chars[ch]);
  if (chars.some(c => !c)) throw new Error(`no template for a char in ${text}`);
  const centres = [0];
  for (let i = 1; i < text.length; i++) centres.push(centres[i - 1] + adv[kind(text[i - 1]) + kind(text[i])] + (gapAfter[i - 1] ?? 0));
  const x0s = chars.map((t, i) => centres[i] + t.bearing - (t.w - 1) / 2);
  let off: number;
  if (align === 'trained') {
    const p = text.indexOf('.');
    off = p >= 0 ? cp - centres[p] : c3 - centres[text.length - 1];
  } else {
    const lo = Math.min(...x0s), hi = Math.max(...x0s.map((x, i) => x + chars[i].w - 1));
    off = (W - 1) / 2 - (lo + hi) / 2;
  }
  const data = new Uint8Array(W * H).fill(BG);
  chars.forEach((t, i) => {
    const gx = Math.round(x0s[i] + off) + shiftX;
    const gy = t.top + shiftY - (text[i] === '.' ? raiseDot : 0);
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const X = gx + x, Y = gy + y;
      if (t.rows[y][x] === '#' && X >= 0 && X < W && Y >= 0 && Y < H) data[Y * W + X] = INK;
    }
  });
  return { data, width: W, height: H };
}

/** 3x3 blur (edges get grey levels), brightness bias (+ thins strokes,
 *  - thickens them), then salt-and-pepper flips, inside the digit band. */
export function perturb(grey: GreyImage, { noise = 0, blur = false, bias = 0, rand = Math.random } = {}): GreyImage {
  const { width: W } = grey, src = grey.data, out = Uint8Array.from(src);
  const top = 140, height = 102;
  if (blur) {
    for (let y = top; y < top + height; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || X >= W || Y < 0 || Y >= grey.height) continue;
        s += src[Y * W + X]; n++;
      }
      out[y * W + x] = Math.round(s / n);
    }
  }
  for (let y = top; y < top + height; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (bias) out[i] = Math.max(0, Math.min(255, out[i] + bias));
    if (noise && rand() < noise) out[i] = out[i] < 140 ? BG : INK;
  }
  return { data: out, width: W, height: grey.height };
}
