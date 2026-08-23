import { NavLink } from 'react-router-dom';
import {
  IconOverview, IconDisputes, IconEvidence, IconActivity, IconSettings, IconHelp,
} from '../Icons';

const nav = [
  { to: '/overview', label: 'Overview', Icon: IconOverview },
  { to: '/disputes', label: 'Disputes', Icon: IconDisputes },
  { to: '/evidence', label: 'Evidence', Icon: IconEvidence },
  { to: '/activity', label: 'Activity', Icon: IconActivity },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="iq">IQ</div>
        <div className="name">DisputeIQ</div>
      </div>

      <nav className="nav-section">
        {nav.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="ic"><Icon size={18} /></span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="workspace-label">Workspace</div>
      <div className="workspace-name">Demo Environment</div>

      <div className="nav-spacer" />

      <nav className="nav-section">
        <div className="nav-item"><span className="ic"><IconSettings size={18} /></span><span>Settings</span></div>
        <div className="nav-item"><span className="ic"><IconHelp size={18} /></span><span>Help &amp; Docs</span></div>
      </nav>

      <div className="sidebar-footer">
        <div className="testmode"><span className="dot-green" /> Razorpay Test Mode</div>
        <div className="testmode-sub">v1.4.2 Connected</div>
      </div>
    </aside>
  );
}
