interface ErsGaugeProps { score: number; label: string; }
// Semicircular gauge matching the Figma "82 / 100 MODERATE COMPLETENESS" widget.
export default function ErsGauge({ score, label }: ErsGaugeProps) {
  const color = score >= 85 ? '#16a34a' : score >= 65 ? '#f59e0b' : score >= 40 ? '#ea580c' : '#dc2626';
  const R = 90, cx = 110, cy = 110, circ = Math.PI * R; // half circle
  const dash = (score / 100) * circ;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={220} height={128} viewBox="0 0 220 128">
        <path d={`M20 ${cy} A ${R} ${R} 0 0 1 200 ${cy}`} fill="none" stroke="#e2e8f0" strokeWidth={14} strokeLinecap="round" />
        <path d={`M20 ${cy} A ${R} ${R} 0 0 1 200 ${cy}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} />
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize={40} fontWeight={800} fill="#1e293b">{score}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={14} fill="#64748b">/ 100</text>
      </svg>
      <div className="badge" style={{ background: `${color}1a`, color, fontSize: 12, fontWeight: 700, marginTop: -6 }}>
        {label.toUpperCase()} COMPLETENESS
      </div>
    </div>
  );
}

export function ConfidenceBar({ value, color }: { value: number; color?: string }) {
  const c = color ?? (value >= 85 ? '#16a34a' : value >= 70 ? '#2563eb' : '#ea580c');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="ers-bar" style={{ minWidth: 110 }}><span style={{ width: `${value}%`, background: c, display: 'block', height: '100%', borderRadius: 999 }} /></span>
      <span style={{ fontWeight: 700, color: c, fontSize: 13 }}>{value}%</span>
    </span>
  );
}
