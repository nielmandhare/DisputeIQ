# Figma Screen Inventory — DisputeIQ Frontend

Source: `frontend_pngs.zip` (12 PDFs rendered to PNG at 2x scale for inspection).
Inspection date: 2026-08-23. Every screen inspected visually via vision analysis.

| # | Source File | Route | Screen | Key Contents |
|---|-------------|-------|--------|--------------|
| 1 | overview-dashboard.pdf | `/overview` | Overview / Dashboard | Greeting "Good evening, Niel"; 4 stat cards (Active Disputes 12, Needs Review 3, Submitted 7, Resolved 24); Priority Disputes table (5 rows) |
| 2 | disputes-list.pdf | `/disputes` | Disputes List | Title "Disputes"; search + Filter + Sort; tabs (All 12 / Needs Review 3 / Processing 2 / Submitted 7 / Resolved 24); 8-row table |
| 3 | dispute-detail.pdf | `/disputes/:id` | Dispute Detail (hub) | 3-col layout: context panels (Dispute Details, Payment Context, Customer) / Evidence Documents + AI Analysis Process / ERS gauge + Required-Recommended evidence |
| 4 | screen-ai-classification.pdf | `/disputes/:id/classification` | AI Classification | Left: evidence doc list w/ size+badge; Right: classification results, confidence, processing checks, facts w/ citations, override button |
| 5 | contradiction-investigation.pdf | `/disputes/:id/contradiction` | Contradiction Investigation | Two cards (DOC A delivery Mar 15 vs DOC B return Mar 12) w/ VS circle; Why This Matters; What To Do; Mark as Reviewed |
| 6 | evidence-gap-analysis.pdf | `/disputes/:id/gaps` | Evidence Gap Analysis | Required/Recommended lists w/ PRESENT/MISSING badges; summary card 82%; upload courier buttons |
| 7 | dossier-preview.pdf | `/disputes/:id/dossier` | Dossier Preview | Structured dossier (I Info, II Index, III Timeline facts w/ citations, IV Contradictions); Show raw payload; Approve & Submit |
| 8 | screen-approval.pdf | `/disputes/:id/approval` | Approval | Modal "Review before submission"; dossier summary; ERS 82/100; acknowledgment checkbox; Approve & Submit |
| 9 | screen-submission-success.pdf | `/disputes/:id/submitted` | Submission Success | Success card; dispute id, amount, submitted timestamp, 200 OK, UNDER REVIEW; Razorpay API JSON response; View Audit Trail / Back |
| 10 | screen-partial-extraction.pdf | `/disputes/:id/evidence-issue` | Partial Extraction (OCR) | Evidence processing issue; processing logs (upload→extract→no text→OCR→partial); confidence 62%; extracted content preview w/ garbled fields |
| 11 | screen-audit-trail.pdf | `/disputes/:id/audit` | Audit Trail | Filters (event type/date/actor); Export CSV/JSON; 13 event entries w/ badges + expandable JSON metadata |
| 12 | screen-empty-state.pdf | `/disputes` (empty) | Empty State | "No disputes yet"; Simulate webhook / Add manually; Connected to Razorpay test mode |

## Common App Shell (all screens)
- **Sidebar** (~248px, `#0f172a`): Logo "IQ DisputeIQ"; nav Overview / Disputes / Evidence / Activity; WORKSPACE → "Demo Environment"; Settings / Help & Docs; footer "Razorpay Test Mode" + "v1.4.2 Connected" + green dot.
- **Top bar** (white, ~64px): Breadcrumbs; amber DEMO MODE banner (non-dismissable); bell + "Niel Mandhare" + avatar.
- **Font:** Inter (system fallback). Stats numbers 800-weight ~48px.
- **Status colors:** blue `#2563eb` (submitted/active), amber (pending/review/demo), red/pink (missing/contradiction), green (verified/resolved), grey (processing).
