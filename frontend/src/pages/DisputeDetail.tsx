import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { disputeService, evidenceService, contradictionService } from '../services/mockServices';
import ErsGauge, { ConfidenceBar } from '../components/ErsGauge';
import { StatusBadge } from '../components/StatusBadge';
import { Alert } from '../components/Alert';
import { IconCheck } from '../components/Icons';
import { Dispute, EvidenceDocument, Contradiction } from '../types';

const INGESTION_STEPS = ['Extracting text', 'Classifying metadata', 'Extracting factual timeline', 'Validating cross-citations'];

function humanizeType(t?: string): string {
  if (!t) return 'Unclassified';
  return t.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}

export default function DisputeDetail() {
  const { id = 'disp_test_8K72' } = useParams();
  const nav = useNavigate();
  const [dispute, setDispute] = useState<Dispute | undefined>();
  const [docs, setDocs] = useState<EvidenceDocument[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    disputeService.getById(id).then(setDispute);
    evidenceService.listForDispute(id).then(setDocs);
    contradictionService.listForDispute(id).then(setContradictions);
  }, [id]);

  if (!dispute) return <div className="muted">Loading dispute…</div>;

  const d = dispute;
  // ERS card is intentionally left as designed (score not recomputed in this slice).
  const ers = d.ersBreakdown ?? { score: d.ers, label: d.ers >= 85 ? 'Strong' : d.ers >= 65 ? 'Moderate' : d.ers >= 40 ? 'Weak' : 'Incomplete', requiredPresent: 0, requiredTotal: 0, recommendedComplete: 0, recommendedTotal: 0, contradictionsFound: contradictions.length || d.contradictions?.length || 0 };
  const hasContradiction = contradictions.length > 0;

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    await evidenceService.upload(id, Array.from(e.target.files));
    // Re-fetch the real backend evidence list to reflect processing status.
    const refreshed = await evidenceService.listForDispute(id);
    setDocs(refreshed);
    setUploading(false);
    if (e.target) e.target.value = '';
  };

  const onReclassify = async (evId: string) => {
    const updated = await evidenceService.reclassify(evId);
    if (updated) {
      setDocs((prev) => prev.map((doc) => (doc.id === evId ? { ...doc, ...updated } : doc)));
    }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <Link to="/disputes" className="link-blue" style={{ fontWeight: 600 }}>← Disputes</Link>
      </div>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="page-title" style={{ fontSize: 30 }}>{d.reasonLabel.toUpperCase()}</div>
          <div className="row" style={{ marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
            <span className="muted mono">Dispute ID: {d.id}</span>
            <span className="link-blue mono" style={{ fontWeight: 700 }}>₹{d.amount.toLocaleString('en-IN')}</span>
            <span className="badge badge-amber">⏱ {d.deadlineText}</span>
            <StatusBadge status={d.status} />
          </div>
        </div>
        <div className="row">
          <button className="btn btn-ghost">Cancel</button>
          <Link to={`/disputes/${id}/dossier`} className="btn btn-primary">Review &amp; Submit →</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 320px', gap: 20, marginTop: 22, alignItems: 'start' }}>
        {/* LEFT: context panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>Dispute Details</div>
            <div className="kv"><span className="k">Reason Code</span><span className="v mono">{d.reasonCode}</span></div>
            <div className="kv"><span className="k">Disputed Amount</span><span className="v">₹{d.amount.toLocaleString('en-IN')} INR</span></div>
            <div className="kv"><span className="k">Deadline</span><span className="v" style={{ color: '#dc2626' }}>{d.deadlineDate}</span></div>
          </div>
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>Payment Context</div>
            <div className="kv"><span className="k">Payment ID</span><span className="v mono">{d.paymentContext?.paymentId ?? 'pay_test_KP48z2M'}</span></div>
            <div className="kv"><span className="k">Order ID</span><span className="v mono">{d.paymentContext?.orderId ?? 'ord_test_8X2kL90'}</span></div>
            <div className="kv"><span className="k">Timestamp</span><span className="v">{d.paymentContext?.timestamp ?? '22 Aug 11:34 AM'}</span></div>
            <div className="kv"><span className="k">Method</span><span className="v">{d.paymentContext?.method ?? 'UPI'}</span></div>
          </div>
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>Customer</div>
            <div className="kv"><span className="k">Name</span><span className="v">{d.customer}</span></div>
            <div className="kv"><span className="k">Email</span><span className="v mono" style={{ fontSize: 13 }}>{d.customerEmail ?? 'customer@email.com'}</span></div>
          </div>
        </div>

        {/* CENTER: evidence + AI analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad">
            <div className="card-title-row">
              <span className="card-title">Evidence Documents · {docs.length} documents · {docs.filter((x) => x.ingestionStatus === 'EXTRACTED').length} ready</span>
              <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                + Add Evidence
                <input type="file" multiple hidden onChange={onUpload} />
              </label>
            </div>
            {docs.map((doc) => (
              <div key={doc.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--row-divider)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{doc.fileName}</div>
                    <div className="row" style={{ marginTop: 4, gap: 8, flexWrap: 'wrap' }}>
                      <span className="badge badge-blue">{humanizeType(doc.evidenceType) || doc.badgeLabel}</span>
                      {doc.classificationSource && (
                        <span className="badge badge-grey" title="Classification engine">{doc.classificationSource}</span>
                      )}
                      <span className="muted" style={{ fontSize: 12 }}>{doc.size}</span>
                    </div>
                    {doc.contentPreview && doc.contentPreview.length > 0 && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6, maxWidth: 520 }}>
                        {doc.contentPreview[0].slice(0, 160)}
                      </div>
                    )}
                    {doc.ingestionStatus === 'EXTRACTION_FAILED' && (
                      <div className="badge badge-red" style={{ marginTop: 6 }}>Unable to extract — {doc.statusLabel}</div>
                    )}
                    {doc.ingestionStatus === 'OCR_REQUIRED' && (
                      <div className="badge badge-orange" style={{ marginTop: 6 }}>OCR required — PDF appears image-only</div>
                    )}
                  </div>
                  <div className="row" style={{ gap: 14 }}>
                    {doc.confidence != null && <ConfidenceBar value={doc.confidence} />}
                    <span className={`badge ${doc.ingestionStatus === 'EXTRACTION_FAILED' ? 'badge-red' : doc.ingestionStatus === 'OCR_REQUIRED' ? 'badge-orange' : doc.ingestionStatus === 'EXTRACTED' ? 'badge-green' : 'badge-grey'}`}>{doc.statusLabel}</span>
                    {doc.ingestionStatus === 'EXTRACTED' && (
                      <button className="btn-mini" onClick={() => onReclassify(doc.id)} title="Re-run classification">↻</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {docs.length === 0 && <div className="muted" style={{ paddingTop: 10 }}>No evidence uploaded yet.</div>}
            {uploading && <div className="muted" style={{ paddingTop: 10 }}>Processing document…</div>}
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>AI Analysis Process</div>
            {INGESTION_STEPS.map((step, i) => (
              <div key={step} className="row" style={{ padding: '5px 0', gap: 10 }}>
                <span className="check"><IconCheck size={16} /></span>
                <span style={{ fontWeight: 500 }}>{step}</span>
                {i === INGESTION_STEPS.length - 1 && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>validating…</span>}
              </div>
            ))}
          </div>

          {hasContradiction && (
            <Alert kind="red" icon="warn">
              <div>
                <strong>Chronological Inconsistency Detected</strong> with {d.contradictions?.[0].sourceB}
                <div className="row" style={{ marginTop: 8 }}>
                  <Link to={`/disputes/${id}/contradiction`} className="link-blue" style={{ fontWeight: 600 }}>Investigate →</Link>
                </div>
              </div>
            </Alert>
          )}

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>Extracted Timeline Facts</div>
            {(d.documents ?? docs).flatMap((doc) => doc.facts ?? []).slice(0, 3).map((f) => (
              <div key={f.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--row-divider)' }}>
                <div style={{ fontWeight: 500 }}>“{f.claim}”</div>
                <div className="row" style={{ marginTop: 4, gap: 10 }}>
                  <span className={f.requiresHumanReview ? 'warn' : 'check'} style={{ fontSize: 12, fontWeight: 700 }}>
                    {f.confidence * 100}% Match
                  </span>
                  <span className="muted mono" style={{ fontSize: 12 }}>{f.sourceDocument} · {f.sourceLocation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: ERS + requirements */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <div className="card-title">Evidence Readiness Score</div>
            <div style={{ padding: '6px 0 2px' }}><ErsGauge score={ers.score} label={ers.label} /></div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '6px 4px' }}>
              <span className="muted">Required evidence</span>
              <span className="check" style={{ fontWeight: 700 }}>{ers.requiredPresent}/{ers.requiredTotal} Present</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '6px 4px' }}>
              <span className="muted">Recommended evidence</span>
              <span style={{ fontWeight: 700, color: '#ea580c' }}>{ers.recommendedComplete}/{ers.recommendedTotal} Complete</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '6px 4px' }}>
              <span className="muted">Contradictions found</span>
              <span className="consistency" style={{ fontWeight: 700 }}>{ers.contradictionsFound} Conflict</span>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>Required Evidence</div>
            {(d.gaps ?? []).filter((g) => g.required).map((g) => (
              <div key={g.label} className="row between" style={{ padding: '7px 0' }}>
                <span style={{ fontWeight: 500 }}>{g.label}</span>
                <span className="badge badge-green">✓ {g.confidence}%</span>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>Recommended Evidence</div>
            {(d.gaps ?? []).filter((g) => !g.required).map((g) => (
              <div key={g.label} className="row between" style={{ padding: '7px 0' }}>
                <span style={{ fontWeight: 500 }}>{g.label}</span>
                {g.present
                  ? <span className="badge badge-green">✓ {g.confidence}%</span>
                  : <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => nav(`/disputes/${id}/gaps`)}>Upload</button>}
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, padding: '0 4px' }}>Evidence readiness score is predictive. Submit the dossier only after resolving severe discrepancies.</div>
        </div>
      </div>
    </>
  );
}
