import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { contradictionService } from '../services/mockServices';
import { Contradiction } from '../types';

export default function ContradictionPage() {
  const { id = 'disp_test_8K72' } = useParams();
  const [list, setList] = useState<Contradiction[]>([]);
  useEffect(() => { contradictionService.listForDispute(id).then(setList); }, [id]);

  return (
    <>
      <div className="actionbar">
        <Link to={`/disputes/${id}`} className="link-blue" style={{ fontWeight: 600 }}>← Back to evidence overview</Link>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={async () => setList(await contradictionService.refresh(id))}>↻ Re-run detection</button>
      </div>

      {list.map((c) => (
        <div className="card card-pad" style={{ maxWidth: 880, marginBottom: 16 }} key={c.id}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="ai" style={{ color: '#dc2626' }}>⚠</span>
              <span className="page-title" style={{ fontSize: 22 }}>Inconsistency Identified</span>
            </div>
            <span className={`badge ${c.severity === 'confirmed' ? 'badge-red' : c.severity === 'possible' ? 'badge-orange' : 'badge-grey'}`}>{(c.severity || 'possible').toUpperCase()} · {c.type}</span>
          </div>
          <p className="muted" style={{ fontSize: 14 }}>
            The AI Analysis module cross-referenced the submitted documents and identified a {c.type} conflict.
          </p>

          <div className="row" style={{ gap: 16, marginTop: 18, alignItems: 'stretch' }}>
            <div className="card card-pad" style={{ flex: 1, border: '1px solid var(--green-border)' }}>
              <div className="card-title" style={{ color: 'var(--green-text)' }}>Document A: {c.sourceA}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{c.claimA}</div>
            </div>

            <div style={{ display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--amber-bg)', color: 'var(--amber-text)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>VS</div>
            </div>

            <div className="card card-pad" style={{ flex: 1, border: '1px solid var(--red-border)' }}>
              <div className="card-title" style={{ color: 'var(--red-text)' }}>Document B: {c.sourceB}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{c.claimB}</div>
            </div>
          </div>

          <div className="alert alert-orange" style={{ marginTop: 18 }}>
            <span><strong style={{ color: 'var(--orange-text)' }}>WHY THIS MATTERS</strong><br />{c.explanation}</span>
          </div>
          <div className="alert alert-blue" style={{ marginTop: 12 }}>
            <span><strong>WHAT TO DO</strong><br />{c.recommendedAction}</span>
          </div>

          <div className="row" style={{ marginTop: 20, gap: 12 }}>
            <button className="btn btn-primary" disabled={c.reviewed} onClick={async () => {
              const updated = await contradictionService.review(c.id);
              if (updated) setList((prev) => prev.map((x) => (x.id === c.id ? { ...x, reviewed: true } : x)));
            }}>
              {c.reviewed ? '✓ Marked as Reviewed' : 'Mark Contradiction as Reviewed'}
            </button>
            <button className="btn btn-ghost">View Source Documents</button>
          </div>

          <div className="muted" style={{ fontSize: 11, marginTop: 16 }}>
            Disclaimer: DisputeIQ highlights potential timeline and logic contradictions based on document extraction. Merchants assume final responsibility for evidence validity prior to Razorpay API submission.
          </div>
        </div>
      ))}
    </>
  );
}
