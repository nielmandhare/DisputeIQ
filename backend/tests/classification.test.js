// Slice 3 classification tests. Run via bash test.sh (isolated DB).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { classifyEvidence } from '../src/services/classifier.js';
import { createEvidence, runClassification } from '../src/repositories/evidence.js';
import { config } from '../src/config.js';
import { randomUUID } from 'node:crypto';

before(() => {
  config.devSeed = false;
  config.storageDir = './.work/storage_test';
  // Ensure no real LLM key leaks into the test (force heuristic path).
  config.llm.apiKey = '';
});

after(() => {
  try { db.prepare("DELETE FROM evidence_documents WHERE id LIKE 'disp_test_%'").run(); } catch {}
  try { db.prepare("DELETE FROM disputes WHERE id LIKE 'disp_test_%'").run(); } catch {}
});

function seedDispute() {
  const id = `disp_test_${randomUUID().slice(0, 6)}`;
  db.prepare('INSERT INTO disputes (id, razorpayDisputeId, amount, currency, reasonCode, reasonLabel, status, createdAt, updatedAt) VALUES (?,?,0,?,?,?,?,?,?)')
    .run(id, `dupu_${randomUUID().slice(0, 6)}`, 'INR', 'general', 'General', 'open', 1, 1);
  return id;
}

test('heuristic: delivery text -> SHIPPING_OR_DELIVERY', async () => {
  const c = await classifyEvidence({ extractedText: 'Shipment dispatched on March 14 and delivered March 15 via BlueDart AWB 12345. Proof of delivery confirmed.' });
  assert.equal(c.evidenceType, 'SHIPPING_OR_DELIVERY');
  assert.equal(c.method, 'HEURISTIC');
  assert.ok(c.confidence > 0 && c.confidence <= 100);
  assert.ok(c.sourceSpans.length >= 1);
  assert.ok(c.sourceSpans[0].match.length > 0);
});

test('heuristic: invoice text -> INVOICE_OR_RECEIPT', async () => {
  const c = await classifyEvidence({ extractedText: 'Tax Invoice No. INV-9988. GSTIN 27AAAA. Subtotal Rs 299, Grand Total paid.' });
  assert.equal(c.evidenceType, 'INVOICE_OR_RECEIPT');
  assert.ok(c.sourceSpans.some((s) => /invoice|gstin|subtotal|total/i.test(s.match)));
});

test('heuristic: refund text -> REFUND_OR_CANCELLATION', async () => {
  const c = await classifyEvidence({ extractedText: 'We have processed your refund of Rs 34500. Order cancelled and amount reversed.' });
  assert.equal(c.evidenceType, 'REFUND_OR_CANCELLATION');
});

test('heuristic: communication markers -> COMMUNICATION', async () => {
  const c = await classifyEvidence({ extractedText: 'Dear Customer, regarding your order. Regards, Support Team. Subject: delay update.' });
  assert.equal(c.evidenceType, 'COMMUNICATION');
});

test('heuristic: KYC -> IDENTITY_OR_KYC', async () => {
  const c = await classifyEvidence({ extractedText: 'Please share your Aadhaar and PAN card for KYC verification.' });
  assert.equal(c.evidenceType, 'IDENTITY_OR_KYC');
});

test('heuristic: empty text -> OTHER, confidence 0', async () => {
  const c = await classifyEvidence({ extractedText: '   ' });
  assert.equal(c.evidenceType, 'OTHER');
  assert.equal(c.confidence, 0);
});

test('heuristic: unknown prose -> OTHER (no false positive)', async () => {
  const c = await classifyEvidence({ extractedText: 'The weather was nice and the cricket match was exciting today.' });
  assert.equal(c.evidenceType, 'OTHER');
});

test('LLM path falls back to HEURISTIC when fetch throws', async () => {
  // Point at an unreachable endpoint but keep a fake key so the LLM branch runs.
  config.llm.apiKey = 'test-key';
  config.llm.baseUrl = 'http://127.0.0.1:9/v1'; // nothing listening -> fetch fails
  const c = await classifyEvidence({ extractedText: 'Tax Invoice INV-1, GSTIN, Subtotal paid.' });
  assert.equal(c.method, 'HEURISTIC'); // transparent fallback
  assert.ok(c.fallbackReason && c.fallbackReason.length > 0);
  config.llm.apiKey = ''; // restore heuristic-only for remaining tests
});

test('runClassification persists evidenceType + confidence + provenance row', async () => {
  const id = seedDispute();
  const ev = await createEvidence(id, { originalname: 'delivery.txt', mimetype: 'text/plain', size: 40, buffer: Buffer.from('Delivered via BlueDart AWB 555. Proof of delivery confirmed.') });
  assert.equal(ev.processingStatus, 'EXTRACTED');
  assert.equal(ev.evidenceType, 'SHIPPING_OR_DELIVERY');
  assert.ok(ev.confidence > 0);
  assert.equal(ev.classificationSource, 'HEURISTIC');
  // Provenance row exists with source spans.
  const rows = db.prepare('SELECT * FROM evidence_classifications WHERE evidenceId = ?').all(ev.id);
  assert.equal(rows.length, 1);
  const spans = JSON.parse(rows[0].sourceSpans);
  assert.ok(spans.length >= 1);
});

test('reclassify produces a fresh classification row', async () => {
  const id = seedDispute();
  const ev = await createEvidence(id, { originalname: 'refund.txt', mimetype: 'text/plain', size: 40, buffer: Buffer.from('Refund processed, order cancelled, amount reversed.') });
  const before = db.prepare('SELECT COUNT(*) c FROM evidence_classifications WHERE evidenceId = ?').get(ev.id).c;
  const re = await runClassification(ev.id);
  assert.equal(re.evidenceType, 'REFUND_OR_CANCELLATION');
  const after = db.prepare('SELECT COUNT(*) c FROM evidence_classifications WHERE evidenceId = ?').get(ev.id).c;
  assert.equal(after, before + 1);
});

test('classification never runs on non-extracted documents', async () => {
  const id = seedDispute();
  const ev = await createEvidence(id, { originalname: 'bad.json', mimetype: 'application/json', size: 20, buffer: Buffer.from('{ this is not valid json ') });
  // EXTRACTION_FAILED -> no classification
  assert.equal(ev.processingStatus, 'EXTRACTION_FAILED');
  assert.equal(ev.evidenceType, undefined);
  const rows = db.prepare('SELECT COUNT(*) c FROM evidence_classifications WHERE evidenceId = ?').get(ev.id).c;
  assert.equal(rows, 0);
});
