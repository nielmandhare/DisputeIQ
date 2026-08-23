import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { contradictionService } from '../services/mockServices';
import { Contradiction } from '../types';

export default function ContradictionPage() {
  const { id = 'disp_test_8K72' } = useParams();
  const [list, setList] = useState<Contradiction[]>([]);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  useEffect(() => { contradictionService.listForDispute(id).then(setList); }, [id]);

  const c = list[0];

  return (
    <>
      <div className="actionbar">
        <Link to={`/disputes/${id}`} className="link-blue" style={{ fontWeight: 600 }}>← Back to evidence overview</Link>
      </div>

      {c && (
        <div className="card card-pad" style={{ maxWidth: 880 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="ai" style={{ color: '#dc2626' }}>⚠</span>
              <span className="page-title" style={{ fontSize: 22 }}>Chronological Inconsistency Identified</span>
            </div>
            <span className="badge badge-red">CONFLICT DETECTED</span>
          </div>
          <p className="muted" style={{ fontSize: 14 }}>
            The AI Analysis module has cross-referenced the submitted documents and identified a timeline conflict between the delivery confirmation receipt and the customer return form.
          </p>

          <div className="row" style={{ gap: 16, marginTop: 18, alignItems: 'stretch' }}>
            <div className="card card-pad" style={{ flex: 1, border: '1px solid var(--green-border)' }}>
              <div className="card-title" style={{ color: 'var(--green-text)' }}>Document A: Delivery Confirmed</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 8 }}>March 15</div>
              <div className="muted">2:43 PM</div>
              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Source Evidence File</div>
              <div className="link-blue mono" style={{ fontSize: 13 }}>{c.sourceA} • Page 2</div>
            </div>

            <div style={{ display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--amber-bg)', color: 'var(--amber-text)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>VS</div>
            </div>

            <div className="card card-pad" style={{ flex: 1, border: '1px solid var(--red-border)' }}>
              <div className="card-title" style={{ color: 'var(--red-text)' }}>Document B: Return Initiated</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 8 }}>March 12</div>
              <div className="muted">10:14 AM</div>
              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Source Evidence File</div>
              <div className="link-blue mono" style={{ fontSize: 13 }}>{c.sourceB} • Page 1</div>
            </div>
          </div>

          <div className="alert alert-orange" style={{ marginTop: 18 }}>
            <span><strong style={{ color: 'var(--orange-text)' }}>WHY THIS MATTERS</strong><br />{c.explanation}</span>
          </div>
          <div className="alert alert-blue" style={{ marginTop: 12 }}>
            <span><strong>WHAT TO DO</strong><br />{c.recommendedAction}</span>
          </div>

          <div className="row" style={{ marginTop: 20, gap: 12 }}>
            <button className="btn btn-primary" disabled={reviewed[c.id]} onClick={() => setReviewed((p) => ({ ...p, [c.id]: true }))}>
              {reviewed[c.id] ? '✓ Marked as Reviewed' : 'Mark Contradiction as Reviewed'}
            </button>
            <button className="btn btn-ghost">View Source Documents</button>
          </div>

          <div className="muted" style={{ fontSize: 11, marginTop: 16 }}>
            Disclaimer: DisputeIQ highlights potential timeline and logic contradictions based on document extraction. Merchants assume final responsibility for evidence validity prior to Razorpay API submission.
          </div>
        </div>
      )}
    </>
  );
}
