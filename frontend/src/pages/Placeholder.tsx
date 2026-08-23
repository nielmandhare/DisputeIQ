export default function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <>
      <div className="page-title">{title}</div>
      <div className="page-sub">{text}</div>
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="muted">This section is part of the DisputeIQ navigation shell. The hackathon demo focuses on the dispute workflow (Disputes → Detail → Evidence → Contradiction → Gaps → Dossier → Approval → Audit).</div>
      </div>
    </>
  );
}
