// ===== DisputeIQ domain types (frontend mock layer) =====

export type ReasonCode =
  | 'non_receipt_of_goods'
  | 'non_receipt_of_services'
  | 'credit_not_processed'
  | 'cancelled_recurring_payment'
  | 'product_not_as_described'
  | 'duplicate_transaction'
  | 'general';

export type EvidenceType =
  | 'shipping_proof'
  | 'delivery_confirmation'
  | 'customer_communication'
  | 'billing_proof'
  | 'proof_of_service'
  | 'return_document'
  | 'explanation_letter'
  | 'invoice'
  | 'receipt'
  | 'courier_record'
  | 'other';

export type DisputeStatus =
  | 'RECEIVED'
  | 'CONTEXT_LOADED'
  | 'AWAITING_EVIDENCE'
  | 'PROCESSING'
  | 'ANALYSIS_COMPLETE'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'UPLOADING_DOCUMENTS'
  | 'SUBMITTED'
  | 'SUBMISSION_FAILED'
  | 'UNDER_REVIEW'
  | 'WON'
  | 'LOST'
  | 'ACCEPTED'
  // UI-facing rollups used by Figma designs:
  | 'EVIDENCE_MISSING'
  | 'CONTRADICTION'
  | 'RESOLVED';

export type IngestionStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'OCR_REQUIRED'
  | 'OCR_COMPLETE'
  | 'EXTRACTION_FAILED'
  | 'CLASSIFIED'
  | 'PARTIAL_EXTRACTION'
  | 'REVIEW_REQUIRED';

export interface ExtractedFact {
  id: string;
  claim: string;
  sourceDocument: string;
  sourceLocation: string; // e.g. "Page 2" / "Line 143"
  confidence: number; // 0-1
  requiresHumanReview?: boolean;
  status: 'VERIFIED' | 'NEEDS_REVIEW';
}

// Slice 5 — grounded factual timeline event (mirrors backend factual_events).
export interface TimelineEvent {
  id: string;
  evidenceId: string;
  eventType: string; // one of EVENT_TYPES
  date: string | null; // ISO YYYY-MM-DD (null if not determinable)
  time: string | null; // HH:MM (null if not present)
  datePrecision: 'datetime' | 'date' | 'month' | 'unknown';
  actor: string | null; // courier | customer | merchant | bank | system | null
  description: string;
  sourceDocument: string;
  sourceLocation: string | null; // e.g. "Line 14" / "Lines 14-16" / null
  confidence: number; // 0-100
}

export interface EvidenceDocument {
  id: string;
  fileName: string;
  size: string; // e.g. "24 KB"
  badgeLabel: string; // e.g. "CHAT LOG"
  evidenceType?: EvidenceType;
  evidenceTypeLabel?: string; // display label e.g. "CUSTOMER COMMUNICATION"
  confidence?: number; // 0-100
  classificationSource?: 'LLM' | 'HEURISTIC';
  ingestionStatus: IngestionStatus;
  statusLabel?: string; // e.g. "ANALYZED" / "CONTRADICTION" / "PARTIAL EXTRACTION"
  extractionMethod?: 'pdf_text' | 'ocr' | 'neural parser';
  facts?: ExtractedFact[];
  contentPreview?: string[];
  reviewed?: boolean;
}

export type Severity = 'confirmed' | 'possible' | 'minor';
export type ContradictionType = 'chronological' | 'identity' | 'amount' | 'status' | 'address' | 'other';

export interface Contradiction {
  id: string;
  type: ContradictionType;
  severity: Severity;
  claimA: string;
  sourceA: string; // filename
  claimB: string;
  sourceB: string; // filename
  explanation: string;
  merchantImplication?: string;
  recommendedAction?: string;
  reviewed?: boolean;
}

export type ErsLabel = 'Strong' | 'Moderate' | 'Weak' | 'Incomplete';
export interface ErsBreakdown {
  score: number; // 0-100
  label: ErsLabel;
  requiredPresent: number;
  requiredTotal: number;
  recommendedComplete: number;
  recommendedTotal: number;
  contradictionsFound: number;
}

export interface GapItem {
  evidenceType: EvidenceType;
  label: string;
  required: boolean;
  present: boolean;
  detail?: string; // present doc name or missing explanation
  confidence?: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string; // ISO
  eventType: string;
  actor: 'RAZORPAY API' | 'SYSTEM' | 'MERCHANT' | 'AI ENGINE';
  statusText: string;
  badge: 'blue' | 'grey' | 'green' | 'orange' | 'red';
  metadata?: Record<string, unknown>;
}

export interface Dispute {
  id: string;
  reasonLabel: string; // "Non-receipt of goods"
  reasonCode: ReasonCode;
  customer: string;
  customerEmail?: string;
  amount: number; // INR
  deadlineText: string; // "36h remaining"
  deadlineDate?: string; // "24 Aug 2026"
  ers: number; // 0-100
  status: DisputeStatus;
  lastUpdated: string;
  documents?: EvidenceDocument[];
  contradictions?: Contradiction[];
  gaps?: GapItem[];
  ersBreakdown?: ErsBreakdown;
  responseStatus?: 'DRAFT_READY' | 'DRAFT_REVIEW_REQUIRED' | 'APPROVED' | null;
  submissionStatus?: 'SUBMISSION_PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'SUBMISSION_FAILED' | 'SUBMISSION_REQUIRES_REVIEW' | null;
  submittedAt?: number | null;
  paymentContext?: { paymentId: string; orderId: string; timestamp: string; method: string };
  audit?: AuditEvent[];
}

// Slice 7 — grounded response draft (DRAFT ONLY; never submitted by this slice).
export interface DraftSourceRef {
  documentId?: string | null;
  sourceDocument?: string | null;
  sourceLocation?: string | null;
}
export interface DraftSection {
  text: string;
  sources: DraftSourceRef[];
}
export interface DraftChronologyItem extends DraftSection {
  eventId?: string;
  eventType?: string;
}
export interface DraftSupportingItem {
  documentId?: string;
  evidenceType?: string;
  reason: string;
  sources: DraftSourceRef[];
}
export interface DraftContradictionItem {
  contradictionId?: string;
  text: string;
  sources: DraftSourceRef[];
}
export interface DraftMetrics {
  sourceCount: number;
  claimCount: number;
  groundedCount: number;
  coverage: number; // grounded claim coverage %
  validationStatus: string;
}
export interface ResponseDraft {
  id: string;
  disputeId: string;
  draftVersion: number;
  generationMethod: 'HEURISTIC' | 'LLM';
  provider: string | null;
  model: string | null;
  status: 'DRAFT_READY' | 'DRAFT_REVIEW_REQUIRED' | 'DRAFT_APPROVED' | 'DRAFT_FAILED';
  draft: {
    summary: DraftSection;
    merchantPosition: DraftSection;
    chronology: DraftChronologyItem[];
    supportingEvidence: DraftSupportingItem[];
    contradictions: DraftContradictionItem[];
    evidenceGaps: DraftSection[];
    requestedResolution: DraftSection;
  };
  metrics?: DraftMetrics;
  fallbackUsed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Slice 8 — submission result (matches backend POST /api/disputes/:id/submit).
export interface SubmitResult {
  id: string;
  disputeId: string;
  draftId: string;
  draftVersion: number;
  mode: 'SIMULATED' | 'LIVE';
  status: 'SUBMISSION_PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'SUBMISSION_FAILED' | 'SUBMISSION_REQUIRES_REVIEW';
  httpStatus?: number | null;
  razorpayStatus?: string | null;
  errorText?: string | null;
  evidenceUploaded?: Array<{ localEvidenceId: string; razorpayDocumentId: string | null }>;
  requestId?: string;
  startedAt: number;
  completedAt?: number | null;
  metadata?: Record<string, unknown>;
}

export interface SubmissionMode {
  razorpayConfigured: boolean;
  submissionMode: 'SIMULATED' | 'LIVE';
}
