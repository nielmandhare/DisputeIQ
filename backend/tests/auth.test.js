// M2 — API authentication + CORS tests. Run via bash test.sh (isolated DB).
// Spins up the real Express app on a random port and exercises auth/CORS at the
// HTTP layer. Auth is OFF by default (no DISPUTEIQ_API_KEY) and is toggled on by
// setting config.apiKey in the test. CORS is controlled by DISPUTEIQ_ALLOWED_ORIGINS.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Isolate DB before importing the app (dynamic import runs after env is set).
process.env.DATABASE_PATH = './.test.db';
const ALLOWED = 'http://allowed.test';
const DENIED = 'http://evil.test';
process.env.DISPUTEIQ_ALLOWED_ORIGINS = ALLOWED;

const { app } = await import('../src/index.js');
const { config } = await import('../src/config.js');

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      base = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) server.close();
  config.apiKey = ''; // restore dev mode
});

function setupAuth(on) {
  config.apiKey = on ? 'test_secret' : '';
}

async function req(method, path, { origin, key, body } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (key) headers.Authorization = `Bearer ${key}`;
  headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const acao = res.headers.get('access-control-allow-origin');
  return { status: res.status, acao };
}

// --- AUTH DISABLED (dev/demo mode) ---
test('dev mode: mutating route works without a key', async () => {
  setupAuth(false);
  const r = await req('POST', '/api/demo/seed', { body: { count: 2 } });
  assert.ok(r.status === 200 || r.status === 201, `expected 2xx, got ${r.status}`);
});

// --- AUTH ENABLED ---
test('auth enabled: missing API key -> 401 on mutating route', async () => {
  setupAuth(true);
  const r = await req('POST', '/api/demo/seed', { body: { count: 2 } });
  assert.equal(r.status, 401, 'missing key must be rejected');
});

test('auth enabled: invalid API key -> 401', async () => {
  setupAuth(true);
  const r = await req('POST', '/api/demo/seed', { key: 'wrong', body: { count: 2 } });
  assert.equal(r.status, 401, 'wrong key must be rejected');
});

test('auth enabled: valid API key -> proceeds', async () => {
  setupAuth(true);
  const r = await req('POST', '/api/demo/seed', { key: 'test_secret', body: { count: 2 } });
  assert.ok(r.status === 200 || r.status === 201, `valid key must proceed, got ${r.status}`);
  setupAuth(false);
});

test('auth enabled: GET route stays public (no key needed)', async () => {
  setupAuth(true);
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200, 'GET health must remain public');
  setupAuth(false);
});

test('auth enabled: webhook route is NOT gated by the API key', async () => {
  // The Razorpay webhook has its own HMAC auth; it must not require DISPUTEIQ_API_KEY.
  setupAuth(true);
  const r = await req('POST', '/webhooks/razorpay', { body: {} });
  // 401 here would mean the API-key gate wrongly applied. A 400 (bad signature) is expected.
  assert.notEqual(r.status, 401, 'webhook must not require the API key');
  setupAuth(false);
});

// --- CORS ---
test('CORS: allowed origin receives Access-Control-Allow-Origin', async () => {
  const r = await req('GET', '/api/health', { origin: ALLOWED });
  assert.equal(r.acao, ALLOWED, 'allowed origin must be echoed');
});

test('CORS: denied origin receives NO wildcard and is rejected', async () => {
  const r = await req('GET', '/api/health', { origin: DENIED });
  assert.notEqual(r.acao, '*', 'wildcard * must never be used when origins are configured');
  assert.notEqual(r.acao, DENIED, 'denied origin must not be allowed');
});

test('CORS: OPTIONS preflight for allowed origin', async () => {
  const res = await fetch(`${base}/api/health`, { method: 'OPTIONS', headers: { Origin: ALLOWED } });
  assert.equal(res.status, 204, 'preflight must return 204');
  assert.equal(res.headers.get('access-control-allow-origin'), ALLOWED);
});

test('CORS: no wildcard when origins configured (security audit)', async () => {
  const res = await fetch(`${base}/api/health`, { headers: { Origin: DENIED } });
  const acao = res.headers.get('access-control-allow-origin');
  assert.notEqual(acao, '*', 'security audit: wildcard CORS must not appear');
});

// --- SECRET HYGIENE ---
test('auth failure never leaks the secret in the response body', async () => {
  setupAuth(true);
  const res = await fetch(`${base}/api/demo/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 2 }),
  });
  const text = await res.text();
  assert.equal(res.status, 401);
  assert.ok(!text.includes('test_secret'), 'response must not contain the API key');
  setupAuth(false);
});
