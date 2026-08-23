import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { disputeService } from '../services/mockServices';
import { Dispute } from '../types';

export default function Dossier() {
  const { id = 'disp_test_8K72' } = useParams();
  const [d, setD] = useState<Dispute | undefined>();
  const [raw, setRaw] = useState(false);
  useEffect(() => { disputeService.getById(id).then(setD); }, [id]);
  if (!d) return <div className="muted">Loading…</div>;

  const facts = (d.documents ?? []).flatMap((doc) => (doc.facts ?? []).map((f) => ({ ...f, doc: doc.fileName })));

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between">
          <div>
            <div className="card-title">Dispute Dossier Payload</div>
            <div className="muted" style={{ fontSize: 13 }}>Generated directly from verified merchant evidence records.</div>
            <div className="row" style={{ marginTop: 10, gap: 12 }}>
              <span className="check" style={{ fontWeight: 700 }}>Evidence score {d.ers}/100</span>
              <span className="badge badge-green">READY FOR SUBMISSION</span>
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-ghost" onClick={() => setRaw((r) => !r)}>{raw ? 'Hide raw payload' : 'Show raw payload'}</button>
            <Link to={`/disputes/${id}/approval`} className="btn btn-primary">Approve &amp; Submit →</Link>
          </div>
        </div>
      </div>

      {raw && (
        <div className="code-block" style={{ marginBottom: 16 }}>
{`{
  "dispute_id": "${d.id}",
  "reason_code": "${d.reasonCode}",
  "amount": ${d.amount},
  "evidence_documents": [${(d.documents ?? []).map((x) => `"${x.fileName}"`).join(', ')}],
  "contradictions": ${(d.contradictions ?? []).length},
  "evidence_readiness_score": ${d.ers}
}`}
        </div>
      )}

      <div className="card card-pad">
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.04em' }}>DISPUTE INVESTIGATION DOSSIER</div>
        <div className="divider" />

        <div className="card-title" style={{ marginBottom: 8 }}>I. Dispute Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
          <div className="kv"><span className="k">Dispute ID</span><span className="v mono">{d.id}</span></div>
          <div className="kv"><span className="k">Associated Payment</span><span className="v mono">{d.paymentContext?.paymentId}</span></div>
          <div className="kv"><span className="k">Disputed Reason</span><span className="v">{d.reasonLabel}</span></div>
          <div className="kv"><span className="k">Chargeback Amount</span><span className="v">₹{d.amount.toLocaleString('en-IN')} INR</span></div>
          <div className="kv"><span className="k">Submission Date</span><span className="v">{d.deadlineDate}</span></div>
          <div className="kv"><span className="k">Merchant Workspace</span><span className="v">Razorpay Test Environment</span></div>
        </div>

        <div className="divider" />
        <div className="card-title" style={{ marginBottom: 8 }}>II. Index of Submitted Evidence</div>
        {(d.documents ?? []).map((doc) => (
          <div key={doc.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--row-divider)' }}>
            <div>
              <span className="mono" style={{ fontWeight: 600 }}>{doc.fileName}</span>
              <span className="badge badge-grey" style={{ marginLeft: 10 }}>{doc.badgeLabel}</span>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <span className="muted" style={{ fontSize: 12 }}>{doc.size}</span>
              <span className="check">✓ Verified</span>
            </div>
          </div>
        ))}

        <div className="divider" />
        <div className="card-title" style={{ marginBottom: 8 }}>III. Timeline and Key Fact Extractions</div>
        {facts.map((f) => (
          <div key={f.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--row-divider)' }}>
            <div style={{ fontWeight: 500 }}>“{f.claim}”</div>
            <div className="link-blue mono" style={{ fontSize: 12, marginTop: 3 }}>{f.doc} · {f.sourceLocation} · confidence {f.confidence * 100}%</div>
          </div>
        ))}

        <div className="divider" />
        <div className="card-title" style={{ marginBottom: 8, color: 'var(--orange-text)' }}>IV. Unresolved Contradictions</div>
        <div style={{ color: 'var(--orange-text)' }}>
          {(d.contradictions ?? []).length} Confirmed chronological inconsistency detected between {d.contradictions?.[0].sourceA} and {d.contradictions?.[0].sourceB}. This file has been flagged in the submission payload for network operations manual review.
          <div style={{ marginTop: 10 }}>
            <Link to={`/disputes/${id}/contradiction`} className="link-blue" style={{ fontWeight: 600 }}>Investigate contradiction →</Link>
          </div>
        </div>
      </div>
    </>
  );
}
