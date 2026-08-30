// Minimal .env loader (no dotenv dependency). Reads KEY=VALUE lines, never
// overwrites real process.env, never logs values.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export const config = {
  port: Number(process.env.PORT || 4000),
  backendBaseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:4000',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    apiBase: 'https://api.razorpay.com/v1',
  },
  databasePath: process.env.DATABASE_PATH || './disputeiq.db',
  storageDir: process.env.STORAGE_DIR || './storage',
  // --- Production hardening (M2) ---
  // Server-side API key. When SET, mutating/sensitive routes require
  // `Authorization: Bearer <key>` (or `x-api-key` header). When UNSET, the
  // backend runs in explicit dev/demo mode with auth disabled (the local
  // hackathon demo needs no key). NEVER put the real key in the frontend.
  apiKey: process.env.DISPUTEIQ_API_KEY || '',
  // CORS allowlist. When SET (comma-separated origins), only those origins are
  // permitted and the wildcard "*" is never used. When UNSET, dev mode reflects
  // the request Origin (still not a silent "*" in production config).
  get allowedOrigins() {
    return (process.env.DISPUTEIQ_ALLOWED_ORIGINS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
  },
  get authRequired() {
    return Boolean(this.apiKey);
  },
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.LLM_MODEL || 'openai/gpt-4o-mini',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 60000),
  },
  devSeed: (process.env.DISPUTEIQ_DEV_SEED || 'true') === 'true',
  // A Razorpay integration is "live" only when BOTH a key id and secret exist.
  get razorpayConfigured() {
    return Boolean(this.razorpay.keyId && this.razorpay.keySecret);
  },
  get llmConfigured() {
    return Boolean(this.llm.apiKey);
  },
};
