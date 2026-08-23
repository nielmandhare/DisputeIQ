import { ReactNode } from 'react';
import { IconWarn, IconCheck } from './Icons';

type Kind = 'red' | 'amber' | 'blue' | 'orange';
export function Alert({ kind, children, icon, style }: { kind: Kind; children: ReactNode; icon?: 'warn' | 'check'; style?: React.CSSProperties }) {
  const ic = icon === 'check' ? <IconCheck size={16} /> : <IconWarn size={16} />;
  return (
    <div className={`alert alert-${kind}`} style={style}>
      <span className="ai">{ic}</span>
      <span>{children}</span>
    </div>
  );
}


