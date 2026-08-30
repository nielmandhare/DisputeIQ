// Express server. Mounts the internal API the frontend consumes, the Razorpay
// webhook endpoint (raw body required for HMAC), and a dev seed endpoint.
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { db } from './db.js';
import { llmProviderInfo } from './services/llm.js';
import { handleWebhook } from './services/razorpay/webhooks.js';
import { listDisputes, getDisputeById } from './repositories/disputes.js';
import { listAuditForDispute, exportAuditCSV, exportAuditJSON, listAuditAll, auditCount } from './services/audit.js';
import { buildOverview } from './services/overview.js';
import { createEvidence, listForDispute, getEvidenceMeta, getEvidenceById, runClassification, listAll, evidenceStats } from './repositories/evidence.js';
import { listForDispute as listContradictions, detectAndStoreContradictions, markReviewed } from './repositories/contradictions.js';
import { listForEvidence as listTimeline, listForDispute as listTimelineDispute, runTimelineExtraction } from './repositories/timeline.js';
import { computeAndStoreErs, getErs, getGaps } from './repositories/ers.js';
import { generateForDispute, getLatest, approveDraft } from './repositories/responseDraft.js';
import { submitDispute, getSubmission } from './services/submission.js';
import { SyntheticDisputeProvider } from './providers/syntheticProvider.js';
import { evaluatePopulation, buildEvaluationReport } from './services/evaluation.js';
import { aiProviderStatus, listForDispute as listAiEventsForDispute, listAll as listAiEventsAll } from './services/aiEvents.js';

function safeJson(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

const upload = multer({
  storage: multer.memoryStorage(), // we persist via StorageService, not multer disk
  limits: { fileSize: Number(process.env.EVIDENCE_MAX_BYTES || 15 * 1024 * 1024), files: 10 },
});

const app = express();

// CORS (M2): strict allowlist from DISPUTEIQ_ALLOWED_ORIGINS. The wildcard "*"
// is NEVER used when origins are configured. In dev mode (no allowlist set) we
// reflect the request Origin so local frontends keep working — this is explicit,
// not a silent fallback, and is logged at startup.
app.use((req, res, next) => {
  const allowed = config.allowedOrigins;
  const origin = req.headers.origin;
  if (allowed.length > 0) {
    if (origin && allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    // Unauthorized origins get NO allow-origin header (rejected).
  } else {
    // Dev/demo mode: reflect the caller's Origin. Not "*".
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, X-Razorpay-Signature');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// API authentication (M2). Enforced ONLY when DISPUTEIQ_API_KEY is configured.
// In dev/demo mode (no key) this is a no-op so the local frontend works unchanged.
// Missing/invalid credentials => 401 with no secret leakage and no stack trace.
function requireApiKey(req, res, next) {
  if (!config.authRequired) return next();
  const auth = req.headers['authorization'] || '';
  const key = req.headers['x-api-key'];
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (key || '');
  if (!provided || !config.apiKey || provided !== config.apiKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Enforce the API key on all STATE-CHANGING /api routes (POST/PUT/DELETE).
// GET (read-only observability) and OPTIONS stay public. When auth is disabled
// (no DISPUTEIQ_API_KEY), this is a no-op — the local demo works unchanged.
// The Razorpay webhook (/webhooks/razorpay) is excluded; it has its own HMAC auth.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  return requireApiKey(req, res, next);
});

// Webhook MUST read the RAW body (Razorpay signs the raw bytes).
app.post('/webhooks/razorpay',
  express.raw({ type: 'application/json', limit: '2mb' }),
  (req, res) => {
    const sig = req.headers['x-razorpay-signature'];
    const result = handleWebhook(req.body, sig);
    return res.status(result.status).json(result);
  });

// JSON body for the rest.
app.use(express.json());

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, razorpayConfigured: config.razorpayConfigured, devSeed: config.devSeed });
});

// Product status — everything the UI derives its connection/version indicators from.
// No hardcoded account ids or version strings on the client; the truth lives here.
const APP_VERSION = '1.0.0';
app.get('/api/status', (_req, res) => {
  const configured = config.razorpayConfigured;
  const liveMode = configured && (process.env.RAZORPAY_SUBMISSION_MODE || 'simulated').toLowerCase() === 'live';
  const mode = !configured ? 'NONE' : liveMode ? 'LIVE' : 'TEST';
  const disputes = listDisputes();
  const demoCount = disputes.filter((d) => d.provider === 'demo').length;
  const evidenceRows = db.prepare('SELECT COUNT(*) c FROM evidence_documents').get().c;
  res.json({
    ok: true,
    version: APP_VERSION,
    razorpay: {
      configured,
      mode, // NONE | TEST | LIVE
      account: configured ? maskKey(process.env.RAZORPAY_KEY_ID) : null,
      submissionMode: liveMode ? 'LIVE' : 'SIMULATED',
    },
    demo: {
      active: demoCount > 0,
      disputeCount: demoCount,
      evidenceCount: evidenceRows,
    },
    aiProvider: llmProviderInfo(),
  });
});

function maskKey(key) {
  if (!key) return null;
  const tail = key.slice(-4);
  return `${key.slice(0, 6)}…${tail}`;
}

// Disputes (matches frontend disputeService.list / getById)
app.get('/api/disputes', (_req, res) => {
  res.json(listDisputes());
});
app.get('/api/disputes/:id', (req, res) => {
  const d = getDisputeById(req.params.id);
  if (!d) return res.status(404).json({ error: 'not_found' });
  // Attach audit trail (frontend auditService.listForDispute)
  d.audit = listAuditForDispute(req.params.id);
  res.json(d);
});
// Command-center overview — all metrics computed from the real backend dataset.
app.get('/api/overview', (_req, res) => {
  res.json(buildOverview());
});
app.get('/api/disputes/:id/audit', (req, res) => {
  res.json(listAuditForDispute(req.params.id));
});
// Cross-dispute activity feed (Checkpoint 5 — global Activity page).
app.get('/api/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const actor = req.query.actor ? String(req.query.actor) : undefined;
  const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
  res.json({ total: auditCount(), events: listAuditAll({ limit, actor, entityType }) });
});
app.get('/api/disputes/:id/audit.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit_${req.params.id}.csv"`);
  res.send(exportAuditCSV(req.params.id));
});
app.get('/api/disputes/:id/audit.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="audit_${req.params.id}.json"`);
  res.send(exportAuditJSON(req.params.id));
});

// DEV ONLY: seed a simulated dispute through the real webhook pipeline.
app.post('/dev/seed-dispute', (_req, res) => {
  const result = seedSimulatedDispute();
  if (!result.ok) return res.status(result.status || 500).json(result);
  res.json(result);
});

// ---- Evidence pipeline (Slice 2) ----
// POST /api/disputes/:id/evidence  (multipart, field "files")
app.post('/api/disputes/:id/evidence', (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error', message: err.message });
    }
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'no_file', message: 'No file provided.' });
    }
    try {
      const created = [];
      for (const f of files) {
        created.push(await createEvidence(req.params.id, f));
      }
      return res.status(201).json(created.length === 1 ? created[0] : created);
    } catch (e) {
      const status = e.status || 500;
      const code = status === 404 ? 'dispute_not_found' : status === 415 ? 'unsupported_type' : status === 413 ? 'file_too_large' : 'upload_failed';
      return res.status(status).json({ error: code, message: e.message });
    }
  });
});
app.get('/api/disputes/:id/evidence', (req, res) => {
  res.json(listForDispute(req.params.id));
});
// Cross-dispute evidence intelligence (Checkpoint 4) — declared BEFORE /:id so
// '/api/evidence/stats' is not swallowed by the ':id' param route.
app.get('/api/evidence', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 500, 1000);
  res.json(listAll(limit));
});
app.get('/api/evidence/stats', (_req, res) => {
  res.json(evidenceStats());
});
app.get('/api/evidence/:id', (req, res) => {
  const ev = getEvidenceById(req.params.id); // detail: includes extractedText + classification
  if (!ev) return res.status(404).json({ error: 'not_found' });
  res.json(ev);
});
// Re-run the Slice 3 classification engine on an existing evidence record.
app.post('/api/evidence/:id/reclassify', async (req, res) => {
  try {
    const ev = await runClassification(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not_found' });
    res.json(ev);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 404 ? 'not_found' : 'classification_failed', message: e.message });
  }
});
// Classification history / provenance for an evidence record.
app.get('/api/evidence/:id/classification', (req, res) => {
  const rows = db.prepare('SELECT * FROM evidence_classifications WHERE evidenceId = ? ORDER BY createdAt DESC').all(req.params.id);
  res.json(rows.map((r) => ({
    id: r.id, evidenceType: r.evidenceType, confidence: r.confidence, method: r.method, model: r.model,
    signals: safeJson(r.signals), sourceSpans: safeJson(r.sourceSpans), sourceText: r.sourceText,
    fallbackReason: r.fallbackReason || undefined, createdAt: new Date(r.createdAt * 1000).toISOString(),
  })));
});

// Slice 4 — Contradiction engine.
app.get('/api/disputes/:id/contradictions', (req, res) => {
  res.json(listContradictions(req.params.id));
});
// Re-run the contradiction detector across the dispute's evidence.
app.post('/api/disputes/:id/contradictions/refresh', (req, res) => {
  try {
    res.json(detectAndStoreContradictions(req.params.id));
  } catch (e) {
    res.status(500).json({ error: 'detection_failed', message: e.message });
  }
});
app.post('/api/contradictions/:id/review', (req, res) => {
  const c = markReviewed(req.params.id, true);
  if (!c) return res.status(404).json({ error: 'not_found' });
  res.json(c);
});

// Slice 5 — Factual timeline extraction.
// GET the grounded timeline for a whole dispute (all its evidence documents).
app.get('/api/disputes/:id/timeline', (req, res) => {
  res.json(listTimelineDispute(req.params.id));
});
// GET the grounded timeline for a single evidence document.
app.get('/api/evidence/:id/timeline', (req, res) => {
  res.json(listTimeline(req.params.id));
});
// POST (re)extract the timeline for an evidence document. Idempotent replacement.
app.post('/api/evidence/:id/timeline', (req, res) => {
  try {
    const result = runTimelineExtraction(req.params.id);
    if (result.status === 'SKIPPED') return res.status(409).json({ error: 'extraction_unavailable', message: result.reason });
    if (result.status === 'FAILED') return res.status(500).json({ error: 'timeline_failed', message: result.reason });
    res.json(result);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 404 ? 'not_found' : 'timeline_failed', message: e.message });
  }
});

// Slice 6 — Evidence Readiness Score (ERS) + gaps.
app.post('/api/disputes/:id/ers/refresh', (req, res) => {
  try {
    res.json(computeAndStoreErs(req.params.id));
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 404 ? 'not_found' : 'ers_failed', message: e.message });
  }
});
app.get('/api/disputes/:id/ers', (req, res) => {
  try {
    res.json(getErs(req.params.id));
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 404 ? 'not_found' : 'ers_failed', message: e.message });
  }
});
app.get('/api/disputes/:id/gaps', (req, res) => {
  res.json(getGaps(req.params.id));
});

// Slice 7 — Grounded dispute response drafting (DRAFT ONLY; never submits).
app.post('/api/disputes/:id/draft', async (req, res) => {
  try {
    const draft = await generateForDispute(req.params.id);
    res.status(201).json(draft);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 404 ? 'not_found' : 'draft_failed', message: e.message });
  }
});
app.get('/api/disputes/:id/draft', (req, res) => {
  const draft = getLatest(req.params.id);
  if (!draft) return res.status(404).json({ error: 'no_draft' });
  res.json(draft);
});
// Human approval of a draft (does NOT submit to Razorpay; submission is Slice 8).
app.post('/api/disputes/:id/draft/approve', (req, res) => {
  try {
    res.json(approveDraft(req.params.id));
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: status === 404 ? 'not_found' : 'approve_failed', message: e.message });
  }
});

// Slice 8 — Human-gated Razorpay contest submission.
// Triggered ONLY by an explicit human action. The backend re-verifies every
// precondition and enforces idempotency. The AI never invokes this.
app.post('/api/disputes/:id/submit', async (req, res) => {
  try {
    const result = await submitDispute(req.params.id, { actor: 'HUMAN' });
    res.status(200).json(result);
  } catch (e) {
    const status = e.code === 'REQUIRES_REVIEW' ? 409 : (e.status || 422);
    res.status(status).json({ error: e.code || 'submission_failed', message: e.message });
  }
});
app.get('/api/disputes/:id/submission', (req, res) => {
  const s = getSubmission(req.params.id);
  if (!s) return res.status(404).json({ error: 'no_submission' });
  res.json(s);
});

// ---- Demo (synthetic evaluation dataset) ----
// STRICTLY a controlled evaluation data source. Demo disputes are stamped
// provider:'demo' and ids use dupu_demo_### — never confused with real Razorpay.
app.post('/api/demo/seed', (req, res) => {
  try {
    const count = Math.min(Number(req.body?.count) || 100, 500);
    const result = SyntheticDisputeProvider.loadDemoDataset(count, { regenerateDrafts: true });
    res.status(201).json({ ...result, note: 'Synthetic evaluation dataset loaded. Not real Razorpay disputes.' });
  } catch (e) {
    res.status(500).json({ error: 'demo_seed_failed', message: e.message });
  }
});

app.delete('/api/demo/seed', (_req, res) => {
  try {
    const cleared = SyntheticDisputeProvider.clearDemoDataset();
    res.json({ cleared });
  } catch (e) {
    res.status(500).json({ error: 'demo_clear_failed', message: e.message });
  }
});

app.get('/api/demo/dataset', (_req, res) => {
  // Returns the raw 100-descriptor dataset (transparency; no secrets).
  try {
    const ds = SyntheticDisputeProvider.generateSyntheticDisputes(100);
    res.json({ synthetic: true, count: ds.length, disputes: ds.map((d) => ({
      id: d.id, provider: d.provider, scenarioKey: d.scenarioKey, scenarioLabel: d.scenarioLabel,
      merchant: d.merchant, customer: d.customer, reasonCode: d.reasonCode, amountInr: d.amountInr,
      evidenceTypes: d.evidence.map((e) => e.type), groundTruth: d.groundTruth,
    })) });
  } catch (e) {
    res.status(500).json({ error: 'dataset_failed', message: e.message });
  }
});

app.get('/api/evaluation', (_req, res) => {
  try {
    const result = evaluatePopulation();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'evaluation_failed', message: e.message });
  }
});

app.get('/api/evaluation/report', (_req, res) => {
  try {
    const result = evaluatePopulation();
    res.type('text/markdown').send(buildEvaluationReport(result));
  } catch (e) {
    res.status(500).json({ error: 'report_failed', message: e.message });
  }
});

// ---- AI Observability (Checkpoint 3) ----
// Honest provider/model identification for the AI panel.
app.get('/api/ai/provider', (_req, res) => {
  res.json(aiProviderStatus());
});

// Per-dispute AI-analysis events (what actually ran for this dispute).
app.get('/api/disputes/:id/ai-events', (req, res) => {
  res.json(listAiEventsForDispute(req.params.id));
});

// Cross-dispute AI-analysis feed (most recent first).
app.get('/api/ai-events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  res.json(listAiEventsAll(limit));
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// Global error handler (never leak secrets/stack to client).
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'internal_error' });
});

// Start the server unless imported by a test harness (which mounts `app` itself).
// Compare resolved paths so Windows drive-letter casing (D:\ vs d:\) doesn't
// defeat the guard.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const isMain = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || '');
if (isMain) {
  app.listen(config.port, () => {
    console.log(`DisputeIQ backend listening on ${config.backendBaseUrl}`);
    console.log(`Razorpay configured: ${config.razorpayConfigured} | devSeed: ${config.devSeed}`);
    console.log(`Auth: ${config.authRequired ? 'ENFORCED (DISPUTEIQ_API_KEY set)' : 'dev mode (no key set)'}`);
    console.log(`CORS: ${config.allowedOrigins.length ? config.allowedOrigins.join(', ') : 'dev mode (reflect Origin)'}`);
  });
}

export { app };
