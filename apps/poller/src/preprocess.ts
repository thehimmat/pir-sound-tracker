import sharp from 'sharp';
import { config } from './config.js';

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
    .normalise()                              // auto-stretch contrast
    .linear(2.0, -(128 * 2.0 - 128))         // increase contrast
    .threshold(140)                           // binarise
    .resize(width * 2, height * 2, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

/**
 * Returns average pixel brightness (0-255) of the raw image.
 * Values > 240 indicate a near-white / blank frame.
 */
export async function avgBrightness(raw: Buffer): Promise<number> {
  const { data, info } = await sharp(raw)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum / (info.width * info.height);
}
