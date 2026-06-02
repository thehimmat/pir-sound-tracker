import { spawn } from 'node:child_process';

// Tesseract CLI reads from stdin when given 'stdin' as the input path.
// TESSDATA_PREFIX is set in the Dockerfile ENV to /app/tessdata.
// Locally, the system Tesseract installation handles its own tessdata lookup.

const OCR_TIMEOUT_MS = 10_000;

export async function ocrImage(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tesseract',
      [
        'stdin', 'stdout',
        '--psm', '7',          // single text line
        '--oem', '1',          // LSTM engine
        '-c', 'tessedit_char_whitelist=0123456789.',
      ],
      { env: process.env },    // TESSDATA_PREFIX already set by Dockerfile ENV
    );

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      // Exit the whole process so Fly restarts cleanly.
      // Unlike the tesseract.js worker approach, the kill above is guaranteed
      // to fire even under heavy CPU load because it runs at the OS level.
      console.error('[ocr] tesseract timed out — killing subprocess and exiting for auto-restart');
      process.exit(1);
    }, OCR_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && code !== null) {
        // Tesseract exits non-zero on warnings (e.g. empty page) — treat as soft error
        const msg = stderr.trim();
        if (stdout.trim()) {
          // Got text despite non-zero exit — proceed
          resolve({ text: stdout, confidence: 0 });
        } else {
          reject(new Error(`tesseract exited ${code}: ${msg}`));
        }
        return;
      }
      // Tesseract CLI appends a trailing newline and "Form Feed" (\f) — strip both
      resolve({ text: stdout.replace(/[\f\n]+$/, ''), confidence: 0 });
    });

    child.stdin.on('error', () => { /* ignore EPIPE if child exits early */ });
    child.stdin.end(imageBuffer);
  });
}

// No-op: CLI spawns a fresh process per call, nothing to tear down.
export async function terminateOcr(): Promise<void> {}
