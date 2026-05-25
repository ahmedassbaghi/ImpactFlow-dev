import { useEffect, useMemo, useState } from "react";
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
  Calculator,
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
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import {
  getDimensionEffects,
  getDoseResponse,
  getMonteCarloSROI,
  getProgramSroi,
  getTrajectoryAnomalies,
  type AnomalyAlert,
  type DimensionEffect,
  type ProgramSroiSnapshot,
} from "../../api/advanced";
import { AdvCardWithInfo } from "../../components/analytics/AdvCardWithInfo";
import { InterRaterReliabilityCard } from "../../components/analytics/InterRaterReliabilityCard";
import SROIFormulaExplainer from "../../components/sroi/SROIFormulaExplainer";

const ADV_INFO = {
  dimensionEffects: (
    <>
      <p>Compara el <strong>punt de partida</strong> i el <strong>nivell actual</strong> de cada dimensió de l&apos;IPI (acadèmic, cognitiu, social, integració).</p>
      <p>El nombre <strong>Cohen&apos;s d</strong> indica la mida del canvi: &gt;0,2 petit, &gt;0,5 moderat, &gt;0,8 gran (referència Hattie).</p>
    </>
  ),
  doseResponse: (
    <>
      <p>
        L&apos;<strong>IPI</strong> (Índex de Progrés Integral) és la nota del programa de 0 a 100.
        Aquest gràfic <em>no</em> mostra la nota final: mostra quant ha <strong>pujat</strong> des de
        l&apos;entrada.
      </p>
      <p>
        <strong>Horitzontal:</strong> sessions o hores totals. <strong>Vertical:</strong> pujada en
        l&apos;IPI (ex.: +20 = ha pujat 20 punts en l&apos;índex).
      </p>
    </>
  ),
  sroi: (
    <>
      <p>Resumeix el <strong>retorn social</strong> del període: beneficis monetitzats (famílies, serveis públics, integració, hores de suport) dividits pel <strong>cost en efectiu</strong> del programa.</p>
      <p>Utilitza les mateixes dades que el dashboard del coordinador per al període seleccionat.</p>
    </>
  ),
  monteCarlo: (
    <>
      <p>Repeteix el càlcul SROI <strong>5.000 vegades</strong> variant lleugerament l&apos;IPI, les sessions i el cost per veure l&apos;interval de resultats possibles.</p>
      <p>La distribució indica la probabilitat que el programa superi 1× o 2× de retorn social.</p>
    </>
  ),
  anomalies: (
    <>
      <p>Revisa la <strong>trajectòria IPI</strong> de cada infant al llarg del temps i marca patrons inusuals: estancament, regressió o salt fort.</p>
      <p>Serveix per prioritzar seguiment; no substitueix el criteri del coordinador.</p>
    </>
  ),
  irr: (
    <>
      <p>Mesura si <strong>diferents voluntaris</strong> puntuen de forma similar quan acompanyen els mateixos infants (ICC).</p>
      <p>Cal que almenys dos professionals tinguin observacions sobre infants comuns; amb un sol avaluador el valor serà 0.</p>
    </>
  ),
} as const;

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthsAgoISO(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10);
}

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function formatEur(n: number) {
  return `€${n.toLocaleString("ca-ES", { maximumFractionDigits: 0 })}`;
}

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

  if (isLoading || !data) {
    return (
      <AdvCardWithInfo infoTitle="Efectes per dimensió" info={ADV_INFO.dimensionEffects}>
        <div className="adv-card-loading">Calculant efectes…</div>
      </AdvCardWithInfo>
    );
  }

  const dims = ["academic", "cognitive", "social", "integration"] as const;
  const maxAbs = Math.max(0.5, ...dims.map((d) => Math.abs(data.dimensions[d].dz ?? 0)));

  return (
    <AdvCardWithInfo infoTitle="Efectes per dimensió" info={ADV_INFO.dimensionEffects}>
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
    </AdvCardWithInfo>
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

  if (isLoading || !data) {
    return (
      <AdvCardWithInfo infoTitle="Corba dosi-resposta" info={ADV_INFO.doseResponse}>
        <div className="adv-card-loading">Ajustant corba…</div>
      </AdvCardWithInfo>
    );
  }

  const hasCurve = (data.curve_points?.length ?? 0) > 1;
  const maxDose = Math.max(
    data.optimal_dose_90pct ?? 0,
    ...(data.observed_points?.map((p) => p.dose) ?? [0]),
    ...(data.curve_points?.map((p) => p.dose) ?? [0]),
    1
  );
  const maxGain = Math.max(
    data.vmax ?? 0,
    ...(data.observed_points?.map((p) => p.gain) ?? [0]),
    ...(data.curve_points?.map((p) => p.gain) ?? [0]),
    1
  );

  return (
    <AdvCardWithInfo infoTitle="Corba dosi-resposta" info={ADV_INFO.doseResponse}>
      <SectionHeader
        icon={Gauge}
        title="Corba dosi-resposta"
        subtitle="Relació entre quant suport rep cada infant i quant millora l'IPI."
        badge={data.r_squared !== null ? <span className="adv-badge-info">R² = {data.r_squared.toFixed(2)}</span> : undefined}
      />

      <p className="adv-dose-plain">
        <strong>Què és l&apos;IPI?</strong> L&apos;Índex de Progrés Integral del programa (nota 0–100).
        <br />
        <strong>Què mesura el gràfic?</strong> Només la <strong>pujada</strong> d&apos;aquest índex, no la nota final.
        <br />
        <em>Exemple:</em> entra amb IPI 40 → puja +15 en l&apos;índex → IPI actual 55. No és «115» ni «punts de lliga».
      </p>

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
              <div className="adv-dose-stat-label">Pujada màxima en l&apos;IPI</div>
              <div className="adv-dose-stat-value">+{data.vmax!.toFixed(0)}</div>
              <div className="adv-dose-stat-unit">en l&apos;índex (respecte l&apos;entrada)</div>
            </div>
            <div className="adv-dose-stat">
              <div className="adv-dose-stat-label">Meitat d&apos;aquesta pujada</div>
              <div className="adv-dose-stat-value">~{data.k_half!.toFixed(0)}</div>
              <div className="adv-dose-stat-unit">
                {doseType === "sessions" ? "sessions acumulades" : "hores acumulades"}
              </div>
            </div>
            <div className="adv-dose-stat highlight">
              <div className="adv-dose-stat-label">90% de la pujada (referència)</div>
              <div className="adv-dose-stat-value">~{data.optimal_dose_90pct!.toFixed(0)}</div>
              <div className="adv-dose-stat-unit">
                {doseType === "sessions" ? "sessions (no és IPI)" : "hores (no és IPI)"}
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart margin={{ top: 12, right: 16, left: 4, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="dose"
                type="number"
                domain={[0, Math.ceil(maxDose * 1.05)]}
                tick={{ fontSize: 11 }}
                label={{
                  value: doseType === "sessions" ? "Sessions" : "Hores",
                  position: "insideBottom",
                  offset: -4,
                  style: { fontSize: 11, fill: "var(--text-muted)" },
                }}
              />
              <YAxis
                type="number"
                domain={[0, Math.ceil(maxGain * 1.12)]}
                tick={{ fontSize: 11 }}
                width={36}
                label={{
                  value: "Pujada IPI",
                  angle: -90,
                  position: "insideLeft",
                  offset: 8,
                  style: { fontSize: 11, fill: "var(--text-muted)" },
                }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (typeof value !== "number") return [value, name];
                  if (name === "Observat" || name === "Corba ajustada") {
                    return [
                      `+${value.toFixed(1)} en l'Índex de Progrés Integral (pujada, no nota final)`,
                      name,
                    ];
                  }
                  return [value.toFixed(1), name];
                }}
                labelFormatter={(dose) =>
                  `${doseType === "sessions" ? "Sessions totals" : "Hores totals"}: ${dose}`
                }
              />
              {hasCurve && (
                <Line
                  type="monotone"
                  data={data.curve_points}
                  dataKey="gain"
                  stroke="var(--brand-700)"
                  strokeWidth={2.5}
                  dot={false}
                  name="Corba ajustada"
                  isAnimationActive={false}
                />
              )}
              <Scatter
                name="Observat"
                data={data.observed_points}
                dataKey="gain"
                fill="var(--brand-500)"
                fillOpacity={0.85}
              />
              {data.optimal_dose_90pct != null && data.optimal_dose_90pct <= maxDose * 1.05 && (
                <ReferenceLine
                  x={data.optimal_dose_90pct}
                  stroke="var(--narinan, #f58220)"
                  strokeDasharray="4 4"
                  label={{ value: "Òptim 90%", position: "top", fontSize: 10, fill: "var(--brand-700)" }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {!hasCurve && (
            <p className="adv-warning" style={{ marginTop: "0.5rem" }}>
              No hi ha prou punts observats per dibuixar la corba (cal n≥4 participants amb sessions i IPI).
            </p>
          )}

          <div className="adv-interpretation adv-interpretation--dose">
            {data.interpretation_plain ? (
              <>
                <p>{data.interpretation_plain}</p>
                {data.interpretation_dose && <p>{data.interpretation_dose}</p>}
              </>
            ) : (
              <p>{data.interpretation}</p>
            )}
          </div>
        </>
      )}
      <div className="adv-methodology">Model: {data.model}</div>
    </AdvCardWithInfo>
  );
}

// ─── SROI model (deterministic, from registers) ───────────────────────────
function SROIModelSummaryCard({
  programId,
  periodStart,
  periodEnd,
  periodLabel,
}: {
  programId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["period-sroi", programId, periodStart, periodEnd],
    queryFn: () => getProgramSroi(programId, periodStart, periodEnd),
    enabled: !!programId,
  });

  if (isLoading) {
    return (
      <AdvCardWithInfo infoTitle="Model SROI" info={ADV_INFO.sroi} className="adv-sroi-summary">
        <div className="adv-card-loading">Carregant SROI…</div>
      </AdvCardWithInfo>
    );
  }
  if (isError || !data) {
    return (
      <AdvCardWithInfo infoTitle="Model SROI" info={ADV_INFO.sroi} className="adv-sroi-summary">
        <div className="adv-card-error">No s&apos;ha pogut carregar el model SROI del programa.</div>
      </AdvCardWithInfo>
    );
  }

  const dose = data.dose_metrics;
  const sens = data.sensitivity_analysis;

  return (
    <AdvCardWithInfo infoTitle="Model SROI" info={ADV_INFO.sroi} className="adv-sroi-summary">
      <SectionHeader
        icon={Calculator}
        title="Model SROI del període"
        subtitle={`Mateix càlcul que el dashboard del coordinador (${periodLabel}). Sessions, IPI i cost mixt del període seleccionat.`}
        badge={
          <span className="adv-badge-info">{data.sroi_ratio.toFixed(2)}× SROI</span>
        }
      />

      <div className="adv-sroi-kpi-row">
        <div className="adv-sroi-kpi adv-sroi-kpi--hero">
          <div className="adv-sroi-kpi-label">SROI actual</div>
          <div className="adv-sroi-kpi-value">{data.sroi_ratio.toFixed(2)}×</div>
          <div className="adv-sroi-kpi-hint">{data.sroi_statement}</div>
        </div>
        <div className="adv-sroi-kpi">
          <div className="adv-sroi-kpi-label">Beneficis mesurats</div>
          <div className="adv-sroi-kpi-value">{formatEur(data.total_social_value_eur)}</div>
        </div>
        <div className="adv-sroi-kpi">
          <div className="adv-sroi-kpi-label">Cost en efectiu</div>
          <div className="adv-sroi-kpi-value">{formatEur(data.total_investment_eur)}</div>
        </div>
        <div className="adv-sroi-kpi">
          <div className="adv-sroi-kpi-label">Sessions registrades</div>
          <div className="adv-sroi-kpi-value">{dose?.sessions_registered ?? "—"}</div>
          {dose && (
            <div className="adv-sroi-kpi-hint">
              {dose.sessions_per_participant} / infant · {dose.sessions_effective} efectives
            </div>
          )}
        </div>
        <div className="adv-sroi-kpi">
          <div className="adv-sroi-kpi-label">Dosi programa</div>
          <div className="adv-sroi-kpi-value">{dose ? `${dose.dose_ratio.toFixed(2)}×` : "—"}</div>
          {dose && (
            <div className="adv-sroi-kpi-hint">
              Multiplicador IPI: {dose.dose_outcomes_multiplier.toFixed(2)}×
            </div>
          )}
        </div>
        {sens && (
          <div className="adv-sroi-kpi">
            <div className="adv-sroi-kpi-label">Sensibilitat</div>
            <div className="adv-sroi-kpi-value" style={{ fontSize: "1rem" }}>
              {sens.conservative.toFixed(1)}–{sens.optimistic.toFixed(1)}×
            </div>
            <div className="adv-sroi-kpi-hint">conservador → optimista</div>
          </div>
        )}
      </div>

      {data.formula_explanation && (
        <SROIFormulaExplainer formula={data.formula_explanation} formatCurrency={formatEur} />
      )}
    </AdvCardWithInfo>
  );
}

// ─── Monte Carlo SROI ─────────────────────────────────────────────────────
function MonteCarloSROICard({
  programId,
  metrics,
  periodStart,
  periodEnd,
}: {
  programId: string;
  metrics?: ProgramSroiSnapshot;
  periodStart: string;
  periodEnd: string;
}) {
  const [costOverride, setCostOverride] = useState<number | null>(null);
  const [monthsOverride, setMonthsOverride] = useState<number | null>(null);
  const autoCost = metrics?.total_investment_eur ?? 0;
  const autoMonths = metrics?.program_duration_months ?? 9;
  const costEur = costOverride ?? autoCost;
  const months = monthsOverride ?? autoMonths;

  const { data, isLoading } = useQuery({
    queryKey: ["mc-sroi", programId, periodStart, periodEnd, costEur, months, costOverride, monthsOverride],
    queryFn: () =>
      getMonteCarloSROI(programId, {
        costEur: costOverride ?? undefined,
        months: monthsOverride ?? undefined,
        periodStart,
        periodEnd,
        nIter: 5000,
      }),
    enabled: !!programId && autoCost > 0,
  });

  if (!metrics || autoCost <= 0) {
    return (
      <AdvCardWithInfo infoTitle="Monte Carlo SROI" info={ADV_INFO.monteCarlo}>
        <SectionHeader
          icon={Dices}
          title="SROI amb incertesa (Monte Carlo)"
          subtitle="Cal registres de sessions i cost operatiu per simular."
        />
        <p className="adv-warning">Encara no hi ha prou dades de sessions per a la simulació.</p>
      </AdvCardWithInfo>
    );
  }

  if (isLoading || !data) {
    return (
      <AdvCardWithInfo infoTitle="Monte Carlo SROI" info={ADV_INFO.monteCarlo}>
        <div className="adv-card-loading">Simulant…</div>
      </AdvCardWithInfo>
    );
  }

  const chartData = data.distribution_bins.map((b) => ({ sroi: b.x, freq: b.count }));
  const detRatio = metrics.sroi_ratio;

  return (
    <AdvCardWithInfo infoTitle="Monte Carlo SROI" info={ADV_INFO.monteCarlo}>
      <SectionHeader
        icon={Dices}
        title="SROI amb incertesa (Monte Carlo)"
        subtitle="5000 escenaris: variació de l'IPI, proxies, sessions (±15%) i cost recalculat per iteració (mateix model que el dashboard)."
        badge={
          <span className={`adv-badge-${data.prob_above_1 >= 0.8 ? "good" : data.prob_above_1 >= 0.5 ? "warn" : "bad"}`}>
            P(SROI&gt;1) = {fmtPct(data.prob_above_1)}
          </span>
        }
      />

      <p className="adv-mc-auto-note">
        Valors per defecte des de registres: <strong>{formatEur(autoCost)}</strong> de cost,{" "}
        <strong>{metrics.dose_metrics?.sessions_registered ?? "—"} sessions</strong>,{" "}
        <strong>{months} mesos</strong>. SROI determinista: <strong>{detRatio.toFixed(2)}×</strong> vs
        Monte Carlo central: <strong>{data.central_estimate.toFixed(2)}×</strong>.
      </p>

      <div className="adv-mc-controls">
        <label className="adv-mc-input-wrap">
          <span>Cost programa (€)</span>
          <input
            type="number"
            min={1000}
            step={500}
            value={costEur}
            onChange={(e) => setCostOverride(Math.max(1000, Number(e.target.value) || 1000))}
            className="adv-mc-input"
            aria-describedby="mc-cost-hint"
          />
        </label>
        <label className="adv-mc-input-wrap">
          <span>Durada (mesos)</span>
          <input
            type="number"
            min={1}
            max={36}
            value={months}
            onChange={(e) => setMonthsOverride(Math.max(1, Number(e.target.value) || 1))}
            className="adv-mc-input"
          />
        </label>
        <button
          type="button"
          className="adv-toggle-btn"
          onClick={() => {
            setCostOverride(null);
            setMonthsOverride(null);
          }}
        >
          Restaurar des de registres
        </button>
      </div>
      <p id="mc-cost-hint" className="adv-sroi-kpi-hint" style={{ margin: 0 }}>
        El cost es recalcula a cada simulació: base fixa 45 €/part./mes + 10 €/sessió efectiva.
      </p>

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
    </AdvCardWithInfo>
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

  if (isLoading || !data) {
    return (
      <AdvCardWithInfo infoTitle="Anomalies de trajectòria" info={ADV_INFO.anomalies}>
        <div className="adv-card-loading">Detectant anomalies…</div>
      </AdvCardWithInfo>
    );
  }

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
    <AdvCardWithInfo infoTitle="Anomalies de trajectòria" info={ADV_INFO.anomalies}>
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
    </AdvCardWithInfo>
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
  const [periodStart, setPeriodStart] = useState(() => monthsAgoISO(6));
  const [periodEnd, setPeriodEnd] = useState(() => todayISO());
  const { data: schools = [] } = useQuery({ queryKey: ["schools"], queryFn: listSchools });

  useEffect(() => {
    if (!programId && programs.length > 0) {
      setProgramId(programs[0].id);
    }
  }, [programId, programs]);

  const periodLabel = useMemo(() => {
    const fmt = (s: string) => new Date(s).toLocaleDateString("ca-ES", { day: "2-digit", month: "short", year: "numeric" });
    return `${fmt(periodStart)} — ${fmt(periodEnd)}`;
  }, [periodStart, periodEnd]);

  const { data: programSroi } = useQuery({
    queryKey: ["period-sroi", programId, periodStart, periodEnd],
    queryFn: () => getProgramSroi(programId, periodStart, periodEnd),
    enabled: !!programId,
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Atom size={22} strokeWidth={1.7} style={{ display: "inline-block", verticalAlign: "-3px", marginRight: 8 }} />
            Anàlisi avançada
          </h1>
          <p className="page-subtitle">
            SROI, dosi-resposta IPI, Monte Carlo i anomalies — període seleccionable, alineat amb el dashboard.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
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
          {/* Period pickers — same as coordinator dashboard */}
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <input
              type="date"
              className="form-input"
              style={{ fontSize: "0.82rem", padding: "0.35rem 0.5rem" }}
              value={periodStart}
              max={periodEnd}
              onChange={(e) => setPeriodStart(e.target.value)}
              aria-label="Inici del període"
            />
            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>→</span>
            <input
              type="date"
              className="form-input"
              style={{ fontSize: "0.82rem", padding: "0.35rem 0.5rem" }}
              value={periodEnd}
              min={periodStart}
              max={todayISO()}
              onChange={(e) => setPeriodEnd(e.target.value)}
              aria-label="Fi del període"
            />
          </div>
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
          <SROIModelSummaryCard
            programId={programId}
            periodStart={periodStart}
            periodEnd={periodEnd}
            periodLabel={periodLabel}
          />
          <DimensionEffectsCard programId={programId} />
          <AdvCardWithInfo infoTitle="Fiabilitat inter-avaluador" info={ADV_INFO.irr} className="adv-irr-wrap">
            <InterRaterReliabilityCard programId={programId} />
          </AdvCardWithInfo>
          <DoseResponseCard programId={programId} />
          <MonteCarloSROICard
            programId={programId}
            metrics={programSroi}
            periodStart={periodStart}
            periodEnd={periodEnd}
          />
          <AnomalyCard programId={programId} />
        </motion.div>
      )}
    </div>
  );
}
