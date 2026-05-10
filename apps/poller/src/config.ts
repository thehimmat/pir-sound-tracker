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

const repoRoot = resolve(__dirname, '../../..');

export const config = {
  imageUrl:  env('IMAGE_URL', ''),
  mockMode:  env('MOCK_MODE', 'false') === 'true',
  dbPath:    env('DB_PATH', resolve(repoRoot, 'data/readings.db')),
  wsPort:    envInt('WS_PORT', 3001),
  cropX:     envInt('CROP_X', 0),
  cropY:     envInt('CROP_Y', 46),   // percent from top — targets the large LAFmax digit
  cropW:     envInt('CROP_W', 100),  // percent of width
  cropH:     envInt('CROP_H', 34),   // percent of height
  pollMs:    envInt('POLL_MS', 1000),
  staleAfterMs: 10_000,
} as const;
