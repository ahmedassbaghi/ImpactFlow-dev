interface Props {
  p: number | null;
  significant: boolean | null;
}

export function SignificanceIndicator({ p, significant }: Props) {
  const isSig = significant === true || (p !== null && p !== undefined && p < 0.05);
  const color  = isSig ? "#059669" : "#d97706";
  const bg     = isSig ? "#ecfdf5" : "#fffbeb";
  const label  = isSig ? "✓ Significatiu" : "⚠ No significatiu";

  const formattedP =
    p !== null && p !== undefined
      ? p < 0.001
        ? "p < 0.001"
        : `p = ${p.toFixed(3)}`
      : "p = —";

  return (
    <div className="stat-evidence-card">
      <div className="stat-evidence-label">Significança</div>
      <div className="stat-evidence-value" style={{ color, fontSize: "1.2rem" }}>
        {formattedP}
      </div>
      <span className="stat-evidence-badge" style={{ color, background: bg }}>
        {label}
      </span>
      <div className="stat-evidence-hint">Wilcoxon signed-rank</div>
    </div>
  );
}
