import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createMicroGoal, listMicroGoals, listMicroGoalTemplates } from "../../api/microGoals";
import { listPrograms } from "../../api/programs";

export default function MicroGoalsPage() {
  const queryClient = useQueryClient();
  const [programId, setProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dimension, setDimension] = useState("academic");
  const [difficulty, setDifficulty] = useState("2");
  const [targetDate, setTargetDate] = useState("");

  const { data: programs } = useQuery({
    queryKey: ["programs", "micro-goals"],
    queryFn: () => listPrograms(true),
  });
  const { data: templates } = useQuery({
    queryKey: ["micro-goals", "templates"],
    queryFn: listMicroGoalTemplates,
  });
  const { data: goals } = useQuery({
    queryKey: ["micro-goals", "list", programId],
    queryFn: () => listMicroGoals({ programId: programId || undefined, activeOnly: true }),
  });

  const saveMutation = useMutation({
    mutationFn: createMicroGoal,
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setTargetDate("");
      queryClient.invalidateQueries({ queryKey: ["micro-goals", "list"] });
    },
  });

  const completionRate = useMemo(() => {
    const total = goals?.length ?? 0;
    if (!total) return 0;
    const completed = (goals ?? []).filter((g) => g.completions_count > 0).length;
    return Math.round((completed / total) * 100);
  }, [goals]);

  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Microobjetivos</h1>
        <span className="chip">Configuracion y seguimiento</span>
      </div>

      <div className="card">
        <h3>Marco metodologico</h3>
        <p className="muted">
          Seguimiento basado en indicadores estandar de gestion por resultados (RBM), con medidas observables y auditables.
        </p>
        <div className="grid grid-3" style={{ marginTop: "0.6rem" }}>
          <div className="quick-tip">
            <strong>Goal Completion Rate</strong>
            <span className="muted">Porcentaje de microobjetivos que alcanzan estado completado dentro del periodo.</span>
          </div>
          <div className="quick-tip">
            <strong>On-Time Completion Rate</strong>
            <span className="muted">Proporcion de completados dentro de la fecha objetivo definida.</span>
          </div>
          <div className="quick-tip">
            <strong>Time-to-Completion</strong>
            <span className="muted">Tiempo medio desde creación hasta logro para controlar velocidad de progreso.</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Configurar microobjetivo</h3>
        <div className="grid grid-3">
          <label>
            Programa
            <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">Selecciona...</option>
              {(programs ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dimension
            <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
              <option value="academic">Academico</option>
              <option value="cognitive">Cognitivo</option>
              <option value="social">Social</option>
              <option value="integration">Integracion</option>
            </select>
          </label>
          <label>
            Titulo
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Microobjetivo SMART" />
          </label>
          <label>
            Dificultad (1-3)
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="1">1 - Basico</option>
              <option value="2">2 - Intermedio</option>
              <option value="3">3 - Avanzado</option>
            </select>
          </label>
          <label>
            Fecha objetivo
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Descripcion observable
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Criterio observable para considerar el objetivo logrado"
            />
          </label>
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            disabled={!programId || !title.trim() || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                program_id: programId,
                title: title.trim(),
                description: description.trim() || undefined,
                dimension,
                difficulty: Number(difficulty),
                target_date: targetDate || undefined,
              })
            }
          >
            {saveMutation.isPending ? "Guardando..." : "Guardar microobjetivo"}
          </button>
          {saveMutation.isSuccess && <span className="muted">Microobjetivo guardado.</span>}
        </div>
      </div>

      <div className="card">
        <h3>Plantillas sugeridas</h3>
        <div className="grid grid-3" style={{ marginTop: "0.5rem" }}>
          {(templates ?? []).map((tpl) => (
            <div key={`${tpl.dimension}-${tpl.title}`} className="quick-tip">
              <strong>{tpl.title}</strong>
              <span className="muted">
                Dimension: {tpl.dimension} · Dificultad: {tpl.difficulty}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Microobjetivos activos</h3>
        <p className="muted">Cobertura actual con al menos una evidencia de logro: {completionRate}%</p>
        <div className="table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Dimension</th>
                <th>Dificultad</th>
                <th>Fecha objetivo</th>
                <th>Logros</th>
              </tr>
            </thead>
            <tbody>
              {(goals ?? []).map((goal) => (
                <tr key={goal.id}>
                  <td>{goal.title}</td>
                  <td>{goal.dimension}</td>
                  <td>{goal.difficulty}</td>
                  <td>{goal.target_date ? new Date(goal.target_date).toLocaleDateString("es-ES") : "-"}</td>
                  <td>{goal.completions_count}</td>
                </tr>
              ))}
              {(goals ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "1rem" }}>
                    No hay microobjetivos para el filtro seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
