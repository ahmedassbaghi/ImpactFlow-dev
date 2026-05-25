interface Props {
  d: number | null;
  label: string | null;
}

const LABEL_CONFIG: Record<string, { color: string; bg: string; text: string }> = {
  trivial: { color: "#6b7280", bg: "#f3f4f6", text: "Trivial" },
  petit: { color: "#3b82f6", bg: "#eff6ff", text: "Petit" },
  mig: { color: "#d97706", bg: "#fffbeb", text: "Mig" },
  gran: { color: "#059669", bg: "#ecfdf5", text: "Gran" },
  pequeño: { color: "#3b82f6", bg: "#eff6ff", text: "Petit" },
  medio: { color: "#d97706", bg: "#fffbeb", text: "Mig" },
  grande: { color: "#059669", bg: "#ecfdf5", text: "Gran" },
};

const DEFAULT_CONFIG = { color: "#94a3b8", bg: "#f8fafc", text: "—" };

export function EffectSizeCard({ d, label }: Props) {
  const cfg = (label ? LABEL_CONFIG[label] : undefined) ?? DEFAULT_CONFIG;

  return (
    <div className="stat-evidence-card">
      <div className="stat-evidence-label">Mida de l&apos;efecte</div>
      <div className="stat-evidence-value" style={{ color: cfg.color }}>
        {d !== null && d !== undefined ? `d = ${d.toFixed(2)}` : "d = —"}
      </div>
      <span className="stat-evidence-badge" style={{ color: cfg.color, background: cfg.bg }}>
        {cfg.text}
      </span>
      <div className="stat-evidence-hint">Cohen&apos;s d — quant de gran és el canvi (no si és atzar)</div>
      <div className="stat-evidence-plain">
        {d === null || d === undefined
          ? "Sense dades suficients per calcular."
          : Math.abs(d) < 0.2
            ? "El canvi és molt petit en termes educatius."
            : Math.abs(d) < 0.5
              ? "Hi ha una millora modesta però observable."
              : Math.abs(d) < 0.8
                ? "La millora és moderada i rellevant al programa."
                : "La millora és gran segons estàndards educatius."}
      </div>
    </div>
  );
}
