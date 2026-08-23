// Phase 1A backend tests — webhook + dispute fetch. Run: npm test (node --test)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { db } from '../src/db.js';
import { handleWebhook, verifySignature } from '../src/services/razorpay/webhooks.js';
import { listDisputes } from '../src/repositories/disputes.js';
import { config } from '../src/config.js';

const SECRET = 'test_webhook_secret';
const RAW_BODY = JSON.stringify({
  id: 'evt_test_123',
  entity: 'event',
  event: 'payment.dispute.created',
  account_id: 'acc_test',
  contains: ['dispute'],
  payload: { dispute: { entity: { id: 'dupu_test_1', amount: 1000, currency: 'INR', reason_code: 'general', status: 'open' } } },
  created_at: 1,
});
const SIG = createHmac('sha256', SECRET).update(RAW_BODY).digest('hex');

before(() => {
  // config.js reads process.env at import time, so set the secret on the live
  // config singleton (and env) before any signature check runs.
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  config.razorpay.webhookSecret = SECRET;
});

test('verifySignature: valid signature passes', () => {
  assert.equal(verifySignature(RAW_BODY, SIG), true);
});

test('verifySignature: tampered body fails', () => {
  assert.equal(verifySignature(RAW_BODY + 'x', SIG), false);
});

test('verifySignature: wrong signature fails', () => {
  assert.equal(verifySignature(RAW_BODY, 'deadbeef'), false);
});

test('webhook: valid signature -> 200, dispute persisted, processed once', () => {
  const r = handleWebhook(RAW_BODY, SIG);
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.duplicate, false);
  const rows = listDisputes().filter((d) => d.reasonLabel);
  assert.ok(rows.some((d) => d.id.startsWith('disp_')));
});

test('webhook: duplicate event id -> ignored (duplicate:true)', () => {
  const first = handleWebhook(RAW_BODY, SIG);
  const second = handleWebhook(RAW_BODY, SIG);
  assert.equal(first.ok, true);
  assert.equal(second.duplicate, true);
  // Exactly one dispute row for this razorpay id.
  const count = db.prepare("SELECT COUNT(*) c FROM disputes WHERE razorpayDisputeId='dupu_test_1'").get().c;
  assert.equal(count, 1);
});

test('webhook: invalid signature -> 400', () => {
  const r = handleWebhook(RAW_BODY, 'invalid');
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('webhook: malformed JSON -> 400', () => {
  const r = handleWebhook('{not json', SIG);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('webhook: missing event fields -> 400', () => {
  const r = handleWebhook(JSON.stringify({ foo: 'bar' }), SIG);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('dispute fetch: listDisputes returns normalized rows', () => {
  const all = listDisputes();
  assert.ok(Array.isArray(all));
  // At least the one we created above.
  assert.ok(all.length >= 1);
  const d = all.find((x) => x.reasonCode === 'general');
  assert.ok(d);
  assert.equal(typeof d.amount, 'number');
});
