// Slice 8 — submission safety tests. Run via bash test.sh (isolated DB).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { randomUUID } from 'node:crypto';
import {
  submitDispute,
  getSubmission,
  verifySubmissionPreconditions,
  findExistingSubmission,
} from '../src/services/submission.js';
import { generateForDispute, approveDraft } from '../src/repositories/responseDraft.js';
import { listAuditForDispute } from '../src/services/audit.js';
import { createEvidence, listForDispute } from '../src/repositories/evidence.js';
import { razorpay } from '../src/services/razorpay/client.js';
import { config } from '../src/config.js';

// Hermetic isolation: the developer's real .env may set LIVE + credentials AND
// a live LLM key. These tests must be deterministic, so force SIMULATED mode and
// clear the LLM key (both process.env and the cached config) so draft generation
// stays heuristic and no external call occurs. LIVE tests re-enable as needed.
process.env.RAZORPAY_SUBMISSION_MODE = 'simulated';
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'secret';
delete process.env.LLM_API_KEY;
config.llm.apiKey = '';

function seedDispute(reasonCode = 'non_receipt_of_goods') {
  const id = `disp_test_${randomUUID().slice(0, 8)}`;
  db.prepare(`INSERT INTO disputes (id, razorpayDisputeId, razorpayPaymentId, amount, currency, reasonCode, reasonLabel, phase, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, `dupu_${randomUUID().slice(0, 6)}`, 'pay_abc', 34500, 'INR', reasonCode, 'Non-receipt', 'open', 'PENDING_REVIEW', 1, 1,
  );
  return id;
}

// Upload + classify evidence, optionally with a forced timeline event so the
// draft has grounded facts. Returns the evidence row.
async function uploadExtracted(disputeId, name, text, evidenceType, withEvent = true) {
  const ev = await createEvidence(disputeId, { originalname: name, mimetype: 'text/plain', size: text.length, buffer: Buffer.from(text) });
  db.prepare(`UPDATE evidence_documents SET processingStatus='EXTRACTED', evidenceType=?, classificationMethod='HEURISTIC', confidence=?, extractedText=? WHERE id=?`)
    .run(evidenceType, 90, text, ev.id);
  if (withEvent) {
    db.prepare(`INSERT INTO factual_events (id, evidenceId, disputeId, eventType, eventDate, eventTime, datePrecision, actor, description, sourceDocument, sourceLocation, confidence, extractionVersion, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(`fe_${randomUUID().slice(0, 6)}`, ev.id, disputeId, 'delivery_completed', null, '14:43', 'unknown', 'courier', text.slice(0, 60), name, null, 90, 'timeline-v1', 1);
  }
  return ev;
}

after(() => {
  db.prepare("DELETE FROM disputes WHERE id LIKE 'disp_test_%'").run();
  db.prepare("DELETE FROM submissions WHERE disputeId LIKE 'disp_test_%'").run();
});

test('cannot submit without an approved draft (security: approval mandatory)', { serial: true }, async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'inv.txt', 'Invoice for order ORD-1.', 'INVOICE_OR_RECEIPT');
  await uploadExtracted(id, 'ship.txt', 'Delivered on March 15.', 'SHIPPING_OR_DELIVERY');
  await generateForDispute(id); // draft exists but NOT approved
  await assert.rejects(() => submitDispute(id, { actor: 'HUMAN' }), /not been explicitly approved/i);
  const s = getSubmission(id);
  assert.equal(s, null); // nothing persisted
});

test('cannot submit with missing required evidence (shipping proof)', { serial: true }, async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'inv.txt', 'Invoice for order ORD-1.', 'INVOICE_OR_RECEIPT');
  // No SHIPPING_OR_DELIVERY uploaded -> blocked. Give the invoice a grounded event so the
  // draft is valid; this isolates the missing-evidence precondition.
  await uploadExtracted(id, 'com.txt', 'Customer acknowledged receipt on March 16.', 'COMMUNICATION');
  await generateForDispute(id);
  approveDraft(id);
  await assert.rejects(() => submitDispute(id, { actor: 'HUMAN' }), /required evidence missing/i);
});

test('SIMULATED submission works and makes NO external Razorpay call', { serial: true }, async () => {
  let externalCall = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { externalCall = true; throw new Error('should not be called'); };
  try {
    const id = seedDispute();
    await uploadExtracted(id, 'inv.txt', 'Invoice for order ORD-1.', 'INVOICE_OR_RECEIPT');
    await uploadExtracted(id, 'ship.txt', 'Delivered on March 15.', 'SHIPPING_OR_DELIVERY');
    await generateForDispute(id);
    approveDraft(id);
    const res = await submitDispute(id, { actor: 'HUMAN' });
    assert.equal(res.mode, 'SIMULATED');
    assert.equal(res.status, 'SUBMITTED');
    assert.equal(res.razorpayStatus, 'SIMULATED');
    assert.equal(externalCall, false, 'no external call should occur in SIMULATED mode');
    // audit trail recorded
    const audit = listAuditForDispute(id).map((a) => a.eventType);
    assert.ok(audit.includes('SUBMISSION_STARTED'));
    assert.ok(audit.includes('CONTEST_ACCEPTED'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('idempotency: double submit returns the existing submission, no duplicate call', { serial: true }, async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'inv.txt', 'Invoice for order ORD-1.', 'INVOICE_OR_RECEIPT');
  await uploadExtracted(id, 'ship.txt', 'Delivered on March 15.', 'SHIPPING_OR_DELIVERY');
  await generateForDispute(id);
  approveDraft(id);
  const first = await submitDispute(id, { actor: 'HUMAN' });
  const second = await submitDispute(id, { actor: 'HUMAN' });
  assert.equal(second.id, first.id, 'second submit must return the same submission record');
  const rows = db.prepare('SELECT COUNT(*) AS c FROM submissions WHERE disputeId=?').get(id);
  assert.equal(rows.c, 1, 'only one submission persisted');
});

test('unknown result (timeout after request) is marked REQUIRES_REVIEW, never blindly retried', { serial: true }, async () => {
  // Enable LIVE by faking credentials + live mode, then stub fetch to abort (timeout).
  const prevId = process.env.RAZORPAY_KEY_ID, prevSecret = process.env.RAZORPAY_KEY_SECRET, prevMode = process.env.RAZORPAY_SUBMISSION_MODE;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_x'; process.env.RAZORPAY_KEY_SECRET = 'secret'; process.env.RAZORPAY_SUBMISSION_MODE = 'live';
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network timeout'); };
  try {
    const id = seedDispute();
    await uploadExtracted(id, 'inv.txt', 'Invoice for order ORD-1.', 'INVOICE_OR_RECEIPT');
    await uploadExtracted(id, 'ship.txt', 'Delivered on March 15.', 'SHIPPING_OR_DELIVERY');
    await generateForDispute(id);
    approveDraft(id);
    await assert.rejects(() => submitDispute(id, { actor: 'HUMAN' }), /unknown|REQUIRES_REVIEW/i);
    const s = getSubmission(id);
    assert.equal(s.status, 'SUBMISSION_REQUIRES_REVIEW');
    // A subsequent submit must NOT blindly retry — blocked until reconciled.
    await assert.rejects(() => submitDispute(id, { actor: 'HUMAN' }), /blocked|BLOCKED|REQUIRES_REVIEW|reconcile/i);
  } finally {
    globalThis.fetch = origFetch;
    process.env.RAZORPAY_KEY_ID = prevId; process.env.RAZORPAY_KEY_SECRET = prevSecret; process.env.RAZORPAY_SUBMISSION_MODE = prevMode;
  }
});

test('LIVE 4xx failure is surfaced and recorded as SUBMISSION_FAILED (no blind retry)', { serial: true }, async () => {
  const prevId = process.env.RAZORPAY_KEY_ID, prevSecret = process.env.RAZORPAY_KEY_SECRET, prevMode = process.env.RAZORPAY_SUBMISSION_MODE;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_x'; process.env.RAZORPAY_KEY_SECRET = 'secret'; process.env.RAZORPAY_SUBMISSION_MODE = 'live';
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => ({
    ok: false, status: 400, statusText: 'Bad Request',
    text: async () => JSON.stringify({ error: { code: 'BAD_REQUEST', description: 'invalid' } }),
    json: async () => ({ error: { code: 'BAD_REQUEST', description: 'invalid' } }),
  });
  try {
    const id = seedDispute();
    await uploadExtracted(id, 'inv.txt', 'Invoice for order ORD-1.', 'INVOICE_OR_RECEIPT');
    await uploadExtracted(id, 'ship.txt', 'Delivered on March 15.', 'SHIPPING_OR_DELIVERY');
    await generateForDispute(id);
    approveDraft(id);
    await assert.rejects(() => submitDispute(id, { actor: 'HUMAN' }), /failed/i);
    const s = getSubmission(id);
    assert.equal(s.status, 'SUBMISSION_FAILED');
    assert.equal(s.httpStatus, 400);
  } finally {
    globalThis.fetch = origFetch;
    process.env.RAZORPAY_KEY_ID = prevId; process.env.RAZORPAY_KEY_SECRET = prevSecret; process.env.RAZORPAY_SUBMISSION_MODE = prevMode;
  }
});

test('precondition verifier blocks stale/invalid drafts', { serial: true }, async () => {
  const id = seedDispute();
  const draft = { status: 'DRAFT_READY', valid: true, metrics: { coverage: 100 } };
  const evidence = [{ evidenceType: 'INVOICE_OR_RECEIPT' }, { evidenceType: 'SHIPPING_OR_DELIVERY' }];
  const r1 = verifySubmissionPreconditions({ id }, draft, evidence);
  assert.equal(r1.ok, false, 'unapproved draft must be blocked');
  const r2 = verifySubmissionPreconditions({ id }, { ...draft, status: 'DRAFT_APPROVED', valid: false }, evidence);
  assert.equal(r2.ok, false, 'invalid draft must be blocked');
  const r3 = verifySubmissionPreconditions({ id }, { ...draft, status: 'DRAFT_APPROVED' }, [{ evidenceType: 'INVOICE_OR_RECEIPT' }]);
  assert.equal(r3.ok, false, 'missing evidence must be blocked');
});

test('cross-dispute submission cannot be forced via idempotency lookup', { serial: true }, async () => {
  const a = seedDispute(), b = seedDispute();
  await uploadExtracted(a, 'inv.txt', 'Invoice for order ORD-1.', 'INVOICE_OR_RECEIPT');
  await uploadExtracted(a, 'ship.txt', 'Delivered on March 15.', 'SHIPPING_OR_DELIVERY');
  await generateForDispute(a);
  approveDraft(a);
  const res = await submitDispute(a, { actor: 'HUMAN' });
  assert.equal(res.disputeId, a);
  // Dispute b has no submission -> lookup returns nothing.
  assert.equal(findExistingSubmission(b, res.draftVersion), undefined);
});
