// Express server. Mounts the internal API the frontend consumes, the Razorpay
// webhook endpoint (raw body required for HMAC), and a dev seed endpoint.
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { handleWebhook } from './services/razorpay/webhooks.js';
import { listDisputes, getDisputeById } from './repositories/disputes.js';
import { listAuditForDispute, exportAuditCSV, exportAuditJSON } from './services/audit.js';
import { seedSimulatedDispute } from './dev/seed.js';
import { createEvidence, listForDispute, getEvidenceMeta } from './repositories/evidence.js';

const upload = multer({
  storage: multer.memoryStorage(), // we persist via StorageService, not multer disk
  limits: { fileSize: Number(process.env.EVIDENCE_MAX_BYTES || 15 * 1024 * 1024), files: 10 },
});

const app = express();

// CORS (dev): allow the Vite frontend (different origin) to call the API.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Razorpay-Signature');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
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
app.get('/api/disputes/:id/audit', (req, res) => {
  res.json(listAuditForDispute(req.params.id));
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
app.get('/api/evidence/:id', (req, res) => {
  const ev = getEvidenceMeta(req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found' });
  res.json(ev);
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// Global error handler (never leak secrets/stack to client).
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`DisputeIQ backend listening on ${config.backendBaseUrl}`);
  console.log(`Razorpay configured: ${config.razorpayConfigured} | devSeed: ${config.devSeed}`);
});
