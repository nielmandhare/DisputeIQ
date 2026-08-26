import { useEffect, useMemo, useState } from 'react';
import { evidenceService, demoService } from '../services/mockServices';
import { EvidenceDocument } from '../types';

type Stats = {
  total: number; extracted: number; ocrRequired: number; failed: number;
  classified: number; llmClassified: number; heuristicClassified: number; contradictions: number;
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' | 'blue' }) {
  const color = tone === 'green' ? '#16a34a' : tone === 'amber' ? '#d97706' : tone === 'red' ? '#dc2626' : tone === 'blue' ? '#2563eb' : 'var(--text-primary)';
  return (
    <div className="card card-pad stat-mini">
      <div className="stat-label">{label}</div>
      <div className="stat-num" style={{ color }}>{value}</div>
    </div>
  );
}

export default function Evidence() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [docs, setDocs] = useState<EvidenceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EvidenceDocument | null>(null);
  const [q, setQ] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d] = await Promise.all([evidenceService.stats(), evidenceService.listAll(500)]);
      setStats(s);
      setDocs(d);
    } catch (e) {
      setError((e as Error).message || 'Failed to load evidence');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const loadDemo = async () => {
    setLoading(true);
    try {
      await demoService.load(100);
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Failed to load synthetic environment');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () => docs.filter((d) => (d.fileName || '').toLowerCase().includes(q.toLowerCase()) || (d.disputeId || '').toLowerCase().includes(q.toLowerCase()) || (d.evidenceType || '').toLowerCase().includes(q.toLowerCase())),
    [docs, q],
  );

  // Classification distribution for the "what the engine saw" strip.
  const typeDist = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of docs) if (d.evidenceType) m[d.evidenceType] = (m[d.evidenceType] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  return (
    <>
      <div className="page-title">Evidence Intelligence</div>
      <div className="page-sub">Where DisputeIQ collects, processes, classifies, and evaluates the evidence behind every dispute.</div>

      {error && <div className="badge badge-red" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Summary */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <Stat label="TOTAL EVIDENCE" value={stats?.total ?? 0} tone="blue" />
        <Stat label="EXTRACTED" value={stats?.extracted ?? 0} tone="green" />
        <Stat label="OCR REQUIRED" value={stats?.ocrRequired ?? 0} tone="amber" />
        <Stat label="FAILED" value={stats?.failed ?? 0} tone="red" />
        <Stat label="CLASSIFIED" value={stats?.classified ?? 0} />
        <Stat label="CONTRADICTIONS" value={stats?.contradictions ?? 0} tone="red" />
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="badge badge-green">LLM-classified: {stats?.llmClassified ?? 0}</span>
        <span className="badge badge-grey">Heuristic-classified: {stats?.heuristicClassified ?? 0}</span>
        {typeDist.slice(0, 6).map(([t, n]) => (
          <span key={t} className="badge badge-blue" style={{ fontSize: 11 }}>{t}: {n}</span>
        ))}
      </div>

      <div className="actionbar">
        <div className="search"><span>🔍</span><input placeholder="Search evidence, dispute, type..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {docs.length === 0 ? (
          <button className="btn btn-primary" disabled={loading} onClick={loadDemo}>{loading ? 'Loading…' : 'Load synthetic environment'}</button>
        ) : (
          <button className="btn btn-ghost" disabled={loading} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        )}
      </div>

      {docs.length === 0 && !loading ? (
        <div className="card card-pad" style={{ textAlign: 'center', marginTop: 14 }}>
          <div className="muted">No evidence yet. Load the synthetic environment to populate the evidence workspace with real processed documents.</div>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 6 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>Document</th><th>Dispute</th><th>Type</th><th>Confidence</th>
                <th>Status</th><th>Method</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} style={{ cursor: 'pointer' }}>
                  <td><span className="link-blue">{d.fileName}</span><div className="muted" style={{ fontSize: 11 }}>{d.mimeType}</div></td>
                  <td><a className="link-blue mono" href={`/disputes/${d.disputeId}`} onClick={(e) => e.stopPropagation()}>{d.disputeId}</a></td>
                  <td>{d.evidenceType ? <span className="badge badge-blue" style={{ fontSize: 11 }}>{d.evidenceType}</span> : <span className="muted">—</span>}</td>
                  <td>{d.confidence != null ? <Confidence value={d.confidence} /> : <span className="muted">—</span>}</td>
                  <td><StatusLabel status={d.ingestionStatus} label={d.statusLabel} /></td>
                  <td className="mono" style={{ fontSize: 12 }}>{d.classificationSource || '—'}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{d.updatedAt ? new Date(d.updatedAt).toLocaleString('en-IN', { hour12: false }) : ''}</td>
                  <td><span className="link-blue">→</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div>
                <div className="card-title">{selected.fileName}</div>
                <div className="muted" style={{ fontSize: 12 }}>{selected.id} · {selected.mimeType} · {selected.size}</div>
              </div>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <span className="badge badge-blue">{selected.evidenceType || 'UNCLASSIFIED'}</span>
              <span className={`badge ${selected.classificationSource === 'LLM' ? 'badge-green' : 'badge-grey'}`}>{selected.classificationSource || 'heuristic'}</span>
              <StatusLabel status={selected.ingestionStatus} label={selected.statusLabel} />
              {selected.confidence != null && <span className="badge badge-grey">Confidence {selected.confidence}%</span>}
            </div>

            <div className="card-title" style={{ margin: '18px 0 8px' }}>Classification</div>
            <div className="kv"><span className="k">Evidence type</span><span className="v">{selected.evidenceType || '—'}</span></div>
            <div className="kv"><span className="k">Confidence</span><span className="v">{selected.confidence != null ? `${selected.confidence}%` : '—'}</span></div>
            <div className="kv"><span className="k">Classification source</span><span className="v">{selected.classificationSource || 'Deterministic engine'}</span></div>

            <div className="card-title" style={{ margin: '18px 0 8px' }}>Extracted content preview</div>
            <div className="code-light" style={{ maxHeight: 180, overflow: 'auto' }}>
              {selected.contentPreview?.length ? selected.contentPreview.map((l, i) => <div key={i}>{l}</div>) : <span className="muted">No extracted text.</span>}
            </div>

            <div className="card-title" style={{ margin: '18px 0 8px' }}>Used by (pipeline)</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-grey">Timeline</span>
              <span className="badge badge-grey">Contradiction Engine</span>
              <span className="badge badge-grey">ERS</span>
              <span className="badge badge-grey">Response Draft</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              This document feeds the factual timeline, contradiction detection, evidence-readiness score, and the grounded response draft for its dispute.
            </div>

            <div className="row" style={{ marginTop: 18, gap: 10 }}>
              <a className="btn btn-primary" href={`/disputes/${selected.disputeId}`}>Open dispute</a>
              <button className="btn btn-ghost" onClick={async () => { const u = await evidenceService.reclassify(selected.id); if (u) { setDocs((p) => p.map((x) => (x.id === u.id ? u : x))); setSelected(u); } }}>Re-run classification</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Confidence({ value }: { value: number }) {
  const color = value >= 75 ? '#16a34a' : value >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="row" style={{ gap: 6 }}>
      <div style={{ width: 54, height: 6, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: 12, color }}>{value}%</span>
    </div>
  );
}

function StatusLabel({ status, label }: { status?: string; label?: string }) {
  const s = (status || '').toUpperCase();
  const tone = s === 'EXTRACTED' ? 'badge-green' : s === 'OCR_REQUIRED' ? 'badge-orange' : s === 'EXTRACTION_FAILED' ? 'badge-red' : s === 'PROCESSING' ? 'badge-blue' : 'badge-grey';
  return <span className={`badge ${tone}`}>{label || status || '—'}</span>;
}
