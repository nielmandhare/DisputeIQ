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
  llmApiKey: process.env.LLM_API_KEY || '',
  devSeed: (process.env.DISPUTEIQ_DEV_SEED || 'true') === 'true',
  // A Razorpay integration is "live" only when BOTH a key id and secret exist.
  get razorpayConfigured() {
    return Boolean(this.razorpay.keyId && this.razorpay.keySecret);
  },
};
