import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Brain, ClipboardCheck, Globe, Search, Users2, X } from "lucide-react";
import { createFollowUpAssessment } from "../../api/assessments";
import { listParticipants } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { PremiumSelect } from "../../components/voluntari/PremiumSelect";
import { VolunteerPageHeader } from "../../components/voluntari/VolunteerPageHeader";
import { VolunteerParticipantRow } from "../../components/voluntari/VolunteerParticipantRow";
import { toast } from "../../stores/toastStore";

const DIMS = [
  { key: "academic_score" as const, label: "Acadèmic", Icon: BookOpen, color: "#3b82f6" },
  { key: "cognitive_score" as const, label: "Cognitiu", Icon: Brain, color: "#8b5cf6" },
  { key: "social_score" as const, label: "Social", Icon: Users2, color: "#10b981" },
  { key: "integration_score" as const, label: "Integració", Icon: Globe, color: "#f58220" },
] as const;

type DimKey = (typeof DIMS)[number]["key"];

export default function SeguimentPage() {
  const qc = useQueryClient();
  const [programId, setProgramId] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [scores, setScores] = useState<Partial<Record<DimKey, number>>>({});
  const [notes, setNotes] = useState("");

  const { data: programs = [] } = useQuery({
    queryKey: ["programs"],
    queryFn: () => listPrograms(true),
  });

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ["participants", "seguiment", programId],
    queryFn: () => listParticipants({ programId }),
    enabled: !!programId,
  });

  useEffect(() => {
    if (!programId && programs.length > 0) {
      setProgramId(programs[0].id);
    }
  }, [programs, programId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants.filter(
      (p) =>
        !q ||
        p.first_name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
    );
  }, [participants, search]);

  const openAssessment = (id: string, name: string) => {
    setParticipantId(id);
    setParticipantName(name);
    setScores({});
    setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setParticipantId("");
    setParticipantName("");
  };

  const allScoresSet = DIMS.every((d) => scores[d.key] != null);
  const canSave = programId && participantId && allScoresSet;

  const save = useMutation({
    mutationFn: () =>
      createFollowUpAssessment({
        participant_id: participantId,
        program_id: programId,
        assessment_date: date,
        period_label: "seguiment",
        academic_score: scores.academic_score!,
        cognitive_score: scores.cognitive_score!,
        social_score: scores.social_score!,
        integration_score: scores.integration_score!,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Seguiment registrat", "S'ha desat la prova de seguiment correctament.");
      qc.invalidateQueries({ queryKey: ["professional-dashboard"] });
      qc.invalidateQueries({ queryKey: ["participant-evolution"] });
      closeModal();
    },
    onError: () => {
      toast.error("No s'ha pogut desar", "Revisa la connexió i torna-ho a provar.");
    },
  });

  const programOptions = [
    { value: "", label: "Selecciona un programa…" },
    ...programs.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="vol-page">
      <VolunteerPageHeader
        title="Seguiment"
        subtitle="Prova de seguiment trimestral: valora cada dimensió de 0 a 10 per mesurar l'evolució de l'alumne."
      />

      <div className="vol-info-card" role="note">
        <ClipboardCheck size={22} strokeWidth={2} className="vol-info-icon" aria-hidden />
        <div>
          <strong>Què és això?</strong>
          <p>
            És una avaluació estructurada (no una sessió diària). Tria el programa, prem{" "}
            <strong>Avaluar</strong> a l'alumne i marca les quatre dimensions.
          </p>
        </div>
      </div>

      <div className="vol-filter-strip vol-filter-strip--compact">
        <PremiumSelect
          label="Programa"
          value={programId}
          onChange={setProgramId}
          options={programOptions}
        />
        <label className="premium-search">
          <span className="premium-select-label">Cerca</span>
          <span className="premium-search-field">
            <Search size={18} strokeWidth={2} className="premium-search-icon" aria-hidden />
            <input
              type="search"
              className="premium-search-input"
              placeholder="Nom o codi…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!programId}
            />
          </span>
        </label>
      </div>

      {!programId ? (
        <p className="vol-hint-banner" role="status">
          Selecciona un programa per veure els alumnes a avaluar.
        </p>
      ) : (
        <section className="vol-list-section" aria-labelledby="seg-list-heading">
          <div className="vol-list-section-head">
            <h2 id="seg-list-heading" className="vol-list-section-title">
              Alumnes a avaluar
            </h2>
            <span className="vol-list-count">{filtered.length}</span>
          </div>

          {isLoading ? (
            <p className="vol-empty">Carregant…</p>
          ) : filtered.length === 0 ? (
            <p className="vol-empty">Cap alumne en aquest programa.</p>
          ) : (
            <div className="vol-person-list">
              {filtered.map((p) => (
                <VolunteerParticipantRow
                  key={p.id}
                  id={p.id}
                  firstName={p.first_name}
                  code={p.code}
                  schoolAbbreviation={p.school_abbreviation}
                  schoolName={p.school_name}
                  actionLabel="Avaluar"
                  onAction={() => openAssessment(p.id, p.first_name)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {modalOpen && (
        <div
          className="vol-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seg-modal-title"
          onClick={closeModal}
        >
          <div className="vol-modal-panel vol-modal-panel--form" onClick={(e) => e.stopPropagation()}>
            <div className="vol-modal-header">
              <div>
                <h2 id="seg-modal-title" className="vol-modal-title">
                  Prova de seguiment
                </h2>
                <p className="vol-modal-sub">{participantName}</p>
              </div>
              <button
                type="button"
                className="vol-modal-close"
                onClick={closeModal}
                aria-label="Tancar"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <form
              className="vol-modal-body vol-seg-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSave) save.mutate();
              }}
            >
              <label className="premium-select-label" htmlFor="seg-date">
                Data de l'avaluació
              </label>
              <input
                id="seg-date"
                type="date"
                className="premium-search-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              {DIMS.map(({ key, label, Icon, color }) => (
                <fieldset key={key} className="vol-seg-dim">
                  <legend className="vol-seg-dim-legend" style={{ color }}>
                    <Icon size={16} strokeWidth={2} aria-hidden />
                    {label}
                  </legend>
                  <div className="vol-score-grid" role="group" aria-label={`${label} 0 a 10`}>
                    {Array.from({ length: 11 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        className={`vol-score-btn${scores[key] === n ? " is-active" : ""}`}
                        style={
                          scores[key] === n
                            ? { borderColor: color, background: `${color}18`, color }
                            : undefined
                        }
                        onClick={() => setScores((s) => ({ ...s, [key]: n }))}
                        aria-pressed={scores[key] === n}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}

              <label className="premium-select-label" htmlFor="seg-notes">
                Observacions (opcional)
              </label>
              <textarea
                id="seg-notes"
                className="premium-search-input vol-seg-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Comentaris sobre l'evolució…"
              />

              {!allScoresSet && (
                <p className="vol-seg-warn" role="status">
                  Marca una puntuació (0–10) a cada dimensió per poder desar.
                </p>
              )}

              <button
                type="submit"
                className="vol-cta-primary"
                disabled={!canSave || save.isPending}
              >
                {save.isPending ? "Desant…" : "Desar seguiment"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
