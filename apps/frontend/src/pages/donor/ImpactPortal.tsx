import { useQuery } from "@tanstack/react-query";
import { animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, Tooltip, ResponsiveContainer } from "recharts";
import {
  BookOpen, Brain, Users2, Globe,
  BarChart3, FlaskConical, Ruler, RefreshCw,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { getDonorDashboard, getInterventionEffect, getSROI } from "../../api/dashboard";
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

function InfoBox({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="info-box">
      <button className="info-box-toggle" onClick={() => setOpen(!open)}>
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
    queryKey: ["sroi", programId, costEur, months],
    queryFn: () => getSROI(programId!, costEur, months),
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
    const url = `http://localhost:8013/api/v1/analytics/evidence-export?program_id=${programId}&cost_eur=${costEur}`;
    window.open(url, "_blank");
  };

  return (
    <div className="donor-portal">

      {/* ── 1. HERO ─────────────────────────────────────────────── */}
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
              <div className="donor-counter-label">Infants acompanyats</div>
            </div>
            <div className="donor-counter-card">
              <div className="donor-counter-value">
                <AnimatedCounter target={avgIpiGainPct} decimals={1} suffix="%" />
              </div>
              <div className="donor-counter-label">Millora de progrés (IPI)</div>
            </div>
            <div className="donor-counter-card">
              <div className="donor-counter-value">
                €<AnimatedCounter target={sroiRatio} decimals={2} />
              </div>
              <div className="donor-counter-label">Valor social per cada €1 invertit</div>
            </div>
          </div>
          <button className="donor-cta-btn" onClick={handleDownloadEvidence}>
            Descarrega l'informe complet
          </button>
        </div>
      </section>

      {/* ── 2. QUÈ MESURES? — L'IPI ─────────────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Què mesurem?</h2>
        <p className="donor-section-sub">
          L'<strong>Índex de Progrés Integral (IPI)</strong> és la brúixola del programa.
          Mesura el progrés de cada infant en quatre dimensions clau, de 0 a 100.
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
      </section>

      {/* ── 3. EVIDÈNCIA CIENTÍFICA ─────────────────────────────── */}
      <section className="donor-section donor-section-alt">
        <h2 className="donor-section-title">La millora és real?</h2>
        <p className="donor-section-sub">
          No ens conformem amb percentatges: apliquem estadística rigorosa per saber si el canvi
          és real o podria ser fruit de l'atzar. Cada indicador respon una pregunta concreta.
        </p>

        {/* Guide row */}
        <div className="donor-stats-guide">
          <div className="donor-stats-guide-item">
            <span className="donor-stats-guide-label">Punt de partida</span>
            <span className="donor-stats-guide-desc">
              La puntuació inicial de cada infant quan entra al programa. Serveix de referència per mesurar tot el progrés posterior.
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
              {cohensD == null ? "Dades insuficients"
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
              {pValue != null && pValue < 0.05
                ? "La millora NO és per atzar (p < 0.05)"
                : "No hi ha prou evidència estadística (p ≥ 0.05)"}
            </div>
          </div>

          {ci && (
            <div className="stat-evidence-card">
              <div className="stat-evidence-label">Interval de confiança 95%</div>
              <div className="stat-evidence-value" style={{ fontSize: "1.1rem" }}>
                [{ci[0]?.toFixed(1)}, {ci[1]?.toFixed(1)}]
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
      </section>

      {/* ── 4. ABANS I ARA ──────────────────────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Abans i ara</h2>
        <p className="donor-section-sub">
          Evolució de cada dimensió des del moment d'entrada al programa fins avui.
          Les barres mostren el percentatge assolit sobre el màxim possible (100 pts).
        </p>
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
                    <span className="before-after-bar-label">Ara</span>
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

      {/* ── 5. RETORN SOCIAL ────────────────────────────────────── */}
      {sroi && (
        <section className="donor-section donor-section-alt">
          <h2 className="donor-section-title">Retorn social de la inversió</h2>
          <p className="donor-section-sub">
            L'<strong>SROI (Social Return on Investment)</strong> tradueix l'impacte social a valor econòmic.
            La idea és simple: el programa estalvia costos que la societat hauria de pagar d'altra manera
            (classes particulars, serveis socials, etc.) i genera valor futur (empleabilitat).
            Sumant tot això i dividint-ho per la inversió, obtenim l'SROI.
          </p>

          {/* Cost config */}
          <div className="sroi-config-row">
            <div className="sroi-config-field">
              <span className="sroi-config-label">Inversió total del programa (€)</span>
              <input
                className="form-input sroi-config-input"
                type="number"
                min={1000}
                step={500}
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                onBlur={() => {
                  const v = Number(costInput);
                  if (v > 0) setCostEur(v);
                  else setCostInput(String(costEur));
                }}
              />
            </div>
            <div className="sroi-config-field">
              <span className="sroi-config-label">Durada del programa (mesos)</span>
              <input
                className="form-input sroi-config-input"
                type="number"
                min={1}
                max={36}
                step={1}
                value={months}
                onChange={(e) => setMonths(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div className="sroi-config-note">
              Ajusta la inversió i la durada per calcular l'SROI del teu programa específic.
            </div>
          </div>

          <div className="sroi-layout">
            <SROIStatement
              sroiRatio={sroi.sroi_ratio}
              conservative={sroi.sensitivity_analysis?.conservative}
              optimistic={sroi.sensitivity_analysis?.optimistic}
              statement={sroi.sroi_statement}
            />
            <SROIBreakdown breakdown={sroi.value_breakdown ?? {}} />
          </div>

          <InfoBox>
            <p style={{ marginBottom: "0.75rem" }}>
              El valor de cada component s'estima a partir de proxies econòmics validats
              (costos de mercat o dades oficials). Aquí t'expliquem d'on surt cada número:
            </p>
            <div className="sroi-explain-grid">
              <div className="sroi-explain-item">
                <div className="sroi-explain-title" style={{ color: "var(--dim-academic)" }}>
                  <BookOpen size={14} strokeWidth={2} />
                  Millora acadèmica
                </div>
                <p>
                  Per cada infant que millora acadèmicament, estimem que el programa substitueix
                  classes de reforç privat (1h/setmana de mitjana).
                  Preu de mercat del reforç grupal a Catalunya: <strong>€65/mes</strong> (2024).
                  Fórmula: <em>infants × (guany IPI / 25) × €65 × mesos</em>.
                  La divisió per 25 escala la millora: 25 punts IPI = 1 mes complet de reforç substituït.
                </p>
              </div>
              <div className="sroi-explain-item">
                <div className="sroi-explain-title" style={{ color: "var(--risk-high)" }}>
                  <Users2 size={14} strokeWidth={2} />
                  Reducció del risc d'exclusió social
                </div>
                <p>
                  Quan un infant classificat en risc alt millora, s'evita part del cost
                  que generaria als serveis socials (seguiment especialitzat, intervencions familiars).
                  Cost anual per cas en risc: <strong>€2.800/any</strong>
                  (Dept. Drets Socials Generalitat de Catalunya, 2023).
                  Fórmula: <em>infants en risc alt que milloren × €2.800 × (mesos/12)</em>.
                </p>
              </div>
              <div className="sroi-explain-item">
                <div className="sroi-explain-title" style={{ color: "var(--dim-integration)" }}>
                  <Globe size={14} strokeWidth={2} />
                  Valor d'integració
                </div>
                <p>
                  La millora en fluïdesa lingüística i adaptació cultural té un impacte
                  directe en l'empleabilitat futura de l'infant.
                  Valor actualitzat per infant: <strong>€1.200</strong>
                  (Fundació Jaume Bofill, 2023, actualitzat per inflació).
                  Fórmula: <em>infants × % guany integració × €1.200</em>.
                </p>
              </div>
              <div className="sroi-explain-item">
                <div className="sroi-explain-title" style={{ color: "var(--dim-social)" }}>
                  <Brain size={14} strokeWidth={2} />
                  Suport educatiu directe
                </div>
                <p>
                  Cada hora de sessió és suport professional que cada família no ha de pagar.
                  Taxa professional de suport socioeducatiu grupal: <strong>€18/hora per infant</strong>
                  (tarifa orientativa professionals d'educació social, Catalunya 2024).
                  Fórmula: <em>infants × sessions × hores/sessió × €18</em>.
                  <br /><strong>Aquest és el component més important</strong> perquè no depèn de l'IPI
                  i reflecteix el valor directe de cada hora de presència al programa.
                </p>
              </div>
            </div>
            <div className="sroi-explain-corrections">
              <strong>Factors de correcció aplicats (conservadors):</strong>
              <ul>
                <li><em>Deadweight</em> 25%: descomptem el 25% de la millora que podria haver passat sense el programa.</li>
                <li><em>Atribució</em> 85%: reconeixem que el 15% de la millora pot ser deguda a altres factors externs.</li>
                <li><em>Decaïment</em> 15%: el valor social disminueix un 15% cada any si no hi ha continuïtat.</li>
              </ul>
            </div>
          </InfoBox>
        </section>
      )}

      {/* ── 6. TRANSPARÈNCIA I METODOLOGIA ──────────────────────── */}
      <section className="donor-section">
        <h2 className="donor-section-title">Qui és qui al programa?</h2>
        <p className="donor-section-sub">
          Distribució de participants per nivell de risc d'abandonament o estancament.
          El risc es calcula automàticament setmanalment en base a assistència, progrés IPI i objectius.
        </p>
        <div className="methodology-layout">
          {riskPieData.length > 0 && (
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
          )}

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

        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <button className="donor-evidence-btn" onClick={handleDownloadEvidence}>
            Descarrega el paquet d'evidència complet (JSON)
          </button>
        </div>
      </section>
    </div>
  );
}
