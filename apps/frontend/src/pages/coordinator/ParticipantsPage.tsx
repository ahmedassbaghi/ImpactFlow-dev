import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createParticipant, listParticipants } from "../../api/participants";
import { useLocalDraft } from "../../hooks/useLocalDraft";

export default function ParticipantsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["participants"],
    queryFn: () => listParticipants(),
  });

  const { value: draft, setValue: setDraft, clear } = useLocalDraft("if_participant_form", {
    program_id: "",
    code: "",
    first_name: "",
    birth_year: "",
    gender: "unknown",
    nationality: "",
    enrollment_date: new Date().toISOString().slice(0, 10),
    consent_given: true,
    is_control_group: false,
  });

  const createMutation = useMutation({
    mutationFn: createParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      clear();
    },
  });

  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Gestión de participantes</h1>
      </div>

      <div className="card">
        <h3>Alta rápida de participante</h3>
        <p className="muted">El formulario se autoguarda en local para no perder el progreso.</p>
        <div className="grid grid-2">
          <label>
            Program ID
            <input value={draft.program_id} onChange={(e) => setDraft((p) => ({ ...p, program_id: e.target.value }))} />
          </label>
          <label>
            Código
            <input value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))} />
          </label>
          <label>
            Nombre
            <input
              value={draft.first_name}
              onChange={(e) => setDraft((p) => ({ ...p, first_name: e.target.value }))}
            />
          </label>
          <label>
            Año nacimiento
            <input
              value={draft.birth_year}
              onChange={(e) => setDraft((p) => ({ ...p, birth_year: e.target.value }))}
              type="number"
            />
          </label>
          <label>
            Nacionalidad
            <input
              value={draft.nationality}
              onChange={(e) => setDraft((p) => ({ ...p, nationality: e.target.value }))}
            />
          </label>
          <label>
            Fecha de ingreso
            <input
              value={draft.enrollment_date}
              onChange={(e) => setDraft((p) => ({ ...p, enrollment_date: e.target.value }))}
              type="date"
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.65rem", marginTop: "0.9rem" }}>
          <button
            onClick={() =>
              createMutation.mutate({
                program_id: draft.program_id,
                code: draft.code,
                first_name: draft.first_name,
                birth_year: draft.birth_year ? Number(draft.birth_year) : undefined,
                gender: draft.gender,
                nationality: draft.nationality || undefined,
                enrollment_date: draft.enrollment_date,
                consent_given: draft.consent_given,
                is_control_group: draft.is_control_group,
              })
            }
          >
            {createMutation.isPending ? "Guardando..." : "Crear participante"}
          </button>
          <button className="btn-secondary" onClick={clear}>
            Limpiar
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Listado actual</h3>
        {isLoading && <p className="muted">Cargando...</p>}
        {!isLoading && !data?.length && <div className="empty-box">No hay participantes aún.</div>}
        {!!data?.length && (
          <div className="grid">
            {data.map((p) => (
              <div key={p.id} className="card" style={{ background: "#fcfcff" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>
                    {p.code} · {p.first_name}
                  </strong>
                  <span className="chip">{p.is_control_group ? "control" : "intervención"}</span>
                </div>
                <div className="muted">
                  {p.nationality ?? "Sin nacionalidad"} · alta {p.enrollment_date}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
