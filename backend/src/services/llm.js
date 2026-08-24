// Shared LLM provider abstraction (Slice 7+). Used by the response-draft
// generator, classifier, and timeline extractor.
//
// The system is fully functional WITHOUT an API key: callers fall back to a
// deterministic HEURISTIC path when llmConfigured is false or the call fails.
//
// PROVIDER-AGNOSTIC: it speaks the OpenAI-compatible /chat/completions
// contract, so any OpenAI-compatible endpoint works (OpenAI, OpenRouter,
// local llama.cpp/vLLM, etc.). Switch providers by setting env vars only:
//   LLM_API_KEY, LLM_BASE_URL, LLM_MODEL  (see backend/.env.example)
// No credentials are logged. The key is read from config (env) at call time.
import { config } from '../config.js';

export function llmConfigured() {
  return config.llmConfigured;
}

export function llmProviderInfo() {
  const base = config.llm.baseUrl || 'https://openrouter.ai/api/v1';
  const isOpenRouter = base.includes('openrouter.ai');
  return {
    baseUrl: base,
    model: config.llm.model || 'openai/gpt-4o-mini',
    provider: isOpenRouter ? 'openrouter' : 'openai-compatible',
    configured: config.llmConfigured,
  };
}

/**
 * Verify the provider configuration WITHOUT making a paid request.
 * Returns { ok, provider, baseUrl, model, reason }.
 */
export function verifyLlmConfig() {
  const info = llmProviderInfo();
  if (!info.configured) {
    return { ok: false, ...info, reason: 'LLM_API_KEY is not set (heuristic mode will be used).' };
  }
  if (!/^https?:\/\//.test(info.baseUrl)) {
    return { ok: false, ...info, reason: 'LLM_BASE_URL is not a valid http(s) URL.' };
  }
  if (!info.model) {
    return { ok: false, ...info, reason: 'LLM_MODEL is not set.' };
  }
  return { ok: true, ...info, reason: 'Provider configuration looks valid.' };
}

function authHeaders(apiKey) {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  // OpenRouter expects identifying headers; they are harmless to other
  // OpenAI-compatible endpoints and simply ignored if unsupported.
  if ((config.llm.baseUrl || '').includes('openrouter.ai')) {
    h['HTTP-Referer'] = process.env.LLM_REFERER || 'https://disputeiq.local';
    h['X-Title'] = process.env.LLM_TITLE || 'DisputeIQ';
  }
  return h;
}

/** Make ONE minimal (cheap) test request to confirm the endpoint + key work. */
export async function testLlmRequest() {
  const v = verifyLlmConfig();
  if (!v.ok) return { ok: false, ...v };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.llm.timeoutMs || 15000);
  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: authHeaders(config.llm.apiKey),
      body: JSON.stringify({
        model: config.llm.model || 'openai/gpt-4o-mini',
        temperature: 0,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      }),
    });
    if (!res.ok) return { ok: false, status: res.status, ...v, reason: `Provider returned HTTP ${res.status}` };
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return { ok: true, status: res.status, sample: content.slice(0, 40), ...v };
  } catch (e) {
    return { ok: false, status: 0, ...v, reason: `Request failed: ${e.message}` };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Call the configured chat-completions LLM with a system instruction + user content.
 * @param {string} systemInstruction - system prompt (must enforce data-handling rules).
 * @param {string} userContent - the (already sanitized) user payload.
 * @param {object} [opts] - { responseFormatJson, temperature, maxTokens }
 * @returns {Promise<{ raw: any, model: string }>}
 */
export async function callLLM(systemInstruction, userContent, opts = {}) {
  const apiKey = config.llm.apiKey;
  const baseUrl = config.llm.baseUrl || 'https://openrouter.ai/api/v1';
  const model = config.llm.model || 'openai/gpt-4o-mini';
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.llm.timeoutMs || 15000);
  try {
    const body = {
      model,
      temperature: opts.temperature ?? 0,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent.slice(0, 16000) },
      ],
    };
    if (opts.responseFormatJson !== false) body.response_format = { type: 'json_object' };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM empty content');
    const parsed = JSON.parse(content);
    return { raw: parsed, model };
  } finally {
    clearTimeout(t);
  }
}
