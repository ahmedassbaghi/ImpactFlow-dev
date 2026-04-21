import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listMicroGoals } from "../../api/microGoals";
import { listParticipants } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { createSession } from "../../api/sessions";
import { useLocalDraft } from "../../hooks/useLocalDraft";

const moodOptions = [
  { value: "very_low", label: "Muy baja" },
  { value: "low", label: "Baja" },
  { value: "neutral", label: "Neutral" },
  { value: "good", label: "Buena" },
  { value: "excellent", label: "Excelente" },
];

const sessionTypeOptions = [
  { value: "group", label: "Grupal" },
  { value: "individual", label: "Individual" },
  { value: "workshop", label: "Taller" },
  { value: "follow_up", label: "Seguimiento" },
];

const attendanceOptions = [
  { value: "present", label: "Asistencia completa" },
  { value: "late", label: "Llegó tarde" },
  { value: "absent_justified", label: "Ausencia justificada" },
  { value: "absent_unjustified", label: "Ausencia injustificada" },
];

const scoreFields = [
  { key: "academicScore", label: "Académico" },
  { key: "cognitiveScore", label: "Cognitivo" },
  { key: "socialScore", label: "Social" },
  { key: "integrationScore", label: "Integración" },
] as const;
const scoreValues = [1, 2, 3, 4, 5] as const;

const quickSessionDefaults = {
  programId: "",
  programInput: "",
  participantId: "",
  participantInput: "",
  sessionType: "group",
  durationMinutes: "45",
  note: "",
  qualitativeNote: "",
  attendanceStatus: "present",
  moodIndicator: "neutral",
  academicScore: "",
  cognitiveScore: "",
  socialScore: "",
  integrationScore: "",
};

function toOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function QuickSessionLogger() {
  const { value: draft, setValue: setDraft, clear } = useLocalDraft<{
    programId: string;
    programInput: string;
    participantId: string;
    participantInput: string;
    sessionType: string;
    durationMinutes: string;
    note: string;
    qualitativeNote: string;
    attendanceStatus: string;
    moodIndicator: string;
    academicScore: string;
    cognitiveScore: string;
    socialScore: string;
    integrationScore: string;
  }>("if_quick_session_draft", quickSessionDefaults);
  const safeDraft = { ...quickSessionDefaults, ...draft };
  const [saved, setSaved] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [completedGoalIds, setCompletedGoalIds] = useState<string[]>([]);

  const { data: participants, isLoading: participantsLoading, isError: participantsError } = useQuery({
    queryKey: ["participants", "quick-logger"],
    queryFn: () => listParticipants(),
  });

  const { data: programs, isLoading: programsLoading, isError: programsError } = useQuery({
    queryKey: ["programs", "quick-logger"],
    queryFn: () => listPrograms(true),
  });

  const programChoices = useMemo(
    () =>
      (programs ?? []).map((program) => ({
        id: program.id,
        label: `${program.name} · ${program.id.slice(0, 8)}`,
        search: `${program.name} ${program.id}`.toLowerCase(),
      })),
    [programs]
  );

  const participantChoices = useMemo(
    () =>
      (participants ?? []).map((participant) => ({
        id: participant.id,
        label: `${participant.first_name} · ${participant.code}`,
        search: `${participant.first_name} ${participant.code} ${participant.id}`.toLowerCase(),
      })),
    [participants]
  );

  const resolveChoice = (rawValue: string, choices: Array<{ id: string; label: string; search: string }>) => {
    const query = normalizeText(rawValue);
    if (!query) return null;

    const exact = choices.find((item) => normalizeText(item.id) === query || normalizeText(item.label) === query);
    if (exact) return exact;

    const partial = choices.find((item) => item.search.includes(query));
    return partial ?? null;
  };

  const filteredParticipants = useMemo(() => {
    const source = participantChoices;
    if (!safeDraft.participantInput.trim()) return source.slice(0, 20);
    const query = normalizeText(safeDraft.participantInput);
    return source.filter((item) => item.search.includes(query)).slice(0, 20);
  }, [participantChoices, safeDraft.participantInput]);

  const filteredPrograms = useMemo(() => {
    const source = programChoices;
    if (!safeDraft.programInput.trim()) return source.slice(0, 20);
    const query = normalizeText(safeDraft.programInput);
    return source.filter((item) => item.search.includes(query)).slice(0, 20);
  }, [programChoices, safeDraft.programInput]);

  const selectedProgram = useMemo(
    () => programChoices.find((item) => item.id === safeDraft.programId) ?? null,
    [programChoices, safeDraft.programId]
  );

  const selectedParticipant = useMemo(
    () => participantChoices.find((item) => item.id === safeDraft.participantId) ?? null,
    [participantChoices, safeDraft.participantId]
  );

  const { data: participantGoals } = useQuery({
    queryKey: ["micro-goals", "quick-logger", selectedProgram?.id],
    queryFn: () =>
      listMicroGoals({
        programId: selectedProgram?.id,
        activeOnly: true,
      }),
    enabled: !!selectedProgram?.id,
  });

  const hasAnyScore = useMemo(
    () =>
      [safeDraft.academicScore, safeDraft.cognitiveScore, safeDraft.socialScore, safeDraft.integrationScore].some(
        (v) => Number(v) > 0
      ),
    [safeDraft]
  );

  const mutation = useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      setCompletedGoalIds([]);
      clear();
      setValidationMessage("");
    },
  });

  const submit = () => {
    const resolvedProgram = resolveChoice(safeDraft.programInput, programChoices);
    const resolvedParticipant = resolveChoice(safeDraft.participantInput, participantChoices);

    if (!resolvedProgram) {
      setValidationMessage("Selecciona o escribe el ID del programa antes de guardar.");
      return;
    }
    if (!resolvedParticipant) {
      setValidationMessage("Selecciona un participante para continuar.");
      return;
    }

    setValidationMessage("");
    mutation.mutate({
      program_id: resolvedProgram.id,
      session_date: new Date().toISOString().slice(0, 10),
      session_type: safeDraft.sessionType,
      duration_minutes: toOptionalNumber(safeDraft.durationMinutes),
      notes: safeDraft.note || undefined,
      observations: [
        {
          participant_id: resolvedParticipant.id,
          academic_score: toOptionalNumber(safeDraft.academicScore),
          cognitive_score: toOptionalNumber(safeDraft.cognitiveScore),
          social_score: toOptionalNumber(safeDraft.socialScore),
          integration_score: toOptionalNumber(safeDraft.integrationScore),
          qualitative_note: safeDraft.qualitativeNote || undefined,
          mood_indicator: safeDraft.moodIndicator,
          attendance_status: safeDraft.attendanceStatus,
        },
      ],
      micro_goal_completions: completedGoalIds.map((goalId) => ({ goal_id: goalId })),
    });
  };

  return (
    <div className="card">
      <h2>Registro guiado de sesión</h2>
      <p className="muted">
        Completa este registro en menos de 2 minutos. El borrador se autoguarda en local.
      </p>
      <div className="logger-step-grid" style={{ marginTop: "1rem" }}>
        <div className="logger-step">
          <span className="chip">Paso 1</span>
          <h3>Configura la sesión</h3>
          <p className="muted">Elige programa, tipo y duración. Todo en menos de 20 segundos.</p>
          <div className="grid grid-2">
            <label>
              Programa
              <div className="combo-field">
                <input
                  list="program-options"
                  value={safeDraft.programInput}
                  onChange={(e) => {
                    const nextInput = e.target.value;
                    const resolved = resolveChoice(nextInput, programChoices);
                    setDraft((prev) => ({
                      ...prev,
                      programInput: nextInput,
                      programId: resolved?.id ?? "",
                    }));
                  }}
                  placeholder="Busca por nombre o pega ID"
                  disabled={programsLoading || programsError}
                />
                <datalist id="program-options">
                  {filteredPrograms.map((item) => (
                    <option key={item.id} value={item.label}>
                      {item.id}
                    </option>
                  ))}
                </datalist>
              </div>
            </label>
            <label>
              Tipo de sesión
              <select
                value={safeDraft.sessionType}
                onChange={(e) => setDraft((prev) => ({ ...prev, sessionType: e.target.value }))}
              >
                {sessionTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duración (minutos)
              <input
                type="number"
                min={10}
                max={180}
                step={5}
                value={safeDraft.durationMinutes}
                onChange={(e) => setDraft((prev) => ({ ...prev, durationMinutes: e.target.value }))}
              />
            </label>
          </div>
          {selectedProgram && <p className="combo-selected">Programa seleccionado: {selectedProgram.label}</p>}
          {programsError && (
            <p style={{ color: "#dc2626" }}>
              No se pudieron cargar programas. Puedes pegar un ID exacto para continuar.
            </p>
          )}
        </div>

        <div className="logger-step">
          <span className="chip">Paso 2</span>
          <h3>Selecciona participante</h3>
          <p className="muted">Un solo campo con búsqueda inteligente por nombre, código o ID.</p>
          <label>
            Participante
            <div className="combo-field">
              <input
                list="participant-options"
                value={safeDraft.participantInput}
                onChange={(e) => {
                  const nextInput = e.target.value;
                  const resolved = resolveChoice(nextInput, participantChoices);
                  setDraft((prev) => ({
                    ...prev,
                    participantInput: nextInput,
                    participantId: resolved?.id ?? "",
                  }));
                }}
                placeholder="Ej: Participant-12 o NRN-2024-012"
                disabled={participantsLoading || participantsError}
              />
              <datalist id="participant-options">
                {filteredParticipants.map((item) => (
                  <option key={item.id} value={item.label}>
                    {item.id}
                  </option>
                ))}
              </datalist>
            </div>
          </label>
          {selectedParticipant && <p className="combo-selected">Participante seleccionado: {selectedParticipant.label}</p>}
          {participantsError && (
            <p style={{ color: "#dc2626" }}>
              No se pudo cargar el listado. Revisa la sesión o vuelve a intentar en unos segundos.
            </p>
          )}
        </div>
      </div>

      <div className="logger-step-grid" style={{ marginTop: "1rem" }}>
        <div className="logger-step">
          <span className="chip">Paso 3</span>
          <h3>Registra evidencia clave</h3>
          <p className="muted">Rellena solo lo esencial. El resto es opcional para no bloquear tu trabajo.</p>
          <div className="grid grid-3">
            {scoreFields.map((field) => (
              <label key={field.key}>
                {field.label}
                <div className="star-rating">
                  {scoreValues.map((score) => {
                    const currentValue = Number(safeDraft[field.key] || 0);
                    const active = currentValue >= score;
                    return (
                      <button
                        key={`${field.key}-${score}`}
                        type="button"
                        className={`star-btn ${active ? "active" : ""}`}
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            [field.key]: String(score),
                          }))
                        }
                        aria-label={`${field.label}: ${score} estrellas`}
                        title={`${score}/5`}
                      >
                        ★
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="star-clear-btn"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        [field.key]: "",
                      }))
                    }
                  >
                    Limpiar
                  </button>
                </div>
              </label>
            ))}
          </div>
          <div className="grid grid-2" style={{ marginTop: "1rem" }}>
            <label>
              Nota de sesión general
              <textarea
                value={safeDraft.note}
                onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))}
                rows={3}
                placeholder="Resumen breve de lo trabajado hoy"
              />
            </label>
            <label>
              Evidencia cualitativa
              <textarea
                value={safeDraft.qualitativeNote}
                onChange={(e) => setDraft((prev) => ({ ...prev, qualitativeNote: e.target.value }))}
                rows={3}
                placeholder="Cambio observable o situación relevante"
              />
            </label>
          </div>
          <div className="grid grid-2" style={{ marginTop: "1rem" }}>
            <label>
              Estado de ánimo
              <select
                value={safeDraft.moodIndicator}
                onChange={(e) => setDraft((prev) => ({ ...prev, moodIndicator: e.target.value }))}
              >
                {moodOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Asistencia
              <select
                value={safeDraft.attendanceStatus}
                onChange={(e) => setDraft((prev) => ({ ...prev, attendanceStatus: e.target.value }))}
              >
                {attendanceOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <div className="dash-row" style={{ borderBottom: "none", padding: 0 }}>
              <strong>Microobjetivos logrados en esta sesión</strong>
              <span className="muted">Marca los objetivos con evidencia de logro hoy.</span>
            </div>
            <div className="grid" style={{ marginTop: "0.5rem" }}>
              {(participantGoals ?? []).map((goal) => (
                <label key={goal.id} className="dash-row" style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.5rem 0.7rem" }}>
                  <span>
                    <strong>{goal.title}</strong>
                    <span className="muted" style={{ marginLeft: "0.45rem" }}>
                      {goal.dimension} · Dificultad {goal.difficulty}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={completedGoalIds.includes(goal.id)}
                    onChange={(e) =>
                      setCompletedGoalIds((prev) =>
                        e.target.checked ? [...prev, goal.id] : prev.filter((id) => id !== goal.id)
                      )
                    }
                    style={{ width: "18px", height: "18px" }}
                  />
                </label>
              ))}
              {(participantGoals ?? []).length === 0 && (
                <p className="muted">No hay microobjetivos globales activos para este programa.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem" }}>
        <button onClick={submit} disabled={mutation.isPending || participantsLoading || programsLoading}>
          {mutation.isPending ? "Guardando..." : "Guardar sesión"}
        </button>
        <button className="btn-secondary" onClick={clear}>
          Limpiar borrador
        </button>
      </div>

      {validationMessage && <p style={{ color: "#dc2626" }}>{validationMessage}</p>}
      {!hasAnyScore && <p className="muted">Sin puntuaciones cuantitativas en esta sesión.</p>}

      {saved && (
        <div className="toast toast-success" role="status" aria-live="polite">
          Sesion guardada correctamente.
        </div>
      )}
      {mutation.isError && <p style={{ color: "#dc2626" }}>Error guardando sesión.</p>}
    </div>
  );
}
