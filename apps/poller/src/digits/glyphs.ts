import type { GreyImage } from './pngGrey.js';

// Binarise, segment and compare glyph bitmaps. Glyphs are compared as
// bit-packed rows on a 64-px canvas (two 32-bit words per row), centred
// horizontally, so one XOR + popcount compares 32 pixels.

export interface Roi { left: number; top: number; width: number; height: number }

/** Big LAFmax digits: the blank band between the bar graph (ends y=139) and
 *  the LAFmax box (starts y=242) on the 240x320 XL2 frame, wide enough that a
 *  1-2 px shift cannot clip a glyph. */
export const DIGIT_ROI: Roi = Object.freeze({ left: 0, top: 140, width: 240, height: 102 });

export interface BinaryImage { data: Uint8Array; width: number; height: number; left: number; top: number }

export interface Glyph {
  x0: number; x1: number; y0: number; y1: number;
  w: number; h: number; area: number;
  mask: Uint8Array;
  touchesBorder: boolean;
}

export interface PackedGlyph {
  w: number; h: number; ink: number;
  rows: Uint32Array | null;
  dil: Uint32Array | null;
  tooWide: boolean;
}

/** Same rule as the Tesseract preprocessing: grey >= threshold is background. */
export function binariseRoi(grey: GreyImage, roi: Roi, threshold = 140): BinaryImage {
  const { left, top, width, height } = roi;
  const out = new Uint8Array(width * height), src = grey.data, W = grey.width;
  for (let y = 0; y < height; y++) {
    const s = (top + y) * W + left, d = y * width;
    for (let x = 0; x < width; x++) out[d + x] = src[s + x] < threshold ? 1 : 0;
  }
  return { data: out, width, height, left, top };
}

export interface SegmentWork { lab: Int32Array; stack: Int32Array }

/**
 * 8-connected components; specks under minArea are dropped; components that
 * overlap in x are grouped into one glyph. Returns glyphs left to right in
 * frame coordinates.
 */
export function segment(bin: BinaryImage, { minArea = 20, work }: { minArea?: number; work?: SegmentWork } = {}) {
  const { data, width: W, height: H } = bin, left = bin.left, top = bin.top;
  let lab: Int32Array, stack: Int32Array;
  if (work && work.lab.length >= W * H) { lab = work.lab; stack = work.stack; lab.fill(0, 0, W * H); }
  else { lab = new Int32Array(W * H); stack = new Int32Array(W * H); }
  const comps: Array<{ id: number; x0: number; x1: number; y0: number; y1: number; area: number }> = [];
  let n = 0, speckCount = 0, speckArea = 0;
  for (let i = 0; i < W * H; i++) {
    if (!data[i] || lab[i]) continue;
    n++; lab[i] = n;
    let sp = 0; stack[sp++] = i;
    let x0 = W, x1 = -1, y0 = H, y1 = -1, area = 0;
    while (sp) {
      const p = stack[--sp], y = (p / W) | 0, x = p - y * W;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const ya = y > 0 ? -1 : 0, yb = y < H - 1 ? 1 : 0, xa = x > 0 ? -1 : 0, xb = x < W - 1 ? 1 : 0;
      for (let dy = ya; dy <= yb; dy++) for (let dx = xa; dx <= xb; dx++) {
        const q = p + dy * W + dx;
        if (data[q] && !lab[q]) { lab[q] = n; stack[sp++] = q; }
      }
    }
    if (area < minArea) { speckCount++; speckArea += area; continue; }
    comps.push({ id: n, x0, x1, y0, y1, area });
  }
  comps.sort((a, b) => a.x0 - b.x0);
  const groups: Array<{ ids: number[]; x0: number; x1: number; y0: number; y1: number; area: number }> = [];
  for (const c of comps) {
    const g = groups[groups.length - 1];
    if (g && c.x0 <= g.x1) {
      g.ids.push(c.id); g.area += c.area;
      if (c.x1 > g.x1) g.x1 = c.x1;
      if (c.y0 < g.y0) g.y0 = c.y0;
      if (c.y1 > g.y1) g.y1 = c.y1;
    } else groups.push({ ids: [c.id], x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, area: c.area });
  }
  const glyphs: Glyph[] = groups.map(g => {
    const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1, mask = new Uint8Array(w * h);
    const ids = new Set(g.ids);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = lab[(g.y0 + y) * W + g.x0 + x];
      if (l && ids.has(l)) mask[y * w + x] = 1;
    }
    return {
      x0: g.x0 + left, x1: g.x1 + left, y0: g.y0 + top, y1: g.y1 + top, w, h, area: g.area, mask,
      touchesBorder: g.x0 === 0 || g.y0 === 0 || g.x1 === W - 1 || g.y1 === H - 1,
    };
  });
  return { glyphs, speckCount, speckArea };
}

const CANVAS = 64, MAX_W = 56;

function popcount32(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** Packs a glyph into 2 words per row, centred on a 64-px canvas, plus a
 *  3x3-dilated copy (h+2 rows) for the tolerant distance. */
export function packGlyph({ w, h, mask }: { w: number; h: number; mask: Uint8Array }): PackedGlyph {
  if (w > MAX_W) return { w, h, ink: 0, rows: null, dil: null, tooWide: true };
  const rows = new Uint32Array(h * 2), off = (CANVAS >> 1) - (w >> 1);
  let ink = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    const cx = off + x;
    rows[y * 2 + (cx >> 5)] |= 0x80000000 >>> (cx & 31);
    ink++;
  }
  const hz = new Uint32Array(h * 2);
  for (let y = 0; y < h; y++) {
    const hi = rows[y * 2], lo = rows[y * 2 + 1];
    hz[y * 2] = hi | (hi >>> 1) | (hi << 1) | (lo >>> 31);
    hz[y * 2 + 1] = lo | (lo >>> 1) | (lo << 1) | (hi << 31);
  }
  const dil = new Uint32Array((h + 2) * 2);
  for (let y = -1; y <= h; y++) for (let k = 0; k < 2; k++) {
    let v = 0;
    for (let yy = y - 1; yy <= y + 1; yy++) if (yy >= 0 && yy < h) v |= hz[yy * 2 + k];
    dil[(y + 1) * 2 + k] = v;
  }
  return { w, h, ink, rows, dil, tooWide: false };
}

/** Packs a template stored as strings of '#' (ink) and '.' (background). */
export function packRows({ w, h, rows }: { w: number; h: number; rows: string[] }): PackedGlyph {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = rows[y][x] === '#' ? 1 : 0;
  return packGlyph({ w, h, mask });
}

// Tolerant mismatch with b moved dx right and dy down: ink of a not covered by
// dilated b, plus ink of b not covered by dilated a. Ignores 1-px boundary
// differences (stroke weight, sub-pixel position) but counts any missing or
// extra stroke. Stops counting at `limit`.
function tolAt(a: PackedGlyph, b: PackedGlyph, dx: number, dy: number, limit: number): number {
  const ty = ((a.h - b.h) >> 1) + dy;
  const A = a.rows!, Ad = a.dil!, B = b.rows!, Bd = b.dil!;
  const r0 = Math.min(-1, ty - 1), r1 = Math.max(a.h + 1, ty + b.h + 1);
  let sum = 0;
  for (let i = r0; i < r1; i++) {
    let ah = 0, al = 0, adh = 0, adl = 0, bh = 0, bl = 0, bdh = 0, bdl = 0;
    if (i >= 0 && i < a.h) { ah = A[i * 2]; al = A[i * 2 + 1]; }
    if (i >= -1 && i <= a.h) { adh = Ad[(i + 1) * 2]; adl = Ad[(i + 1) * 2 + 1]; }
    const j = i - ty;
    if (j >= -1 && j <= b.h) {
      let h0 = 0, l0 = 0;
      if (j >= 0 && j < b.h) { h0 = B[j * 2]; l0 = B[j * 2 + 1]; }
      const h1 = Bd[(j + 1) * 2], l1 = Bd[(j + 1) * 2 + 1];
      if (dx > 0) {
        bh = h0 >>> dx; bl = (l0 >>> dx) | (h0 << (32 - dx));
        bdh = h1 >>> dx; bdl = (l1 >>> dx) | (h1 << (32 - dx));
      } else if (dx < 0) {
        const s = -dx;
        bh = (h0 << s) | (l0 >>> (32 - s)); bl = l0 << s;
        bdh = (h1 << s) | (l1 >>> (32 - s)); bdl = l1 << s;
      } else { bh = h0; bl = l0; bdh = h1; bdl = l1; }
    }
    sum += popcount32((ah & ~bdh) >>> 0) + popcount32((al & ~bdl) >>> 0)
         + popcount32((bh & ~adh) >>> 0) + popcount32((bl & ~adl) >>> 0);
    if (sum >= limit) return limit;
  }
  return sum;
}

/**
 * Mismatch / (inkA + inkB), minimised over offsets within ±maxShift px by
 * greedy descent from the centred alignment: 0 = identical, 1 = no shared ink.
 * Distances at or beyond capDist come back as Infinity.
 */
export function glyphDistance(a: PackedGlyph, b: PackedGlyph, maxShift = 3, capDist = Infinity) {
  if (a.tooWide || b.tooWide) return { dist: Infinity, dx: 0, dy: 0 };
  const cap = capDist === Infinity ? Infinity : Math.ceil(capDist * (a.ink + b.ink));
  let bx = 0, by = 0, best = tolAt(a, b, 0, 0, cap);
  for (let moved = true; moved && best > 0;) {
    moved = false;
    let nx = bx, ny = by;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx, y = by + dy;
      if ((!dx && !dy) || x < -maxShift || x > maxShift || y < -maxShift || y > maxShift) continue;
      const v = tolAt(a, b, x, y, best);
      if (v < best) { best = v; nx = x; ny = y; moved = true; }
    }
    bx = nx; by = ny;
  }
  if (best >= cap) return { dist: Infinity, dx: bx, dy: by };
  return { dist: best / (a.ink + b.ink), dx: bx, dy: by };
}

export interface Match { char: string | null; dist: number; second: string | null; secondDist: number }

/** Nearest and runner-up template for a glyph. Templates more than sizeTol px
 *  off in width or height are not candidates. */
export function makeClassifier(
  chars: Record<string, { w: number; h: number; rows: string[] }>,
  { sizeTol = 6, maxShift = 3, capDist = Infinity } = {},
): (g: Glyph) => Match {
  const templates = Object.entries(chars).map(([ch, t]) => ({ ch, ...packRows(t) }));
  return g => {
    const p = packGlyph(g);
    if (p.tooWide) return { char: null, dist: Infinity, second: null, secondDist: Infinity };
    let b1: string | null = null, d1 = Infinity, b2: string | null = null, d2 = Infinity;
    for (const t of templates) {
      if (Math.abs(t.w - p.w) > sizeTol || Math.abs(t.h - p.h) > sizeTol) continue;
      const { dist } = glyphDistance(p, t, maxShift, capDist);
      if (dist < d1) { b2 = b1; d2 = d1; b1 = t.ch; d1 = dist; }
      else if (dist < d2) { b2 = t.ch; d2 = dist; }
    }
    return { char: b1, dist: d1, second: b2, secondDist: d2 };
  };
}
