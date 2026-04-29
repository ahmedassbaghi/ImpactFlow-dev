interface Props {
  lower: number | null | undefined;
  upper: number | null | undefined;
  confidence?: number;
}

export function BootstrapCIBadge({ lower, upper, confidence = 0.95 }: Props) {
  const hasData = lower !== null && lower !== undefined && upper !== null && upper !== undefined;
  const label = hasData ? `[${lower!.toFixed(1)} – ${upper!.toFixed(1)}]` : "—";

  return (
    <div className="stat-evidence-card">
      <div className="stat-evidence-label">IC {Math.round(confidence * 100)}%</div>
      <div
        className="stat-evidence-value"
        style={{ color: "#4f46e5", fontSize: "1.1rem", letterSpacing: "-0.01em" }}
      >
        {label}
      </div>
      <span
        className="stat-evidence-badge"
        style={{ color: "#4f46e5", background: "#eef2ff" }}
      >
        Bootstrap n=2000
      </span>
      <div className="stat-evidence-hint">Bootstrap n=2000 — interval de l'IPI final</div>
      <div className="stat-evidence-plain">
        {hasData
          ? `Amb un 95% de confiança, l'IPI mig final del grup es troba entre ${lower!.toFixed(1)} i ${upper!.toFixed(1)} punts.`
          : "Sense dades suficients per calcular l'interval."}
      </div>
    </div>
  );
}
