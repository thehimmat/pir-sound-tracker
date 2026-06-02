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

const OCR_TIMEOUT_MS = 30_000;

export async function ocrImage(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
  const w = await getWorker();

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`OCR timeout after ${OCR_TIMEOUT_MS / 1000}s`)),
      OCR_TIMEOUT_MS,
    );
  });

  try {
    const { data } = await Promise.race([w.recognize(imageBuffer), timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return { text: data.text, confidence: data.confidence };
  } catch (err) {
    clearTimeout(timeoutHandle!);
    if (err instanceof Error && err.message.startsWith('OCR timeout')) {
      console.error('[ocr] worker timed out — exiting for clean restart (avoids double-OOM from worker cycling)');
      process.exit(1);
    }
    // Non-timeout error: terminate and null the worker so the next call gets a fresh one.
    // A corrupted worker state would otherwise silently degrade every subsequent poll.
    console.error('[ocr] worker error — resetting worker for next poll:', err instanceof Error ? err.message : err);
    worker?.terminate().catch(() => {});
    worker = null;
    throw err; // poll() catches this as status='error' and continues
  }
}

export async function terminateOcr(): Promise<void> {
  await worker?.terminate();
  worker = null;
}
