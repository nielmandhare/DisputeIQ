# Screen Flow — DisputeIQ Frontend

```
Overview  (/overview)
   └─> Disputes  (/disputes)   [+ Empty State when no disputes]
          │  click row
          ▼
   Dispute Detail  (/disputes/:id)   ← hub, 3-column working view
          │  tab/section navigation
          ├─> AI Classification        (/disputes/:id/classification)
          ├─> Contradiction            (/disputes/:id/contradiction)
          ├─> Evidence Gap Analysis    (/disputes/:id/gaps)
          ├─> Dossier Preview          (/disputes/:id/dossier)
          │       └─> Approval         (/disputes/:id/approval)
          │               └─> Submission Success  (/disputes/:id/submitted)
          │                       └─> Audit Trail
          ├─> Partial Extraction / Evidence Issue  (/disputes/:id/evidence-issue)
          └─> Audit Trail              (/disputes/:id/audit)

Cross-links:
  Dispute Detail "Review & Submit ->"  -> Dossier -> Approval -> Submitted
  Contradiction "Back to evidence overview" -> Dispute Detail
  Submission Success "View Audit Trail" -> Audit Trail
  Any dispute row on list -> Dispute Detail
  Sidebar "Overview" -> /overview, "Disputes" -> /disputes
```

## Workflow states demonstrated (mock)
RECEIVED → CONTEXT_LOADED → AWAITING_EVIDENCE → PROCESSING → ANALYSIS_COMPLETE →
PENDING_REVIEW → APPROVED → UPLOADING_DOCUMENTS → SUBMITTED → UNDER_REVIEW

Primary demo dispute: `disp_test_8K72` (non_receipt_of_goods, ₹34,500, 36h remaining).
ERS = 82/100; 1 confirmed chronological contradiction (return_form.pdf Mar 12 vs delivery_confirmation.pdf Mar 15).
OCR-failure demo doc: `evidence_03.pdf` (partial extraction, 62% confidence).
