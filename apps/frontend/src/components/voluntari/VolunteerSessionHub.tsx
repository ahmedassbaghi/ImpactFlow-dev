import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { listParticipants } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { QuickSessionLogger } from "../sessions/QuickSessionLogger";
import { PremiumSelect } from "./PremiumSelect";
import { VolunteerParticipantRow } from "./VolunteerParticipantRow";

export function VolunteerSessionHub() {
  const [programId, setProgramId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");
  const [activeParticipantId, setActiveParticipantId] = useState<string | undefined>();

  const programsQ = useQuery({ queryKey: ["programs"], queryFn: () => listPrograms(true) });
  const schoolsQ = useQuery({ queryKey: ["schools"], queryFn: listSchools });
  const participantsQ = useQuery({
    queryKey: ["participants", "vol-hub", programId, schoolId],
    queryFn: () =>
      listParticipants({
        programId: programId || undefined,
        schoolId: schoolId || undefined,
      }),
    enabled: !!programId,
  });

  const programs = programsQ.data ?? [];
  const schools = schoolsQ.data ?? [];
  const participants = participantsQ.data ?? [];

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

  const openForParticipant = (participantId: string) => {
    if (!programId) return;
    setActiveParticipantId(participantId);
  };

  const closeRegister = () => {
    setActiveParticipantId(undefined);
  };

  const activeParticipant = filtered.find((p) => p.id === activeParticipantId);

  const programOptions = [
    { value: "", label: "Selecciona un programa…" },
    ...programs.map((p) => ({ value: p.id, label: p.name })),
  ];

  const schoolOptions = [
    { value: "", label: "Totes les escoles" },
    ...schools.map((s) => ({ value: s.id, label: `${s.abbreviation} — ${s.name}` })),
  ];

  // Si hay un participante activo, mostramos el formulario de registro
  if (activeParticipantId && programId) {
    return (
      <div className="vol-page">
        <div className="vol-reg-panel vol-reg-panel--form">
          <div className="vol-reg-form-head">
            <button
              type="button"
              className="vol-btn-back"
              onClick={closeRegister}
              aria-label="Tornar a la llista"
            >
              <ChevronLeft size={18} strokeWidth={2.5} aria-hidden />
              Tornar a la llista
            </button>
            <div className="vol-reg-form-head-text">
              <h2 className="vol-reg-form-title">Registrar sessió</h2>
              {activeParticipant && (
                <p className="vol-reg-form-sub">
                  {activeParticipant.first_name}
                  {activeParticipant.school_abbreviation
                    ? ` · ${activeParticipant.school_abbreviation}`
                    : ""}
                </p>
              )}
            </div>
          </div>
          <div className="vol-reg-form-body">
            <QuickSessionLogger
              compact
              volunteerMode
              onClose={closeRegister}
              initialParticipantIds={[activeParticipantId]}
              lockProgramId={programId}
            />
          </div>
        </div>
      </div>
    );
  }

  // Vista principal: lista de alumnos
  return (
    <div className="vol-page">
      <header className="vol-page-head">
        <h1 className="vol-page-title">Registre de sessió</h1>
        <p className="vol-page-sub">
          Selecciona un programa i una escola, busca l'alumne i prem <strong>Registrar</strong>.
        </p>
      </header>

      <div className="vol-filter-strip">
        <PremiumSelect
          label="Programa"
          value={programId}
          onChange={(id) => {
            setProgramId(id);
            setSchoolId("");
          }}
          options={programOptions}
          placeholder="Selecciona un programa…"
        />
        <PremiumSelect
          label="Escola"
          value={schoolId}
          onChange={setSchoolId}
          options={schoolOptions}
          disabled={!programId}
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
          Selecciona un programa per veure els alumnes assignats i registrar sessions.
        </p>
      ) : participantsQ.isError ? (
        <p className="vol-empty" role="alert">
          No s'han pogut carregar els alumnes. Comprova la connexió amb el servidor.
        </p>
      ) : (
        <section className="vol-list-section" aria-labelledby="vol-reg-list-heading">
          <div className="vol-list-section-head">
            <h2 id="vol-reg-list-heading" className="vol-list-section-title">
              Alumnes assignats
            </h2>
            <span className="vol-list-count">{filtered.length}</span>
          </div>

          {participantsQ.isLoading ? (
            <p className="vol-empty">Carregant alumnes…</p>
          ) : filtered.length === 0 ? (
            <p className="vol-empty">
              {search || schoolId
                ? "Cap alumne coincideix amb els filtres."
                : "No tens alumnes assignats en aquest programa. Demana a la coordinadora que t'assigni participants."}
            </p>
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
                  actionLabel="Registrar"
                  onAction={() => openForParticipant(p.id)}
                  actionDisabled={!programId}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}