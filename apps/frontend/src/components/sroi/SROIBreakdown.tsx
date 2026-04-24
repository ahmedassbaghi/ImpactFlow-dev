const BREAKDOWN_LABELS: Record<string, { label: string; color: string }> = {
  academic_improvement: { label: "Millora acadèmica", color: "var(--dim-academic)" },
  exclusion_risk_reduction: { label: "Reducció risc exclusió", color: "var(--risk-high)" },
  integration_value: { label: "Valor d'integració", color: "var(--dim-integration)" },
  attendance_value: { label: "Suport educatiu", color: "var(--dim-social)" },
};

interface SROIBreakdownProps {
  breakdown: Record<string, number>;
}

export default function SROIBreakdown({ breakdown }: SROIBreakdownProps) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="sroi-breakdown">
      <div className="sroi-breakdown-title">Components del Valor Social</div>
      {entries.map(([key, value]) => {
        const meta = BREAKDOWN_LABELS[key] ?? { label: key, color: "var(--brand-500)" };
        const pct = total > 0 ? (value / total) * 100 : 0;
        return (
          <div key={key} className="sroi-breakdown-row">
            <div className="sroi-breakdown-meta">
              <span className="sroi-breakdown-label">{meta.label}</span>
              <span className="sroi-breakdown-value">€{value.toLocaleString("ca-ES")}</span>
            </div>
            <div className="sroi-breakdown-bar-track">
              <div
                className="sroi-breakdown-bar-fill"
                style={{ width: `${pct.toFixed(1)}%`, background: meta.color }}
              />
            </div>
          </div>
        );
      })}
      <div className="sroi-breakdown-total">
        <span>Total valor social generat</span>
        <strong>€{total.toLocaleString("ca-ES")}</strong>
      </div>
    </div>
  );
}
