import { useEffect, useMemo, useState } from 'react';
import { disputeService } from '../services/mockServices';
import { ErsBar, StatusBadge } from '../components/StatusBadge';
import { IconSearch, IconFilter, IconSort, IconInbox } from '../components/Icons';
import { Dispute } from '../types';

type TabKey = 'All' | 'Needs Review' | 'Processing' | 'Submitted' | 'Resolved';
const TABS: { key: TabKey; match: (d: Dispute) => boolean }[] = [
  { key: 'All', match: () => true },
  { key: 'Needs Review', match: (d) => d.status === 'PENDING_REVIEW' || d.status === 'EVIDENCE_MISSING' || d.status === 'CONTRADICTION' },
  { key: 'Processing', match: (d) => d.status === 'PROCESSING' },
  { key: 'Submitted', match: (d) => d.status === 'SUBMITTED' || d.status === 'UNDER_REVIEW' },
  { key: 'Resolved', match: (d) => d.status === 'RESOLVED' },
];

export default function Disputes() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [tab, setTab] = useState<TabKey>('All');
  const [q, setQ] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  useEffect(() => { disputeService.list().then(setDisputes); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    TABS.forEach((t) => (c[t.key] = disputes.filter(t.match).length));
    c['All'] = disputes.length;
    return c;
  }, [disputes]);

  const filtered = disputes.filter(TABS.find((t) => t.key === tab)!.match)
    .filter((d) => d.id.toLowerCase().includes(q.toLowerCase()) || d.customer.toLowerCase().includes(q.toLowerCase()));

  const empty = showEmpty || disputes.length === 0;

  if (empty) {
    return (
      <>
        <div className="page-title">Disputes</div>
        <div className="page-sub">Manage and investigate payment disputes</div>
        {!showEmpty && disputes.length > 0 && (
          <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => setShowEmpty(true)}>Preview empty state</button>
        )}
        <div className="card card-pad" style={{ marginTop: 20, maxWidth: 560, textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e2e8f0', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
            <IconInbox size={28} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>No disputes yet</div>
          <div className="muted" style={{ marginTop: 6 }}>When disputes are received from your processor webhook they will appear here.</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
            <button className="btn btn-primary" onClick={() => disputeService.simulateWebhook()}>Simulate webhook</button>
            <button className="btn btn-ghost">Add manually</button>
          </div>
          <div className="testmode" style={{ justifyContent: 'center', marginTop: 16 }}>
            <span className="dot-green" /> Connected to Razorpay test mode · Listening for webhooks
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-title">Disputes</div>
      <div className="page-sub">Manage and investigate payment disputes</div>

      <div className="actionbar">
        <div className="search"><IconSearch size={16} /><input placeholder="Search disputes..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn btn-ghost"><IconFilter size={16} /> Filter</button>
        <button className="btn btn-ghost"><IconSort size={16} /> Sort</button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.key} <span className="count">{counts[t.key] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Dispute ID</th><th>Reason</th><th>Customer</th><th>Amount</th>
              <th>Deadline</th><th>ERS</th><th>Status</th><th>Last Updated</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} onClick={() => (window.location.href = `/disputes/${d.id}`)}>
                <td><span className="link-blue mono">{d.id}</span></td>
                <td>{d.reasonLabel}</td>
                <td>{d.customer}</td>
                <td className="mono">₹{d.amount.toLocaleString('en-IN')}</td>
                <td className={d.deadlineText.includes('18h') || d.deadlineText.includes('8h') ? 'consistency' : 'muted'}>{d.deadlineText}</td>
                <td><ErsBar score={d.ers} /></td>
                <td><StatusBadge status={d.status} /></td>
                <td className="muted">{d.lastUpdated}</td>
                <td><span className="link-blue">→</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
