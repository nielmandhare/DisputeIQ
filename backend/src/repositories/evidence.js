// Evidence document repository. CRUD + normalization to safe API shapes.
// extractedText is never returned in list views — only via getEvidenceDetail.
import { db, now } from '../db.js';
import { randomUUID } from 'node:crypto';
import { storage } from '../services/storage.js';
import { extract, isSupportedMime } from '../services/extraction.js';
import { classifyEvidence } from '../services/classifier.js';
import { detectAndStoreContradictions } from '../repositories/contradictions.js';
import { recordAudit } from '../services/audit.js';

const MAX_SIZE = Number(process.env.EVIDENCE_MAX_BYTES || 15 * 1024 * 1024); // 15 MB

export function disputeExists(disputeId) {
  return Boolean(db.prepare('SELECT id FROM disputes WHERE id = ?').get(disputeId));
}

/** Create an evidence record (initially PROCESSING) and store the file. */
export async function createEvidence(disputeId, file) {
  if (!disputeExists(disputeId)) {
    const err = new Error('Dispute not found');
    err.status = 404;
    throw err;
  }
  if (!isSupportedMime(file.mimetype)) {
    const err = new Error('Unsupported file type. Allowed: PDF, TXT, JSON.');
    err.status = 415;
    throw err;
  }
  if (file.size > MAX_SIZE) {
    const err = new Error(`File too large (max ${Math.round(MAX_SIZE / 1024 / 1024)} MB).`);
    err.status = 413;
    throw err;
  }
  const id = `ev_${randomUUID().slice(0, 8)}`;
  const ts = now();
  // Store the file FIRST (so a storage failure doesn't leave a phantom record).
  const { safeName, storageLocation } = await storage.save(disputeId, file.originalname, file.buffer);
  db.prepare(`INSERT INTO evidence_documents
    (id, disputeId, filename, safeName, mimeType, size, storageLocation, processingStatus, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?)`).run(
    id, disputeId, file.originalname, safeName, file.mimetype, file.size, storageLocation, ts, ts,
  );
  recordAudit({ actor: 'MERCHANT', eventType: 'EVIDENCE_UPLOADED', entityType: 'EVIDENCE', entityId: id, statusText: `Uploaded ${file.originalname}`, metadata: { disputeId, size: file.size, mime: file.mimetype } });

  // Extract inline (reliable; no premature queue).
  let result;
  try {
    result = await extract({ mimeType: file.mimetype, buffer: file.buffer });
  } catch (e) {
    result = { status: 'EXTRACTION_FAILED', method: null, text: '', error: String(e.message).slice(0, 200), characterCount: 0, pageCount: 0, processingMs: 0 };
  }
  db.prepare(`UPDATE evidence_documents SET processingStatus=?, extractionMethod=?, extractedText=?, extractionError=?,
    characterCount=?, pageCount=?, processingMs=?, updatedAt=? WHERE id=?`).run(
    result.status, result.method, result.text || null, result.error || null,
    result.characterCount ?? null, result.pageCount ?? null, result.processingMs ?? null, now(), id,
  );
  // Audit the terminal state.
  const evt = {
    EXTRACTED: 'EVIDENCE_EXTRACTED',
    OCR_REQUIRED: 'EVIDENCE_OCR_REQUIRED',
    EXTRACTION_FAILED: 'EVIDENCE_EXTRACTION_FAILED',
    UNSUPPORTED: 'EVIDENCE_REJECTED',
  }[result.status] || 'EVIDENCE_PROCESSING_STARTED';
  recordAudit({ actor: 'SYSTEM', eventType: evt, entityType: 'EVIDENCE', entityId: id, statusText: `${result.status} (${result.method || 'n/a'})`, metadata: { chars: result.characterCount, pages: result.pageCount } });
  // Slice 3: classify the extracted (or OCR-queued) text.
  if (result.status === 'EXTRACTED') {
    await runClassification(id);
    // Slice 4: re-run the contradiction engine now that a new extracted doc exists.
    detectAndStoreContradictions(disputeId);
  }
  return getEvidenceById(id);
}

/**
 * Run the classification engine on an evidence record and persist the result.
 * Used both inline (after extraction) and via POST /api/evidence/:id/reclassify.
 * Operates ONLY on extracted text — never on raw files.
 */
export async function runClassification(id) {
  const row = db.prepare('SELECT * FROM evidence_documents WHERE id = ?').get(id);
  if (!row) {
    const err = new Error('Evidence not found');
    err.status = 404;
    throw err;
  }
  if (!row.extractedText) {
    return getEvidenceById(id); // nothing to classify
  }
  const cls = await classifyEvidence({ extractedText: row.extractedText, filename: row.filename });
  const ts = now();
  db.prepare(`UPDATE evidence_documents SET evidenceType=?, confidence=?, classificationMethod=?,
    classificationSource=?, classificationError=?, updatedAt=? WHERE id=?`).run(
    cls.evidenceType, cls.confidence, cls.method,
    cls.method === 'LLM' ? 'LLM' : 'HEURISTIC',
    cls.error || cls.fallbackReason || null, ts, id,
  );
  // Persist full structured classification (provenance) in its own table.
  const cid = `evc_${randomUUID().slice(0, 8)}`;
  db.prepare(`INSERT INTO evidence_classifications
    (id, evidenceId, disputeId, evidenceType, confidence, method, model, signals, sourceSpans, sourceText, fallbackReason, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    cid, id, row.disputeId, cls.evidenceType, cls.confidence, cls.method, cls.model || null,
    JSON.stringify(cls.signals || []), JSON.stringify(cls.sourceSpans || []),
    cls.sourceText || null, cls.fallbackReason || null, ts,
  );
  recordAudit({
    actor: 'AI ENGINE', eventType: 'EVIDENCE_CLASSIFIED', entityType: 'EVIDENCE', entityId: id,
    statusText: `${cls.evidenceType} @${cls.confidence}% via ${cls.method}`,
    metadata: { evidenceType: cls.evidenceType, confidence: cls.confidence, method: cls.method, model: cls.model || null, fallback: Boolean(cls.fallbackReason) },
  });
  return getEvidenceById(id);
}

export function listForDispute(disputeId) {
  const rows = db.prepare('SELECT * FROM evidence_documents WHERE disputeId = ? ORDER BY createdAt DESC').all(disputeId);
  return rows.map(toSafeShape);
}

export function getEvidenceById(id) {
  const row = db.prepare('SELECT * FROM evidence_documents WHERE id = ?').get(id);
  return row ? toDetailShape(row) : null;
}

export function getEvidenceMeta(id) {
  const row = db.prepare('SELECT * FROM evidence_documents WHERE id = ?').get(id);
  return row ? toSafeShape(row) : null;
}

function toSafeShape(r) {
  return {
    id: r.id,
    disputeId: r.disputeId,
    fileName: r.filename,
    size: humanSize(r.size),
    mimeType: r.mimeType,
    processingStatus: r.processingStatus,
    extractionMethod: r.extractionMethod,
    characterCount: r.characterCount,
    pageCount: r.pageCount,
    statusLabel: labelFor(r.processingStatus),
    extractionError: r.extractionError || undefined,
    storageLocation: r.storageLocation, // logical id (disputeId/safeName), never an absolute fs path
    extractedPreview: r.extractedText ? r.extractedText.slice(0, 280) : undefined, // truncated preview only; full text via /api/evidence/:id
    evidenceType: r.evidenceType || undefined,
    confidence: r.confidence == null ? undefined : Number(r.confidence),
    classificationMethod: r.classificationMethod || undefined,
    classificationSource: r.classificationSource || undefined,
    createdAt: new Date(r.createdAt * 1000).toISOString(),
    updatedAt: new Date(r.updatedAt * 1000).toISOString(),
  };
}

function toDetailShape(r) {
  return { ...toSafeShape(r), extractedText: r.extractedText || '' };
}

function labelFor(status) {
  switch (status) {
    case 'EXTRACTED': return 'READY FOR ANALYSIS';
    case 'PROCESSING': return 'PROCESSING';
    case 'OCR_REQUIRED': return 'OCR REQUIRED';
    case 'EXTRACTION_FAILED': return 'EXTRACTION FAILED';
    case 'UNSUPPORTED': return 'UNSUPPORTED';
    default: return status;
  }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
