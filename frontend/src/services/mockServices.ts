import { AuditEvent, Contradiction, Dispute, EvidenceDocument, GapItem, ErsBreakdown } from '../types';
import {
  DEMO_DISPUTES, DEMO_DOCS, DEMO_GAPS, DEMO_ERS, DEMO_AUDIT, DEMO_CONTRADICTION, OCR_ISSUE_DOC, OVERVIEW_STATS,
} from '../data/mockData';

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

// Simulate a contest submission to Razorpay (mock). Returns API-style response.
export interface SubmitResult { status: number; dispute_id: string; contest_submitted_at: string; evidence_count: number; }

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
    await delay(80);
    return OVERVIEW_STATS;
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
};

// Map backend EvidenceDocument -> frontend EvidenceDocument shape.
function toUiEvidence(e: any): EvidenceDocument {
  return {
    id: e.id,
    fileName: e.fileName,
    size: e.size,
    badgeLabel: e.extractionMethod || e.processingStatus,
    ingestionStatus: e.processingStatus,
    statusLabel: e.statusLabel,
    extractionMethod: e.extractionMethod?.toLowerCase().includes('pdf') ? 'pdf_text' : undefined,
    evidenceType: undefined, // classification is Slice 3
    confidence: undefined,   // scoring is Slice 3
    contentPreview: e.extractedPreview ? e.extractedPreview.split('\n').slice(0, 3) : undefined,
    reviewed: false,
  };
}

export const contradictionService = {
  async listForDispute(id: string): Promise<Contradiction[]> {
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.contradictions ?? [DEMO_CONTRADICTION];
  },
};

export const gapService = {
  async listForDispute(id: string): Promise<GapItem[]> {
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.gaps ?? DEMO_GAPS;
  },
};

export const ersService = {
  async getForDispute(id: string): Promise<ErsBreakdown> {
    await delay(80);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.ersBreakdown ?? DEMO_ERS;
  },
};

export const auditService = {
  async listForDispute(id: string): Promise<AuditEvent[]> {
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.audit ?? DEMO_AUDIT;
  },
  async exportCSV(id: string): Promise<string> {
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    const rows = (d?.audit ?? DEMO_AUDIT).map((e) =>
      [e.timestamp, e.eventType, e.actor, e.statusText].join(','));
    return ['timestamp,event_type,actor,status', ...rows].join('\n');
  },
  async exportJSON(id: string): Promise<string> {
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return JSON.stringify(d?.audit ?? DEMO_AUDIT, null, 2);
  },
};

export const submissionService = {
  // Mock contest submission (DEMO MODE — SUBMISSION SIMULATED)
  async submit(id: string): Promise<SubmitResult> {
    await delay(1500);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    const count = d?.documents?.length ?? 3;
    return {
      status: 200,
      dispute_id: id,
      contest_submitted_at: '2026-08-22T13:12:00Z',
      evidence_count: count,
    };
  },
};

export { OCR_ISSUE_DOC };
