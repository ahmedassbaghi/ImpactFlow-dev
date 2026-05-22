import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Settings2,
  Trash2,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  getSimulationStatus,
  getSimulationJob,
  dedupePeriodicAssessments,
  resetAndSeed,
  startSimulationJob,
  type PeriodConfig,
  type ResetAndSeedResult,
  type SimulationJobStatus,
  type SimulationResult,
} from "../../api/simulation";
import { toast } from "../../stores/toastStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_META: Record<string, { label: string; color: string; abbr: string }> = {
  stable:       { label: "Millora estable",  color: "#22c55e", abbr: "STB" },
  plateau:      { label: "Meseta",           color: "#f59e0b", abbr: "PLT" },
  late_bloomer: { label: "Despertar tardà",  color: "#818cf8", abbr: "LTB" },
  struggler:    { label: "Dificultats",      color: "#f87171", abbr: "STR" },
  erratic:      { label: "Irregular",        color: "#c084fc", abbr: "ERR" },
};

const SCENARIO_PRESETS = [
  {
    id: "typical",
    label: "Progrés típic",
    icon: "📈",
    params: { optimism_bias: 0.0, noise_level: 1.0, absence_rate: 0.05 },
  },
  {
    id: "accelerated",
    label: "Acceleració",
    icon: "🚀",
    params: { optimism_bias: 0.6, noise_level: 0.7, absence_rate: 0.03 },
  },
  {
    id: "struggle",
    label: "Estancament",
    icon: "🧱",
    params: { optimism_bias: -0.4, noise_level: 1.2, absence_rate: 0.12 },
  },
  {
    id: "crisis",
    label: "Crisi i recuperació",
    icon: "🔄",
    params: { optimism_bias: -0.2, noise_level: 1.8, absence_rate: 0.15 },
  },
  {
    id: "chaotic",
    label: "Caos total",
    icon: "🌪️",
    params: { optimism_bias: 0.1, noise_level: 2.4, absence_rate: 0.20 },
  },
];

const ATT_COLOR: Record<string, string> = {
  present: "#22c55e",
  late: "#f59e0b",
  partial: "#f59e0b",
  absent: "#f87171",
  unjustified_absence: "#ef4444",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function biasLabel(v: number) {
  if (v <= -0.7) return "Molt pessimista";
  if (v <= -0.3) return "Pessimista";
  if (v <=  0.2) return "Neutre";
  if (v <=  0.6) return "Optimista";
  return "Molt optimista";
}
function biasColor(v: number) {
  if (v < -0.2) return "#f87171";
  if (v > 0.2)  return "#4ade80";
  return "#94a3b8";
}
function noiseLabel(v: number) {
  if (v <= 0.5) return "Molt suau";
  if (v <= 0.9) return "Suau";
  if (v <= 1.3) return "Realista";
  if (v <= 1.8) return "Sorollós";
  return "Caòtic";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Collapsible({
  title, icon, children, defaultOpen = false,
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sc-collapsible">
      <button className="sc-collapsible__header" onClick={() => setOpen((o) => !o)}>
        <span className="sc-collapsible__icon">{icon}</span>
        <span className="sc-collapsible__title">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="sc-collapsible__body">{children}</div>}
    </div>
  );
}

function SliderField({
  id, label, value, min, max, step = 1, format, hint, color,
  onChange,
}: {
  id: string; label: string; value: number; min: number; max: number; step?: number;
  format: (v: number) => string; hint?: string; color?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sc-field">
      <div className="sc-field__header">
        <label htmlFor={id} className="sc-field__label">{label}</label>
        <span className="sc-field__val" style={color ? { color } : undefined}>{format(value)}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sc-slider"
        style={{ "--accent": color ?? "var(--brand-500)" } as React.CSSProperties}
      />
      {hint && <p className="sc-field__hint">{hint}</p>}
    </div>
  );
}

function SimulationActivityFeed({
  log,
  status,
  currentName,
}: {
  log: SimulationJobStatus["log"];
  status: SimulationJobStatus["status"];
  currentName?: string;
}) {
  const recent = log.slice(-8).reverse();
  const statusLabel =
    status === "running"
      ? "En curs"
      : status === "done"
        ? "Completat"
        : status === "error"
          ? "Error"
          : status === "pending"
            ? "Iniciant"
            : "En espera";

  return (
    <section className="sc-activity" aria-live="polite" aria-label="Activitat de la simulació">
      <div className="sc-activity__head">
        <h2 className="sc-activity__title">Activitat recent</h2>
        <span className={`sc-activity__pill sc-activity__pill--${status}`}>{statusLabel}</span>
      </div>
      {currentName && status === "running" && (
        <p className="sc-activity__current">
          Processant <strong>{currentName}</strong>
        </p>
      )}
      {recent.length === 0 ? (
        <p className="sc-activity__empty">
          {status === "pending" || status === "running"
            ? "Generant sessions i avaluacions…"
            : "Encara no hi ha activitat en aquesta execució."}
        </p>
      ) : (
        <ul className="sc-activity__list">
          {recent.map((entry, i) => {
            const meta = PROFILE_META[entry.profile] ?? { label: entry.profile, color: "#64748b" };
            const deltaNum = parseFloat(entry.delta);
            const deltaUp = !Number.isNaN(deltaNum) && deltaNum >= 0;
            return (
              <li key={`${entry.t}-${entry.name}-${i}`} className="sc-activity__item">
                <div className="sc-activity__item-top">
                  <span className="sc-activity__name">{entry.name}</span>
                  <span className="sc-activity__profile" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <div className="sc-activity__item-meta">
                  <span>
                    Sessió {entry.session}/{entry.total}
                  </span>
                  <span className="sc-activity__ipi">IPI {entry.ipi.toFixed(1)}</span>
                  {!Number.isNaN(deltaNum) && (
                    <span className={deltaUp ? "sc-activity__delta--up" : "sc-activity__delta--down"}>
                      {entry.delta} pts
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ResultPanel({ result }: { result: SimulationResult }) {
  const maxCount = Math.max(1, ...Object.values(result.profile_counts));
  return (
    <div className="sc-result">
      <div className="sc-result__header">
        <TrendingUp size={16} />
        <span>Resultats</span>
      </div>

      <div className="sc-result__kpis">
        <div className="sc-kpi">
          <div className="sc-kpi__val">{result.participants_processed}</div>
          <div className="sc-kpi__lbl">alumnes</div>
        </div>
        <div className="sc-kpi">
          <div className="sc-kpi__val">{result.sessions_created}</div>
          <div className="sc-kpi__lbl">sessions</div>
        </div>
        <div className="sc-kpi sc-kpi--accent">
          <div className="sc-kpi__val">
            {result.ipi_gain_avg >= 0 ? "+" : ""}{result.ipi_gain_avg.toFixed(1)}
          </div>
          <div className="sc-kpi__lbl">guany IPI ∅</div>
        </div>
        {result.sessions_cleared > 0 && (
          <div className="sc-kpi sc-kpi--warn">
            <div className="sc-kpi__val">{result.sessions_cleared}</div>
            <div className="sc-kpi__lbl">esborrades</div>
          </div>
        )}
      </div>

      <div className="sc-result__section">Distribució de perfils + guany IPI</div>
      <div className="sc-result__bars">
        {Object.entries(result.profile_counts).map(([id, count]) => {
          const meta = PROFILE_META[id] ?? { label: id, color: "#6b7280" };
          const gain = result.ipi_gain_by_profile[id];
          const starts = result.profile_ipi_start[id] ?? [];
          const ends   = result.profile_ipi_end[id]   ?? [];
          const avgStart = starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : null;
          const avgEnd   = ends.length   ? ends.reduce((a, b) => a + b, 0)   / ends.length   : null;
          return (
            <div key={id} className="sc-result__bar-row">
              <div className="sc-result__bar-meta">
                <span className="sc-result__bar-label" style={{ color: meta.color }}>{meta.label}</span>
                <span className="sc-result__bar-count">{count} alumnes</span>
              </div>
              <div className="sc-result__bar-track">
                <div
                  className="sc-result__bar-fill"
                  style={{ width: `${(count / maxCount) * 100}%`, background: meta.color }}
                />
              </div>
              <div className="sc-result__bar-stats">
                {avgStart != null && avgEnd != null && (
                  <span className="sc-result__ipi-arrow">
                    <span className="muted">{avgStart.toFixed(1)}</span>
                    <span className="arrow"> → </span>
                    <span>{avgEnd.toFixed(1)}</span>
                  </span>
                )}
                {gain != null && (
                  <span
                    className="sc-result__gain"
                    style={{ color: gain >= 0 ? "#4ade80" : "#f87171" }}
                  >
                    {gain >= 0 ? "+" : ""}{gain.toFixed(1)} pts
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {result.messages.length > 0 && (
        <div className="sc-result__log">
          {result.messages.map((m, i) => <div key={i}>→ {m}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DataSimulationPage() {
  const queryClient = useQueryClient();

  // ── Pool state ──
  const [nPart, setNPart]           = useState(20);
  const [seedReset, setSeedReset]   = useState(false);
  const [resetSeed, setResetSeed]   = useState(42);
  const [seedResult, setSeedResult] = useState<ResetAndSeedResult | null>(null);
  const [poolBusy, setPoolBusy]     = useState(false);

  // ── Simulation params ──
  const [sessions, setSessions]           = useState(20);
  const [spanWeeks, setSpanWeeks]         = useState(24);
  const [absenceRate, setAbsenceRate]     = useState(0.05);
  const [optimism, setOptimism]           = useState(0.0);
  const [noise, setNoise]                 = useState(1.0);
  const [clearExisting, setClearExisting] = useState(true);
  const [useSeed, setUseSeed]             = useState(false);
  const [seed, setSeed]                   = useState(42);
  const [usePhases, setUsePhases]         = useState(false);
  const [phases, setPhases]               = useState<PeriodConfig[]>([
    { weeks: 8,  intensity: 0.6, label: "Fase inicial" },
    { weeks: 10, intensity: 1.3, label: "Acceleració"  },
    { weeks: 6,  intensity: 1.0, label: "Consolidació" },
  ]);
  const [profileWeights, setProfileWeights] = useState<Record<string, number>>({
    stable: 55, plateau: 15, late_bloomer: 12, struggler: 13, erratic: 5,
  });
  const [useCustomWeights, setUseCustomWeights] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>("typical");

  // ── Job ──
  const [jobId, setJobId]         = useState<string | null>(null);
  const [job, setJob]             = useState<SimulationJobStatus | null>(null);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusQ = useQuery({
    queryKey: ["simulation-status"],
    queryFn: () => getSimulationStatus(),
    refetchInterval: 8000,
  });
  const status = statusQ.data;
  const isRunning = job?.status === "pending" || job?.status === "running";

  // ── Apply preset ──
  const applyPreset = (id: string) => {
    const p = SCENARIO_PRESETS.find((s) => s.id === id);
    if (!p) return;
    setOptimism(p.params.optimism_bias);
    setNoise(p.params.noise_level);
    setAbsenceRate(p.params.absence_rate);
    setActivePreset(id);
  };

  // ── Polling ──
  useEffect(() => {
    if (!jobId) return;
    if (job?.status === "done" || job?.status === "error") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const s = await getSimulationJob(jobId);
        setJob(s);
        if (s.status === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (s.result) {
            setLastResult(s.result);
            void queryClient.invalidateQueries({ queryKey: ["simulation-status"] });
            void queryClient.invalidateQueries({ queryKey: ["participants"] });
            toast.success("Simulació completada",
              `${s.result.sessions_created} sessions · +${s.result.ipi_gain_avg.toFixed(1)} IPI∅`);
          }
        } else if (s.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.error("Error en la simulació", s.error ?? "");
        }
      } catch (_) { /* transient */ }
    }, 500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, job?.status, queryClient]);

  const handleRun = async () => {
    if (clearExisting) {
      if (!window.confirm("Esborrarà totes les sessions existents dels alumnes. Continuar?")) return;
    }
    setJob(null);
    setLastResult(null);
    try {
      const r = await startSimulationJob({
        sessions_per_participant: sessions,
        run_mode: "additive",
        clear_existing_sessions: clearExisting,
        span_weeks: spanWeeks,
        absence_rate: absenceRate,
        optimism_bias: optimism,
        noise_level: noise,
        period_configs: usePhases ? phases : undefined,
        profile_weights: useCustomWeights
          ? Object.fromEntries(Object.entries(profileWeights).map(([k, v]) => [k, v / 100]))
          : undefined,
        random_seed: useSeed ? seed : undefined,
      });
      setJobId(r.job_id);
      setJob({ status: "pending", progress: 0, current_name: "", participants_done: 0,
        participants_total: 0, sessions_created: 0, log: [], result: null, error: null });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Error";
      toast.error("Error", String(msg));
    }
  };

  const handleDedupe = async () => {
    setPoolBusy(true);
    try {
      const r = await dedupePeriodicAssessments();
      void queryClient.invalidateQueries({ queryKey: ["simulation-status"] });
      void queryClient.invalidateQueries({ queryKey: ["participants"] });
      void queryClient.invalidateQueries({ queryKey: ["professional-dashboard"] });
      toast.success("Neteja completada", r.message);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Error";
      toast.error("Error en netejar duplicats", String(msg));
    } finally {
      setPoolBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(`Eliminarà TOTS els participants actuals i en crearà ${nPart} de nous. Segur?`)) return;
    setPoolBusy(true);
    try {
      const r = await resetAndSeed({ n_participants: nPart, random_seed: seedReset ? resetSeed : undefined });
      setSeedResult(r);
      void queryClient.invalidateQueries({ queryKey: ["simulation-status"] });
      void queryClient.invalidateQueries({ queryKey: ["participants"] });
      toast.success("Pool creat", `${r.participants_created} alumnes · IPI baseline ∅${r.baseline_ipi_avg}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Error";
      toast.error("Error en crear el pool", String(msg));
    } finally {
      setPoolBusy(false);
    }
  };

  const updatePhase = (i: number, key: keyof PeriodConfig, val: number | string) =>
    setPhases((prev) => prev.map((p, idx) => idx === i ? { ...p, [key]: val } : p));

  const updateWeight = (profile: string, val: number) =>
    setProfileWeights((prev) => ({ ...prev, [profile]: val }));

  const pct = job?.progress ?? 0;
  const hasParticipants = (status?.participants_active ?? 0) > 0;

  return (
    <div className="sc-page">
      {/* ── HEADER ── */}
      <div className="sc-header">
        <div className="sc-header__left">
          <div className="sc-header__icon"><FlaskConical size={22} /></div>
          <div>
            <h1 className="sc-header__title">Motor de Simulació</h1>
            <p className="sc-header__sub">ImpactFlow · Entorn de proves i demo</p>
          </div>
        </div>
        <div className="sc-header__kpis">
          <div className="sc-header__kpi">
            <span className="sc-header__kpi-val">{status?.participants_active ?? "—"}</span>
            <span className="sc-header__kpi-lbl">alumnes</span>
          </div>
          <div className="sc-header__kpi">
            <span className="sc-header__kpi-val">{status?.total_sessions ?? "—"}</span>
            <span className="sc-header__kpi-lbl">sessions totals</span>
          </div>
          <div className="sc-header__kpi">
            <span className="sc-header__kpi-val">{status?.avg_sessions_per_participant ?? "—"}</span>
            <span className="sc-header__kpi-lbl">sessions/alumne ∅</span>
          </div>
        </div>
      </div>

      {/* ── LAYOUT ── */}
      <div className="sc-layout">

        {/* ═══════════════════ LEFT: CONFIG PANEL ═══════════════════ */}
        <aside className="sc-config">

          {/* Pool section */}
          <Collapsible title="Pool d'alumnes" icon={<Users size={14} />} defaultOpen>
            <div className="sc-field">
              <div className="sc-field__header">
                <label className="sc-field__label">Alumnes a crear</label>
                <span className="sc-field__val">{nPart}</span>
              </div>
              <input type="range" min={5} max={60} value={nPart}
                onChange={(e) => setNPart(Number(e.target.value))} className="sc-slider" />
              {seedResult && (
                <div className="sc-pool-badge">
                  <CheckCircle2 size={11} />
                  Pool actiu: <strong>{seedResult.participants_created}</strong> alumnes ·
                  IPI {seedResult.baseline_ipi_min}–{seedResult.baseline_ipi_max}
                </div>
              )}
            </div>
            <label className="sc-check">
              <input type="checkbox" checked={seedReset} onChange={(e) => setSeedReset(e.target.checked)} />
              Llavor fixa
            </label>
            {seedReset && (
              <input type="number" className="sc-input" value={resetSeed} min={1} max={999999}
                onChange={(e) => setResetSeed(Number(e.target.value))} />
            )}
            <button
              type="button" className="sc-btn sc-btn--danger" onClick={() => void handleReset()}
              disabled={poolBusy}
            >
              {poolBusy ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
              {poolBusy ? "Creant pool…" : "Reiniciar pool"}
            </button>
          </Collapsible>

          {/* Scenario presets */}
          <Collapsible title="Escenari" icon={<Zap size={14} />} defaultOpen>
            <div className="sc-presets">
              {SCENARIO_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`sc-preset ${activePreset === p.id ? "active" : ""}`}
                  onClick={() => applyPreset(p.id)}
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </Collapsible>

          {/* Sessions */}
          <Collapsible title="Sessions" icon={<Activity size={14} />} defaultOpen>
            <SliderField
              id="sim-sessions" label="Sessions a generar / alumne"
              value={sessions} min={1} max={120}
              format={(v) => `${v} sessions`}
              hint="S'afegiran sempre com a noves (mode additiu)"
              onChange={setSessions}
            />
            <SliderField
              id="sim-weeks" label="Cobertura temporal"
              value={spanWeeks} min={4} max={104}
              format={(v) => `${v} setmanes`}
              onChange={setSpanWeeks}
            />
            <SliderField
              id="sim-absence" label="Taxa d'absències"
              value={Math.round(absenceRate * 100)} min={0} max={40}
              format={(v) => `${v}%`}
              onChange={(v) => { setAbsenceRate(v / 100); setActivePreset(null); }}
            />
          </Collapsible>

          {/* Behaviour */}
          <Collapsible title="Comportament" icon={<TrendingUp size={14} />} defaultOpen>
            <SliderField
              id="sim-bias" label="Biaix d'optimisme"
              value={Math.round(optimism * 100)} min={-100} max={100} step={5}
              format={(v) => biasLabel(v / 100)}
              color={biasColor(optimism)}
              onChange={(v) => { setOptimism(v / 100); setActivePreset(null); }}
            />
            <SliderField
              id="sim-noise" label="Nivell de soroll"
              value={Math.round(noise * 100)} min={20} max={250} step={5}
              format={(v) => noiseLabel(v / 100)}
              hint="Soroll baix = trajectòries suaus. Alt = variació alta sessió a sessió."
              onChange={(v) => { setNoise(v / 100); setActivePreset(null); }}
            />
          </Collapsible>

          {/* Phases */}
          <Collapsible title="Fases temporals" icon={<Layers size={14} />}>
            <label className="sc-check" style={{ marginBottom: "0.6rem" }}>
              <input type="checkbox" checked={usePhases} onChange={(e) => setUsePhases(e.target.checked)} />
              Activar configuració de fases
            </label>
            {usePhases && (
              <div className="sc-phases">
                {phases.map((ph, i) => (
                  <div key={i} className="sc-phase">
                    <div className="sc-phase__num">F{i + 1}</div>
                    <div className="sc-phase__body">
                      <div className="sc-phase__row">
                        <label>Setmanes</label>
                        <input type="number" className="sc-input sc-input--sm" min={1} max={52}
                          value={ph.weeks} onChange={(e) => updatePhase(i, "weeks", Number(e.target.value))} />
                      </div>
                      <div className="sc-phase__row">
                        <label>
                          Intensitat <span className="sc-phase__val">{ph.intensity.toFixed(1)}×</span>
                        </label>
                        <input type="range" min={10} max={250} step={10} className="sc-slider"
                          value={Math.round(ph.intensity * 100)}
                          onChange={(e) => updatePhase(i, "intensity", Number(e.target.value) / 100)} />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="sc-hint">Total: {phases.reduce((a, p) => a + p.weeks, 0)} setmanes</p>
              </div>
            )}
          </Collapsible>

          {/* Advanced */}
          <Collapsible title="Avançat" icon={<Settings2 size={14} />}>
            {/* Profile weights */}
            <label className="sc-check" style={{ marginBottom: "0.6rem" }}>
              <input type="checkbox" checked={useCustomWeights}
                onChange={(e) => setUseCustomWeights(e.target.checked)} />
              Distribució de perfils personalitzada
            </label>
            {useCustomWeights && (
              <div className="sc-profile-weights">
                {Object.entries(PROFILE_META).map(([id, meta]) => (
                  <div key={id} className="sc-pw-row">
                    <span className="sc-pw-label" style={{ color: meta.color }}>{meta.label}</span>
                    <input type="range" min={0} max={100} className="sc-slider"
                      style={{ "--accent": meta.color } as React.CSSProperties}
                      value={profileWeights[id] ?? 0}
                      onChange={(e) => updateWeight(id, Number(e.target.value))} />
                    <span className="sc-pw-val">{profileWeights[id] ?? 0}%</span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="sc-btn sc-btn--ghost"
              style={{ marginTop: "0.5rem", width: "100%" }}
              onClick={() => void handleDedupe()}
              disabled={poolBusy || isRunning}
            >
              Netejar avaluacions duplicades (mateix dia)
            </button>

            {/* Clear existing */}
            <label className="sc-check" style={{ marginTop: "0.75rem" }}>
              <input type="checkbox" checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)} />
              <span>
                <span style={{ color: clearExisting ? "#f87171" : undefined }}>
                  Esborrar sessions existents
                </span>
                <span className="sc-hint" style={{ display: "block" }}>
                  (reinici complet de l'historial simulat)
                </span>
              </span>
            </label>

            {/* Seed */}
            <label className="sc-check" style={{ marginTop: "0.6rem" }}>
              <input type="checkbox" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
              Llavor fixa (resultats reproduïbles)
            </label>
            {useSeed && (
              <input type="number" className="sc-input" value={seed} min={1} max={999999}
                onChange={(e) => setSeed(Number(e.target.value))} />
            )}
          </Collapsible>

          {/* RUN BUTTON */}
          <div className="sc-run-area">
            {!hasParticipants && (
              <div className="sc-run-warn">
                <AlertTriangle size={13} />
                Crea un pool d'alumnes primer
              </div>
            )}
            <button
              type="button"
              className={`sc-run-btn ${isRunning ? "running" : ""}`}
              onClick={() => void handleRun()}
              disabled={isRunning || !hasParticipants}
            >
              {isRunning ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Simulant…
                </>
              ) : (
                <>
                  <Play size={18} />
                  Executar simulació
                </>
              )}
            </button>
            <div className="sc-run-meta">
              {sessions} sessions × {status?.participants_active ?? "?"} alumnes
              {" "}= ~{sessions * (status?.participants_active ?? 0)} noves sessions
            </div>
          </div>
        </aside>

        {/* ═══════════════════ RIGHT: LIVE PANEL ═══════════════════ */}
        <div className="sc-live">

          {/* Progress bar */}
          {job && (
            <div className="sc-progress-bar-area">
              <div className="sc-progress-bar-track">
                <div
                  className="sc-progress-bar-fill"
                  style={{ width: `${pct}%`, background: job.status === "error" ? "#f87171" : undefined }}
                />
              </div>
              <div className="sc-progress-info">
                <span>
                  {job.status === "done" ? (
                    <><CheckCircle2 size={13} style={{ color: "#4ade80", verticalAlign: "middle" }} /> Completat</>
                  ) : job.status === "error" ? (
                    <><AlertTriangle size={13} style={{ color: "#f87171", verticalAlign: "middle" }} /> Error</>
                  ) : (
                    <><Loader2 size={13} className="spin" style={{ verticalAlign: "middle" }} /> {job.current_name || "Iniciant…"}</>
                  )}
                </span>
                <span>
                  {job.participants_done}/{job.participants_total} alumnes ·{" "}
                  {job.sessions_created} sessions · {pct}%
                </span>
              </div>
            </div>
          )}

          {job && (
            <SimulationActivityFeed
              log={job.log}
              status={job.status}
              currentName={job.current_name}
            />
          )}

          {/* Idle state */}
          {!job && !lastResult && (
            <div className="sc-idle">
              <div className="sc-idle__icon">
                <FlaskConical size={48} strokeWidth={1} />
              </div>
              <h2 className="sc-idle__title">Motor de simulació preparat</h2>
              <p className="sc-idle__sub">
                Configura els paràmetres a l'esquerra i prem{" "}
                <strong>Executar simulació</strong> per generar dades.
              </p>
              {!hasParticipants && (
                <div className="sc-idle__warn">
                  <AlertTriangle size={14} />
                  Primer crea un pool d'alumnes usant el panell "Pool d'alumnes"
                </div>
              )}
              {hasParticipants && status && (
                <div className="sc-idle__stats">
                  <div><strong>{status.participants_active}</strong> alumnes actius</div>
                  <div><strong>{status.total_sessions}</strong> sessions al sistema</div>
                  <div>∅ <strong>{status.avg_sessions_per_participant}</strong> sessions/alumne</div>
                </div>
              )}
            </div>
          )}

          {/* Reset button when done */}
          {job && (job.status === "done" || job.status === "error") && (
            <button
              type="button"
              className="sc-btn sc-btn--ghost sc-new-sim"
              onClick={() => { setJob(null); setJobId(null); }}
            >
              <RotateCcw size={14} />
              Nova simulació
            </button>
          )}

          {/* Results */}
          {lastResult && <ResultPanel result={lastResult} />}
        </div>
      </div>
    </div>
  );
}
