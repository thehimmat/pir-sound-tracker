import Tesseract from 'tesseract.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// In Docker the model is pre-baked to /app/tessdata via Dockerfile.
// Locally it falls back to the project root (where eng.traineddata is downloaded on first run).
const LANG_PATH = process.env.TESSDATA_DIR
  ?? dirname(dirname(fileURLToPath(import.meta.url)));  // …/apps/poller

let worker: Tesseract.Worker | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (worker) return worker;
  worker = await Tesseract.createWorker('eng', 1, {
    logger:   () => {},
    langPath: LANG_PATH,
  });
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789.',
    tessedit_pageseg_mode:   Tesseract.PSM.SINGLE_LINE,
  });
  return worker;
}

export async function ocrImage(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
  const w = await getWorker();
  const { data } = await w.recognize(imageBuffer);
  return { text: data.text, confidence: data.confidence };
}

export async function terminateOcr(): Promise<void> {
  await worker?.terminate();
  worker = null;
}
