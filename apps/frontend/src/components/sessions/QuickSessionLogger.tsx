import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cloud,
  CloudRain,
  Compass,
  Globe,
  Hand,
  Handshake,
  ListChecks,
  Meh,
  Minus,
  MessageSquare,
  Mic,
  RotateCcw,
  Rocket,
  Search,
  Sparkles,
  Sun,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users2,
  X,
  Zap,
  Star,
  type LucideIcon,
} from "lucide-react";
import { listMicroGoals, listParticipantActiveGoals, type IndividualMicroGoal } from "../../api/microGoals";
import { getEnrolledParticipants, listParticipants, type Participant } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { listSessionActivityTags, type SessionActivityTag } from "../../api/sessionActivityTags";
import { SchoolBadge } from "../common/SchoolBadge";
import { createSession } from "../../api/sessions";
import { useLocalDraft } from "../../hooks/useLocalDraft";
import { OutcomesStar } from "./OutcomesStar";
import { LiveReactions } from "./LiveReactions";
import { SessionTimePicker, defaultSessionTime } from "./SessionTimePicker";
import {
  deriveScoreFromEvents, noteFromStarAnchors, noteFromEvents,
  type DimKey as DataDimKey, type InputMode, type ReactionEvent,
} from "./inputModeData";

const DIMS = [
  { key: "academicScore",    label: "Acadèmic",    Icon: BookOpen,  color: "var(--dim-academic)" },
  { key: "cognitiveScore",   label: "Cognitiu",    Icon: Brain,     color: "var(--dim-cognitive)" },
  { key: "socialScore",      label: "Social",      Icon: Users2,    color: "var(--dim-social)" },
  { key: "integrationScore", label: "Integració",  Icon: Globe,     color: "var(--dim-integration)" },
] as const;

const MOOD_OPTIONS = [
  { value: "very_low",  Icon: CloudRain, label: "Molt baixa",  color: "var(--risk-high)" },
  { value: "low",       Icon: Cloud,     label: "Baixa",       color: "var(--risk-medium)" },
  { value: "neutral",   Icon: Meh,       label: "Neutral",     color: "var(--text-muted)" },
  { value: "good",      Icon: Sun,       label: "Bona",        color: "var(--dim-integration)" },
  { value: "excellent", Icon: Zap,       label: "Excel·lent",  color: "var(--brand-500)" },
];

const SESSION_TYPES = [
  { value: "group",      label: "Grupal" },
  { value: "individual", label: "Individual" },
  { value: "workshop",   label: "Taller" },
  { value: "follow_up",  label: "Seguiment" },
];

const ATTENDANCE_OPTIONS = [
  { value: "present",             label: "Present",        color: "var(--risk-low)" },
  { value: "late",                label: "Tard",           color: "var(--risk-medium)" },
  { value: "absent_justified",    label: "Absent (just.)", color: "var(--text-muted)" },
  { value: "absent_unjustified",  label: "Absent",         color: "var(--risk-high)" },
];

const QUICK_TAGS: { label: string; Icon: LucideIcon; insert: string }[] = [
  {
    label: "Atenció sostinguda",
    Icon: Target,
    insert: "Ha mostrat atenció sostinguda durant tota l'activitat, sense distraccions. ",
  },
  {
    label: "Iniciativa",
    Icon: Rocket,
    insert: "Ha pres la iniciativa per començar i acabar la tasca sense recordatoris. ",
  },
  {
    label: "Cooperació",
    Icon: Handshake,
    insert: "Ha cooperat bé amb els companys, compartint materials i idees. ",
  },
  {
    label: "Frustració",
    Icon: Meh,
    insert: "S'ha frustrat davant la dificultat; cal reforç emocional. ",
  },
  {
    label: "Millora notable",
    Icon: TrendingUp,
    insert: "Mostra una millora notable respecte la sessió anterior en aquest contingut. ",
  },
  {
    label: "Necessita reforç",
    Icon: RotateCcw,
    insert: "Necessita reforç en aquest contingut abans d'avançar. ",
  },
  {
    label: "Participació activa",
    Icon: Hand,
    insert: "Ha participat activament fent preguntes i propostes. ",
  },
  {
    label: "Segueix instruccions",
    Icon: ListChecks,
    insert: "Segueix les instruccions amb autonomia creixent. ",
  },
];

const STAR_LABELS = ["", "Molt baix", "Baix", "Regular", "Bé", "Excel·lent"];

type DimKey = DataDimKey;

interface ObsState {
  academicScore: number; cognitiveScore: number; socialScore: number; integrationScore: number;
  qualitativeNote: string; mood: string; attendance: string; microGoalIds: string[];
  /** Reaction event log (only used in "reactions" input mode). */
  events: ReactionEvent[];
  /** Whether the user has typed in the textarea after auto-generation
   *  from anchors / reactions; protects manual edits from being clobbered. */
  noteEdited: boolean;
  /** Bespoke session-registration extensions (universal across input modes). */
  arrivalMood: string;
  departureMood: string;
  verbalParticipation: number | null;  // 0..3
  /** Per individual micro-goal id → GAS score (-2..+2). */
  goalProgress: Record<string, number>;
  /** Volunteer gut-feel vs last session (no numbers shown). */
  progressSense: "" | "progressed" | "similar" | "step_back";
}

const defaultObs = (): ObsState => ({
  academicScore: 0, cognitiveScore: 0, socialScore: 0, integrationScore: 0,
  qualitativeNote: "", mood: "neutral", attendance: "present", microGoalIds: [],
  events: [],
  noteEdited: false,
  arrivalMood: "",
  departureMood: "",
  verbalParticipation: null,
  goalProgress: {},
  progressSense: "",
});

interface FormState {
  programId: string; sessionType: string; sessionDate: string; sessionTime: string;
  durationMinutes: string; notes: string; observations: Record<string, ObsState>;
  /** Per-session input paradigm; persisted so refresh keeps the choice. */
  inputMode: InputMode;
  /** Org-scoped activity tags selected for the whole session. */
  activityTagIds: string[];
}

const defaultForm = (): FormState => ({
  programId: "", sessionType: "group",
  sessionDate: new Date().toISOString().slice(0, 10),
  sessionTime: defaultSessionTime(),
  durationMinutes: "45", notes: "", observations: {},
  inputMode: "stars",
  activityTagIds: [],
});

const VERBAL_PARTICIPATION_OPTIONS = [
  { value: 0, label: "No parla",    short: "0" },
  { value: 1, label: "Si li ho demanen", short: "1" },
  { value: 2, label: "Espontàniament",   short: "2" },
  { value: 3, label: "Lidera la conversa", short: "3" },
] as const;

const PROGRESS_SENSE_OPTIONS = [
  {
    value: "progressed" as const,
    label: "Ha progressat",
    sub: "Millora clara respecte l'última sessió",
    Icon: TrendingUp,
    color: "var(--risk-low)",
  },
  {
    value: "similar" as const,
    label: "Similar",
    sub: "Sense canvis rellevants",
    Icon: Minus,
    color: "var(--text-muted)",
  },
  {
    value: "step_back" as const,
    label: "Un pas enrere",
    sub: "Sembla que ha empitjorat",
    Icon: TrendingDown,
    color: "var(--risk-high)",
  },
] as const;

const GAS_LEVELS = [
  { value: -2, label: "Molt pitjor",  color: "var(--risk-high)" },
  { value: -1, label: "Pitjor",       color: "var(--risk-medium)" },
  { value:  0, label: "Esperat",      color: "var(--text-muted)" },
  { value: +1, label: "Millor",       color: "var(--dim-integration)" },
  { value: +2, label: "Molt millor",  color: "var(--risk-low)" },
] as const;

function GASControl({
  value, onChange,
}: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div className="ql-gas">
      {GAS_LEVELS.map((lv) => {
        const active = value === lv.value;
        return (
          <button
            key={lv.value}
            type="button"
            className={`ql-gas-btn ${active ? "active" : ""}`}
            style={active
              ? { borderColor: lv.color, color: lv.color, background: `color-mix(in srgb, ${lv.color} 12%, transparent)` }
              : {}}
            onClick={() => onChange(lv.value)}
            title={lv.label}
          >
            <span className="ql-gas-num">{lv.value > 0 ? `+${lv.value}` : lv.value}</span>
            <span className="ql-gas-label">{lv.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const INPUT_MODE_OPTIONS: { value: InputMode; label: string; icon: React.ElementType; hint: string }[] = [
  { value: "stars",     label: "Estrelles",      icon: Star,    hint: "Ràpid · 1-5 ★ per dimensió"  },
  { value: "star",      label: "Estrella radial", icon: Compass, hint: "Outcomes Star · descripcions ancorades" },
  { value: "reactions", label: "Reaccions",      icon: Activity,hint: "ClassDojo · xips en directe"  },
];

const VOLUNTEER_INPUT_MODES: InputMode[] = ["stars", "star"];

function StarRating({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="ql-stars">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hover || value);
        return (
          <motion.button
            key={star}
            type="button"
            title={STAR_LABELS[star]}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(value === star ? 0 : star)}
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.12 }}
            className="ql-star-btn"
            style={{ color: filled ? color : "var(--surface-3)" }}
          >
            <Star size={20} fill={filled ? color : "transparent"} strokeWidth={1.8} />
          </motion.button>
        );
      })}
      <span className="ql-star-label">{(hover || value) ? STAR_LABELS[hover || value] : ""}</span>
    </div>
  );
}

function ParticipantAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return (
    <div
      className="ql-avatar"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.42),
        background: `hsl(${hue}, 60%, 92%)`,
        color: `hsl(${hue}, 65%, 38%)`,
      }}
    >
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

export function QuickSessionLogger({
  onClose,
  compact = false,
  volunteerMode = false,
  initialParticipantIds,
  lockProgramId,
}: {
  onClose?: () => void;
  compact?: boolean;
  /** Voluntari/a mòbil: només estrelles i estrella radial; sense pool de participants. */
  volunteerMode?: boolean;
  initialParticipantIds?: string[];
  lockProgramId?: string;
}) {
  const [_rawForm, setForm, clearForm] = useLocalDraft<FormState>("quick-session-logger-v4", defaultForm());
  const rawInputMode = _rawForm.inputMode ?? "stars";
  const safeInputMode: InputMode =
    volunteerMode && !VOLUNTEER_INPUT_MODES.includes(rawInputMode) ? "stars" : rawInputMode;

  const form: FormState = {
    ...defaultForm(),
    ..._rawForm,
    programId: lockProgramId ?? _rawForm.programId ?? "",
    observations: _rawForm.observations ?? {},
    inputMode: safeInputMode,
  };

  const inputModeOptions = volunteerMode
    ? INPUT_MODE_OPTIONS.filter((o) => VOLUNTEER_INPUT_MODES.includes(o.value))
    : INPUT_MODE_OPTIONS;

  const hideParticipantPool = volunteerMode && compact;
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(initialParticipantIds ?? []);
  const [activeIdx, setActiveIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showDateBanner, setShowDateBanner] = useState(true);
  const qc = useQueryClient();

  const todayIso = new Date().toISOString().slice(0, 10);

  const programsQ = useQuery({ queryKey: ["programs"], queryFn: () => listPrograms() });
  const schoolsQ = useQuery({ queryKey: ["schools"], queryFn: listSchools });
  const participantsQ = useQuery({
    queryKey: ["participants", "logger", form.programId, filterSchoolId],
    queryFn: () =>
      form.programId
        ? getEnrolledParticipants(form.programId)
        : listParticipants({ schoolId: filterSchoolId || undefined }),
  });
  const goalsQ = useQuery({
    queryKey: ["micro-goals", form.programId],
    queryFn: () => listMicroGoals({ programId: form.programId }),
    enabled: !!form.programId,
  });
  const activityTagsQ = useQuery({
    queryKey: ["session-activity-tags"],
    queryFn: () => listSessionActivityTags(true),
  });

  const programs = programsQ.data ?? [];
  const schools = schoolsQ.data ?? [];
  const participants = (participantsQ.data ?? []).filter(
    (p) => !filterSchoolId || p.school_id === filterSchoolId
  );
  const goals = goalsQ.data ?? [];
  const activityTags = activityTagsQ.data ?? [];

  const selectedProgram = programs.find((p) => p.id === form.programId);
  const sessionTypeLabel = SESSION_TYPES.find((t) => t.value === form.sessionType)?.label ?? "Grupal";

  // Auto-select program if only one (unless locked from hub)
  useEffect(() => {
    if (lockProgramId) return;
    if (!form.programId && programs.length === 1) {
      setForm((prev) => ({ ...prev, programId: programs[0].id }));
    }
  }, [programs.length, lockProgramId]); // eslint-disable-line

  // Pre-select participants when opening from list
  useEffect(() => {
    if (!initialParticipantIds?.length) return;
    const ids = initialParticipantIds;
    setSelectedParticipants(ids);
    setActiveIdx(0);
    setForm((prev) => {
      const obs = { ...(prev.observations ?? {}) };
      ids.forEach((id) => {
        if (!(id in obs)) obs[id] = defaultObs();
      });
      return { ...prev, observations: obs };
    });
  }, []); // eslint-disable-line

  const activeParticipantId = selectedParticipants[activeIdx] ?? "";
  // Merge with defaultObs so legacy localStorage entries gain new fields
  // (events, noteEdited, GAS extensions) without runtime errors.
  const activeObs: ObsState = {
    ...defaultObs(),
    ...((form.observations ?? {})[activeParticipantId] ?? {}),
  };

  // Active per-participant individualised goals (GAS sliders).
  const activeGoalsQ = useQuery<IndividualMicroGoal[]>({
    queryKey: ["participant-active-goals", activeParticipantId, form.programId],
    queryFn: () => listParticipantActiveGoals(activeParticipantId, form.programId || undefined),
    enabled: !!activeParticipantId,
    staleTime: 30_000,
  });
  const activeGoals = activeGoalsQ.data ?? [];

  const filteredAvailable = useMemo(() => {
    const q = search.toLowerCase().trim();
    return participants.filter(
      (p) =>
        !selectedParticipants.includes(p.id) &&
        (!q || p.first_name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    );
  }, [participants, selectedParticipants, search]);

  const setObs = (pid: string, key: keyof ObsState, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      observations: {
        ...(prev.observations ?? {}),
        [pid]: { ...defaultObs(), ...((prev.observations ?? {})[pid] ?? {}), [key]: value },
      },
    }));
  };

  /** Mode-aware setter for the qualitative note (marks noteEdited so the
   *  auto-generated text from anchors/reactions doesn't overwrite it). */
  const handleNoteChange = (pid: string, text: string) => {
    setForm((prev) => ({
      ...prev,
      observations: {
        ...(prev.observations ?? {}),
        [pid]: {
          ...defaultObs(),
          ...((prev.observations ?? {})[pid] ?? {}),
          qualitativeNote: text,
          noteEdited: true,
        },
      },
    }));
  };

  /** Apply event-log change to the active participant in "reactions" mode.
   *  Recomputes the four 1-5 dimension scores so the IPI-bound payload
   *  stays in sync with the live tape. */
  const handleEventsChange = (pid: string, events: ReactionEvent[]) => {
    const academic    = deriveScoreFromEvents("academicScore",    events);
    const cognitive   = deriveScoreFromEvents("cognitiveScore",   events);
    const social      = deriveScoreFromEvents("socialScore",      events);
    const integration = deriveScoreFromEvents("integrationScore", events);
    setForm((prev) => {
      const prevObs: ObsState = { ...defaultObs(), ...((prev.observations ?? {})[pid] ?? {}) };
      return {
        ...prev,
        observations: {
          ...(prev.observations ?? {}),
          [pid]: {
            ...prevObs,
            events,
            academicScore: academic,
            cognitiveScore: cognitive,
            socialScore: social,
            integrationScore: integration,
          },
        },
      };
    });
  };

  /** Apply Outcomes Star anchor selection to the active participant. */
  const handleStarChange = (pid: string, dim: DimKey, value: number) => {
    setForm((prev) => ({
      ...prev,
      observations: {
        ...(prev.observations ?? {}),
        [pid]: { ...defaultObs(), ...((prev.observations ?? {})[pid] ?? {}), [dim]: value },
      },
    }));
  };

  /** Switch input mode for the whole session. Existing scores are kept
   *  so switching is non-destructive; only the input UI changes. */
  const handleModeChange = (mode: InputMode) => {
    setForm((prev) => ({ ...prev, inputMode: mode }));
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((p) => p !== id);
        setActiveIdx(Math.min(activeIdx, Math.max(0, next.length - 1)));
        return next;
      }
      const next = [...prev, id];
      setActiveIdx(next.length - 1);
      if (!(id in (form.observations ?? {}))) {
        setForm((prevF) => ({
          ...prevF,
          observations: { ...(prevF.observations ?? {}), [id]: defaultObs() },
        }));
      }
      return next;
    });
  };

  const insertTag = (text: string) => {
    if (!activeParticipantId) return;
    setObs(activeParticipantId, "qualitativeNote", (activeObs.qualitativeNote || "") + text);
  };

  const handleProgramChange = (programId: string) => {
    setForm((prev) => ({ ...prev, programId, observations: {} }));
    setSelectedParticipants([]);
    setActiveIdx(0);
    setSearch("");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.programId) throw new Error("Selecciona un programa abans de desar.");
      const observations = selectedParticipants
        .map((pid) => {
          const obs: ObsState = { ...defaultObs(), ...(form.observations[pid] ?? {}) };

          /* ───── Compose qualitative_note depending on input mode ─────
             We send the same numeric scores in every mode (1-5 per dim
             → IPI calc unchanged) but enrich the note with structured
             metadata captured by the alternative input UIs.            */
          const userText = obs.qualitativeNote.trim();
          let composedNote = userText;
          if (form.inputMode === "star") {
            const anchorText = noteFromStarAnchors({
              academicScore:    obs.academicScore,
              cognitiveScore:   obs.cognitiveScore,
              socialScore:      obs.socialScore,
              integrationScore: obs.integrationScore,
            });
            composedNote = anchorText
              ? (userText ? `${anchorText}\n\nObservació: ${userText}` : anchorText)
              : userText;
          } else if (form.inputMode === "reactions") {
            const eventText = noteFromEvents(obs.events);
            composedNote = eventText
              ? (userText ? `Reaccions registrades — ${eventText}\n\nObservació: ${userText}` : `Reaccions registrades — ${eventText}`)
              : userText;
          }

          const goalProgressEntries = Object.entries(obs.goalProgress ?? {}).map(([gid, p]) => ({
            micro_goal_id: gid,
            progress: p,
          }));

          return {
            participant_id: pid,
            academic_score: obs.academicScore || undefined,
            cognitive_score: obs.cognitiveScore || undefined,
            social_score: obs.socialScore || undefined,
            integration_score: obs.integrationScore || undefined,
            qualitative_note: composedNote || undefined,
            // Legacy mood field — kept for backward compat with existing reports.
            mood_indicator: obs.mood,
            attendance_status: obs.attendance,
            // Bespoke session-registration signals.
            arrival_mood: obs.mood || undefined,
            departure_mood: obs.departureMood || undefined,
            verbal_participation:
              obs.verbalParticipation === null ? undefined : obs.verbalParticipation,
            goal_progress: goalProgressEntries.length ? goalProgressEntries : undefined,
            volunteer_progress_sense: obs.progressSense || undefined,
          };
        })
        // An observation is kept if it has either: a 1-5 dim score, GAS progress,
        // verbal participation, an alert flag, or just attendance with a mood.
        .filter((o) => {
          const hasDimScore = [
            o.academic_score, o.cognitive_score, o.social_score, o.integration_score,
          ].some((v) => v !== undefined);
          const hasGoalProgress = (o.goal_progress?.length ?? 0) > 0;
          const hasBespoke =
            o.verbal_participation !== undefined ||
            o.departure_mood !== undefined;
          const hasSense = !!o.volunteer_progress_sense;
          return hasDimScore || hasGoalProgress || hasBespoke || hasSense;
        });

      if (observations.length === 0)
        throw new Error("Cal puntuar almenys una dimensió, un objectiu o una observació qualitativa.");

      const missingSense = selectedParticipants.filter((pid) => {
        const obs = (form.observations ?? {})[pid] ?? defaultObs();
        const present = obs.attendance === "present" || obs.attendance === "late";
        return present && !obs.progressSense;
      });
      if (volunteerMode && missingSense.length > 0) {
        throw new Error(
          "Indica com creus que ha evolucionat cada alumne present (apartat final del formulari)."
        );
      }

      return createSession({
        program_id: form.programId,
        session_type: form.sessionType,
        session_date: form.sessionDate,
        session_time: form.sessionTime,
        duration_minutes: parseInt(form.durationMinutes) || 45,
        notes: form.notes || undefined,
        observations,
        activity_tag_ids: form.activityTagIds.length ? form.activityTagIds : undefined,
      });
    },
    onSuccess: () => {
      setSaved(true);
      clearForm();
      setSelectedParticipants([]);
      setActiveIdx(0);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["participant-evolution"] });
      qc.invalidateQueries({ queryKey: ["professional-dashboard"] });
      setTimeout(() => { setSaved(false); onClose?.(); }, 2000);
    },
    onError: (err: Error) => setSaveError(err.message || "Error en guardar la sessió."),
  });

  const requestSave = () => {
    setSaveError("");
    setConfirmOpen(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (selectedParticipants.length > 0 && form.programId) {
          setSaveError("");
          setConfirmOpen(true);
        }
      }
      if (e.key === "Escape" && onClose) onClose();
      if (selectedParticipants.length > 1 && e.altKey) {
        if (e.key === "ArrowRight") setActiveIdx((i) => Math.min(i + 1, selectedParticipants.length - 1));
        if (e.key === "ArrowLeft") setActiveIdx((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedParticipants, form.programId]); // eslint-disable-line

  const hasAnySignal = (obs: ObsState | undefined): boolean => {
    if (!obs) return false;
    if ([obs.academicScore, obs.cognitiveScore, obs.socialScore, obs.integrationScore].some((v) => v > 0)) return true;
    if (Object.keys(obs.goalProgress ?? {}).length > 0) return true;
    if (obs.verbalParticipation !== null) return true;
    if (obs.departureMood) return true;
    if (obs.progressSense) return true;
    return false;
  };

  const isPresentAttendance = (att: string) => att === "present" || att === "late";
  const scoredCount = selectedParticipants.filter((pid) => hasAnySignal((form.observations ?? {})[pid])).length;

  const completionPct = selectedParticipants.length > 0
    ? Math.round((scoredCount / selectedParticipants.length) * 100)
    : 0;

  if (saved) {
    return (
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="ql-success"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 400 }}
          className="ql-success-icon"
        >
          <CheckCircle2 size={48} strokeWidth={1.6} />
        </motion.div>
        <div className="ql-success-title">Sessió registrada</div>
        <div className="ql-success-sub">Les observacions s'han desat correctament.</div>
      </motion.div>
    );
  }

  const todayLabel = new Date().toLocaleDateString("ca-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const isToday = form.sessionDate === todayIso;

  return (
    <div
      className={`ql-shell ${compact ? "ql-shell--compact" : ""} ${volunteerMode ? "ql-shell--volunteer" : ""}`}
    >
      {showDateBanner && !volunteerMode && (
        <div className="ql-date-banner" role="status" aria-live="polite">
          S'ha posat la data d'avui ({todayLabel}). Registra el dia de l'activitat real.
          <button
            type="button"
            className="btn-secondary"
            style={{ marginLeft: "0.5rem", padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
            onClick={() => setShowDateBanner(false)}
          >
            Entesos
          </button>
        </div>
      )}
      {!volunteerMode && (
        <>
          {/* ── Top bar: meta + progress ──────────────────────────────── */}
          <div className="ql-topbar">
            <div className="ql-topbar-meta">
              <select
                className="ql-meta-input ql-meta-program"
                value={form.programId}
                onChange={(e) => handleProgramChange(e.target.value)}
                disabled={!!lockProgramId}
                aria-readonly={!!lockProgramId}
              >
                <option value="">— Programa —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <div className="ql-meta-pills">
                {SESSION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`ql-meta-pill ${form.sessionType === t.value ? "active" : ""}`}
                    onClick={() => setForm((prev) => ({ ...prev, sessionType: t.value }))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {!volunteerMode && (
                <select
                  className="ql-meta-input"
                  value={filterSchoolId}
                  onChange={(e) => setFilterSchoolId(e.target.value)}
                  aria-label="Filtrar per escola"
                >
                  <option value="">Totes les escoles</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.abbreviation}</option>
                  ))}
                </select>
              )}

              <div className="ql-meta-datetime" role="group" aria-label="Data i hora de la sessió">
                <input
                  type="date"
                  className="ql-meta-input ql-meta-date"
                  value={form.sessionDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, sessionDate: e.target.value }))}
                  aria-label="Data de la sessió"
                />
                <SessionTimePicker
                  compact
                  id="coord-session-time"
                  label="Hora"
                  value={form.sessionTime}
                  onChange={(t) => setForm((prev) => ({ ...prev, sessionTime: t }))}
                />
              </div>

              <div className="ql-meta-duration">
                <input
                  type="number"
                  min={5} max={240}
                  className="ql-meta-input ql-meta-mins"
                  value={form.durationMinutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: e.target.value }))}
                />
                <span className="ql-meta-mins-label">min</span>
              </div>

              {/* ── Input mode segmented toggle ─────────────────────────── */}
              <div className="ql-mode-toggle" role="tablist" aria-label="Mode d'entrada">
                {inputModeOptions.map(({ value, label, icon: Icon, hint }) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={form.inputMode === value}
                    className={`ql-mode-btn ${form.inputMode === value ? "active" : ""}`}
                    onClick={() => handleModeChange(value)}
                    title={hint}
                  >
                    <Icon size={13} strokeWidth={2.2} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Activity tags (què s'ha treballat avui) ───────────────── */}
            {activityTags.length > 0 && (
              <div className="ql-activity-row" aria-label="Què s'ha treballat">
                <div className="ql-activity-label">
                  <Tag size={12} strokeWidth={2} />
                  Activitats
                  {form.activityTagIds.length > 0 && (
                    <span className="ql-activity-count">{form.activityTagIds.length}</span>
                  )}
                </div>
                <div className="ql-activity-chips">
                  {activityTags.map((tag: SessionActivityTag) => {
                    const checked = form.activityTagIds.includes(tag.id);
                    return (
                      <motion.button
                        key={tag.id}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        className={`ql-activity-chip ${checked ? "active" : ""}`}
                        style={checked && tag.color
                          ? { borderColor: tag.color, color: tag.color, background: `color-mix(in srgb, ${tag.color} 12%, transparent)` }
                          : {}}
                        onClick={() => {
                          setForm((prev) => {
                            const ids = prev.activityTagIds ?? [];
                            const next = checked ? ids.filter((id) => id !== tag.id) : [...ids, tag.id];
                            return { ...prev, activityTagIds: next };
                          });
                        }}
                      >
                        {checked && <Check size={11} strokeWidth={3} />}
                        {tag.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedParticipants.length > 0 && (
              <div className="ql-progress-block">
                <div className="ql-progress-label">
                  <strong>{scoredCount}</strong>/{selectedParticipants.length} puntuats
                </div>
                <div className="ql-progress-track">
                  <motion.div
                    className="ql-progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${completionPct}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Two-column body ───────────────────────────────────────── */}
      <div className={`ql-body ${hideParticipantPool ? "ql-body--single" : ""}`}>
        {/* LEFT: Participants pool */}
        {!hideParticipantPool && (
        <div className="ql-pool">
          <div className="ql-pool-header">
            <div className="ql-pool-title">
              <Users2 size={14} strokeWidth={2} />
              Participants
              <span className="ql-pool-count">{selectedParticipants.length} sel.</span>
            </div>
            <div className="ql-pool-search">
              <Search size={13} strokeWidth={2} className="ql-pool-search-icon" />
              <input
                type="text"
                placeholder="Cerca per nom o codi…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ql-pool-search-input"
              />
            </div>
          </div>

          {participantsQ.isLoading ? (
            <div className="ql-pool-state">Carregant participants…</div>
          ) : participants.length === 0 ? (
            <div className="ql-pool-state">
              {form.programId
                ? volunteerMode
                  ? "Cap alumne teu inscrit en aquest programa. Si en falta algun, demana al coordinador que t'assigni l'alumne i l'inscriu."
                  : "Cap participant inscrit. Inscriu-ne des de Programes."
                : "Cap participant. Crea'n des de la pàgina de Participants."}
            </div>
          ) : (
            <div className="ql-pool-grid">
              {volunteerMode && form.programId && (
                <p className="ql-pool-hint">
                  Només alumnes assignats a tu i inscrits en aquest programa ({participants.length}).
                </p>
              )}
              {selectedParticipants.length > 0 && (
                <div className="ql-pool-section-label">Seleccionats</div>
              )}
              <AnimatePresence>
                {selectedParticipants.map((pid) => {
                  const p = participants.find((x: Participant) => x.id === pid);
                  if (!p) return null;
                  const obs = (form.observations ?? {})[pid];
                  const scored = hasAnySignal(obs);
                  return (
                    <motion.button
                      key={pid}
                      type="button"
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 320, damping: 24 }}
                      className={`ql-chip ${activeIdx === selectedParticipants.indexOf(pid) ? "active" : ""} ${scored ? "scored" : ""}`}
                      onClick={() => setActiveIdx(selectedParticipants.indexOf(pid))}
                    >
                      <ParticipantAvatar name={p.first_name} size={28} />
                      <span className="ql-chip-name">{p.first_name}</span>
                      <SchoolBadge abbreviation={p.school_abbreviation} name={p.school_name} />
                      {scored && <Check size={12} strokeWidth={3} className="ql-chip-check" />}
                      <span
                        className="ql-chip-x"
                        onClick={(e) => { e.stopPropagation(); toggleParticipant(pid); }}
                      >
                        <X size={12} strokeWidth={2.5} />
                      </span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>

              {filteredAvailable.length > 0 && (
                <div className="ql-pool-section-label" style={{ marginTop: selectedParticipants.length > 0 ? 10 : 0 }}>
                  Disponibles ({filteredAvailable.length})
                </div>
              )}
              <AnimatePresence>
                {filteredAvailable.map((p) => (
                  <motion.button
                    key={p.id}
                    type="button"
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="ql-chip ql-chip--available"
                    onClick={() => toggleParticipant(p.id)}
                  >
                    <ParticipantAvatar name={p.first_name} size={28} />
                      <span className="ql-chip-name">{p.first_name}</span>
                      <SchoolBadge abbreviation={p.school_abbreviation} name={p.school_name} />
                      <span className="ql-chip-code">{p.code.slice(-3)}</span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
        )}

        {/* RIGHT: Active participant scoring */}
        <div className="ql-active">
          {!activeParticipantId ? (
            <div className="ql-empty">
              <ClipboardList size={42} strokeWidth={1.4} className="ql-empty-icon" />
              <div className="ql-empty-title">Selecciona participants</div>
              <div className="ql-empty-sub">
                Toca els participants de l'esquerra per puntuar-los. Pots afegir-ne tants com calgui.
              </div>
            </div>
          ) : (() => {
            const p = participants.find((x: Participant) => x.id === activeParticipantId);
            if (!p) return null;
            return (
              <motion.div
                key={activeParticipantId}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22 }}
                className={`ql-scoring ${volunteerMode ? "ql-scoring--volunteer" : ""}`}
              >
                <div className="ql-scoring-header">
                  <ParticipantAvatar name={p.first_name} size={48} />
                  <div className="ql-scoring-name-block">
                    <div className="ql-scoring-name">{p.first_name}</div>
                    <div className="ql-scoring-code">{p.code}</div>
                  </div>

                  {selectedParticipants.length > 1 && (
                    <div className="ql-scoring-nav">
                      <button
                        type="button"
                        className="ql-nav-btn"
                        onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
                        disabled={activeIdx === 0}
                        title="Anterior (Alt+←)"
                      >
                        <ChevronLeft size={14} strokeWidth={2.5} />
                      </button>
                      <span className="ql-nav-counter">{activeIdx + 1} / {selectedParticipants.length}</span>
                      <button
                        type="button"
                        className="ql-nav-btn"
                        onClick={() => setActiveIdx(Math.min(selectedParticipants.length - 1, activeIdx + 1))}
                        disabled={activeIdx === selectedParticipants.length - 1}
                        title="Següent (Alt+→)"
                      >
                        <ChevronRight size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                </div>

                {volunteerMode && (
                  <>
                    <div className="ql-section-card ql-section-card--context">
                      <div className="ql-section-card-head">
                        <div className="ql-section-card-title">
                          <ClipboardList size={16} strokeWidth={2.1} />
                          Context
                        </div>
                        <div className="ql-section-card-subtitle">Revisa les dades abans de registrar.</div>
                      </div>

                      <div className="ql-context-grid">
                        <div className="ql-context-item">
                          <div className="ql-context-label">Alumne</div>
                          <div className="ql-context-person">
                            <ParticipantAvatar name={p.first_name} size={40} />
                            <div className="ql-context-person-text">
                              <div className="ql-context-value ql-context-value--strong">{p.first_name}</div>
                              <div className="ql-context-helper">{p.code}</div>
                            </div>
                          </div>
                        </div>

                        <div className="ql-context-item">
                          <div className="ql-context-label">Escola</div>
                          <div className="ql-context-value">
                            <SchoolBadge abbreviation={p.school_abbreviation} name={p.school_name} />
                          </div>
                          <div className="ql-context-helper">{p.school_name}</div>
                        </div>

                        <div className="ql-context-item">
                          <div className="ql-context-label">Programa</div>
                          <div className="ql-context-value ql-context-value--strong">
                            {selectedProgram?.name ?? "—"}
                          </div>
                          <div className="ql-context-helper">
                            {sessionTypeLabel} · {form.durationMinutes || "45"} min
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="ql-section-card ql-section-card--datetime">
                      <div className="ql-section-card-head">
                        <div className="ql-section-card-title">
                          <CalendarDays size={16} strokeWidth={2.1} />
                          Data i hora
                        </div>
                        {isToday && <span className="ql-section-badge">Avui automàtic</span>}
                      </div>

                      <div className="ql-datetime-card-body">
                        <input
                          type="date"
                          className="ql-meta-input ql-meta-date ql-meta-date--section"
                          value={form.sessionDate}
                          onChange={(e) => setForm((prev) => ({ ...prev, sessionDate: e.target.value }))}
                          aria-label="Data de la sessió"
                        />
                        <SessionTimePicker
                          id="volunteer-session-time"
                          label="Hora"
                          value={form.sessionTime}
                          onChange={(t) => setForm((prev) => ({ ...prev, sessionTime: t }))}
                        />
                        <div className="ql-help-box">
                          Per defecte es posa la data d&apos;avui i l&apos;hora actual (arrodonida).
                          Canvia-ho només si registres una sessió d&apos;un altre moment.
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="ql-row">
                  <div className="ql-block">
                    <div className="ql-block-label">
                      <UserCheck size={12} strokeWidth={2} />
                      Assistència
                    </div>
                    <div className="ql-att-pills">
                      {ATTENDANCE_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={`ql-att-pill ${activeObs.attendance === o.value ? "active" : ""}`}
                          style={activeObs.attendance === o.value
                            ? { borderColor: o.color, color: o.color, background: `color-mix(in srgb, ${o.color} 12%, transparent)` }
                            : {}}
                          onClick={() => setObs(activeParticipantId, "attendance", o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                                    <div className="ql-block">
                    <div className="ql-block-label">
                      <Sparkles size={12} strokeWidth={2} />
                      Estat d'ànim — arribada
                    </div>
                    <div className="ql-mood-row">
                      {MOOD_OPTIONS.map((m) => (
                        <motion.button
                          key={m.value}
                          type="button"
                          whileTap={{ scale: 0.85 }}
                          className={`ql-mood-btn ql-mood-btn--labeled ${activeObs.mood === m.value ? "active" : ""}`}
                          style={activeObs.mood === m.value
                            ? { borderColor: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)`, color: m.color }
                            : {}}
                          onClick={() => setObs(activeParticipantId, "mood", m.value)}
                        >
                          <m.Icon size={16} strokeWidth={2} />
                          <span className="ql-mood-label">{m.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Bespoke session-registration signals ───────────────── */}
                <div className="ql-row ql-row--bespoke">
                  <div className="ql-block">
                    <div className="ql-block-label">
                      <Sparkles size={12} strokeWidth={2} />
                      Estat d'ànim — final
                      <span className="ql-block-hint">opcional</span>
                    </div>
                    <div className="ql-mood-row">
                      {MOOD_OPTIONS.map((m) => (
                        <motion.button
                          key={`dep-${m.value}`}
                          type="button"
                          whileTap={{ scale: 0.85 }}
                          className={`ql-mood-btn ql-mood-btn--labeled ${activeObs.departureMood === m.value ? "active" : ""}`}
                          style={activeObs.departureMood === m.value
                            ? { borderColor: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)`, color: m.color }
                            : {}}
                          onClick={() => setObs(
                            activeParticipantId,
                            "departureMood",
                            activeObs.departureMood === m.value ? "" : m.value,
                          )}
                        >
                          <m.Icon size={16} strokeWidth={2} />
                          <span className="ql-mood-label">{m.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="ql-block">
                    <div className="ql-block-label">
                      <Mic size={12} strokeWidth={2} />
                      Participació verbal
                      <span className="ql-block-hint">com s'ha expressat</span>
                    </div>
                    <div className="ql-verbal-row">
                      {VERBAL_PARTICIPATION_OPTIONS.map((opt) => {
                        const active = activeObs.verbalParticipation === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={`ql-verbal-btn ${active ? "active" : ""}`}
                            onClick={() => setObs(
                              activeParticipantId,
                              "verbalParticipation",
                              active ? null : opt.value,
                            )}
                          >
                            <span className="ql-verbal-num">{opt.short}</span>
                            <span className="ql-verbal-label">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="ql-block">
                  <div className="ql-block-label">
                    {form.inputMode === "stars"     && "Puntuació per dimensió"}
                    {form.inputMode === "star"      && "Estrella d'evolució (Outcomes Star)"}
                    {form.inputMode === "reactions" && "Reaccions en directe"}
                    <span className="ql-block-hint">
                      {form.inputMode === "stars"     && "1-5 estrelles per dimensió"}
                      {form.inputMode === "star"      && "Clica un nivell a cada eix · descripcions ancorades"}
                      {form.inputMode === "reactions" && "Toca xips a mesura que observes · scores derivats"}
                    </span>
                  </div>

                  {volunteerMode && (
                    <div className="ql-score-mode-row">
                      <div className="ql-score-mode-copy">Tria com vols puntuar</div>
                      <div className="ql-mode-toggle" role="tablist" aria-label="Mode d'entrada">
                        {inputModeOptions.map(({ value, label, icon: Icon, hint }) => (
                          <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={form.inputMode === value}
                            className={`ql-mode-btn ${form.inputMode === value ? "active" : ""}`}
                            onClick={() => handleModeChange(value)}
                            title={hint}
                          >
                            <Icon size={13} strokeWidth={2.2} />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.inputMode === "stars" && (
                    <div className="ql-dim-grid">
                      {DIMS.map(({ key, label, Icon, color }) => (
                        <div key={key} className="ql-dim-card">
                          <div className="ql-dim-card-head" style={{ color }}>
                            <Icon size={14} strokeWidth={2.2} />
                            <span>{label}</span>
                          </div>
                          <StarRating
                            value={activeObs[key as DimKey] as number}
                            onChange={(v) => setObs(activeParticipantId, key as DimKey, v)}
                            color={color}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {form.inputMode === "star" && (
                    <OutcomesStar
                      scores={{
                        academicScore:    activeObs.academicScore,
                        cognitiveScore:   activeObs.cognitiveScore,
                        socialScore:      activeObs.socialScore,
                        integrationScore: activeObs.integrationScore,
                      }}
                      onChange={(dim, v) => handleStarChange(activeParticipantId, dim as DimKey, v)}
                    />
                  )}

                  {form.inputMode === "reactions" && (
                    <LiveReactions
                      events={activeObs.events}
                      onChange={(next) => handleEventsChange(activeParticipantId, next)}
                    />
                  )}
                </div>

                <div className="ql-block">
                  <div className="ql-block-label">
                    Nota d'observació
                    <span className="ql-block-hint">Etiquetes ràpides</span>
                  </div>
                  <div className="ql-tag-row">
                    {QUICK_TAGS.map((t) => {
                      const TagIcon = t.Icon;
                      return (
                        <button
                          key={t.label}
                          type="button"
                          className="ql-tag"
                          onClick={() => insertTag(t.insert)}
                        >
                          <span className="ql-tag-icon" aria-hidden>
                            <TagIcon size={14} strokeWidth={2.2} />
                          </span>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    className="ql-textarea"
                    rows={3}
                    value={activeObs.qualitativeNote}
                    onChange={(e) => handleNoteChange(activeParticipantId, e.target.value)}
                    placeholder={
                      form.inputMode === "star"
                        ? "(Opcional) Afegeix una observació personalitzada — la descripció del nivell ja s'incorpora automàticament."
                        : form.inputMode === "reactions"
                        ? "(Opcional) Comentari addicional — el resum de reaccions s'afegeix automàticament al desar."
                        : `Avui, ${p.first_name} ha…`
                    }
                  />

                  {volunteerMode && (
                    <div className="ql-inline-session-note">
                      <div className="ql-block-label">
                        <MessageSquare size={12} strokeWidth={2} />
                        Nota general de la sessió (opcional)
                      </div>
                      <input
                        type="text"
                        className="ql-session-note ql-session-note--inline"
                        placeholder="Ex.: Sessió tranquil·la, bon ambient, bona participació…"
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                {/* ── Individualised goals: GAS-style progress (-2..+2) ──── */}
                {activeGoalsQ.isLoading ? null : activeGoals.length > 0 ? (
                  <div className="ql-block ql-gas-block">
                    <div className="ql-block-label">
                      <Target size={12} strokeWidth={2} />
                      Objectius individuals
                      <span className="ql-block-hint">
                        progrés respecte el que esperaves d'aquesta sessió
                      </span>
                    </div>
                    <div className="ql-gas-list">
                      {activeGoals.map((goal) => {
                        const value = activeObs.goalProgress?.[goal.id];
                        return (
                          <div key={goal.id} className="ql-gas-item">
                            <div className="ql-gas-head">
                              <div className="ql-gas-title">{goal.title}</div>
                              <div className="ql-gas-dim">{goal.dimension}</div>
                            </div>
                            <GASControl
                              value={value}
                              onChange={(v) => {
                                const next = { ...(activeObs.goalProgress ?? {}) };
                                if (next[goal.id] === v) {
                                  delete next[goal.id];
                                } else {
                                  next[goal.id] = v;
                                }
                                setObs(activeParticipantId, "goalProgress", next);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  form.programId && (
                    <div className="ql-block ql-gas-empty">
                      <Target size={14} strokeWidth={2} />
                      <div>
                        <div className="ql-gas-empty-title">Sense objectius individuals</div>
                        <div className="ql-gas-empty-sub">
                          Defineix objectius personalitzats des de la fitxa del participant.
                        </div>
                      </div>
                    </div>
                  )
                )}

                {volunteerMode && isPresentAttendance(activeObs.attendance) && (
                  <section
                    className="ql-progress-sense"
                    aria-labelledby="ql-progress-sense-title"
                  >
                    <div className="ql-block-label" id="ql-progress-sense-title">
                      <TrendingUp size={12} strokeWidth={2} />
                      Com creus que ha evolucionat respecte l'última sessió?
                      <span className="ql-block-hint">respecte l&apos;última sessió</span>
                    </div>
                    <p className="ql-progress-sense-intro">
                      La teva percepció aplica un factor suau (×0,8–1,2) sobre l&apos;IPI calculat.
                      No cal recordar la puntuació anterior.
                    </p>
                    <div className="ql-progress-sense-options" role="group" aria-labelledby="ql-progress-sense-title">
                      {PROGRESS_SENSE_OPTIONS.map(({ value, label, sub, Icon, color }) => {
                        const active = activeObs.progressSense === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`ql-progress-sense-btn${active ? " is-active" : ""}`}
                            style={
                              active
                                ? {
                                    borderColor: color,
                                    background: `color-mix(in srgb, ${color} 12%, transparent)`,
                                  }
                                : undefined
                            }
                            aria-pressed={active}
                            onClick={() =>
                              setObs(
                                activeParticipantId,
                                "progressSense",
                                active ? "" : value
                              )
                            }
                          >
                            <Icon size={22} strokeWidth={2.2} aria-hidden style={{ color }} />
                            <span className="ql-progress-sense-label">{label}</span>
                            <span className="ql-progress-sense-sub">{sub}</span>
                          </button>
                        );
                      })}
                    </div>
                    {!activeObs.progressSense && (
                      <p className="ql-progress-sense-warn" role="status">
                        Tria una opció per poder desar aquest alumne.
                      </p>
                    )}
                  </section>
                )}

                {goals.length > 0 && (
                  <div className="ql-block">
                    <div className="ql-block-label">
                      Micro-objectius assolits avui
                      {activeObs.microGoalIds.length > 0 && (
                        <span className="ql-goal-count">{activeObs.microGoalIds.length}</span>
                      )}
                    </div>
                    <div className="ql-goal-pills">
                      {goals.map((g) => {
                        const checked = activeObs.microGoalIds.includes(g.id);
                        return (
                          <motion.button
                            key={g.id}
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            className={`ql-goal-pill ${checked ? "active" : ""}`}
                            onClick={() => {
                              const ids = checked
                                ? activeObs.microGoalIds.filter((id) => id !== g.id)
                                : [...activeObs.microGoalIds, g.id];
                              setObs(activeParticipantId, "microGoalIds", ids);
                            }}
                          >
                            {checked && <Check size={11} strokeWidth={3} />}
                            {g.title}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })()}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="ql-footer">
        {selectedParticipants.length > 0 && !volunteerMode && (
          <input
            type="text"
            className="ql-session-note"
            placeholder="Nota general de la sessió (opcional)…"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
        )}

        <div className="ql-footer-actions">
          {saveError && <div className="ql-save-error">{saveError}</div>}
          <span className="ql-shortcut-hint">⌘/Ctrl + S</span>
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={saveMutation.isPending || !form.programId || selectedParticipants.length === 0}
            onClick={requestSave}
            className="ql-save-btn"
          >
            {saveMutation.isPending
              ? "Desant…"
              : `Desar · ${selectedParticipants.length} ${selectedParticipants.length === 1 ? "alumne" : "alumnes"}`}
          </motion.button>
        </div>
      </div>

      {confirmOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-save-title">
          <div className="modal-content modal-content--md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="confirm-save-title">Confirmar registre</h2>
            </div>
            <div className="modal-body">
              {!isToday && (
                <p className="form-error" role="alert">
                  La data seleccionada ({form.sessionDate}) no és avui. Segur que vols registrar per aquest dia?
                </p>
              )}
              <p><strong>Data:</strong> {form.sessionDate}</p>
              <p><strong>Programa:</strong> {programs.find((p) => p.id === form.programId)?.name ?? "—"}</p>
              <p><strong>Tipus:</strong> {SESSION_TYPES.find((t) => t.value === form.sessionType)?.label}</p>
              <p style={{ marginTop: "0.75rem" }}>
                <strong>És molt important</strong> afegir observacions qualitatives per cada alumne.
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.88rem" }}>
                {selectedParticipants.map((pid) => {
                  const p = participants.find((x) => x.id === pid);
                  const obs = form.observations[pid];
                  const stars = obs
                    ? `★ Ac:${obs.academicScore || 0} Co:${obs.cognitiveScore || 0} So:${obs.socialScore || 0} In:${obs.integrationScore || 0}`
                    : "";
                  const noteOk = (obs?.qualitativeNote?.trim().length ?? 0) > 0;
                  return (
                    <li key={pid} style={{ marginBottom: "0.35rem" }}>
                      {p?.first_name} {p && <SchoolBadge abbreviation={p.school_abbreviation} name={p.school_name} />}{" "}
                      {stars}
                      {!noteOk && <span style={{ color: "var(--risk-high)" }}> · sense observació</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setConfirmOpen(false)}>
                Cancel·lar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saveMutation.isPending}
                onClick={() => {
                  setConfirmOpen(false);
                  saveMutation.mutate();
                }}
              >
                Sí, registrar sessió
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
