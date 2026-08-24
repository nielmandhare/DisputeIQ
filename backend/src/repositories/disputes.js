// Dispute repository + normalization (Razorpay dispute -> internal model).
// The internal model maps 1:1 onto the frontend src/types Dispute shape so the
// API layer can return it directly (no raw Razorpay leakage to the UI).
import { db, now } from '../db.js';
import { razorpay, RazorpayError } from '../services/razorpay/client.js';
import { recordAudit } from '../services/audit.js';
import { randomUUID } from 'node:crypto';

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

function safeParse(s) {
  try { return s ? JSON.parse(s) : undefined; } catch { return undefined; }
}

/** Map a Razorpay dispute object to our internal DB row. */
function normalizeRazorpayDispute(rzp) {
  return {
    razorpayDisputeId: rzp.id,
    razorpayPaymentId: rzp.payment_id || null,
    razorpayOrderId: rzp.order_id || null,
    amount: rzp.amount != null ? Number(rzp.amount) : null, // paise
    currency: rzp.currency || 'INR',
    reasonCode: rzp.reason_code || 'general',
    reasonLabel: REASON_LABELS[rzp.reason_code] || rzp.reason_code || 'General',
    phase: rzp.phase || null,
    status: rzp.status || 'open',
    createdAtRzp: rzp.created_at ? Number(rzp.created_at) : null,
    deadlineRzp: rzp.due_date ? Number(rzp.due_date) : null,
    raw: JSON.stringify(rzp),
  };
}

/** Convert a DB row into the frontend Dispute shape. */
export function rowToDispute(row) {
  if (!row) return null;
  const amountInr = row.amount != null ? Math.round(row.amount / 100) : 0;
  const deadlineMs = row.deadlineRzp ? row.deadlineRzp * 1000 : null;
  const deadlineText = deadlineMs
    ? `${Math.max(0, Math.round((deadlineMs - Date.now()) / 3_600_000))}h remaining`
    : '—';
  const deadlineDate = deadlineMs ? new Date(deadlineMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;
  const uiStatus = mapStatus(row.status);
  return {
    id: row.id,
    razorpayDisputeId: row.razorpayDisputeId,
    provider: row.provider || 'razorpay', // 'razorpay' (live/ingested) or 'demo' (synthetic eval set)
    reasonLabel: row.reasonLabel,
    reasonCode: row.reasonCode,
    customer: '—', // Razorpay dispute payload does not include customer name; filled by later enrichment
    amount: amountInr,
    deadlineText,
    deadlineDate,
    ers: row.ers != null ? row.ers : 0, // Slice 6: computed from real evidence
    ersBreakdown: row.ersBreakdown ? safeParse(row.ersBreakdown) : undefined,
    responseStatus: row.responseStatus || null, // Slice 7: DRAFT_READY / APPROVED / null
    status: uiStatus,
    lastUpdated: new Date(row.updatedAt * 1000).toLocaleString('en-GB'),
    paymentContext: {
      paymentId: row.razorpayPaymentId || '—',
      orderId: row.razorpayOrderId || '—',
      timestamp: row.createdAtRzp ? new Date(row.createdAtRzp * 1000).toLocaleString('en-GB') : '—',
      method: '—',
    },
  };
}

function mapStatus(rzpStatus) {
  switch (rzpStatus) {
    case 'open': return 'PENDING_REVIEW';
    case 'under_review': return 'SUBMITTED';
    case 'won': return 'WON';
    case 'lost': return 'LOST';
    case 'closed': return 'RESOLVED';
    default: return 'PENDING_REVIEW';
  }
}

/** Persist a normalized dispute (insert or update by razorpayDisputeId). Returns internal id. */
export function upsertDisputeFromRazorpay(rzp) {
  const n = normalizeRazorpayDispute(rzp);
  const existing = db.prepare('SELECT id FROM disputes WHERE razorpayDisputeId = ?').get(n.razorpayDisputeId);
  const ts = now();
  if (existing) {
    db.prepare(`
      UPDATE disputes SET razorpayPaymentId=?, razorpayOrderId=?, amount=?, currency=?, reasonCode=?,
        reasonLabel=?, phase=?, status=?, createdAtRzp=?, deadlineRzp=?, raw=?, updatedAt=? WHERE id=?
    `).run(n.razorpayPaymentId, n.razorpayOrderId, n.amount, n.currency, n.reasonCode, n.reasonLabel,
      n.phase, n.status, n.createdAtRzp, n.deadlineRzp, n.raw, ts, existing.id);
    recordAudit({ actor: 'SYSTEM', eventType: 'DISPUTE_UPDATED', entityType: 'DISPUTE', entityId: existing.id, statusText: `Updated from Razorpay (${n.razorpayDisputeId})` });
    return existing.id;
  }
  const internalId = `disp_${randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO disputes (id, razorpayDisputeId, razorpayPaymentId, razorpayOrderId, amount, currency,
      reasonCode, reasonLabel, phase, status, createdAtRzp, deadlineRzp, raw, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(internalId, n.razorpayDisputeId, n.razorpayPaymentId, n.razorpayOrderId, n.amount, n.currency,
    n.reasonCode, n.reasonLabel, n.phase, n.status, n.createdAtRzp, n.deadlineRzp, n.raw, ts, ts);
  recordAudit({ actor: 'RAZORPAY API', eventType: 'DISPUTE_RECEIVED', entityType: 'DISPUTE', entityId: internalId, statusText: `Dispute ${n.razorpayDisputeId} persisted` });
  return internalId;
}

export function listDisputes() {
  const rows = db.prepare('SELECT * FROM disputes ORDER BY createdAt DESC').all();
  return rows.map(rowToDispute);
}

export function getDisputeById(id) {
  const row = db.prepare('SELECT * FROM disputes WHERE id = ?').get(id);
  return rowToDispute(row);
}

/** Fetch a dispute from Razorpay and persist it (used by dev seed / manual sync). */
export async function ingestDisputeById(razorpayDisputeId) {
  try {
    const rzp = await razorpay.getDispute(razorpayDisputeId);
    const internalId = upsertDisputeFromRazorpay(rzp);
    recordAudit({ actor: 'RAZORPAY API', eventType: 'DISPUTE_FETCHED', entityType: 'DISPUTE', entityId: internalId, statusText: `Fetched ${razorpayDisputeId} from Razorpay` });
    return { internalId, simulated: false };
  } catch (err) {
    if (err instanceof RazorpayError && err.code === 'NOT_CONFIGURED') throw err;
    throw err;
  }
}

export { REASON_LABELS };
