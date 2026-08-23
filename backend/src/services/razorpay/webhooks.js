// Webhook ingestion: signature verification, idempotency, async processing.
// Pipeline: raw body -> verify HMAC -> extract event id -> dedupe -> persist
// event -> enqueue processing -> return 200. Heavy work happens async.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db, now } from '../../db.js';
import { config } from '../../config.js';
import { recordAudit } from '../audit.js';
import { upsertDisputeFromRazorpay } from '../../repositories/disputes.js';

/**
 * Verify the Razorpay webhook signature.
 * Razorpay computes HMAC-SHA256 over the RAW request body using the webhook
 * secret; the hex digest must equal the X-Razorpay-Signature header.
 * @returns {boolean}
 */
export function verifySignature(rawBody, signature) {
  if (!config.razorpay.webhookSecret) return false;
  if (!signature) return false;
  const expected = createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function persistEvent(event) {
  const existing = db.prepare('SELECT eventId, status FROM webhook_events WHERE eventId = ?').get(event.id);
  if (existing) {
    // Idempotency: same event id -> never process again.
    db.prepare("UPDATE webhook_events SET status='DUPLICATE', processedAt=? WHERE eventId=?").run(now(), event.id);
    recordAudit({ actor: 'SYSTEM', eventType: 'WEBHOOK_DUPLICATE', entityType: 'WEBHOOK_EVENT', entityId: event.id, statusText: 'Duplicate event ignored' });
    return { duplicate: true, status: existing.status };
  }
  db.prepare(`INSERT INTO webhook_events (eventId, eventType, accountId, payload, receivedAt, status, attempts)
    VALUES (?, ?, ?, ?, ?, 'RECEIVED', 0)`).run(
    event.id, event.event, event.account_id || null, JSON.stringify(event), now(),
  );
  recordAudit({ actor: 'RAZORPAY API', eventType: 'WEBHOOK_RECEIVED', entityType: 'WEBHOOK_EVENT', entityId: event.id, statusText: `Event ${event.event} received` });
  return { duplicate: false };
}

/** Process a persisted webhook event asynchronously (fire-and-forget). */
function processEvent(eventId) {
  const row = db.prepare('SELECT * FROM webhook_events WHERE eventId = ?').get(eventId);
  if (!row || row.status === 'PROCESSED' || row.status === 'DUPLICATE') return;
  try {
    db.prepare('UPDATE webhook_events SET status=?, attempts=attempts+1 WHERE eventId=?').run('PROCESSING', eventId);
    const event = JSON.parse(row.payload);
    const dispute = event?.payload?.dispute?.entity;
    if (dispute && (row.eventType === 'payment.dispute.created' || row.eventType === 'payment.dispute.updated' || row.eventType === 'payment.dispute.action_required')) {
      const internalId = upsertDisputeFromRazorpay(dispute);
      db.prepare("UPDATE webhook_events SET status='PROCESSED', processedAt=? WHERE eventId=?").run(now(), eventId);
      recordAudit({ actor: 'SYSTEM', eventType: 'WEBHOOK_PROCESSED', entityType: 'WEBHOOK_EVENT', entityId: eventId, statusText: `Dispute persisted (${internalId})` });
    } else {
      // Non-dispute events (won/lost/closed/under_review) are recorded for audit but need no ingestion.
      db.prepare("UPDATE webhook_events SET status='PROCESSED', processedAt=? WHERE eventId=?").run(now(), eventId);
      recordAudit({ actor: 'SYSTEM', eventType: 'WEBHOOK_PROCESSED', entityType: 'WEBHOOK_EVENT', entityId: eventId, statusText: `Event type ${row.eventType} acknowledged (no ingestion)` });
    }
  } catch (err) {
    db.prepare('UPDATE webhook_events SET status=?, error=? WHERE eventId=?').run('FAILED', String(err.message).slice(0, 500), eventId);
    recordAudit({ actor: 'SYSTEM', eventType: 'WEBHOOK_PROCESS_FAILED', entityType: 'WEBHOOK_EVENT', entityId: eventId, statusText: String(err.message).slice(0, 200) });
  }
}

/**
 * Handle an incoming webhook.
 * @param {string|Buffer} rawBody  raw request body (must be raw, not parsed)
 * @param {string} signature       X-Razorpay-Signature header value
 * @returns {{ok:boolean, status:number, duplicate?:boolean, eventId?:string, error?:string}}
 */
export function handleWebhook(rawBody, signature) {
  if (!verifySignature(rawBody, signature)) {
    recordAudit({ actor: 'SYSTEM', eventType: 'WEBHOOK_SIGNATURE_INVALID', entityType: 'WEBHOOK_EVENT', entityId: null, statusText: 'Signature verification failed' });
    return { ok: false, status: 400, error: 'invalid_signature' };
  }
  let event;
  try {
    event = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { ok: false, status: 400, error: 'malformed_json' };
  }
  if (!event || !event.id || !event.event) {
    return { ok: false, status: 400, error: 'missing_event_fields' };
  }
  const { duplicate } = persistEvent(event);
  // Process asynchronously; return success immediately (Razorpay expects 200 ACK).
  processEvent(event.id);
  return { ok: true, status: 200, duplicate, eventId: event.id };
}
