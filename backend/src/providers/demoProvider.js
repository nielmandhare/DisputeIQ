// DemoDisputeProvider — ingests the SYNTHETIC 100-dispute evaluation dataset
// into the local database so the existing DisputeIQ pipeline (classification,
// timeline, contradiction, ERS, drafting) runs over realistic content.
//
// This is STRICTLY a demo/evaluation data source. It is kept fully separate
// from RazorpayDisputeProvider. Synthetic disputes are stamped provider='demo'
// and ids use the `dupu_demo_###` namespace so they can never be confused with
// real Razorpay disputes (`dupu_...`).
//
// Ingestion is HEURISTIC and DETERMINISTIC (no LLM calls) so loading 100
// disputes is fast and free, and the evaluation is reproducible. Per-dispute
// LLM analysis remains available on demand via the normal API.
import { db, now } from '../db.js';
import { config } from '../config.js';
import { randomUUID } from 'node:crypto';
import { generateSyntheticDisputes } from './syntheticDataset.js';
import { detectAndStoreContradictions } from '../repositories/contradictions.js';
import { runTimelineExtraction } from '../repositories/timeline.js';
import { computeAndStoreErs } from '../repositories/ers.js';
import { generateForDispute, approveDraft } from '../repositories/responseDraft.js';

const REASON_LABELS = {
  non_receipt_of_goods: 'Non-receipt of goods',
  non_receipt_of_services: 'Non-receipt of services',
  credit_not_processed: 'Credit not processed',
  cancelled_recurring_payment: 'Cancelled recurring payment',
  product_not_as_described: 'Product not as described',
  duplicate_transaction: 'Duplicate transaction',
  fraudulent_transaction: 'Fraudulent transaction',
  general: 'General',
};

function ensureDemoDispute(d) {
  const existing = db.prepare('SELECT id FROM disputes WHERE razorpayDisputeId = ?').get(d.id);
  if (existing) return existing.id;
  const internalId = `disp_demo_${randomUUID().slice(0, 8)}`;
  const ts = now();
  db.prepare(`INSERT INTO disputes
    (id, razorpayDisputeId, razorpayPaymentId, razorpayOrderId, amount, currency, reasonCode, reasonLabel,
     phase, status, createdAtRzp, deadlineRzp, provider, raw, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, ?, ?)`).run(
    internalId, d.id, `pay_demo_${d.id}`, `order_demo_${d.id}`, d.amountInr * 100, d.currency,
    d.reasonCode, d.reasonLabel || REASON_LABELS[d.reasonCode] || 'General',
    'pre_dispute', 'open', d.createdAt, d.deadlineAt,
    JSON.stringify({ scenario: d.scenarioKey, synthetic: true }), ts, ts,
  );
  return internalId;
}

function insertEvidence(internalId, ev) {
  const id = `ev_demo_${randomUUID().slice(0, 8)}`;
  const ts = now();
  const status = ev.ocrRequired ? 'OCR_REQUIRED' : 'EXTRACTED';
  const method = ev.ocrRequired ? null : 'HEURISTIC';
  db.prepare(`INSERT INTO evidence_documents
    (id, disputeId, filename, safeName, mimeType, size, storageLocation, processingStatus,
     extractionMethod, extractedText, evidenceType, confidence, classificationMethod, classificationSource, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, internalId, ev.name, `demo_${ev.name}`, 'text/plain', (ev.text || '').length || 1, `demo/${internalId}`,
    status, method, ev.text || null, ev.type, 90, method, method, ts, ts,
  );
  // Provenance row for the heuristic classification.
  const cid = `evc_demo_${randomUUID().slice(0, 8)}`;
  db.prepare(`INSERT INTO evidence_classifications
    (id, evidenceId, disputeId, evidenceType, confidence, method, model, signals, sourceSpans, sourceText, fallbackReason, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    cid, id, internalId, ev.type, 90, 'HEURISTIC', null, '[]', '[]', null, null, ts,
  );
  return id;
}

/**
 * Load `count` synthetic disputes (default 100) into the DB and run the
 * heuristic pipeline (contradiction + ERS + draft) over each. Returns a summary.
 */
export function loadDemoDataset(count = 100, { regenerateDrafts = true, seed = 20260601 } = {}) {
  const disputes = generateSyntheticDisputes(count, seed);
  const loadedIds = [];
  let evidenceCount = 0;
  let ocrCount = 0;
  // Force HEURISTIC drafting during bulk ingestion so loading 100 disputes is
  // fast + free (no 100 LLM calls). Real LLM analysis stays available per-dispute.
  const savedKey = config.llm.apiKey;
  config.llm.apiKey = '';
  try {
  for (const d of disputes) {
    const internalId = ensureDemoDispute(d);
    loadedIds.push(internalId);
    for (const ev of d.evidence) {
      const evId = insertEvidence(internalId, ev);
      evidenceCount++;
      if (ev.ocrRequired) ocrCount++;
      else if (ev.text) { try { runTimelineExtraction(evId); } catch { /* non-fatal */ } }
    }
    detectAndStoreContradictions(internalId);
    computeAndStoreErs(internalId);
    if (regenerateDrafts) {
      try {
        generateForDispute(internalId);
        // Approve drafts that are valid + fully grounded so they are contest-ready
        // in the demo queue (the human still gates any real submission).
        const draft = db.prepare('SELECT status, valid, metrics FROM response_drafts WHERE disputeId=? ORDER BY draftVersion DESC LIMIT 1').get(internalId);
        if (draft && draft.status === 'DRAFT_READY' && draft.valid) {
          try { approveDraft(internalId); } catch { /* non-fatal */ }
        }
      } catch { /* non-fatal */ }
    }
  }
  } finally {
    config.llm.apiKey = savedKey;
  }
  return {
    provider: 'demo',
    loaded: loadedIds.length,
    evidenceCount,
    ocrRequired: ocrCount,
    datasetSeed: seed,
  };
}

/** Clear all demo disputes (and their cascaded evidence/contradictions/etc). */
export function clearDemoDataset() {
  const rows = db.prepare("SELECT id FROM disputes WHERE provider='demo'").all();
  for (const r of rows) {
    db.prepare('DELETE FROM disputes WHERE id=?').run(r.id);
  }
  return rows.length;
}

export const DemoDisputeProvider = { loadDemoDataset, clearDemoDataset, generateSyntheticDisputes };
