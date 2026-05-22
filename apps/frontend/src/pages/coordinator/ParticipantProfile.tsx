import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
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
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Star,
  Target,
  Plus,
  X as XIcon,
} from "lucide-react";
import {
  getParticipant,
  getParticipantEvolution,
  getParticipantRisk,
  getParticipantPredictionProbabilistic,
  getDropoutProbability,
  getParticipantCluster,
  getParticipantPrograms,
  enrollParticipant,
  unenrollParticipant,
  createBaseline,
} from "../../api/participants";
import {
  listParticipantActiveGoals,
  createIndividualMicroGoal,
  updateIndividualMicroGoal,
  type IndividualMicroGoal,
} from "../../api/microGoals";
import { listPrograms } from "../../api/programs";
import { toast } from "../../stores/toastStore";
import { VolunteerPageHeader, VOL_HOME } from "../../components/voluntari/VolunteerPageHeader";

const TABS = ["Baseline", "Evolució", "Objectius", "Predicció", "Anàlisi", "Alertes"] as const;
type Tab = (typeof TABS)[number];

const GOAL_DIMENSIONS = [
  { value: "academic" as const,    label: "Acadèmic",   color: "var(--dim-academic)" },
  { value: "cognitive" as const,   label: "Cognitiu",   color: "var(--dim-cognitive)" },
  { value: "social" as const,      label: "Social",     color: "var(--dim-social)" },
  { value: "integration" as const, label: "Integració", color: "var(--dim-integration)" },
];

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
  if (trend === "improving") return <TrendingUp size={14} style={{ color: "var(--trend-up)", display: "inline" }} />;
  if (trend === "declining") return <TrendingDown size={14} style={{ color: "var(--trend-down)", display: "inline" }} />;
  return <Minus size={14} style={{ color: "var(--trend-stable)", display: "inline" }} />;
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

function StarRating({ count }: { count: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          size={12}
          style={{
            fill: i <= count ? "currentColor" : "none",
            color: "var(--text-muted)",
          }}
        />
      ))}
    </span>
  );
}

const BASELINE_DIMENSIONS = [
  {
    group: "Acadèmic",
    colorVar: "var(--dim-academic)",
    fields: [
      { key: "reading_level", label: "Lectura" },
      { key: "math_level", label: "Matemàtiques" },
      { key: "comprehension_level", label: "Comprensió" },
    ],
  },
  {
    group: "Cognitiu",
    colorVar: "var(--dim-cognitive)",
    fields: [
      { key: "attention_level", label: "Atenció" },
      { key: "memory_level", label: "Memòria" },
      { key: "autonomy_level", label: "Autonomia" },
    ],
  },
  {
    group: "Social",
    colorVar: "var(--dim-social)",
    fields: [
      { key: "peer_interaction", label: "Relació amb iguals" },
      { key: "group_work", label: "Treball en grup" },
      { key: "emotional_regulation", label: "Regulació emocional" },
    ],
  },
  {
    group: "Integració",
    colorVar: "var(--dim-integration)",
    fields: [
      { key: "language_fluency", label: "Fluïdesa lingüística" },
      { key: "cultural_adaptation", label: "Adaptació cultural" },
    ],
  },
];

type SliderValues = Record<string, number>;

function BaselineForm({ participantId }: { participantId: string }) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [programId, setProgramId] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [sliders, setSliders] = useState<SliderValues>(() => {
    const init: SliderValues = {};
    for (const group of BASELINE_DIMENSIONS) {
      for (const f of group.fields) {
        init[f.key] = 3;
      }
    }
    return init;
  });
  const [successMsg, setSuccessMsg] = useState("");

  const programsQ = useQuery({
    queryKey: ["programs", true],
    queryFn: () => listPrograms(true),
  });

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createBaseline(participantId, payload as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participant-evolution", participantId] });
      setSuccessMsg("Baseline creat correctament.");
    },
  });

  function handleSubmit() {
    const payload: Record<string, unknown> = {
      participant_id: participantId,
      program_id: programId,
      assessment_date: assessmentDate,
      notes,
      ...sliders,
    };
    mutation.mutate(payload);
  }

  return (
    <div className="card" style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem", borderRadius: 14 }}>
      <h3 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 800 }}>Crear Baseline</h3>

      <div style={{ marginBottom: "1rem" }}>
        <div className="form-label">Programa</div>
        <select
          className="form-select"
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
        >
          <option value="">Selecciona un programa</option>
          {(programsQ.data ?? []).map((p: { id: string; name: string }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <div className="form-label">Data d'avaluació</div>
        <input
          type="date"
          className="form-input"
          value={assessmentDate}
          onChange={(e) => setAssessmentDate(e.target.value)}
        />
      </div>

      {BASELINE_DIMENSIONS.map((group) => (
        <div key={group.group} style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontWeight: 700, fontSize: "0.88rem", color: group.colorVar, marginBottom: "0.6rem" }}>
            {group.group}
          </div>
          {group.fields.map((f) => (
            <div
              key={f.key}
              style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}
            >
              <span style={{ minWidth: 130, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{f.label}</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={sliders[f.key]}
                onChange={(e) => setSliders((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: group.colorVar }}
              />
              <span style={{ minWidth: 20, textAlign: "right", fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                {sliders[f.key]}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginBottom: "1.25rem" }}>
        <div className="form-label">Notes</div>
        <textarea
          className="form-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {mutation.isError && (
        <div style={{ color: "var(--risk-high)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Error en crear el baseline. Torna-ho a intentar.
        </div>
      )}

      {successMsg && (
        <div style={{ color: "var(--risk-low)", fontSize: "0.85rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={14} />
          {successMsg}
        </div>
      )}

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={mutation.isPending || !programId}
      >
        {mutation.isPending ? "Creant..." : "Crear baseline"}
      </button>
    </div>
  );
}

function BaselineReadOnly({ evolution }: { evolution: Record<string, unknown> }) {
  const baselineIpi = evolution.baseline_ipi as number | null;
  const dimBaseline = (evolution.dimensions_baseline ?? {}) as Record<string, number>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "1.25rem",
        }}
      >
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>Baseline IPI</h3>
        <div style={{ fontSize: "2.4rem", fontWeight: 800, color: "var(--brand-500)", lineHeight: 1 }}>
          {baselineIpi != null ? baselineIpi.toFixed(1) : "—"}
        </div>
      </div>

      {Object.keys(dimBaseline).length > 0 && (
        <div
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1.25rem",
          }}
        >
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700 }}>Dimensions Baseline</h3>
          {BASELINE_DIMENSIONS.map((group) => (
            <div key={group.group} style={{ marginBottom: "1rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: group.colorVar, marginBottom: "0.4rem" }}>
                {group.group}
              </div>
              {group.fields.map((f) => {
                const val = dimBaseline[f.key];
                return (
                  <div
                    key={f.key}
                    style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}
                  >
                    <span style={{ minWidth: 160, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{f.label}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-3)" }}>
                      <div
                        style={{
                          height: "100%",
                          width: val != null ? `${((val - 1) / 4) * 100}%` : "0%",
                          borderRadius: 3,
                          background: group.colorVar,
                        }}
                      />
                    </div>
                    <span style={{ minWidth: 20, textAlign: "right", fontWeight: 700, fontSize: "0.85rem" }}>
                      {val != null ? val : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ParticipantProfile() {
  const { participantId } = useParams<{ participantId: string }>();
  const [searchParams] = useSearchParams();
  const programIdFromUrl = searchParams.get("program_id") ?? "";
  const isVolunteer = useAuthStore((s) => s.role) === "professional";
  const qc = useQueryClient();
  const [enrollProgramId, setEnrollProgramId] = useState("");

  const participantQ = useQuery({
    queryKey: ["participant", participantId],
    queryFn: () => getParticipant(participantId!),
    enabled: !!participantId,
    retry: false,
  });

  const enrolledProgramsQ = useQuery({
    queryKey: ["participant-programs", participantId],
    queryFn: () => getParticipantPrograms(participantId!),
    enabled: !!participantId,
  });

  const effectiveProgramId =
    programIdFromUrl || enrolledProgramsQ.data?.[0]?.id || "";

  const evolutionQ = useQuery({
    queryKey: ["participant-evolution", participantId, effectiveProgramId],
    queryFn: () =>
      getParticipantEvolution(participantId!, effectiveProgramId || undefined),
    enabled: !!participantId && participantQ.isSuccess,
  });

  const evolution = evolutionQ.data;
  const hasBaseline = evolution?.baseline_ipi != null;

  const visibleTabs = useMemo(
    () => (isVolunteer ? (["Evolució", "Objectius"] as const) : TABS),
    [isVolunteer]
  );

  const [activeTab, setActiveTab] = useState<Tab>(isVolunteer ? "Evolució" : "Baseline");

  useEffect(() => {
    if (isVolunteer) return; // volunteers use their own tab toggle, don't auto-switch
    if (hasBaseline) setActiveTab("Evolució");
    else if (!evolutionQ.isLoading && evolutionQ.isSuccess) setActiveTab("Baseline");
  }, [isVolunteer, hasBaseline, evolutionQ.isLoading, evolutionQ.isSuccess]);

  const riskQ = useQuery({
    queryKey: ["participant-risk", participantId, effectiveProgramId],
    queryFn: () => getParticipantRisk(participantId!, effectiveProgramId),
    enabled: !!participantId && !!effectiveProgramId && !isVolunteer,
  });

  const predQ = useQuery({
    queryKey: ["participant-prediction", participantId],
    queryFn: () => getParticipantPredictionProbabilistic(participantId!, { weeks_ahead: 12, target_ipi: 70 }),
    enabled: !!participantId && !isVolunteer,
  });

  const dropoutQ = useQuery({
    queryKey: ["participant-dropout", participantId, effectiveProgramId],
    queryFn: () => getDropoutProbability(participantId!, effectiveProgramId),
    enabled: !!participantId && !!effectiveProgramId && !isVolunteer,
  });

  const clusterQ = useQuery({
    queryKey: ["participant-cluster", participantId, effectiveProgramId],
    queryFn: () => getParticipantCluster(participantId!, effectiveProgramId),
    enabled: !!participantId && !!effectiveProgramId && !isVolunteer,
  });

  const allProgramsQ = useQuery({
    queryKey: ["programs"],
    queryFn: () => listPrograms(true),
  });

  // ── Individual goals ─────────────────────────────────────────────────
  const activeGoalsQ = useQuery<IndividualMicroGoal[]>({
    queryKey: ["participant-active-goals", participantId],
    queryFn: () => listParticipantActiveGoals(participantId!),
    enabled: !!participantId,
    staleTime: 30_000,
  });
  const activeGoals = activeGoalsQ.data ?? [];

  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: "",
    dimension: "academic" as "academic" | "cognitive" | "social" | "integration",
    difficulty: 2 as 1 | 2 | 3,
    target_date: "",
    description: "",
    program_id: "",
  });

  // When enrolled programs load, prefill the program selector in the goal form
  useEffect(() => {
    if (effectiveProgramId && !goalForm.program_id) {
      setGoalForm((prev) => ({ ...prev, program_id: effectiveProgramId }));
    }
  }, [effectiveProgramId]); // eslint-disable-line

  const createGoalMutation = useMutation({
    mutationFn: () =>
      createIndividualMicroGoal({
        participant_id: participantId!,
        program_id: goalForm.program_id || effectiveProgramId,
        title: goalForm.title.trim(),
        description: goalForm.description.trim() || undefined,
        dimension: goalForm.dimension,
        difficulty: goalForm.difficulty,
        target_date: goalForm.target_date || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participant-active-goals", participantId] });
      qc.invalidateQueries({ queryKey: ["participant-active-goals"] });
      setGoalFormOpen(false);
      setGoalForm({ title: "", dimension: "academic", difficulty: 2, target_date: "", description: "", program_id: effectiveProgramId });
      toast.success("Objectiu creat", "L'objectiu individual s'ha afegit correctament.");
    },
    onError: () => toast.error("No s'ha pogut crear l'objectiu", "Comprova que tots els camps siguin correctes."),
  });

  const deactivateGoalMutation = useMutation({
    mutationFn: (goalId: string) => updateIndividualMicroGoal(goalId, { active: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participant-active-goals", participantId] });
      toast.success("Objectiu desactivat");
    },
    onError: () => toast.error("No s'ha pogut desactivar l'objectiu"),
  });

  const enrolledPrograms = enrolledProgramsQ.data ?? [];
  const enrolledIds = new Set(enrolledPrograms.map((p) => p.id));
  const programsToEnroll = (allProgramsQ.data ?? []).filter((p) => !enrolledIds.has(p.id));

  const enrollMutation = useMutation({
    mutationFn: (progId: string) => enrollParticipant(progId, participantId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participant-programs", participantId] });
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["participant-evolution", participantId] });
      setEnrollProgramId("");
      toast.success("Inscrit al programa");
    },
    onError: () => toast.error("No s'ha pogut inscriure"),
  });

  const unenrollMutation = useMutation({
    mutationFn: (progId: string) => unenrollParticipant(progId, participantId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participant-programs", participantId] });
      qc.invalidateQueries({ queryKey: ["participants"] });
      toast.success("Baixa del programa");
    },
    onError: () => toast.error("No s'ha pogut donar de baixa"),
  });

  const risk = riskQ.data;
  const pred = predQ.data;
  const dropout = dropoutQ.data;
  const cluster = clusterQ.data;

  const currentIpi = evolution?.current_ipi ?? null;
  const baseline = evolution?.baseline_ipi ?? null;
  const delta = currentIpi != null && baseline != null ? currentIpi - baseline : null;
  const deltaPct = baseline && delta != null ? (delta / baseline) * 100 : null;

  const historyPoints = evolution?.history ?? evolution?.timeline ?? [];
  const chartData: { label: string; ipi: number | null; predicted?: number }[] = [];
  for (const point of historyPoints) {
    // Always use the actual assessment date as the X-axis label so the chart
    // is chronologically correct regardless of what period_label says
    // (avoids "Sim 31 → Sim 11 → Sim 43 …" jumps caused by label re-numbering).
    const rawDate = typeof point.date === "string" ? point.date.slice(0, 10) : String(point.date ?? "");
    let label = point.period_label ?? rawDate;
    if (rawDate) {
      // Parse as local date (not UTC) to avoid off-by-one in negative-offset TZs
      const [y, mo, d] = rawDate.split("-").map(Number);
      label = new Date(y, mo - 1, d).toLocaleDateString("ca-ES", { day: "numeric", month: "short" });
    }
    chartData.push({ label, ipi: point.ipi_score });
  }
  const predictedIpi = pred?.predicted_ipi ?? evolution?.prediction?.predicted_ipi;
  if (predictedIpi != null) {
    chartData.push({ label: "Predicció", ipi: null, predicted: predictedIpi });
  }

  const participant = participantQ.data;
  const displayName =
    participant?.first_name ?? evolution?.first_name ?? "Alumne";
  const displayCode = participant?.code ?? evolution?.code;
  const avatarLetter = (displayName[0] ?? displayCode?.[0] ?? "?").toUpperCase();
  const schoolAbbreviation =
    participant?.school_abbreviation ?? evolution?.school_abbreviation;

  const dims = ["academic", "cognitive", "social", "integration"];
  const radarData = dims.map((d) => ({
    dimension: DIM_LABELS[d],
    baseline: evolution?.dimensions_baseline?.[d] ?? 0,
    actual: evolution?.dimensions_current?.[d] ?? 0,
  }));

  if (!participantId) {
    return <div style={{ padding: "2rem" }}>Participant no trobat.</div>;
  }

  if (participantQ.isLoading) {
    return (
      <div className={isVolunteer ? "vol-page" : undefined} style={{ padding: isVolunteer ? undefined : "1.5rem" }}>
        {isVolunteer && (
          <VolunteerPageHeader title="Perfil" subtitle="Carregant alumne…" showBack backTo={VOL_HOME} />
        )}
        <p className={isVolunteer ? "vol-empty" : undefined} style={isVolunteer ? undefined : { color: "var(--text-muted)" }}>
          Carregant perfil…
        </p>
      </div>
    );
  }

  if (participantQ.isError) {
    return (
      <div className={isVolunteer ? "vol-page" : undefined} style={{ padding: isVolunteer ? undefined : "1.5rem" }}>
        {isVolunteer && (
          <VolunteerPageHeader title="Perfil" showBack backTo="/coordinator/participants" />
        )}
        <p
          className={isVolunteer ? "vol-empty" : undefined}
          role="alert"
          style={isVolunteer ? undefined : { color: "var(--risk-high)" }}
        >
          No s'ha pogut carregar aquest alumne. Comprova que estigui assignat al teu equip.
        </p>
      </div>
    );
  }

  return (
    <div
      className={isVolunteer ? "vol-page vol-participant-profile" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        padding: isVolunteer ? undefined : "1.5rem",
      }}
    >
      {isVolunteer && (
        <VolunteerPageHeader
          title={displayName}
          subtitle={
            [
              displayCode ? `Codi ${displayCode}` : null,
              schoolAbbreviation ?? null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          showBack
          backTo="/coordinator/participants"
        />
      )}
      <div
        className={isVolunteer ? "vol-card vol-profile-kpi" : undefined}
        style={
          isVolunteer
            ? undefined
            : {
                background: "var(--surface-0)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "1.25rem 1.5rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "1rem",
              }
        }
      >
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
          {avatarLetter}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {!isVolunteer && (
            <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {displayName}
            </span>
            {risk?.risk_level && <RiskBadge level={risk.risk_level} />}
          </div>
          <div style={{ fontSize: "0.83rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
            {displayCode && <span>Codi {displayCode}</span>}
            {schoolAbbreviation && (
              <span>
                {displayCode ? " · " : ""}
                {schoolAbbreviation}
              </span>
            )}
            {evolution?.weeks_in_program != null && (
              <span>
                {(displayCode || schoolAbbreviation) ? " · " : ""}
                Setmana {evolution.weeks_in_program} al programa
              </span>
            )}
          </div>
            </>
          )}
          {isVolunteer && evolution?.weeks_in_program != null && (
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Setmana {evolution.weeks_in_program} al programa
            </p>
          )}

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

      {!isVolunteer && (
      <div
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "1rem 1.25rem",
        }}
      >
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 800 }}>
          Programes
        </h3>
        {enrolledPrograms.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)" }}>
            Encara no està inscrit en cap programa actiu.
          </p>
        ) : (
          <ul style={{ margin: "0 0 0.75rem", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {enrolledPrograms.map((prog) => (
              <li
                key={prog.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  fontSize: "0.88rem",
                }}
              >
                <span style={{ fontWeight: 600 }}>{prog.name}</span>
                {!isVolunteer && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                    onClick={() => unenrollMutation.mutate(prog.id)}
                  >
                    Baixa
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {programsToEnroll.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <label htmlFor="enroll-program-select" className="sr-only">
              Programa per inscriure
            </label>
            <select
              id="enroll-program-select"
              className={isVolunteer ? "vol-filter-select" : "form-select"}
              style={{ flex: 1, minWidth: 160 }}
              value={enrollProgramId}
              onChange={(e) => setEnrollProgramId(e.target.value)}
            >
              <option value="">Afegir a programa…</option>
              {programsToEnroll.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={isVolunteer ? "vol-cta-primary" : "btn-primary"}
              disabled={!enrollProgramId || enrollMutation.isPending}
              onClick={() => enrollProgramId && enrollMutation.mutate(enrollProgramId)}
            >
              Inscriure
            </button>
          </div>
        )}
      </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: 0,
          overflowX: "auto",
        }}
      >
        {visibleTabs.map((tab) => (
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
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {evolutionQ.isError && (
        <p className={isVolunteer ? "vol-empty" : undefined} role="alert" style={isVolunteer ? undefined : { color: "var(--risk-medium)" }}>
          Les dades d'evolució no s'han pogut carregar. El nom i el codi de l'alumne sí que es mostren correctament.
        </p>
      )}

      {activeTab === "Baseline" && (
        <div>
          {!hasBaseline ? (
            <BaselineForm participantId={participantId} />
          ) : (
            <BaselineReadOnly evolution={evolution as Record<string, unknown>} />
          )}
        </div>
      )}

      {activeTab === "Evolució" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    angle={chartData.length > 12 ? -35 : 0}
                    textAnchor={chartData.length > 12 ? "end" : "middle"}
                    height={chartData.length > 12 ? 48 : 20}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: "0.85rem" }}
                    formatter={(value: number, name: string) => [
                      `${Number(value).toFixed(1)} pts`,
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
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

      {activeTab === "Objectius" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* ── Goals header ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                <Target size={16} strokeWidth={2.2} style={{ color: "var(--brand-500)" }} />
                Objectius individuals
              </h3>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Objectius personalitzats per fer seguiment GAS sessió a sessió
              </p>
            </div>
            {!goalFormOpen && (
              <button
                type="button"
                onClick={() => setGoalFormOpen(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "0.45rem 1rem", borderRadius: 8, border: "none",
                  background: "var(--brand-500)", color: "white",
                  fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Plus size={14} strokeWidth={2.5} />
                Nou objectiu
              </button>
            )}
          </div>

          {/* ── Create goal form ── */}
          {goalFormOpen && (
            <div style={{
              background: "var(--surface-0)", border: "1px solid var(--brand-300)",
              borderRadius: 14, padding: "1.25rem",
              display: "flex", flexDirection: "column", gap: "0.85rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700 }}>Nou objectiu individual</h4>
                <button
                  type="button"
                  onClick={() => setGoalFormOpen(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0.25rem" }}
                  aria-label="Tancar"
                >
                  <XIcon size={18} strokeWidth={2} />
                </button>
              </div>

              {/* Program selector (if not auto-resolved) */}
              {!effectiveProgramId && (
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Programa *
                  </label>
                  <select
                    className="form-select"
                    value={goalForm.program_id}
                    onChange={(e) => setGoalForm((p) => ({ ...p, program_id: e.target.value }))}
                  >
                    <option value="">Selecciona programa…</option>
                    {enrolledPrograms.map((prog) => (
                      <option key={prog.id} value={prog.id}>{prog.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                  Títol de l'objectiu *
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex.: Acabar els deures sense recordatoris"
                  value={goalForm.title}
                  onChange={(e) => setGoalForm((p) => ({ ...p, title: e.target.value }))}
                  autoFocus
                />
              </div>

              {/* Dimension + Difficulty in one row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Dimensió *
                  </label>
                  <select
                    className="form-select"
                    value={goalForm.dimension}
                    onChange={(e) => setGoalForm((p) => ({ ...p, dimension: e.target.value as typeof goalForm.dimension }))}
                  >
                    {GOAL_DIMENSIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Dificultat
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([1, 2, 3] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setGoalForm((p) => ({ ...p, difficulty: d }))}
                        style={{
                          flex: 1, padding: "0.45rem 0", border: "1.5px solid",
                          borderColor: goalForm.difficulty === d ? "var(--brand-500)" : "var(--border)",
                          borderRadius: 8, background: goalForm.difficulty === d ? "var(--brand-100)" : "none",
                          color: goalForm.difficulty === d ? "var(--brand-700)" : "var(--text-secondary)",
                          fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
                        }}
                      >
                        {"★".repeat(d)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Target date (optional) */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                  Data objectiu <span style={{ fontWeight: 400 }}>(opcional)</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={goalForm.target_date}
                  onChange={(e) => setGoalForm((p) => ({ ...p, target_date: e.target.value }))}
                />
              </div>

              {/* Description (optional) */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                  Descripció / context <span style={{ fontWeight: 400 }}>(opcional)</span>
                </label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Per exemple: es distreu molt en sessions grupals…"
                  value={goalForm.description}
                  onChange={(e) => setGoalForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>

              {createGoalMutation.isError && (
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--risk-high)" }}>
                  No s'ha pogut crear l'objectiu. Comprova que tots els camps obligatoris estiguin omplerts.
                </p>
              )}

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setGoalFormOpen(false)}
                >
                  Cancel·lar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={
                    !goalForm.title.trim() ||
                    (!goalForm.program_id && !effectiveProgramId) ||
                    createGoalMutation.isPending
                  }
                  onClick={() => createGoalMutation.mutate()}
                >
                  {createGoalMutation.isPending ? "Creant…" : "Crear objectiu"}
                </button>
              </div>
            </div>
          )}

          {/* ── Goals list ── */}
          {activeGoalsQ.isLoading ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Carregant objectius…</p>
          ) : activeGoals.length === 0 ? (
            <div style={{
              padding: "2rem 1.5rem", borderRadius: 14,
              background: "var(--surface-1)", border: "1px dashed var(--border)",
              textAlign: "center",
            }}>
              <Target size={32} strokeWidth={1.5} style={{ color: "var(--text-muted)", marginBottom: "0.75rem" }} />
              <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                Sense objectius individuals actius
              </p>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Defineix objectius personalitzats per a {displayName} i registra'n el progrés en cada sessió (escala GAS −2…+2).
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {activeGoals.map((goal) => {
                const dim = GOAL_DIMENSIONS.find((d) => d.value === goal.dimension);
                return (
                  <div
                    key={goal.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.875rem",
                      padding: "0.85rem 1rem", borderRadius: 10,
                      background: "var(--surface-0)", border: "1px solid var(--border)",
                    }}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                      background: dim?.color ?? "var(--brand-500)",
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                        {goal.title}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ color: dim?.color, fontWeight: 600 }}>{dim?.label ?? goal.dimension}</span>
                        <span>{"★".repeat(goal.difficulty)}{"☆".repeat(3 - goal.difficulty)}</span>
                        {goal.target_date && <span>Fins {goal.target_date}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deactivateGoalMutation.mutate(goal.id)}
                      disabled={deactivateGoalMutation.isPending}
                      style={{
                        fontSize: "0.78rem", color: "var(--text-muted)",
                        padding: "0.3rem 0.7rem", borderRadius: 6,
                        border: "1px solid var(--border)", background: "none",
                        cursor: "pointer", flexShrink: 0,
                        transition: "color 0.15s, border-color 0.15s",
                      }}
                      title="Marcar com a completat / desactivar"
                    >
                      Completat
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "Predicció" && (
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
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Lightbulb size={14} />
                    {dropout.recommended_intervention}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {DIM_LABELS[g.dimension]} · <StarRating count={g.difficulty} />
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
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AlertTriangle size={14} />
                    {f.replace(/_/g, " ")}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--risk-low)", fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={14} />
              Cap factor de risc significatiu detectat.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
