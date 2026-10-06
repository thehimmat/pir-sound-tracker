import type { GreyImage } from './digits/pngGrey.js';
import { isCompletePng } from './digits/pngGrey.js';
import type { DigitReader, RejectReason } from './digits/reader.js';

/** Average pixel brightness (0-255). Above 240 the meter display is off. */
export function meanBrightness(grey: GreyImage): number {
  let sum = 0;
  for (let i = 0; i < grey.data.length; i++) sum += grey.data[i];
  return sum / (grey.width * grey.height);
}

export interface ReadValueDeps {
  reader: DigitReader;
  /** Tesseract on the original frame; resolves null when it can't read one. */
  fallback: (frame: Buffer) => Promise<number | null>;
}

export type ValueRead =
  | { raw_db: number; via: 'template' }
  | { raw_db: number; via: 'tesseract'; rejectReason: RejectReason }
  | { raw_db: null; via: 'none'; rejectReason: RejectReason };

/**
 * Template matching first (~1 ms of CPU). Only when it rejects a frame, for
 * example a 100+ dB layout no real frame has shown it yet, does Tesseract run
 * (~150 ms). The reject reason is kept so those frames can be logged.
 */
export async function readValue(grey: GreyImage, frame: Buffer, deps: ReadValueDeps): Promise<ValueRead> {
  const t = deps.reader.readGrey(grey);
  if (t.ok) return { raw_db: t.value, via: 'template' };
  const value = await deps.fallback(frame).catch(() => null);
  return value === null
    ? { raw_db: null, via: 'none', rejectReason: t.reason }
    : { raw_db: value, via: 'tesseract', rejectReason: t.reason };
}

/**
 * About 6% of PIR's responses are truncated PNGs (HTTP 200, missing the end
 * of the file), apparently read while the server is rewriting its cached
 * frame. Fetching again straight away usually gets the whole frame.
 */
export async function fetchCompleteFrame(fetchFrame: () => Promise<Buffer>): Promise<{ buf: Buffer; refetched: boolean }> {
  const first = await fetchFrame();
  if (isCompletePng(first)) return { buf: first, refetched: false };
  return { buf: await fetchFrame(), refetched: true };
}
