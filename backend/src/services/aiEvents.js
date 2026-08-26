// AI-analysis observability. Records the ACTUAL engine execution for each
// pipeline stage (evidence classification, timeline extraction, response
// drafting) — real provider, model, method (LLM vs HEURISTIC fallback),
// duration, input/output counts, confidence, and status. The UI reads these
// to show the judge exactly what the AI did, with no fabrication.
import { randomUUID } from 'node:crypto';
import { db, now } from '../db.js';
import { llmProviderInfo } from './llm.js';

/** Provider/model string for the HEURISTIC fallback path. */
const HEURISTIC_PROVIDER = 'Heuristic';
const HEURISTIC_MODEL = 'Deterministic engine';

/**
 * @param {object} e
 * @param {string} e.disputeId
 * @param {string} [e.evidenceId]
 * @param {string} e.operation     EVIDENCE_CLASSIFICATION | TIMELINE_EXTRACTION | RESPONSE_DRAFTING
 * @param {boolean} e.usedLlm      true if an LLM actually ran; false if heuristic fallback
 * @param {string}  e.status        COMPLETED | FAILED
 * @param {number} [e.inputCount]
 * @param {number} [e.outputCount]
 * @param {number} [e.confidence]   0-100
 * @param {number} e.durationMs
 * @param {object} [e.metadata]
 */
export function recordAiEvent(e) {
  const info = llmProviderInfo();
  const usedLlm = Boolean(e.usedLlm);
  const provider = usedLlm ? info.provider : HEURISTIC_PROVIDER;
  const model = usedLlm ? info.modelLabel : HEURISTIC_MODEL;
  const method = usedLlm ? 'LLM' : 'HEURISTIC';
  const id = `aie_${randomUUID().slice(0, 8)}`;
  const ts = now();
  db.prepare(
    `INSERT INTO ai_analysis_events
      (id, disputeId, evidenceId, operation, provider, model, method, status, inputCount, outputCount, confidence, durationMs, timestamp, metadata, requestId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, e.disputeId || null, e.evidenceId || null, e.operation, provider, model, method,
    e.status || 'COMPLETED', e.inputCount ?? null, e.outputCount ?? null, e.confidence ?? null,
    e.durationMs ?? 0, ts, e.metadata ? JSON.stringify(e.metadata) : null, e.requestId || null,
  );
  return id;
}

function toUi(r) {
  return {
    id: r.id,
    disputeId: r.disputeId,
    evidenceId: r.evidenceId,
    operation: r.operation,
    provider: r.provider,
    model: r.model,
    method: r.method,
    status: r.status,
    inputCount: r.inputCount,
    outputCount: r.outputCount,
    confidence: r.confidence,
    durationMs: r.durationMs,
    timestamp: new Date(r.timestamp * 1000).toISOString(),
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
  };
}

export function listForDispute(disputeId) {
  return db.prepare('SELECT * FROM ai_analysis_events WHERE disputeId = ? ORDER BY timestamp ASC').all(disputeId).map(toUi);
}

export function listForEvidence(evidenceId) {
  return db.prepare('SELECT * FROM ai_analysis_events WHERE evidenceId = ? ORDER BY timestamp ASC').all(evidenceId).map(toUi);
}

export function listAll(limit = 200) {
  return db.prepare('SELECT * FROM ai_analysis_events ORDER BY timestamp DESC LIMIT ?').all(limit).map(toUi);
}

/** Provider/model/configuration the judge should see in the AI panel. */
export function aiProviderStatus() {
  const info = llmProviderInfo();
  return {
    provider: info.provider,
    model: info.modelLabel,
    modelId: info.model,
    configured: info.configured,
    baseUrl: info.baseUrl,
    llmActive: info.configured,
  };
}
