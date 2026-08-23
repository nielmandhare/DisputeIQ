import { useParams, Link } from 'react-router-dom';
import { OCR_ISSUE_DOC } from '../services/mockServices';
import { Alert } from '../components/Alert';
import { ConfidenceBar } from '../components/ErsGauge';

const LOGS = [
  { t: '18:42:31', ok: true, text: 'File uploaded' },
  { t: '18:42:32', ok: true, text: 'Text extraction attempted' },
  { t: '18:42:33', ok: false, text: 'No readable text detected' },
  { t: '18:42:34', ok: true, text: 'OCR fallback initiated' },
  { t: '18:42:38', ok: true, text: 'OCR completed Partial result' },
];

export default function EvidenceIssue() {
  const { id = 'disp_test_8K72' } = useParams();
  const doc = OCR_ISSUE_DOC;

  return (
    <>
      <div className="actionbar">
        <Link to={`/disputes/${id}`} className="link-blue" style={{ fontWeight: 600 }}>← Back to evidence overview</Link>
      </div>

      <div className="card card-pad" style={{ maxWidth: 920 }}>
        <div className="row" style={{ gap: 10, marginBottom: 4 }}>
          <span style={{ color: '#f59e0b', fontSize: 18 }}>⚠</span>
          <div>
            <div className="page-title" style={{ fontSize: 22 }}>Evidence processing issue</div>
            <div className="muted" style={{ fontSize: 13 }}>Extracted facts may be incomplete due to quality restrictions</div>
          </div>
          <div className="spacer" />
          <span className="badge badge-grey">{doc.fileName}</span>
          <span className="badge badge-orange">PARTIAL EXTRACTION</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 18 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Processing Logs</div>
            {LOGS.map((l) => (
              <div key={l.t} className="row" style={{ padding: '5px 0', gap: 10, fontFamily: 'var(--mono)', fontSize: 13 }}>
                <span className={l.ok ? 'check' : 'warn'}>{l.ok ? '✅' : '⚠️'}</span>
                <span className="mono">{l.t}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Extraction Analysis</div>
            <div className="kv"><span className="k">Extraction method</span><span className="v">OCR fallback</span></div>
            <div className="kv"><span className="k">Confidence</span><span className="v"><ConfidenceBar value={doc.confidence ?? 62} /></span></div>
            <div className="kv"><span className="k">Extracted text</span><span className="v">847 characters</span></div>
          </div>
        </div>

        <Alert kind="amber" icon="warn" style={{ marginTop: 18 }}>
          <span><strong>PARTIAL EXTRACTION DETECTED</strong><br />
          This document contains handwritten text, low contrast print, or is a scanned image with distortion. Some details might have been missed by the classifier pipeline.</span>
        </Alert>

        <div className="card-title" style={{ margin: '18px 0 8px' }}>Extracted Content Preview</div>
        <div className="code-block" style={{ background: '#f8fafc', color: '#1e293b', border: '1px solid var(--card-border)' }}>
          {doc.contentPreview?.map((line, i) => <div key={i}>{line}</div>)}
        </div>

        <div className="row" style={{ marginTop: 18, gap: 12 }}>
          <button className="btn btn-primary">Review evidence</button>
          <button className="btn btn-ghost">Replace document</button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>The rest of your dispute analysis is unaffected.</div>
      </div>
    </>
  );
}
