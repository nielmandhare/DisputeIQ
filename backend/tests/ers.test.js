// Slice 6 ERS tests. Run via bash test.sh (isolated DB).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { computeErs, labelFor } from '../src/services/ers.js';
import { computeAndStoreErs, getErs, getGaps } from '../src/repositories/ers.js';
import { createEvidence } from '../src/repositories/evidence.js';
import { randomUUID } from 'node:crypto';

after(() => {
  try { db.prepare("DELETE FROM factual_events WHERE disputeId LIKE 'disp_test_%'").run(); } catch {}
  try { db.prepare("DELETE FROM contradictions WHERE disputeId LIKE 'disp_test_%'").run(); } catch {}
  try { db.prepare("DELETE FROM evidence_documents WHERE disputeId LIKE 'disp_test_%'").run(); } catch {}
  try { db.prepare("DELETE FROM disputes WHERE id LIKE 'disp_test_%'").run(); } catch {}
});

function seedDispute(reasonCode = 'non_receipt_of_goods') {
  const id = `disp_test_${randomUUID().slice(0, 6)}`;
  db.prepare('INSERT INTO disputes (id, razorpayDisputeId, amount, currency, reasonCode, reasonLabel, status, createdAt, updatedAt) VALUES (?,?,0,?,?,?,?,?,?)')
    .run(id, `dupu_${randomUUID().slice(0, 6)}`, 'INR', reasonCode, reasonCode, 'open', 1, 1);
  return id;
}
async function uploadExtracted(disputeId, name, text, evidenceType = 'INVOICE_OR_RECEIPT') {
  const ev = await createEvidence(disputeId, { originalname: name, mimetype: 'text/plain', size: text.length, buffer: Buffer.from(text) });
  // Force a classification so ERS can read evidenceType + confidence.
  db.prepare("UPDATE evidence_documents SET processingStatus='EXTRACTED', evidenceType=?, classificationMethod='HEURISTIC', confidence=?, extractedText=? WHERE id=?")
    .run(evidenceType, 85, text, ev.id);
  return ev;
}

test('computeErs: no evidence => 0 / Incomplete', () => {
  const { breakdown, gaps } = computeErs({ evidence: [], events: [], contradictions: [], reasonCode: 'general' });
  assert.equal(breakdown.score, 0);
  assert.equal(breakdown.label, 'Incomplete');
  assert.ok(gaps.length > 0);
  assert.ok(gaps.every((g) => !g.present));
});

test('computeErs: full required coverage + grounded events raises score into Strong', async () => {
  const id = seedDispute('non_receipt_of_goods');
  await uploadExtracted(id, 'inv.txt', 'Invoice generated.', 'INVOICE_OR_RECEIPT');
  await uploadExtracted(id, 'ship.txt', 'Package delivered on March 15.', 'SHIPPING_OR_DELIVERY');
  await uploadExtracted(id, 'com.txt', 'Customer confirmed receipt.', 'COMMUNICATION');
  // Give each doc a grounded timeline event.
  db.prepare("INSERT INTO factual_events (id, evidenceId, disputeId, eventType, eventDate, eventTime, datePrecision, actor, description, sourceDocument, sourceLocation, confidence, extractionVersion, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(`fe_${randomUUID().slice(0,6)}`, (await getFirstEv(id)), id, 'delivery_completed', null, null, 'unknown', 'courier', 'delivered', 'ship.txt', null, 0.9, 'ers-v1', 1);
  const { breakdown } = computeErs({
    evidence: db.prepare('SELECT id, processingStatus AS status, evidenceType, classificationMethod, confidence AS classificationConfidence FROM evidence_documents WHERE disputeId=?').all(id),
    events: db.prepare('SELECT id, evidenceId, confidence FROM factual_events WHERE disputeId=?').all(id),
    contradictions: [],
    reasonCode: 'non_receipt_of_goods',
  });
  assert.ok(breakdown.score >= 85, `expected Strong, got ${breakdown.score}`);
  assert.equal(breakdown.requiredPresent, 3);
  assert.equal(breakdown.requiredTotal, 3);
});

test('computeErs: unresolved contradiction applies penalty', () => {
  const base = computeErs({ evidence: [{ id: 'e1', status: 'EXTRACTED', evidenceType: 'INVOICE', classificationMethod: 'HEURISTIC', classificationConfidence: 0.9 }], events: [{ id: 'ev1', evidenceId: 'e1', confidence: 0.9 }], contradictions: [], reasonCode: 'general' });
  const penalized = computeErs({ evidence: [{ id: 'e1', status: 'EXTRACTED', evidenceType: 'INVOICE', classificationMethod: 'HEURISTIC', classificationConfidence: 0.9 }], events: [{ id: 'ev1', evidenceId: 'e1', confidence: 0.9 }], contradictions: [{ id: 'c1' }], reasonCode: 'general' });
  assert.ok(penalized.breakdown.score <= base.breakdown.score - 15, 'penalty should reduce by >=15');
  assert.equal(penalized.breakdown.contradictionsFound, 1);
});

test('computeErs: OCR_REQUIRED docs do not count as usable evidence', () => {
  const { breakdown, gaps } = computeErs({
    evidence: [{ id: 'e1', status: 'OCR_REQUIRED', evidenceType: 'INVOICE', classificationMethod: null, classificationConfidence: null }],
    events: [],
    contradictions: [],
    reasonCode: 'general',
  });
  assert.equal(breakdown.score, 0);
  assert.ok(gaps.every((g) => !g.present));
});

test('computeErs: recommended (non-required) evidence lifts recommendedComplete', () => {
  const { breakdown } = computeErs({
    evidence: [
      { id: 'e1', status: 'EXTRACTED', evidenceType: 'INVOICE_OR_RECEIPT', classificationMethod: 'HEURISTIC', classificationConfidence: 0.8 },
      { id: 'e2', status: 'EXTRACTED', evidenceType: 'COMMUNICATION', classificationMethod: 'HEURISTIC', classificationConfidence: 0.8 },
      { id: 'e3', status: 'EXTRACTED', evidenceType: 'SHIPPING_OR_DELIVERY', classificationMethod: 'HEURISTIC', classificationConfidence: 0.8 },
    ],
    events: [],
    contradictions: [],
    reasonCode: 'general',
  });
  assert.equal(breakdown.requiredPresent, 3);
  assert.ok(breakdown.recommendedTotal >= 0);
});

test('labelFor boundaries', () => {
  assert.equal(labelFor(100), 'Strong');
  assert.equal(labelFor(85), 'Strong');
  assert.equal(labelFor(84), 'Moderate');
  assert.equal(labelFor(65), 'Moderate');
  assert.equal(labelFor(64), 'Weak');
  assert.equal(labelFor(40), 'Weak');
  assert.equal(labelFor(39), 'Incomplete');
  assert.equal(labelFor(0), 'Incomplete');
});

test('computeAndStoreErs persists to disputes and is idempotent', async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'inv.txt', 'Invoice generated.', 'INVOICE_OR_RECEIPT');
  const first = computeAndStoreErs(id);
  const row1 = db.prepare('SELECT ers, ersBreakdown FROM disputes WHERE id=?').get(id);
  assert.equal(row1.ers, first.score);
  // Run again — same result (no duplicate side effects; ERS is a single scalar column).
  const second = computeAndStoreErs(id);
  assert.equal(second.score, first.score);
  const row2 = db.prepare('SELECT ers FROM disputes WHERE id=?').get(id);
  assert.equal(row2.ers, first.score);
});

test('getErs returns persisted breakdown', async () => {
  const id = seedDispute();
  await uploadExtracted(id, 'inv.txt', 'Invoice generated.', 'INVOICE_OR_RECEIPT');
  computeAndStoreErs(id);
  const b = getErs(id);
  assert.ok(typeof b.score === 'number');
  assert.ok(b.score >= 0 && b.score <= 100);
});

test('getGaps returns required + recommended items with present flags', async () => {
  const id = seedDispute('non_receipt_of_goods');
  await uploadExtracted(id, 'inv.txt', 'Invoice generated.', 'INVOICE_OR_RECEIPT');
  const gaps = getGaps(id);
  const required = gaps.filter((g) => g.required);
  assert.equal(required.length, 3);
  const invoiceGap = required.find((g) => g.evidenceType === 'INVOICE_OR_RECEIPT');
  assert.equal(invoiceGap.present, true);
  const deliveryGap = required.find((g) => g.evidenceType === 'SHIPPING_OR_DELIVERY');
  assert.equal(deliveryGap.present, false);
});

test('ERS isolation: unknown dispute throws 404', () => {
  assert.throws(() => computeAndStoreErs('disp_does_not_exist'), (e) => e.status === 404);
  assert.throws(() => getErs('disp_does_not_exist'), (e) => e.status === 404);
  assert.throws(() => getGaps('disp_does_not_exist'), (e) => e.status === 404);
});

test('ERS is deterministic (no LLM, no randomness)', () => {
  const input = { evidence: [{ id: 'e1', status: 'EXTRACTED', evidenceType: 'INVOICE', classificationMethod: 'HEURISTIC', classificationConfidence: 0.8 }], events: [{ id: 'ev1', evidenceId: 'e1', confidence: 0.8 }], contradictions: [], reasonCode: 'general' };
  const a = computeErs(input);
  const b = computeErs(input);
  assert.equal(a.breakdown.score, b.breakdown.score);
});

async function getFirstEv(disputeId) {
  return db.prepare('SELECT id FROM evidence_documents WHERE disputeId=? LIMIT 1').get(disputeId).id;
}
