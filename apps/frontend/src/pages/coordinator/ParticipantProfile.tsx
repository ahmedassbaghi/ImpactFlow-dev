import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  getParticipantEvolution,
  getParticipantRisk,
  getParticipantPredictionProbabilistic,
  getDropoutProbability,
  getParticipantCluster,
} from "../../api/participants";

const TABS = ["Evolució", "Predicció", "Anàlisi", "Alertes"] as const;
type Tab = (typeof TABS)[number];

const RISK_COLOR: Record<string, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
};

const DIM_COLORS: Record<string, string> = {
  academic: "var(--dim-academic)",
  cognitive: "var(--dim-cognitive)",
  social: "var(--dim-social)",
  integration: "var(--dim-integration)",
};

const DIM_LABELS: Record<string, string> = {
  academic: "Acadèmic",
  cognitive: "Cognitiu",
  social: "Social",
  integration: "Integració",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  const labels: Record<string, string> = { low: "Risc Baix", medium: "Risc Mitjà", high: "Risc Alt" };
  return (
    <span
      style={{
        padding: "0.2rem 0.7rem",
        borderRadius: 999,
        fontSize: "0.78rem",
        fontWeight: 700,
        color: "white",
        background: RISK_COLOR[level] || "#6b7280",
      }}
    >
      {labels[level] || level}
    </span>
  );
}

function TrendArrow({ trend }: { trend?: string }) {
  if (trend === "improving") return <span style={{ color: "var(--trend-up)" }}>↑</span>;
  if (trend === "declining") return <span style={{ color: "var(--trend-down)" }}>↓</span>;
  return <span style={{ color: "var(--trend-stable)" }}>→</span>;
}

function ProbabilityBar({ value, color = "var(--brand-500)" }: { value: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          background: "var(--surface-3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(value * 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: "0.85rem", fontWeight: 700, minWidth: 36, textAlign: "right" }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ParticipantProfile() {
  const { participantId } = useParams<{ participantId: string }>();
  const [searchParams] = useSearchParams();
  const programId = searchParams.get("program_id") ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("Evolució");

  const evolutionQ = useQuery({
    queryKey: ["participant-evolution", participantId],
    queryFn: () => getParticipantEvolution(participantId!),
    enabled: !!participantId,
  });

  const riskQ = useQuery({
    queryKey: ["participant-risk", participantId, programId],
    queryFn: () => getParticipantRisk(participantId!, programId),
    enabled: !!participantId && !!programId,
  });

  const predQ = useQuery({
    queryKey: ["participant-prediction", participantId],
    queryFn: () => getParticipantPredictionProbabilistic(participantId!, { weeks_ahead: 12, target_ipi: 70 }),
    enabled: !!participantId,
  });

  const dropoutQ = useQuery({
    queryKey: ["participant-dropout", participantId, programId],
    queryFn: () => getDropoutProbability(participantId!, programId),
    enabled: !!participantId && !!programId,
  });

  const clusterQ = useQuery({
    queryKey: ["participant-cluster", participantId, programId],
    queryFn: () => getParticipantCluster(participantId!, programId),
    enabled: !!participantId && !!programId,
  });

  const evolution = evolutionQ.data;
  const risk = riskQ.data;
  const pred = predQ.data;
  const dropout = dropoutQ.data;
  const cluster = clusterQ.data;

  const currentIpi = evolution?.current_ipi ?? null;
  const baseline = evolution?.baseline_ipi ?? null;
  const delta = currentIpi != null && baseline != null ? currentIpi - baseline : null;
  const deltaPct = baseline && delta != null ? (delta / baseline) * 100 : null;

  // Build chart data from history
  const chartData: { label: string; ipi: number | null; predicted?: number }[] = [];
  if (evolution?.history) {
    for (const point of evolution.history) {
      chartData.push({ label: point.period_label || point.date, ipi: point.ipi_score });
    }
  }
  if (pred?.predicted_ipi != null) {
    chartData.push({ label: "Predicció", ipi: null, predicted: pred.predicted_ipi });
  }

  // Radar data
  const dims = ["academic", "cognitive", "social", "integration"];
  const radarData = dims.map((d) => ({
    dimension: DIM_LABELS[d],
    baseline: evolution?.dimensions_baseline?.[d] ?? 0,
    actual: evolution?.dimensions_current?.[d] ?? 0,
  }));

  if (!participantId) {
    return <div style={{ padding: "2rem" }}>Participant no trobat.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.5rem" }}>
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "1.25rem 1.5rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "1rem",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "var(--brand-100)",
            color: "var(--brand-700)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.3rem",
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {evolution?.code?.[0] ?? "?"}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {evolution?.code ?? participantId.slice(0, 8)}
            </span>
            {risk?.risk_level && <RiskBadge level={risk.risk_level} />}
          </div>
          <div style={{ fontSize: "0.83rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
            {evolution?.weeks_in_program != null && (
              <span>Setmana {evolution.weeks_in_program} al programa</span>
            )}
          </div>

          <div
            style={{
              marginTop: "0.6rem",
              display: "flex",
              gap: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            {currentIpi != null && (
              <div>
                <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 700 }}>
                  IPI Actual
                </div>
                <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
                  {currentIpi.toFixed(1)}
                  <span style={{ fontSize: "0.9rem", marginLeft: 4 }}>
                    <TrendArrow trend={evolution?.trend} />
                  </span>
                </div>
              </div>
            )}
            {delta != null && (
              <div>
                <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 700 }}>
                  Millora vs. Baseline
                </div>
                <div
                  style={{
                    fontSize: "1.7rem",
                    fontWeight: 800,
                    color: delta >= 0 ? "var(--trend-up)" : "var(--trend-down)",
                    lineHeight: 1.1,
                  }}
                >
                  {delta >= 0 ? "+" : ""}{delta.toFixed(1)} pts
                </div>
                {deltaPct != null && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                    {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}% relatiu
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.6rem 1rem",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "0.88rem",
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? "var(--brand-500)" : "var(--text-secondary)",
              borderBottom: activeTab === tab ? "2px solid var(--brand-500)" : "2px solid transparent",
              marginBottom: -1,
              borderRadius: "4px 4px 0 0",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── TAB: EVOLUCIÓ ───────────────────────────────────────────────────── */}
      {activeTab === "Evolució" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* IPI Evolution chart */}
          <div
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "1.25rem",
            }}
          >
            <h3 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Evolució de l'IPI
            </h3>
            {evolutionQ.isLoading ? (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                Carregant...
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value.toFixed(1)}`,
                      name === "ipi" ? "IPI Real" : "Predicció",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="ipi"
                    stroke="var(--brand-500)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "var(--brand-500)" }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="var(--brand-300)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={{ r: 4, fill: "var(--brand-300)" }}
                    connectNulls={false}
                  />
                  {baseline != null && (
                    <ReferenceLine
                      y={baseline}
                      stroke="var(--text-muted)"
                      strokeDasharray="4 2"
                      label={{ value: "Baseline", position: "right", fontSize: 10 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                Sense avaluacions periòdiques encara.
              </div>
            )}
          </div>

          {/* Radar + Dimension breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "1.25rem",
              }}
            >
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 700 }}>
                Perfil per Dimensions
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} />
                  <Radar name="Baseline" dataKey="baseline" stroke="var(--text-muted)" fill="var(--text-muted)" fillOpacity={0.15} />
                  <Radar name="Actual" dataKey="actual" stroke="var(--brand-500)" fill="var(--brand-500)" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
                Detall Dimensions
              </h3>
              {dims.map((d) => {
                const current = evolution?.dimensions_current?.[d];
                const base = evolution?.dimensions_baseline?.[d];
                const pct = base && base > 0 && current != null ? ((current - base) / base) * 100 : null;
                return (
                  <div key={d}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: DIM_COLORS[d] }}>
                        {DIM_LABELS[d]}
                      </span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {current != null ? current.toFixed(1) : "—"}
                        {pct != null && (
                          <span style={{ fontSize: "0.75rem", color: pct >= 0 ? "var(--trend-up)" : "var(--trend-down)", marginLeft: 4 }}>
                            ({pct >= 0 ? "+" : ""}{pct.toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface-3)" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${current ?? 0}%`,
                          borderRadius: 3,
                          background: DIM_COLORS[d],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PREDICCIÓ ──────────────────────────────────────────────────── */}
      {activeTab === "Predicció" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* IPI Prediction card */}
          <div
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "1.25rem",
            }}
          >
            <h3 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 700 }}>
              Predicció IPI (12 setmanes)
            </h3>
            {predQ.isLoading ? (
              <div style={{ color: "var(--text-muted)" }}>Calculant...</div>
            ) : pred ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 700 }}>
                    IPI Previst
                  </div>
                  <div style={{ fontSize: "2.4rem", fontWeight: 800, color: "var(--brand-500)", lineHeight: 1 }}>
                    {pred.predicted_ipi}
                  </div>
                </div>
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: 10,
                    background: "var(--brand-100)",
                    border: "1px solid var(--brand-300)",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--brand-700)", marginBottom: 2 }}>
                    IC {Math.round((pred.confidence_level ?? 0.8) * 100)}%
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--brand-700)" }}>
                    [{pred.ci_lower} – {pred.ci_upper}]
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--brand-500)", marginTop: 2 }}>
                    Mètode: {pred.method} · {pred.n_observations} avaluacions
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                    Tendència
                  </div>
                  <span style={{ fontWeight: 700, color: pred.trend === "improving" ? "var(--trend-up)" : pred.trend === "declining" ? "var(--trend-down)" : "var(--trend-stable)" }}>
                    <TrendArrow trend={pred.trend} /> {pred.trend === "improving" ? "Millorant" : pred.trend === "declining" ? "Decreixent" : "Estable"}
                  </span>
                  {pred.slope_per_12w != null && (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {pred.slope_per_12w > 0 ? "+" : ""}{pred.slope_per_12w} pts/trimestre
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Sense dades suficients per predir.</div>
            )}
          </div>

          {/* Target probability + dropout */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {pred && (
              <div
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>
                  Probabilitat d'assolir IPI ≥ 70
                </h3>
                <ProbabilityBar value={pred.probability ?? 0} color="var(--brand-500)" />
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4 }}>
                  {pred.probability_label} · {pred.simulations ?? 0} simulacions Monte Carlo
                </div>
              </div>
            )}

            {dropout && (
              <div
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>
                  Risc d'Abandonament
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 3 }}>
                      30 dies
                    </div>
                    <ProbabilityBar
                      value={dropout.dropout_probability_30d}
                      color={dropout.dropout_probability_30d > 0.3 ? "var(--risk-high)" : dropout.dropout_probability_30d > 0.15 ? "var(--risk-medium)" : "var(--risk-low)"}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 3 }}>
                      60 dies
                    </div>
                    <ProbabilityBar
                      value={dropout.dropout_probability_60d}
                      color={dropout.dropout_probability_60d > 0.3 ? "var(--risk-high)" : dropout.dropout_probability_60d > 0.15 ? "var(--risk-medium)" : "var(--risk-low)"}
                    />
                  </div>
                </div>
                {dropout.recommended_intervention && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.6rem 0.8rem",
                      borderRadius: 8,
                      background: "var(--risk-medium-bg)",
                      borderLeft: "3px solid var(--risk-medium)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--risk-medium)",
                    }}
                  >
                    💡 {dropout.recommended_intervention}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: ANÀLISI (K-Means cluster) ──────────────────────────────────── */}
      {activeTab === "Anàlisi" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {clusterQ.isLoading ? (
            <div style={{ color: "var(--text-muted)" }}>Calculant perfil...</div>
          ) : cluster ? (
            <>
              <div
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      padding: "0.3rem 0.9rem",
                      borderRadius: 999,
                      background: "var(--brand-100)",
                      color: "var(--brand-700)",
                      fontSize: "0.88rem",
                      fontWeight: 800,
                    }}
                  >
                    {cluster.cluster_label}
                  </div>
                </div>
                <p style={{ margin: "0 0 0.75rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  {cluster.cluster_description}
                </p>
                <div
                  style={{
                    padding: "0.6rem 0.9rem",
                    borderRadius: 8,
                    background: "var(--surface-1)",
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <strong>Estratègia suggerida:</strong> {cluster.strategy}
                </div>
              </div>

              {cluster.recommended_goals?.length > 0 && (
                <div
                  style={{
                    background: "var(--surface-0)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: "1.25rem",
                  }}
                >
                  <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>
                    Micro-objectius Recomanats per al Perfil
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {cluster.recommended_goals.map((g: { title: string; dimension: string; difficulty: number }, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.6rem 0.8rem",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--surface-1)",
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: DIM_COLORS[g.dimension] || "var(--brand-500)",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, fontSize: "0.87rem", color: "var(--text-primary)" }}>
                          {g.title}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                          }}
                        >
                          {DIM_LABELS[g.dimension]} · {"★".repeat(g.difficulty)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
              Cal tenir una avaluació de baseline per generar el perfil.
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ALERTES ────────────────────────────────────────────────────── */}
      {activeTab === "Alertes" && (
        <div
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.25rem",
          }}
        >
          {risk?.contributing_factors?.length > 0 ? (
            <>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>
                Factors de Risc Actius
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {risk.contributing_factors.map((f: string) => (
                  <div
                    key={f}
                    style={{
                      padding: "0.6rem 0.9rem",
                      borderRadius: 8,
                      background: "var(--risk-high-bg)",
                      borderLeft: "3px solid var(--risk-high)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--risk-high)",
                    }}
                  >
                    ⚠ {f.replace(/_/g, " ")}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--risk-low)", fontWeight: 600, fontSize: "0.9rem" }}>
              ✓ Cap factor de risc significatiu detectat.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
