import { useQuery } from "@tanstack/react-query";
import { animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer } from "recharts";
import {
  BookOpen, Brain, Users2, Globe,
  BarChart3, FlaskConical, Ruler, RefreshCw,
  ChevronDown, ChevronUp, Filter,
} from "lucide-react";
import { getDonorDashboard, getDonorSROI, getInterventionEffect, getPublicPrograms } from "../../api/dashboard";
import SROIStatement from "../../components/sroi/SROIStatement";
import SROIBreakdown from "../../components/sroi/SROIBreakdown";

const DEFAULT_COST_EUR = 18000;
const DEFAULT_MONTHS = 9;
const ORG_SLUG = "narinan";

const RISK_COLORS: Record<string, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
};
const RISK_LABELS: Record<string, string> = { low: "Baix", medium: "Mitjà", high: "Alt" };

const DIM_ICONS: Record<string, React.ElementType> = {
  academic: BookOpen,
  cognitive: Brain,
  social: Users2,
  integration: Globe,
};
const DIM_LABELS: Record<string, string> = {
  academic: "Acadèmic",
  cognitive: "Cognitiu",
  social: "Social",
  integration: "Integració",
};
const DIM_COLORS: Record<string, string> = {
  academic: "var(--dim-academic)",
  cognitive: "var(--dim-cognitive)",
  social: "var(--dim-social)",
  integration: "var(--dim-integration)",
};
const DIM_DESCS: Record<string, string> = {
  academic: "Comprensió lectora, matemàtiques i deures autònoms.",
  cognitive: "Atenció, memòria i capacitat de planificació.",
  social: "Relació amb iguals, treball en grup i regulació emocional.",
  integration: "Fluïdesa lingüística i adaptació cultural.",
};

const SEAL_ICONS: Record<string, React.ElementType> = {
  "SROI Network Standard": BarChart3,
  "OECD DAC Criteria": Ruler,
  "Estadística no paramètrica": FlaskConical,
  "Bootstrap CI 95%": RefreshCw,
};

function AnimatedCounter({ target, decimals = 0, suffix = "" }: { target: number; decimals?: number; suffix?: string }) {
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    const controls = animate(motionVal, target, { duration: 1.8, ease: "easeOut" });
    const unsub = motionVal.on("change", (v) => setDisplay(v.toFixed(decimals) + suffix));
    return () => { controls.stop(); unsub(); };
  }, [target, decimals, suffix]);
  return <span>{display}</span>;
}

function HeroSkeleton() {
  return (
    <div className="donor-counters">
      {[0, 1, 2].map((i) => (
        <div key={i} className="donor-counter-card donor-counter-card--loading">
          <div className="donor-skeleton donor-skeleton--value" />
          <div className="donor-skeleton donor-skeleton--label" />
        </div>
      ))}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="info-box">
      <button type="button" className="info-box-toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
        Com s'han calculat els euros?
      </button>
      {open && <div className="info-box-body">{children}</div>}
    </div>
  );
}

export default function ImpactPortalPage() {
  const [costEur, setCostEur] = useState(DEFAULT_COST_EUR);
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [costInput, setCostInput] = useState(String(DEFAULT_COST_EUR));
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");

  const { data: donor, isLoading: donorLoading } = useQuery({
    queryKey: ["donor-dashboard", ORG_SLUG, selectedProgramId],
    queryFn: () => getDonorDashboard(ORG_SLUG, selectedProgramId || undefined),
  });

  const programId = donor?.program_id;

  const { data: effect } = useQuery({
    queryKey: ["intervention-effect", programId],
    queryFn: () => getInterventionEffect(programId!),
    enabled: !!programId,
  });

  const { data: sroi, isLoading: sroiLoading, isError: sroiError } = useQuery({
    queryKey: ["donor-sroi", ORG_SLUG, selectedProgramId, costEur, months],
    queryFn: () => getDonorSROI(ORG_SLUG, costEur, months, selectedProgramId || undefined),
  });

  const { data: programs } = useQuery({
    queryKey: ["donor-programs", ORG_SLUG],
    queryFn: () => getPublicPrograms(ORG_SLUG),
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const v = Number(costInput);
      if (!isNaN(v) && v >= 100) {
        setCostEur(v);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [costInput]);

  const donorReady = !donorLoading && !!donor;
  const sroiReady = !sroiLoading && !!sroi;

  const nParticipants = donor?.n_participants ?? 0;
  const avgIpiGainPct = donor?.avg_ipi_gain_pct ?? 0;
  const sroiRatio = sroi?.sroi_ratio ?? 0;
  const riskDist = donor?.risk_distribution ?? { low: 0, medium: 0, high: 0 };
  const dimEvolution = donor?.dimension_evolution ?? {};

  const riskPieData = Object.entries(riskDist)
    .filter(([, v]) => (v as number) > 0)
    .map(([key, value]) => ({ name: key, value: value as number }));

  const cohensD = effect?.cohens_d ?? null;
  const pValue = effect?.p_value ?? null;
  const ci = effect?.confidence_interval_95 ?? null;
  const narrative = effect?.narrative ?? donor?.narrative ?? null;

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8012/api/v1";

  const handleDownloadEvidence = () => {
    if (!programId) return;
    const url = `${apiBase}/analytics/evidence-export?program_id=${programId}&cost_eur=${costEur}`;
    window.open(url, "_blank");
  };

  return (
    <div className="donor-ui">
    <div className="donor-portal donor-page">

      {/* ── 1. HERO ─────────────────────────────────────────────── */}
      <section className="donor-hero">
        <div className="donor-hero-inner">
          <div className="donor-hero-eyebrow">Narinaan · Mesura d'Impacte Social 2024–25</div>
          <h1 className="donor-hero-title">De l'activitat a l'evidència.</h1>
          <p className="donor-hero-subtitle">
            Dades reals, metodologia rigorosa, transparència total.
          </p>

          {!donorReady || !sroiReady ? (
            <HeroSkeleton />
          ) : (
            <div className="donor-counters">
              <div className="donor-counter-card">
                <div className="donor-counter-value">
                  <AnimatedCounter target={nParticipants} />
                </div>
                <div className="donor-counter-label">Infants acompanyats</div>
              </div>
              <div className="donor-counter-card">
                <div className="donor-counter-value">
                  <AnimatedCounter target={avgIpiGainPct} decimals={1} suffix=" pts" />
                </div>
                <div className="donor-counter-label">Millora mitjana IPI</div>
              </div>
              <div className="donor-counter-card">
                <div className="donor-counter-value">
                  €<AnimatedCounter target={sroiRatio} decimals={2} />
                </div>
                <div className="donor-counter-label">Valor social per cada €1 invertit</div>
              </div>
            </div>
          )}

          <button
            type="button"
            className="donor-cta-btn"
            onClick={handleDownloadEvidence}
            disabled={!donorReady}
          >
            Descarrega l'informe complet
          </button>
        </div>
      </section>

      {/* ── SELECTOR PROGRAMA ──────────────────────────────────── */}
      <div className="donor-selector-bar">
        <div className="donor-selector-inner">
          <Filter size={16} className="donor-selector-icon" />
          <span className="donor-selector-label">Veure dades de:</span>
          <select
            className="donor-program-select"
            value={selectedProgramId}
            onChange={(e) => setSelectedProgramId(e.target.value)}
          >
            <option value="">Tots els programes</option>
            {programs?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── 2. FUNCIÓ DE NARINAN ───────────────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Què fa Narinan?</h2>
        <p className="donor-section-sub">
          Narinan acompanya infants i joves en situació de vulnerabilitat mitjançant programes
          socioeducatius a les escoles: reforç escolar, teatre social, suport emocional i integració.
          Els voluntaris registren cada sessió; la coordinació mesura el progrés real amb l'IPI.
        </p>
        <div className="donor-photo-grid">
          <img src="/images/narinan/activity-1.svg" alt="Sessió de reforç escolar en petit grup" width={280} height={180} />
          <img src="/images/narinan/activity-2.svg" alt="Activitat de teatre social" width={280} height={180} />
          <img src="/images/narinan/activity-3.svg" alt="Acompanyament educatiu personalitzat" width={280} height={180} />
        </div>
      </section>

      {/* ── 3. ABANS I ARA ─────────────────────────────────────── */}
      <section className="donor-section donor-section-alt">
        <h2 className="donor-section-title">Abans i ara</h2>
        <p className="donor-section-sub">
          Evolució de cada dimensió des del moment d'entrada al programa fins avui.
          La puntuació IPI va de 0 a 100 punts.
        </p>

        {!donorReady ? (
          <div className="donor-loading-block">
            <div className="donor-skeleton donor-skeleton--card" />
            <div className="donor-skeleton donor-skeleton--card" />
          </div>
        ) : Object.keys(dimEvolution).length === 0 ? (
          <p className="donor-empty-msg">
            Encara no hi ha prou dades per mostrar l'evolució per dimensions.
          </p>
        ) : (
          <div className="before-after-grid">
            {Object.entries(dimEvolution).map(([dim, data]: [string, any]) => {
              const baseline = data?.baseline ?? 0;
              const current = data?.current ?? 0;
              const gain = data?.gain ?? 0;
              return (
                <div key={dim} className="before-after-item">
                  <div className="before-after-header">
                    <div>
                      <span className="before-after-dim" style={{ color: DIM_COLORS[dim] }}>
                        {DIM_LABELS[dim] ?? dim}
                      </span>
                      <div className="before-after-dim-desc">{DIM_DESCS[dim]}</div>
                    </div>
                    <span className="before-after-gain" style={{ color: gain > 0 ? "var(--risk-low)" : gain < 0 ? "var(--risk-high)" : "var(--text-muted)" }}>
                      {gain > 0 ? "+" : ""}{gain.toFixed(1)} pts
                    </span>
                  </div>
                  <div className="before-after-bars">
                    <div className="before-after-bar-row">
                      <span className="before-after-bar-label">Entrada</span>
                      <div className="before-after-bar-track">
                        <motion.div className="before-after-bar" style={{ background: "var(--surface-3)" }} initial={{ width: 0 }} animate={{ width: `${Math.min(baseline, 100)}%` }} transition={{ duration: 1.2, ease: "easeOut" }} />
                      </div>
                      <span className="before-after-bar-pct">{baseline.toFixed(0)} pts</span>
                    </div>
                    <div className="before-after-bar-row">
                      <span className="before-after-bar-label">Ara</span>
                      <div className="before-after-bar-track">
                        <motion.div className="before-after-bar" style={{ background: DIM_COLORS[dim] }} initial={{ width: 0 }} animate={{ width: `${Math.min(current, 100)}%` }} transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }} />
                      </div>
                      <span className="before-after-bar-pct">{current.toFixed(0)} pts</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 4. SROI ───────────────────────────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Retorn social de la inversió (SROI)</h2>
        {sroiLoading && <p className="donor-loading-text">Calculant SROI…</p>}
        {sroiError && <p className="form-error" role="alert">No s'ha pogut calcular l'SROI. Comprova la connexió.</p>}
        {sroi && (
          <>
          <p className="donor-section-sub">
            Ajusta la inversió i la durada per simular l'impacte del teu programa.
          </p>
          <div className="sroi-config-row">
            <label className="sroi-config-field" htmlFor="donor-sroi-cost">
              <span className="sroi-config-label">Inversió total del programa (€)</span>
              <input
                id="donor-sroi-cost"
                className="form-input sroi-config-input"
                type="number"
                min={1000}
                step={500}
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
              />
            </label>
            <label className="sroi-config-field" htmlFor="donor-sroi-months">
              <span className="sroi-config-label">Durada del programa (mesos)</span>
              <input
                id="donor-sroi-months"
                className="form-input sroi-config-input"
                type="number"
                min={1}
                max={36}
                step={1}
                value={months}
                onChange={(e) => setMonths(Math.max(1, Number(e.target.value)))}
              />
            </label>
          </div>
          <div className="sroi-layout">
            <SROIStatement sroiRatio={sroi.sroi_ratio} conservative={sroi.sensitivity_analysis?.conservative} optimistic={sroi.sensitivity_analysis?.optimistic} statement={sroi.sroi_statement} />
            <SROIBreakdown breakdown={sroi.value_breakdown ?? {}} />
          </div>
          </>
        )}
      </section>

      {/* ── 5. QUÈ I COM MESUREM (desplegables) ─────────────────── */}
      <section className="donor-section donor-section-alt">
        <h2 className="donor-section-title">Què i com mesurem?</h2>
        <p className="donor-section-sub">Metodologia detallada (opcional)</p>

      <details className="donor-accordion">
        <summary>Què mesurem? — L'IPI</summary>
        <div className="donor-accordion-body">
        <p className="donor-section-sub" style={{ marginTop: "0.75rem" }}>
          L'<strong>Índex de Progrés Integral (IPI)</strong> és la brúixola del programa.
          Mesura el progrés de cada infant en quatre dimensions clau, en una escala de 0 a 100 punts.
          Al principi, cada educador/a fa una avaluació inicial (el "punt de partida")
          i a partir d'aquí mesurem com evoluciona cada infant al llarg del curs.
        </p>
        <div className="ipi-dims-grid">
          {Object.keys(DIM_LABELS).map((d) => {
            const Icon = DIM_ICONS[d] ?? BookOpen;
            return (
              <div key={d} className="ipi-dim-card" style={{ borderTop: `3px solid ${DIM_COLORS[d]}` }}>
                <div className="ipi-dim-name" style={{ color: DIM_COLORS[d] }}>
                  <Icon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {DIM_LABELS[d]}
                </div>
                <p className="ipi-dim-desc">{DIM_DESCS[d]}</p>
                {dimEvolution[d] && (
                  <div className="ipi-dim-gain" style={{ color: (dimEvolution[d] as any).gain >= 0 ? "var(--risk-low)" : "var(--risk-high)" }}>
                    {(dimEvolution[d] as any).gain >= 0 ? "+" : ""}{((dimEvolution[d] as any).gain ?? 0).toFixed(1)} pts de millora
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </details>

      <details className="donor-accordion">
        <summary>La millora és real?</summary>
        <div className="donor-accordion-body">
        <p className="donor-section-sub">
          No ens conformem amb percentatges: apliquem estadística rigorosa per saber si el canvi
          és real o podria ser fruit de l'atzar. Cada indicador respon una pregunta concreta.
        </p>

        {/* Guide row */}
        <div className="donor-stats-guide">
          <div className="donor-stats-guide-item">
            <span className="donor-stats-guide-label">Punt de partida</span>
            <span className="donor-stats-guide-desc">
              La puntuació IPI inicial de cada infant quan entra al programa (escala 0–100 pts). Serveix de referència per mesurar tot el progrés posterior.
            </span>
          </div>
          <div className="donor-stats-guide-item">
            <span className="donor-stats-guide-label">Mida de l'efecte (d)</span>
            <span className="donor-stats-guide-desc">
              Mesura <em>quant</em> ha canviat el grup comparat amb la seva pròpia variabilitat natural.
              No és una nota: d=0.2 és petit, d=0.5 és moderat, d≥0.8 és gran.
            </span>
          </div>
          <div className="donor-stats-guide-item">
            <span className="donor-stats-guide-label">p-valor (significança)</span>
            <span className="donor-stats-guide-desc">
              La probabilitat que la millora sigui fruit de l'atzar. Si p &lt; 0.05, podem afirmar que el canvi és real
              amb un 95% de confiança.
            </span>
          </div>
          <div className="donor-stats-guide-item">
            <span className="donor-stats-guide-label">Interval de confiança 95%</span>
            <span className="donor-stats-guide-desc">
              Si repetíssim el programa 100 vegades en grups similars, en 95 d'elles la millora estaria dins d'aquest rang.
              Com més estret, més precisa és la mesura.
            </span>
          </div>
        </div>

        <div className="donor-evidence-grid">
          <div className="stat-evidence-card">
            <div className="stat-evidence-label">Mida de l'efecte</div>
            <div className="stat-evidence-value">
              {cohensD != null ? cohensD.toFixed(2) : "—"}
            </div>
            <div className="stat-evidence-badge" style={{
              background: cohensD && cohensD > 0.5 ? "var(--risk-low-bg)" : "var(--surface-2)",
              color: cohensD && cohensD > 0.5 ? "var(--risk-low)" : "var(--text-secondary)"
            }}>
              Cohen's d
            </div>
            <div className="stat-evidence-hint">
              {cohensD == null ? "Encara no hi ha prou dades per estimar l'efecte"
                : cohensD >= 0.8 ? "Gran — millora molt notable"
                : cohensD >= 0.5 ? "Moderat — millora rellevant"
                : cohensD >= 0.2 ? "Petit — millora real però moderada"
                : "Trivial"}
            </div>
          </div>

          <div className="stat-evidence-card">
            <div className="stat-evidence-label">Significació estadística</div>
            <div className="stat-evidence-value">
              {pValue != null ? (pValue < 0.001 ? "<0.001" : pValue.toFixed(3)) : "—"}
            </div>
            <div className={`stat-evidence-badge ${pValue != null && pValue < 0.05 ? "sig-check" : "sig-warn"}`}>
              p-valor (Wilcoxon)
            </div>
            <div className="stat-evidence-hint">
              {pValue == null ? "Calen més sessions registrades per calcular la significació"
                : pValue < 0.05
                  ? "La millora NO és per atzar (p < 0.05)"
                  : "No hi ha prou evidència estadística (p ≥ 0.05)"}
            </div>
          </div>

          {ci && (
            <div className="stat-evidence-card">
              <div className="stat-evidence-label">Interval de confiança 95%</div>
              <div className="stat-evidence-value" style={{ fontSize: "1.1rem" }}>
                [{ci[0]?.toFixed(1)}, {ci[1]?.toFixed(1)}] pts
              </div>
              <div className="stat-evidence-badge" style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}>
                Bootstrap CI
              </div>
              <div className="stat-evidence-hint">
                La millora real del grup probablement es troba entre {ci[0]?.toFixed(1)} i {ci[1]?.toFixed(1)} punts IPI.
              </div>
            </div>
          )}
        </div>

        {narrative && (
          <div className="narrative-text" style={{ marginTop: "1.25rem" }}>
            {narrative}
          </div>
        )}
        </div>
      </details>

      <details className="donor-accordion">
        <summary>Qui és qui al programa?</summary>
        <div className="donor-accordion-body">
        <p className="donor-section-sub" style={{ marginTop: "0.75rem" }}>
          Distribució d'alumnes per nivell de risc. El risc es calcula setmanalment segons assistència, IPI i objectius.
        </p>

        {!donorReady ? (
          <div className="donor-loading-block">
            <div className="donor-skeleton donor-skeleton--card" />
          </div>
        ) : riskPieData.length === 0 ? (
          <p className="donor-empty-msg">
            Encara no hi ha prou dades per mostrar la distribució de risc.
          </p>
        ) : (
          <div className="methodology-layout">
            <div className="methodology-risk">
              <div className="methodology-risk-donut">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={riskPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={75}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {riskPieData.map((entry) => (
                        <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? "#ccc"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [`${v} infants`, RISK_LABELS[name as string] ?? name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="methodology-risk-legend">
                {riskPieData.map((e) => (
                  <div key={e.name} className="risk-legend-row">
                    <span className="risk-legend-dot" style={{ background: RISK_COLORS[e.name] }} />
                    <span className="risk-legend-label">Risc {RISK_LABELS[e.name] ?? e.name}</span>
                    <span className="risk-legend-value">{e.value} infants</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="methodology-seals-block">
              <div className="methodology-seals-title">Metodologia certificada</div>
              <div className="methodology-seals">
                {[
                  { key: "SROI Network Standard",    desc: "Estàndard internacional per monetitzar impacte social" },
                  { key: "OECD DAC Criteria",         desc: "Criteris d'avaluació de rellevància, eficiència i impacte" },
                  { key: "Estadística no paramètrica", desc: "Wilcoxon signed-rank test, robust a distribucions no normals" },
                  { key: "Bootstrap CI 95%",           desc: "2.000 simulacions per estimar incertesa estadística" },
                ].map((s) => {
                  const Icon = SEAL_ICONS[s.key] ?? BarChart3;
                  return (
                    <div key={s.key} className="methodology-seal-card">
                      <div className="seal-icon-lg">
                        <Icon size={20} strokeWidth={1.8} />
                      </div>
                      <div>
                        <div className="seal-label">{s.key}</div>
                        <div className="seal-desc">{s.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <button type="button" className="donor-evidence-btn" onClick={handleDownloadEvidence}>
            Descarrega el paquet d'evidència complet (JSON)
          </button>
        </div>
        </div>
      </details>
      </section>
    </div>
    </div>
  );
}