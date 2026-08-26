// Append-only audit log. Every significant backend operation is recorded here.
import { randomUUID } from 'node:crypto';
import { db, now } from '../db.js';

/**
 * @param {object} e
 * @param {string} e.actor        RAZORPAY API | SYSTEM | MERCHANT | AI ENGINE
 * @param {string} e.eventType    e.g. WEBHOOK_PROCESSED, DISPUTE_RECEIVED
 * @param {string} [e.entityType] DISPUTE | WEBHOOK_EVENT | EVIDENCE ...
 * @param {string} [e.entityId]
 * @param {string} [e.statusText]
 * @param {object} [e.metadata]
 * @param {string} [e.requestId]
 */
export function recordAudit(e) {
  const id = `aud_${randomUUID().slice(0, 8)}`;
  const ts = now();
  db.prepare(
    `INSERT INTO audit_events (id, timestamp, actor, eventType, entityType, entityId, statusText, metadata, requestId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, ts, e.actor, e.eventType, e.entityType || null, e.entityId || null,
    e.statusText || null, e.metadata ? JSON.stringify(e.metadata) : null, e.requestId || null,
  );
  return id;
}

export function listAuditForDispute(disputeId) {
  const rows = db.prepare(
    `SELECT * FROM audit_events WHERE entityId = ? ORDER BY timestamp DESC`
  ).all(disputeId);
  // Map to the frontend AuditEvent shape (see frontend/src/types).
  return rows.map((r) => ({
    id: r.id,
    timestamp: new Date(r.timestamp * 1000).toISOString(),
    eventType: r.eventType,
    actor: r.actor,
    statusText: r.statusText,
    badge: badgeFor(r.eventType),
    entityType: r.entityType || undefined,
    entityId: r.entityId || undefined,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
  }));
}

// Cross-dispute activity feed (Checkpoint 5 — global Activity page).
// Returns the most recent audit events across all entities, with optional
// actor/entityType filters parsed from query string.
export function listAuditAll({ limit = 200, actor, entityType } = {}) {
  const where = [];
  const params = [];
  if (actor) { where.push('actor = ?'); params.push(actor); }
  if (entityType) { where.push('entityType = ?'); params.push(entityType); }
  const sql = `SELECT * FROM audit_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY timestamp DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit);
  return rows.map((r) => ({
    id: r.id,
    timestamp: new Date(r.timestamp * 1000).toISOString(),
    eventType: r.eventType,
    actor: r.actor,
    statusText: r.statusText,
    badge: badgeFor(r.eventType),
    entityType: r.entityType || undefined,
    entityId: r.entityId || undefined,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
  }));
}

export function auditCount() {
  return db.prepare('SELECT COUNT(*) c FROM audit_events').get().c;
}

export function exportAuditCSV(disputeId) {
  const rows = db.prepare(
    `SELECT timestamp, eventType, actor, statusText FROM audit_events WHERE entityId = ? ORDER BY timestamp ASC`
  ).all(disputeId);
  const head = 'timestamp,event_type,actor,status';
  const body = rows.map((r) =>
    [new Date(r.timestamp * 1000).toISOString(), r.eventType, r.actor, (r.statusText || '').replace(/,/g, ' ')].join(','),
  );
  return [head, ...body].join('\n');
}

export function exportAuditJSON(disputeId) {
  return JSON.stringify(listAuditForDispute(disputeId), null, 2);
}

function badgeFor(type) {
  if (type.includes('FAILED') || type.includes('CONTRADICTION')) return 'red';
  if (type.includes('CREATED') || type.includes('RECEIVED') || type.includes('UPLOADED')) return 'blue';
  if (type.includes('SUCCEEDED') || type.includes('VERIFIED') || type.includes('PROCESSED')) return 'green';
  if (type.includes('REVIEW') || type.includes('WARN')) return 'orange';
  return 'grey';
}
