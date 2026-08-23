import { ReactNode } from 'react';
import { IconBell } from '../Icons';

interface TopBarProps {
  breadcrumbs: ReactNode;
}

export default function TopBar({ breadcrumbs }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="breadcrumbs">{breadcrumbs}</div>
      <div className="demo-banner">
        DEMO MODE — Webhook and document upload are simulated. All other API calls use real Razorpay test credentials.
      </div>
      <div className="topbar-right">
        <span className="bell"><IconBell size={18} /></span>
        <div className="user">
          <span className="avatar">NM</span>
          <span className="uname">Niel Mandhare</span>
        </div>
      </div>
    </header>
  );
}
