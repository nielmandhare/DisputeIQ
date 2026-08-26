import { useEffect, useMemo, useState } from 'react';
import { aiService, AiEvent } from '../services/mockServices';

const OP_LABEL: Record<string, string> = {
  EVIDENCE_CLASSIFICATION: 'Evidence Classification',
  TIMELINE_EXTRACTION: 'Timeline Extraction',
  RESPONSE_DRAFTING: 'Response Drafting',
};

function fmtDur(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export default function AIAnalysis() {
  const [provider, setProvider] = useState<{ provider: string; model: string; modelId: string; configured: boolean; baseUrl: string; llmActive: boolean } | null>(null);
  const [events, setEvents] = useState<AiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, e] = await Promise.all([aiService.provider(), aiService.events(300)]);
      setProvider(p);
      setEvents(e);
    } catch (err) {
      setError((err as Error).message || 'Failed to load AI telemetry');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const stats = useMemo(() => {
    const llm = events.filter((e) => e.method === 'LLM').length;
    const heuristic = events.filter((e) => e.method === 'HEURISTIC').length;
    const byOp: Record<string, number> = {};
    for (const e of events) byOp[e.operation] = (byOp[e.operation] || 0) + 1;
    return { total: events.length, llm, heuristic, byOp };
  }, [events]);

  return (
    <>
      <div className="page-title">AI Analysis</div>
      <div className="page-sub">Real, backend-backed observability of every AI engine execution in the DisputeIQ pipeline.</div>

      {error && <div className="badge badge-red" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Engine identity */}
      <div className="card card-pad" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>AI ENGINE</div>
        <div className="ai-grid">
          <div className="ai-cell"><span className="muted">Provider</span><b>{provider?.provider ?? '—'}</b></div>
          <div className="ai-cell"><span className="muted">Model</span><b>{provider?.model ?? '—'}</b></div>
          <div className="ai-cell"><span className="muted">Deployment id</span><b className="mono">{provider?.modelId ?? '—'}</b></div>
          <div className="ai-cell"><span className="muted">Gateway</span><b className="mono" style={{ fontSize: 12 }}>{provider?.baseUrl ?? '—'}</b></div>
          <div className="ai-cell">
            <span className="muted">LLM active</span>
            <b className={provider?.llmActive ? 'green' : 'amber'}>{provider?.llmActive ? 'YES' : 'NO (heuristic)'}</b>
          </div>
          <div className="ai-cell">
            <span className="muted">Executions logged</span><b>{stats.total}</b>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <span className="badge badge-green">LLM runs: {stats.llm}</span>
          <span className="badge badge-grey">Heuristic runs: {stats.heuristic}</span>
          {Object.entries(stats.byOp).map(([op, n]) => (
            <span key={op} className="badge badge-blue">{OP_LABEL[op] ?? op}: {n}</span>
          ))}
        </div>
      </div>

      <div className="actionbar" style={{ marginTop: 16 }}>
        <div className="search"><span className="muted">Live execution feed — every operation is recorded when it runs.</span></div>
        <button className="btn btn-ghost" disabled={loading} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {/* Event feed */}
      <div className="card card-pad" style={{ marginTop: 8 }}>
        {events.length === 0 && !loading && (
          <div className="muted" style={{ textAlign: 'center', padding: 20 }}>
            No AI executions logged yet. Load the synthetic environment or upload evidence to see the engine run.
          </div>
        )}
        {events.map((e) => (
          <div key={e.id} className="ai-row" style={{ padding: '12px 0', borderBottom: '1px solid #eef2f7' }}>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="badge badge-blue">{OP_LABEL[e.operation] ?? e.operation}</span>
                <span className={`badge ${e.method === 'LLM' ? 'badge-green' : 'badge-grey'}`}>{e.method}</span>
                <span className={`badge ${e.status === 'COMPLETED' ? 'badge-green' : 'badge-red'}`}>{e.status}</span>
              </div>
              <span className="muted mono" style={{ fontSize: 12 }}>{fmtTime(e.timestamp)}</span>
            </div>
            <div className="ai-grid" style={{ marginTop: 8 }}>
              <div className="ai-cell"><span className="muted">Provider</span><b>{e.provider}</b></div>
              <div className="ai-cell"><span className="muted">Model</span><b>{e.model}</b></div>
              <div className="ai-cell"><span className="muted">Input</span><b>{e.inputCount ?? '—'}</b></div>
              <div className="ai-cell"><span className="muted">Output</span><b>{e.outputCount ?? '—'}</b></div>
              <div className="ai-cell"><span className="muted">Confidence</span><b>{e.confidence != null ? `${e.confidence}%` : '—'}</b></div>
              <div className="ai-cell"><span className="muted">Duration</span><b>{fmtDur(e.durationMs)}</b></div>
            </div>
            {e.disputeId && (
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Dispute: <a className="link-blue mono" href={`/disputes/${e.disputeId}`}>{e.disputeId}</a>
                {e.evidenceId ? ` · Evidence: ${e.evidenceId}` : ''}
              </div>
            )}
            {e.metadata && Object.keys(e.metadata).length > 0 && (
              <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                {Object.entries(e.metadata).map(([k, v]) => (
                  <span key={k} style={{ marginRight: 12 }}>{k}: <b style={{ fontWeight: 600 }}>{String(v)}</b></span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
