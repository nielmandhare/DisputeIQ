# DisputeIQ Backend (Phase 1)

Node.js + Express backend for DisputeIQ (Razorpay Buildathon 2026, Track 2 — AI Risk Manager).
Implements **Slice 1**: Razorpay dispute webhook ingestion → verified signature → idempotent
persistence → normalized dispute → API consumed by the existing React frontend.

## Stack
- Node.js >= 22 (uses built-in `node:sqlite` — no external DB server)
- Express 4
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

## Webhook pipeline
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

## Dev seed (no Razorpay keys needed)
With `DISPUTEIQ_DEV_SEED=true` (default) and no live keys, `POST /dev/seed-dispute`
generates a `payment.dispute.created` event, signs it with a dev-only placeholder
secret, and feeds it through the **exact same** `handleWebhook` path. This exercises
the real verification + ingestion code without faking capability. It is NEVER
presented as a real Razorpay event.

## Tests
```bash
npm test
```
Covers: signature verify (valid/tampered/wrong), webhook accept, duplicate idempotency,
invalid-signature rejection, malformed-JSON rejection, missing-field rejection, and
dispute normalization.

## Notes / scope
- Only documented Razorpay dispute capabilities are used (GET /v1/disputes, webhook
  events `payment.dispute.*`). No evidence submission yet (gated behind human approval;
  Phase 1G).
- Secrets are never returned to the frontend. The frontend only ever receives safe,
  normalized data.
- Later slices (evidence pipeline, AI classification, contradiction engine, human
  approval + submission) build on the `disputes` / `webhook_events` / `audit_events`
  tables already created here.
