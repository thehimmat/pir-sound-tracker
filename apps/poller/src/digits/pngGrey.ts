import { inflateSync, crc32 } from 'node:zlib';

// PNG -> 8-bit greyscale in plain JS, byte-identical to
// sharp(buf).grayscale().raw(). Decoding the meter frame once here replaces
// two or three Sharp decodes per frame. Supports what PIR's feed sends (8-bit
// RGB or grey, non-interlaced, no palette/ICC) and throws on anything else, on
// CRC errors and on truncated data.

export interface GreyImage {
  data: Uint8Array;
  width: number;
  height: number;
}

// libvips 8.15 colour/LabQ2sRGB.c calcul_tables(), with float32 semantics.
const f32 = Math.fround;
const V2Y = new Float32Array(256);  // sRGB 8-bit -> linear
const Y2V = new Int32Array(257);    // linear*255 -> sRGB 8-bit (+1 guard)
// Round half to even, as libvips' VIPS_RINT does.
const rint = (x: number): number => {
  let r = Math.floor(x);
  const d = x - r;
  if (d > 0.5 || (d === 0.5 && (r & 1))) r++;
  return r;
};
for (let i = 0; i < 256; i++) {
  const f = f32(i / 255);
  const v = f <= 0.0031308 ? f32(12.92 * f) : f32(1.055 * Math.pow(f, 1 / 2.4) - 0.055);
  Y2V[i] = rint(f32(255 * v));
  V2Y[i] = f <= 0.04045 ? f / 12.92 : Math.pow((f + 0.055) / 1.055, 2.4);
}
Y2V[256] = Y2V[255];

/** libvips sRGB -> scRGB -> B_W for one pixel (vips_col_scRGB2BW). */
function rgbToGrey(r: number, g: number, b: number): number {
  const Y = f32(0.2 * V2Y[r] + 0.7 * V2Y[g] + 0.1 * V2Y[b]);
  let Yf = f32(Y * 255);
  if (Yf < 0) Yf = 0; else if (Yf > 255) Yf = 255;
  const Yi = Yf | 0;
  return rint(f32(Y2V[Yi] + f32((Y2V[Yi + 1] - Y2V[Yi]) * f32(Yf - Yi))));
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// The IEND chunk: zero length, type, fixed CRC.
const IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/**
 * Cheap completeness check: PNG signature at the start and IEND at the end.
 * About 6% of PIR's responses are cut off part-way (often at 2,771 bytes)
 * while still returning HTTP 200.
 */
export function isCompletePng(buf: Buffer): boolean {
  return buf.length >= SIGNATURE.length + IEND.length
    && buf.subarray(0, 8).equals(SIGNATURE)
    && buf.subarray(buf.length - IEND.length).equals(IEND);
}

interface Header { width: number; height: number; depth: number; ctype: number; interlace: number }

function parse(buf: Buffer): Header & { idat: Buffer } {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let p = 8, ihdr: Header | null = null, sawEnd = false;
  const idat: Buffer[] = [];
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    if (p + 12 + len > buf.length) throw new Error(`truncated ${type} chunk`);
    if (crc32(buf.subarray(p + 4, p + 8 + len)) !== buf.readUInt32BE(p + 8 + len)) throw new Error(`CRC error in ${type}`);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') ihdr = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], ctype: body[9], interlace: body[12] };
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'iCCP' || type === 'PLTE') throw new Error(`unsupported chunk ${type}`);
    else if (type === 'IEND') { sawEnd = true; break; }
    p += 12 + len;
  }
  if (!ihdr || !sawEnd) throw new Error('truncated PNG (no IEND)');
  if (ihdr.depth !== 8 || ihdr.interlace !== 0 || (ihdr.ctype !== 2 && ihdr.ctype !== 0)) throw new Error('unsupported PNG format');
  return { ...ihdr, idat: idat.length === 1 ? idat[0] : Buffer.concat(idat) };
}

/** Undoes PNG row filters; returns packed pixels without filter bytes. */
function unfilter(raw: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp, out = Buffer.allocUnsafe(stride * height);
  if (raw.length < (stride + 1) * height) throw new Error('truncated image data');
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)], s = y * (stride + 1) + 1, o = y * stride, u = o - stride;
    switch (ft) {
      case 0: raw.copy(out, o, s, s + stride); break;
      case 1: for (let x = 0; x < stride; x++) out[o + x] = raw[s + x] + (x >= bpp ? out[o + x - bpp] : 0); break;
      case 2: for (let x = 0; x < stride; x++) out[o + x] = raw[s + x] + (y ? out[u + x] : 0); break;
      case 3: for (let x = 0; x < stride; x++) out[o + x] = raw[s + x] + (((x >= bpp ? out[o + x - bpp] : 0) + (y ? out[u + x] : 0)) >> 1); break;
      case 4: for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? out[o + x - bpp] : 0, b = y ? out[u + x] : 0, c = x >= bpp && y ? out[u + x - bpp] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        out[o + x] = raw[s + x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } break;
      default: throw new Error(`bad filter type ${ft}`);
    }
  }
  return out;
}

export function decodePngGrey(buf: Buffer): GreyImage {
  const { width, height, ctype, idat } = parse(buf);
  const bpp = ctype === 2 ? 3 : 1;
  const px = unfilter(inflateSync(idat), width, height, bpp);
  if (bpp === 1) return { data: px, width, height };
  const grey = new Uint8Array(width * height);
  // Frames are a few flat colours, so remember the last colour converted.
  let last = -1, lastGrey = 0;
  for (let i = 0, j = 0; i < grey.length; i++, j += 3) {
    const key = (px[j] << 16) | (px[j + 1] << 8) | px[j + 2];
    if (key !== last) { last = key; lastGrey = rgbToGrey(px[j], px[j + 1], px[j + 2]); }
    grey[i] = lastGrey;
  }
  return { data: grey, width, height };
}
