import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from monorepo root regardless of CWD
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, '../../../.env');
loadEnv({ path: rootEnv });

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v !== undefined ? parseInt(v, 10) : fallback;
}

export const config = {
  imageUrl:  env('IMAGE_URL', ''),
  mockMode:  env('MOCK_MODE', 'false') === 'true',
  wsPort:    envInt('WS_PORT', 3001),
  cropX:     envInt('CROP_X', 0),
  cropY:     envInt('CROP_Y', 46),   // percent from top — targets the large LAFmax digit
  cropW:     envInt('CROP_W', 100),  // percent of width
  cropH:     envInt('CROP_H', 28),   // percent of height — 28% excludes the "LAFmax/dB" label row at ~76%
  pollMs:       envInt('POLL_MS', 1000),
  healthPort:   envInt('HEALTH_PORT', 8080),
  staleAfterMs: 10_000,
  // TESSDATA_PREFIX is read directly in ocr.ts (not via config) to match the
  // env var name that tesseract CLI expects.
} as const;
