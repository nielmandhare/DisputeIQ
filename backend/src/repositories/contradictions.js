// Contradiction repository: detect, persist, list, review.
import { db, now } from '../db.js';
import { randomUUID } from 'node:crypto';
import { detectContradictions } from '../services/contradiction.js';
import { recordAudit } from '../services/audit.js';

/** Run the detector over a dispute's extracted evidence and persist fresh findings. */
export function detectAndStoreContradictions(disputeId) {
  // Clear previous auto-detected findings for a clean re-run, then re-detect.
  db.prepare('DELETE FROM contradictions WHERE disputeId = ? AND reviewed = 0').run(disputeId);
  const docs = db.prepare("SELECT id, extractedText AS text FROM evidence_documents WHERE disputeId = ? AND extractedText IS NOT NULL AND processingStatus = 'EXTRACTED'").all(disputeId);
  const findings = detectContradictions(docs);
  const ts = now();
  for (const f of findings) {
    const id = `con_${randomUUID().slice(0, 8)}`;
    db.prepare(`INSERT INTO contradictions
      (id, disputeId, type, severity, claimA, sourceA, claimB, sourceB, explanation, recommendedAction, confidence, method, reviewed, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(
      id, disputeId, f.type, f.severity, f.claimA, f.sourceA, f.claimB, f.sourceB,
      f.explanation, f.recommendedAction || null, f.confidence, f.method, ts,
    );
    recordAudit({
      actor: 'AI ENGINE', eventType: 'CONTRADICTION_DETECTED', entityType: 'CONTRADICTION', entityId: id,
      statusText: `${f.type} (${f.severity}) @${f.confidence}% via ${f.method}`,
      metadata: { type: f.type, severity: f.severity, confidence: f.confidence, method: f.method, sourceA: f.sourceA, sourceB: f.sourceB },
    });
  }
  return listForDispute(disputeId);
}

export function listForDispute(disputeId) {
  const rows = db.prepare('SELECT * FROM contradictions WHERE disputeId = ? ORDER BY createdAt DESC').all(disputeId);
  return rows.map(toShape);
}

export function markReviewed(id, reviewed = true) {
  db.prepare('UPDATE contradictions SET reviewed = ? WHERE id = ?').run(reviewed ? 1 : 0, id);
  recordAudit({
    actor: 'MERCHANT', eventType: 'CONTRADICTION_REVIEWED', entityType: 'CONTRADICTION', entityId: id,
    statusText: reviewed ? 'Marked reviewed' : 'Marked unreviewed',
  });
  return getById(id);
}

export function getById(id) {
  const row = db.prepare('SELECT * FROM contradictions WHERE id = ?').get(id);
  return row ? toShape(row) : null;
}

function toShape(r) {
  return {
    id: r.id,
    type: r.type,
    severity: r.severity,
    claimA: r.claimA,
    sourceA: sourceLabel(r.sourceA),
    claimB: r.claimB,
    sourceB: sourceLabel(r.sourceB),
    explanation: r.explanation,
    recommendedAction: r.recommendedAction || undefined,
    confidence: r.confidence,
    method: r.method,
    reviewed: Boolean(r.reviewed),
    createdAt: new Date(r.createdAt * 1000).toISOString(),
  };
}

// Map an evidence id to a display filename (fallback to id if missing).
function sourceLabel(evId) {
  const row = db.prepare('SELECT filename FROM evidence_documents WHERE id = ?').get(evId);
  return row ? row.filename : evId;
}
