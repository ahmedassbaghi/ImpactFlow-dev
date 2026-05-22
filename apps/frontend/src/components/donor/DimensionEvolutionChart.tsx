import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export type DimensionEvolution = Record<
  string,
  { baseline: number; current: number; gain: number }
>;

type DimMeta = {
  label: string;
  desc: string;
  color: string;
};

type Props = {
  dimensions: DimensionEvolution;
  dimLabels: Record<string, string>;
  dimDescs: Record<string, string>;
  dimColors: Record<string, string>;
};

function barWidth(value: number): string {
  const pct = Math.max(0, Math.min(100, value));
  return pct < 2 && pct > 0 ? "2%" : `${pct}%`;
}

export default function DimensionEvolutionChart({
  dimensions,
  dimLabels,
  dimDescs,
  dimColors,
}: Props) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(t);
  }, [dimensions]);

  return (
    <div className="dim-evolution" role="list">
      {Object.entries(dimensions).map(([dim, data]) => {
        const baseline = data?.baseline ?? 0;
        const current = data?.current ?? 0;
        const gain = data?.gain ?? 0;
        const color = dimColors[dim] ?? "var(--brand-500)";
        const meta: DimMeta = {
          label: dimLabels[dim] ?? dim,
          desc: dimDescs[dim] ?? "",
          color,
        };

        return (
          <article key={dim} className="dim-evolution-card" role="listitem">
            <header className="dim-evolution-header">
              <div>
                <h3 className="dim-evolution-title" style={{ color: meta.color }}>
                  {meta.label}
                </h3>
                {meta.desc && <p className="dim-evolution-desc">{meta.desc}</p>}
              </div>
              <span
                className="dim-evolution-gain"
                style={{
                  color:
                    gain > 0
                      ? "var(--risk-low)"
                      : gain < 0
                        ? "var(--risk-high)"
                        : "var(--donor-muted)",
                }}
              >
                {gain > 0 ? "+" : ""}
                {gain.toFixed(1)} pts
              </span>
            </header>

            <div className="dim-evolution-bars" aria-label={`${meta.label}: entrada ${baseline.toFixed(0)}, ara ${current.toFixed(0)} punts`}>
              <div className="dim-evolution-row">
                <span className="dim-evolution-row-label">Entrada</span>
                <div className="dim-evolution-track">
                  <motion.div
                    className="dim-evolution-fill dim-evolution-fill--baseline"
                    style={{
                      background: color,
                      width: animate ? barWidth(baseline) : "0%",
                    }}
                    initial={false}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                </div>
                <span className="dim-evolution-value">{baseline.toFixed(0)}</span>
              </div>
              <div className="dim-evolution-row">
                <span className="dim-evolution-row-label">Ara</span>
                <div className="dim-evolution-track">
                  <motion.div
                    className="dim-evolution-fill dim-evolution-fill--current"
                    style={{
                      background: color,
                      width: animate ? barWidth(current) : "0%",
                    }}
                    initial={false}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.15 }}
                  />
                </div>
                <span className="dim-evolution-value">{current.toFixed(0)}</span>
              </div>
            </div>

            <div className="dim-evolution-scale" aria-hidden>
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
