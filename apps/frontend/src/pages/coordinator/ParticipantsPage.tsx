import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users as UsersIcon } from "lucide-react";
import { createParticipant, listParticipants } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { useLocalDraft } from "../../hooks/useLocalDraft";
import { toast } from "../../stores/toastStore";
import { EmptyState } from "../../components/common/EmptyState";
import { SkeletonTable } from "../../components/common/Skeleton";

const GENDERS = [
  { value: "unknown", label: "No especificat" },
  { value: "M", label: "Masculí" },
  { value: "F", label: "Femení" },
  { value: "NB", label: "No binari" },
];

const defaultDraft = {
  program_id: "",
  code: "",
  first_name: "",
  birth_year: "",
  gender: "unknown",
  nationality: "",
  enrollment_date: new Date().toISOString().slice(0, 10),
  consent_given: true,
};

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function ParticipantsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState("");
  const { data: programs } = useQuery({ queryKey: ["programs"], queryFn: () => listPrograms(true) });
  const { data: participants, isLoading } = useQuery({
    queryKey: ["participants", filterProgram],
    queryFn: () => listParticipants(filterProgram || undefined),
  });

  const [_rawDraft, setDraft, clearDraft] = useLocalDraft("if_participant_form_v2", defaultDraft);
  const draft = { ...defaultDraft, ..._rawDraft };

  const createMutation = useMutation({
    mutationFn: createParticipant,
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      clearDraft();
      setModalOpen(false);
      toast.success("Participant creat", `${p.first_name} (${p.code}) afegit amb èxit.`);
    },
    onError: () => {
      toast.error("No s'ha pogut crear el participant", "Comprova que el codi no estigui duplicat.");
    },
  });

  const programName = (id: string) => programs?.find((p) => p.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    if (!participants) return [];
    return participants.filter((p) => {
      const matchSearch =
        !search ||
        p.first_name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        (p.nationality ?? "").toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [participants, search]);

  const handleCreate = () => {
    if (!draft.program_id || !draft.code.trim() || !draft.first_name.trim()) return;
    createMutation.mutate({
      program_id: draft.program_id,
      code: draft.code.trim(),
      first_name: draft.first_name.trim(),
      birth_year: draft.birth_year ? Number(draft.birth_year) : undefined,
      gender: draft.gender,
      nationality: draft.nationality.trim() || undefined,
      enrollment_date: draft.enrollment_date,
      consent_given: draft.consent_given,
      is_control_group: false,
    });
  };

  const isFormValid = draft.program_id && draft.code.trim() && draft.first_name.trim();

  return (
    <div className="page-container">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Participants</h1>
          <p className="page-subtitle">
            {participants?.length ?? 0} participants registrats
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          + Nou participant
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="filters-row">
        <input
          className="filter-search"
          type="text"
          placeholder="Cerca per nom, codi o nacionalitat..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={filterProgram}
          onChange={(e) => setFilterProgram(e.target.value)}
        >
          <option value="">Tots els programes</option>
          {(programs ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="card table-card">
        {isLoading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          search || filterProgram ? (
            <EmptyState
              icon={UsersIcon}
              title="Cap participant coincideix"
              description="Prova a esborrar els filtres o ajustar la cerca."
            />
          ) : (
            <EmptyState
              icon={UsersIcon}
              title="Encara no hi ha participants"
              description="Comença afegint el primer participant al programa."
              action={{ label: "+ Nou participant", onClick: () => setModalOpen(true) }}
            />
          )
        ) : (
          <div className="table-wrap">
            <table className="participants-table">
              <thead>
                <tr>
                  <th>Codi</th>
                  <th>Nom</th>
                  <th>Programa</th>
                  <th>Nacionalitat</th>
                  <th>Data d'alta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="participants-table-row"
                    onClick={() => navigate(`/coordinator/participants/${p.id}`)}
                  >
                    <td>
                      <span className="participant-code">{p.code}</span>
                    </td>
                    <td>
                      <div className="participant-name-cell">
                        <div className="participant-avatar">
                          {p.first_name[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="participant-name">{p.first_name}</span>
                      </div>
                    </td>
                    <td className="text-secondary">{programName(filterProgram || "")}</td>
                    <td className="text-secondary">{p.nationality ?? "—"}</td>
                    <td className="text-secondary">
                      {new Date(p.enrollment_date).toLocaleDateString("ca-ES", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>
                    <td>
                      <button
                        className="btn-row-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/coordinator/participants/${p.id}`);
                        }}
                      >
                        Veure perfil →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Nou participant ──────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="modal-header">
          <h2 className="modal-title">Nou participant</h2>
          <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
        </div>

        <div className="modal-body">
          <div className="form-grid-2">
            <div className="form-field">
              <div className="form-label">Programa *</div>
              <select
                className="form-select"
                value={draft.program_id}
                onChange={(e) => setDraft((p) => ({ ...p, program_id: e.target.value }))}
              >
                <option value="">Selecciona un programa...</option>
                {(programs ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <div className="form-label">Codi identificador *</div>
              <input
                className="form-input"
                value={draft.code}
                onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))}
                placeholder="Ex: NRN-2025-051"
              />
            </div>

            <div className="form-field">
              <div className="form-label">Nom *</div>
              <input
                className="form-input"
                value={draft.first_name}
                onChange={(e) => setDraft((p) => ({ ...p, first_name: e.target.value }))}
                placeholder="Nom del participant"
              />
            </div>

            <div className="form-field">
              <div className="form-label">Any de naixement</div>
              <input
                className="form-input"
                type="number"
                value={draft.birth_year}
                onChange={(e) => setDraft((p) => ({ ...p, birth_year: e.target.value }))}
                placeholder="Ex: 2015"
                min={2000}
                max={new Date().getFullYear()}
              />
            </div>

            <div className="form-field">
              <div className="form-label">Gènere</div>
              <select
                className="form-select"
                value={draft.gender}
                onChange={(e) => setDraft((p) => ({ ...p, gender: e.target.value }))}
              >
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <div className="form-label">Nacionalitat</div>
              <input
                className="form-input"
                value={draft.nationality}
                onChange={(e) => setDraft((p) => ({ ...p, nationality: e.target.value }))}
                placeholder="Ex: Marroc"
              />
            </div>

            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <div className="form-label">Data d'alta al programa *</div>
              <input
                className="form-input"
                type="date"
                value={draft.enrollment_date}
                onChange={(e) => setDraft((p) => ({ ...p, enrollment_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-checks">
            <label className="form-check-label">
              <input
                type="checkbox"
                checked={draft.consent_given}
                onChange={(e) => setDraft((p) => ({ ...p, consent_given: e.target.checked }))}
              />
              Consentiment informat signat
            </label>
          </div>

          {createMutation.isError && (
            <div className="form-error">
              Error en crear el participant. Comprova que el codi no estigui duplicat.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => { clearDraft(); setModalOpen(false); }}>
            Cancel·lar
          </button>
          <button
            className="btn-primary"
            disabled={!isFormValid || createMutation.isPending}
            onClick={handleCreate}
          >
            {createMutation.isPending ? "Creant..." : "Crear participant"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
