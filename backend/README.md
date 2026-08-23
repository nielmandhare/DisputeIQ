# DisputeIQ Backend (Phase 1 + Slice 2)

Node.js + Express backend for DisputeIQ (Razorpay Buildathon 2026, Track 2 — AI Risk Manager).
Implements **Slice 1** (Razorpay dispute webhook ingestion → verified signature → idempotent
persistence → normalized dispute → API) and **Slice 2** (Evidence Upload Pipeline: store +
text extraction + status).

## Stack
- Node.js >= 22 (uses built-in `node:sqlite` — no external DB server)
- Express 4, multer (multipart), pdfjs-dist (PDF text extraction)
- No TypeScript build step (plain ESM JS) to keep a single fast pipeline

## Run
```bash
cp .env.example .env        # fill RAZORPAY_* if you have Test Mode keys
npm install
npm start                   # listens on :4000
```
Dev with auto-reload: `npm run dev`

## Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | health + config flags |
| GET | `/api/disputes` | list disputes (normalized to frontend `Dispute`) |
| GET | `/api/disputes/:id` | one dispute + embedded audit trail |
| GET | `/api/disputes/:id/audit[.csv\|.json]` | audit export |
| POST | `/webhooks/razorpay` | Razorpay webhook (raw body, HMAC verified) |
| POST | `/dev/seed-dispute` | **DEV ONLY** — injects a Razorpay-*shaped* `payment.dispute.created` through the real webhook pipeline (labeled SIMULATED) |
| POST | `/api/disputes/:id/evidence` | multipart upload (field `files`) → store + extract inline |
| GET | `/api/disputes/:id/evidence` | list evidence (safe metadata + truncated preview) |
| GET | `/api/evidence/:id` | evidence detail (includes full `extractedText`) |
| POST | `/api/evidence/:id/reclassify` | re-run the classification engine on an existing record |
| GET | `/api/evidence/:id/classification` | classification history + provenance (source spans) |

## Webhook pipeline (Slice 1)
```
Razorpay POST
 → raw body captured (express.raw)
 → HMAC-SHA256(webhook_secret, raw_body) === X-Razorpay-Signature
 → event id extracted
 → duplicate event id? -> ignore (idempotent)
 → persist webhook_event
 → async process -> normalize dispute -> persist -> audit
 → return 200
```

## Evidence pipeline (Slice 2)
```
Upload (multipart)
 → validate dispute + type + size
 → store file (StorageService, uuid names, path-traversal safe)
 → create EvidenceDocument (PROCESSING)
 → extract text (TXT / JSON / PDF)
 → persist result + status (EXTRACTED | OCR_REQUIRED | EXTRACTION_FAILED)
 → audit
 → frontend polls list / detail
```
Processing states: `UPLOADED → PROCESSING → EXTRACTED | OCR_REQUIRED | EXTRACTION_FAILED | UNSUPPORTED`.
- TXT: direct text → EXTRACTED. JSON: parsed → EXTRACTED (invalid → EXTRACTION_FAILED).
- PDF: `pdfjs-dist` extraction → EXTRACTED; if text below the configurable threshold →
  OCR_REQUIRED (no OCR yet; surfaced honestly, never faked as success).
- Persisted metadata: `extractionMethod`, `characterCount`, `pageCount`, `processingMs`.

## Classification pipeline (Slice 3)
Runs on ALREADY-EXTRACTED text (never raw files). Classification is triggered inline
after extraction (status EXTRACTED) and re-runnable via `POST /api/evidence/:id/reclassify`.
```
Extract (Slice 2) -> text
 -> classify(text) -> evidenceType + confidence (0-100) + sourceSpans (provenance)
 -> persist on evidence_documents + full record in evidence_classifications
 -> audit (actor AI ENGINE)
```
**Two interchangeable engines** (same output contract):
- `HEURISTIC` (default / demo): deterministic keyword + regex patterns over a closed
  evidence-type taxonomy (`INVOICE_OR_RECEIPT`, `SHIPPING_OR_DELIVERY`, `COMMUNICATION`,
  `REFUND_OR_CANCELLATION`, `IDENTITY_OR_KYC`, `PRODUCT_PHOTO`, `LEGAL_OR_DISPUTE_RESPONSE`,
  `OTHER`). Emits `sourceSpans` (verbatim matched phrases + char-window snippets) so every
  label is grounded in the source document. No external dependency.
- `LLM` (active only when `LLM_API_KEY` is set): structured JSON via an OpenAI-compatible
  `/chat/completions` endpoint, schema-validated. On any failure (HTTP error, timeout,
  invalid schema) it **transparently falls back to HEURISTIC** so the pipeline never breaks;
  the fallback reason is recorded.

Provenance: every classification writes a row to `evidence_classifications` (type, confidence,
method, model, signals, sourceSpans, sourceText, fallbackReason) — fully auditable.

## Dev seed (no Razorpay keys needed)
With `DISPUTEIQ_DEV_SEED=true` (default) and no live keys, `POST /dev/seed-dispute`
generates a `payment.dispute.created` event, signs it with a dev-only placeholder
secret, and feeds it through the **exact same** `handleWebhook` path. This exercises
the real verification + ingestion code without faking capability. It is NEVER
presented as a real Razorpay event.

## Tests
```bash
bash test.sh        # isolated DB; runs webhook + evidence + classification suites
```
Covers: signature verify (valid/tampered/wrong), webhook accept, duplicate idempotency,
invalid-signature/malformed/missing-field rejection, dispute normalization; evidence
upload (valid TXT/JSON/PDF, invalid JSON, image-only PDF → OCR_REQUIRED, unsupported type,
oversized, missing file, nonexistent dispute, path-traversal neutralization); and
classification (heuristic types for each taxonomy entry, source spans present, confidence
bounds, empty/unrelated-text → OTHER, LLM-failure → HEURISTIC fallback, persist + provenance,
reclassify, no classification on non-extracted docs).

## Notes / scope
- Only documented Razorpay dispute capabilities are used (GET /v1/disputes, webhook
  events `payment.dispute.*`). No evidence submission to Razorpay yet (gated behind human
  approval; Phase 1G).
- Slice 3 classifies extracted text only — no factual-timeline extraction, contradiction
  detection, or ERS computation yet (those are later slices).
- Secrets are never returned to the frontend. The frontend only ever receives safe,
  normalized data. Full `extractedText` is served only via the authorized detail endpoint.
- Later slices (contradiction engine, ERS, human approval + submission) build
  on the `disputes` / `webhook_events` / `audit_events` / `evidence_documents` /
  `evidence_classifications` tables.
