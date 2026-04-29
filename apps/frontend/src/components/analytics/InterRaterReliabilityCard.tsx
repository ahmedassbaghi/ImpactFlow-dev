import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Users } from "lucide-react";
import { getInterRaterReliability } from "../../api/dashboard";

const DIM_LABEL: Record<string, string> = {
  academic: "Acadèmic",
  cognitive: "Cognitiu",
  social: "Social",
  integration: "Integració",
};

const DIM_COLOR: Record<string, string> = {
  academic: "var(--dim-academic)",
  cognitive: "var(--dim-cognitive)",
  social: "var(--dim-social)",
  integration: "var(--dim-integration)",
};

const BIAS_LABEL: Record<string, string> = {
  leniency: "biaix indulgent",
  severity: "biaix sever",
  central_tendency: "tendència central",
};

const INTERP_COLOR: Record<string, string> = {
  "pobre": "#dc2626",
  "moderada": "#d97706",
  "bona": "#0ea5e9",
  "excel·lent": "#059669",
};

function Gauge({ value, color }: { value: number; color: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, value));
  return (
    <svg width={110} height={110} viewBox="0 0 110 110">
      <circle cx={55} cy={55} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={9} />
      <motion.circle
        cx={55} cy={55} r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 55 55)"
        initial={{ strokeDasharray: `0 ${c}` }}
        animate={{ strokeDasharray: `${dash} ${c - dash}` }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
    </svg>
  );
}

export function InterRaterReliabilityCard({ programId }: { programId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["irr", programId],
    queryFn: () => getInterRaterReliability(programId),
    enabled: !!programId,
  });

  if (isLoading) {
    return (
      <div className="card irr-card">
        <div style={{ width: 110, height: 110 }} className="skel" />
        <div style={{ flex: 1 }}>
          <span className="skel" style={{ display: "block", width: "60%", height: 14, marginBottom: 8 }} />
          <span className="skel" style={{ display: "block", width: "85%", height: 10 }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card" style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        No s'ha pogut calcular la fiabilitat inter-avaluador.
      </div>
    );
  }

  const interp = data.icc_interpretation || "—";
  const color = INTERP_COLOR[interp] ?? "#6b7280";
  const overall = Number.isFinite(data.overall_icc) ? data.overall_icc : 0;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 4px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldCheck size={15} strokeWidth={2.2} style={{ color: "var(--brand-500)" }} />
        <strong style={{ fontSize: "0.92rem" }}>Fiabilitat inter-avaluador (ICC 2,1)</strong>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>
          Concordança entre professionals
        </span>
      </div>

      <div className="irr-card">
        <div className="irr-gauge">
          <Gauge value={overall} color={color} />
          <div className="irr-gauge-value">{overall.toFixed(2)}</div>
          <div className="irr-gauge-label" style={{ color }}>{interp}</div>
        </div>

        <div>
          <div className="irr-info-row">
            <div className="irr-info-stat">
              <span className="irr-info-stat-label"><Users size={10} style={{ display: "inline" }} /> Avaluadors</span>
              <span className="irr-info-stat-value">{data.n_raters}</span>
            </div>
            <div className="irr-info-stat">
              <span className="irr-info-stat-label">Observacions</span>
              <span className="irr-info-stat-value">{data.n_observations}</span>
            </div>
            <div className="irr-info-stat">
              <span className="irr-info-stat-label">Alertes biaix</span>
              <span className="irr-info-stat-value">{data.bias_alerts.length}</span>
            </div>
          </div>

          <div className="irr-dim-grid">
            {Object.entries(data.icc_by_dimension).map(([dim, value]) => {
              const v = Number.isFinite(value) ? Number(value) : 0;
              const pct = Math.max(0, Math.min(1, v));
              return (
                <div key={dim} className="irr-dim">
                  <span className="irr-dim-label">{DIM_LABEL[dim] ?? dim}</span>
                  <div className="irr-dim-bar">
                    <motion.div
                      className="irr-dim-bar-fill"
                      style={{ background: DIM_COLOR[dim] ?? color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct * 100}%` }}
                      transition={{ duration: 0.9, ease: "easeOut" }}
                    />
                  </div>
                  <span className="irr-dim-value">{v.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {data.bias_alerts.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div className="irr-bias-list">
            {data.bias_alerts.slice(0, 4).map((b, i) => (
              <div key={i} className="irr-bias-item">
                <AlertTriangle size={13} strokeWidth={2.2} style={{ color: "var(--risk-medium)" }} />
                <span>
                  Avaluador <code style={{ fontFamily: "ui-monospace, monospace" }}>{b.rater_id.slice(0, 6)}</code>{" "}
                  · {DIM_LABEL[b.dimension] ?? b.dimension} · <strong>{BIAS_LABEL[b.bias_type] ?? b.bias_type}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
