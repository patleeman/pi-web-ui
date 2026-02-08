#!/usr/bin/env node

/**
 * Bundle the server into a single file for npm distribution.
 *
 * - Inlines workspace packages (@pi-deck/shared, local server src)
 * - Marks native/complex deps as external (installed via package.json dependencies)
 * - Output: dist/server.js (single ESM file)
 */

import esbuild from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

await esbuild.build({
  entryPoints: [join(ROOT, 'packages/server/dist/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(ROOT, 'dist/server.js'),
  sourcemap: true,

  // These must remain as runtime imports — they have native bindings
  // or are too complex to bundle (the pi SDK loads extensions at runtime, etc.)
  external: [
    'better-sqlite3',
    '@mariozechner/pi-coding-agent',
    'express',
    'cors',
    'ws',
    'yaml',
  ],

  // The source already defines __filename and __dirname via fileURLToPath.
  // Don't inject duplicates — just let the source's own definitions work.
  // esbuild preserves import.meta.url in ESM output by default.

  logLevel: 'info',
  metafile: true,
}).then((result) => {
  const outputs = result.metafile.outputs;
  for (const [file, meta] of Object.entries(outputs)) {
    if (file.endsWith('.js')) {
      const kb = (meta.bytes / 1024).toFixed(1);
      console.log(`\n  ${file}: ${kb} KB`);
    }
  }
});
