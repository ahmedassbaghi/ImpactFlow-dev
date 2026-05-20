import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import {
  createSchool,
  deleteSchool,
  listSchoolParticipants,
  listSchools,
  updateSchool,
  type School,
} from "../../api/schools";
import { SchoolBadge } from "../../components/common/SchoolBadge";
import { toast } from "../../stores/toastStore";

function SchoolFormModal({
  open,
  onClose,
  initial,
  onSubmit,
  isPending,
  submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  initial: { name: string; abbreviation: string };
  onSubmit: (form: { name: string; abbreviation: string }) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nom és obligatori");
      return;
    }
    const abbr = form.abbreviation.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(abbr)) {
      setError("Abreviatura: 2-6 lletres o números en majúscules");
      return;
    }
    setError("");
    onSubmit({ name: form.name.trim(), abbreviation: abbr });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{submitLabel}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Tancar">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-label">Nom de l'escola *</div>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Escola Sagrada Família"
              autoFocus
            />
            <div className="form-label" style={{ marginTop: "0.75rem" }}>
              Abreviatura * (única, per identificar ràpid)
            </div>
            <input
              className="form-input"
              value={form.abbreviation}
              onChange={(e) => setForm({ ...form, abbreviation: e.target.value.toUpperCase() })}
              placeholder="Ex: ESF"
              maxLength={6}
              aria-describedby="abbr-hint"
            />
            <p id="abbr-hint" className="muted" style={{ fontSize: "0.8rem", marginTop: "0.35rem" }}>
              Es mostrarà en llistes d'alumnes i registre de sessions.
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel·lar</button>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? "Desant…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SchoolParticipantsModal({ school, onClose }: { school: School; onClose: () => void }) {
  const { data: participants = [], isLoading } = useQuery({
    queryKey: ["school-participants", school.id],
    queryFn: () => listSchoolParticipants(school.id),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            Alumnes — {school.name}{" "}
            <SchoolBadge abbreviation={school.abbreviation} name={school.name} />
          </h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Tancar">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="modal-body">
          {isLoading && <p className="muted">Carregant…</p>}
          {!isLoading && participants.length === 0 && (
            <p className="muted">Cap alumne assignat a aquesta escola.</p>
          )}
          <ul className="enroll-list">
            {participants.map((p) => (
              <li key={p.id} className="enroll-list-row">
                <span className="enroll-result-name">{p.first_name}</span>
                <span className="enroll-result-code">{p.code}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Tancar</button>
        </div>
      </div>
    </div>
  );
}

export default function SchoolsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<School | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null);
  const [viewTarget, setViewTarget] = useState<School | null>(null);

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["schools"],
    queryFn: listSchools,
  });

  const create = useMutation({
    mutationFn: createSchool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      setShowCreate(false);
      toast.success("Escola creada");
    },
    onError: () => toast.error("Error", "No s'ha pogut crear l'escola (abreviatura duplicada?)."),
  });

  const edit = useMutation({
    mutationFn: ({ id, form }: { id: string; form: { name: string; abbreviation: string } }) =>
      updateSchool(id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      setEditTarget(null);
      toast.success("Escola actualitzada");
    },
  });

  const remove = useMutation({
    mutationFn: deleteSchool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      setDeleteTarget(null);
      toast.success("Escola eliminada");
    },
    onError: () =>
      toast.error("No es pot eliminar", "Hi ha alumnes assignats. Reassigna'ls abans."),
  });

  return (
    <>
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Escoles</h1>
            <p className="page-subtitle">Centres educatius i abreviatures per identificar alumnes</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} strokeWidth={2.5} />
            Nova escola
          </button>
        </div>

        {isLoading ? (
          <div className="empty-state">Carregant escoles…</div>
        ) : schools.length === 0 ? (
          <div className="empty-state">
            <Building2 size={40} strokeWidth={1.2} style={{ opacity: 0.3 }} />
            <p>Encara no hi ha cap escola registrada.</p>
            <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
              Crear la primera escola
            </button>
          </div>
        ) : (
          <div className="programs-grid">
            {schools.map((s) => (
              <div key={s.id} className={`program-card${s.active ? "" : " inactive"}`}>
                <div className="program-card-header">
                  <div className="program-card-icon">
                    <Building2 size={18} strokeWidth={1.8} />
                  </div>
                  <SchoolBadge abbreviation={s.abbreviation} name={s.name} />
                </div>
                <h3 className="program-card-name">{s.name}</h3>
                <div className="program-card-meta">
                  <span className="program-meta-item">
                    <Users size={12} strokeWidth={2} />
                    {s.participant_count} {s.participant_count === 1 ? "alumne" : "alumnes"}
                  </span>
                  {s.active && (
                    <span className="program-status-badge active">
                      <CheckCircle2 size={11} strokeWidth={2.5} /> Activa
                    </span>
                  )}
                </div>
                <div className="program-card-actions">
                  <button
                    type="button"
                    className="btn-icon-sm"
                    title="Veure alumnes"
                    onClick={() => setViewTarget(s)}
                  >
                    <Users size={13} strokeWidth={2} />
                    Alumnes
                  </button>
                  <button type="button" className="btn-icon-sm" title="Editar" onClick={() => setEditTarget(s)}>
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon-sm btn-icon-danger"
                    title="Eliminar"
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SchoolFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        initial={{ name: "", abbreviation: "" }}
        onSubmit={(form) => create.mutate(form)}
        isPending={create.isPending}
        submitLabel="Crear escola"
      />

      {editTarget && (
        <SchoolFormModal
          open
          onClose={() => setEditTarget(null)}
          initial={{ name: editTarget.name, abbreviation: editTarget.abbreviation }}
          onSubmit={(form) => edit.mutate({ id: editTarget.id, form })}
          isPending={edit.isPending}
          submitLabel="Desar canvis"
        />
      )}

      {viewTarget && <SchoolParticipantsModal school={viewTarget} onClose={() => setViewTarget(null)} />}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content modal-content--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Eliminar escola</h2>
              <button type="button" className="modal-close-btn" onClick={() => setDeleteTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                Eliminar <strong>{deleteTarget.name}</strong>? Només és possible si no té alumnes assignats.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel·lar
              </button>
              <button
                type="button"
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
