interface Props {
  p: number | null;
  significant: boolean | null;
}

export function SignificanceIndicator({ p, significant }: Props) {
  const isSig = significant === true || (p !== null && p !== undefined && p < 0.05);
  const color = isSig ? "#059669" : "#d97706";
  const bg = isSig ? "#ecfdf5" : "#fffbeb";
  const badge = isSig ? "Significatiu" : "No significatiu";

  const formattedP =
    p !== null && p !== undefined
      ? p < 0.001
        ? "p < 0.001"
        : `p = ${p.toFixed(3)}`
      : "p = —";

  return (
    <div className="stat-evidence-card">
      <div className="stat-evidence-label">Significació estadística</div>
      <div className="stat-evidence-value" style={{ color, fontSize: "1.2rem" }}>
        {formattedP}
      </div>
      <span className="stat-evidence-badge" style={{ color, background: bg }}>
        {badge}
      </span>
      <div className="stat-evidence-hint">Wilcoxon — el canvi és real o podria ser atzar?</div>
      <div className="stat-evidence-plain">
        {isSig
          ? "Amb p < 0,05, la millora no s'explica bé només per l'atzar."
          : "Encara no hi ha prou evidència per descartar l'atzar (cal més dades o més temps)."}
      </div>
    </div>
  );
}
