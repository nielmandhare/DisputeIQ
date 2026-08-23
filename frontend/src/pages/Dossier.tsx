import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { disputeService, timelineService } from '../services/mockServices';
import { Dispute, TimelineEvent } from '../types';

function humanizeType(t: string) {
  return t.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}
function dateLabel(e: TimelineEvent) {
  if (e.date) return e.time ? `${e.date} · ${e.time}` : e.date;
  return 'Undated';
}

export default function Dossier() {
  const { id = 'disp_test_8K72' } = useParams();
  const [d, setD] = useState<Dispute | undefined>();
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [raw, setRaw] = useState(false);
  useEffect(() => { disputeService.getById(id).then(setD); }, [id]);
  useEffect(() => { timelineService.listForDispute(id).then(setTimeline); }, [id]);
  if (!d) return <div className="muted">Loading…</div>;

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
        {timeline.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>No grounded timeline events extracted yet for this dispute's evidence.</div>
        )}
        {timeline.map((e) => (
          <div key={e.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--row-divider)' }}>
            <div className="row between" style={{ gap: 12 }}>
              <div style={{ fontWeight: 600, flex: 1 }}>
                <span className="badge badge-blue" style={{ marginRight: 8 }}>{humanizeType(e.eventType)}</span>
                <span className="muted" style={{ fontSize: 12 }}>{dateLabel(e)}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge badge-grey">{e.actor ? e.actor.toUpperCase() : 'UNKNOWN ACTOR'}</span>
                <span style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 600 }}>{e.confidence.toFixed(0)}% conf</span>
              </div>
            </div>
            <div style={{ marginTop: 4, fontSize: 14 }}>{e.description}</div>
            <div className="link-blue mono" style={{ fontSize: 12, marginTop: 3 }}>
              {e.sourceDocument}{e.sourceLocation ? ` · ${e.sourceLocation}` : ''} · {e.datePrecision}
            </div>
          </div>
        ))}

        <div className="divider" />
        <div className="card-title" style={{ marginBottom: 8, color: 'var(--orange-text)' }}>IV. Unresolved Contradictions</div>
        <div style={{ color: 'var(--orange-text)' }}>
          {((d.contradictions ?? []).length > 0) ? (
            <>
              {(d.contradictions ?? []).length} confirmed inconsistency detected between {(d.contradictions ?? [])[0].sourceA} and {(d.contradictions ?? [])[0].sourceB}. This file has been flagged in the submission payload for network operations manual review.
              <div style={{ marginTop: 10 }}>
                <Link to={`/disputes/${id}/contradiction`} className="link-blue" style={{ fontWeight: 600 }}>Investigate contradiction →</Link>
              </div>
            </>
          ) : (
            <span>No unresolved contradictions detected across the submitted evidence.</span>
          )}
        </div>
      </div>
    </>
  );
}
