// Factual-timeline repository: extract, persist (idempotent replace), list.
import { db, now } from '../db.js';
import { randomUUID } from 'node:crypto';
import { extractFactualEvents } from '../services/timeline.js';
import { recordAudit } from '../services/audit.js';

/**
 * Run the timeline extraction engine on an evidence record and persist events.
 * Replaces any prior events for this evidence (versioned replacement semantics,
 * consistent with Slice 3 classification). Operates ONLY on extracted text.
 */
export async function runTimelineExtraction(id) {
  const row = db.prepare('SELECT * FROM evidence_documents WHERE id = ?').get(id);
  if (!row) {
    const err = new Error('Evidence not found');
    err.status = 404;
    throw err;
  }
  if (row.processingStatus !== 'EXTRACTED' || !row.extractedText) {
    db.prepare("UPDATE evidence_documents SET timelineStatus=?, updatedAt=? WHERE id=?").run('TIMELINE_SKIPPED', now(), id);
    return { status: 'SKIPPED', reason: 'extraction_unavailable', events: [] };
  }

  const started = now();
  let result;
  try {
    result = await extractFactualEvents({ extractedText: row.extractedText, filename: row.filename, mimeType: row.mimeType, disputeId: row.disputeId, evidenceId: id });
  } catch (e) {
    db.prepare("UPDATE evidence_documents SET timelineStatus=?, updatedAt=? WHERE id=?").run('TIMELINE_FAILED', now(), id);
    recordAudit({ actor: 'AI ENGINE', eventType: 'TIMELINE_FAILED', entityType: 'EVIDENCE', entityId: id, statusText: String(e.message).slice(0, 160) });
    return { status: 'FAILED', reason: String(e.message).slice(0, 160), events: [] };
  }

  // Idempotent replacement: clear previous events for this evidence, then insert fresh.
  db.prepare('DELETE FROM factual_events WHERE evidenceId = ?').run(id);
  const ts = now();
  for (const ev of result.events) {
    const fid = `fe_${randomUUID().slice(0, 8)}`;
    db.prepare(`INSERT INTO factual_events
      (id, evidenceId, disputeId, eventType, eventDate, eventTime, datePrecision, actor, description, sourceDocument, sourceLocation, confidence, extractionVersion, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      fid, id, row.disputeId, ev.eventType, ev.date || null, ev.time || null, ev.datePrecision || 'unknown',
      ev.actor || null, ev.description, ev.sourceDocument || row.filename, ev.sourceLocation || null,
      ev.confidence ?? 90, result.meta.extractionVersion || 'timeline-v1', ts,
    );
  }

  const duration = now() - started;
  const status = result.events.length ? 'TIMELINE_COMPLETED' : 'TIMELINE_REVIEW_REQUIRED';
  db.prepare('UPDATE evidence_documents SET timelineStatus=?, updatedAt=? WHERE id=?').run(status, now(), id);
  recordAudit({
    actor: 'AI ENGINE', eventType: 'TIMELINE_EXTRACTED', entityType: 'EVIDENCE', entityId: id,
    statusText: `${result.events.length} events via ${result.meta.provider}${result.meta.fallbackReason ? ` (fallback: ${result.meta.fallbackReason})` : ''}`,
    metadata: {
      provider: result.meta.provider, model: result.meta.model || null, eventCount: result.events.length,
      rejectedCount: result.rejected?.length || 0, validationStatus: result.meta.validationStatus,
      extractionVersion: result.meta.extractionVersion, processingDuration: duration, fallback: Boolean(result.meta.fallbackReason),
    },
  });
  return { status, events: result.events, rejected: result.rejected || [], meta: result.meta };
}

export function listForEvidence(evidenceId) {
  const rows = db.prepare('SELECT * FROM factual_events WHERE evidenceId = ? ORDER BY eventDate IS NULL, eventDate, eventTime, eventType').all(evidenceId);
  return rows.map(toShape);
}

export function listForDispute(disputeId) {
  const rows = db.prepare('SELECT * FROM factual_events WHERE disputeId = ? ORDER BY eventDate IS NULL, eventDate, eventTime, eventType').all(disputeId);
  return rows.map(toShape);
}

export function getById(id) {
  const row = db.prepare('SELECT * FROM factual_events WHERE id = ?').get(id);
  return row ? toShape(row) : null;
}

function toShape(r) {
  return {
    id: r.id,
    evidenceId: r.evidenceId,
    disputeId: r.disputeId,
    eventType: r.eventType,
    date: r.eventDate || null,
    time: r.eventTime || null,
    datePrecision: r.datePrecision,
    actor: r.actor || null,
    description: r.description,
    sourceDocument: r.sourceDocument,
    sourceLocation: r.sourceLocation || null,
    confidence: Number(r.confidence),
    extractionVersion: r.extractionVersion,
    createdAt: new Date(r.createdAt * 1000).toISOString(),
  };
}
