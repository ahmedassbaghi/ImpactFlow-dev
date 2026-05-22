const OUTCOME_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  family_tutoring_savings: {
    label: "Estalvi per a les famílies",
    desc: "Menys despesa en reforç escolar privat gràcies al progrés de l'infant.",
    color: "var(--dim-academic)",
  },
  public_services_saved: {
    label: "Menys càrrega en serveis socials",
    desc: "Menys situacions de risc que requereixen suport públic intensiu.",
    color: "var(--risk-high)",
  },
  integration_gains: {
    label: "Millora en integració",
    desc: "Llengua, pertinença i autonomia: valor social de la inclusió.",
    color: "var(--dim-integration)",
  },
  program_delivery_value: {
    label: "Suport educatiu directe",
    desc: "Hores de sessió registrades; rendiment decreixent per sobre de la intensitat esperada.",
    color: "var(--dim-social)",
  },
};

interface Props {
  breakdown: Record<string, number>;
  totalLabel?: string;
}

export default function SROIOutcomesBreakdown({
  breakdown,
  totalLabel = "Beneficis totals mesurats",
}: Props) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="sroi-breakdown">
      <div className="sroi-breakdown-title">Impacte per àrees</div>
      {entries.map(([key, value]) => {
        const meta = OUTCOME_LABELS[key] ?? { label: key, desc: "", color: "var(--brand-500)" };
        const pct = total > 0 ? (value / total) * 100 : 0;
        return (
          <div key={key} className="sroi-breakdown-row">
            <div className="sroi-breakdown-meta">
              <span className="sroi-breakdown-label">{meta.label}</span>
              <span className="sroi-breakdown-value">€{value.toLocaleString("ca-ES")}</span>
            </div>
            {meta.desc && <p className="sroi-outcome-desc">{meta.desc}</p>}
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
        <span>{totalLabel}</span>
        <strong>€{total.toLocaleString("ca-ES")}</strong>
      </div>
    </div>
  );
}
