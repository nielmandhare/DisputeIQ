import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import { ReactNode } from 'react';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function Shell({ children, breadcrumbs }: { children: ReactNode; breadcrumbs: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <TopBar breadcrumbs={breadcrumbs} />
        <div className="content content-narrow">{children}</div>
      </div>
    </div>
  );
}

import Overview from './pages/Overview';
import Disputes from './pages/Disputes';
import DisputeDetail from './pages/DisputeDetail';
import Classification from './pages/Classification';
import Contradiction from './pages/Contradiction';
import Gaps from './pages/Gaps';
import Dossier from './pages/Dossier';
import Approval from './pages/Approval';
import Submitted from './pages/Submitted';
import EvidenceIssue from './pages/EvidenceIssue';
import Evidence from './pages/Evidence';
import AIAnalysis from './pages/AIAnalysis';
import Audit from './pages/Audit';
import Activity from './pages/Activity';

import Settings from './pages/Settings';
import HelpDocs from './pages/HelpDocs';

export default function App() {
  useKeyboardShortcuts();
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<Shell breadcrumbs={<><b>DisputeIQ</b> / Overview</>}><Overview /></Shell>} />
      <Route path="/disputes" element={<Shell breadcrumbs={<><b>DisputeIQ</b> / Disputes</>}><Disputes /></Shell>} />
      <Route path="/disputes/:id" element={<Shell breadcrumbs={<DisputeBreadcrumb />}><DisputeDetail /></Shell>} />
      <Route path="/disputes/:id/classification" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Classification" />}><Classification /></Shell>} />
      <Route path="/disputes/:id/contradiction" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Contradiction" />}><Contradiction /></Shell>} />
      <Route path="/disputes/:id/gaps" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Evidence Analysis" />}><Gaps /></Shell>} />
      <Route path="/disputes/:id/dossier" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Dossier" />}><Dossier /></Shell>} />
      <Route path="/disputes/:id/approval" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Approval" />}><Approval /></Shell>} />
      <Route path="/disputes/:id/submitted" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Submitted" />}><Submitted /></Shell>} />
      <Route path="/disputes/:id/evidence-issue" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Evidence Issue" />}><EvidenceIssue /></Shell>} />
      <Route path="/disputes/:id/audit" element={<Shell breadcrumbs={<DisputeBreadcrumb suffix="Audit Trail" />}><Audit /></Shell>} />
      <Route path="/evidence" element={<Shell breadcrumbs={<><b>DisputeIQ</b> / Evidence</>}><Evidence /></Shell>} />
      <Route path="/ai-analysis" element={<Shell breadcrumbs={<><b>DisputeIQ</b> / AI Analysis</>}><AIAnalysis /></Shell>} />
      <Route path="/activity" element={<Shell breadcrumbs={<><b>DisputeIQ</b> / Activity</>}><Activity /></Shell>} />
      <Route path="/settings" element={<Shell breadcrumbs={<><b>DisputeIQ</b> / Settings</>}><Settings /></Shell>} />
      <Route path="/help" element={<Shell breadcrumbs={<><b>DisputeIQ</b> / Help & Docs</>}><HelpDocs /></Shell>} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

function DisputeBreadcrumb({ suffix }: { suffix?: string }) {
  const id = useLocation().pathname.split('/')[2] ?? 'disp_test_8K72';
  return <><a className="link-blue" href="/disputes">Disputes</a> / <b>{id}</b>{suffix ? ` / ${suffix}` : ''}</>;
}
