interface Props {
  d: number | null;
  label: string | null;
}

const LABEL_CONFIG: Record<string, { color: string; bg: string; text: string }> = {
  trivial:   { color: "#6b7280", bg: "#f3f4f6",  text: "Trivial" },
  pequeño:   { color: "#3b82f6", bg: "#eff6ff",  text: "Petit" },
  medio:     { color: "#d97706", bg: "#fffbeb",  text: "Mig" },
  grande:    { color: "#059669", bg: "#ecfdf5",  text: "Gran" },
  gran:      { color: "#059669", bg: "#ecfdf5",  text: "Gran" },
};

const DEFAULT_CONFIG = { color: "#94a3b8", bg: "#f8fafc", text: "—" };

export function EffectSizeCard({ d, label }: Props) {
  const cfg = (label && LABEL_CONFIG[label]) ?? DEFAULT_CONFIG;

  return (
    <div className="stat-evidence-card">
      <div className="stat-evidence-label">Mida de l'Efecte</div>
      <div className="stat-evidence-value" style={{ color: cfg.color }}>
        {d !== null && d !== undefined ? `d = ${d.toFixed(2)}` : "d = —"}
      </div>
      <span className="stat-evidence-badge" style={{ color: cfg.color, background: cfg.bg }}>
        {cfg.text}
      </span>
      <div className="stat-evidence-hint">Cohen's dz (1988)</div>
    </div>
  );
}
