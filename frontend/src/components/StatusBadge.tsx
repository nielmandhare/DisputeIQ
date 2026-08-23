import { DisputeStatus } from '../types';

const MAP: Record<string, { cls: string; label: string }> = {
  PENDING_REVIEW: { cls: 'badge-amber', label: 'PENDING REVIEW' },
  EVIDENCE_MISSING: { cls: 'badge-red', label: 'EVIDENCE MISSING' },
  CONTRADICTION: { cls: 'badge-red', label: '⚠ CONTRADICTION' },
  SUBMITTED: { cls: 'badge-blue', label: 'SUBMITTED' },
  PROCESSING: { cls: 'badge-grey', label: 'PROCESSING' },
  RESOLVED: { cls: 'badge-green', label: 'RESOLVED' },
  UNDER_REVIEW: { cls: 'badge-blue', label: 'UNDER REVIEW' },
  APPROVED: { cls: 'badge-green', label: 'APPROVED' },
  SUBMISSION_FAILED: { cls: 'badge-red', label: 'SUBMISSION FAILED' },
  RECEIVED: { cls: 'badge-grey', label: 'RECEIVED' },
  AWAITING_EVIDENCE: { cls: 'badge-grey', label: 'AWAITING EVIDENCE' },
  ANALYSIS_COMPLETE: { cls: 'badge-amber', label: 'ANALYSIS COMPLETE' },
};

export function StatusBadge({ status }: { status: DisputeStatus }) {
  const m = MAP[status] ?? { cls: 'badge-grey', label: status };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function ErsBar({ score }: { score: number }) {
  const cls = score >= 85 ? 'ers-strong' : score >= 65 ? 'ers-moderate' : score >= 40 ? 'ers-weak' : 'ers-incomplete';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="ers-bar"><span className={cls} style={{ width: `${score}%` }} /></span>
      <span className={`ers-text-${cls.replace('ers-', '')}`}>{score}</span>
    </span>
  );
}

export function ErsLabel({ score }: { score: number }) {
  const txt = score >= 85 ? 'ers-text-strong' : score >= 65 ? 'ers-text-moderate' : score >= 40 ? 'ers-text-weak' : 'ers-text-incomplete';
  const label = score >= 85 ? 'Strong' : score >= 65 ? 'Moderate' : score >= 40 ? 'Weak' : 'Incomplete';
  return <span className={txt} style={{ fontWeight: 700 }}>{label}</span>;
}
