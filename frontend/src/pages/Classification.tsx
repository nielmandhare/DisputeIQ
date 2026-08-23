import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { evidenceService } from '../services/mockServices';
import { Alert } from '../components/Alert';
import { IconCheck } from '../components/Icons';
import { EvidenceDocument } from '../types';

const STEPS = ['Extracting text', 'Classifying metadata', 'Extracting factual timeline', 'Validating cross-citations'];

export default function Classification() {
  const { id = 'disp_test_8K72' } = useParams();
  const [docs, setDocs] = useState<EvidenceDocument[]>([]);
  const [selected, setSelected] = useState(0);
  useEffect(() => { evidenceService.listForDispute(id).then((d) => { setDocs(d); setSelected(0); }); }, [id]);

  const doc = docs[selected];

  return (
    <>
      <div className="actionbar">
        <Link to={`/disputes/${id}`} className="link-blue" style={{ fontWeight: 600 }}>← Back to evidence overview</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
        {/* LEFT: document list */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Evidence Documents</div>
          {docs.map((d, i) => (
            <div key={d.id} onClick={() => setSelected(i)}
              style={{ padding: '11px 12px', border: i === selected ? '1px solid var(--blue-border)' : '1px solid transparent', borderRadius: 8, background: i === selected ? 'var(--blue-soft)' : 'transparent', cursor: 'pointer', marginBottom: 6 }}>
              <div style={{ fontWeight: 600 }}>{d.fileName}</div>
              <div className="row between" style={{ marginTop: 4 }}>
                <span className="badge badge-grey">{d.badgeLabel}</span>
                <span className="muted" style={{ fontSize: 12 }}>{d.size}</span>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: classification results */}
        {doc && (
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 6 }}>Classification Results</div>
            <div className="row between">
              <div className="page-title" style={{ fontSize: 22 }}>{doc.fileName}</div>
              <span className="badge badge-green">{doc.confidence}% CONFIDENCE</span>
            </div>

            <div style={{ marginTop: 14 }}>
              {STEPS.map((s) => (
                <div key={s} className="row" style={{ padding: '5px 0', gap: 10 }}>
                  <span className="check"><IconCheck size={16} /></span>
                  <span style={{ fontWeight: 500 }}>{s}</span>
                </div>
              ))}
            </div>

            <div className="divider" />
            <div className="card-title" style={{ marginBottom: 6 }}>Assigned Category</div>
            <div className="row" style={{ gap: 10 }}>
              <span className="ers-bar" style={{ minWidth: 160 }}><span style={{ width: '88%', background: 'var(--blue)', display: 'block', height: '100%', borderRadius: 999 }} /></span>
              <span className="link-blue" style={{ fontWeight: 700 }}>{doc.evidenceTypeLabel} (88%)</span>
            </div>

            {doc.statusLabel === 'CONTRADICTION' && (
              <Alert kind="amber" icon="warn" style={{ marginTop: 16 }}>
                Chronological Inconsistency Identified with return_form.pdf
              </Alert>
            )}

            <div className="card-title" style={{ margin: '18px 0 8px' }}>Extracted Timeline Facts</div>
            {(doc.facts ?? []).map((f) => (
              <div key={f.id} className="card-pad" style={{ border: '1px solid var(--card-border)', borderRadius: 8, marginBottom: 10, padding: 14 }}>
                <div style={{ fontWeight: 500 }}>“{f.claim}”</div>
                <div className="row" style={{ marginTop: 8, gap: 12 }}>
                  <span className={`badge ${f.requiresHumanReview ? 'badge-amber' : 'badge-green'}`}>{f.requiresHumanReview ? 'NEEDS REVIEW' : 'VERIFIED'}</span>
                  <span className="link-blue mono" style={{ fontSize: 12 }}>{f.confidence * 100}% Match {f.sourceLocation}</span>
                </div>
              </div>
            ))}

            <div className="divider" />
            <div className="row between">
              <span className="muted" style={{ fontSize: 12 }}>Pipeline extraction method: {doc.extractionMethod ?? 'neural parser'}</span>
              <button className="btn btn-outline">Override classification</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
