// Slice 6 — ERS repository: gather real inputs, compute, persist, return.
import { db, now } from '../db.js';
import { recordAudit } from '../services/audit.js';
import { computeErs, ERS_VERSION } from '../services/ers.js';

export function computeAndStoreErs(disputeId) {
  const dispute = db.prepare('SELECT id, reasonCode FROM disputes WHERE id = ?').get(disputeId);
  if (!dispute) {
    const err = new Error('Dispute not found');
    err.status = 404;
    throw err;
  }
  const evidence = db.prepare('SELECT id, processingStatus AS status, evidenceType, classificationMethod, confidence AS classificationConfidence, filename FROM evidence_documents WHERE disputeId = ?').all(disputeId);
  const events = db.prepare('SELECT id, evidenceId, confidence FROM factual_events WHERE disputeId = ?').all(disputeId);
  const contradictions = db.prepare("SELECT id FROM contradictions WHERE disputeId = ? AND reviewed = 0").all(disputeId);

  const { breakdown, gaps } = computeErs({
    evidence,
    events,
    contradictions,
    reasonCode: dispute.reasonCode,
  });

  const ts = now();
  db.prepare('UPDATE disputes SET ers = ?, ersBreakdown = ?, updatedAt = ? WHERE id = ?')
    .run(breakdown.score, JSON.stringify(breakdown), ts, disputeId);
  recordAudit({
    actor: 'AI ENGINE',
    eventType: 'ERS_COMPUTED',
    entityType: 'DISPUTE',
    entityId: disputeId,
    statusText: `ERS ${breakdown.score}/100 (${breakdown.label}) — ${breakdown.requiredPresent}/${breakdown.requiredTotal} required, ${breakdown.contradictionsFound} conflicts`,
    metadata: { version: ERS_VERSION, method: 'HEURISTIC' },
  });
  return { ...breakdown, gaps };
}

export function getErs(disputeId) {
  const row = db.prepare('SELECT ers, ersBreakdown FROM disputes WHERE id = ?').get(disputeId);
  if (!row) {
    const err = new Error('Dispute not found');
    err.status = 404;
    throw err;
  }
  const breakdown = row.ersBreakdown ? JSON.parse(row.ersBreakdown) : { score: row.ers || 0, label: 'Incomplete', requiredPresent: 0, requiredTotal: 0, recommendedComplete: 0, recommendedTotal: 0, contradictionsFound: 0 };
  return breakdown;
}

export function getGaps(disputeId) {
  const row = db.prepare('SELECT id, reasonCode FROM disputes WHERE id = ?').get(disputeId);
  if (!row) {
    const err = new Error('Dispute not found');
    err.status = 404;
    throw err;
  }
  const evidence = db.prepare('SELECT id, processingStatus AS status, evidenceType, classificationMethod, confidence AS classificationConfidence, filename FROM evidence_documents WHERE disputeId = ?').all(disputeId);
  const { gaps } = computeErs({ evidence, events: [], contradictions: [], reasonCode: row.reasonCode });
  return gaps;
}
