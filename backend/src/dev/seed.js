// DEV-ONLY dispute seed. Produces a RAZORPAY-SHAPED payment.dispute.created
// event and feeds it through the EXACT same webhook pipeline as a live event.
// This is explicitly labeled SIMULATED and is NEVER presented as a real
// Razorpay capability. It exists so the vertical slice (webhook -> db ->
// dispute API -> frontend) can be demonstrated without live credentials.
import { createHmac, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { handleWebhook } from '../services/razorpay/webhooks.js';

function buildSampleDispute() {
  const id = `dupu_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const created = Math.floor(Date.now() / 1000);
  const due = created + 36 * 3600; // 36h remaining, matches the demo
  return {
    id,
    entity: 'dispute',
    amount: 3450000, // ₹34,500 in paise
    currency: 'INR',
    reason_code: 'non_receipt_of_goods',
    status: 'open',
    phase: 'pre_dispute',
    payment_id: `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
    order_id: `order_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    created_at: created,
    due_date: due,
    // Sample-only identifiers; clearly not a real customer/PAN. No PII.
    customer_details: { name: 'Sample Customer', email: 'sample@example.com' },
    comments: 'SIMULATED seed dispute for DisputeIQ demo (Razorpay Buildathon).',
  };
}

/**
 * Inject a simulated dispute through the real webhook handler.
 * Returns the handler result plus the generated event id + razorpay dispute id.
 */
export function seedSimulatedDispute() {
  if (!config.devSeed) {
    return { ok: false, error: 'dev_seed_disabled', status: 403 };
  }
  const dispute = buildSampleDispute();
  const event = {
    id: `evt_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
    entity: 'event',
    event: 'payment.dispute.created',
    account_id: 'acc_simulated',
    contains: ['dispute'],
    payload: { dispute: { entity: dispute } },
    created_at: Math.floor(Date.now() / 1000),
  };
  const rawBody = JSON.stringify(event);
  // Sign with the configured webhook secret so the real verification path runs.
  // If no secret is configured (dev mode), use a deterministic dev-only placeholder
  // secret and record it on config so verification uses the identical value. The
  // verification path therefore exercises the REAL HMAC logic — only the secret
  // source differs, and it is clearly labeled dev-only.
  let secret = config.razorpay.webhookSecret;
  if (!secret) {
    secret = 'dev_placeholder_secret';
    config.razorpay.webhookSecret = secret;
  }
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  const result = handleWebhook(rawBody, signature);
  return { ok: true, simulated: true, eventId: event.id, razorpayDisputeId: dispute.id, ...result };
}
