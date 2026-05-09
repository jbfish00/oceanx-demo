// Eval-side OCR loader. Resolves invoice OCR text by filename using the
// shared mockOcrMap module, optionally verifying the file exists on disk
// (purely a sanity check — we don't run real PDF parsing in eval because
// pdf.js's worker pipeline is Vite-bundler-only and adds zero signal here).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveOcrByFilename } from '../lib/mockOcrMap.js';

const DEFAULT_DIR = 'DEMO_IMAGES';

export function loadOcrFor(filename, dir = DEFAULT_DIR) {
  const onDisk = join(process.cwd(), dir, filename);
  const exists = existsSync(onDisk);
  const ocrText = resolveOcrByFilename(filename);
  if (!ocrText) {
    throw new Error(`No OCR resolution for ${filename} (file ${exists ? 'present' : 'missing'})`);
  }
  return { ocrText, fileOnDisk: exists };
}
