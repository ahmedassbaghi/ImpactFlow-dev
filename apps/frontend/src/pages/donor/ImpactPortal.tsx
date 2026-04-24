import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer } from "recharts";
import { getDonorDashboard, getInterventionEffect, getSROI } from "../../api/dashboard";
import SROIStatement from "../../components/sroi/SROIStatement";
import SROIBreakdown from "../../components/sroi/SROIBreakdown";

const PROGRAM_COST_EUR = 12000;
const PROGRAM_MONTHS = 9;
const ORG_SLUG = "narinan";

const RISK_COLORS: Record<string, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
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

export default function ImpactPortalPage() {
  const { data: donor } = useQuery({
    queryKey: ["donor-dashboard", ORG_SLUG],
    queryFn: () => getDonorDashboard(ORG_SLUG),
  });

  const programId = donor?.program_id;

  const { data: effect } = useQuery({
    queryKey: ["intervention-effect", programId],
    queryFn: () => getInterventionEffect(programId!),
    enabled: !!programId,
  });

  const { data: sroi } = useQuery({
    queryKey: ["sroi", programId],
    queryFn: () => getSROI(programId!, PROGRAM_COST_EUR, PROGRAM_MONTHS),
    enabled: !!programId,
  });

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

  const handleDownloadEvidence = () => {
    if (!programId) return;
    const url = `/api/v1/analytics/evidence-export?program_id=${programId}&cost_eur=${PROGRAM_COST_EUR}`;
    window.open(url, "_blank");
  };

  return (
    <div className="donor-portal">
      {/* ── 1. HERO ────────────────────────────────────────────────── */}
      <section className="donor-hero">
        <div className="donor-hero-inner">
          <div className="donor-hero-eyebrow">Narinaan · Mesura d'Impacte Social 2024–25</div>
          <h1 className="donor-hero-title">De l'activitat a l'evidència.</h1>
          <p className="donor-hero-subtitle">
            Dades reals, metodologia rigorosa, transparència total.
          </p>
          <div className="donor-counters">
            <div className="donor-counter-card">
              <div className="donor-counter-value">
                <AnimatedCounter target={nParticipants} />
              </div>
              <div className="donor-counter-label">Participants acompanyats</div>
            </div>
            <div className="donor-counter-card">
              <div className="donor-counter-value">
                <AnimatedCounter target={avgIpiGainPct} decimals={1} suffix="%" />
              </div>
              <div className="donor-counter-label">Millora IPI mitjana</div>
            </div>
            <div className="donor-counter-card">
              <div className="donor-counter-value">
                €<AnimatedCounter target={sroiRatio} decimals={2} />
              </div>
              <div className="donor-counter-label">Per cada €1 invertit</div>
            </div>
          </div>
          <button className="donor-cta-btn" onClick={handleDownloadEvidence}>
            Descarrega l'informe complet
          </button>
        </div>
      </section>

      {/* ── 2. EVIDÈNCIA CIENTÍFICA ────────────────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Evidència Científica</h2>
        <p className="donor-section-sub">
          Estadística no paramètrica rigorosa conforme a estàndards OECD DAC.
        </p>
        <div className="donor-evidence-grid">
          <div className="stat-evidence-card">
            <div className="stat-evidence-label">Mida de l'Efecte</div>
            <div className="stat-evidence-value">
              {cohensD != null ? cohensD.toFixed(2) : "—"}
            </div>
            <div className="stat-evidence-badge" style={{ background: cohensD && cohensD > 0.5 ? "var(--risk-low-bg)" : "var(--surface-2)", color: cohensD && cohensD > 0.5 ? "var(--risk-low)" : "var(--text-secondary)" }}>
              Cohen's d
            </div>
            <div className="stat-evidence-hint">
              {cohensD == null ? "Dades insuficients" : cohensD >= 0.8 ? "Efecte gran" : cohensD >= 0.5 ? "Efecte moderat" : "Efecte petit"}
            </div>
          </div>

          <div className="stat-evidence-card">
            <div className="stat-evidence-label">Significació Estadística</div>
            <div className="stat-evidence-value">
              {pValue != null ? (pValue < 0.001 ? "<0.001" : pValue.toFixed(3)) : "—"}
            </div>
            <div className={`stat-evidence-badge ${pValue != null && pValue < 0.05 ? "sig-check" : "sig-warn"}`}>
              p-valor Wilcoxon
            </div>
            <div className="stat-evidence-hint">
              {pValue != null && pValue < 0.05 ? "Estadísticament significatiu" : "No significatiu (p≥0.05)"}
            </div>
          </div>

          {ci && (
            <div className="stat-evidence-card">
              <div className="stat-evidence-label">Interval de Confiança 95%</div>
              <div className="stat-evidence-value" style={{ fontSize: "1.1rem" }}>
                [{ci[0]?.toFixed(1)}, {ci[1]?.toFixed(1)}]
              </div>
              <div className="stat-evidence-badge" style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}>
                Bootstrap CI
              </div>
              <div className="stat-evidence-hint">2000 iteracions Bootstrap</div>
            </div>
          )}
        </div>

        {narrative && (
          <div className="narrative-text" style={{ marginTop: "1rem" }}>
            {narrative}
          </div>
        )}
      </section>

      {/* ── 3. ABANS I ARA ────────────────────────────────────────── */}
      <section className="donor-section donor-section-alt">
        <h2 className="donor-section-title">Abans i Ara</h2>
        <p className="donor-section-sub">Evolució per dimensió des del baseline fins avui.</p>
        <div className="before-after-grid">
          {Object.entries(dimEvolution).map(([dim, data]: [string, any]) => {
            const baseline = data?.baseline ?? 0;
            const current = data?.current ?? 0;
            const gain = data?.gain ?? 0;
            return (
              <div key={dim} className="before-after-item">
                <div className="before-after-header">
                  <span className="before-after-dim" style={{ color: DIM_COLORS[dim] }}>
                    {DIM_LABELS[dim] ?? dim}
                  </span>
                  <span className="before-after-gain" style={{ color: gain > 0 ? "var(--trend-up)" : gain < 0 ? "var(--trend-down)" : "var(--trend-stable)" }}>
                    {gain > 0 ? "+" : ""}{gain.toFixed(1)} pts
                  </span>
                </div>
                <div className="before-after-bars">
                  <div className="before-after-bar-row">
                    <span className="before-after-bar-label">Baseline</span>
                    <div className="before-after-bar-track">
                      <motion.div
                        className="before-after-bar"
                        style={{ background: "var(--surface-3)" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(baseline, 100)}%` }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                      />
                    </div>
                    <span className="before-after-bar-pct">{baseline.toFixed(0)}%</span>
                  </div>
                  <div className="before-after-bar-row">
                    <span className="before-after-bar-label">Actual</span>
                    <div className="before-after-bar-track">
                      <motion.div
                        className="before-after-bar"
                        style={{ background: DIM_COLORS[dim] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(current, 100)}%` }}
                        transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
                      />
                    </div>
                    <span className="before-after-bar-pct">{current.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. RETORN SOCIAL ──────────────────────────────────────── */}
      {sroi && (
        <section className="donor-section">
          <h2 className="donor-section-title">Retorn Social de la Inversió</h2>
          <p className="donor-section-sub">
            Càlcul seguint SROI Network Standard (2012) amb proxies calibrats per al context català.
          </p>
          <div className="sroi-layout">
            <SROIStatement
              sroiRatio={sroi.sroi_ratio}
              conservative={sroi.sensitivity_analysis?.conservative}
              optimistic={sroi.sensitivity_analysis?.optimistic}
              statement={sroi.sroi_statement}
            />
            <SROIBreakdown breakdown={sroi.value_breakdown ?? {}} />
          </div>
        </section>
      )}

      {/* ── 5. TRANSPARÈNCIA I METODOLOGIA ───────────────────────── */}
      <section className="donor-section donor-section-alt">
        <h2 className="donor-section-title">Transparència i Metodologia</h2>
        <div className="methodology-layout">
          {riskPieData.length > 0 && (
            <div className="methodology-risk">
              <div className="methodology-risk-title">Distribució de Risc</div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={riskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {riskPieData.map((entry) => (
                      <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? "#ccc"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="methodology-seals">
            <div className="methodology-seal">
              <span className="seal-icon">✓</span>
              <span>Metodologia SROI Network</span>
            </div>
            <div className="methodology-seal">
              <span className="seal-icon">✓</span>
              <span>OECD DAC Evaluation Criteria</span>
            </div>
            <div className="methodology-seal">
              <span className="seal-icon">✓</span>
              <span>Estadística No Paramètrica</span>
            </div>
            <div className="methodology-seal">
              <span className="seal-icon">✓</span>
              <span>Bootstrap CI 95% · Cohen's d</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button className="donor-evidence-btn" onClick={handleDownloadEvidence}>
            Descarrega evidència completa (JSON)
          </button>
        </div>
      </section>
    </div>
  );
}
