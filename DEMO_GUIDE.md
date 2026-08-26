# DisputeIQ — Final Demo Guide (CP9)

Judge-ready, deterministic 5-minute demo. All numbers are backend-derived.

## Demo cases (verified against the live 100-dispute synthetic dataset)

### PRIMARY (success path)
- **Dispute ID:** `disp_demo_b4a6a1a4`
- **Scenario:** Non-receipt of goods · ₹4,100 INR · ERS **78/100 (Moderate)**
- **Evidence:** invoice/receipt + shipping/delivery + customer communication (3 docs)
- **Why selected:** clean, strong case — draft reaches 100% grounding, human approval,
  successful **SIMULATED** submission. No contradiction, so the success path is unambiguous.
- **Live flow result:** DRAFT_READY (valid, 100% grounded, HEURISTIC) → DRAFT_APPROVED →
  SUBMITTED (SIMULATED, razorpayStatus SIMULATED).

### FAILURE / RECOVERY (honest AI limitation)
- **Dispute ID:** `disp_demo_4dd8cf58`
- **Scenario:** contradiction_delivery · ERS **63/100 (Weak)** · 1 contradiction
- **Evidence:** invoice/receipt + shipping/delivery + customer communication
- **Contradiction (real, source-grounded):**
  - DOCUMENT A `customer_claim.txt`: *"this order ORD-100235 on 2026-02-14 and never got (cancelled)"*
  - DOCUMENT B `shipping.txt`: *"ORD-100235 Delivered on: 2026-02-17 10:16 (delivered)"*
  - A **cancellation recorded BEFORE delivery** — a logical impossibility the engine detects.
- **Recovery:** system flags it (CONFIRMED · chronological), shows both source spans, and
  offers "Mark Contradiction as Reviewed" — the decision stays with the human. No fabrication.

## 5-minute walkthrough
0:00–0:30  **Overview** — 100 disputes, ₹2,50,200 disputed, avg ERS 71, 253 evidence docs,
           18 contradictions, 31 contest-ready / 69 needs-evidence.
0:30–0:50  **Synthetic disclosure** — "Razorpay's dispute APIs are real and integrated, but
           the test account cannot generate arbitrary disputes. The 100-dispute dataset is
           synthetic (SyntheticDisputeProvider), clearly separated from RazorpayDisputeProvider."
0:50–1:20  **Primary dispute** — detail, evidence count, ERS, workflow stepper.
1:20–1:50  **Evidence** — document → extraction → classification → confidence → source text.
           Method shown honestly (HEURISTIC / Deterministic engine when Omniroute is down).
1:50–2:20  **AI Analysis** — one REAL AI event: operation, provider, model, method, status,
           confidence, duration, input/output, dispute. Every AI execution is an observable event.
2:20–2:50  **Timeline + Contradiction** — factual timeline; the failure dispute's contradiction.
2:50–3:15  **ERS** — deterministic (classification + timeline grounding + completeness −
           contradiction penalty). NOT an ML prediction.
3:15–3:45  **Response draft** — DRAFT_READY, Grounding 100%, claims source-cited.
3:45–4:10  **Human approval** — draft → grounding validation → approve (gate).
4:10–4:25  **Simulated submission** — SUBMITTED / SIMULATED. Stated clearly: synthetic, not
           accepted by Razorpay.
4:25–4:45  **Activity / Audit** — real events: DISPUTE_RECEIVED → ERS_COMPUTED →
           SUBMISSION_STARTED → CONTEST_ACCEPTED.
4:45–5:00  **Failure / recovery** — the contradiction case; AI detected, didn't fabricate,
           human decides.

## Razorpay honesty (non-negotiable)
- **REAL:** Razorpay authentication, provider architecture, dispute-API integration,
  document/contest submission integration, webhook integration, submission state handling.
- **SYNTHETIC:** the 100-dispute demo dataset, synthetic evidence/scenarios, simulated
  submissions for synthetic disputes.
- We do **NOT** claim the 100 disputes came from Razorpay. The dispute integration is built
  against Razorpay's API; the dataset is synthetic because arbitrary disputes cannot be
  generated in our Razorpay test account.

## "What broke at 2 AM?" (engineering decision, not an excuse)
Razorpay's test environment does not allow arbitrary dispute generation. We confirmed real
dispute IDs require actual dispute activity. Rather than fabricate Razorpay data or perform a
real financial dispute, we isolated the unavailable test data behind `SyntheticDisputeProvider`
while keeping `RazorpayDisputeProvider` real. The app consumes the same normalized dispute
contract regardless of source — switching providers needs no AI-pipeline rewrite.

## Security
- No `.env` committed. No Razorpay secret / Omniroute key in source, logs, or git history.
- No synthetic record presented as Razorpay data.
- No autonomous financial submission — human approval is mandatory (acknowledgment checkbox +
  explicit Approve & Submit).
- Submissions for synthetic disputes are SIMULATED; they never hit live Razorpay.

## Test results (CP9 regression)
- Backend: **139/139 pass**
- TypeScript: **PASS** (`npx tsc --noEmit`)
- Production build: **PASS** (`npm run build`)
- Browser E2E: **PASS** (primary success + failure/recovery flows executed in-browser)
