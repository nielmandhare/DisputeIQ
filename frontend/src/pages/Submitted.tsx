import { useParams, Link, useLocation } from 'react-router-dom';
import { disputeService, submissionService } from '../services/mockServices';
import { useEffect, useState } from 'react';
import { Dispute, SubmitResult } from '../types';

type LocState = { result?: SubmitResult };

export default function Submitted() {
  const { id = 'disp_test_8K72' } = useParams();
  const loc = useLocation();
  const [d, setD] = useState<Dispute | undefined>();
  const [result, setResult] = useState<SubmitResult | null>((loc.state as LocState | null)?.result ?? null);

  useEffect(() => {
    disputeService.getById(id).then(setD);
    if (!result) submissionService.getForDispute(id).then(setResult);
  }, [id]);

  if (!d) return <div className="muted">Loading…</div>;

  const status = result?.status ?? (d.submissionStatus as SubmitResult['status']) ?? 'SUBMITTED';
  const isSim = result?.mode === 'SIMULATED' || !result;
  const failed = status === 'SUBMISSION_FAILED';
  const unknown = status === 'SUBMISSION_REQUIRES_REVIEW';

  return (
    <div className="card card-pad" style={{ maxWidth: 620, margin: '20px auto', textAlign: 'center' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 16px', fontSize: 36,
        background: failed ? '#fee2e2' : unknown ? '#fef3c7' : '#dcfce7',
        color: failed ? '#dc2626' : unknown ? '#d97706' : '#16a34a',
      }}>{failed ? '✕' : unknown ? '?' : '✓'}</div>

      <div className="page-title" style={{ fontSize: 24 }}>
        {failed ? 'Submission failed' : unknown ? 'Submission status unknown' : 'Submission accepted'}
      </div>
      <div className="muted">
        {failed
          ? 'Razorpay rejected the contest. Review the reason and retry only when safe.'
          : unknown
            ? 'Razorpay may have received the request. We will reconcile the dispute before allowing another submission.'
            : isSim
              ? 'This was a SIMULATION. No request was sent to Razorpay.'
              : 'Your contest has been received by Razorpay.'}
      </div>

      <div style={{ marginTop: 10 }}>
        <span className={`badge ${isSim ? 'badge-grey' : 'badge-amber'}`}>{result?.mode ?? 'SIMULATED'} MODE</span>
      </div>

      <div style={{ textAlign: 'left', marginTop: 22, borderTop: '1px solid var(--card-border)' }}>
        <div className="kv"><span className="k">Dispute</span><span className="v mono">{d.id}</span></div>
        <div className="kv"><span className="k">Amount</span><span className="v">₹{d.amount.toLocaleString('en-IN')}</span></div>
        <div className="kv"><span className="k">Draft version</span><span className="v">{result?.draftVersion ?? (d.responseStatus === 'APPROVED' ? 'current' : '—')}</span></div>
        <div className="kv"><span className="k">Evidence uploaded</span><span className="v">{result?.evidenceUploaded?.length ?? (d.documents ?? []).length} files</span></div>
        <div className="kv"><span className="k">Razorpay status</span><span className="v">{result?.razorpayStatus ?? (isSim ? 'SIMULATED' : 'pending')}</span></div>
        <div className="kv"><span className="k">State</span>
          <span className="v">
            <span className={`badge ${failed ? 'badge-amber' : unknown ? 'badge-amber' : 'badge-blue'}`}>{status}</span>
          </span>
        </div>
        {failed && result?.errorText && (
          <div className="kv"><span className="k">Reason</span><span className="v" style={{ color: 'var(--red)' }}>{result.errorText}</span></div>
        )}
      </div>

      {isSim && !failed && !unknown && (
        <div className="card-title" style={{ textAlign: 'left', margin: '18px 0 8px' }}>Note (Simulation)</div>
      )}
      {isSim && !failed && !unknown && (
        <div className="code-block" style={{ textAlign: 'left', fontWeight: 500 }}>
          No external API call was made. Configure RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET + RAZORPAY_SUBMISSION_MODE=live to enable live submission.
        </div>
      )}

      <div className="row" style={{ justifyContent: 'center', marginTop: 18, gap: 12 }}>
        <Link to={`/disputes/${id}/audit`} className="btn btn-outline">View Audit Trail</Link>
        <Link to={`/disputes/${id}/dossier`} className="btn btn-outline">Back to Dossier</Link>
        <Link to="/disputes" className="btn btn-primary">Back to Disputes</Link>
      </div>
    </div>
  );
}
