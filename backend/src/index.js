// Express server. Mounts the internal API the frontend consumes, the Razorpay
// webhook endpoint (raw body required for HMAC), and a dev seed endpoint.
import express from 'express';
import { config } from './config.js';
import { handleWebhook } from './services/razorpay/webhooks.js';
import { listDisputes, getDisputeById } from './repositories/disputes.js';
import { listAuditForDispute, exportAuditCSV, exportAuditJSON } from './services/audit.js';
import { seedSimulatedDispute } from './dev/seed.js';

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
