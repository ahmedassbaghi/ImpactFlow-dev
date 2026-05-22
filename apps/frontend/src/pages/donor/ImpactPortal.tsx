import { useQuery } from "@tanstack/react-query";
import { animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer } from "recharts";
import {
  BookOpen, Brain, Users2, Globe,
  BarChart3, FlaskConical, Ruler, RefreshCw,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { getDonorDashboard, getDonorSROICalculator, getInterventionEffect } from "../../api/dashboard";
import SROINGOCalculators from "../../components/sroi/SROINGOCalculators";
import DimensionEvolutionChart from "../../components/donor/DimensionEvolutionChart";

const DEFAULT_CONTRIBUTION_EUR = 1000;
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
        Què inclou aquesta estimació?
      </button>
      {open && <div className="info-box-body">{children}</div>}
    </div>
  );
}

export default function ImpactPortalPage() {
  const [contributionEur, setContributionEur] = useState(DEFAULT_CONTRIBUTION_EUR);
  const [volunteerHours, setVolunteerHours] = useState(1);
  const { data: donor, isLoading: donorLoading } = useQuery({
    queryKey: ["donor-dashboard", ORG_SLUG],
    queryFn: () => getDonorDashboard(ORG_SLUG),
  });

  const programId = donor?.program_id;

  const { data: effect } = useQuery({
    queryKey: ["intervention-effect", programId],
    queryFn: () => getInterventionEffect(programId!),
    enabled: !!programId,
  });

  const { data: sroiCalc, isLoading: sroiLoading, isError: sroiError } = useQuery({
    queryKey: ["donor-sroi-calc", ORG_SLUG, programId, contributionEur, volunteerHours],
    queryFn: () =>
      getDonorSROICalculator(ORG_SLUG, {
        contributionEur,
        volunteerHours,
        programId: programId || undefined,
      }),
  });

  const donorReady = !donorLoading && !!donor;
  const sroiReady = !sroiLoading && !!sroiCalc;

  const nParticipants = donor?.n_participants ?? 0;
  const avgIpiGainPct = donor?.avg_ipi_gain_pct ?? 0;
  const sroiPerEuro =
    sroiCalc?.impact.sroi_per_euro_invested ?? sroiCalc?.impact.sroi_ratio_imputed ?? 0;
  const imputedCost = sroiCalc?.program.operating_cost_eur ?? sroiCalc?.program.imputed_program_cost_eur ?? 0;
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
    const url = `${apiBase}/analytics/evidence-export?program_id=${programId}&cost_eur=${imputedCost || 0}`;
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
            Impacte mesurable, transparència i confiança.
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
                  <AnimatedCounter target={avgIpiGainPct} decimals={1} suffix="%" />
                </div>
                <div className="donor-counter-label">Millora mitjana IPI</div>
              </div>
              <div className="donor-counter-card">
                <div className="donor-counter-value">
                  €<AnimatedCounter target={sroiPerEuro} decimals={2} />
                </div>
                <div className="donor-counter-label">Valor generat per cada €1 invertit</div>
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

      {/* ── 2. FUNCIÓ DE NARINAN ───────────────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Què fa Narinan?</h2>
        <p className="donor-section-sub">
          Narinan acompanya infants i joves en situació de vulnerabilitat mitjançant programes
          socioeducatius a les escoles: reforç escolar, teatre social, suport emocional i integració.
          Cada infant és acompanyat amb constància i el seu progrés es fa visible al llarg del curs.
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
          <DimensionEvolutionChart
            dimensions={dimEvolution}
            dimLabels={DIM_LABELS}
            dimDescs={DIM_DESCS}
            dimColors={DIM_COLORS}
          />
        )}
      </section>

      {/* ── 4. SROI / Calculadores ONG ─────────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Simula la teva aportació</h2>
        <p className="donor-section-sub">
          Prova amb un import en euros o amb hores de voluntariat i descobreix l&apos;impacte estimat.
        </p>
        {sroiLoading && <p className="donor-loading-text">Calculant impacte…</p>}
        {sroiError && (
          <p className="form-error" role="alert">
            No s&apos;ha pogut carregar l&apos;estimació. Torna-ho a provar més tard.
          </p>
        )}
        {sroiCalc && (
          <SROINGOCalculators
            data={sroiCalc}
            contributionEur={contributionEur}
            onContributionChange={setContributionEur}
            volunteerHours={volunteerHours}
            onVolunteerHoursChange={setVolunteerHours}
          />
        )}
        <InfoBox>
          <p>
            <strong>Famílies:</strong> menys despesa en reforç escolar privat quan l&apos;infant
            millora.
          </p>
          <p>
            <strong>Comunitat:</strong> menys situacions de risc que requereixen suport públic
            intensiu.
          </p>
          <p>
            <strong>Integració:</strong> més autonomia, pertinença i seguretat en el dia a dia.
          </p>
          <p>
            <strong>Suport educatiu:</strong> valor de les hores de sessió registrades (amb rendiments decreixents si la
            intensitat supera 4 sessions per participant i mes).
          </p>
        </InfoBox>
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
              {pValue == null ? "Encara no hi ha prou dades per calcular la significació"
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
          Distribució d&apos;alumnes per nivell de seguiment i suport necessari.
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
            Descarrega l&apos;informe d&apos;impacte
          </button>
        </div>
        </div>
      </details>
      </section>
    </div>
    </div>
  );
}