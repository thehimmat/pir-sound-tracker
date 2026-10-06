import sharp from 'sharp';
import { config } from './config.js';

/**
 * Crop and binarise the LAFmax digits for Tesseract, which now only runs on
 * frames the template reader rejects (see meterReader.ts).
 *
 * Sharp applies operations in a fixed order, not call order, so threshold()
 * runs before normalise()/linear(). Those two were therefore no-ops on an
 * already black-and-white image, yet normalise() alone cost ~37 ms of CPU per
 * frame. Without them the output is byte-identical (checked on 1,442 real
 * frames) at about a fifth of the CPU.
 */
export async function preprocessImage(raw: Buffer): Promise<Buffer> {
  const meta = await sharp(raw).metadata();
  const imgW = meta.width  ?? 100;
  const imgH = meta.height ?? 100;

  const left   = Math.round(imgW * config.cropX / 100);
  const top    = Math.round(imgH * config.cropY / 100);
  const width  = Math.round(imgW * config.cropW / 100);
  const height = Math.round(imgH * config.cropH / 100);

  return sharp(raw)
    .extract({ left, top, width, height })
    .grayscale()
    .threshold(140)                           // binarise
    .resize(width * 4, height * 4, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}
