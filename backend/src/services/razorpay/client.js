// Dedicated Razorpay client. Encapsulates auth, timeout, retry, error normalization.
// All Razorpay API calls in the app go through this module — never scattered.
//
// Uses ONLY documented Razorpay capabilities:
//   GET /v1/disputes            -> fetch all disputes
//   GET /v1/disputes/:id        -> fetch one dispute
// Auth: HTTP Basic (key_id:key_secret). See https://razorpay.com/docs/api/disputes/
import { config } from '../../config.js';

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

class RazorpayError extends Error {
  constructor(message, { status, code, raw } = {}) {
    super(message);
    this.name = 'RazorpayError';
    this.status = status ?? null;
    this.code = code ?? null;
    this.raw = raw ?? null;
  }
}

function authHeader() {
  const token = Buffer.from(`${process.env.RAZORPAY_KEY_ID || config.razorpay.keyId}:${process.env.RAZORPAY_KEY_SECRET || config.razorpay.keySecret}`).toString('base64');
  return `Basic ${token}`;
}

async function request(path, { method = 'GET', body, headers = {}, retries = MAX_RETRIES } = {}) {
  // Live credentials: read from process.env (supports runtime env toggling).
  const configured = Boolean((process.env.RAZORPAY_KEY_ID || config.razorpay.keyId) && (process.env.RAZORPAY_KEY_SECRET || config.razorpay.keySecret));
  if (!configured) {
    throw new RazorpayError('Razorpay credentials not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).', { code: 'NOT_CONFIGURED' });
  }
  const url = `${config.razorpay.apiBase}${path}`;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json', ...headers },
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      if (!res.ok) {
        // 4xx = caller error, do not retry. 5xx/timeout = retry.
        if (res.status >= 400 && res.status < 500) {
          throw new RazorpayError(`Razorpay ${method} ${path} failed (${res.status})`, { status: res.status, code: parsed?.error?.code, raw: parsed });
        }
        throw new RazorpayError(`Razorpay ${method} ${path} returned ${res.status}`, { status: res.status, raw: parsed });
      }
      return parsed;
    } catch (err) {
      const transient = err.name === 'AbortError' || err.message?.includes('fetch failed') || (err.status && err.status >= 500);
      if (transient && attempt <= retries) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      if (err instanceof RazorpayError) throw err;
      throw new RazorpayError(`Razorpay request error: ${err.message}`, { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }
  }
}

export const razorpay = {
  /** Fetch all disputes. Returns the raw Razorpay envelope { items: [...] }. */
  async listDisputes() {
    return request('/disputes');
  },
  /** Fetch a single dispute by Razorpay dispute id (dupu_...). */
  async getDispute(id) {
    return request(`/disputes/${id}`);
  },
  /**
   * Upload an evidence document for a dispute (LIVE). Used during contest submission.
   * NOTE: payload is minimal/documented-style and UNVERIFIED pending real test credentials.
   */
  async uploadDisputeDocument(razorpayDisputeId, payload) {
    return request(`/disputes/${razorpayDisputeId}/documents`, { method: 'POST', body: payload });
  },
  /**
   * Contest a dispute (LIVE). Submit the merchant response.
   * NOTE: payload is minimal/documented-style and UNVERIFIED pending real test credentials.
   */
  async contestDispute(razorpayDisputeId, payload) {
    return request(`/disputes/${razorpayDisputeId}/contest`, { method: 'POST', body: payload });
  },
};

export { RazorpayError };
