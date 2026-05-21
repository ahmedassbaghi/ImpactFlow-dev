import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, BookOpen, Brain, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  Cloud, CloudRain, Compass, Globe, Meh, MessageSquare, Search, Sparkles, Sun, Target, UserCheck,
  Users2, X, Zap, Star,
} from "lucide-react";
import { listMicroGoals } from "../../api/microGoals";
import { getEnrolledParticipants, listParticipants, type Participant } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { SchoolBadge } from "../common/SchoolBadge";
import { createSession } from "../../api/sessions";
import { useLocalDraft } from "../../hooks/useLocalDraft";
import { OutcomesStar } from "./OutcomesStar";
import { LiveReactions } from "./LiveReactions";
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

const QUICK_TAGS = [
  { label: "Atenció sostinguda", icon: "🎯", insert: "Ha mostrat atenció sostinguda durant tota l'activitat, sense distraccions. " },
  { label: "Iniciativa", icon: "🚀", insert: "Ha pres la iniciativa per començar i acabar la tasca sense recordatoris. " },
  { label: "Cooperació", icon: "🤝", insert: "Ha cooperat bé amb els companys, compartint materials i idees. " },
  { label: "Frustració", icon: "😤", insert: "S'ha frustrat davant la dificultat; cal reforç emocional. " },
  { label: "Millora notable", icon: "📈", insert: "Mostra una millora notable respecte la sessió anterior en aquest contingut. " },
  { label: "Necessita reforç", icon: "🔁", insert: "Necessita reforç en aquest contingut abans d'avançar. " },
  { label: "Participació activa", icon: "✋", insert: "Ha participat activament fent preguntes i propostes. " },
  { label: "Segueix instruccions", icon: "📋", insert: "Segueix les instruccions amb autonomia creixent. " },
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
}

const defaultObs = (): ObsState => ({
  academicScore: 0, cognitiveScore: 0, socialScore: 0, integrationScore: 0,
  qualitativeNote: "", mood: "neutral", attendance: "present", microGoalIds: [],
  events: [],
  noteEdited: false,
});

interface FormState {
  programId: string; sessionType: string; sessionDate: string;
  durationMinutes: string; notes: string; observations: Record<string, ObsState>;
  /** Per-session input paradigm; persisted so refresh keeps the choice. */
  inputMode: InputMode;
}

const defaultForm = (): FormState => ({
  programId: "", sessionType: "group",
  sessionDate: new Date().toISOString().slice(0, 10),
  durationMinutes: "45", notes: "", observations: {},
  inputMode: "stars",
});

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

  const programs = programsQ.data ?? [];
  const schools = schoolsQ.data ?? [];
  const participants = (participantsQ.data ?? []).filter(
    (p) => !filterSchoolId || p.school_id === filterSchoolId
  );
  const goals = goalsQ.data ?? [];

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
  // (events, noteEdited) without runtime errors.
  const activeObs: ObsState = {
    ...defaultObs(),
    ...((form.observations ?? {})[activeParticipantId] ?? {}),
  };

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

          return {
            participant_id: pid,
            academic_score: obs.academicScore || undefined,
            cognitive_score: obs.cognitiveScore || undefined,
            social_score: obs.socialScore || undefined,
            integration_score: obs.integrationScore || undefined,
            qualitative_note: composedNote || undefined,
            mood_indicator: obs.mood,
            attendance_status: obs.attendance,
          };
        })
        .filter((o) => [o.academic_score, o.cognitive_score, o.social_score, o.integration_score].some((v) => v !== undefined));

      if (observations.length === 0)
        throw new Error("Cal puntuar almenys una dimensió per a un participant.");

      return createSession({
        program_id: form.programId,
        session_type: form.sessionType,
        session_date: form.sessionDate,
        duration_minutes: parseInt(form.durationMinutes) || 45,
        notes: form.notes || undefined,
        observations,
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

  const scoredCount = selectedParticipants.filter((pid) => {
    const obs = (form.observations ?? {})[pid];
    return obs && [obs.academicScore, obs.cognitiveScore, obs.socialScore, obs.integrationScore].some((v) => v > 0);
  }).length;

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

              <input
                type="date"
                className="ql-meta-input ql-meta-date"
                value={form.sessionDate}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionDate: e.target.value }))}
                aria-label="Data de la sessió"
              />

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
                ? "Cap participant inscrit. Inscriu-ne des de Programes."
                : "Cap participant. Crea'n des de la pàgina de Participants."}
            </div>
          ) : (
            <div className="ql-pool-grid">
              {selectedParticipants.length > 0 && (
                <div className="ql-pool-section-label">Seleccionats</div>
              )}
              <AnimatePresence>
                {selectedParticipants.map((pid) => {
                  const p = participants.find((x: Participant) => x.id === pid);
                  if (!p) return null;
                  const obs = (form.observations ?? {})[pid];
                  const scored = obs && [obs.academicScore, obs.cognitiveScore, obs.socialScore, obs.integrationScore].some((v) => v > 0);
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

                    <div className="ql-section-card ql-section-card--date">
                      <div className="ql-section-card-head">
                        <div className="ql-section-card-title">
                          <CalendarDays size={16} strokeWidth={2.1} />
                          Data
                        </div>
                        {isToday && <span className="ql-section-badge">Avui automàtic</span>}
                      </div>

                      <div className="ql-date-card-body">
                        <input
                          type="date"
                          className="ql-meta-input ql-meta-date ql-meta-date--section"
                          value={form.sessionDate}
                          onChange={(e) => setForm((prev) => ({ ...prev, sessionDate: e.target.value }))}
                          aria-label="Data de la sessió"
                        />
                        <div className="ql-help-box">
                          Per defecte es posa la data d'avui. Canvia-la només si registres una sessió d'un altre dia.
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
                      Estat d'ànim
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
                    {QUICK_TAGS.map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        className="ql-tag"
                        onClick={() => insertTag(t.insert)}
                      >
                        <span className="ql-tag-emoji">{t.icon}</span>
                        {t.label}
                      </button>
                    ))}
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
