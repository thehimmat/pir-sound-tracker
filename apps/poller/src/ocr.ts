import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (worker) return worker;
  worker = await Tesseract.createWorker('eng', 1, {
    logger: () => {}, // silence verbose logs
  });
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789.',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
  });
  return worker;
}

export async function ocrImage(imageBuffer: Buffer): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(imageBuffer);
  return data.text;
}

export async function terminateOcr(): Promise<void> {
  await worker?.terminate();
  worker = null;
}
