// Slice 5 — Factual Timeline Extraction engine.
// Turns ALREADY-EXTRACTED document text into grounded factual events.
// Runs ONLY on extracted text (never on raw files), exactly like Slice 3/4.
//
// Two interchangeable engines (mirrors classifier.js):
//   1. HEURISTIC (default / demo): deterministic keyword + date/actor extraction.
//      Fully reproducible, no external dependency, every event grounded in a source span.
//   2. LLM: structured JSON generation via an OPENAI-compatible endpoint (gated by
//      LLM_API_KEY). Schema-validated; on any failure it transparently falls back to HEURISTIC.
//
// Output contract: { events: FactualEvent[], rejected: RejectedEvent[], meta }
// Every event MUST be grounded in the source; unsupported/fabricated events are rejected,
// never silently persisted.
import { config } from '../config.js';
import { callLLM as callLLMShared } from './llm.js';
import { parseDate, parseTime, DATE_RE, TIME_RE } from './dateUtils.js';

export const EVENT_TYPES = [
  'order_created',
  'payment_made',
  'payment_failed',
  'shipment_created',
  'shipment_dispatched',
  'delivery_attempt',
  'delivery_completed',
  'customer_acknowledgement',
  'return_requested',
  'return_initiated',
  'refund_requested',
  'refund_issued',
  'cancellation_requested',
  'cancellation_completed',
  'service_started',
  'service_completed',
  'customer_communication',
  'other',
];

// Keyword patterns per event type. First match group (if any) becomes the source span.
// actor hints: courier | customer | merchant | bank | system
const TYPE_PATTERNS = [
  ['order_created', /\b(order (?:was |is )?plac(?:e|ed)|order (?:created|confirmed)|booked (?:an |the )?order|order id\b)/i, 'merchant'],
  ['payment_made', /\b(payment (?:received|done|success|successful)|paid|amount paid|payment of|settled|transaction successful|payment captured)/i, 'customer'],
  ['payment_failed', /\b(payment (?:failed|declined|unsuccessful|not (?:received|done))|transaction failed|payment declined)/i, 'bank'],
  ['shipment_created', /\b(shipment (?:created|generated|registered)|awb (?:generated|created)|label generated|shipping label)/i, 'merchant'],
  ['shipment_dispatched', /\b(dispatched|shipped|out for delivery|despatched|courier picked up|handed over to courier|in transit)/i, 'courier'],
  ['delivery_attempt', /\b(delivery attempt|attempted delivery|customer unavailable|missed delivery|left at door)/i, 'courier'],
  ['delivery_completed', /\b(delivered|delivery completed|delivery confirmed|pod|proof of delivery|received the|package delivered|delivered to customer|order delivered)\b/i, 'courier'],
  ['customer_acknowledgement', /\b(i (?:received|got|confirm)|customer confirmed|acknowledged|signed for)/i, 'customer'],
  ['return_requested', /\b(return request(?:ed)?|request(?:ed)? (?:a |the )?return|raise(?:d)? (?:a |the )?return|want to return)/i, 'customer'],
  ['return_initiated', /\b(return initiated|return (?:created|registered|booked|generated)|rma (?:created|raised|initiated)|reverse pickup (?:booked|initiated|scheduled))/i, 'customer'],
  ['refund_requested', /\b(refund request(?:ed)?|request(?:ed)? (?:a |the )?refund|asked for refund)/i, 'customer'],
  ['refund_issued', /\b(refund (?:issued|processed|completed|initiated|credited|sent)|amount refunded|refunded to|refund of)/i, 'merchant'],
  ['cancellation_requested', /\b(cancellation request(?:ed)?|request(?:ed)? (?:a |the )?cancellation|cancel (?:my |the )?order)/i, 'customer'],
  ['cancellation_completed', /\b(order cancelled|cancelled|canceled|order canceled|cancellation completed|subscription cancelled)/i, 'merchant'],
  ['service_started', /\b(service started|subscription started|plan activated|service activated|booking confirmed)/i, 'merchant'],
  ['service_completed', /\b(service completed|service delivered|work completed|service fulfilled)/i, 'merchant'],
  ['customer_communication', /\b(dear customer|hi team|hello|regards|sent a message|whatsapp|chat with|email from customer|customer wrote)/i, 'customer'],
];

function actorFromClause(clause, hint) {
  const low = clause.toLowerCase();
  if (hint) return hint;
  if (/courier|delivery|bludart|bluedart|dtdc|fedex|delhivery|shipment/.test(low)) return 'courier';
  if (/bank|payment failed|declined|account/.test(low)) return 'bank';
  if (/i (?:received|got|confirm)|customer|return|refund|cancel/.test(low)) return 'customer';
  return 'merchant';
}

// Split text into clauses (sentence-like units) for per-event grounding.
function splitClauses(text) {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function extractLineRange(text, clause) {
  const idx = text.indexOf(clause);
  if (idx < 0) return null;
  const before = text.slice(0, idx).split('\n');
  const startLine = before.length; // 1-based
  const endLine = startLine + clause.split('\n').length - 1;
  return startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`;
}

// ---- Heuristic engine ----
function heuristicExtract({ extractedText, filename, mimeType }) {
  const text = (extractedText || '').trim();
  if (!text) return [];
  const clauses = splitClauses(text);
  const events = [];
  const seen = new Set();
  for (const clause of clauses) {
    for (const [type, re, actorHint] of TYPE_PATTERNS) {
      re.lastIndex = 0;
      if (!re.test(clause)) continue;
      const dateMatch = clause.match(DATE_RE);
      const { iso, precision } = dateMatch ? parseDate(dateMatch[0]) : { iso: null, precision: 'unknown' };
      const time = clause.match(TIME_RE) ? parseTime(clause) : null;
      const actor = actorFromClause(clause, actorHint);
      const description = clause.length > 240 ? clause.slice(0, 237) + '…' : clause;
      // Grounding: the description is built directly from a source clause, so it is supported.
      const event = {
        eventType: type,
        date: iso,
        time,
        datePrecision: precision,
        actor,
        description,
        sourceDocument: filename,
        sourceLocation: mimeType === 'text/plain' ? extractLineRange(text, clause) : null,
        confidence: 0.9,
        _grounded: true,
      };
      // Dedupe exact (type+date+description) within a doc.
      const k = `${type}|${iso}|${description}`;
      if (seen.has(k)) continue;
      seen.add(k);
      events.push(event);
    }
  }
  return events;
}

// ---- Schema validation ----
function validateEvent(e) {
  const problems = [];
  if (!EVENT_TYPES.includes(e.eventType)) problems.push('unsupported_event_type');
  if (typeof e.confidence !== 'number' || e.confidence < 0 || e.confidence > 1) problems.push('invalid_confidence');
  if (!e.description || !String(e.description).trim()) problems.push('empty_description');
  if (!e.sourceDocument) problems.push('missing_source_document');
  // If a date is present it must be a valid ISO date or null.
  if (e.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) problems.push('invalid_date');
  // Never accept a fabricated source location (e.g. "Page 2" for txt).
  if (e.sourceLocation && /page/i.test(e.sourceLocation) && e.sourceMime === 'text/plain') {
    problems.push('invalid_source_location');
  }
  return problems;
}

// ---- LLM engine (structured, schema-validated, heuristic fallback) ----
const TIMELINE_PROMPT = `You are a factual-event extractor for Indian payment-dispute evidence.
Given extracted text from ONE evidence document, extract every distinct factual event.
Allowed eventType values (use exactly one per event; use "other" if none fit):
${EVENT_TYPES.join(', ')}

Return ONLY strict JSON: { "events": [ { "eventType": "...", "date": "YYYY-MM-DD or null", "time": "HH:MM or null", "actor": "courier|customer|merchant|bank|system or null", "description": "<verbatim factual clause from the text>", "sourceLocation": null } ] }
Do NOT infer intent. Do NOT make legal conclusions. Do NOT fabricate dates, actors, or page numbers.`;

async function callLLM(text) {
  const { raw, model } = await callLLMShared(TIMELINE_PROMPT, `DOCUMENT TEXT:\n"""\n${text.slice(0, 12000)}\n"""`, { responseFormatJson: true });
  return { raw, model };
}

function normalizeLLM(raw, model, { filename, mimeType }) {
  if (!raw || !Array.isArray(raw.events)) return null;
  const events = [];
  for (const e of raw.events) {
    const norm = {
      eventType: e.eventType,
      date: e.date || null,
      time: e.time || null,
      datePrecision: e.date ? 'date' : 'unknown',
      actor: e.actor || null,
      description: e.description || '',
      sourceDocument: filename,
      sourceLocation: e.sourceLocation || null,
      confidence: Math.max(0, Math.min(1, Number(e.confidence ?? 0.8))),
      sourceMime: mimeType,
    };
    events.push(norm);
  }
  return { events, model };
}

// ---- Public entry ----
export async function extractFactualEvents({ extractedText, filename, mimeType } = {}) {
  const text = (extractedText || '').trim();
  const meta = {
    provider: config.llm.apiKey ? 'LLM' : 'HEURISTIC',
    model: config.llm.apiKey ? (config.llm.model || 'gpt-4o-mini') : null,
    extractionVersion: 'timeline-v1',
    eventCount: 0,
    rejectedCount: 0,
    validationStatus: 'ok',
    fallbackReason: null,
  };

  if (!text) {
    meta.validationStatus = 'no_text';
    return { events: [], rejected: [], meta };
  }

  let rawEvents = [];
  let method = 'HEURISTIC';
  if (config.llm.apiKey) {
    try {
      const { raw, model } = await callLLM(text);
      const norm = normalizeLLM(raw, model, { filename, mimeType });
      if (norm) {
        rawEvents = norm.events;
        method = 'LLM';
        meta.model = model;
      } else {
        rawEvents = heuristicExtract({ extractedText: text, filename, mimeType });
        meta.fallbackReason = 'llm_schema_invalid';
      }
    } catch (e) {
      rawEvents = heuristicExtract({ extractedText: text, filename, mimeType });
      meta.fallbackReason = String(e.message).slice(0, 160);
    }
  } else {
    rawEvents = heuristicExtract({ extractedText: text, filename, mimeType });
  }
  meta.provider = method;

  // Schema validation + grounding. Valid -> events; invalid -> rejected[] (never persisted as valid).
  const events = [];
  const rejected = [];
  for (const e of rawEvents) {
    const problems = validateEvent({ ...e, sourceMime: mimeType });
    // Grounding: description must be supported by the source text (substring, case-insensitive).
    const grounded = !e.description || text.toLowerCase().includes(String(e.description).toLowerCase().slice(0, 40));
    if (problems.length || !grounded) {
      rejected.push({
        eventType: e.eventType,
        description: e.description,
        reason: problems.length ? problems.join(',') : 'ungrounded_claim',
      });
      continue;
    }
    events.push({
      eventType: e.eventType,
      date: e.date || null,
      time: e.time || null,
      datePrecision: e.datePrecision || (e.date ? 'date' : 'unknown'),
      actor: e.actor || null,
      description: e.description,
      sourceDocument: e.sourceDocument,
      sourceLocation: e.sourceLocation || null,
      confidence: Math.round((e.confidence ?? 0.9) * 100),
    });
  }
  // Chronological ordering: complete datetime, then date-only, then month-only, then unknown.
  events.sort((a, b) => {
    const ka = timelineKey(a), kb = timelineKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] < kb[1] ? -1 : 1;
    return a.eventType < b.eventType ? -1 : 1; // deterministic tiebreak
  });

  meta.eventCount = events.length;
  meta.rejectedCount = rejected.length;
  if (rejected.length) meta.validationStatus = events.length ? 'partial' : 'rejected';
  return { events, rejected, meta };
}

function timelineKey(e) {
  if (e.date) return [e.time ? 0 : 1, `${e.date}T${e.time || '00:00'}`];
  if (e.datePrecision === 'month') return [2, 'm'];
  return [3, 'z'];
}
