import { useState } from 'react';

const DOCS = [
  { icon: '📘', title: 'Getting Started', sub: 'Connect Razorpay, ingest your first dispute, and submit a contest.' },
  { icon: '🧠', title: 'AI Classification', sub: 'How documents are classified, scored, and cross-referenced.' },
  { icon: '⚠️', title: 'Contradiction Engine', sub: 'Understanding timeline and logic conflict detection.' },
  { icon: '📊', title: 'Evidence Readiness Score', sub: 'The ERS formula, required vs recommended evidence, win-rate.' },
  { icon: '🔌', title: 'API Reference', sub: 'Disputes API, Documents API, and webhook event payloads.' },
  { icon: '🛡️', title: 'Submission & Compliance', sub: 'What happens when you approve & submit to Razorpay.' },
];

const FAQS = [
  { q: 'What is DisputeIQ?', a: 'DisputeIQ is an AI-assisted dispute management workspace for Razorpay merchants. It ingests dispute evidence, classifies documents, detects contradictions, scores evidence readiness, and prepares a submission-ready dossier.' },
  { q: 'Is this using real Razorpay data?', a: 'Inbound Razorpay webhooks are simulated in this demo (no live keys). Evidence upload and PDF/TXT/JSON text extraction run on the real backend. Once real Razorpay test-mode keys are added, the webhook path uses the same verified pipeline.' },
  { q: 'How is the Evidence Readiness Score calculated?', a: 'ERS = (required evidence present × weight) + (recommended evidence complete × weight) − (contradiction penalty). It is a predictive indicator, not a guarantee of outcome. A full breakdown is shown on each dispute’s detail and gaps screens.' },
  { q: 'What does a detected contradiction mean?', a: 'The AI found a timeline or logic conflict between two documents — for example a return initiated (March 12) before a delivery was confirmed (March 15). You should investigate and either attach a clarifying communication or mark it reviewed with a merchant memo.' },
  { q: 'Can I export the audit trail?', a: 'Yes. The Audit Trail screen supports exporting the full event log as CSV or JSON for compliance records.' },
  { q: 'Does DisputeIQ submit disputes automatically?', a: 'No. Submission requires explicit human approval. On the Approval screen you must check the acknowledgment box, then Approve & Submit — this mirrors Razorpay’s requirement that the merchant owns the evidence.' },
];

export default function HelpDocs() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <div className="page-title" style={{ fontSize: 24 }}>Help & Docs</div>
      <div className="page-sub">Guides, FAQ, and keyboard shortcuts for DisputeIQ.</div>

      <div className="card-title" style={{ marginTop: 22 }}>Documentation</div>
      <div className="doc-grid">
        {DOCS.map((d) => (
          <a key={d.title} className="doc-card" href="#">
            <div className="doc-title"><span className="doc-icon">{d.icon}</span>{d.title}</div>
            <div className="doc-sub">{d.sub}</div>
          </a>
        ))}
      </div>

      <div className="card-title" style={{ marginTop: 26 }}>Frequently Asked Questions</div>
      <div>
        {FAQS.map((f, i) => (
          <div key={f.q} className={`faq-item ${open === i ? 'open' : ''}`}>
            <button className="faq-q" onClick={() => setOpen(open === i ? null : i)}>
              <span>{f.q}</span>
              <span className="faq-chev">▾</span>
            </button>
            {open === i && <div className="faq-a">{f.a}</div>}
          </div>
        ))}
      </div>

      <div className="card-title" style={{ marginTop: 26 }}>Keyboard Shortcuts</div>
      <div className="card card-pad">
        <div className="setting-row"><span className="kv"><b>g</b> then <b>o</b></span><span className="muted">Go to Overview</span></div>
        <div className="setting-row"><span className="kv"><b>g</b> then <b>d</b></span><span className="muted">Go to Disputes</span></div>
        <div className="setting-row"><span className="kv"><b>/</b></span><span className="muted">Focus search</span></div>
        <div className="setting-row" style={{ borderBottom: 'none' }}><span className="kv"><b>?</b></span><span className="muted">Open this help</span></div>
      </div>

      <div className="card-title" style={{ marginTop: 26 }}>Support</div>
      <div className="card card-pad row between wrap" style={{ gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>Still need help?</div>
          <div className="muted" style={{ fontSize: 13 }}>Reach the DisputeIQ team or browse the Razorpay dispute docs.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn btn-ghost" href="#">Razorpay Docs ↗</a>
          <a className="btn btn-primary" href="#">Contact Support</a>
        </div>
      </div>
    </>
  );
}
