# DisputeIQ — Frontend

React + TypeScript + Vite SPA for DisputeIQ (Razorpay Buildathon 2026, Track 2 — AI Risk Manager).

See the [project README](../../README.md) for what DisputeIQ is, the safety model, and the full run instructions (backend first, then this).

## Run

```bash
cd frontend
npm install
npm run dev
```

The dev server listens on `http://localhost:5173` and proxies `/api` to the backend at `http://localhost:4000`.

## Build

```bash
npm run build        # production build (outputs to dist/)
npm run preview      # preview the production build locally
```

## Stack

- React 18 + TypeScript
- Vite (dev server + build)
- React Router for page navigation
- Plain CSS (tokens + globals) — no component library
- API service layer in `src/services/` with a mock fallback for offline/demo browsing

## Pages

Overview, Disputes, DisputeDetail, Evidence, Classification, Contradiction, Gaps, Dossier, Approval, Submitted, Audit, Activity, AIAnalysis, Settings, HelpDocs.

## Notes

- The frontend proxies API calls to the backend; it does **not** hold any secrets.
- `.env` files are gitignored on both sides. Configure via `backend/.env.example` → `backend/.env`.
