import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Clock, FolderKanban, Pencil, Plus, Search, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { listPrograms, createProgram, updateProgram, deleteProgram, type Program } from "../../api/programs";
import {
  listParticipants,
  getParticipantPrograms,
  getEnrolledParticipants,
  enrollParticipant,
  unenrollParticipant,
  type Participant,
} from "../../api/participants";
import { SchoolBadge } from "../../components/common/SchoolBadge";

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  academic_social: "Acadèmic i Social",
  academic:        "Acadèmic",
  social:          "Social",
  integration:     "Integració",
  cognitive:       "Cognitiu",
};

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ca-ES", { year: "numeric", month: "short", day: "numeric" });
}

const defaultForm = () => ({
  name: "",
  description: "",
  program_type: "academic_social",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
});

function ProgramFormModal({
  open,
  onClose,
  initial,
  onSubmit,
  isPending,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  initial: ReturnType<typeof defaultForm>;
  onSubmit: (form: ReturnType<typeof defaultForm>) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nom és obligatori"); return; }
    if (!form.start_date) { setError("La data d'inici és obligatòria"); return; }
    setError("");
    onSubmit(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{submitLabel === "Crear programa" ? "Nou programa" : "Editar programa"}</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid-2" style={{ paddingBottom: 0 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="form-label">Nom del programa *</div>
                <input
                  className="form-input"
                  placeholder="Ex: Programa d'inclusió educativa 2025"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="form-label">Descripció</div>
                <textarea
                  className="form-textarea"
                  placeholder="Descripció breu del programa i els seus objectius…"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <div className="form-label">Tipologia</div>
                <select
                  className="form-select"
                  value={form.program_type}
                  onChange={(e) => setForm({ ...form, program_type: e.target.value })}
                >
                  {Object.entries(PROGRAM_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div />
              <div>
                <div className="form-label">Data d'inici *</div>
                <input
                  type="date"
                  className="form-input"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <div className="form-label">Data de finalització</div>
                <input
                  type="date"
                  className="form-input"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              {error && (
                <div className="form-error" style={{ gridColumn: "1 / -1" }}>{error}</div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel·lar
            </button>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? "Desant…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EnrollmentModal({ program, onClose }: { program: Program; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: enrolled = [], isLoading: loadingEnrolled } = useQuery({
    queryKey: ["participants", "enrolled", program.id],
    queryFn: () => getEnrolledParticipants(program.id),
  });

  const { data: allParticipants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => listParticipants(),
  });

  const enrolledIds = new Set(enrolled.map((p: Participant) => p.id));

  const searchResults = search.trim()
    ? allParticipants.filter(
        (p: Participant) =>
          !enrolledIds.has(p.id) &&
          (p.first_name.toLowerCase().includes(search.toLowerCase()) ||
            p.code.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  const enroll = useMutation({
    mutationFn: (participantId: string) => enrollParticipant(program.id, participantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants", "enrolled", program.id] });
      setSearch("");
    },
  });

  const unenroll = useMutation({
    mutationFn: (participantId: string) => unenrollParticipant(program.id, participantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["participants", "enrolled", program.id] }),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content enroll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Participants inscrits</h2>
            <p className="enroll-modal-subtitle">{program.name}</p>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="modal-body">
          {/* Search to add */}
          <div className="enroll-search-wrap">
            <div className="enroll-search-field">
              <Search size={14} strokeWidth={2} className="enroll-search-icon" />
              <input
                className="enroll-search-input"
                placeholder="Cerca participant per nom o codi…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            {searchResults.length > 0 && (
              <div className="enroll-results">
                {searchResults.map((p: Participant) => (
                  <div key={p.id} className="enroll-result-row">
                    <div className="enroll-result-info">
                      <span className="enroll-result-name">{p.first_name}</span>
                      <span className="enroll-result-code">{p.code}</span>
                    </div>
                    <button
                      className="enroll-action-btn enroll-action-btn--add"
                      onClick={() => enroll.mutate(p.id)}
                      disabled={enroll.isPending}
                    >
                      <UserPlus size={13} strokeWidth={2} />
                      Inscriure
                    </button>
                  </div>
                ))}
              </div>
            )}
            {search.trim() && searchResults.length === 0 && (
              <p className="enroll-no-results">Cap participant coincideix amb la cerca.</p>
            )}
          </div>

          {/* Enrolled list */}
          <div className="enroll-section-label">
            <Users size={13} strokeWidth={2} />
            Inscrits ({enrolled.length})
          </div>

          {loadingEnrolled ? (
            <div className="enroll-loading">Carregant…</div>
          ) : enrolled.length === 0 ? (
            <div className="enroll-empty">
              Cap participant inscrit encara. Cerca i afegeix participants a dalt.
            </div>
          ) : (
            <div className="enroll-list">
              {enrolled.map((p: Participant) => (
                <div key={p.id} className="enroll-list-row">
                  <div className="enroll-result-info">
                    <span className="enroll-result-name">{p.first_name}</span>
                    <span className="enroll-result-code">{p.code}</span>
                  </div>
                  <button
                    className="enroll-action-btn enroll-action-btn--remove"
                    onClick={() => unenroll.mutate(p.id)}
                    disabled={unenroll.isPending}
                    title="Desinscriure"
                  >
                    <UserMinus size={13} strokeWidth={2} />
                    Treure
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Tancar</button>
        </div>
      </div>
    </div>
  );
}

function AssignProgramsByParticipant({ programs }: { programs: Program[] }) {
  const qc = useQueryClient();
  const [participantId, setParticipantId] = useState("");

  const { data: participants = [] } = useQuery({
    queryKey: ["participants", "assign-programs"],
    queryFn: () => listParticipants(),
  });

  const { data: enrolledPrograms = [] } = useQuery({
    queryKey: ["participant-programs", participantId],
    queryFn: () => getParticipantPrograms(participantId),
    enabled: !!participantId,
  });

  const enrolledIds = new Set(enrolledPrograms.map((p) => p.id));

  const toggle = async (programId: string, isEnrolled: boolean) => {
    if (!participantId) return;
    if (isEnrolled) await unenrollParticipant(programId, participantId);
    else await enrollParticipant(programId, participantId);
    qc.invalidateQueries({ queryKey: ["participant-programs", participantId] });
  };

  const selected = participants.find((p) => p.id === participantId);

  return (
    <div className="card" style={{ marginBottom: "1.25rem", padding: "1.25rem" }}>
      <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>Assignar programes per alumne</h2>
      <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "1rem" }}>
        Selecciona un alumne i marca els programes als quals està inscrit.
      </p>
      <label className="form-label" htmlFor="assign-participant">Alumne</label>
      <select
        id="assign-participant"
        className="form-select"
        value={participantId}
        onChange={(e) => setParticipantId(e.target.value)}
      >
        <option value="">Selecciona alumne…</option>
        {participants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.first_name} ({p.code})
          </option>
        ))}
      </select>
      {selected && (
        <p style={{ marginTop: "0.5rem" }}>
          <SchoolBadge abbreviation={selected.school_abbreviation} name={selected.school_name} />
        </p>
      )}
      {participantId && (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {programs.filter((p) => p.active).map((prog) => {
            const on = enrolledIds.has(prog.id);
            return (
              <label key={prog.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(prog.id, on)}
                />
                {prog.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProgramsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Program | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<Program | null>(null);

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ["programs", false],
    queryFn: () => listPrograms(false),
  });

  const create = useMutation({
    mutationFn: createProgram,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["programs"] }); setShowCreate(false); },
  });

  const edit = useMutation({
    mutationFn: ({ id, form }: { id: string; form: ReturnType<typeof defaultForm> }) =>
      updateProgram(id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        program_type: form.program_type,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["programs"] }); setEditTarget(null); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProgram(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["programs"] }); setDeleteTarget(null); },
  });

  return (
    <>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Programes</h1>
            <p className="page-subtitle">Gestiona programes i assignacions per alumne</p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} strokeWidth={2.5} />
            Nou programa
          </button>
        </div>

        {!isLoading && programs.length > 0 && <AssignProgramsByParticipant programs={programs} />}

        {isLoading ? (
          <div className="empty-state">Carregant programes…</div>
        ) : programs.length === 0 ? (
          <div className="empty-state">
            <FolderKanban size={40} strokeWidth={1.2} style={{ opacity: 0.3 }} />
            <p>Encara no hi ha cap programa.</p>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} strokeWidth={2.5} />
              Crear el primer programa
            </button>
          </div>
        ) : (
          <div className="programs-grid">
            {programs.map((p: Program) => (
              <div key={p.id} className={`program-card${p.active ? "" : " inactive"}`}>
                <div className="program-card-header">
                  <div className="program-card-icon">
                    <FolderKanban size={18} strokeWidth={1.8} />
                  </div>
                  <span className={`program-status-badge ${p.active ? "active" : "ended"}`}>
                    {p.active
                      ? <><CheckCircle2 size={11} strokeWidth={2.5} /> Actiu</>
                      : <><Clock size={11} strokeWidth={2.5} /> Finalitzat</>}
                  </span>
                </div>

                <h3 className="program-card-name">{p.name}</h3>

                {p.description && (
                  <p className="program-card-desc">{p.description}</p>
                )}

                <div className="program-card-type">
                  {PROGRAM_TYPE_LABELS[p.program_type] ?? p.program_type}
                </div>

                <div className="program-card-meta">
                  <span className="program-meta-item">
                    <Calendar size={12} strokeWidth={2} />
                    {formatDate(p.start_date)}
                    {p.end_date && <> → {formatDate(p.end_date)}</>}
                  </span>
                </div>

                <div className="program-card-actions">
                  <button
                    className="btn-icon-sm"
                    title="Gestionar participants"
                    onClick={() => setEnrollTarget(p)}
                  >
                    <Users size={13} strokeWidth={2} />
                    Participants
                  </button>
                  <button
                    className="btn-icon-sm"
                    title="Editar programa"
                    onClick={() => setEditTarget(p)}
                  >
                    <Pencil size={13} strokeWidth={2} />
                    Editar
                  </button>
                  <button
                    className="btn-icon-sm btn-icon-danger"
                    title="Eliminar programa"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 size={13} strokeWidth={2} />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <ProgramFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initial={defaultForm()}
        onSubmit={(form) =>
          create.mutate({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            program_type: form.program_type,
            start_date: form.start_date,
            end_date: form.end_date || undefined,
          })
        }
        isPending={create.isPending}
        submitLabel="Crear programa"
      />

      {/* Edit modal */}
      {editTarget && (
        <ProgramFormModal
          open
          onClose={() => setEditTarget(null)}
          initial={{
            name: editTarget.name,
            description: editTarget.description ?? "",
            program_type: editTarget.program_type,
            start_date: editTarget.start_date ?? "",
            end_date: editTarget.end_date ?? "",
          }}
          onSubmit={(form) => edit.mutate({ id: editTarget.id, form })}
          isPending={edit.isPending}
          submitLabel="Desar canvis"
        />
      )}

      {/* Enrollment modal */}
      {enrollTarget && (
        <EnrollmentModal program={enrollTarget} onClose={() => setEnrollTarget(null)} />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content modal-content--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Eliminar programa</h2>
              <button className="modal-close-btn" onClick={() => setDeleteTarget(null)}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Segur que vols eliminar <strong>{deleteTarget.name}</strong>?
                El programa quedarà desactivat però les dades es conservaran.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel·lar
              </button>
              <button
                className="btn-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleteTarget.id)}
              >
                {remove.isPending ? "Eliminant…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
