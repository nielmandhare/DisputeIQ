import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { disputeService } from '../services/mockServices';
import { ErsBar } from '../components/StatusBadge';
import { StatusBadge } from '../components/StatusBadge';
import { OVERVIEW_STATS } from '../data/mockData';
import { Dispute } from '../types';

const StatCard = ({ label, num, tag, tagCls }: { label: string; num: number; tag: string; tagCls: string }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className="stat-num">{num}</div>
    <span className={`stat-tag badge ${tagCls}`}>{tag}</span>
  </div>
);

export default function Overview() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  useEffect(() => { disputeService.list().then(setDisputes); }, []);

  const priority = disputes.filter((d) => d.status === 'PENDING_REVIEW' || d.status === 'EVIDENCE_MISSING' || d.status === 'CONTRADICTION' || d.status === 'SUBMITTED').slice(0, 5);
  const s = OVERVIEW_STATS;

  return (
    <>
      <div className="greeting">Good evening, Niel</div>
      <div className="greeting-sub">Merchant dispute operations platform</div>

      <div className="stat-row">
        <StatCard label="Active Disputes" num={s.activeDisputes} tag={s.activeDelta} tagCls="badge-amber" />
        <StatCard label="Needs Review" num={s.needsReview} tag={s.reviewNote} tagCls="badge-red" />
        <StatCard label="Submitted" num={s.submitted} tag={s.submittedNote} tagCls="badge-grey" />
        <StatCard label="Resolved" num={s.resolved} tag={s.resolvedNote} tagCls="badge-green" />
      </div>

      <div className="card card-pad">
        <div className="card-title-row">
          <span className="card-title">Priority Disputes</span>
          <Link to="/disputes" className="link-blue">View all →</Link>
        </div>
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="grid">
            <thead>
              <tr>
                <th>Dispute</th><th>Reason</th><th>Amount</th><th>Deadline</th>
                <th>Evidence Readiness</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {priority.map((d) => (
                <tr key={d.id} onClick={() => (window.location.href = `/disputes/${d.id}`)}>
                  <td><span className="link-blue mono">{d.id}</span></td>
                  <td>{d.reasonLabel}</td>
                  <td className="mono">₹{d.amount.toLocaleString('en-IN')}</td>
                  <td className={d.deadlineText.includes('18h') || d.deadlineText.includes('8h') ? 'consistency' : 'muted'}>{d.deadlineText}</td>
                  <td><ErsBar score={d.ers} /></td>
                  <td><StatusBadge status={d.status} /></td>
                  <td><Link to={`/disputes/${d.id}`} className="link-blue">{d.status === 'SUBMITTED' ? 'View' : 'Review'} →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
