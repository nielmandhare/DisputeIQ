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

## Dev seed (no Razorpay keys needed)
With `DISPUTEIQ_DEV_SEED=true` (default) and no live keys, `POST /dev/seed-dispute`
generates a `payment.dispute.created` event, signs it with a dev-only placeholder
secret, and feeds it through the **exact same** `handleWebhook` path. This exercises
the real verification + ingestion code without faking capability. It is NEVER
presented as a real Razorpay event.

## Tests
```bash
bash test.sh        # isolated DB; runs webhook + evidence suites
```
Covers: signature verify (valid/tampered/wrong), webhook accept, duplicate idempotency,
invalid-signature/malformed/missing-field rejection, dispute normalization; and evidence
upload (valid TXT/JSON/PDF, invalid JSON, image-only PDF → OCR_REQUIRED, unsupported type,
oversized, missing file, nonexistent dispute, path-traversal neutralization).

## Notes / scope
- Only documented Razorpay dispute capabilities are used (GET /v1/disputes, webhook
  events `payment.dispute.*`). No evidence submission to Razorpay yet (gated behind human
  approval; Phase 1G).
- No AI in Slice 2 (classification/contradiction/ERS are later slices).
- Secrets are never returned to the frontend. The frontend only ever receives safe,
  normalized data. Full `extractedText` is served only via the authorized detail endpoint.
- Later slices (AI classification, contradiction engine, human approval + submission) build
  on the `disputes` / `webhook_events` / `audit_events` / `evidence_documents` tables.
