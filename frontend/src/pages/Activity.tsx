import { useEffect, useMemo, useState } from 'react';
import { auditService, AuditEvent } from '../services/mockServices';
import { Link } from 'react-router-dom';

const ACTORS = ['RAZORPAY API', 'SYSTEM', 'MERCHANT', 'AI ENGINE'];

export default function Activity() {
  const [data, setData] = useState<{ total: number; events: AuditEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await auditService.listAll(300);
      setData(d);
    } catch (e) {
      setError((e as Error).message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(
    () => (data?.events || []).filter((e) => (actor ? e.actor === actor : true)),
    [data, actor],
  );

  // Actor breakdown for the summary strip.
  const byActor = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of data?.events || []) m[e.actor] = (m[e.actor] || 0) + 1;
    return m;
  }, [data]);

  return (
    <>
      <div className="page-title">Activity Feed</div>
      <div className="page-sub">Real, backend-backed record of everything DisputeIQ did — across every dispute and evidence document.</div>

      {error && <div className="badge badge-red" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <Mini label="TOTAL EVENTS" value={data?.total ?? 0} tone="blue" />
        {ACTORS.map((a) => <Mini key={a} label={a} value={byActor[a] || 0} />)}
      </div>

      <div className="actionbar">
        <div className="search"><span>🔍</span><input placeholder="Filter events…" disabled value="" onChange={() => {}} /></div>
        <select className="btn btn-ghost" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">Actor: All</option>
          {ACTORS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn btn-ghost" disabled={loading} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <div className="card">
        {loading && <div className="muted" style={{ padding: 18 }}>Loading activity…</div>}
        {!loading && filtered.length === 0 && (
          <div className="muted" style={{ padding: 18 }}>No audit events recorded yet. Load the synthetic environment to populate the activity feed.</div>
        )}
        {filtered.map((e) => (
          <div key={e.id} style={{ borderBottom: '1px solid var(--row-divider)', padding: '13px 18px' }}>
            <div className="row between">
              <div className="row" style={{ gap: 12 }}>
                <span className="mono muted" style={{ fontSize: 13, minWidth: 64 }}>{e.timestamp.slice(11, 19)}</span>
                <span className={`badge badge-${e.badge}`}>[ {e.eventType} ]</span>
                <span className="muted" style={{ fontSize: 13 }}>{e.statusText}</span>
              </div>
              <span className="badge badge-grey" style={{ fontSize: 11 }}>{e.actor}</span>
            </div>
            {e.entityId && (
              <div style={{ marginTop: 6, paddingLeft: 76 }}>
                <span className="muted" style={{ fontSize: 12 }}>{e.entityType}: </span>
                {e.entityType === 'DISPUTE'
                  ? <Link className="link-blue mono" to={`/disputes/${e.entityId}`}>{e.entityId}</Link>
                  : <span className="mono" style={{ fontSize: 12 }}>{e.entityId}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: 'blue' }) {
  const color = tone === 'blue' ? '#2563eb' : 'var(--text-primary)';
  return (
    <div className="card card-pad stat-mini">
      <div className="stat-label">{label}</div>
      <div className="stat-num" style={{ color }}>{value}</div>
    </div>
  );
}
