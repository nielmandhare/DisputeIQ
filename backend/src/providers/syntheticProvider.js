// SyntheticDisputeProvider — ingests the SYNTHETIC 100-dispute evaluation
// dataset into the local database so the existing DisputeIQ pipeline
// (classification, timeline, contradiction, ERS, drafting) runs over realistic
// content.
//
// This is STRICTLY a synthetic evaluation/demo data source. It is kept fully
// separate from RazorpayDisputeProvider. Synthetic disputes are stamped
// provider='demo' and ids use the `dupu_demo_###` namespace so they can never
// be confused with real Razorpay disputes (`dupu_...`). The synthetic records
// are clearly labelled (raw.synthetic:true).
//
// Ingestion is HEURISTIC and DETERMINISTIC (no LLM calls) so loading 100
// disputes is fast and free, and the evaluation is reproducible. Per-dispute
// LLM analysis remains available on demand via the normal API.
//
// The dataset itself is NOT regenerated here — it is produced by
// syntheticDataset.js (deterministic, seeded). This provider only loads it
// through the real pipeline and records real audit events.
import { db, now } from '../db.js';
import { config } from '../config.js';
import { randomUUID } from 'node:crypto';
import { generateSyntheticDisputes } from './syntheticDataset.js';
import { detectAndStoreContradictions } from '../repositories/contradictions.js';
import { runTimelineExtraction } from '../repositories/timeline.js';
import { computeAndStoreErs } from '../repositories/ers.js';
import { generateForDispute, approveDraft } from '../repositories/responseDraft.js';
import { recordAudit } from '../services/audit.js';

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
  // Real audit event: the synthetic dispute entered the system.
  recordAudit({
    actor: 'SYSTEM', eventType: 'DISPUTE_RECEIVED', entityType: 'DISPUTE', entityId: internalId,
    statusText: `Synthetic dispute ${d.id} (${d.scenarioKey}) loaded via SyntheticDisputeProvider`,
    metadata: { scenario: d.scenarioKey, reasonCode: d.reasonCode, synthetic: true },
  });
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
 * heuristic pipeline (contradiction + ERS + draft) over each. Returns a summary
 * including the real scenario distribution so the UI can display it.
 */
export function loadDemoDataset(count = 100, { regenerateDrafts = true, seed = 20260601 } = {}) {
  const disputes = generateSyntheticDisputes(count, seed);
  const loadedIds = [];
  let evidenceCount = 0;
  let ocrCount = 0;
  const scenarioCounts = {};
  // Force HEURISTIC drafting during bulk ingestion so loading 100 disputes is
  // fast + free (no 100 LLM calls). Real LLM analysis stays available per-dispute.
  const savedKey = config.llm.apiKey;
  config.llm.apiKey = '';
  try {
    for (const d of disputes) {
      const internalId = ensureDemoDispute(d);
      loadedIds.push(internalId);
      scenarioCounts[d.scenarioKey] = (scenarioCounts[d.scenarioKey] || 0) + 1;
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
    scenarioDistribution: scenarioCounts,
    datasetSeed: seed,
  };
}

/** Clear all demo disputes (and their cascaded evidence/contradictions/etc),
 *  plus the audit + AI-analysis events + submissions that reference them, so a
 *  reseed starts clean. Children are deleted BEFORE the disputes themselves so
 *  the id-based cleanups still find their parent rows. */
export function clearDemoDataset() {
  const rows = db.prepare("SELECT id FROM disputes WHERE provider='demo'").all();
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  // Children FIRST (disputes still exist, so FK-less references resolve).
  db.prepare(`DELETE FROM audit_events WHERE entityType='DISPUTE' AND entityId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM ai_analysis_events WHERE disputeId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM submissions WHERE disputeId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM audit_events WHERE entityType='EVIDENCE' AND entityId IN (SELECT id FROM evidence_documents WHERE disputeId IN (${placeholders}))`).run(...ids);
  db.prepare("DELETE FROM audit_events WHERE entityType='WEBHOOK_EVENT'").run();
  // Now the disputes (cascades evidence/contradictions/timeline/etc).
  db.prepare(`DELETE FROM disputes WHERE id IN (${placeholders})`).run(...ids);
  return ids.length;
}

export const SyntheticDisputeProvider = { loadDemoDataset, clearDemoDataset, generateSyntheticDisputes };
