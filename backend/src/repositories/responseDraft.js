// Slice 7 — response draft repository: assemble, generate, validate, persist (versioned),
// and human-approve. NEVER submits to Razorpay. Submission belongs to Slice 8.
import { db, now } from '../db.js';
import { randomUUID } from 'node:crypto';
import { recordAudit } from '../services/audit.js';
import { recordAiEvent } from '../services/aiEvents.js';
import { getDisputeById } from './disputes.js';
import { listForDispute as listEvidence } from './evidence.js';
import { listForDispute as listTimeline } from './timeline.js';
import { listForDispute as listContradictions } from './contradictions.js';
import { getErs, getGaps } from './ers.js';
import {
  assembleContext,
  generateHeuristicDraft,
  generateLLMDraft,
  validateDraft,
} from '../services/responseDraft.js';

function disputeExists(id) {
  return Boolean(db.prepare('SELECT id FROM disputes WHERE id = ?').get(id));
}

/** Assemble the grounded context for a dispute from real data. */
export function buildContext(disputeId) {
  if (!disputeExists(disputeId)) {
    const err = new Error('Dispute not found');
    err.status = 404;
    throw err;
  }
  const dispute = getDisputeById(disputeId);
  const evidence = listEvidence(disputeId);
  const timeline = listTimeline(disputeId);
  const contradictions = listContradictions(disputeId);
  const ers = getErs(disputeId);
  const gaps = getGaps(disputeId);
  return assembleContext({ dispute, evidence, timeline, contradictions, ers, gaps });
}

/**
 * Generate + validate + persist a response draft for a dispute.
 * Tries LLM (if configured + valid); otherwise deterministic HEURISTIC.
 * On LLM failure/invalid output, falls back to HEURISTIC and marks fallbackUsed.
 * Returns the persisted draft shape.
 */
export async function generateForDispute(disputeId) {
  const ctx = buildContext(disputeId);
  const started = now();

  let result = null;
  let fallbackUsed = false;
  try {
    result = await generateLLMDraft(ctx);
  } catch {
    result = null;
  }

  if (result) {
    const { valid, errors, coverage } = validateDraft(result.draft, ctx.validSourceIds, ctx.validSourceText);
    if (!valid) {
      result = null; // reject invalid LLM output -> heuristic
      fallbackUsed = true;
    } else if (coverage < 100) {
      // Not fully grounded: prefer heuristic to guarantee 100% coverage.
      result = null;
      fallbackUsed = true;
    }
  }

  if (!result) {
    result = generateHeuristicDraft(ctx);
    // fallbackUsed remains true ONLY if the LLM was attempted and rejected above.
    // The default (no LLM key / LLM not configured) heuristic is NOT a fallback.
  }

  const validation = validateDraft(result.draft, ctx.validSourceIds, ctx.validSourceText);
  const draftVersion = nextVersion(disputeId);
  const id = `rd_${randomUUID().slice(0, 8)}`;
  const ts = now();
  const status = validation.valid ? 'DRAFT_READY' : 'DRAFT_REVIEW_REQUIRED';
  const metrics = {
    sourceCount: ctx.evidence.length,
    claimCount: validation.claimCount,
    groundedCount: validation.groundedCount,
    coverage: validation.coverage,
    validationStatus: validation.valid ? 'valid' : 'review_required',
    groundedClaimCoverage: validation.coverage,
  };

  db.prepare(`INSERT INTO response_drafts
    (id, disputeId, draftVersion, generationMethod, provider, model, status, draft, metrics, fallbackUsed, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, disputeId, draftVersion, result.generationMethod, result.provider || 'heuristic', result.model || null,
    status, JSON.stringify(result.draft), JSON.stringify(metrics), fallbackUsed ? 1 : 0, ts, ts,
  );
  db.prepare("UPDATE disputes SET responseStatus = ?, updatedAt = ? WHERE id = ?").run(status, ts, disputeId);

  const duration = now() - started;
  // Real AI-analysis observability: what actually generated this draft.
  try {
    const usedLlm = result.generationMethod === 'LLM';
    recordAiEvent({
      disputeId, operation: 'RESPONSE_DRAFTING',
      usedLlm, inputCount: ctx.evidence.length, outputCount: validation.claimCount,
      confidence: validation.coverage, durationMs: duration * 1000, status: 'COMPLETED',
      metadata: {
        generationMethod: result.generationMethod, fallbackUsed, draftVersion, status,
        coverage: validation.coverage, valid: validation.valid,
      },
    });
  } catch { /* non-fatal */ }
  recordAudit({
    actor: 'AI ENGINE', eventType: 'DRAFT_GENERATED', entityType: 'RESPONSE_DRAFT', entityId: id,
    statusText: `v${draftVersion} via ${result.generationMethod}${fallbackUsed ? ' (heuristic fallback)' : ''}`,
    metadata: {
      disputeId, generationMethod: result.generationMethod, model: result.model || null,
      draftVersion, status, fallbackUsed, processingDuration: duration,
      sourceCount: metrics.sourceCount, claimCount: metrics.claimCount, coverage: metrics.coverage,
    },
  });

  return toShape(db.prepare('SELECT * FROM response_drafts WHERE id = ?').get(id));
}

function nextVersion(disputeId) {
  const row = db.prepare('SELECT MAX(draftVersion) AS m FROM response_drafts WHERE disputeId = ?').get(disputeId);
  return (row?.m || 0) + 1;
}

export function getLatest(disputeId) {
  const row = db.prepare('SELECT * FROM response_drafts WHERE disputeId = ? ORDER BY draftVersion DESC LIMIT 1').get(disputeId);
  return row ? toShape(row) : null;
}

export function getById(id) {
  const row = db.prepare('SELECT * FROM response_drafts WHERE id = ?').get(id);
  return row ? toShape(row) : null;
}

export function listForDispute(disputeId) {
  const rows = db.prepare('SELECT * FROM response_drafts WHERE disputeId = ? ORDER BY draftVersion DESC').all(disputeId);
  return rows.map(toShape);
}

/** Human approval: mark the draft reviewed/ready. Does NOT submit to Razorpay. */
export function approveDraft(disputeId) {
  const latest = getLatest(disputeId);
  if (!latest) {
    const err = new Error('No draft to approve');
    err.status = 404;
    throw err;
  }
  const ts = now();
  db.prepare("UPDATE disputes SET responseStatus = 'APPROVED', updatedAt = ? WHERE id = ?").run(ts, disputeId);
  db.prepare('UPDATE response_drafts SET status = ?, updatedAt = ? WHERE id = ?').run('DRAFT_APPROVED', ts, latest.id);
  recordAudit({
    actor: 'MERCHANT', eventType: 'DRAFT_APPROVED', entityType: 'RESPONSE_DRAFT', entityId: latest.id,
    statusText: 'Human approved draft (no submission).', metadata: { disputeId, draftId: latest.id, draftVersion: latest.draftVersion },
  });
  return getLatest(disputeId);
}

function toShape(r) {
  return {
    id: r.id,
    disputeId: r.disputeId,
    draftVersion: r.draftVersion,
    generationMethod: r.generationMethod,
    provider: r.provider || null,
    model: r.model || null,
    status: r.status,
    valid: (safeParse(r.metrics)?.validationStatus || (r.status === 'DRAFT_READY')) === 'valid', // grounding validation result, independent of approval status
    draft: safeParse(r.draft),
    metrics: safeParse(r.metrics),
    fallbackUsed: Boolean(r.fallbackUsed),
    createdAt: new Date(r.createdAt * 1000).toISOString(),
    updatedAt: new Date(r.updatedAt * 1000).toISOString(),
  };
}

function safeParse(s) {
  try { return s ? JSON.parse(s) : undefined; } catch { return undefined; }
}
