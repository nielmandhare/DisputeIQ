import { useParams, Link } from 'react-router-dom';
import { disputeService } from '../services/mockServices';
import { useEffect, useState } from 'react';
import { Dispute } from '../types';

export default function Submitted() {
  const { id = 'disp_test_8K72' } = useParams();
  const [d, setD] = useState<Dispute | undefined>();
  useEffect(() => { disputeService.getById(id).then(setD); }, [id]);
  if (!d) return <div className="muted">Loading…</div>;

  return (
    <div className="card card-pad" style={{ maxWidth: 620, margin: '20px auto', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', margin: '0 auto 16px', fontSize: 36, color: '#16a34a' }}>✓</div>
      <div className="page-title" style={{ fontSize: 24 }}>Dispute submitted successfully</div>
      <div className="muted">Your contest has been received by Razorpay.</div>

      <div style={{ textAlign: 'left', marginTop: 22, borderTop: '1px solid var(--card-border)' }}>
        <div className="kv"><span className="k">Dispute</span><span className="v mono">{d.id}</span></div>
        <div className="kv"><span className="k">Amount</span><span className="v">₹{d.amount.toLocaleString('en-IN')}</span></div>
        <div className="kv"><span className="k">Submitted</span><span className="v">22 Aug 2026 6:42 PM</span></div>
        <div className="kv"><span className="k">Razorpay response</span><span className="v"><span className="badge badge-green">200 OK</span></span></div>
        <div className="kv"><span className="k">Status</span><span className="v"><span className="badge badge-blue">UNDER REVIEW</span></span></div>
      </div>

      <div className="card-title" style={{ textAlign: 'left', margin: '18px 0 8px' }}>Razorpay API Response</div>
      <div className="code-block" style={{ textAlign: 'left' }}>
{`{
  "status": 200,
  "dispute_id": "${d.id}",
  "contest_submitted_at": "2026-08-22T13:12:00Z",
  "evidence_count": ${(d.documents ?? []).length}
}`}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 18, gap: 12 }}>
        <Link to={`/disputes/${id}/audit`} className="btn btn-outline">View Audit Trail</Link>
        <Link to="/disputes" className="btn btn-primary">Back to Disputes</Link>
      </div>
    </div>
  );
}
