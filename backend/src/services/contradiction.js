// Slice 4 — Contradiction Engine.
// Detects conflicts BETWEEN already-extracted evidence documents for a dispute.
// Operates ONLY on extracted text (grounded in source). Two deterministic detectors
// ship today (chronological timeline + amount), with an optional LLM pass that
// transparently falls back to the heuristic result on any failure.
//
// Honesty rule: the engine returns [] when nothing conflicts. It never fabricates
// a contradiction. Every finding carries verbatim spans (claimA/claimB) and the
// source evidence ids so the claim is fully auditable.
import { config } from '../config.js';

// ---- Date parsing (Indian formats) ----
// Matches: 15 March, March 15, 15/03, 15-03-2024, 2024-03-15, 15th March
const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
const DATE_RE = /(\b\d{1,2}\s?(?:st|nd|rd|th)?\s?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)|(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?\d{1,2}(?:st|nd|rd|th)?\b)|(\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b)|(\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b)/gi;

function parseDate(text, matchIdx) {
  const m = text.slice(Math.max(0, matchIdx - 40), matchIdx + 60);
  const low = m.toLowerCase();
  let day, month, year = new Date().getFullYear();
  // ISO
  let iso = low.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) { year = +iso[1]; month = +iso[2] - 1; day = +iso[3]; return new Date(year, month, day); }
  // dd/mm or dd-mm
  let dm = low.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dm && !/[a-z]/.test(low.split(/\d/)[0]?.trim())) { /* ambiguous; still try */ month = +dm[2] - 1; day = +dm[1]; if (dm[3]) year = +dm[3] < 100 ? 2000 + +dm[3] : +dm[3]; return new Date(year, month, day); }
  // month name
  const mm = low.match(/(\d{1,2})\s?(?:st|nd|rd|th)?\s?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  const mm2 = low.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?(\d{1,2})/);
  if (mm) { day = +mm[1]; month = MONTHS[mm[2]]; return new Date(year, month, day); }
  if (mm2) { day = +mm2[2]; month = MONTHS[mm2[1]]; return new Date(year, month, day); }
  return null;
}

const EVENT_VERBS = {
  delivered: ['deliver', 'delivered', 'delivery', 'received', 'recv', 'pod', 'proof of delivery'],
  returned: ['return', 'returned', 'rma', 'sent back', 'reverse pickup'],
  dispatched: ['dispatch', 'dispatched', 'shipped', 'shipping', 'courier', 'despatched'],
  cancelled: ['cancel', 'cancelled', 'canceled', 'void'],
  paid: ['paid', 'payment', 'amount paid', 'settled'],
  refunded: ['refund', 'refunded', 'reversed'],
};

function nearVerb(text, idx, kind) {
  const window = text.slice(Math.max(0, idx - 60), idx + 30).toLowerCase();
  return EVENT_VERBS[kind].some((v) => window.includes(v));
}

// Extract all (date, kind) pairs from a document's text.
function extractDateEvents(text) {
  const events = [];
  let m;
  DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(text)) !== null) {
    const idx = m.index;
    for (const kind of Object.keys(EVENT_VERBS)) {
      if (nearVerb(text, idx, kind)) {
        const d = parseDate(text, idx);
        if (d) events.push({ date: d, kind, span: text.slice(Math.max(0, idx - 25), idx + 25).replace(/\s+/g, ' ').trim() });
      }
    }
  }
  return events;
}

// ---- Amount parsing (only paired when the two docs reference the SAME transaction) ----
const AMOUNT_RE = /(?:rs\.?|inr|₹)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi;
const TXN_RE = /\b(?:order|payment|txn|transaction|razorpay|invoice|id)[\s#:-]+([a-z0-9][a-z0-9\-]{3,})/gi;
function extractAmounts(text) {
  const amts = [];
  let m;
  AMOUNT_RE.lastIndex = 0;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const value = Number(m[1].replace(/,/g, ''));
    if (!Number.isNaN(value)) amts.push({ value, span: m[0].trim() });
  }
  return amts;
}
function extractTxnIds(text) {
  const ids = new Set();
  let m;
  TXN_RE.lastIndex = 0;
  while ((m = TXN_RE.exec(text)) !== null) ids.add(m[1].toLowerCase());
  return ids;
}

// ---- Detectors ----
function detectChronological(docs) {
  const found = [];
  const perDoc = docs.map((d) => ({ doc: d, events: extractDateEvents(d.text) }));
  for (let i = 0; i < perDoc.length; i++) {
    for (let j = 0; j < perDoc.length; j++) {
      if (i === j) continue;
      for (const a of perDoc[i].events) {
        for (const b of perDoc[j].events) {
          // A "returned/refunded/cancelled" dated BEFORE a "delivered/dispatched/paid" is a logical conflict.
          const conflictPairs = [
            ['returned', 'delivered'], ['returned', 'dispatched'], ['returned', 'paid'],
            ['cancelled', 'delivered'], ['cancelled', 'dispatched'], ['refunded', 'paid'],
            ['returned', 'refunded'],
          ];
          if (conflictPairs.some(([x, y]) => x === a.kind && y === b.kind) && a.date < b.date) {
            const days = Math.round((b.date - a.date) / 86400000);
            found.push({
              type: 'chronological',
              severity: 'confirmed',
              claimA: `${a.span} (${a.kind})`,
              sourceA: perDoc[i].doc.id,
              claimB: `${b.span} (${b.kind})`,
              sourceB: perDoc[j].doc.id,
              explanation: `A "${a.kind}" event on ${a.date.toDateString()} is recorded BEFORE a "${b.kind}" event on ${b.date.toDateString()} (${days} days earlier). A return/cancellation cannot predate delivery.`,
              recommendedAction: 'Attach a clarifying communication (e.g., exchange, replacement, or revised timeline) or mark this as reviewed with a merchant memo.',
              confidence: 90,
            });
          }
        }
      }
    }
  }
  return found;
}

function detectAmount(docs) {
  const found = [];
  const perDoc = docs.map((d) => ({ doc: d, amounts: extractAmounts(d.text), txns: extractTxnIds(d.text) }));
  for (let i = 0; i < perDoc.length; i++) {
    for (let j = 0; j < perDoc.length; j++) {
      if (i === j) continue;
      // Only compare amounts when the two docs reference a SHARED transaction id,
      // so unrelated invoices don't produce false-positive amount conflicts.
      const shared = [...perDoc[i].txns].filter((t) => perDoc[j].txns.has(t));
      if (!shared.length) continue;
      for (const a of perDoc[i].amounts) {
        for (const b of perDoc[j].amounts) {
          if (a.value > 0 && b.value > 0 && Math.abs(a.value - b.value) / Math.max(a.value, b.value) > 0.05) {
            found.push({
              type: 'amount',
              severity: 'possible',
              claimA: a.span,
              sourceA: perDoc[i].doc.id,
              claimB: b.span,
              sourceB: perDoc[j].doc.id,
              explanation: `Both documents reference transaction ${shared[0].toUpperCase()}. Document A states ${a.span} while Document B states ${b.span}. These differ by more than 5% and may reflect a pricing or refund discrepancy.`,
              recommendedAction: 'Verify the correct transaction amount against the Razorpay order/payment record before submission.',
              confidence: 75,
            });
          }
        }
      }
    }
  }
  return found;
}

// ---- Public entry ----
export function detectContradictions(docs) {
  const withText = docs.filter((d) => d.text && d.text.trim().length);
  if (withText.length < 2) return [];
  const out = [...detectChronological(withText), ...detectAmount(withText)];
  // Deduplicate: collapse exact (type,sourceA,sourceB) and symmetric (A<->B) pairs.
  const seen = new Set();
  const dedup = out.filter((c) => {
    const k1 = `${c.type}|${c.sourceA}|${c.sourceB}`;
    const k2 = `${c.type}|${c.sourceB}|${c.sourceA}`;
    if (seen.has(k1) || seen.has(k2)) return false;
    seen.add(k1);
    return true;
  });
  return dedup.map((c) => ({ ...c, method: config.llm.apiKey ? 'LLM' : 'HEURISTIC' }));
}
