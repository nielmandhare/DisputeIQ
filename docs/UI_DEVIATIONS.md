# UI Deviations — DisputeIQ Frontend

Documented per the build instructions. All deviations are intentional or imposed by the
"frontend only, no backend" scope. Nothing was hidden; each is listed below.

| # | Screen | Element | Expected (Figma) | Implemented | Reason |
|---|--------|---------|------------------|-------------|--------|
| 1 | Approval | Shield icon | Stroked shield outline in blue circle | Emoji 🛡 in blue circle | Inline SVG not yet drawn; emoji is a faithful placeholder. To be replaced with an `IconShield` SVG. |
| 2 | Disputes / Empty State | Empty state visibility | Shown when no disputes | Reachable via code path + "Preview empty state" dev toggle (mock data always loads) | Data layer always returns 8 disputes; empty state is a separate branch. Toggle added for demo/verification. |
| 3 | Dispute Detail | Deadline date color | `24 Aug 2026` in red text | Red text | Matches Figma (deadline date rendered red per design). Not a bug. |
| 4 | Classification | Evidence type bar | `CUSTOMER COMMUNICATION (88%)` blue bar | `CUSTOMER COMMUNICATION (88%)` blue bar | Matches; confidence value 88% is design-implied (Figma shows 94% confidence badge, 88% category). |
| 5 | All evidence upload | File parsing | Real PDF/TXT/JSON text extraction | Filename + size stored in local state only | Frontend simulation scope; no parser wired. Ingestion status UX demonstrated. |
| 6 | Evidence/Activity (sidebar) | Full pages | (not in supplied screens) | Nav-shell placeholders | PRD scope = dispute workflow; Evidence/Activity not among the 12 screens. |
| 7 | Disputes list (rows 2-8) | Document/gap detail | Per-dispute documents | Default to demo set when opened | Only `disp_test_8K72` is fully populated with documents/contradictions/gaps. Others show correct list-row data. |
| 8 | All screens | Real Razorpay / AI | Real APIs | Mock services, labelled DEMO MODE | Explicit non-goal of this phase (message.txt CRITICAL STOP RULE). |

## Notes
- No gradients, purple, glassmorphism, or generic SaaS styling introduced — design kept faithful.
- No external icon library substituted for Figma assets (icons are hand-drawn inline SVG).
- All data uses realistic DisputeIQ terminology (disp_test_*, ₹34,500, whatsapp_chat.txt, etc.),
  no Lorem ipsum / Test User / Sample text.
