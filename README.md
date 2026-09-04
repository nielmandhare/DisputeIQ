# DisputeIQ

Merchant dispute operations platform — a Razorpay Buildathon 2026 project (Track 2 — AI Risk Manager).

DisputeIQ is a local-first command center for a merchant-facing dispute team: it ingests dispute events (Razorpay webhooks in live mode, or a labeled synthetic/demo dataset), classifies uploaded evidence, extracts a grounded factual timeline, detects contradictions, computes an Evidence Readiness Score (ERS), drafts a source-grounded merchant response, and — after mandatory human approval — submits a contest to Razorpay.

**Important honesty note:** the default demo dataset is **synthetic** and labeled `provider='demo'`. It is never presented as a real Razorpay dispute. The real Razorpay contest submission path exists and is wired, but **RAZORPAY_SUBMISSION_MODE defaults to `SIMULATED`** so it never sends a real request until you explicitly enable it.

## What's in here

- **Backend** (`backend/`) — Node.js 22 + Express + `node:sqlite` (no external DB server). Plain ESM JS, no TypeScript build step. Real API, real DB, real audit trail, real AI-observability events.
- **Frontend** (`frontend/`) — React + TypeScript + Vite + CSS. Runs alongside the backend and proxies `/api` to it.
- **LLM path** — provider-agnostic OpenAI-compatible `/chat/completions` integration. Defaults to a **Deterministic HEURISTIC engine** (no external dependency, always grounded). When an LLM key is configured and **Omniroute** (the self-hosted gateway fronting Claude Sonnet 4.5) is up, draft generation can use the LLM — but every LLM output is still validated and grounded before anything is persisted, and falls back to HEURISTIC on any failure.

## Architecture (the actual flow)

```
Razorpay webhook / synthetic demo seed
 → HMAC-verify (live webhooks) or load labeled demo
 → persist dispute (normalized, provider='demo' when synthetic)
 → evidence upload (TXT/JSON/PDF) → extract text → classify → provenance spans
 → factual timeline extraction (grounded in extracted text)
 → contradiction detection (chronological + amount, grounded in source docs)
 → ERS (evidence readiness score from real classification + timeline + completeness + contradiction penalty)
 → response draft (HEURISTIC default, optional LLM, schema-validated + grounded, versioned)
 → human approval (mandatory; never auto-submits)
 → Razorpay contest submission (SIMULATED by default; LIVE only when you set both keys + mode)
 → webhook ingestion of Razorpay updates
```

Every factual claim in a draft carries `sources` (documentId + sourceLocation). **No source → no factual claim.** The LLM receives the context marked as **untrusted DATA** and never triggers any action.

## Running it

### Prerequisites

- **Node.js 22+** (backend uses built-in `node:sqlite`; no DB server needed).
- **git** to clone.
- Optional but recommended for the LLM path: **Omniroute** running on `http://localhost:20128/v1` (the self-hosted gateway the project uses). If it's not up, everything still works — drafts fall back to the deterministic HEURISTIC engine.

### 1. Clone

```bash
git clone https://github.com/nielmandhare/DisputeIQ.git
cd DisputeIQ
```

The default branch is `main` (the merged, current state of the project).

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: at minimum set the keys you want to use.
# For a no-keys local demo, leave RAZORPAY_* empty and LLM_API_KEY empty;
# the synthetic demo seed runs with DISPUTEIQ_DEV_SEED=true (default).
npm start
```

Backend listens on `http://localhost:4000` (configurable via `PORT`).

#### `.env` — what matters

| Variable | What it does |
|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live Razorpay (Test Mode) keys. Both must be set for any LIVE submission. |
| `RAZORPAY_SUBMISSION_MODE` | `simulated` (default — no external call) or `live`. |
| `RAZORPAY_WEBHOOK_SECRET` | For verifying `X-Razorpay-Signature` on live Razorpay webhooks. |
| `LLM_API_KEY` | Leave empty to use the deterministic HEURISTIC engine. Set to enable the LLM path. |
| `LLM_BASE_URL` | OpenAI-compatible endpoint. Default `https://openrouter.ai/api/v1`. For the local Omniroute gateway use `http://localhost:20128/v1`. |
| `LLM_MODEL` | Model id sent to the endpoint. The project uses the Omniroute alias `DisputeIQ` → Claude Sonnet 4.5. |
| `LLM_TIMEOUT_MS` | Draft-generation LLM timeout. Default 60000. |
| `DISPUTEIQ_DEV_SEED` | `true` (default) lets the backend serve a labeled synthetic demo dataset when no live keys exist. |
| `DISPUTEIQ_API_KEY` | Leave empty for the local demo (auth disabled, explicit dev mode). Set a value to enforce `Bearer`-key auth on all mutating `/api` routes. |
| `DISPUTEIQ_ALLOWED_ORIGINS` | Comma-separated CORS allowlist (e.g. `http://localhost:5173`). Set so the wildcard `*` is never used. |

**`.env` is gitignored** — never commit real keys.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend listens on `http://localhost:5173` and proxies `/api` to the backend.

### 4. (Optional) Omniroute — the self-hosted LLM gateway

Omniroute fronts Claude Sonnet 4.5 over an OpenAI-compatible `/chat/completions` contract at `http://localhost:20128/v1`. When it's up and `LLM_API_KEY` is set, drafts can be generated via the LLM.

- Start it (the project's Omniroute binary lives at `C:\Users\owner\AppData\Local\hermes\node\omniroute` on this machine; adjust to wherever yours is).
- Give it a couple of minutes to bootstrap — it binds + warms the model catalog.
- Verify: `curl -s http://localhost:20128/v1/models` should return 200.
- If Omniroute is down or slow, the backend **still works** — it falls back to HEURISTIC transparently and logs the fallback honestly (never mislabels a HEURISTIC result as Claude).

### 5. Open the app

http://localhost:5173

## The demo (no Razorpay keys needed)

With `DISPUTEIQ_DEV_SEED=true` (default) and no live keys, the backend can load a **labeled synthetic 100-dispute dataset** that exercises the full pipeline.

The API exposes a demo seed/reset endpoint (protected by auth when `DISPUTEIQ_API_KEY` is set; otherwise available in dev mode):

```bash
# reset + load 100 synthetic disputes (runs the full pipeline over each)
curl -X POST http://localhost:4000/api/demo/seed
```

That gives you: 100 disputes, evidence docs, OCR-required flags, contradictions, ERS values, timeline events, and response drafts (approved ones become contest-ready in the demo queue). The audit trail and AI-analysis events are **real** — logged as HEURISTIC when the LLM isn't active, or as LLM/Claude when Omniroute is up.

The frontend shows all of it: Overview (real backend metrics), Disputes, Evidence, AI Analysis (real execution events with provider/model/method/duration/confidence), Activity, per-dispute Audit, and the Dossier (workflow + draft generate/approve + submission).

## The safety model (read this once)

- **AI never submits anything.** Submission is a separate, human-gated step.
- **Human approval is mandatory** before any contest submission. The server re-verifies all preconditions on submit (approved draft, required evidence present, grounded coverage) — not just trusting the client.
- **SIMULATED is the default.** The backend marks simulated submissions clearly and never sends a real request unless `RAZORPAY_SUBMISSION_MODE=live` **and** both `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` are set.
- **Synthetic is labeled.** Demo disputes are stamped `provider='demo'` and use a `dupu_demo_###` namespace so they can never be confused with real `dupu_...` Razorpay disputes.
- **Idempotency.** Re-submitting the same dispute+draft returns the existing submission record (no duplicate Razorpay call). Concurrency is protected at the DB level (UNIQUE constraint + caught violation → deduplicated).
- **LLM outputs are validated.** Every LLM draft is schema-validated and grounding-checked before persistence; invalid or under-100%-grounded LLM output falls back to HEURISTIC.
- **No secrets to the frontend.** The frontend only gets safe, normalized data. Full `extractedText` is served only via the authorized detail endpoint.
- **Grounding is real.** Classification writes provenance `sourceSpans` (verbatim matched phrases + snippets). Timeline and contradiction events are grounded in extracted document text. The draft validator now checks that cited claim fragments actually appear in the cited document's text (not just that the documentId is a valid member).

## Tests

```bash
cd backend
npm install          # if not done
bash test.sh         # runs all suites against an isolated test DB
```

Covers: webhook signature/verify/idempotency/rejection, evidence upload + extraction + security (path-traversal neutralization), classification (heuristic types, provenance spans, LLM-failure fallback, reclassify), timeline extraction, contradiction detection, ERS scoring, response-draft generation/validation/grounding/versioning/prompt-injection, submission safety (approval gate, missing-evidence block, simulated-no-call, idempotency, concurrency, unknown-result no-retry, LIVE failure surfacing), and auth/CORS (missing/invalid key → 401, valid key proceeds, allowed/denied origins, no wildcard when origins set, key never leaks).

## Honest scope / what's not claimed

- Only **documented** Razorpay dispute capabilities are used (GET `/v1/disputes`, `payment.dispute.*` webhook events). No undocumented or fabricated Razorpay behavior.
- **Evidence submission to Razorpay** is wired behind human approval + SIMULATED-default mode; in this repo's current state the Razorpay test account has no live disputes to contest, so the real contest path has not been verified against a live Razorpay dispute. It is real integration code, but **unverified end-to-end with a real Razorpay dispute** — do not assume it works with real money until you test it against a real dispute.
- The LLM path uses a **self-hosted Omniroute gateway** that fronts Claude Sonnet 4.5; the model label "Claude Sonnet 4.5" reflects that gateway, not a direct Anthropic call. When Omniroute is unavailable the pipeline falls back to the deterministic HEURISTIC engine — and logs that honestly.
- "Claude Sonnet 4.5" / Omniroute are used as the project's configured LLM provider; verify any provider/model/cost expectations against your own Omniroute deployment before relying on it.

## Project structure

```
DisputeIQ/
├── backend/
│   ├── .env.example          # all env vars, with placeholders (copy to .env)
│   ├── package.json
│   ├── test.sh               # runs the full test suite against an isolated DB
│   ├── src/
│   │   ├── index.js          # Express app + routes
│   │   ├── config.js         # env loading + config object
│   │   ├── db.js             # SQLite schema + migrations (node:sqlite)
│   │   ├── storage.js        # file storage abstraction (path-traversal safe)
│   │   ├── providers/        # synthetic (demo) dataset provider
│   │   ├── services/         # webhook, audit, classification, timeline,
│   │   │                     #  contradiction, ERS, responseDraft, submission,
│   │   │                     #  llm, aiEvents, evaluation, overview, storage, extraction
│   │   ├── repositories/     # DB access: disputes, evidence, contradictions,
│   │   │                     #  ers, timeline, responseDraft
│   │   └── services/razorpay/ # real Razorpay client + webhook (HMAC) handling
│   └── tests/                # all backend test suites
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/            # Overview, Disputes, DisputeDetail, Evidence,
│   │   │                     #  Classification, Contradiction, Gaps, Dossier,
│   │   │                     #  Approval, Submitted, Audit, Activity, AIAnalysis,
│   │   │                     #  Settings, HelpDocs
│   │   ├── components/       # Alert, ErsGauge, Icons, StatusBadge, layout
│   │   ├── services/         # API + mock fallback services
│   │   ├── types/            # shared TS types
│   │   └── styles/
│   └── README.md
├── docs/                    # figma inventory, screen flow, implementation report, UI deviations
├── DEMO_GUIDE.md            # demo walk-through (primary + failure cases, 5-min flow)
└── README.md                # this file
```

## License

This is a buildathon project. Treat it as such.
