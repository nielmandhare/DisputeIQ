import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { disputeService, submissionService } from '../services/mockServices';
import { useEffect } from 'react';
import { Dispute } from '../types';

export default function Approval() {
  const { id = 'disp_test_8K72' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Dispute | undefined>();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { disputeService.getById(id).then(setD); }, [id]);
  if (!d) return <div className="muted">Loading…</div>;

  const docCount = (d.documents ?? []).length;

  const submit = async () => {
    if (!checked) return;
    setSubmitting(true);
    await submissionService.submit(id);
    setSubmitting(false);
    nav(`/disputes/${id}/submitted`);
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-soft)', color: 'var(--blue)', display: 'grid', placeItems: 'center', fontSize: 20 }}>🛡</div>
        <div>
          <div className="page-title" style={{ fontSize: 22 }}>Review before submission</div>
          <div className="muted" style={{ fontSize: 13 }}>This action will submit your dispute contest to Razorpay. It cannot be undone.</div>
        </div>
      </div>

      <div className="divider" />
      <div className="kv"><span className="k">Dispute</span><span className="v mono">{d.id}</span></div>
      <div className="kv"><span className="k">Amount</span><span className="v" style={{ fontWeight: 700 }}>₹{d.amount.toLocaleString('en-IN')}</span></div>
      <div className="kv"><span className="k">Evidence documents</span><span className="v">{docCount} files</span></div>
      <div className="kv"><span className="k">Evidence Readiness</span>
        <span className="v">
          <span className="ers-bar" style={{ minWidth: 140, display: 'inline-block', verticalAlign: 'middle' }}><span className="ers-moderate" style={{ width: `${d.ers}%`, display: 'block', height: '100%', borderRadius: 999 }} /></span>
          <span style={{ fontWeight: 700, color: 'var(--blue)', marginLeft: 8 }}>{d.ers}/100</span>
        </span>
      </div>
      <div className="kv"><span className="k">Contradictions</span><span className="v"><span className="badge badge-amber">{(d.contradictions ?? []).length} detected</span></span></div>

      <div className="divider" />
      <div className="card-title" style={{ marginBottom: 8 }}>Acknowledgment</div>
      <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--blue)' }} />
        <span style={{ fontWeight: 500 }}>I have reviewed this dossier and verified the evidence. I authorise DisputeIQ to submit this contest to Razorpay on my behalf.</span>
      </label>

      <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 18 }} disabled={!checked || submitting} onClick={submit}>
        {submitting ? 'Submitting…' : 'Approve & Submit →'}
      </button>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 8 }}>{checked ? '' : 'Check the acknowledgment above to continue'}</div>
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <Link to={`/disputes/${id}/dossier`} className="muted" style={{ fontSize: 13 }}>Cancel</Link>
      </div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 14 }}>Niel Mandhare · 22 Aug 2026 · 6:41 PM</div>
    </div>
  );
}
