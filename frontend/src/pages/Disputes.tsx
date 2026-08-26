import { useEffect, useMemo, useState } from 'react';
import { disputeService } from '../services/mockServices';
import { demoService, DemoLoadResult } from '../services/mockServices';
import { ErsBar, StatusBadge } from '../components/StatusBadge';
import { IconSearch, IconFilter, IconInbox } from '../components/Icons';
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
  const [demo, setDemo] = useState<DemoLoadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sort, setSort] = useState<'deadline' | 'ers' | 'amount' | 'updated'>('deadline');
  const [showTabs, setShowTabs] = useState(true);
  useEffect(() => { disputeService.list().then(setDisputes); }, []);

  const loadSynthetic = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await demoService.load(100);
      setDemo(res);
      // Refresh the list from the backend so the UI reflects real loaded rows.
      const live = await disputeService.list();
      setDisputes(live);
      setShowEmpty(false);
    } catch (e) {
      setLoadError((e as Error).message || 'Failed to load synthetic environment');
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    TABS.forEach((t) => (c[t.key] = disputes.filter(t.match).length));
    c['All'] = disputes.length;
    return c;
  }, [disputes]);

  const filtered = disputes.filter(TABS.find((t) => t.key === tab)!.match)
    .filter((d) => d.id.toLowerCase().includes(q.toLowerCase()) || (d.customer || '').toLowerCase().includes(q.toLowerCase()));

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sort === 'ers') return (b.ers || 0) - (a.ers || 0);
      if (sort === 'amount') return (b.amount || 0) - (a.amount || 0);
      if (sort === 'updated') return (b.lastUpdated || '').localeCompare(a.lastUpdated || '');
      // deadline: ascending hours-remaining
      const h = (t: string) => { const m = /(\d+)h/.exec(t || ''); return m ? Number(m[1]) : 9999; };
      return h(a.deadlineText) - h(b.deadlineText);
    });
    return arr;
  }, [filtered, sort]);

  const empty = showEmpty || (disputes.length === 0 && !demo);

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
          <div className="muted" style={{ marginTop: 6 }}>Load the synthetic evaluation environment to populate the queue with realistic disputes processed through the real pipeline.</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
            <button className="btn btn-primary" disabled={loading} onClick={loadSynthetic}>
              {loading ? 'Loading synthetic disputes…' : 'Load synthetic dispute environment'}
            </button>
            <button className="btn btn-ghost" disabled={loading} onClick={() => disputeService.simulateWebhook()}>Simulate webhook</button>
          </div>
          {loadError && <div className="badge badge-red" style={{ marginTop: 12 }}>{loadError}</div>}
          {demo && (
            <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>
              Loaded <b>{demo.loaded}</b> synthetic disputes · {demo.evidenceCount} evidence docs · {demo.ocrRequired} OCR-required
            </div>
          )}
          <div className="testmode" style={{ justifyContent: 'center', marginTop: 16 }}>
            <span className="dot-green" /> Synthetic data — clearly labelled, not real Razorpay disputes
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-title">Disputes</div>
      <div className="page-sub">Manage and investigate payment disputes</div>

      {demo && (
        <div className="card card-pad" style={{ marginTop: 14, marginBottom: 4 }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>Synthetic evaluation environment</div>
              <div className="muted" style={{ fontSize: 13 }}>
                <b>{demo.loaded}</b> disputes · <b>{demo.evidenceCount}</b> evidence docs · <b>{demo.ocrRequired}</b> OCR-required · seed {demo.datasetSeed}
              </div>
              <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(demo.scenarioDistribution).map(([k, v]) => (
                  <span key={k} className="badge badge-grey" style={{ fontSize: 12 }}>{k}: {v}</span>
                ))}
              </div>
            </div>
            <button className="btn btn-ghost" disabled={loading} onClick={loadSynthetic}>{loading ? 'Reloading…' : 'Reload'}</button>
          </div>
        </div>
      )}

      <div className="actionbar">
        <div className="search"><IconSearch size={16} /><input placeholder="Search disputes..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn btn-ghost" onClick={() => setShowTabs((v) => !v)}><IconFilter size={16} /> Filter</button>
        <select className="btn btn-ghost" value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="deadline">Sort: Deadline</option>
          <option value="ers">Sort: ERS</option>
          <option value="amount">Sort: Amount</option>
          <option value="updated">Sort: Last updated</option>
        </select>
      </div>

      {showTabs && (
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.key} <span className="count">{counts[t.key] ?? 0}</span>
          </div>
        ))}
      </div>
      )}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Dispute ID</th><th>Reason</th><th>Customer</th><th>Amount</th>
              <th>Deadline</th><th>ERS</th><th>Status</th><th>Last Updated</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.id} onClick={() => (window.location.href = `/disputes/${d.id}`)}>
                <td><span className="link-blue mono">{d.id}</span></td>
                <td>{d.reasonLabel}</td>
                <td>{d.customer}</td>
                <td className="mono">₹{d.amount.toLocaleString('en-IN')}</td>
                <td className={d.deadlineText && (d.deadlineText.includes('18h') || d.deadlineText.includes('8h')) ? 'consistency' : 'muted'}>{d.deadlineText}</td>
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
