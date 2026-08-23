// Shared LLM provider abstraction (Slice 7). Used by the response-draft generator.
// The system is fully functional without an API key: callers fall back to a
// deterministic HEURISTIC path when llmConfigured is false or the call fails.
// No credentials are logged. The key is read from config (env) only at call time.
import { config } from '../config.js';

export function llmConfigured() {
  return config.llmConfigured;
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
  const baseUrl = config.llm.baseUrl || 'https://api.openai.com/v1';
  const model = config.llm.model || 'gpt-4o-mini';
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
