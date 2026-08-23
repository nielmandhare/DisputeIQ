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

// Simulate a contest submission to Razorpay (mock). Returns API-style response.
export interface SubmitResult { status: number; dispute_id: string; contest_submitted_at: string; evidence_count: number; }

export const disputeService = {
  async list(): Promise<Dispute[]> {
    await delay(120);
    return DEMO_DISPUTES;
  },
  async getById(id: string): Promise<Dispute | undefined> {
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
    await delay(100);
    const d = DEMO_DISPUTES.find((x) => x.id === id);
    return d?.documents ?? DEMO_DOCS;
  },
  // Mock file upload: stores filename in local state, no real upload.
  async upload(_id: string, files: File[]): Promise<EvidenceDocument[]> {
    await delay(500);
    const added: EvidenceDocument[] = files.map((f, i) => ({
      id: `up_${Date.now()}_${i}`,
      fileName: f.name,
      size: `${(f.size / 1024).toFixed(0)} KB`,
      badgeLabel: 'UPLOADED',
      ingestionStatus: 'PROCESSING',
      statusLabel: 'PROCESSING',
    }));
    return added;
  },
};

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
