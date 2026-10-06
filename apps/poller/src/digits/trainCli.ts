import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePngGrey } from './pngGrey.js';
import { buildModel } from './train.js';

// Rebuilds src/digits/digitModel.ts from labelled frames, e.g. after frames
// from a loud session (90+ or 100+ dB) have been collected and checked by eye.
//
//   npm run build --workspace=apps/poller
//   node apps/poller/dist/digits/trainCli.js <dir>
//
// <dir> holds PNG frames named by their reading and any suffix, e.g.
// "102.3.png" or "102.3_a1b2c3.png". Include frames of the existing range too:
// the model is rebuilt from exactly what is in <dir>.

const dir = process.argv[2];
if (!dir) {
  console.error('usage: trainCli <dir of PNG frames named by reading>');
  process.exit(1);
}

const samples = readdirSync(dir)
  .filter(f => f.endsWith('.png'))
  .map(f => ({ file: f, label: /^(\d{2,3}\.\d)/.exec(f)?.[1] }))
  .filter((s): s is { file: string; label: string } => s.label !== undefined)
  .map(s => ({ grey: decodePngGrey(readFileSync(join(dir, s.file))), label: s.label }));

const model = buildModel(samples);
const values = samples.map(s => Number(s.label));
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/digits/digitModel.ts');
writeFileSync(out,
  `// Generated from ${model.stats.framesUsed} labelled PIR frames (${Math.min(...values)}-${Math.max(...values)} dB).\n` +
  `// Regenerate with src/digits/trainCli.ts when new layouts are collected.\n` +
  `import type { DigitModel } from './train.js';\n\nexport const DIGIT_MODEL: DigitModel = ${JSON.stringify(model, null, 1)};\n`);
console.log(`wrote ${out}: ${model.stats.framesUsed} frames used, ${model.stats.framesSkipped} skipped, glyphs ${Object.keys(model.chars).sort().join(' ')}`);
