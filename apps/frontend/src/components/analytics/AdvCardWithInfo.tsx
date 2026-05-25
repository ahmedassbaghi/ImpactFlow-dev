import type { ReactNode } from "react";
import { Info } from "lucide-react";

type Props = {
  children: ReactNode;
  infoTitle: string;
  info: ReactNode;
  className?: string;
};

/** Targeta d'analítica amb panell lateral discret (details) d'explicació. */
export function AdvCardWithInfo({ children, infoTitle, info, className }: Props) {
  return (
    <div
      className={["adv-card", "adv-card--with-info", className].filter(Boolean).join(" ")}
    >
      <div className="adv-card-main">{children}</div>
      <details className="adv-chart-info">
        <summary className="adv-chart-info-trigger" aria-label={infoTitle}>
          <Info size={14} strokeWidth={2} aria-hidden />
        </summary>
        <div className="adv-chart-info-panel">
          <p className="adv-chart-info-heading">{infoTitle}</p>
          <div className="adv-chart-info-body">{info}</div>
        </div>
      </details>
    </div>
  );
}
