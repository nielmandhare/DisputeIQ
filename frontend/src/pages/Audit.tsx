import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { auditService } from '../services/mockServices';
import { AuditEvent } from '../types';

export default function Audit() {
  const { id = 'disp_test_8K72' } = useParams();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  useEffect(() => { auditService.listForDispute(id).then(setEvents); }, [id]);

  const exportFile = async (fmt: 'csv' | 'json') => {
    setDownloading(fmt);
    const content = fmt === 'csv' ? await auditService.exportCSV(id) : await auditService.exportJSON(id);
    const blob = new Blob([content], { type: fmt === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit_${id}.${fmt}`;
    a.click(); URL.revokeObjectURL(url);
    setTimeout(() => setDownloading(null), 600);
  };

  return (
    <>
      <div className="page-title" style={{ fontSize: 24 }}>Audit Trail</div>
      <div className="page-sub">Immutable record of all dispute activity.</div>

      <div className="actionbar">
        <select className="btn btn-ghost"><option>Event type: All</option></select>
        <select className="btn btn-ghost"><option>Date range: All time</option></select>
        <select className="btn btn-ghost"><option>Actor: All</option></select>
        <div className="spacer" />
        <button className="btn btn-ghost" disabled={!!downloading} onClick={() => exportFile('csv')}>Export CSV</button>
        <button className="btn btn-ghost" disabled={!!downloading} onClick={() => exportFile('json')}>Export JSON</button>
      </div>

      <div className="card">
        {events.map((e) => (
          <div key={e.id} style={{ borderBottom: '1px solid var(--row-divider)', padding: '14px 18px' }}>
            <div className="row between" style={{ cursor: 'pointer' }} onClick={() => setExpanded((x) => (x === e.id ? null : e.id))}>
              <div className="row" style={{ gap: 12 }}>
                <span className="mono muted" style={{ fontSize: 13 }}>{e.timestamp.slice(11, 19)}</span>
                <span className={`badge badge-${e.badge}`}>[ {e.eventType} ]</span>
                <span className="muted" style={{ fontSize: 13 }}>{e.statusText}</span>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>{e.actor}</span>
                <span className="link-blue">▾</span>
              </div>
            </div>
            {expanded === e.id && e.metadata && (
              <div className="code-block" style={{ marginTop: 10, background: '#f1f5f9', color: '#1e293b' }}>
                {`CONTRADICTION DETECTED METADATA\n${JSON.stringify(e.metadata, null, 2)}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
