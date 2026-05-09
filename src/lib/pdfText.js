// Real PDF text extraction via pdf.js. Used as the primary path for .pdf
// inputs; the existing MOCK_OCR_MAP becomes a fallback for image-only scans
// where pdf.js can't pull text content.

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) pageTexts.push(pageText);
  }
  await doc.destroy();
  const joined = pageTexts.join('\n').trim();
  if (!joined) {
    const err = new Error('PDF contained no extractable text (likely image-only scan)');
    err.code = 'EMPTY_PDF_TEXT';
    throw err;
  }
  return joined;
}
