import { AuditEvent, Contradiction, Dispute, EvidenceDocument, GapItem, ErsBreakdown, TimelineEvent, ResponseDraft, SubmitResult } from '../types';
import {
  DEMO_DISPUTES, DEMO_DOCS, DEMO_GAPS, DEMO_ERS, DEMO_AUDIT, DEMO_CONTRADICTION, OCR_ISSUE_DOC, OVERVIEW_STATS,
} from '../data/mockData';

// Mock fallback draft (Slice 7) — used only if the backend is unreachable.
const MOCK_DRAFT: Partial<ResponseDraft> = {
  draftVersion: 1,
  generationMethod: 'HEURISTIC',
  provider: 'heuristic',
  status: 'DRAFT_READY',
  fallbackUsed: false,
  draft: {
    summary: { text: 'This dispute relates to a chargeback on a delivered order. Evidence has been analyzed.', sources: [] },
    merchantPosition: { text: 'The available evidence indicates the order was delivered to the customer.', sources: [] },
    chronology: [],
    supportingEvidence: [],
    contradictions: [],
    evidenceGaps: [],
    requestedResolution: { text: 'The merchant requests review of the attached delivery records.', sources: [] },
  },
};

// ============================================================================
// SERVICE ABSTRACTION LAYER
// The UI imports ONLY from these services. Today they return mock data.
// Later, swap the function bodies for real fetch() calls to the Hermes backend
// (Razorpay Disputes API, Documents API, webhooks, AI) — no UI changes needed.
// ============================================================================

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Real backend integration (Slice 1) -------------------------------------
// The frontend calls the Hermes backend; if it is unreachable or returns
// nothing, we transparently fall back to mock data so the UI never breaks.
const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:4000';

async function apiGet<T>(path: string, timeoutMs = 2500): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // network/timeout -> fallback to mock
  } finally {
    clearTimeout(t);
  }
}

async function apiPost<T>(path: string, body?: unknown, timeoutMs = 15000): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      let message = '';
      try { message = (await res.json()).message || ''; } catch { /* ignore */ }
      // Surface backend rejection (e.g. not approved / missing evidence) to the caller.
      const err = new Error(message || `Submission rejected (${res.status})`) as Error & { code?: string };
      err.code = `HTTP_${res.status}`;
      throw err;
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof TypeError || (e as Error).name === 'AbortError') return null; // offline -> mock fallback
    throw e; // backend rejection propagates
  } finally {
    clearTimeout(t);
  }
}

// Current submission mode from backend (SIMULATED unless real creds + live flag).
export interface SubmissionMode { razorpayConfigured: boolean; submissionMode: 'SIMULATED' | 'LIVE'; }

export const disputeService = {
  async list(): Promise<Dispute[]> {
    const live = await apiGet<Dispute[]>('/api/disputes');
    if (live && live.length) return live;
    await delay(120);
    return DEMO_DISPUTES;
  },
  async getById(id: string): Promise<Dispute | undefined> {
    const live = await apiGet<Dispute>(`/api/disputes/${id}`);
    if (live) {
      // Backend provides core fields + audit; attach the demo sub-panels
      // (documents / contradictions / gaps) so the detail page renders fully.
      const demo = DEMO_DISPUTES.find((d) => d.id === id);
      return {
        ...live,
        documents: demo?.documents ?? [],
        contradictions: demo?.contradictions ?? [],
        gaps: demo?.gaps ?? [],
        ersBreakdown: demo?.ersBreakdown,
        audit: live.audit ?? demo?.audit ?? [],
      };
    }
    await delay(120);
    return DEMO_DISPUTES.find((d) => d.id === id);
  },
  async getOverviewStats() {
    const live = await apiGet<any>('/api/overview');
    if (live) return live; // real backend-computed command-center metrics
    await delay(80);
    return OVERVIEW_STATS; // mock fallback only if backend is down
  },
  // Simulated webhook trigger (DEMO MODE: no real webhook received)
  async simulateWebhook(): Promise<{ ok: true }> {
    await delay(400);
    return { ok: true };
  },
};

export const evidenceService = {
  async listForDispute(id: string): Promise<EvidenceDocument[]> {
    const live = await apiGet<EvidenceDocument[]>(`/api/disputes/${id}/evidence`);
    if (live) return live.map(toUiEvidence);
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.documents ?? DEMO_DOCS;
  },
  // Real upload: multipart POST to backend. Falls back to mock if backend down.
  async upload(id: string, files: File[]): Promise<EvidenceDocument[]> {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    try {
      const res = await fetch(`${API_BASE}/api/disputes/${id}/evidence`, { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [data];
        return arr.map(toUiEvidence);
      }
    } catch { /* fall through to mock */ }
    await delay(500);
    return files.map((f, i) => ({
      id: `up_${Date.now()}_${i}`,
      fileName: f.name,
      size: `${(f.size / 1024).toFixed(0)} KB`,
      badgeLabel: 'UPLOADED',
      ingestionStatus: 'PROCESSING' as const,
      statusLabel: 'PROCESSING',
    }));
  },
  // Slice 3: re-run classification on an existing evidence record (backend).
  async reclassify(evId: string): Promise<EvidenceDocument | null> {
    try {
      const res = await fetch(`${API_BASE}/api/evidence/${evId}/reclassify`, { method: 'POST' });
      if (res.ok) return toUiEvidence(await res.json());
    } catch { /* ignore */ }
    return null;
  },
  // Checkpoint 4 — cross-dispute evidence intelligence.
  async listAll(limit = 500): Promise<EvidenceDocument[]> {
    const live = await apiGet<EvidenceDocument[]>(`/api/evidence?limit=${limit}`);
    if (live) return live.map(toUiEvidence);
    return [];
  },
  async stats(): Promise<{
    total: number; extracted: number; ocrRequired: number; failed: number;
    classified: number; llmClassified: number; heuristicClassified: number; contradictions: number;
  } | null> {
    return apiGet('/api/evidence/stats');
  },
};

// Map backend EvidenceDocument -> frontend EvidenceDocument shape.
function toUiEvidence(e: any): EvidenceDocument {
  return {
    id: e.id,
    disputeId: e.disputeId,
    fileName: e.fileName,
    size: e.size,
    badgeLabel: e.evidenceType || e.extractionMethod || e.processingStatus,
    ingestionStatus: e.processingStatus,
    statusLabel: e.statusLabel,
    extractionMethod: e.extractionMethod?.toLowerCase().includes('pdf') ? 'pdf_text' : undefined,
    evidenceType: e.evidenceType,                       // Slice 3 classification
    confidence: e.confidence != null ? Number(e.confidence) : undefined,
    classificationSource: e.classificationSource,
    contentPreview: e.extractedPreview ? e.extractedPreview.split('\n').slice(0, 3) : undefined,
    reviewed: false,
    mimeType: e.mimeType,
    updatedAt: e.updatedAt,
  };
}

export const contradictionService = {
  async listForDispute(id: string): Promise<Contradiction[]> {
    const live = await apiGet<Contradiction[]>(`/api/disputes/${id}/contradictions`);
    if (live) return live;
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.contradictions ?? [DEMO_CONTRADICTION];
  },
  async refresh(id: string): Promise<Contradiction[]> {
    try {
      const res = await fetch(`${API_BASE}/api/disputes/${id}/contradictions/refresh`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch { /* ignore */ }
    return this.listForDispute(id);
  },
  async review(conId: string): Promise<Contradiction | null> {
    try {
      const res = await fetch(`${API_BASE}/api/contradictions/${conId}/review`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch { /* ignore */ }
    return null;
  },
};

// Slice 5 — grounded factual timeline. Backend is source of truth; mock fallback.
export const timelineService = {
  async listForDispute(id: string): Promise<TimelineEvent[]> {
    const live = await apiGet<TimelineEvent[]>(`/api/disputes/${id}/timeline`);
    if (live) return live;
    await delay(100);
    return [];
  },
  async listForEvidence(evId: string): Promise<TimelineEvent[]> {
    const live = await apiGet<TimelineEvent[]>(`/api/evidence/${evId}/timeline`);
    if (live) return live;
    await delay(100);
    return [];
  },
};

export const gapService = {
  async listForDispute(id: string): Promise<GapItem[]> {
    const live = await apiGet<GapItem[]>(`/api/disputes/${id}/gaps`);
    if (live) return live;
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.gaps ?? DEMO_GAPS;
  },
};

export const ersService = {
  async getForDispute(id: string): Promise<ErsBreakdown> {
    const live = await apiGet<ErsBreakdown>(`/api/disputes/${id}/ers`);
    if (live) return live;
    await delay(80);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.ersBreakdown ?? DEMO_ERS;
  },
};

// Slice 7 — grounded response drafting (DRAFT ONLY; never submits).
export const responseDraftService = {
  async generate(id: string): Promise<ResponseDraft> {
    const live = await apiPost<ResponseDraft>(`/api/disputes/${id}/draft`, {});
    if (live) return live;
    await delay(150);
    return MOCK_DRAFT as ResponseDraft;
  },
  async getLatest(id: string): Promise<ResponseDraft | null> {
    const live = await apiGet<ResponseDraft>(`/api/disputes/${id}/draft`);
    if (live) return live;
    return null;
  },
  async approve(id: string): Promise<ResponseDraft> {
    const live = await apiPost<ResponseDraft>(`/api/disputes/${id}/draft/approve`, {});
    if (live) return live;
    await delay(120);
    return { ...(MOCK_DRAFT as ResponseDraft), status: 'DRAFT_APPROVED' };
  },
};

export const auditService = {
  async listForDispute(id: string): Promise<AuditEvent[]> {
    const live = await apiGet<AuditEvent[]>(`/api/disputes/${id}/audit`);
    if (live) return live; // real backend audit trail
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.audit ?? DEMO_AUDIT; // mock fallback only if backend down
  },
  async listAll(limit = 200): Promise<{ total: number; events: AuditEvent[] } | null> {
    return apiGet<{ total: number; events: AuditEvent[] }>(`/api/audit?limit=${limit}`);
  },
  async exportCSV(id: string): Promise<string> {
    const live = await apiGet<string>(`/api/disputes/${id}/audit.csv`);
    if (live) return live;
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    const rows = (d?.audit ?? DEMO_AUDIT).map((e) =>
      [e.timestamp, e.eventType, e.actor, e.statusText].join(','));
    return ['timestamp,event_type,actor,status', ...rows].join('\n');
  },
  async exportJSON(id: string): Promise<string> {
    const live = await apiGet<AuditEvent[]>(`/api/disputes/${id}/audit`);
    if (live) return JSON.stringify(live, null, 2);
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return JSON.stringify(d?.audit ?? DEMO_AUDIT, null, 2);
  },
};

export const submissionService = {
  // Real human-gated submission (backend enforces all safety conditions + idempotency).
  async submit(id: string): Promise<SubmitResult> {
    const live = await apiPost<SubmitResult>(`/api/disputes/${id}/submit`);
    if (live) return live;
    // Mock fallback (offline): clearly mark as simulated.
    await delay(1500);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    const count = d?.documents?.length ?? 3;
    return {
      id: `sub_${Math.random().toString(36).slice(2, 10)}`,
      disputeId: id,
      draftId: 'rd_mock',
      draftVersion: 1,
      mode: 'SIMULATED',
      status: 'SUBMITTED',
      razorpayStatus: 'SIMULATED',
      evidenceUploaded: Array.from({ length: count }, (_, i) => ({ localEvidenceId: `ev_${i}`, razorpayDocumentId: `sim_ev_${i}` })),
      startedAt: Math.floor(Date.now() / 1000),
      completedAt: Math.floor(Date.now() / 1000),
      metadata: { simulated: true },
    };
  },
  async getForDispute(id: string): Promise<SubmitResult | null> {
    return apiGet<SubmitResult>(`/api/disputes/${id}/submission`);
  },
};

// Product status — derived entirely from the backend (no client-side fabrication
// of connection state, account ids, or version strings).
export const statusService = {
  async get(): Promise<{
    ok: boolean;
    version: string;
    razorpay: { configured: boolean; mode: 'NONE' | 'TEST' | 'LIVE'; account: string | null; submissionMode: string };
    demo: { active: boolean; disputeCount: number; evidenceCount: number };
    aiProvider?: { provider: string; model: string };
  } | null> {
    return apiGet<any>('/api/status');
  },
};

// Synthetic evaluation environment (Checkpoint 2). Calls the REAL backend
// SyntheticDisputeProvider — no mock fallback, because the whole point is to
// visibly load real synthetic records through the pipeline.
export interface DemoLoadResult {
  provider: 'demo';
  loaded: number;
  evidenceCount: number;
  ocrRequired: number;
  scenarioDistribution: Record<string, number>;
  datasetSeed: number;
  note?: string;
}

export const demoService = {
  // Load the synthetic dispute environment through the real backend pipeline.
  async load(count = 100): Promise<DemoLoadResult> {
    const res = await fetch(`${API_BASE}/api/demo/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    if (!res.ok) throw new Error(`Synthetic load failed (${res.status})`);
    return (await res.json()) as DemoLoadResult;
  },
  // Clear the synthetic disputes from the DB.
  async clear(): Promise<{ cleared: number }> {
    const res = await fetch(`${API_BASE}/api/demo/seed`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Synthetic clear failed (${res.status})`);
    return (await res.json()) as { cleared: number };
  },
  // Scenario descriptors (transparency; no secrets).
  async dataset() {
    return apiGet<{ synthetic: true; count: number; disputes: Array<{ id: string; scenarioKey: string; scenarioLabel: string; reasonCode: string; amountInr: number; groundTruth: unknown }> }>('/api/demo/dataset');
  },
};

// AI Observability (Checkpoint 3) — real backend AI-analysis events + provider.
export interface AiEvent {
  id: string;
  disputeId: string | null;
  evidenceId: string | null;
  operation: 'EVIDENCE_CLASSIFICATION' | 'TIMELINE_EXTRACTION' | 'RESPONSE_DRAFTING';
  provider: string;
  model: string;
  method: 'LLM' | 'HEURISTIC';
  status: 'COMPLETED' | 'FAILED';
  inputCount: number | null;
  outputCount: number | null;
  confidence: number | null;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export const aiService = {
  async provider() {
    return apiGet<{ provider: string; model: string; modelId: string; configured: boolean; baseUrl: string; llmActive: boolean }>('/api/ai/provider');
  },
  async eventsForDispute(id: string) {
    return apiGet<AiEvent[]>(`/api/disputes/${id}/ai-events`);
  },
  async events(limit = 200) {
    return apiGet<AiEvent[]>(`/api/ai-events?limit=${limit}`);
  },
};

export { OCR_ISSUE_DOC };
