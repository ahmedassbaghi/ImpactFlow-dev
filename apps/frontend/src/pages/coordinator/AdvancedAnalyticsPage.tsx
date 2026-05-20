import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Atom,
  Beaker,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  Dices,
  Gauge,
  Globe,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import {
  getDimensionEffects,
  getDoseResponse,
  getMonteCarloSROI,
  getTrajectoryAnomalies,
  type AnomalyAlert,
  type DimensionEffect,
} from "../../api/advanced";
import { InterRaterReliabilityCard } from "../../components/analytics/InterRaterReliabilityCard";

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="adv-section-header">
      <div className="adv-section-header-icon">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="adv-section-header-text">
        <h3 className="adv-section-title">{title}</h3>
        <p className="adv-section-subtitle">{subtitle}</p>
      </div>
      {badge && <div className="adv-section-badge">{badge}</div>}
    </div>
  );
}

const DIM_META = {
  academic: { label: "Acadèmic", Icon: BookOpen, color: "var(--dim-academic)" },
  cognitive: { label: "Cognitiu", Icon: Brain, color: "var(--dim-cognitive)" },
  social: { label: "Social", Icon: Users2, color: "var(--dim-social)" },
  integration: { label: "Integració", Icon: Globe, color: "var(--dim-integration)" },
} as const;

const COLOR_MAP = {
  good: "var(--risk-low)",
  info: "var(--brand-500)",
  warn: "var(--risk-medium)",
  muted: "var(--text-muted)",
} as const;

// ─── Per-Dimension Effects ────────────────────────────────────────────────
function DimensionEffectsCard({ programId }: { programId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dimension-effects", programId],
    queryFn: () => getDimensionEffects(programId),
    enabled: !!programId,
  });

  if (isLoading || !data) return <div className="adv-card adv-card-loading">Calculant efectes…</div>;

  const dims = ["academic", "cognitive", "social", "integration"] as const;
  const maxAbs = Math.max(0.5, ...dims.map((d) => Math.abs(data.dimensions[d].dz ?? 0)));

  return (
    <div className="adv-card">
      <SectionHeader
        icon={Sparkles}
        title="Efectes per dimensió (Cohen's d)"
        subtitle="Mida de l'efecte pre-post a cada àrea de progrés, comparat amb estàndards educatius (Hattie 2009)."
        badge={
          data.strongest_dimension ? (
            <span className="adv-badge-info">
              {DIM_META[data.strongest_dimension as keyof typeof DIM_META]?.label} liderant
            </span>
          ) : undefined
        }
      />

      <div className="adv-dim-list">
        {dims.map((dim) => {
          const eff: DimensionEffect = data.dimensions[dim];
          const meta = DIM_META[dim];
          const Icon = meta.Icon;
          const dz = eff.dz ?? 0;
          const widthPct = Math.min(100, (Math.abs(dz) / maxAbs) * 100);
          const color = COLOR_MAP[eff.color] || meta.color;
          const isInsuf = eff.dz === null;

          return (
            <motion.div
              key={dim}
              className="adv-dim-row"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: dims.indexOf(dim) * 0.08 }}
            >
              <div className="adv-dim-row-label" style={{ color: meta.color }}>
                <Icon size={14} strokeWidth={2} />
                <span>{meta.label}</span>
              </div>
              <div className="adv-dim-row-bar-wrap">
                <div className="adv-dim-row-bar-track">
                  <motion.div
                    className="adv-dim-row-bar-fill"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.7, delay: dims.indexOf(dim) * 0.08 + 0.2, ease: "easeOut" }}
                  />
                </div>
                <div className="adv-dim-row-stats">
                  {isInsuf ? (
                    <span className="adv-dim-insuf">n insuficient</span>
                  ) : (
                    <>
                      <span className="adv-dim-dz" style={{ color }}>
                        d = {dz.toFixed(2)}
                      </span>
                      <span className={`adv-dim-tag adv-dim-tag--${eff.color}`}>{eff.interpretation}</span>
                      {eff.is_significant && (
                        <span className="adv-dim-sig">
                          <CheckCircle2 size={11} strokeWidth={2.5} />
                          p &lt; 0.05
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              {!isInsuf && eff.baseline_mean !== null && eff.post_mean !== null && (
                <div className="adv-dim-row-flow">
                  <span>{eff.baseline_mean.toFixed(0)}</span>
                  <ChevronDown size={11} strokeWidth={2} style={{ transform: "rotate(-90deg)" }} />
                  <span>{eff.post_mean.toFixed(0)}</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="adv-dim-legend">
        <span><span className="adv-dim-tag adv-dim-tag--muted">trivial</span> d&lt;0.2</span>
        <span><span className="adv-dim-tag adv-dim-tag--warn">petit</span> 0.2-0.4</span>
        <span><span className="adv-dim-tag adv-dim-tag--info">moderat</span> 0.4-0.6</span>
        <span><span className="adv-dim-tag adv-dim-tag--good">gran+</span> ≥0.6</span>
      </div>
      <div className="adv-methodology">{data.methodology}</div>
    </div>
  );
}

// ─── Dose-Response ────────────────────────────────────────────────────────
function DoseResponseCard({ programId }: { programId: string }) {
  const [doseType, setDoseType] = useState<"sessions" | "hours">("sessions");
  const { data, isLoading } = useQuery({
    queryKey: ["dose-response", programId, doseType],
    queryFn: () => getDoseResponse(programId, doseType),
    enabled: !!programId,
  });

  if (isLoading || !data) return <div className="adv-card adv-card-loading">Ajustant corba…</div>;

  return (
    <div className="adv-card">
      <SectionHeader
        icon={Gauge}
        title="Corba dosi-resposta"
        subtitle="Quanta dosi (sessions o hores) genera quina millora? Identifica el punt de rendiments decreixents."
        badge={data.r_squared !== null ? <span className="adv-badge-info">R² = {data.r_squared.toFixed(2)}</span> : undefined}
      />

      <div className="adv-dose-controls">
        <button
          className={`adv-toggle-btn ${doseType === "sessions" ? "active" : ""}`}
          onClick={() => setDoseType("sessions")}
        >
          Per sessions
        </button>
        <button
          className={`adv-toggle-btn ${doseType === "hours" ? "active" : ""}`}
          onClick={() => setDoseType("hours")}
        >
          Per hores
        </button>
      </div>

      {data.vmax === null ? (
        <div className="adv-warning">
          <AlertTriangle size={14} />
          {data.interpretation}
        </div>
      ) : (
        <>
          <div className="adv-dose-headline-row">
            <div className="adv-dose-stat">
              <div className="adv-dose-stat-label">Sostre (Vmax)</div>
              <div className="adv-dose-stat-value">{data.vmax!.toFixed(1)}</div>
              <div className="adv-dose-stat-unit">punts IPI</div>
            </div>
            <div className="adv-dose-stat">
              <div className="adv-dose-stat-label">Mitja saturació (K)</div>
              <div className="adv-dose-stat-value">{data.k_half!.toFixed(1)}</div>
              <div className="adv-dose-stat-unit">{doseType === "sessions" ? "sessions" : "hores"}</div>
            </div>
            <div className="adv-dose-stat highlight">
              <div className="adv-dose-stat-label">Òptim (90% Vmax)</div>
              <div className="adv-dose-stat-value">{data.optimal_dose_90pct!.toFixed(0)}</div>
              <div className="adv-dose-stat-unit">{doseType === "sessions" ? "sessions" : "hores"}</div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="dose"
                type="number"
                tick={{ fontSize: 11 }}
                label={{
                  value: doseType === "sessions" ? "Sessions" : "Hores",
                  position: "insideBottom",
                  offset: -2,
                  style: { fontSize: 11, fill: "var(--text-muted)" },
                }}
              />
              <YAxis
                type="number"
                tick={{ fontSize: 11 }}
                label={{
                  value: "Guany IPI",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, fill: "var(--text-muted)" },
                }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip />
              <ReferenceLine
                x={data.optimal_dose_90pct!}
                stroke="var(--brand-500)"
                strokeDasharray="4 4"
                label={{ value: "Òptim", position: "top", fontSize: 10, fill: "var(--brand-700)" }}
              />
              <Scatter
                name="Observat"
                data={data.observed_points}
                fill="var(--brand-500)"
                fillOpacity={0.6}
              />
              <Scatter
                name="Corba ajustada"
                data={data.curve_points}
                line={{ stroke: "var(--brand-700)", strokeWidth: 2 }}
                shape={() => <></>}
              />
            </ScatterChart>
          </ResponsiveContainer>

          <div className="adv-interpretation">{data.interpretation}</div>
        </>
      )}
      <div className="adv-methodology">Model: {data.model}</div>
    </div>
  );
}

// ─── Monte Carlo SROI ─────────────────────────────────────────────────────
function MonteCarloSROICard({ programId }: { programId: string }) {
  const [costEur, setCostEur] = useState(15000);
  const [months, setMonths] = useState(9);
  const { data, isLoading } = useQuery({
    queryKey: ["mc-sroi", programId, costEur, months],
    queryFn: () => getMonteCarloSROI(programId, costEur, months, 5000),
    enabled: !!programId,
  });

  if (isLoading || !data) return <div className="adv-card adv-card-loading">Simulant…</div>;

  const chartData = data.distribution_bins.map((b) => ({ sroi: b.x, freq: b.count }));

  return (
    <div className="adv-card">
      <SectionHeader
        icon={Dices}
        title="SROI amb incertesa (Monte Carlo)"
        subtitle="5000 simulacions mostrejant proxies, deadweight, attribution i variabilitat de l'IPI."
        badge={
          <span className={`adv-badge-${data.prob_above_1 >= 0.8 ? "good" : data.prob_above_1 >= 0.5 ? "warn" : "bad"}`}>
            P(SROI&gt;1) = {fmtPct(data.prob_above_1)}
          </span>
        }
      />

      <div className="adv-mc-controls">
        <label className="adv-mc-input-wrap">
          <span>Cost programa (€)</span>
          <input
            type="number"
            min={1000}
            step={1000}
            value={costEur}
            onChange={(e) => setCostEur(Math.max(1000, Number(e.target.value) || 1000))}
            className="adv-mc-input"
          />
        </label>
        <label className="adv-mc-input-wrap">
          <span>Durada (mesos)</span>
          <input
            type="number"
            min={1}
            max={36}
            value={months}
            onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
            className="adv-mc-input"
          />
        </label>
      </div>

      <div className="adv-mc-headline">
        <div className="adv-mc-central">
          <span className="adv-mc-central-label">Estimació central</span>
          <span className="adv-mc-central-value">{data.central_estimate.toFixed(2)}×</span>
          <span className="adv-mc-central-sub">SE = {data.se_mean.toFixed(2)}</span>
        </div>
        <div className="adv-mc-percentiles">
          <div className="adv-mc-pct"><span>P05</span><strong>{data.p05.toFixed(2)}×</strong></div>
          <div className="adv-mc-pct"><span>P25</span><strong>{data.p25.toFixed(2)}×</strong></div>
          <div className="adv-mc-pct"><span>P75</span><strong>{data.p75.toFixed(2)}×</strong></div>
          <div className="adv-mc-pct"><span>P95</span><strong>{data.p95.toFixed(2)}×</strong></div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="sroi" tick={{ fontSize: 10 }} tickFormatter={(v) => v.toFixed(1)} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(v: number) => [`${v} simulacions`, "Freqüència"]}
            labelFormatter={(v: number) => `SROI = ${v.toFixed(2)}×`}
          />
          <ReferenceLine x={1.0} stroke="var(--risk-high)" strokeDasharray="4 4" label={{ value: "Break-even", fontSize: 10, fill: "var(--risk-high)" }} />
          <ReferenceLine x={data.median} stroke="var(--brand-700)" strokeDasharray="2 2" />
          <Area type="monotone" dataKey="freq" stroke="var(--brand-700)" fill="url(#mcGrad)" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="adv-mc-probs">
        <div className="adv-mc-prob-row">
          <span>Probabilitat SROI &gt; 1×</span>
          <div className="adv-mc-prob-bar">
            <motion.div
              className="adv-mc-prob-fill"
              initial={{ width: 0 }}
              animate={{ width: `${data.prob_above_1 * 100}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
          <strong>{fmtPct(data.prob_above_1)}</strong>
        </div>
        <div className="adv-mc-prob-row">
          <span>Probabilitat SROI &gt; 2×</span>
          <div className="adv-mc-prob-bar">
            <motion.div
              className="adv-mc-prob-fill"
              initial={{ width: 0 }}
              animate={{ width: `${data.prob_above_2 * 100}%` }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
          </div>
          <strong>{fmtPct(data.prob_above_2)}</strong>
        </div>
      </div>

      <div className="adv-interpretation">{data.interpretation}</div>
      {data.methodology && <div className="adv-methodology">{data.methodology}</div>}
    </div>
  );
}

// ─── Trajectory Anomalies ─────────────────────────────────────────────────
function AnomalyCard({ programId }: { programId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["anomalies", programId],
    queryFn: () => getTrajectoryAnomalies(programId),
    enabled: !!programId,
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading || !data) return <div className="adv-card adv-card-loading">Detectant anomalies…</div>;

  const ICONS = {
    plateau: Activity,
    regression: TrendingDown,
    breakthrough: TrendingUp,
  } as const;
  const COLORS = {
    plateau: "var(--risk-medium)",
    regression: "var(--risk-high)",
    breakthrough: "var(--risk-low)",
  } as const;
  const LABELS = {
    plateau: "Plateau",
    regression: "Regressió",
    breakthrough: "Salt qualitatiu",
  } as const;

  return (
    <div className="adv-card">
      <SectionHeader
        icon={Sparkles}
        title="Detecció d'anomalies en trajectòries"
        subtitle="Identifica plateaus, regressions i salts qualitatius participant per participant."
        badge={<span className="adv-badge-info">{data.alerts.length} alertes</span>}
      />

      <div className="adv-anomaly-summary">
        {(["regression", "plateau", "breakthrough"] as const).map((t) => {
          const Icon = ICONS[t];
          return (
            <div key={t} className="adv-anomaly-tile" style={{ borderLeftColor: COLORS[t] }}>
              <Icon size={16} strokeWidth={2} style={{ color: COLORS[t], flexShrink: 0 }} />
              <div className="adv-anomaly-tile-text">
                <div className="adv-anomaly-tile-count">{data.counts[t]}</div>
                <div className="adv-anomaly-tile-label">{LABELS[t]}</div>
              </div>
            </div>
          );
        })}
        <div className="adv-anomaly-tile" style={{ borderLeftColor: "var(--text-muted)" }}>
          <CheckCircle2 size={16} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <div className="adv-anomaly-tile-text">
            <div className="adv-anomaly-tile-count">{data.counts.stable}</div>
            <div className="adv-anomaly-tile-label">Estables</div>
          </div>
        </div>
      </div>

      {data.alerts.length === 0 ? (
        <div className="adv-anomaly-empty">Cap anomalia significativa detectada.</div>
      ) : (
        <div className="adv-anomaly-list">
          {data.alerts.slice(0, 8).map((a: AnomalyAlert) => {
            const Icon = ICONS[a.type];
            const isOpen = expanded === a.participant_id;
            return (
              <motion.div
                key={a.participant_id}
                className={`adv-anomaly-row ${isOpen ? "open" : ""}`}
                layout
                transition={{ duration: 0.25 }}
              >
                <button
                  type="button"
                  className="adv-anomaly-row-head"
                  onClick={() => setExpanded(isOpen ? null : a.participant_id)}
                >
                  <span
                    className="adv-anomaly-row-icon"
                    style={{ background: `color-mix(in srgb, ${COLORS[a.type]} 12%, transparent)`, color: COLORS[a.type] }}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                  <span className="adv-anomaly-row-info">
                    <span className="adv-anomaly-row-title">
                      {a.participant_name}
                      <span className="adv-anomaly-row-code">{a.participant_code}</span>
                    </span>
                    <span className="adv-anomaly-row-msg">{a.message}</span>
                  </span>
                  <span className="adv-anomaly-row-ipi">
                    <span className="adv-anomaly-row-ipi-label">IPI</span>
                    <strong>{a.current_ipi.toFixed(0)}</strong>
                  </span>
                  <ChevronDown
                    size={14}
                    strokeWidth={2}
                    className="adv-anomaly-row-chev"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="adv-anomaly-traj"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="adv-anomaly-traj-inner">
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={a.trajectory} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 9 }}
                              tickFormatter={(d) => d.slice(5)}
                              stroke="var(--text-muted)"
                            />
                            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} stroke="var(--text-muted)" />
                            <Tooltip
                              labelFormatter={(d) => `Data: ${d}`}
                              formatter={(v: number) => [v.toFixed(1), "IPI"]}
                            />
                            <Line
                              type="monotone"
                              dataKey="ipi"
                              stroke={COLORS[a.type]}
                              strokeWidth={2.5}
                              dot={{ r: 3, fill: COLORS[a.type] }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          {data.alerts.length > 8 && (
            <div className="adv-anomaly-more">+{data.alerts.length - 8} alertes addicionals</div>
          )}
        </div>
      )}
      <div className="adv-methodology">{data.methodology}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function AdvancedAnalyticsPage() {
  const { data: programs = [] } = useQuery({
    queryKey: ["programs", false],
    queryFn: () => listPrograms(false),
  });
  const [programId, setProgramId] = useState<string>("");
  const [schoolId, setSchoolId] = useState<string>("");
  const { data: schools = [] } = useQuery({ queryKey: ["schools"], queryFn: listSchools });

  if (!programId && programs.length > 0) {
    setProgramId(programs[0].id);
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Atom size={22} strokeWidth={1.7} style={{ display: "inline-block", verticalAlign: "-3px", marginRight: 8 }} />
            Anàlisi avançada
          </h1>
          <p className="page-subtitle">
            Mides d'efecte, dosi-resposta, simulació Monte Carlo i detecció d'anomalies — el motor científic d'ImpactFlow.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select
            className="form-select"
            style={{ minWidth: 180 }}
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            aria-label="Filtrar per escola"
          >
            <option value="">Totes les escoles</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.abbreviation}</option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ minWidth: 220 }}
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
          >
            <option value="">Selecciona programa…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!programId ? (
        <div className="empty-state">
          <Beaker size={48} strokeWidth={1.2} style={{ opacity: 0.3 }} />
          <p>Selecciona un programa per executar les anàlisis avançades.</p>
        </div>
      ) : (
        <motion.div
          className="adv-grid"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <DimensionEffectsCard programId={programId} />
          <InterRaterReliabilityCard programId={programId} />
          <DoseResponseCard programId={programId} />
          <MonteCarloSROICard programId={programId} />
          <AnomalyCard programId={programId} />
        </motion.div>
      )}
    </div>
  );
}
