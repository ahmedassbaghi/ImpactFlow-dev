/**
 * QuickSessionLogger — Redisseny UX Sprint 2
 * Objectiu: registrar una sessió en < 60 segons.
 * 4 passos: Selecció → Puntuació → Nota & Mood → Confirm
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { listMicroGoals } from "../../api/microGoals";
import { listParticipants } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { createSession } from "../../api/sessions";
import { useLocalDraft } from "../../hooks/useLocalDraft";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DIMS = [
  { key: "academicScore", label: "Acadèmic", icon: "📚", color: "var(--dim-academic)" },
  { key: "cognitiveScore", label: "Cognitiu", icon: "🧠", color: "var(--dim-cognitive)" },
  { key: "socialScore", label: "Social", icon: "🤝", color: "var(--dim-social)" },
  { key: "integrationScore", label: "Integració", icon: "🌍", color: "var(--dim-integration)" },
] as const;

const MOOD_OPTIONS = [
  { value: "very_low", emoji: "😞", label: "Molt baixa" },
  { value: "low", emoji: "😐", label: "Baixa" },
  { value: "neutral", emoji: "🙂", label: "Neutral" },
  { value: "good", emoji: "😊", label: "Bona" },
  { value: "excellent", emoji: "🤩", label: "Excel·lent" },
];

const STAR_LABELS = ["", "Molt baix", "Baix", "Regular", "Bé", "Excel·lent"];

const SESSION_TYPES = [
  { value: "group", label: "Grupal" },
  { value: "individual", label: "Individual" },
  { value: "workshop", label: "Taller" },
  { value: "follow_up", label: "Seguiment" },
];

const ATTENDANCE_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "late", label: "Tard" },
  { value: "absent_justified", label: "Absent (justif.)" },
  { value: "absent_unjustified", label: "Absent (injust.)" },
];

type DimKey = "academicScore" | "cognitiveScore" | "socialScore" | "integrationScore";

interface ObsState {
  academicScore: number;
  cognitiveScore: number;
  socialScore: number;
  integrationScore: number;
  qualitativeNote: string;
  mood: string;
  attendance: string;
  microGoalIds: string[];
}

const defaultObs = (): ObsState => ({
  academicScore: 0,
  cognitiveScore: 0,
  socialScore: 0,
  integrationScore: 0,
  qualitativeNote: "",
  mood: "neutral",
  attendance: "present",
  microGoalIds: [],
});

interface FormState {
  programId: string;
  sessionType: string;
  sessionDate: string;
  durationMinutes: string;
  notes: string;
  observations: Record<string, ObsState>;
}

const today = () => new Date().toISOString().slice(0, 10);

const defaultForm = (): FormState => ({
  programId: "",
  sessionType: "group",
  sessionDate: today(),
  durationMinutes: "45",
  notes: "",
  observations: {},
});

// ─────────────────────────────────────────────────────────────────────────────
// StarRating
// ─────────────────────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: "0.2rem" }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            title={STAR_LABELS[star]}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(value === star ? 0 : star)}
            style={{
              width: 36,
              height: 36,
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "1.4rem",
              color: filled ? color : "var(--surface-3)",
              padding: 0,
              transition: "color 0.1s, transform 0.1s",
              transform: filled ? "scale(1.1)" : "scale(1)",
            }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export function QuickSessionLogger({ onClose }: { onClose?: () => void }) {
  const [form, setForm, clearForm] = useLocalDraft<FormState>("quick-session-logger-v2", defaultForm);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [activeParticipant, setActiveParticipant] = useState<string>("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const qc = useQueryClient();

  const programsQ = useQuery({ queryKey: ["programs"], queryFn: listPrograms });
  const participantsQ = useQuery({
    queryKey: ["participants", form.programId],
    queryFn: () => listParticipants(form.programId || undefined),
    enabled: !!form.programId,
  });
  const goalsQ = useQuery({
    queryKey: ["micro-goals", form.programId],
    queryFn: () => listMicroGoals({ program_id: form.programId }),
    enabled: !!form.programId,
  });

  const participants = participantsQ.data ?? [];
  const goals = goalsQ.data ?? [];

  const filteredParticipants = useMemo(
    () =>
      participants.filter(
        (p) =>
          !selectedParticipants.includes(p.id) &&
          (p.first_name.toLowerCase().includes(participantSearch.toLowerCase()) ||
            p.code.toLowerCase().includes(participantSearch.toLowerCase()))
      ),
    [participants, selectedParticipants, participantSearch]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const observations = selectedParticipants
        .map((pid) => {
          const obs = form.observations[pid] ?? defaultObs();
          return {
            participant_id: pid,
            academic_score: obs.academicScore || null,
            cognitive_score: obs.cognitiveScore || null,
            social_score: obs.socialScore || null,
            integration_score: obs.integrationScore || null,
            qualitative_note: obs.qualitativeNote || null,
            mood_indicator: obs.mood,
            attendance_status: obs.attendance,
            micro_goals_completed: obs.microGoalIds,
          };
        })
        .filter((o) =>
          [o.academic_score, o.cognitive_score, o.social_score, o.integration_score].some(
            (v) => v !== null
          )
        );

      if (observations.length === 0) {
        throw new Error("Cal puntuar almenys una dimensió per a un participant.");
      }

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
      setActiveParticipant("");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["participants"] });
      setTimeout(() => {
        setSaved(false);
        onClose?.();
      }, 2500);
    },
    onError: (err: Error) => {
      setSaveError(err.message || "Error en guardar la sessió.");
    },
  });

  const setObs = (pid: string, key: keyof ObsState, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      observations: {
        ...prev.observations,
        [pid]: { ...(prev.observations[pid] ?? defaultObs()), [key]: value },
      },
    }));
  };

  // When a program is selected, reset participants
  const handleProgramChange = (programId: string) => {
    setForm((prev) => ({ ...prev, programId, observations: {} }));
    setSelectedParticipants([]);
    setActiveParticipant("");
  };

  const addParticipant = (id: string) => {
    setSelectedParticipants((prev) => [...prev, id]);
    setActiveParticipant(id);
    setParticipantSearch("");
    if (!(id in form.observations)) {
      setForm((prev) => ({
        ...prev,
        observations: { ...prev.observations, [id]: defaultObs() },
      }));
    }
  };

  const removeParticipant = (id: string) => {
    setSelectedParticipants((prev) => prev.filter((p) => p !== id));
    if (activeParticipant === id) {
      const remaining = selectedParticipants.filter((p) => p !== id);
      setActiveParticipant(remaining[0] ?? "");
    }
  };

  const participantName = (id: string) => {
    const p = participants.find((p) => p.id === id);
    return p ? `${p.first_name} (${p.code})` : id.slice(0, 8);
  };

  const participantInitials = (id: string) => {
    const p = participants.find((p) => p.id === id);
    return p ? p.first_name[0].toUpperCase() : "?";
  };

  const currentObs = form.observations[activeParticipant] ?? defaultObs();

  if (saved) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "3rem",
          color: "var(--risk-low)",
        }}
      >
        <div style={{ fontSize: "3rem" }}>✓</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>Sessió guardada</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Anàlisi IA en procés...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ── STEP 1: Programa + metadades ─────────────────────────────────── */}
      <section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            gap: "0.5rem",
            alignItems: "end",
          }}
        >
          {/* Programa */}
          <div>
            <label style={labelStyle}>Programa</label>
            <select
              value={form.programId}
              onChange={(e) => handleProgramChange(e.target.value)}
              style={selectStyle}
            >
              <option value="">Selecciona programa...</option>
              {(programsQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tipus */}
          <div>
            <label style={labelStyle}>Tipus</label>
            <select
              value={form.sessionType}
              onChange={(e) => setForm((prev) => ({ ...prev, sessionType: e.target.value }))}
              style={selectStyle}
            >
              {SESSION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Data */}
          <div>
            <label style={labelStyle}>Data</label>
            <input
              type="date"
              value={form.sessionDate}
              onChange={(e) => setForm((prev) => ({ ...prev, sessionDate: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Durada */}
          <div>
            <label style={labelStyle}>Minuts</label>
            <input
              type="number"
              value={form.durationMinutes}
              min={5}
              max={180}
              onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: e.target.value }))}
              style={{ ...inputStyle, width: 70 }}
            />
          </div>
        </div>
      </section>

      {/* ── STEP 2: Selecció de participants ─────────────────────────────── */}
      {form.programId && (
        <section>
          <label style={labelStyle}>Participants</label>

          {/* Selected chips */}
          {selectedParticipants.length > 0 && (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              {selectedParticipants.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setActiveParticipant(pid)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.25rem 0.6rem 0.25rem 0.35rem",
                    borderRadius: 999,
                    border: `2px solid ${activeParticipant === pid ? "var(--brand-500)" : "var(--border)"}`,
                    background:
                      activeParticipant === pid ? "var(--brand-100)" : "var(--surface-1)",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color:
                      activeParticipant === pid ? "var(--brand-700)" : "var(--text-secondary)",
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "var(--brand-500)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                    }}
                  >
                    {participantInitials(pid)}
                  </span>
                  {participantName(pid)}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      removeParticipant(pid);
                    }}
                    style={{
                      marginLeft: 2,
                      color: "var(--text-muted)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Search to add */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Cerca participant per nom o codi..."
              value={participantSearch}
              onChange={(e) => setParticipantSearch(e.target.value)}
              style={inputStyle}
            />
            {participantSearch && filteredParticipants.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "var(--surface-0)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  zIndex: 50,
                  maxHeight: 180,
                  overflowY: "auto",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              >
                {filteredParticipants.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addParticipant(p.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      color: "var(--text-primary)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--surface-1)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "none")
                    }
                  >
                    <strong>{p.first_name}</strong>{" "}
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                      {p.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── STEP 3: Puntuació del participant actiu ───────────────────────── */}
      {activeParticipant && (
        <section
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "1rem 1.1rem",
          }}
        >
          <div
            style={{
              marginBottom: "0.75rem",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: "var(--text-secondary)",
            }}
          >
            Avaluant: <span style={{ color: "var(--text-primary)" }}>{participantName(activeParticipant)}</span>
          </div>

          {/* Dimension scores */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.9rem" }}>
            {DIMS.map(({ key, label, icon, color }) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <span
                  style={{
                    minWidth: 110,
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  {icon} {label}
                </span>
                <StarRating
                  value={currentObs[key as DimKey] as number}
                  onChange={(v) => setObs(activeParticipant, key as DimKey, v)}
                  color={color}
                />
                <span
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    minWidth: 80,
                  }}
                >
                  {(currentObs[key as DimKey] as number)
                    ? STAR_LABELS[currentObs[key as DimKey] as number]
                    : "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Attendance + Mood */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}
          >
            <div>
              <label style={labelStyle}>Assistència</label>
              <select
                value={currentObs.attendance}
                onChange={(e) => setObs(activeParticipant, "attendance", e.target.value)}
                style={selectStyle}
              >
                {ATTENDANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Estat anímic</label>
              <div style={{ display: "flex", gap: "0.3rem", marginTop: 4 }}>
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    title={m.label}
                    onClick={() => setObs(activeParticipant, "mood", m.value)}
                    style={{
                      fontSize: "1.35rem",
                      border:
                        currentObs.mood === m.value
                          ? "2px solid var(--brand-500)"
                          : "2px solid transparent",
                      borderRadius: 8,
                      background:
                        currentObs.mood === m.value ? "var(--brand-100)" : "none",
                      cursor: "pointer",
                      padding: "0.15rem 0.3rem",
                      transition: "border 0.1s",
                    }}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Qualitative note */}
          <div>
            <label style={labelStyle}>
              Nota (opcional) — l'IA extraurà etiquetes automàticament
            </label>
            <textarea
              value={currentObs.qualitativeNote}
              onChange={(e) => setObs(activeParticipant, "qualitativeNote", e.target.value)}
              placeholder={`Avui, ${participantName(activeParticipant).split(" ")[0]} ha...`}
              rows={2}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Micro-goals */}
          {goals.length > 0 && (
            <div style={{ marginTop: "0.6rem" }}>
              <label style={labelStyle}>Micro-objectius completats</label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  maxHeight: 140,
                  overflowY: "auto",
                }}
              >
                {goals.map((g) => {
                  const checked = currentObs.microGoalIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.35rem 0.5rem",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: checked ? "var(--brand-100)" : "none",
                        fontSize: "0.83rem",
                        color: checked ? "var(--brand-700)" : "var(--text-secondary)",
                        fontWeight: checked ? 600 : 400,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const ids = checked
                            ? currentObs.microGoalIds.filter((id) => id !== g.id)
                            : [...currentObs.microGoalIds, g.id];
                          setObs(activeParticipant, "microGoalIds", ids);
                        }}
                        style={{ accentColor: "var(--brand-500)" }}
                      />
                      {g.title}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nav between participants */}
          {selectedParticipants.length > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "0.75rem",
                gap: "0.5rem",
              }}
            >
              {selectedParticipants.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setActiveParticipant(pid)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: `2px solid ${activeParticipant === pid ? "var(--brand-500)" : "var(--border)"}`,
                    background:
                      activeParticipant === pid ? "var(--brand-500)" : "var(--surface-1)",
                    color: activeParticipant === pid ? "white" : "var(--text-secondary)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {participantInitials(pid)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Session notes ─────────────────────────────────────────────────── */}
      {selectedParticipants.length > 0 && (
        <section>
          <label style={labelStyle}>Nota general de la sessió (opcional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Comentaris generals sobre la sessió..."
            rows={2}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          />
        </section>
      )}

      {/* ── SAVE BUTTON ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {saveError && (
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: 8,
              background: "var(--risk-high-bg)",
              color: "var(--risk-high)",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            {saveError}
          </div>
        )}
        <button
          type="button"
          disabled={saveMutation.isPending || selectedParticipants.length === 0 || !form.programId}
          onClick={() => {
            setSaveError("");
            saveMutation.mutate();
          }}
          style={{
            padding: "0.85rem",
            borderRadius: 10,
            border: "none",
            background:
              saveMutation.isPending || selectedParticipants.length === 0 || !form.programId
                ? "var(--surface-3)"
                : "var(--brand-500)",
            color:
              saveMutation.isPending || selectedParticipants.length === 0 || !form.programId
                ? "var(--text-muted)"
                : "white",
            fontSize: "0.95rem",
            fontWeight: 700,
            cursor:
              saveMutation.isPending || selectedParticipants.length === 0 || !form.programId
                ? "not-allowed"
                : "pointer",
            transition: "background 0.15s",
          }}
        >
          {saveMutation.isPending ? "Guardant..." : "Guardar sessió →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared micro-styles
// ─────────────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-muted)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-0)",
  fontSize: "0.88rem",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};
