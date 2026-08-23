// Slice 2 evidence pipeline tests. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db.js';
import { storage } from '../src/services/storage.js';
import { extract, isSupportedMime } from '../src/services/extraction.js';
import { createEvidence, listForDispute, disputeExists } from '../src/repositories/evidence.js';
import { config } from '../src/config.js';

const ROOT = 'D:/DisputeIQ/backend/.work/evtest';
mkdirSync(ROOT, { recursive: true });

function bufOf(text) { return Buffer.from(text, 'utf8'); }

before(() => {
  config.storageDir = './.work/storage_test';
});

test('extraction: TXT -> EXTRACTED', async () => {
  const r = await extract({ mimeType: 'text/plain', buffer: bufOf('Delivery confirmed on March 15.') });
  assert.equal(r.status, 'EXTRACTED');
  assert.equal(r.method, 'TXT_DIRECT');
  assert.ok(r.characterCount > 0);
});

test('extraction: JSON valid -> EXTRACTED', async () => {
  const r = await extract({ mimeType: 'application/json', buffer: bufOf('{"a":1}') });
  assert.equal(r.status, 'EXTRACTED');
  assert.equal(r.method, 'JSON_PARSE');
});

test('extraction: JSON invalid -> EXTRACTION_FAILED', async () => {
  const r = await extract({ mimeType: 'application/json', buffer: bufOf('{ bad') });
  assert.equal(r.status, 'EXTRACTION_FAILED');
  assert.match(r.error, /Invalid JSON/);
});

test('extraction: PDF real -> EXTRACTED', async () => {
  const { PDFDocument } = await import('pdf-lib');
  const d = await PDFDocument.create();
  d.addPage().drawText('Return initiated on March 12 after delivery.');
  const bytes = await d.save();
  const r = await extract({ mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
  assert.equal(r.status, 'EXTRACTED');
  assert.equal(r.method, 'PDF_TEXT');
  assert.ok(r.pageCount >= 1);
});

test('extraction: PDF image-only -> OCR_REQUIRED', async () => {
  const { PDFDocument } = await import('pdf-lib');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  const d = await PDFDocument.create();
  const img = await d.embedPng(png);
  const p = d.addPage([img.width, img.height]);
  p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const r = await extract({ mimeType: 'application/pdf', buffer: Buffer.from(await d.save()) });
  assert.equal(r.status, 'OCR_REQUIRED');
});

test('isSupportedMime: allowlist', () => {
  assert.equal(isSupportedMime('text/plain'), true);
  assert.equal(isSupportedMime('application/json'), true);
  assert.equal(isSupportedMime('application/pdf'), true);
  assert.equal(isSupportedMime('image/png'), false);
});

test('createEvidence: rejects unsupported type (415)', async () => {
  const id = `disp_test_${randomUUID().slice(0, 6)}`;
  db.prepare('INSERT INTO disputes (id, razorpayDisputeId, amount, currency, reasonCode, reasonLabel, status, createdAt, updatedAt) VALUES (?,?,0,?,?,?,?,?,?)')
    .run(id, `dupu_${randomUUID().slice(0, 6)}`, 'INR', 'general', 'General', 'open', 1, 1);
  await assert.rejects(
    () => createEvidence(id, { originalname: 'x.png', mimetype: 'image/png', size: 10, buffer: bufOf('x') }),
    (e) => e.status === 415,
  );
});

test('createEvidence: rejects nonexistent dispute (404)', async () => {
  await assert.rejects(
    () => createEvidence('disp_no_such', { originalname: 'a.txt', mimetype: 'text/plain', size: 10, buffer: bufOf('hello') }),
    (e) => e.status === 404,
  );
});

test('createEvidence: valid TXT -> persisted EXTRACTED + storage file', async () => {
  const id = `disp_test_${randomUUID().slice(0, 6)}`;
  db.prepare('INSERT INTO disputes (id, razorpayDisputeId, amount, currency, reasonCode, reasonLabel, status, createdAt, updatedAt) VALUES (?,?,0,?,?,?,?,?,?)')
    .run(id, `dupu_${randomUUID().slice(0, 6)}`, 'INR', 'general', 'General', 'open', 1, 1);
  const ev = await createEvidence(id, { originalname: 'delivery.txt', mimetype: 'text/plain', size: 20, buffer: bufOf('Package delivered March 15.') });
  assert.equal(ev.processingStatus, 'EXTRACTED');
  assert.ok(ev.id.startsWith('ev_'));
  // Storage file exists and safeName has no path separators.
  assert.ok(await storage.exists(ev.storageLocation));
  assert.ok(!ev.storageLocation.includes('..') && !ev.storageLocation.split('/')[1].includes('/'));
  const list = listForDispute(id);
  assert.equal(list.length, 1);
});

test('security: path traversal filename is neutralized', async () => {
  const id = `disp_test_${randomUUID().slice(0, 6)}`;
  db.prepare('INSERT INTO disputes (id, razorpayDisputeId, amount, currency, reasonCode, reasonLabel, status, createdAt, updatedAt) VALUES (?,?,0,?,?,?,?,?,?)')
    .run(id, `dupu_${randomUUID().slice(0, 6)}`, 'INR', 'general', 'General', 'open', 1, 1);
  const ev = await createEvidence(id, { originalname: '../../evil.txt', mimetype: 'text/plain', size: 12, buffer: bufOf('traversal test') });
  // stored name must not contain traversal segments
  assert.ok(!ev.storageLocation.includes('..'));
  assert.ok(await storage.exists(ev.storageLocation));
});

after(() => {
  // best-effort cleanup of test disputes
  db.prepare("DELETE FROM evidence_documents WHERE disputeId LIKE 'disp_test_%'").run();
  db.prepare("DELETE FROM disputes WHERE id LIKE 'disp_test_%'").run();
});
