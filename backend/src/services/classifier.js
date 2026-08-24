// Slice 3 — Evidence Classification engine.
// Classifies ALREADY-EXTRACTED document text into a closed evidence-type taxonomy,
// with a confidence score and source spans (provenance) so every claim is grounded
// in the source document. Runs ONLY on extracted text — never on raw files.
//
// Two interchangeable engines:
//   1. HEURISTIC (default / demo): deterministic keyword + regex patterns. Fully
//      reproducible, no external dependency, emits source spans for every signal.
//   2. LLM: structured JSON generation via a configured provider (OPENAI-compatible
//      chat completions endpoint). Schema-validated; on any failure it transparently
//      falls back to HEURISTIC so the pipeline never breaks.
//
// Output contract: { evidenceType, confidence (0-100), signals[], sourceSpans[],
//                    method, model?, sourceText? }
import { config } from '../config.js';
import { callLLM as callLLMShared } from './llm.js';

// ---- Taxonomy (closed set; keep in sync with frontend if surfaced) ----
export const EVIDENCE_TYPES = [
  'INVOICE_OR_RECEIPT',
  'SHIPPING_OR_DELIVERY',
  'COMMUNICATION',
  'REFUND_OR_CANCELLATION',
  'IDENTITY_OR_KYC',
  'PRODUCT_PHOTO',
  'LEGAL_OR_DISPUTE_RESPONSE',
  'OTHER',
];

// ---- Heuristic engine ----
// Each pattern: [type, weight, regex, humanLabel]. First match group, if present,
// becomes the source span text.
const PATTERNS = [
  ['INVOICE_OR_RECEIPT', 78, /\b(invoice|receipt|tax invoice|bill no|gstin|hsn|payment received|order paid|amount paid|subtotal|grand total)\b/gi, 'invoice/receipt term'],
  ['SHIPPING_OR_DELIVERY', 82, /\b(tracking id|tracking number|awb|shipment|dispatched|dispatched on|out for delivery|delivered on|delivery confirmation|bludart|bluedart|dtdc|fedex|delhivery|courier|pod|proof of delivery)\b/gi, 'shipping/delivery term'],
  ['REFUND_OR_CANCELLATION', 80, /\b(refund|refunded|cancel|cancelled|cancellation|order cancelled|amount reversed|reverse pickup)\b/gi, 'refund/cancellation term'],
  ['COMMUNICATION', 70, /\b(dear customer|hi team|hello|subject:|regards|from:.*@|sent:|re: |chat transcript|whatsapp|message from)\b/gi, 'communication marker'],
  ['IDENTITY_OR_KYC', 76, /\b(aadhaar|pan card|passport|voter|driving licen[sc]e|government id|kyc|selfie|proof of identity)\b/gi, 'identity/KYC term'],
  ['PRODUCT_PHOTO', 55, /\b(product image|photo of|screenshot|attached image|item picture|picture of the)\b/gi, 'product photo marker'],
  ['LEGAL_OR_DISPUTE_RESPONSE', 74, /\b(dispute|chargeback|arbitration|consumer forum|legal notice|representment|dispute response|merchant response)\b/gi, 'legal/dispute term'],
];

function heuristicClassify(text) {
  const signals = [];
  for (const [type, weight, re, label] of PATTERNS) {
    re.lastIndex = 0;
    let m;
    const hits = [];
    while ((m = re.exec(text)) !== null) {
      hits.push(m[0]);
      if (hits.length >= 5) break; // cap
    }
    if (hits.length) {
      signals.push({ type, label, weight, hits: hits.length, examples: hits.slice(0, 3) });
    }
  }
  if (!signals.length) {
    return {
      evidenceType: 'OTHER',
      confidence: 50,
      signals: [],
      sourceSpans: [],
      method: 'HEURISTIC',
    };
  }
  // Pick the strongest signal type; confidence derived from weight + hit density.
  signals.sort((a, b) => b.weight * b.hits - a.weight * a.hits);
  const top = signals[0];
  const density = Math.min(1, top.hits / 4); // 4+ hits saturates
  const confidence = Math.round(Math.min(96, top.weight * (0.6 + 0.4 * density)));
  // Build source spans: locate each example in the text with a char window.
  const sourceSpans = [];
  for (const ex of top.examples) {
    const idx = text.toLowerCase().indexOf(ex.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + ex.length + 30);
      sourceSpans.push({ type: top.type, snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(), match: ex });
    }
  }
  return {
    evidenceType: top.type,
    confidence,
    signals: signals.map((s) => ({ type: s.type, label: s.label, weight: s.weight, hits: s.hits })),
    sourceSpans,
    method: 'HEURISTIC',
  };
}

// ---- LLM engine (structured, schema-validated, heuristic fallback) ----
const CLASSIFICATION_PROMPT = `You are a dispute-evidence classifier for an Indian payment dispute (Razorpay).
Given the extracted text of an uploaded evidence document, classify it into exactly one evidence type,
assign a confidence from 0-100, and cite the exact source phrases that justify the label.

Allowed evidenceType values (pick ONE):
${EVIDENCE_TYPES.join(', ')}

Return ONLY strict JSON in this shape (no prose, no markdown):
{
  "evidenceType": "<one of the allowed values>",
  "confidence": <integer 0-100>,
  "sourcePhrases": ["<verbatim phrase from the text>", "..."]
}`;

async function callLLM(text) {
  const { raw, model } = await callLLMShared(CLASSIFICATION_PROMPT, `DOCUMENT TEXT:\n"""\n${text.slice(0, 12000)}\n"""`, { responseFormatJson: true });
  return { raw, model };
}

function normalizeLLM(raw, model) {
  if (!raw || !EVIDENCE_TYPES.includes(raw.evidenceType)) return null;
  const confidence = Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 0)));
  const phrases = Array.isArray(raw.sourcePhrases) ? raw.sourcePhrases.slice(0, 5) : [];
  const sourceSpans = [];
  for (const p of phrases) {
    const idx = raw._text?.toLowerCase().indexOf(String(p).toLowerCase());
    if (idx >= 0 && raw._text) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(raw._text.length, idx + String(p).length + 30);
      sourceSpans.push({ type: raw.evidenceType, snippet: raw._text.slice(start, end).replace(/\s+/g, ' ').trim(), match: p });
    }
  }
  return {
    evidenceType: raw.evidenceType,
    confidence,
    signals: [{ type: raw.evidenceType, label: 'llm-classified', weight: confidence, hits: phrases.length }],
    sourceSpans,
    method: 'LLM',
    model,
  };
}

// Public entry. Runs LLM if configured, else heuristic. LLM failure -> heuristic.
export async function classifyEvidence({ extractedText, filename } = {}) {
  const text = (extractedText || '').trim();
  if (!text) {
    return {
      evidenceType: 'OTHER',
      confidence: 0,
      signals: [],
      sourceSpans: [],
      method: config.llm.apiKey ? 'LLM' : 'HEURISTIC',
      error: 'NO_TEXT',
    };
  }
  if (config.llm.apiKey) {
    try {
      const { raw, model } = await callLLM(text);
      const norm = normalizeLLM({ ...raw, _text: text }, model);
      if (norm) {
        return { ...norm, sourceText: text.slice(0, 200) };
      }
      // Schema invalid -> fall through to heuristic.
    } catch (e) {
      // Transparent fallback; record reason.
      const h = heuristicClassify(text);
      return { ...h, fallbackReason: String(e.message).slice(0, 160), sourceText: text.slice(0, 200) };
    }
  }
  const h = heuristicClassify(text);
  return { ...h, sourceText: text.slice(0, 200) };
}
