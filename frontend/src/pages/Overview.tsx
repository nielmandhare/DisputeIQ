import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { disputeService } from '../services/mockServices';
import { ErsBar } from '../components/StatusBadge';
import { StatusBadge } from '../components/StatusBadge';
import { Dispute } from '../types';

interface OverviewData {
  generatedAt: string;
  totalDisputes: number;
  totalAmountInr: number;
  avgErs: number;
  buckets: { contestReady: number; needsEvidence: number; hasContradiction: number; submitted: number; resolved: number };
  evidence: { total: number; extracted: number; ocrRequired: number; failed: number; classified: number; contradictions: number };
  recentActivity: { id: string; eventType: string; actor: string; statusText: string; entityType?: string; entityId?: string; timestamp: string }[];
}

const StatCard = ({ label, num, sub, tone }: { label: string; num: string | number; sub?: string; tone?: 'green' | 'amber' | 'red' | 'blue' }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className={`stat-num${tone === 'green' ? ' green' : tone === 'amber' ? ' amber' : tone === 'red' ? ' red' : ''}`}>{num}</div>
    {sub && <span className="muted" style={{ fontSize: 12 }}>{sub}</span>}
  </div>
);

const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

export default function Overview() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [ov, setOv] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([disputeService.list(), disputeService.getOverviewStats()])
      .then(([d, o]) => { setDisputes(d); setOv(o as OverviewData); })
      .finally(() => setLoading(false));
  }, []);

  const priority = disputes
    .filter((d) => ['PENDING_REVIEW', 'CONTRADICTION', 'EVIDENCE_MISSING', 'SUBMITTED'].includes(d.status))
    .slice(0, 6);

  const b = ov?.buckets;
  const ev = ov?.evidence;

  return (
    <>
      <div className="greeting">Good evening, Niel</div>
      <div className="greeting-sub">Merchant dispute operations platform — live command center</div>

      {loading && <div className="muted" style={{ padding: 18 }}>Loading command center…</div>}

      {ov && (
        <>
          <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <StatCard label="Total Disputes" num={ov.totalDisputes} sub="from live backend" tone="blue" />
            <StatCard label="Contest-Ready" num={b?.contestReady ?? 0} sub="ERS ≥ 72 & valid draft" tone="green" />
            <StatCard label="Needs Evidence" num={b?.needsEvidence ?? 0} sub="ERS below bar" tone="amber" />
            <StatCard label="Has Contradiction" num={b?.hasContradiction ?? 0} sub="requires review" tone="red" />
          </div>

          <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <StatCard label="Disputed Amount" num={inr(ov.totalAmountInr)} sub="total at risk" />
            <StatCard label="Avg ERS" num={ov.avgErs} sub="evidence readiness" />
            <StatCard label="Evidence Docs" num={ev?.total ?? 0} sub={`${ev?.ocrRequired ?? 0} OCR-required`} />
            <StatCard label="Contradictions" num={ev?.contradictions ?? 0} sub="detected by engine" tone="red" />
          </div>

          <div className="row" style={{ gap: 18, alignItems: 'flex-start', marginTop: 6 }}>
            <div className="card card-pad" style={{ flex: 2 }}>
              <div className="card-title-row">
                <span className="card-title">Priority Disputes</span>
                <Link to="/disputes" className="link-blue">View all →</Link>
              </div>
              <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Dispute</th><th>Reason</th><th>Amount</th><th>ERS</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {priority.map((d) => (
                      <tr key={d.id} onClick={() => (window.location.href = `/disputes/${d.id}`)}>
                        <td><span className="link-blue mono">{d.id}</span></td>
                        <td>{d.reasonLabel}</td>
                        <td className="mono">₹{d.amount.toLocaleString('en-IN')}</td>
                        <td><ErsBar score={d.ers} /></td>
                        <td><StatusBadge status={d.status} /></td>
                        <td><Link to={`/disputes/${d.id}`} className="link-blue">Review →</Link></td>
                      </tr>
                    ))}
                    {priority.length === 0 && (
                      <tr><td colSpan={6} className="muted" style={{ padding: 14 }}>No priority disputes.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card card-pad" style={{ flex: 1 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Recent Activity</div>
              {ov.recentActivity.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No activity yet.</div>}
              {ov.recentActivity.map((a) => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--row-divider)' }}>
                  <div className="row between">
                    <span className={`badge badge-${a.actor === 'AI ENGINE' ? 'blue' : a.actor === 'SYSTEM' ? 'grey' : 'green'}`} style={{ fontSize: 10 }}>{a.actor}</span>
                    <span className="mono muted" style={{ fontSize: 11 }}>{a.timestamp.slice(11, 19)}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{a.eventType}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{a.statusText}</div>
                </div>
              ))}
              <Link to="/activity" className="link-blue" style={{ display: 'inline-block', marginTop: 10, fontSize: 13 }}>Full activity feed →</Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
