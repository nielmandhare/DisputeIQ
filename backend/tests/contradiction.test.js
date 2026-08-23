// Slice 4 contradiction tests. Run via bash test.sh (isolated DB).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { detectContradictions } from '../src/services/contradiction.js';
import { createEvidence } from '../src/repositories/evidence.js';
import { detectAndStoreContradictions, listForDispute, markReviewed } from '../src/repositories/contradictions.js';
import { randomUUID } from 'node:crypto';

before(() => {
  // Slice 4 contradiction detection is deterministic (no LLM key in tests).
});

after(() => {
  try { db.prepare("DELETE FROM contradictions WHERE disputeId LIKE 'disp_test_%'").run(); } catch {}
  try { db.prepare("DELETE FROM evidence_documents WHERE disputeId LIKE 'disp_test_%'").run(); } catch {}
  try { db.prepare("DELETE FROM disputes WHERE id LIKE 'disp_test_%'").run(); } catch {}
});

function seedDispute() {
  const id = `disp_test_${randomUUID().slice(0, 6)}`;
  db.prepare('INSERT INTO disputes (id, razorpayDisputeId, amount, currency, reasonCode, reasonLabel, status, createdAt, updatedAt) VALUES (?,?,0,?,?,?,?,?,?)')
    .run(id, `dupu_${randomUUID().slice(0, 6)}`, 'INR', 'general', 'General', 'open', 1, 1);
  return id;
}
async function uploadExtracted(disputeId, name, text) {
  const ev = await createEvidence(disputeId, { originalname: name, mimetype: 'text/plain', size: text.length, buffer: Buffer.from(text) });
  // createEvidence already extracts+classifies+detects; ensure EXTRACTED text is set
  return ev;
}

test('detector: return before delivery across docs -> chronological contradiction', () => {
  const docs = [
    { id: 'ev_a', text: 'Return initiated on March 12 at 10:14 AM for Order ORD-1.' },
    { id: 'ev_b', text: 'Package delivered and confirmed on March 15 at 2:43 PM for Order ORD-1.' },
  ];
  const out = detectContradictions(docs);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'chronological');
  assert.equal(out[0].severity, 'confirmed');
  assert.ok(out[0].claimA.includes('March 12'));
  assert.ok(out[0].claimB.includes('March 15'));
});

test('detector: consistent timeline -> no contradiction', () => {
  const docs = [
    { id: 'ev_a', text: 'Order ORD-9 delivered on March 15.' },
    { id: 'ev_b', text: 'Invoice for Order ORD-9 paid Rs 250.' },
  ];
  assert.equal(detectContradictions(docs).length, 0);
});

test('detector: single doc -> no contradiction (needs >=2)', () => {
  assert.equal(detectContradictions([{ id: 'ev_a', text: 'Return on March 12, delivered March 15.' }]).length, 0);
});

test('detector: amount conflict only when same transaction id shared', () => {
  // Different transactions (no shared id) -> no false positive.
  const unrelated = detectContradictions([
    { id: 'ev_a', text: 'Invoice INV-100 Rs 345 for Order A12.' },
    { id: 'ev_b', text: 'Refund Rs 299 for Order B77.' },
  ]);
  assert.equal(unrelated.length, 0);
  // Same transaction, conflicting amount -> detected.
  const same = detectContradictions([
    { id: 'ev_a', text: 'Order ORD-55 charged Rs 499.' },
    { id: 'ev_b', text: 'Order ORD-55 refund Rs 299.' },
  ]);
  const amt = same.find((c) => c.type === 'amount');
  assert.ok(amt, 'expected an amount contradiction for shared ORD-55');
  assert.equal(amt.severity, 'possible');
});

test('detectAndStore: persists findings + audit, and re-run dedupes', async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'return.txt', 'Return initiated on March 12 at 10:14 AM for Order ORD-X.');
  await uploadExtracted(id, 'delivered.txt', 'Delivered and confirmed on March 15 at 2:43 PM for Order ORD-X.');
  const list = listForDispute(id);
  assert.ok(list.length >= 1);
  assert.equal(list[0].type, 'chronological');
  const audit = db.prepare("SELECT * FROM audit_events WHERE eventType='CONTRADICTION_DETECTED' AND entityId=?").all(list[0].id);
  assert.ok(audit.length >= 1);
  // Re-run should not create duplicates (unreviewed cleared, re-detected once).
  const again = detectAndStoreContradictions(id);
  assert.ok(again.length >= 1 && again.length <= 3);
});

test('markReviewed flips reviewed flag + audits', async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'r2.txt', 'Return initiated on March 12 for Order ORD-Y.');
  await uploadExtracted(id, 'd2.txt', 'Delivered March 15 for Order ORD-Y.');
  const list = listForDispute(id);
  assert.ok(list.length >= 1);
  const updated = markReviewed(list[0].id, true);
  assert.equal(updated.reviewed, true);
  const audit = db.prepare("SELECT * FROM audit_events WHERE eventType='CONTRADICTION_REVIEWED' AND entityId=?").all(list[0].id);
  assert.ok(audit.length >= 1);
});

test('no contradiction persisted for consistent docs', async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'c1.txt', 'Order ORD-900 delivered March 15.');
  await uploadExtracted(id, 'c2.txt', 'Order ORD-900 invoice Rs 250 paid.');
  assert.equal(listForDispute(id).length, 0);
});
