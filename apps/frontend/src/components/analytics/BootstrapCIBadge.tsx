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
      <div className="stat-evidence-hint">IPI mig final</div>
    </div>
  );
}
