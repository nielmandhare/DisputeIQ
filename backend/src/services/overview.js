// Overview / command-center aggregate. All values are computed from the real
// backend dataset + pipeline state — nothing hardcoded. Re-run /api/overview
// after a reseed and the numbers change with the data.
import { db, now } from '../db.js';
import { evidenceStats } from '../repositories/evidence.js';
import { listAuditAll } from './audit.js';

// Operational readiness thresholds (mirror evaluation.js contestReady logic).
const CONTEST_READY_ERS = 72;

export function buildOverview() {
  const disputes = db.prepare('SELECT id, status, ers, responseStatus, amount FROM disputes').all();
  const total = disputes.length;
  const totalAmountInr = disputes.reduce((s, d) => s + (d.amount || 0), 0);
  const ersValues = disputes.map((d) => (d.ers != null ? d.ers : 0));
  const avgErs = total ? Math.round(ersValues.reduce((a, b) => a + b, 0) / total) : 0;

  // Real per-dispute operational buckets derived from pipeline state.
  const contradictionCounts = db
    .prepare(`SELECT disputeId, COUNT(*) c FROM contradictions GROUP BY disputeId`)
    .all()
    .reduce((m, r) => { m[r.disputeId] = r.c; return m; }, {});

  let contestReady = 0; // ERS >= threshold AND a valid draft exists
  let needsEvidence = 0; // ERS below the sufficient-evidence bar
  let hasContradiction = 0;
  let submitted = 0; // merchant approved a draft (real human action)
  let resolved = 0; // won / lost / closed at the gateway

  for (const d of disputes) {
    const cc = contradictionCounts[d.id] || 0;
    const ers = d.ers != null ? d.ers : 0;
    if (cc > 0) hasContradiction += 1;
    if (d.responseStatus === 'APPROVED') submitted += 1;
    if (['won', 'lost', 'closed'].includes(d.status)) resolved += 1;
    if (ers >= CONTEST_READY_ERS) contestReady += 1;
    else needsEvidence += 1;
  }

  const ev = evidenceStats();

  return {
    generatedAt: new Date(now() * 1000).toISOString(),
    totalDisputes: total,
    totalAmountInr: Math.round(totalAmountInr / 100), // stored in paise -> INR
    avgErs,
    buckets: {
      contestReady,
      needsEvidence,
      hasContradiction,
      submitted,
      resolved,
    },
    evidence: {
      total: ev.total,
      extracted: ev.extracted,
      ocrRequired: ev.ocrRequired,
      failed: ev.failed,
      classified: ev.classified,
      contradictions: ev.contradictions,
    },
    recentActivity: listAuditAll({ limit: 8 }).map((e) => ({
      id: e.id,
      eventType: e.eventType,
      actor: e.actor,
      statusText: e.statusText,
      entityType: e.entityType,
      entityId: e.entityId,
      timestamp: e.timestamp,
    })),
  };
}
