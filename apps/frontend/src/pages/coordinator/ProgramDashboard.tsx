import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, ChevronDown, ChevronUp, CheckCircle2,
  CircleHelp, TrendingUp, Users, BarChart2, Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getAnalyticsTrend, getCostEffectiveness, getCoordinatorDashboard,
  getImpactStatement, getInterventionEffect, getIpiDistribution, getPeriodSroi, getSessionQuality,
} from "../../api/dashboard";
import { BootstrapCIBadge } from "../../components/analytics/BootstrapCIBadge";
import { EffectSizeCard } from "../../components/analytics/EffectSizeCard";
import { SignificanceIndicator } from "../../components/analytics/SignificanceIndicator";
import { ReportInsightsModal } from "../../components/reports/ReportInsightsModal";
import { listPrograms } from "../../api/programs";
import { generateReport } from "../../api/reports";
import SROIFormulaExplainer from "../../components/sroi/SROIFormulaExplainer";

const RISK_COLORS = ["#10b981", "#f59e0b", "#ef4444"];
const DISTRIBUTION_COLORS = ["#22c55e", "#84cc16", "#f59e0b", "#fb7185", "#ef4444"];
import {
  COORDINATOR_PERIOD_DAYS,
  COORDINATOR_DEFAULT_END_OFFSET,
  COORDINATOR_DEFAULT_START_OFFSET,
  computeCoordinatorPeriod,
} from "../../utils/coordinatorPeriod";

const DASHBOARD_RANGE_DAYS = COORDINATOR_PERIOD_DAYS;

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
            <div className="kpi-label">CPI — Cost per Participant Millorat <InfoHint text="Cost per participant que millora significativament." /></div>
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
  const [programInput, setProgramInput] = useState("");
  const [startDayOffset, setStartDayOffset] = useState(COORDINATOR_DEFAULT_START_OFFSET);
  const [endDayOffset, setEndDayOffset] = useState(COORDINATOR_DEFAULT_END_OFFSET);
  const [debouncedStartDayOffset, setDebouncedStartDayOffset] = useState(COORDINATOR_DEFAULT_START_OFFSET);
  const [debouncedEndDayOffset, setDebouncedEndDayOffset] = useState(COORDINATOR_DEFAULT_END_OFFSET);
  const [reportMessage, setReportMessage] = useState("");
  const [reportMessageType, setReportMessageType] = useState<"success" | "error" | "">("");
  const [isInsightsModalOpen, setIsInsightsModalOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedStartDayOffset(startDayOffset);
      setDebouncedEndDayOffset(endDayOffset);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [startDayOffset, endDayOffset]);

  const {
    periodStart,
    periodEnd,
    fmtStart,
    fmtEnd,
    selectedRangeDays,
  } = useMemo(
    () => computeCoordinatorPeriod(debouncedStartDayOffset, debouncedEndDayOffset),
    [debouncedStartDayOffset, debouncedEndDayOffset],
  );
  const trendMonths = useMemo(() => Math.max(1, Math.ceil(selectedRangeDays / 30)), [selectedRangeDays]);

  const { data, isLoading } = useQuery({
    queryKey: ["coordinator-dashboard", periodStart, periodEnd],
    queryFn: () => getCoordinatorDashboard(periodStart, periodEnd),
    placeholderData: (prev) => prev,
  });
  const { data: programs } = useQuery({ queryKey: ["programs", "dashboard"], queryFn: () => listPrograms(true) });
  const programChoices = useMemo(() => (programs ?? []).map((p) => ({ id: p.id, label: `${p.name} · ${p.id.slice(0,8)}`, search: `${p.name} ${p.id}`.toLowerCase() })), [programs]);
  const resolveProgramId = (raw: string) => {
    const q = raw.trim().toLowerCase();
    if (!q) return "";
    const exact = programChoices.find((i) => i.label.toLowerCase() === q || i.id.toLowerCase() === q);
    return exact?.id ?? programChoices.find((i) => i.search.includes(q))?.id ?? "";
  };
  const selectedProgramId = useMemo(() => resolveProgramId(programInput), [programInput, programs]);
  useEffect(() => { if (!programInput && programChoices.length > 0) setProgramInput(programChoices[0].label); }, [programChoices, programInput]);

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

  const reportMutation = useMutation({
    mutationFn: async (programId: string) => generateReport({ program_id: programId, report_type: "quarterly", period_start: periodStart, period_end: periodEnd, title: `Anàlisi ${periodStart} — ${periodEnd}` }),
    onSuccess: (payload) => { setReportMessageType("success"); setReportMessage(`Informe desat: ${payload.id}`); },
    onError: (error: any) => { const d = error?.response?.data?.detail; setReportMessageType("error"); setReportMessage(typeof d === "string" ? `Error: ${d}` : "No s'ha pogut generar l'informe."); },
  });

  const riskChartData = useMemo(() => [
    { name: "Baix", value: Number(data?.low_risk ?? 0) },
    { name: "Mitjà", value: Number(data?.medium_risk ?? 0) },
    { name: "Alt", value: Number(data?.high_risk ?? 0) },
  ], [data]);
  const distributionChartData = useMemo(() => Object.entries(distribution ?? {}).map(([range, value]) => ({ range, value: Number(value) })), [distribution]);
  const trendChartData = useMemo(() => (trend ?? []).map((item) => ({ period: item.period, ipi: item.avg_ipi })), [trend]);
  const radarData = useMemo(() => {
    const s = sessionQuality?.avg_dimension_scores;
    if (!s) return [];
    return [
      { dimension: "Acadèmic",   score: Number(s.academic ?? 0) },
      { dimension: "Cognitiu",   score: Number(s.cognitive ?? 0) },
      { dimension: "Social",     score: Number(s.social ?? 0) },
      { dimension: "Integració", score: Number(s.integration ?? 0) },
    ];
  }, [sessionQuality]);

  const dashboardReportContent = useMemo(() => ({
    headline_metrics: { evaluations: Number(data?.assessments_count ?? 0), improvement_pct: Math.round(Number(data?.avg_ipi ?? 0)), retention_rate: Math.round((data?.attendance_present_rate_last_30d ?? 0) * 100) },
    session_quality: { evidence_completeness: Number(sessionQuality?.evidence_completeness ?? 0), attendance_present_rate: Number(data?.attendance_present_rate_last_30d ?? 0), avg_mood: sessionQuality?.avg_mood ?? null, avg_sentiment: sessionQuality?.avg_sentiment ?? null },
    risk_distribution: { baix: Number(data?.low_risk ?? 0), mitja: Number(data?.medium_risk ?? 0), alt: Number(data?.high_risk ?? 0) },
    narrative: impactStatement?.statement ?? "Analítica consolidada del període seleccionat.",
    key_statements: [`Risc mitjà: ${Number(data?.avg_risk_score ?? 0).toFixed(2)}.`, `Qualitat de l'evidència: ${Math.round(Number(sessionQuality?.evidence_completeness ?? 0) * 100)}%.`, `Observacions: ${sessionQuality?.observations_count ?? 0}.`],
  }), [data, impactStatement, sessionQuality]);

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
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button className="btn-secondary" onClick={() => setIsInsightsModalOpen(true)} disabled={!selectedProgramId}>
            Informe complet
          </button>
          <Link to="/coordinator/reports" className="btn-primary" style={{ textDecoration: "none" }}>
            Informes guardats
          </Link>
        </div>
      </div>

      {/* ── 2. Controls ────────────────────────────────────────────────────── */}
      <div className="card dash-controls-card">
        <div className="dash-controls-grid dash-controls-grid--compact">
          <div>
            <div className="form-label">Programa</div>
            <div className="combo-field">
              <input list="dashboard-program-options" className="form-input" value={programInput} onChange={(e) => setProgramInput(e.target.value)} placeholder="Cerca per nom o ID" />
              <datalist id="dashboard-program-options">
                {programChoices.map((item) => <option key={item.id} value={item.label} />)}
              </datalist>
            </div>
          </div>

          <div className="dash-controls-period">
            <div className="form-label">Període analitzat</div>
            <div className="dash-range-block">
              <div className="dash-range-head">
                <span className="muted">Des de: {fmtStart}</span>
                <span className="muted">Fins a: {fmtEnd}</span>
              </div>
              <div className="dash-range-track-wrap">
                <div className="dash-range-track-base" />
                <div className="dash-range-track-active" style={{ left: `${(startDayOffset / DASHBOARD_RANGE_DAYS) * 100}%`, width: `${((endDayOffset - startDayOffset) / DASHBOARD_RANGE_DAYS) * 100}%` }} />
                <input type="range" min={0} max={DASHBOARD_RANGE_DAYS} step={1} value={startDayOffset} className="dash-range-slider dash-range-slider-start" style={{ zIndex: startDayOffset > DASHBOARD_RANGE_DAYS - endDayOffset ? 5 : 3 }} onInput={(e) => setStartDayOffset(Math.min(Number((e.target as HTMLInputElement).value), endDayOffset - 1))} />
                <input type="range" min={0} max={DASHBOARD_RANGE_DAYS} step={1} value={endDayOffset} className="dash-range-slider dash-range-slider-end" style={{ zIndex: 4 }} onInput={(e) => setEndDayOffset(Math.max(Number((e.target as HTMLInputElement).value), startDayOffset + 1))} />
              </div>
              <p className="muted" style={{ margin: "0.4rem 0 0", fontSize: "0.78rem" }}>Finestra: {selectedRangeDays} dies</p>
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
        {reportMessage && (
          <p style={{ color: reportMessageType === "error" ? "var(--risk-high)" : "var(--risk-low)", margin: "0.6rem 0 0", fontSize: "0.84rem" }}>
            {reportMessage}
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
                  ? <><CheckCircle2 size={13} strokeWidth={2.5} /> Efecte significatiu</>
                  : <><AlertTriangle size={13} strokeWidth={2.5} /> Efecte no significatiu</>}
              </span>
            </div>

            {ie.narrative && <p className="narrative-text">{ie.narrative}</p>}

            <StatGuide />

            {/* Stats detail */}
            <div className="stat-evidence-grid" style={{ marginTop: "1rem" }}>
              <EffectSizeCard d={ie.cohens_d} label={ie.cohens_d_label} />
              <SignificanceIndicator p={ie.wilcoxon_p} significant={ie.wilcoxon_significant} />
              <BootstrapCIBadge lower={ie.bootstrap_ci_95?.[0]} upper={ie.bootstrap_ci_95?.[1]} />
              {ie.has_control_group && (
                <div className="stat-evidence-card">
                  <div className="stat-evidence-label">Mann-Whitney U</div>
                  <div className="stat-evidence-value" style={{ color: ie.mann_whitney_significant ? "var(--risk-low)" : "var(--risk-medium)", fontSize: "1.2rem" }}>
                    {ie.mann_whitney_p != null ? `p = ${ie.mann_whitney_p.toFixed(3)}` : "p = —"}
                  </div>
                  <span className="stat-evidence-badge" style={{ color: ie.mann_whitney_significant ? "var(--risk-low)" : "var(--risk-medium)", background: ie.mann_whitney_significant ? "#ecfdf5" : "#fffbeb", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    {ie.mann_whitney_significant ? <><CheckCircle2 size={11} strokeWidth={2.5} /> Grup control</> : <><AlertTriangle size={11} strokeWidth={2.5} /> Grup control</>}
                  </span>
                  <div className="stat-evidence-hint">Intervenció vs. control</div>
                </div>
              )}
            </div>
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
                <div className="dash-chart-title">Qualitat per dimensió <InfoHint text="Puntuació mitjana per dimensió en el període." /></div>
                <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.82rem" }}>
                  Acadèmic, cognitiu, social i integració · {sessionQuality?.observations_count ?? 0} observacions.
                </p>
              </div>
            </div>
            <div className="chart-wrap">
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 5]} tick={false} />
                    <Tooltip />
                    <Radar dataKey="score" stroke="var(--brand-500)" fill="var(--brand-500)" fillOpacity={0.35} />
                  </RadarChart>
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

      <ReportInsightsModal
        open={isInsightsModalOpen}
        title="Informe complet del període"
        content={dashboardReportContent}
        onClose={() => setIsInsightsModalOpen(false)}
        onSave={() => {
          if (!selectedProgramId) { setReportMessageType("error"); setReportMessage("Selecciona un programa vàlid."); return; }
          if (periodEnd < periodStart) { setReportMessageType("error"); setReportMessage("La data de fi no pot ser anterior a la data d'inici."); return; }
          setReportMessageType(""); setReportMessage("");
          reportMutation.mutate(selectedProgramId);
        }}
        saveLabel="Desar informe"
        saving={reportMutation.isPending}
      />
    </div>
  );
}
