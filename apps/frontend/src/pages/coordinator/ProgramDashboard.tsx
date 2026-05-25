import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, ChevronDown, ChevronUp, CheckCircle2,
  CircleHelp, TrendingUp, Users, BarChart2, Target,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getAnalyticsTrend, getCostEffectiveness, getCoordinatorDashboard,
  getImpactStatement, getInterventionEffect, getIpiDistribution, getPeriodSroi, getSessionQuality,
} from "../../api/dashboard";
import { BootstrapCIBadge } from "../../components/analytics/BootstrapCIBadge";
import { EffectSizeCard } from "../../components/analytics/EffectSizeCard";
import { SignificanceIndicator } from "../../components/analytics/SignificanceIndicator";
import { listPrograms } from "../../api/programs";
import SROIFormulaExplainer from "../../components/sroi/SROIFormulaExplainer";

const RISK_COLORS = ["#10b981", "#f59e0b", "#ef4444"];
const DISTRIBUTION_COLORS = ["#22c55e", "#84cc16", "#f59e0b", "#fb7185", "#ef4444"];
const DIM_OBS_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"];
// ── Helpers de data per defecte (últims 6 mesos fins avui)
function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthsAgoISO(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="info-hint">
      <CircleHelp size={14} />
      <span className="info-tooltip">{text}</span>
    </span>
  );
}

function DashSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dash-section">
      <div className="dash-section-label">{label}</div>
      {children}
    </div>
  );
}

function StatGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="stat-guide-box">
      <button className="stat-guide-toggle" onClick={() => setOpen((o) => !o)}>
        <BookOpen size={13} strokeWidth={2.5} />
        Com s'interpreten aquests valors?
        {open ? <ChevronUp size={13} strokeWidth={2.5} /> : <ChevronDown size={13} strokeWidth={2.5} />}
      </button>
      {open && (
        <div className="stat-guide-body">
          <div className="stat-guide-grid">
            <div className="stat-guide-item">
              <div className="stat-guide-term">Punt de partida (Baseline)</div>
              <div className="stat-guide-def">
                La puntuació IPI inicial quan l'infant entra al programa. Tot el progrés es mesura des d'aquí.
                <em> Exemple: entra amb IPI 38 i acaba el curs amb 61.</em>
              </div>
            </div>
            <div className="stat-guide-item">
              <div className="stat-guide-term">IPI (Índex de Progrés Integral, 0–100)</div>
              <div className="stat-guide-def">
                Nota global que combina acadèmic, cognitiu, social i integració.
                <em> 50 és el punt mig. La majoria d'infants entren entre 30–55.</em>
              </div>
            </div>
            <div className="stat-guide-item">
              <div className="stat-guide-term">Mida de l'efecte — Cohen's d</div>
              <div className="stat-guide-def">
                "Quant ha canviat el grup respecte a la seva variabilitat?"
                <strong> d &lt; 0.2</strong> trivial · <strong>0.2–0.5</strong> petit ·{" "}
                <strong>0.5–0.8</strong> moderat · <strong>&gt; 0.8</strong> gran.
                <em> En ciències socials, d &gt; 0.5 ja és rellevant.</em>
              </div>
            </div>
            <div className="stat-guide-item">
              <div className="stat-guide-term">p-valor (Wilcoxon)</div>
              <div className="stat-guide-def">
                "La millora podria ser per atzar?" Si p &lt; 0.05 → la millora és real i consistent.
                <em> p &lt; 0.05 no vol dir que sigui gran, només que no és casualitat.</em>
              </div>
            </div>
            <div className="stat-guide-item">
              <div className="stat-guide-term">Interval de confiança 95%</div>
              <div className="stat-guide-def">
                Si repetíssim el programa 100 vegades, en 95 la millora real estaria dins d'aquest rang.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CeaSection({
  costEffectiveness,
  formatCurrency,
}: {
  costEffectiveness: any;
  formatCurrency: (v: number | null | undefined) => string;
}) {
  const [open, setOpen] = useState(false);
  const ce = costEffectiveness;
  const inv = ce?.period_investment;
  const cmp = ce?.comparator_investment;
  return (
    <div className="dash-cea-wrap">
      <button className="dash-cea-toggle" onClick={() => setOpen((o) => !o)}>
        <Target size={14} strokeWidth={2} />
        Anàlisi cost-efectivitat (CEA)
        <InfoHint text="Relació entre recursos invertits i resultats de millora." />
        {open ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
      </button>
      {inv && (
        <p className="dash-cost-auto" style={{ marginTop: "0.5rem" }}>
          <strong>Cost del període:</strong> {formatCurrency(inv.total_cost_eur)} ·{" "}
          <strong>{inv.n_sessions}</strong> sessions × {formatCurrency(inv.cost_per_session_eur)}/sessió
          {cmp ? (
            <>
              {" "}
              · <strong>Període anterior:</strong> {formatCurrency(cmp.total_cost_eur)} ({cmp.n_sessions}{" "}
              sessions)
            </>
          ) : null}
        </p>
      )}
      {open && (
        <div className="dash-cea-grid">
          <div className="card kpi-card">
            <div className="kpi-label">CPB — Cost per Beneficiari <InfoHint text="Cost mitjà per participant atès." /></div>
            <div className="metric-value">{formatCurrency(ce?.cost_metrics?.cost_per_beneficiary)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">CPI — Cost per participant millorat <InfoHint text="Cost per participant amb millora estadísticament significativa." /></div>
            <div className="metric-value">{formatCurrency(ce?.cost_metrics?.cost_per_improved_participant)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Cost per Punt IPI <InfoHint text="Cost per punt de progrés guanyat." /></div>
            <div className="metric-value">{formatCurrency(ce?.cost_metrics?.cost_per_ipi_point_gained)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Taxa d'Assoliment <InfoHint text="Proporció de participants que milloren." /></div>
            <div className="metric-value">{Math.round((ce?.outcome_achievement_rate ?? 0) * 100)}%</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Guany IPI vs Baseline <InfoHint text="Increment mitjà vs referència inicial." /></div>
            <div className="metric-value">{(ce?.avg_ipi_gain_vs_baseline ?? 0).toFixed(1)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">ICER vs període anterior <InfoHint text="Cost incremental per unitat addicional de resultat." /></div>
            <div className="metric-value">{formatCurrency(ce?.cost_metrics?.icer_vs_previous_period)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgramDashboardPage() {
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [startDate, setStartDate] = useState(() => monthsAgoISO(6));
  const [endDate, setEndDate]     = useState(() => todayISO());
  const periodStart = startDate;
  const periodEnd   = endDate;
  const selectedRangeDays = useMemo(() => {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(1, Math.ceil(ms / 86_400_000) + 1);
  }, [startDate, endDate]);
  const trendMonths = useMemo(() => Math.max(1, Math.ceil(selectedRangeDays / 30)), [selectedRangeDays]);

  const { data, isLoading } = useQuery({
    queryKey: ["coordinator-dashboard", periodStart, periodEnd],
    queryFn: () => getCoordinatorDashboard(periodStart, periodEnd),
    placeholderData: (prev) => prev,
  });
  const { data: programs } = useQuery({ queryKey: ["programs", "dashboard"], queryFn: () => listPrograms(true) });
  useEffect(() => {
    if (!selectedProgramId && programs && programs.length > 0) {
      setSelectedProgramId(programs[0].id);
    }
  }, [programs, selectedProgramId]);

  const { data: distribution } = useQuery({ queryKey: ["ipi-distribution", selectedProgramId, periodStart, periodEnd], queryFn: () => getIpiDistribution(selectedProgramId, periodStart, periodEnd), enabled: !!selectedProgramId, placeholderData: (prev) => prev });
  const { data: trend } = useQuery({ queryKey: ["analytics-trend", selectedProgramId, trendMonths], queryFn: () => getAnalyticsTrend(selectedProgramId, trendMonths), enabled: !!selectedProgramId, placeholderData: (prev) => prev });
  const { data: impactStatement } = useQuery({ queryKey: ["impact-statement", selectedProgramId], queryFn: () => getImpactStatement(selectedProgramId), enabled: !!selectedProgramId, placeholderData: (prev) => prev });
  const { data: interventionEffect } = useQuery({ queryKey: ["intervention-effect", selectedProgramId, periodStart, periodEnd], queryFn: () => getInterventionEffect(selectedProgramId, periodStart, periodEnd), enabled: !!selectedProgramId, placeholderData: (prev) => prev });
  const { data: sessionQuality } = useQuery({ queryKey: ["session-quality", selectedProgramId, periodStart, periodEnd], queryFn: () => getSessionQuality(selectedProgramId, periodStart, periodEnd), enabled: !!selectedProgramId, placeholderData: (prev) => prev });

  const { data: costEffectiveness } = useQuery({
    queryKey: ["cost-effectiveness", selectedProgramId, periodStart, periodEnd],
    queryFn: () => getCostEffectiveness(selectedProgramId, periodStart, periodEnd),
    enabled: !!selectedProgramId,
    placeholderData: (prev) => prev,
  });
  const { data: periodSroi } = useQuery({
    queryKey: ["period-sroi", selectedProgramId, periodStart, periodEnd],
    queryFn: () => getPeriodSroi(selectedProgramId, periodStart, periodEnd),
    enabled: !!selectedProgramId,
    placeholderData: (prev) => prev,
  });

  const riskChartData = useMemo(() => [
    { name: "Baix", value: Number(data?.low_risk ?? 0) },
    { name: "Mitjà", value: Number(data?.medium_risk ?? 0) },
    { name: "Alt", value: Number(data?.high_risk ?? 0) },
  ], [data]);
  const distributionChartData = useMemo(() => Object.entries(distribution ?? {}).map(([range, value]) => ({ range, value: Number(value) })), [distribution]);
  const trendChartData = useMemo(() => (trend ?? []).map((item) => ({ period: item.period, ipi: item.avg_ipi })), [trend]);
  const dimensionObsData = useMemo(() => {
    const s = sessionQuality?.avg_dimension_scores;
    if (!s || !sessionQuality?.observations_count) return [];
    return [
      { dimension: "Acadèmic", score: Number(s.academic ?? 0) },
      { dimension: "Cognitiu", score: Number(s.cognitive ?? 0) },
      { dimension: "Social", score: Number(s.social ?? 0) },
      { dimension: "Integració", score: Number(s.integration ?? 0) },
    ];
  }, [sessionQuality]);

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return "—";
    return new Intl.NumberFormat("ca-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  };

  if (isLoading) return <div className="page-container"><div className="empty-state">Carregant el tauler…</div></div>;

  const ie = interventionEffect;
  const hasEffect = ie && !ie.error && ie.n_participants > 0;

  return (
    <div className="page-container dash-page">

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Tauler analític</h1>
          <p className="page-subtitle">Progrés, evidència i eficiència del programa</p>
        </div>
      </div>

      {/* ── 2. Controls ────────────────────────────────────────────────────── */}
      <div className="card dash-controls-card">
        <div className="dash-controls-grid dash-controls-grid--compact">
          <div>
            <div className="form-label">Programa</div>
            <select
              className="form-input"
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
            >
              {(programs ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="dash-controls-period">
            <div className="form-label">Període analitzat</div>
            <div className="dash-daterange">
              <div className="dash-daterange-field">
                <label className="dash-daterange-label">Des de</label>
                <input
                  type="date"
                  className="form-input dash-date-input"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <span className="dash-daterange-sep">→</span>
              <div className="dash-daterange-field">
                <label className="dash-daterange-label">Fins a</label>
                <input
                  type="date"
                  className="form-input dash-date-input"
                  value={endDate}
                  min={startDate}
                  max={todayISO()}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <span className="dash-daterange-badge">{selectedRangeDays} dies</span>
            </div>
          </div>
        </div>
        {costEffectiveness?.period_investment && (
          <p className="dash-cost-auto" style={{ marginTop: "0.85rem" }}>
            <strong>Inversió operativa del període</strong> (des de registres):{" "}
            {formatCurrency(costEffectiveness.period_investment.total_cost_eur)} —{" "}
            {costEffectiveness.period_investment.n_sessions} sessions registrades ×{" "}
            {formatCurrency(costEffectiveness.period_investment.cost_per_session_eur)}/sessió
          </p>
        )}
      </div>

      {/* ── 3. Visió general — 4 KPIs principals ──────────────────────────── */}
      <DashSection label="Visió general">
        <div className="dash-kpi-row dash-kpi-row--main">
          <div className="card kpi-card kpi-card--accent">
            <div className="kpi-icon"><Users size={18} strokeWidth={1.8} /></div>
            <div className="kpi-label">Participants actius</div>
            <div className="metric-value">{data?.participants_active ?? 0}</div>
          </div>
          <div className="card kpi-card kpi-card--accent">
            <div className="kpi-icon"><TrendingUp size={18} strokeWidth={1.8} /></div>
            <div className="kpi-label">IPI mitjà <InfoHint text="Progrés integral del grup (0–100)." /></div>
            <div className="metric-value">{data?.avg_ipi ?? 0}</div>
          </div>
          <div className="card kpi-card kpi-card--accent">
            <div className="kpi-icon"><BarChart2 size={18} strokeWidth={1.8} /></div>
            <div className="kpi-label">Assistència efectiva (30d) <InfoHint text="Presència del grup en els últims 30 dies." /></div>
            <div className="metric-value">{Math.round((data?.attendance_present_rate_last_30d ?? 0) * 100)}%</div>
          </div>
          <div className="card kpi-card kpi-card--accent">
            <div className="kpi-icon"><CheckCircle2 size={18} strokeWidth={1.8} /></div>
            <div className="kpi-label">Qualitat evidència (30d) <InfoHint text="Completesa de les observacions registrades." /></div>
            <div className="metric-value">{Math.round((data?.evidence_completeness_last_30d ?? 0) * 100)}%</div>
          </div>
        </div>
      </DashSection>

      {/* ── 4. Evidència d'impacte ─────────────────────────────────────────── */}
      {hasEffect && (
        <DashSection label="Ha funcionat el programa?">
          <div className="card">
            {/* Headline */}
            <div className="dash-impact-headline">
              <div className="dash-impact-numbers">
                <div className="dash-impact-change">
                  <span className="dash-impact-change-value" style={{ color: (ie.ipi_change_percent ?? 0) >= 0 ? "var(--trend-up)" : "var(--trend-down)" }}>
                    {(ie.ipi_change_percent ?? 0) >= 0 ? "+" : ""}{ie.ipi_change_percent?.toFixed(1)}%
                  </span>
                  <span className="dash-impact-change-label">de millora de l'IPI</span>
                </div>
                <div className="dash-impact-baseline">
                  <span className="dash-impact-baseline-flow">
                    {ie.ipi_mean_baseline?.toFixed(1)} <span className="dash-impact-arrow">→</span> {ie.ipi_mean_final?.toFixed(1)}
                  </span>
                  <span className="dash-impact-baseline-label">punt de partida → nivell actual</span>
                </div>
                <div className="dash-impact-n">
                  {ie.n_participants} participants · {periodStart} — {periodEnd}
                </div>
              </div>
              <span className={`dash-impact-badge${ie.wilcoxon_significant ? "" : " dash-impact-badge--warn"}`}>
                {ie.wilcoxon_significant
                  ? <><CheckCircle2 size={13} strokeWidth={2.5} /> Millora confirmada</>
                  : <><AlertTriangle size={13} strokeWidth={2.5} /> Millora no confirmada</>}
              </span>
            </div>

            {ie.narrative && <p className="narrative-text">{ie.narrative}</p>}

            <p className="dash-impact-stats-lead">
              <strong>Mida de l&apos;efecte</strong> (quant canvia el grup),{" "}
              <strong>significació</strong> (si el canvi és real o atzar) i{" "}
              <strong>interval de confiança</strong> (rang probable de l&apos;IPI final).
            </p>

            <div className="stat-evidence-grid dash-impact-stats-grid">
              <EffectSizeCard d={ie.cohens_d} label={ie.cohens_d_label} />
              <SignificanceIndicator p={ie.wilcoxon_p} significant={ie.wilcoxon_significant} />
              <BootstrapCIBadge lower={ie.bootstrap_ci_95?.[0]} upper={ie.bootstrap_ci_95?.[1]} />
              {ie.has_control_group && (
                <div className="stat-evidence-card">
                  <div className="stat-evidence-label">Comparació amb control</div>
                  <div className="stat-evidence-value" style={{ color: ie.mann_whitney_significant ? "var(--risk-low)" : "var(--risk-medium)", fontSize: "1.2rem" }}>
                    {ie.mann_whitney_p != null ? `p = ${ie.mann_whitney_p.toFixed(3)}` : "p = —"}
                  </div>
                  <span className="stat-evidence-badge" style={{ color: ie.mann_whitney_significant ? "var(--risk-low)" : "var(--risk-medium)", background: ie.mann_whitney_significant ? "#ecfdf5" : "#fffbeb" }}>
                    {ie.mann_whitney_significant ? "Millor que el control" : "Sense diferència clara"}
                  </span>
                  <div className="stat-evidence-hint">Mann-Whitney U — intervenció vs. grup de control</div>
                  <div className="stat-evidence-plain">
                    {ie.mann_whitney_significant
                      ? "El grup del programa supera el grup de control amb evidència estadística."
                      : "No es pot afirmar encara que el programa superi el grup de control."}
                  </div>
                </div>
              )}
            </div>

            <StatGuide />
          </div>
        </DashSection>
      )}

      {/* ── 5. Evolució i distribució ──────────────────────────────────────── */}
      <DashSection label="Com evoluciona el grup?">
        <div className="dash-chart-pair">
          <div className="card">
            <div className="dash-chart-header">
              <div>
                <div className="dash-chart-title">Tendència IPI <InfoHint text="Evolució del progrés integral al llarg del temps." /></div>
                <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>Si puja, el rendiment general millora en el període.</p>
              </div>
            </div>
            {impactStatement?.statement && <p className="insight-box" style={{ marginBottom: "0.75rem" }}>{impactStatement.statement}</p>}
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="ipi" name="IPI mitjà" stroke="var(--brand-500)" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="dash-chart-header">
              <div>
                <div className="dash-chart-title">Distribució IPI per rangs <InfoHint text="Participants per tram de rendiment." /></div>
                <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>Concentració per tram per identificar necessitats.</p>
              </div>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={distributionChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Participants" radius={[6,6,0,0]}>
                    {distributionChartData.map((item, index) => (
                      <Cell key={item.range} fill={DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </DashSection>

      {/* ── 6. Risc i qualitat ─────────────────────────────────────────────── */}
      <DashSection label="Qui necessita atenció?">
        <div className="dash-chart-pair">
          <div className="card">
            <div className="dash-chart-header">
              <div>
                <div className="dash-chart-title">Distribució de risc <InfoHint text="Participants per nivell de risc." /></div>
                <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>
                  Baix · Mitjà · Alt — per prioritzar intervencions de suport.
                </p>
              </div>
            </div>
            <div className="dash-risk-inline">
              <div className="chart-wrap" style={{ flex: "0 0 200px" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={riskChartData} dataKey="value" nameKey="name" outerRadius={80} label>
                      {riskChartData.map((entry, index) => (
                        <Cell key={entry.name} fill={RISK_COLORS[index % RISK_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="dash-risk-legend">
                {riskChartData.map((item, i) => (
                  <div key={item.name} className="dash-risk-legend-row">
                    <span className="dash-risk-dot" style={{ background: RISK_COLORS[i] }} />
                    <span className="dash-risk-legend-label">{item.name}</span>
                    <span className="dash-risk-legend-value">{item.value}</span>
                  </div>
                ))}
                <div className="dash-secondary-kpis">
                  <div className="dash-secondary-kpi">
                    <div className="kpi-label">Risc mitjà</div>
                    <div style={{ fontWeight: 700, fontSize: "1.2rem" }}>{Number(data?.avg_risk_score ?? 0).toFixed(2)}</div>
                  </div>
                  <div className="dash-secondary-kpi">
                    <div className="kpi-label">Avaluacions</div>
                    <div style={{ fontWeight: 700, fontSize: "1.2rem" }}>{data?.assessments_count ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="dash-chart-header">
              <div>
                <div className="dash-chart-title">
                  Observacions per dimensió (1–5)
                  <InfoHint text="Mitjana de les puntuacions registrades a cada sessió (escala 1 = baix, 5 = alt). No és l'IPI global." />
                </div>
                <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>
                  Basat en {sessionQuality?.observations_count ?? 0} observacions de sessió al període.
                </p>
              </div>
            </div>
            <div className="chart-wrap dash-dim-chart-wrap">
              {dimensionObsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={dimensionObsData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="dimension" width={78} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${Number(v).toFixed(2)} / 5`, "Mitjana"]} />
                    <Bar dataKey="score" name="Mitjana" radius={[0, 6, 6,  0]} barSize={22}>
                      {dimensionObsData.map((_, index) => (
                        <Cell key={dimensionObsData[index].dimension} fill={DIM_OBS_COLORS[index % DIM_OBS_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: "2rem" }}>
                  No hi ha observacions suficients per a aquest període.
                </div>
              )}
            </div>
          </div>
        </div>
      </DashSection>

      {/* ── 7. SROI i cost-efectivitat ─────────────────────────────────────── */}
      <DashSection label="SROI i eficiència">
        {periodSroi && (
          <div className="card" style={{ marginBottom: "0.75rem" }}>
            <div className="dash-sroi-hero">
              <div>
                <div className="kpi-label">SROI del període</div>
                <div className="dash-sroi-ratio">{periodSroi.sroi_ratio.toFixed(2)}×</div>
                <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>
                  {periodSroi.sroi_statement}
                </p>
              </div>
              <div className="dash-kpi-row" style={{ flex: 1, minWidth: 280 }}>
                <div className="card kpi-card">
                  <div className="kpi-label">Valor social estimat</div>
                  <div className="metric-value" style={{ fontSize: "1.35rem" }}>
                    {formatCurrency(periodSroi.total_social_value_eur)}
                  </div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-label">Inversió (sessions)</div>
                  <div className="metric-value" style={{ fontSize: "1.35rem" }}>
                    {formatCurrency(periodSroi.total_investment_eur)}
                  </div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-label">€ per cada €1</div>
                  <div className="metric-value" style={{ fontSize: "1.35rem" }}>
                    {periodSroi.total_investment_eur > 0
                      ? (periodSroi.total_social_value_eur / periodSroi.total_investment_eur).toFixed(2)
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
            {periodSroi.formula_explanation && (
              <SROIFormulaExplainer
                formula={periodSroi.formula_explanation}
                formatCurrency={formatCurrency}
              />
            )}
          </div>
        )}
        <CeaSection costEffectiveness={costEffectiveness} formatCurrency={formatCurrency} />
      </DashSection>

    </div>
  );
}
