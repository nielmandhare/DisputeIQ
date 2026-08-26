// Slice 8 — Human-gated Razorpay contest submission.
//
// CRITICAL SAFETY MODEL:
//   - The AI NEVER invokes this. Submission is triggered only by an explicit
//     human action (POST /api/disputes/:id/submit with actor='HUMAN').
//   - The backend INDEPENDENTLY re-verifies every mandatory condition before
//     any external call. A client cannot bypass approval.
//   - SIMULATED mode is the default (no Razorpay credentials). No external
//     request is made. LIVE mode is gated behind credentials + explicit flag.
//   - Idempotency: a dispute+draftVersion is submitted at most ONCE. A timeout
//     after the request may have been received is treated as REQUIRES_REVIEW,
//     never blindly retried.
//
// Razorpay payloads for LIVE contest/documents are intentionally minimal and
// flagged as UNVERIFIED pending real test credentials (see final report).
import { config } from '../config.js';
import { db, now } from '../db.js';
import { recordAudit } from './audit.js';
import { razorpay, RazorpayError } from './razorpay/client.js';
import { getLatest } from '../repositories/responseDraft.js';
import { listForDispute as listEvidence } from '../repositories/evidence.js';
import { computeAndStoreErs, getErs } from '../repositories/ers.js';
import { getDisputeById } from '../repositories/disputes.js';

// Mandatory proof that the charge is legitimate. An invoice/receipt is the
// irreducible evidence for any contest; shipping/photo/communication are
// supporting but scenario-dependent (not every dispute has a delivery).
const REQUIRED_EVIDENCE_TYPES = ['INVOICE_OR_RECEIPT'];
const SUCCESS_STATUSES = ['SUBMITTED', 'CONFIRMED'];

function liveSubmissionConfigured() {
  // Read credentials LIVE from process.env (not the frozen config object) so the
  // mode can be toggled via environment without restarting the module graph.
  const configured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  return configured && (process.env.RAZORPAY_SUBMISSION_MODE || 'simulated').toLowerCase() === 'live';
}

/**
 * Decide the submission mode. Synthetic/demo disputes (provider='demo') have no
 * real Razorpay presence, so they can NEVER be submitted to live Razorpay — they
 * are always SIMULATED (clearly marked, no external request). Only a dispute that
 * is a real Razorpay dispute (provider != 'demo' AND a real razorpayDisputeId)
 * AND has live credentials + the explicit flag goes LIVE.
 */
function resolveSubmissionMode(dispute) {
  const isRealRazorpayDispute = dispute?.provider !== 'demo' && Boolean(dispute?.razorpayDisputeId);
  if (!isRealRazorpayDispute) return 'SIMULATED';
  return liveSubmissionConfigured() ? 'LIVE' : 'SIMULATED';
}

function audit(e) {
  // Always stamp the submission lifecycle so transitions are auditable.
  return recordAudit(e);
}

/**
 * Verify ALL mandatory preconditions. Returns { ok, code, message }.
 * Throws nothing — callers decide whether to proceed.
 */
export function verifySubmissionPreconditions(dispute, draft, evidence) {
  if (!dispute) return { ok: false, code: 'NO_DISPUTE', message: 'Dispute not found.' };
  if (!draft) return { ok: false, code: 'NO_DRAFT', message: 'No response draft exists for this dispute.' };
  if (draft.status !== 'DRAFT_APPROVED')
    return { ok: false, code: 'NOT_APPROVED', message: 'Submission blocked: the draft has not been explicitly approved by a human.' };
  if (!draft.valid)
    return { ok: false, code: 'DRAFT_INVALID', message: 'Submission blocked: the draft failed grounding validation.' };
  if ((draft.metrics?.coverage ?? 0) < 100)
    return { ok: false, code: 'DRAFT_UNGROUNDED', message: 'Submission blocked: the draft is not 100% source-grounded.' };

  const presentTypes = new Set(evidence.map((e) => e.evidenceType).filter(Boolean));
  const missing = REQUIRED_EVIDENCE_TYPES.filter((t) => !presentTypes.has(t));
  if (missing.length)
    return { ok: false, code: 'MISSING_EVIDENCE', message: `Submission blocked: required evidence missing (${missing.join(', ')}).` };

  return { ok: true, code: 'OK', message: 'All preconditions satisfied.' };
}

/** Idempotency check: has this dispute+draftVersion already been submitted (successfully or in-flight)? */
export function findExistingSubmission(disputeId, draftVersion) {
  return db
    .prepare(`SELECT * FROM submissions WHERE disputeId=? AND draftVersion=? ORDER BY startedAt DESC LIMIT 1`)
    .get(disputeId, draftVersion);
}

function persistSubmission(rec) {
  db.prepare(
    `INSERT INTO submissions (id, disputeId, draftId, draftVersion, mode, status, httpStatus, razorpayStatus, errorText, evidenceUploaded, requestId, startedAt, completedAt, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    rec.id, rec.disputeId, rec.draftId, rec.draftVersion, rec.mode, rec.status,
    rec.httpStatus ?? null, rec.razorpayStatus ?? null, rec.errorText ?? null,
    rec.evidenceUploaded ? JSON.stringify(rec.evidenceUploaded) : null,
    rec.requestId ?? null, rec.startedAt, rec.completedAt ?? null,
    rec.metadata ? JSON.stringify(rec.metadata) : null,
  );
}

function updateSubmission(id, patch) {
  const sets = Object.keys(patch).map((k) => `${k}=?`).join(', ');
  const values = Object.values(patch).map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : v));
  db.prepare(`UPDATE submissions SET ${sets} WHERE id=?`).run(...values, id);
}

function markDisputeSubmitted(disputeId, status, ts) {
  db.prepare(`UPDATE disputes SET submissionStatus=?, submittedAt=? WHERE id=?`).run(status, ts, disputeId);
}

/**
 * Upload required evidence documents to Razorpay (LIVE only).
 * Uses the documented Documents API. Returns [{localEvidenceId, razorpayDocumentId}].
 * NOTE: payload schema is UNVERIFIED pending real test credentials.
 */
async function uploadEvidenceLive(dispute, evidence) {
  const uploaded = [];
  for (const ev of evidence) {
    try {
      const res = await razorpay.uploadDisputeDocument(dispute.razorpayDisputeId, {
        type: 'evidence',
        // Minimal, documented-ish fields only; verified against real API at testing.
        file: { name: ev.fileName, content_type: ev.mimeType || 'application/octet-stream' },
      });
      uploaded.push({ localEvidenceId: ev.id, razorpayDocumentId: res?.id || null });
    } catch (err) {
      // Upload failure is non-fatal for the contest call but recorded.
      uploaded.push({ localEvidenceId: ev.id, razorpayDocumentId: null, error: err.message });
    }
  }
  return uploaded;
}

/**
 * Submit the contest to Razorpay (LIVE only). Returns { httpStatus, razorpayStatus }.
 * NOTE: contest endpoint payload is UNVERIFIED pending real test credentials.
 */
async function submitContestLive(dispute, draft) {
  const res = await razorpay.contestDispute(dispute.razorpayDisputeId, {
    // Documented capability: contest a dispute with a comment + evidence refs.
    // Payload shape to be verified against the live test environment.
    comment: draft.summary?.text || 'Dispute contest submitted via DisputeIQ.',
    contest_type: 'evidence',
  });
  return { httpStatus: 200, razorpayStatus: res?.status || 'contested' };
}

/**
 * SIMULATED submission. No external request. Deterministic, clearly marked.
 */
function simulatedSubmit(dispute, draft, evidence, requestId) {
  const result = {
    id: `sub_${requestId}`,
    disputeId: dispute.id,
    draftId: draft.id,
    draftVersion: draft.draftVersion,
    mode: 'SIMULATED',
    status: 'SUBMITTED',
    httpStatus: 200,
    razorpayStatus: 'SIMULATED',
    evidenceUploaded: evidence.map((e) => ({ localEvidenceId: e.id, razorpayDocumentId: `sim_${e.id}` })),
    requestId,
    startedAt: now(),
    completedAt: now(),
    metadata: { simulated: true, note: 'No request was sent to Razorpay.' },
  };
  return result;
}

/**
 * MAIN ENTRY POINT. Triggered ONLY by an explicit human action.
 * Re-verifies everything server-side. Idempotent. Never called by AI.
 */
export async function submitDispute(disputeId, { actor = 'HUMAN' } = {}) {
  const requestId = randomSuffix();
  const dispute = getDisputeById(disputeId);
  const draft = getLatest(disputeId);
  const evidence = listEvidence(disputeId);

  // 1-8: independent backend verification (trust nothing from the client).
  const pre = verifySubmissionPreconditions(dispute, draft, evidence);
  if (!pre.ok) {
    audit({ actor: 'SYSTEM', eventType: 'SUBMISSION_BLOCKED', entityType: 'DISPUTE', entityId: disputeId, statusText: pre.message, metadata: { code: pre.code, draftVersion: draft?.draftVersion, actor } });
    const err = new Error(pre.message);
    err.code = pre.code;
    throw err;
  }

  // 9: idempotency — never submit the same dispute+draft twice.
  const existing = findExistingSubmission(disputeId, draft.draftVersion);
  if (existing && SUCCESS_STATUSES.includes(existing.status)) {
    audit({ actor: 'SYSTEM', eventType: 'SUBMISSION_DEDUPED', entityType: 'DISPUTE', entityId: disputeId, statusText: 'Returned existing submission; no duplicate call made.', metadata: { submissionId: existing.id, actor } });
    return toShape(existing);
  }
  if (existing && existing.status === 'SUBMISSION_PENDING') {
    // In-flight from a prior identical request.
    return toShape(existing);
  }
  if (existing && (existing.status === 'SUBMISSION_REQUIRES_REVIEW' || existing.status === 'SUBMISSION_FAILED')) {
    // The prior attempt ended in an unknown/known failure. Do NOT blindly retry —
    // the human must reconcile (or explicitly reset) before another submission.
    const err = new Error(`Submission blocked: a prior attempt ended in ${existing.status}. Reconcile the dispute state before retrying.`);
    err.code = 'BLOCKED_PRIOR_STATE';
    throw err;
  }

  const mode = resolveSubmissionMode(dispute);
  const startedAt = now();
  const recId = `sub_${requestId}`;
  const base = { id: recId, disputeId, draftId: draft.id, draftVersion: draft.draftVersion, mode, status: 'SUBMISSION_PENDING', requestId, startedAt };
  persistSubmission(base);
  markDisputeSubmitted(disputeId, 'SUBMISSION_PENDING', startedAt);
  audit({ actor: 'SYSTEM', eventType: 'SUBMISSION_STARTED', entityType: 'DISPUTE', entityId: disputeId, statusText: `Submission started (${mode}).`, metadata: { draftVersion: draft.draftVersion, mode, actor } });

  if (mode === 'SIMULATED') {
    const result = simulatedSubmit(dispute, draft, evidence, requestId);
    updateSubmission(recId, { status: 'SUBMITTED', httpStatus: 200, razorpayStatus: 'SIMULATED', completedAt: now(), evidenceUploaded: result.evidenceUploaded });
    markDisputeSubmitted(disputeId, 'SUBMITTED', now());
    audit({ actor: 'SYSTEM', eventType: 'CONTEST_ACCEPTED', entityType: 'DISPUTE', entityId: disputeId, statusText: 'SIMULATED contest submission accepted (no real Razorpay request).', metadata: { submissionId: recId, mode, actor } });
    return toShape({ ...base, ...result, status: 'SUBMITTED' });
  }

  // LIVE path — only reachable with credentials + explicit mode flag.
  let uploaded = [];
  try {
    audit({ actor: 'SYSTEM', eventType: 'EVIDENCE_UPLOAD_STARTED', entityType: 'DISPUTE', entityId: disputeId, statusText: 'Uploading evidence to Razorpay.', metadata: { actor } });
    uploaded = await uploadEvidenceLive(dispute, evidence);
    audit({ actor: 'SYSTEM', eventType: 'EVIDENCE_UPLOADED', entityType: 'DISPUTE', entityId: disputeId, statusText: `${uploaded.filter((u) => u.razorpayDocumentId).length}/${uploaded.length} document(s) uploaded.`, metadata: { actor } });

    audit({ actor: 'SYSTEM', eventType: 'CONTEST_REQUEST_SENT', entityType: 'DISPUTE', entityId: disputeId, statusText: 'Contest request sent to Razorpay.', metadata: { actor } });
    const live = await submitContestLive(dispute, draft);
    updateSubmission(recId, { status: 'SUBMITTED', httpStatus: live.httpStatus, razorpayStatus: live.razorpayStatus, completedAt: now(), evidenceUploaded: uploaded });
    markDisputeSubmitted(disputeId, 'SUBMITTED', now());
    audit({ actor: 'SYSTEM', eventType: 'CONTEST_ACCEPTED', entityType: 'DISPUTE', entityId: disputeId, statusText: 'LIVE contest submission accepted.', metadata: { submissionId: recId, httpStatus: live.httpStatus, actor } });
    return toShape({ ...base, status: 'SUBMITTED', httpStatus: live.httpStatus, razorpayStatus: live.razorpayStatus, evidenceUploaded: uploaded });
  } catch (err) {
    // A KNOWN client failure is an explicit Razorpay 4xx (the client throws
    // RazorpayError with status 400-499). Anything else — network drop, timeout,
    // 5xx, or an unknown error after the request may have been sent — is treated
    // as an UNKNOWN result: we cannot assume failure, so we block blind retries.
    const knownClientFailure = err instanceof RazorpayError && err.status && err.status >= 400 && err.status < 500;
    if (!knownClientFailure) {
      // We cannot assume failure — Razorpay may have received it. Block retries.
      updateSubmission(recId, { status: 'SUBMISSION_REQUIRES_REVIEW', errorText: err.message, completedAt: now(), evidenceUploaded: uploaded });
      markDisputeSubmitted(disputeId, 'SUBMISSION_REQUIRES_REVIEW', now());
      audit({ actor: 'SYSTEM', eventType: 'SUBMISSION_REQUIRES_REVIEW', entityType: 'DISPUTE', entityId: disputeId, statusText: 'Submission result unknown (timeout/network). Requires reconciliation before retry.', metadata: { submissionId: recId, actor } });
      const e = new Error('Submission result unknown. Razorpay may have received the request. Reconcile before retrying.');
      e.code = 'REQUIRES_REVIEW';
      throw e;
    }
    // Known failure (explicit 4xx) — safe to surface, no blind retry.
    updateSubmission(recId, { status: 'SUBMISSION_FAILED', httpStatus: err.status || null, errorText: err.message, completedAt: now(), evidenceUploaded: uploaded });
    markDisputeSubmitted(disputeId, 'SUBMISSION_FAILED', now());
    audit({ actor: 'SYSTEM', eventType: 'CONTEST_FAILED', entityType: 'DISPUTE', entityId: disputeId, statusText: `LIVE contest failed (${err.status || 'error'}).`, metadata: { submissionId: recId, httpStatus: err.status, actor } });
    const e = new Error(`Razorpay submission failed: ${err.message}`);
    e.code = 'FAILED';
    e.httpStatus = err.status;
    throw e;
  }
}

export function getSubmission(disputeId) {
  const row = db.prepare(`SELECT * FROM submissions WHERE disputeId=? ORDER BY startedAt DESC LIMIT 1`).get(disputeId);
  return row ? toShape(row) : null;
}

function toShape(row) {
  return {
    id: row.id,
    disputeId: row.disputeId,
    draftId: row.draftId,
    draftVersion: row.draftVersion,
    mode: row.mode,
    status: row.status,
    httpStatus: row.httpStatus,
    razorpayStatus: row.razorpayStatus,
    errorText: row.errorText,
    evidenceUploaded: row.evidenceUploaded ? (typeof row.evidenceUploaded === 'string' ? JSON.parse(row.evidenceUploaded) : row.evidenceUploaded) : [],
    requestId: row.requestId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {},
  };
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
