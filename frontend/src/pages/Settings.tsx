import { useEffect, useState } from 'react';
import { Alert } from '../components/Alert';
import { statusService, demoService } from '../services/mockServices';

type Status = {
  ok: boolean;
  version: string;
  razorpay: { configured: boolean; mode: 'NONE' | 'TEST' | 'LIVE'; account: string | null; submissionMode: string };
  demo: { active: boolean; disputeCount: number; evidenceCount: number };
  aiProvider?: { provider: string; model: string };
} | null;

export default function Settings() {
  const [status, setStatus] = useState<Status>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => statusService.get().then(setStatus);
  useEffect(() => { load(); }, []);

  const doReset = async () => {
    setResetting(true);
    setError(null);
    setResetMsg(null);
    try {
      await demoService.clear();
      const res = await demoService.load(100);
      setConfirmReset(false);
      setResetMsg(`Reset complete — ${res.loaded} disputes and ${res.evidenceCount} evidence documents reloaded.`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Reset failed. See backend logs.');
    } finally {
      setResetting(false);
    }
  };

  const rz = status?.razorpay;
  const rzState =
    !rz || !rz.configured
      ? { label: 'Not connected', badge: 'badge-grey', dot: 'dot-grey', detail: 'No Razorpay credentials configured. Running in simulated demo mode.' }
      : rz.mode === 'LIVE'
        ? { label: 'Connected — Live API', badge: 'badge-green', dot: 'dot-green', detail: `Live account ${rz.account} · submissions go to real Razorpay.` }
        : { label: 'Connected — Test API', badge: 'badge-green', dot: 'dot-green', detail: `Test account ${rz.account} · submissions are SIMULATED (no real Razorpay call).` };

  return (
    <>
      <div className="page-title" style={{ fontSize: 24 }}>Settings</div>
      <div className="page-sub">Workspace connection and demo environment controls.</div>

      {resetMsg && <Alert kind="green" icon="check" style={{ marginTop: 12 }}>{resetMsg}</Alert>}
      {error && <Alert kind="red" icon="warn" style={{ marginTop: 12 }}>{error}</Alert>}

      {/* Razorpay connection — derived from the backend, never hardcoded */}
      <div className="card-title" style={{ marginTop: 22 }}>Razorpay Connection</div>
      <div className="card card-pad">
        <div className="setting-row">
          <div>
            <div className="label">Connection status</div>
            <div className="desc">Derived live from the backend. DisputeIQ never fabricates a connection.</div>
          </div>
          <span className={`badge ${rzState.badge}`}><span className={rzState.dot} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, marginRight: 6, background: 'currentColor' }} /> {rzState.label}</span>
        </div>
        <div className="setting-row" style={{ borderBottom: 'none' }}>
          <div>
            <div className="label">Environment</div>
            <div className="kv">{rzState.detail}</div>
          </div>
          <span className="badge badge-grey">v{status?.version ?? '—'}</span>
        </div>
      </div>

      {/* AI provider */}
      <div className="card-title" style={{ marginTop: 22 }}>AI Provider</div>
      <div className="card card-pad">
        <div className="setting-row" style={{ borderBottom: 'none' }}>
          <div>
            <div className="label">Analysis engine</div>
            <div className="desc">Used for evidence classification, timeline extraction and draft generation.</div>
          </div>
          <span className="badge badge-blue">
            {status?.aiProvider ? `${status.aiProvider.provider} · ${status.aiProvider.model}` : '—'}
          </span>
        </div>
      </div>

      {/* Demo environment — the only state-changing controls here are real */}
      <div className="card-title" style={{ marginTop: 22 }}>Demo Environment</div>
      <div className="card card-pad">
        <div className="setting-row">
          <div>
            <div className="label">Synthetic dataset</div>
            <div className="desc">
              {status?.demo.active
                ? `${status.demo.disputeCount} disputes and ${status.demo.evidenceCount} evidence documents currently loaded.`
                : 'No synthetic disputes loaded.'}
            </div>
          </div>
          <span className={`badge ${status?.demo.active ? 'badge-green' : 'badge-grey'}`}>{status?.demo.active ? 'Active' : 'Empty'}</span>
        </div>
        <div className="setting-row" style={{ borderBottom: 'none' }}>
          <div>
            <div className="label">Reset demo data</div>
            <div className="desc">Clear all synthetic disputes, evidence and derived state, then reload a fresh 100-dispute dataset. Submissions are also cleared.</div>
          </div>
          {confirmReset ? (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" disabled={resetting} onClick={doReset}>{resetting ? 'Resetting…' : 'Confirm reset'}</button>
              <button className="btn btn-ghost" disabled={resetting} onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>Reset</button>
          )}
        </div>
      </div>
    </>
  );
}
