// Slice 6 — Evidence Readiness Score (ERS).
// Computes a grounded 0-100 readiness score from REAL extracted/classified data:
//   - evidence presence + extraction success
//   - classification coverage + confidence (grounded spans)
//   - timeline grounding (fraction of docs with >=1 grounded event, event confidence)
//   - completeness vs required evidence types for the dispute reason code
//   - unresolved-contradiction penalty
//
// Deterministic and provider-independent. No LLM call. Never fabricates a score:
// inputs are real counts drawn from evidence_documents / factual_events / contradictions.

export const ERS_VERSION = 'ers-v1';

// Required / recommended evidence types per Razorpay reason code (closed map).
// Types MUST match the classifier taxonomy (src/services/classifier.js).
const REASON_REQUIRED = {
  non_receipt_of_goods: ['SHIPPING_OR_DELIVERY', 'INVOICE_OR_RECEIPT', 'COMMUNICATION'],
  non_receipt_of_services: ['INVOICE_OR_RECEIPT', 'COMMUNICATION', 'SERVICE_RECORD'],
  product_not_as_described: ['PRODUCT_PHOTO', 'INVOICE_OR_RECEIPT', 'COMMUNICATION'],
  credit_not_processed: ['REFUND_OR_CANCELLATION', 'INVOICE_OR_RECEIPT', 'COMMUNICATION'],
  cancelled_recurring_payment: ['REFUND_OR_CANCELLATION', 'INVOICE_OR_RECEIPT', 'COMMUNICATION'],
  duplicate_transaction: ['INVOICE_OR_RECEIPT', 'COMMUNICATION', 'PAYMENT_RECORD'],
  fraudulent_transaction: ['IDENTITY_OR_KYC', 'COMMUNICATION', 'INVOICE_OR_RECEIPT'],
  general: ['INVOICE_OR_RECEIPT', 'COMMUNICATION', 'SHIPPING_OR_DELIVERY'],
};
// Evidence types that are "nice to have" and lift the recommended metric.
const REASON_RECOMMENDED = {
  non_receipt_of_goods: ['IDENTITY_OR_KYC', 'LEGAL_OR_DISPUTE_RESPONSE'],
  product_not_as_described: ['SHIPPING_OR_DELIVERY', 'LEGAL_OR_DISPUTE_RESPONSE'],
  credit_not_processed: ['SHIPPING_OR_DELIVERY'],
  fraudulent_transaction: ['SHIPPING_OR_DELIVERY'],
  general: ['REFUND_OR_CANCELLATION', 'LEGAL_OR_DISPUTE_RESPONSE'],
  non_receipt_of_services: ['SERVICE_RECORD'],
  cancelled_recurring_payment: ['LEGAL_OR_DISPUTE_RESPONSE'],
  duplicate_transaction: ['LEGAL_OR_DISPUTE_RESPONSE'],
};
const TYPE_LABEL = {
  INVOICE_OR_RECEIPT: 'Invoice / payment receipt',
  SHIPPING_OR_DELIVERY: 'Delivery / shipping proof',
  COMMUNICATION: 'Customer communication',
  REFUND_OR_CANCELLATION: 'Refund or cancellation record',
  IDENTITY_OR_KYC: 'Identity / KYC proof',
  PRODUCT_PHOTO: 'Product photo / listing',
  LEGAL_OR_DISPUTE_RESPONSE: 'Legal / dispute response',
  OTHER: 'Other supporting document',
  SERVICE_RECORD: 'Service completion record',
  PAYMENT_RECORD: 'Payment record',
};

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
// Confidence is stored 0-100 in the DB; normalize to 0-1 for the score math.
function normConf(n) {
  const v = Number(n) || 0;
  return v > 1 ? v / 100 : v;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
export function labelFor(score) {
  if (score >= 85) return 'Strong';
  if (score >= 65) return 'Moderate';
  if (score >= 40) return 'Weak';
  return 'Incomplete';
}

/**
 * Compute the grounded ERS breakdown from real data.
 * @param {object} input
 * @param {Array} input.evidence   rows from evidence_documents (must include status, classificationMethod, classificationConfidence, evidenceType, filename)
 * @param {Array} input.events     rows from factual_events
 * @param {Array} input.contradictions  rows from contradictions (unresolved)
 * @param {string} input.reasonCode
 */
export function computeErs({ evidence = [], events = [], contradictions = [], reasonCode = 'general' } = {}) {
  const required = REASON_REQUIRED[reasonCode] || REASON_REQUIRED.general;
  const recommended = REASON_RECOMMENDED[reasonCode] || [];

  // Only EXTRACTED docs count (OCR_REQUIRED / failed are not usable evidence).
  const usable = evidence.filter((e) => e.status === 'EXTRACTED');
  const classified = usable.filter((e) => e.classificationMethod && e.evidenceType);

  // --- Gap analysis (required + recommended) ---
  const presentTypes = new Set(classified.map((e) => e.evidenceType));
  const fileFor = (type) => classified.find((e) => e.evidenceType === type)?.filename || null;
  const gaps = required.map((type) => {
    const present = presentTypes.has(type);
    return {
      evidenceType: type,
      label: TYPE_LABEL[type] || type,
      required: true,
      present,
      detail: present ? fileFor(type) : `Missing required: ${TYPE_LABEL[type] || type}`,
      confidence: present ? (classified.find((e) => e.evidenceType === type)?.classificationConfidence ?? undefined) : undefined,
    };
  }).concat(recommended.map((type) => {
    const present = presentTypes.has(type);
    return {
      evidenceType: type,
      label: TYPE_LABEL[type] || type,
      required: false,
      present,
      detail: present ? fileFor(type) : `Recommended: ${TYPE_LABEL[type] || type}`,
      confidence: present ? (classified.find((e) => e.evidenceType === type)?.classificationConfidence ?? undefined) : undefined,
    };
  }));

  const requiredPresent = gaps.filter((g) => g.required && g.present).length;
  const requiredTotal = gaps.filter((g) => g.required).length;
  const recommendedComplete = gaps.filter((g) => !g.required && g.present).length;
  const recommendedTotal = gaps.filter((g) => !g.required).length;

  // --- Score components (deterministic, grounded) ---
  // 1. Presence of usable extracted evidence (up to 35).
  const presence = usable.length > 0 ? 35 : 0;
  // 2. Classification coverage * avg confidence (up to 25).
  const classConf = avg(classified.map((e) => normConf(e.classificationConfidence))); // 0..1
  const coverage = classified.length > 0 ? classConf * 25 : 0;
  // 3. Timeline grounding: fraction of usable docs with >=1 event * avg event confidence (up to 20).
  const docIdsWithEvents = new Set(events.map((ev) => ev.evidenceId));
  const docsWithEvents = usable.filter((e) => docIdsWithEvents.has(e.id)).length;
  const eventConf = avg(events.map((ev) => normConf(ev.confidence))); // 0..1
  const grounding = usable.length > 0 ? (docsWithEvents / usable.length) * (eventConf || 0) * 20 : 0;
  // 4. Completeness vs required types (up to 20).
  const completeness = requiredTotal > 0 ? (requiredPresent / requiredTotal) * 20 : 20;

  let score = presence + coverage + grounding + completeness;
  // Unresolved contradiction penalty (-15 each).
  const contradictionPenalty = 15 * (contradictions.length || 0);
  score = clamp(Math.round(score - contradictionPenalty), 0, 100);

  const breakdown = {
    score,
    label: labelFor(score),
    requiredPresent,
    requiredTotal,
    recommendedComplete,
    recommendedTotal,
    contradictionsFound: contradictions.length || 0,
    version: ERS_VERSION,
  };
  return { breakdown, gaps };
}
