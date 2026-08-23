// Document text extraction pipeline (Slice 2 — NO AI).
// Deterministic state machine: extracts text for TXT/JSON/PDF, then sets a
// final status. If PDF yields too little text, marks OCR_REQUIRED rather than
// falsely reporting success.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { config } from '../config.js';

// Configurable threshold: minimum characters to consider extraction "sufficient".
const MIN_CHARS = Number(process.env.EXTRACTION_MIN_CHARS || 40);

const SUPPORTED = {
  'text/plain': 'txt',
  'application/json': 'json',
  'application/pdf': 'pdf',
};

export function isSupportedMime(mime) {
  return Boolean(SUPPORTED[mime]);
}

async function extractPdf(buffer) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  let text = '';
  let pages = pdf.numPages;
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map((i) => i.str).join(' ') + '\n';
  }
  return { text: text.trim(), pages };
}

/**
 * Extract text from a stored file.
 * @returns {Promise<{status, method, text, error, characterCount, pageCount, processingMs}>}
 */
export async function extract({ mimeType, buffer }) {
  const start = Date.now();
  const ms = () => Date.now() - start;
  try {
    if (mimeType === 'text/plain') {
      const text = buffer.toString('utf8').trim();
      if (text.length === 0) {
        return { status: 'EXTRACTION_FAILED', method: 'TXT_DIRECT', text: '', error: 'Document is empty', characterCount: 0, pageCount: 0, processingMs: ms() };
      }
      return { status: 'EXTRACTED', method: 'TXT_DIRECT', text, characterCount: text.length, pageCount: 0, processingMs: ms() };
    }
    if (mimeType === 'application/json') {
      try {
        const parsed = JSON.parse(buffer.toString('utf8'));
        const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
        return { status: 'EXTRACTED', method: 'JSON_PARSE', text, characterCount: text.length, pageCount: 0, processingMs: ms() };
      } catch {
        return { status: 'EXTRACTION_FAILED', method: 'JSON_PARSE', text: '', error: 'Invalid JSON: could not parse document', characterCount: 0, pageCount: 0, processingMs: ms() };
      }
    }
    if (mimeType === 'application/pdf') {
      const { text, pages } = await extractPdf(buffer);
      if (text.length < MIN_CHARS) {
        // Insufficient text -> likely image-only PDF. Mark OCR_REQUIRED (no OCR yet).
        return { status: 'OCR_REQUIRED', method: 'PDF_TEXT', text: '', error: 'Insufficient extractable text; PDF may contain only scanned images. OCR required.', characterCount: text.length, pageCount: pages, processingMs: ms() };
      }
      return { status: 'EXTRACTED', method: 'PDF_TEXT', text, characterCount: text.length, pageCount: pages, processingMs: ms() };
    }
    return { status: 'UNSUPPORTED', method: null, text: '', error: 'Unsupported file type', characterCount: 0, pageCount: 0, processingMs: ms() };
  } catch (err) {
    // Corrupt PDF / parse failure -> fail loudly but safely (no stack to client).
    const msg = String(err.message || 'Extraction failed').slice(0, 200);
    return { status: 'EXTRACTION_FAILED', method: null, text: '', error: msg, characterCount: 0, pageCount: 0, processingMs: ms() };
  }
}
