import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gapService, ersService } from '../services/mockServices';
import { GapItem, ErsBreakdown } from '../types';

export default function Gaps() {
  const { id = 'disp_test_8K72' } = useParams();
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [ers, setErs] = useState<ErsBreakdown | null>(null);
  useEffect(() => { gapService.listForDispute(id).then(setGaps); ersService.getForDispute(id).then(setErs); }, [id]);

  const required = gaps.filter((g) => g.required);
  const recommended = gaps.filter((g) => !g.required);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Evidence Analysis &amp; Gaps</div>

          <div className="card-title" style={{ marginBottom: 8 }}>Required Evidence for Reason Code</div>
          {required.map((g) => (
            <div key={g.label} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--row-divider)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{g.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{g.detail}</div>
              </div>
              <span className="badge badge-green">PRESENT</span>
            </div>
          ))}

          <div className="card-title" style={{ margin: '18px 0 8px' }}>Recommended Evidence (Improves Win-Rate)</div>
          {recommended.map((g) => (
            <div key={g.label} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--row-divider)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{g.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{g.detail}</div>
              </div>
              {g.present
                ? <span className="badge badge-green">PRESENT</span>
                : <span className="badge badge-red">MISSING</span>}
            </div>
          ))}

          {recommended.some((g) => !g.present) && (
            <div className="alert alert-red" style={{ marginTop: 16 }}>
              <span>
                <strong>DETAILED ACTION: COURIER RECORD</strong><br />
                Razorpay network algorithms report that merchants who submit third-party portal courier confirmation screenshots alongside receipts win chargebacks at an 18% higher rate for this code.
              </span>
            </div>
          )}
          {recommended.some((g) => !g.present) && (
            <button className="btn btn-primary" style={{ marginTop: 12 }}>+ Upload Courier Evidence</button>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 8 }}>Summary</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--blue)' }}>{ers?.score ?? 82}%</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>Moderate Readiness</div>
          <div className="muted" style={{ fontSize: 13 }}>{ers ? `${ers.requiredPresent}/${ers.requiredTotal + (ers.recommendedTotal ?? 0)}` : '3/4'} evidence keys found</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            Adding the missing third-party courier record will resolve the recommended metrics and likely push your win-rate readiness into the high tier (&gt;90).
          </p>
          <button className="btn btn-outline btn-block" style={{ marginTop: 12 }}>+ Upload Courier Proof</button>
        </div>
      </div>
    </>
  );
}
