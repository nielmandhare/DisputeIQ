import {
  AuditEvent, Contradiction, Dispute, EvidenceDocument, GapItem, ErsBreakdown, ExtractedFact,
} from '../types';

// ===== Helpers =====
const fact = (
  id: string, claim: string, sourceDocument: string, sourceLocation: string,
  confidence: number, requiresHumanReview = false, status: 'VERIFIED' | 'NEEDS_REVIEW' = 'VERIFIED',
): ExtractedFact => ({ id, claim, sourceDocument, sourceLocation, confidence, requiresHumanReview, status });

// ===== Evidence documents for the demo dispute disp_test_8K72 =====
const whatsappFacts: ExtractedFact[] = [
  fact('f1', 'Customer agreed to keep replacement shipment sent March 15', 'whatsapp_chat.txt', 'Line 143', 0.94),
  fact('f2', 'Customer requested return label on March 12', 'whatsapp_chat.txt', 'Line 84', 0.97),
  fact('f3', 'Package received by neighbor Bobby at March 15 2:43 PM', 'whatsapp_chat.txt', 'Line 189', 0.91, true, 'NEEDS_REVIEW'),
];

const deliveryFacts: ExtractedFact[] = [
  fact('f4', 'Customer accepted replacement item at address Bangalore East', 'delivery_confirmation.pdf', 'Line 143', 0.94),
  fact('f5', 'Delivered status confirmed at destination node on March 15', 'delivery_confirmation.pdf', 'Page 2', 0.98),
];

const shippingFacts: ExtractedFact[] = [
  fact('f6', 'Item shipped via courier on March 10, tracking assigned', 'shipping_receipt.pdf', 'Page 1', 0.89),
];

const returnFacts: ExtractedFact[] = [
  fact('f7', 'Return initiated by customer on March 12', 'return_form.pdf', 'Page 1', 0.97),
];

export const DEMO_DOCS: EvidenceDocument[] = [
  {
    id: 'd1', fileName: 'whatsapp_chat.txt', size: '24 KB', badgeLabel: 'CHAT LOG',
    evidenceType: 'customer_communication', evidenceTypeLabel: 'CUSTOMER COMMUNICATION',
    confidence: 94, ingestionStatus: 'CLASSIFIED', statusLabel: 'ANALYZED',
    extractionMethod: 'neural parser', facts: whatsappFacts,
  },
  {
    id: 'd2', fileName: 'delivery_confirmation.pdf', size: '1.2 MB', badgeLabel: 'PROOF OF DELIVERY',
    evidenceType: 'delivery_confirmation', evidenceTypeLabel: 'DELIVERY CONFIRMATION',
    confidence: 98, ingestionStatus: 'CLASSIFIED', statusLabel: 'ANALYZED',
    facts: deliveryFacts,
  },
  {
    id: 'd3', fileName: 'shipping_receipt.pdf', size: '450 KB', badgeLabel: 'SHIPPING PROOF',
    evidenceType: 'shipping_proof', evidenceTypeLabel: 'SHIPPING PROOF',
    confidence: 89, ingestionStatus: 'CLASSIFIED', statusLabel: 'ANALYZED',
    facts: shippingFacts,
  },
  {
    id: 'd4', fileName: 'return_form.pdf', size: '98 KB', badgeLabel: 'CUSTOMER FORM',
    evidenceType: 'return_document', evidenceTypeLabel: 'RETURN DOCUMENT',
    confidence: 72, ingestionStatus: 'CLASSIFIED', statusLabel: 'CONTRADICTION',
    facts: returnFacts,
  },
];

// OCR-failure / partial-extraction document (demo failure flow)
export const OCR_ISSUE_DOC: EvidenceDocument = {
  id: 'd5', fileName: 'evidence_03.pdf', size: '612 KB', badgeLabel: 'DELIVERY INVOICE',
  evidenceType: 'shipping_proof', evidenceTypeLabel: 'SHIPPING PROOF',
  confidence: 62, ingestionStatus: 'PARTIAL_EXTRACTION', statusLabel: 'PARTIAL EXTRACTION',
  extractionMethod: 'ocr',
  contentPreview: [
    'DELIVERY INVOICE --- [GARBLED: 0x92f]',
    'Date of transit: 12-Mar-2026??',
    'Recipient: Ankit Sh_rm_ [UNREADABLE]',
    'Dest: Sector 45, Gurgaon, HR, 122003',
    'Status: [PARTIAL: Deliv_red on March 15th, 2026?]',
    'Signature verification token: [MISSING]',
  ],
};

// ===== Contradiction for demo dispute =====
export const DEMO_CONTRADICTION: Contradiction = {
  id: 'conflict_9a2f',
  type: 'chronological',
  severity: 'confirmed',
  claimA: 'Delivery confirmed March 15, 2:43 PM',
  sourceA: 'delivery_confirmation.pdf',
  claimB: 'Return initiated March 12, 10:14 AM',
  sourceB: 'return_form.pdf',
  explanation:
    'If the return was initiated on March 12, the product could not have been successfully delivered on March 15 as a standard flow. This suggests either a system recording delay, or that the courier tracking refers to a replacement shipment rather than the original disputed item.',
  merchantImplication:
    'This timeline conflict may actually strengthen the merchant case — it indicates the customer received and kept a replacement shipment.',
  recommendedAction:
    'To maximize your Evidence Readiness Score, provide a customer communication log explaining the replacement shipment flow or mark this contradiction as reviewed with a custom merchant memo payload.',
};

// ===== Gaps for demo dispute (non_receipt_of_goods) =====
export const DEMO_GAPS: GapItem[] = [
  { evidenceType: 'shipping_proof', label: 'Shipping Proof Receipt', required: true, present: true, detail: 'shipping_receipt.pdf · High Confidence Match', confidence: 89 },
  { evidenceType: 'delivery_confirmation', label: 'Delivery Confirmation Receipt', required: true, present: true, detail: 'delivery_confirmation.pdf · High Confidence Match', confidence: 98 },
  { evidenceType: 'customer_communication', label: 'Customer Communications Chat Log', required: false, present: true, detail: 'whatsapp_chat.txt · 94% completeness', confidence: 94 },
  { evidenceType: 'courier_record', label: 'Courier Tracking Portal Record', required: false, present: false, detail: 'Provides direct third-party transit status timeline' },
];

export const DEMO_ERS: ErsBreakdown = {
  score: 82, label: 'Moderate', requiredPresent: 2, requiredTotal: 2,
  recommendedComplete: 2, recommendedTotal: 3, contradictionsFound: 1,
};

// ===== Audit trail for demo dispute =====
const auditMeta = (o: Record<string, unknown>) => o;
export const DEMO_AUDIT: AuditEvent[] = [
  { id: 'a1', timestamp: '2026-08-22T18:42:11Z', eventType: 'DISPUTE RECEIVED', actor: 'RAZORPAY API', statusText: 'Executed successfully', badge: 'blue' },
  { id: 'a2', timestamp: '2026-08-22T18:42:12Z', eventType: 'DISPUTE CONTEXT FETCHED', actor: 'RAZORPAY API', statusText: 'Executed successfully', badge: 'blue' },
  { id: 'a3', timestamp: '2026-08-22T18:42:15Z', eventType: 'PAYMENT CONTEXT FETCHED', actor: 'RAZORPAY API', statusText: 'Executed successfully', badge: 'blue' },
  { id: 'a4', timestamp: '2026-08-22T18:42:16Z', eventType: 'EVIDENCE REQUIREMENTS MAPPED', actor: 'SYSTEM', statusText: 'Executed successfully', badge: 'grey' },
  { id: 'a5', timestamp: '2026-08-22T18:42:19Z', eventType: 'DOCUMENT UPLOADED', actor: 'MERCHANT', statusText: 'Executed successfully', badge: 'grey' },
  { id: 'a6', timestamp: '2026-08-22T18:42:22Z', eventType: 'AI CLASSIFICATION COMPLETE', actor: 'AI ENGINE', statusText: 'Executed successfully', badge: 'green' },
  { id: 'a7', timestamp: '2026-08-22T18:42:25Z', eventType: 'DOCUMENT UPLOADED', actor: 'MERCHANT', statusText: 'Executed successfully', badge: 'grey' },
  { id: 'a8', timestamp: '2026-08-22T18:42:28Z', eventType: 'AI CLASSIFICATION COMPLETE', actor: 'AI ENGINE', statusText: 'Executed successfully', badge: 'green' },
  { id: 'a9', timestamp: '2026-08-22T18:42:31Z', eventType: 'OCR FALLBACK TRIGGERED', actor: 'AI ENGINE', statusText: 'Executed successfully', badge: 'orange' },
  { id: 'a10', timestamp: '2026-08-22T18:42:38Z', eventType: 'PARTIAL EXTRACTION COMPLETE', actor: 'AI ENGINE', statusText: 'Executed successfully', badge: 'orange' },
  {
    id: 'a11', timestamp: '2026-08-22T18:42:44Z', eventType: 'CONTRADICTION DETECTED', actor: 'AI ENGINE',
    statusText: 'Executed successfully', badge: 'red',
    metadata: auditMeta({
      conflict_id: 'conflict_9a2f', type: 'CHRONOLOGICAL_INCONSISTENCY',
      file_a: 'delivery_confirmation.pdf', file_b: 'return_form.pdf',
      system_flag: 'AI_TIMELINE_VALIDATOR_V2',
    }),
  },
  { id: 'a12', timestamp: '2026-08-22T18:44:02Z', eventType: 'MERCHANT APPROVED DOSSIER', actor: 'MERCHANT', statusText: 'Executed successfully', badge: 'blue' },
  { id: 'a13', timestamp: '2026-08-22T18:44:05Z', eventType: 'CONTEST SUBMITTED', actor: 'RAZORPAY API', statusText: 'Executed successfully', badge: 'green' },
];

// ===== Full dispute list (disputes-list.pdf + overview priority rows) =====
export const DEMO_DISPUTES: Dispute[] = [
  {
    id: 'disp_test_8K72', reasonLabel: 'Non-receipt of goods', reasonCode: 'non_receipt_of_goods',
    customer: 'Ankit Sharma', customerEmail: 'ankit.sharma@email.com', amount: 34500,
    deadlineText: '36h remaining', deadlineDate: '24 Aug 2026', ers: 82, status: 'PENDING_REVIEW',
    lastUpdated: '2h ago', documents: DEMO_DOCS, contradictions: [DEMO_CONTRADICTION],
    gaps: DEMO_GAPS, ersBreakdown: DEMO_ERS, audit: DEMO_AUDIT,
    paymentContext: { paymentId: 'pay_test_KP48z2M', orderId: 'ord_test_8X2kL90', timestamp: '22 Aug 11:34 AM', method: 'UPI' },
  },
  {
    id: 'disp_test_4F91', reasonLabel: 'Credit not processed', reasonCode: 'credit_not_processed',
    customer: 'Priya Mehta', amount: 24200, deadlineText: '18h remaining', ers: 61, status: 'EVIDENCE_MISSING',
    lastUpdated: '5m ago',
  },
  {
    id: 'disp_test_2M33', reasonLabel: 'Product not as described', reasonCode: 'product_not_as_described',
    customer: 'Rahul Joshi', amount: 12800, deadlineText: '4d remaining', ers: 95, status: 'SUBMITTED',
    lastUpdated: '1d ago',
  },
  {
    id: 'disp_test_7R19', reasonLabel: 'Cancelled recurring', reasonCode: 'cancelled_recurring_payment',
    customer: 'Deepika Nair', amount: 8400, deadlineText: '6d remaining', ers: 44, status: 'EVIDENCE_MISSING',
    lastUpdated: '4h ago',
  },
  {
    id: 'disp_test_5L08', reasonLabel: 'Non-receipt of services', reasonCode: 'non_receipt_of_services',
    customer: 'Vikram Patel', amount: 67200, deadlineText: '2d remaining', ers: 78, status: 'PENDING_REVIEW',
    lastUpdated: '6h ago',
  },
  {
    id: 'disp_test_9W12', reasonLabel: 'Fraudulent transaction', reasonCode: 'duplicate_transaction',
    customer: 'Sanjay Gupta', amount: 89000, deadlineText: '8h remaining', ers: 38, status: 'CONTRADICTION',
    lastUpdated: '1h ago',
  },
  {
    id: 'disp_test_3B45', reasonLabel: 'Incorrect charge amount', reasonCode: 'general',
    customer: 'Meera Krishnan', amount: 15500, deadlineText: '5d remaining', ers: 88, status: 'PROCESSING',
    lastUpdated: '3d ago',
  },
  {
    id: 'disp_test_1K98', reasonLabel: 'Duplicate billing', reasonCode: 'duplicate_transaction',
    customer: 'Arjun Reddy', amount: 8000, deadlineText: '7d remaining', ers: 97, status: 'RESOLVED',
    lastUpdated: '1w ago',
  },
];

// ===== Overview dashboard summary =====
export const OVERVIEW_STATS = {
  activeDisputes: 12, needsReview: 3, submitted: 7, resolved: 24,
  activeDelta: '+2 since yesterday', reviewNote: 'Deadline approaching',
  submittedNote: 'This week', resolvedNote: 'All time',
};
