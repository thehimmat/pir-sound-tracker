import type { GreyImage } from './pngGrey.js';
import { DIGIT_ROI, binariseRoi, segment, type Roi } from './glyphs.js';

// Learns one template per glyph (0-9 and '.') plus simple layout statistics
// from labelled frames. A glyph learned in one position is used in every
// position, so a digit seen only as a tenths digit is still read as a tens
// digit.

export interface GlyphTemplate {
  w: number;
  h: number;
  /** Median y of the glyph's top edge in the frame. */
  top: number;
  /** Glyph centre minus its cell centre in the 2-digit layout. */
  bearing: number;
  samples: number;
  variants: number;
  /** '#' = ink, '.' = background. */
  rows: string[];
}

export interface DigitModel {
  version: 1;
  frame: { width: number; height: number };
  roi: Roi;
  threshold: number;
  minArea: number;
  chars: Record<string, GlyphTemplate>;
  layout: {
    pitch: number;
    /** Range of centre-to-centre advances: d = digit, p = point. */
    delta: Record<string, [number, number]>;
    digitBottomSpread: number;
    dotBottom: [number, number];
    cells: number[];
  };
  stats: { framesUsed: number; framesSkipped: number };
}

export interface TrainingSample { grey: GreyImage; label: string }

const median = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const kindOf = (ch: string) => (ch === '.' ? 'p' : 'd');

/** A frame is used only if it segments into exactly label.length unclipped glyphs. */
export function buildModel(samples: TrainingSample[], { roi = DIGIT_ROI, threshold = 140, minArea = 20 } = {}): DigitModel {
  const byChar = new Map<string, Map<string, { count: number; w: number; h: number; rows: string[] }>>();
  const delta: Record<string, [number, number]> = {};
  const cellObs: number[][] = [[], [], [], []];
  const bearingObs = new Map<string, number[]>(), topObs = new Map<string, number[]>();
  let digitBottomSpread = 0;
  let dotBottom: [number, number] = [Infinity, -Infinity];
  let framesUsed = 0, framesSkipped = 0;
  let frame: { width: number; height: number } | null = null;

  const segs = samples.map(s => segment(binariseRoi(s.grey, roi, threshold), { minArea }).glyphs);
  samples.forEach(({ grey, label }, n) => {
    const glyphs = segs[n];
    if (glyphs.length !== label.length || glyphs.some(g => g.touchesBorder)) { framesSkipped++; return; }
    framesUsed++;
    frame ??= { width: grey.width, height: grey.height };
    const cx = glyphs.map(g => (g.x0 + g.x1) / 2);
    glyphs.forEach((g, i) => {
      const ch = label[i];
      const rows = Array.from({ length: g.h }, (_, y) => Array.from(g.mask.subarray(y * g.w, (y + 1) * g.w), v => (v ? '#' : '.')).join(''));
      const key = rows.join('/');
      if (!byChar.has(ch)) byChar.set(ch, new Map());
      const m = byChar.get(ch)!;
      const e = m.get(key) ?? { count: 0, w: g.w, h: g.h, rows };
      e.count++; m.set(key, e);
      if (!topObs.has(ch)) topObs.set(ch, []);
      topObs.get(ch)!.push(g.y0);
      if (i > 0) {
        const k = kindOf(label[i - 1]) + kindOf(ch), d = cx[i] - cx[i - 1];
        delta[k] ??= [Infinity, -Infinity];
        delta[k] = [Math.min(delta[k][0], d), Math.max(delta[k][1], d)];
      }
    });
    const bottoms = glyphs.filter((_, i) => label[i] !== '.').map(g => g.y1), base = median(bottoms);
    digitBottomSpread = Math.max(digitBottomSpread, Math.max(...bottoms) - Math.min(...bottoms));
    glyphs.forEach((g, i) => {
      if (label[i] === '.') dotBottom = [Math.min(dotBottom[0], g.y1 - base), Math.max(dotBottom[1], g.y1 - base)];
    });
    if (/^\d\d\.\d$/.test(label)) cx.forEach((c, i) => cellObs[i].push(c));
  });

  const cells = cellObs.map(median);
  // Bearing is only learnable from the 2-digit layout.
  samples.forEach(({ label }, n) => {
    const glyphs = segs[n];
    if (!/^\d\d\.\d$/.test(label) || cells.some(c => c === undefined)) return;
    if (glyphs.length !== 4 || glyphs.some(g => g.touchesBorder)) return;
    glyphs.forEach((g, i) => {
      if (!bearingObs.has(label[i])) bearingObs.set(label[i], []);
      bearingObs.get(label[i])!.push((g.x0 + g.x1) / 2 - cells[i]);
    });
  });

  const chars: Record<string, GlyphTemplate> = {};
  for (const [ch, m] of [...byChar].sort()) {
    const variants = [...m.values()].sort((a, b) => b.count - a.count);
    const best = variants[0];
    chars[ch] = {
      w: best.w, h: best.h, top: median(topObs.get(ch)!), bearing: median(bearingObs.get(ch) ?? [0]) ?? 0,
      samples: variants.reduce((s, v) => s + v.count, 0), variants: variants.length, rows: best.rows,
    };
  }
  if (!frame) throw new Error('buildModel: no usable training frames');
  return {
    version: 1, frame, roi: { ...roi }, threshold, minArea, chars,
    layout: { pitch: cells[1] - cells[0], delta, digitBottomSpread, dotBottom, cells },
    stats: { framesUsed, framesSkipped },
  };
}
