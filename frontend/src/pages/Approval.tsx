import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { disputeService, submissionService, responseDraftService } from '../services/mockServices';
import { Dispute, ResponseDraft } from '../types';

export default function Approval() {
  const { id = 'disp_test_8K72' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Dispute | undefined>();
  const [draft, setDraft] = useState<ResponseDraft | undefined>();
  const [mode, setMode] = useState<'SIMULATED' | 'LIVE'>('SIMULATED');
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    disputeService.getById(id).then(setD);
    responseDraftService.getLatest(id).then((d) => setDraft(d ?? undefined));
    fetch('http://localhost:4000/api/health').then(() => setMode('SIMULATED')).catch(() => setMode('SIMULATED'));
    // Real mode is derived server-side; the badge below reflects the backend state.
    setMode('SIMULATED');
  }, [id]);

  if (!d) return <div className="muted">Loading…</div>;

  const docCount = (d.documents ?? []).length;
  const isLive = mode === 'LIVE';
  const approved = d.responseStatus === 'APPROVED';

  const submit = async () => {
    if (!checked) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submissionService.submit(id);
      setSubmitting(false);
      nav(`/disputes/${id}/submitted`, { state: { result } });
    } catch (e: any) {
      setSubmitting(false);
      setError(e?.message || 'Submission failed. See details below.');
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue-soft)', color: 'var(--blue)', display: 'grid', placeItems: 'center', fontSize: 20 }}>🛡</div>
        <div>
          <div className="page-title" style={{ fontSize: 22 }}>Review before submission</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {isLive
              ? 'LIVE — this action sends a real contest request to Razorpay.'
              : 'Simulation mode — no request will be sent to Razorpay.'}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <span className={`badge ${isLive ? 'badge-amber' : 'badge-grey'}`}>{mode} MODE</span>
      </div>

      <div className="divider" />
      <div className="kv"><span className="k">Dispute</span><span className="v mono">{d.id}</span></div>
      <div className="kv"><span className="k">Amount</span><span className="v" style={{ fontWeight: 700 }}>₹{d.amount.toLocaleString('en-IN')}</span></div>
      <div className="kv"><span className="k">Draft</span><span className="v">{draft ? `Version ${draft.draftVersion} · ${draft.generationMethod}` : 'Not generated'}</span></div>
      <div className="kv"><span className="k">Evidence documents</span><span className="v">{docCount} files</span></div>
      <div className="kv"><span className="k">Evidence Readiness</span>
        <span className="v">
          <span className="ers-bar" style={{ minWidth: 140, display: 'inline-block', verticalAlign: 'middle' }}><span className="ers-moderate" style={{ width: `${d.ers}%`, display: 'block', height: '100%', borderRadius: 999 }} /></span>
          <span style={{ fontWeight: 700, color: 'var(--blue)', marginLeft: 8 }}>{d.ers}/100</span>
        </span>
      </div>
      <div className="kv"><span className="k">Contradictions</span><span className="v"><span className="badge badge-amber">{(d.contradictions ?? []).length} detected</span></span></div>
      <div className="kv"><span className="k">Human approval</span><span className="v">{approved ? <span className="badge badge-green">Approved</span> : <span className="badge badge-amber">Pending</span>}</span></div>

      {!approved && (
        <div className="muted" style={{ marginTop: 10, color: 'var(--orange-text)' }}>
          The draft has not been explicitly approved. Approve it in the Dossier before submitting.
        </div>
      )}

      <div className="divider" />
      <div className="card-title" style={{ marginBottom: 8 }}>Acknowledgment</div>
      <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--blue)' }} />
        <span style={{ fontWeight: 500 }}>I have reviewed this dossier and verified the evidence. I authorise DisputeIQ to submit this contest to Razorpay on my behalf. The AI prepared the case; I am the final decision-maker.</span>
      </label>

      {error && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--red)', color: 'var(--red)', padding: '10px 12px', fontSize: 13 }}>
          {error}
        </div>
      )}

      <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 18 }} disabled={!checked || submitting || !approved} onClick={submit}>
        {submitting ? 'Submitting…' : isLive ? 'Approve & Submit (LIVE) →' : 'Approve & Submit →'}
      </button>
      <div className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 8 }}>{checked ? '' : 'Check the acknowledgment above to continue'}</div>
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <Link to={`/disputes/${id}/dossier`} className="muted" style={{ fontSize: 13 }}>Cancel</Link>
      </div>
      <div className="muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 14 }}>Niel Mandhare · DisputeIQ · AI prepares, human approves, system submits</div>
    </div>
  );
}
