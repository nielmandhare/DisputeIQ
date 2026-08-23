import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { disputeService, timelineService, responseDraftService } from '../services/mockServices';
import { Dispute, TimelineEvent, ResponseDraft } from '../types';

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
  const [draft, setDraft] = useState<ResponseDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [raw, setRaw] = useState(false);
  useEffect(() => { disputeService.getById(id).then(setD); }, [id]);
  useEffect(() => { timelineService.listForDispute(id).then(setTimeline); }, [id]);
  useEffect(() => { responseDraftService.getLatest(id).then(setDraft); }, [id]);

  const generate = async () => {
    setGenerating(true);
    try { setDraft(await responseDraftService.generate(id)); } finally { setGenerating(false); }
  };
  const approve = async () => {
    setApproving(true);
    try { setDraft(await responseDraftService.approve(id)); } finally { setApproving(false); }
  };

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
              <span className={`badge ${d.ers >= 70 ? 'badge-green' : 'badge-orange'}`}>{d.ers >= 70 ? 'READY FOR SUBMISSION' : 'NEEDS MORE EVIDENCE'}</span>
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
  "evidence_readiness_score": ${d.ersBreakdown?.score ?? d.ers}
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
        <div className="card-title" style={{ marginBottom: 8 }}>IV. Unresolved Contradictions</div>
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

        <div className="divider" />
        <div className="card-title" style={{ marginBottom: 8 }}>V. AI-Generated Response Draft</div>
        {!draft && (
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 13 }}>No draft generated yet. The draft is assembled only from the verified evidence above.</span>
            <button className="btn btn-primary" onClick={generate} disabled={generating}>{generating ? 'Generating…' : 'Generate Response'}</button>
          </div>
        )}
        {draft && (
          <div>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className={`badge ${draft.status === 'DRAFT_APPROVED' ? 'badge-green' : 'badge-blue'}`}>
                  {draft.status === 'DRAFT_APPROVED' ? 'Human-Approved' : draft.status === 'DRAFT_READY' ? 'Ready for review' : 'Review required'}
                </span>
                <span className="badge badge-grey">{draft.generationMethod}{draft.fallbackUsed ? ' (heuristic fallback)' : ''}{draft.metrics ? ` · ${draft.metrics.coverage}% grounded` : ''}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost" onClick={generate} disabled={generating}>{generating ? 'Regenerating…' : 'Regenerate'}</button>
                {draft.status !== 'DRAFT_APPROVED' && (
                  <button className="btn btn-primary" onClick={approve} disabled={approving}>{approving ? 'Approving…' : 'Approve Draft'}</button>
                )}
              </div>
            </div>
            <DraftSection title="Dispute Summary" section={draft.draft.summary} />
            <DraftSection title="Merchant Position" section={draft.draft.merchantPosition} />
            <div className="card-title" style={{ margin: '14px 0 6px', fontSize: 14 }}>Chronology</div>
            {draft.draft.chronology.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No timeline events available to summarize.</div>}
            {draft.draft.chronology.map((c, i) => (
              <div key={c.eventId || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--row-divider)' }}>
                <div style={{ fontWeight: 600 }}>{c.text}</div>
                <SourceChips sources={c.sources} />
              </div>
            ))}
            <div className="card-title" style={{ margin: '14px 0 6px', fontSize: 14 }}>Supporting Evidence</div>
            {draft.draft.supportingEvidence.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No classified evidence to cite.</div>}
            {draft.draft.supportingEvidence.map((s, i) => (
              <div key={s.documentId || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--row-divider)' }}>
                <div style={{ fontWeight: 600 }}>{s.reason}</div>
                <SourceChips sources={s.sources} />
              </div>
            ))}
            {draft.draft.contradictions.length > 0 && (
              <>
                <div className="card-title" style={{ margin: '14px 0 6px', fontSize: 14, color: 'var(--orange-text)' }}>Contradictions / Relevant Findings</div>
                {draft.draft.contradictions.map((c, i) => (
                  <div key={c.contradictionId || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--row-divider)', color: 'var(--orange-text)' }}>
                    <div>{c.text}</div>
                    <SourceChips sources={c.sources} />
                  </div>
                ))}
              </>
            )}
            {draft.draft.evidenceGaps.length > 0 && (
              <>
                <div className="card-title" style={{ margin: '14px 0 6px', fontSize: 14 }}>Evidence Gaps</div>
                {draft.draft.evidenceGaps.map((g, i) => (
                  <div key={i} style={{ padding: '6px 0', color: 'var(--orange-text)' }}>{g.text}</div>
                ))}
              </>
            )}
            <DraftSection title="Requested Resolution" section={draft.draft.requestedResolution} />
            <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
              Generated by DisputeIQ from verified evidence. The human remains the final decision-maker; approval does not submit to Razorpay (submission is a separate step).
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SourceChips({ sources }: { sources: { documentId?: string | null; sourceDocument?: string | null; sourceLocation?: string | null }[] }) {
  if (!sources || sources.length === 0) return <span className="muted" style={{ fontSize: 11 }}>[no source]</span>;
  return (
    <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
      {sources.map((s, i) => (
        <span key={i} className="badge badge-grey" style={{ fontSize: 11 }}>
          {s.sourceDocument || 'evidence'} {s.sourceLocation ? `· ${s.sourceLocation}` : ''}
        </span>
      ))}
    </div>
  );
}

function DraftSection({ title, section }: { title: string; section: { text: string; sources: { documentId?: string | null; sourceDocument?: string | null; sourceLocation?: string | null }[] } }) {
  return (
    <div style={{ margin: '12px 0' }}>
      <div className="card-title" style={{ fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14 }}>{section.text}</div>
      <SourceChips sources={section.sources} />
    </div>
  );
}
