import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { listParticipants } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { QuickSessionLogger } from "../sessions/QuickSessionLogger";
import { PremiumSelect } from "./PremiumSelect";
import { VolunteerParticipantRow } from "./VolunteerParticipantRow";

type RegTab = "list" | "register";

export function VolunteerSessionHub() {
  const [programId, setProgramId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<RegTab>("list");
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
    setTab("register");
  };

  const closeRegister = () => {
    setTab("list");
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

  return (
    <div className="vol-page">
      <header className="vol-page-head">
        <h1 className="vol-page-title">Registre</h1>
        <p className="vol-page-sub">
          Filtra la llista i prem <strong>Registrar</strong> per passar a la pestanya de registre.
        </p>
      </header>

      <div className="vol-reg-tabs" role="tablist" aria-label="Registre de sessions">
        <button
          type="button"
          role="tab"
          id="vol-tab-list"
          aria-selected={tab === "list"}
          aria-controls="vol-panel-list"
          className={`vol-reg-tab ${tab === "list" ? "vol-reg-tab--active" : ""}`}
          onClick={() => setTab("list")}
        >
          Llista
        </button>
        <button
          type="button"
          role="tab"
          id="vol-tab-register"
          aria-selected={tab === "register"}
          aria-controls="vol-panel-register"
          className={`vol-reg-tab ${tab === "register" ? "vol-reg-tab--active" : ""}`}
          onClick={() => {
            if (activeParticipantId) setTab("register");
          }}
          disabled={!activeParticipantId}
        >
          Registrar
        </button>
      </div>

      {tab === "list" && (
      <>
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

      <div
        id="vol-panel-list"
        role="tabpanel"
        aria-labelledby="vol-tab-list"
        hidden={tab !== "list"}
        className="vol-reg-panel"
      >
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
      </>
      )}

      <div
        id="vol-panel-register"
        role="tabpanel"
        aria-labelledby="vol-tab-register"
        hidden={tab !== "register"}
        className="vol-reg-panel vol-reg-panel--form"
      >
        {tab === "register" && activeParticipantId && programId ? (
          <>
            <div className="vol-reg-form-head">
              <button
                type="button"
                className="vol-btn-back"
                onClick={closeRegister}
                aria-label="Tornar a la llista"
              >
                <ChevronLeft size={18} strokeWidth={2.5} aria-hidden />
                Llista
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
          </>
        ) : (
          <p className="vol-empty" role="status">
            Selecciona un alumne a la pestanya Llista i prem Registrar.
          </p>
        )}
      </div>
    </div>
  );
}
