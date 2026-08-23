import { useState } from 'react';
import { Alert } from '../components/Alert';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" />
    </label>
  );
}

const INPUT: React.CSSProperties = {
  width: 320, maxWidth: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--card-border)', fontSize: 14, fontFamily: 'inherit',
};

export default function Settings() {
  const [merchantName, setMerchantName] = useState('Niel Mandhare');
  const [email, setEmail] = useState('nielmandhare1@gmail.com');
  const [tz, setTz] = useState('Asia/Kolkata (IST)');

  const [testMode, setTestMode] = useState(true);
  const [autoIngest, setAutoIngest] = useState(true);
  const [aiContradiction, setAiContradiction] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [demoData, setDemoData] = useState(true);

  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <>
      <div className="page-title" style={{ fontSize: 24 }}>Settings</div>
      <div className="page-sub">Manage your workspace, Razorpay connection and demo environment.</div>

      {saved && <Alert kind="green" icon="check" style={{ marginTop: 12 }}>Preferences saved (demo — not persisted to backend yet).</Alert>}

      {/* Profile */}
      <div className="card-title" style={{ marginTop: 22 }}>Profile</div>
      <div className="card card-pad">
        <div className="setting-row">
          <div>
            <div className="label">Merchant name</div>
            <div className="desc">Displayed on dossiers and audit entries.</div>
          </div>
          <input style={INPUT} value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
        </div>
        <div className="setting-row">
          <div>
            <div className="label">Email</div>
            <div className="desc">Where submission confirmations and digests are sent.</div>
          </div>
          <input style={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="setting-row">
          <div>
            <div className="label">Time zone</div>
            <div className="desc">Used for deadlines and audit timestamps.</div>
          </div>
          <select className="btn" value={tz} onChange={(e) => setTz(e.target.value)}>
            <option>Asia/Kolkata (IST)</option>
            <option>Asia/Dubai (GST)</option>
            <option>UTC</option>
            <option>America/New_York (ET)</option>
          </select>
        </div>
      </div>

      {/* Razorpay connection */}
      <div className="card-title" style={{ marginTop: 22 }}>Razorpay Connection</div>
      <div className="card card-pad">
        <div className="setting-row">
          <div>
            <div className="label">Test mode</div>
            <div className="desc">Route calls to Razorpay sandbox credentials. Required for the hackathon build.</div>
          </div>
          <Toggle on={testMode} onChange={setTestMode} />
        </div>
        <div className="setting-row">
          <div>
            <div className="label">Connected account</div>
            <div className="kv"><b>razorpay_test_merchant_8K72</b> · v1.4.2 · {testMode ? 'Test' : 'Live'} environment</div>
          </div>
          <span className="badge badge-green">● Connected</span>
        </div>
        {!testMode && (
          <Alert kind="amber" style={{ marginTop: 10 }}>Live mode is disabled in this demo. Switch back to Test mode to continue exploring.</Alert>
        )}
      </div>

      {/* Workflow */}
      <div className="card-title" style={{ marginTop: 22 }}>Workflow</div>
      <div className="card card-pad">
        <div className="setting-row">
          <div>
            <div className="label">Auto-ingest new evidence</div>
            <div className="desc">Automatically run text extraction and classification when a document is uploaded.</div>
          </div>
          <Toggle on={autoIngest} onChange={setAutoIngest} />
        </div>
        <div className="setting-row">
          <div>
            <div className="label">AI contradiction detection</div>
            <div className="desc">Cross-reference documents for timeline and logic conflicts.</div>
          </div>
          <Toggle on={aiContradiction} onChange={setAiContradiction} />
        </div>
        <div className="setting-row">
          <div>
            <div className="label">Daily email digest</div>
            <div className="desc">Summary of disputes with approaching deadlines.</div>
          </div>
          <Toggle on={emailDigest} onChange={setEmailDigest} />
        </div>
      </div>

      {/* Demo environment */}
      <div className="card-title" style={{ marginTop: 22 }}>Demo Environment</div>
      <div className="card card-pad">
        <div className="setting-row">
          <div>
            <div className="label">Use demo data</div>
            <div className="desc">Show seeded disputes (e.g. disp_test_8K72) instead of an empty workspace.</div>
          </div>
          <Toggle on={demoData} onChange={setDemoData} />
        </div>
        <div className="setting-row">
          <div>
            <div className="label">Reset demo data</div>
            <div className="desc">Restore the original seeded disputes and evidence.</div>
          </div>
          {confirmReset ? (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" onClick={() => { setConfirmReset(false); setSaved(true); setTimeout(() => setSaved(false), 2500); }}>Confirm reset</button>
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>Reset</button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="card-title" style={{ marginTop: 22, color: 'var(--red-text)' }}>Danger Zone</div>
      <div className="card card-pad" style={{ borderColor: 'var(--red-border)' }}>
        <div className="setting-row" style={{ borderBottom: 'none' }}>
          <div>
            <div className="label" style={{ color: 'var(--red-text)' }}>Disconnect Razorpay</div>
            <div className="desc">Remove stored credentials and sign out of the connected test account.</div>
          </div>
          {confirmDisconnect ? (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-danger" onClick={() => setConfirmDisconnect(false)}>Confirm disconnect</button>
              <button className="btn btn-ghost" onClick={() => setConfirmDisconnect(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-danger-outline" onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-primary" onClick={save}>Save changes</button>
      </div>
    </>
  );
}
