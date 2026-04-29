import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, Brain, Check, Globe, Star, Users2 } from "lucide-react";
import { createMicroGoal, listMicroGoals, listMicroGoalTemplates } from "../../api/microGoals";
import { listPrograms } from "../../api/programs";

const DIM_LABELS: Record<string, string> = {
  academic: "Acadèmic",
  cognitive: "Cognitiu",
  social: "Social",
  integration: "Integració",
};

const DIM_COLORS: Record<string, string> = {
  academic: "var(--dim-academic)",
  cognitive: "var(--dim-cognitive)",
  social: "var(--dim-social)",
  integration: "var(--dim-integration)",
};

const DIM_ICONS: Record<string, React.ElementType> = {
  academic: BookOpen,
  cognitive: Brain,
  social: Users2,
  integration: Globe,
};

const DIFF_LABELS = ["", "Bàsic", "Intermedi", "Avançat"];

function DimBadge({ dim }: { dim: string }) {
  const Icon = DIM_ICONS[dim] ?? BookOpen;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.2rem 0.6rem",
        borderRadius: 999,
        fontSize: "0.78rem",
        fontWeight: 700,
        background: `color-mix(in srgb, ${DIM_COLORS[dim]} 15%, transparent)`,
        color: DIM_COLORS[dim],
        border: `1px solid color-mix(in srgb, ${DIM_COLORS[dim]} 30%, transparent)`,
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {DIM_LABELS[dim] ?? dim}
    </span>
  );
}

function DiffStars({ count }: { count: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          size={12}
          strokeWidth={2}
          style={{
            fill: i <= count ? "currentColor" : "none",
            color: i <= count ? "var(--dim-integration)" : "var(--border-strong)",
          }}
        />
      ))}
    </span>
  );
}

import React from "react";

export default function MicroGoalsPage() {
  const queryClient = useQueryClient();
  const [programId, setProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dimension, setDimension] = useState("academic");
  const [difficulty, setDifficulty] = useState("2");
  const [targetDate, setTargetDate] = useState("");
  const [filterDim, setFilterDim] = useState("");

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

  const applyTemplate = (tpl: { title: string; dimension: string; difficulty: number; description?: string }) => {
    setTitle(tpl.title);
    setDimension(tpl.dimension);
    setDifficulty(String(tpl.difficulty));
    if (tpl.description) setDescription(tpl.description);
    document.getElementById("goal-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredGoals = useMemo(
    () => (goals ?? []).filter((g) => !filterDim || g.dimension === filterDim),
    [goals, filterDim]
  );

  const isFormValid = programId && title.trim();

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Micro-objectius</h1>
          <p className="page-subtitle">Objectius SMART observables per fer el seguiment del progrés</p>
        </div>
        {goals && goals.length > 0 && (
          <div className="page-header-stat">
            <span className="page-header-stat-value">{completionRate}%</span>
            <span className="page-header-stat-label">amb algun assoliment</span>
          </div>
        )}
      </div>

      {/* ── Plantilles suggerides ─────────────────────────────────── */}
      {templates && templates.length > 0 && (
        <div className="card">
          <div className="card-header-row">
            <h3 className="card-title">Plantilles suggerides</h3>
            <span className="card-hint">Fes clic a "Usar" per preomplir el formulari</span>
          </div>
          <div className="templates-grid">
            {templates.map((tpl) => (
              <div key={`${tpl.dimension}-${tpl.title}`} className="template-card">
                <div className="template-card-top">
                  <DimBadge dim={tpl.dimension} />
                  <DiffStars count={tpl.difficulty} />
                </div>
                <p className="template-title">{tpl.title}</p>
                <button className="btn-template-use" onClick={() => applyTemplate(tpl)}>
                  Usar plantilla
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Crear micro-objectiu ──────────────────────────────────── */}
      <div className="card" id="goal-form">
        <h3 className="card-title">Crear micro-objectiu</h3>
        <p className="card-subtitle">
          Defineix un objectiu SMART: específic, mesurable, assolible, rellevant i amb data.
        </p>

        <div className="form-grid-2" style={{ marginTop: "1rem" }}>
          <div className="form-field">
            <div className="form-label">Programa *</div>
            <select
              className="form-select"
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">Selecciona un programa...</option>
              {(programs ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <div className="form-label">Dimensió</div>
            <div className="dim-selector">
              {Object.keys(DIM_LABELS).map((d) => {
                const Icon = DIM_ICONS[d] ?? BookOpen;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`dim-btn${dimension === d ? " active" : ""}`}
                    style={dimension === d ? { borderColor: DIM_COLORS[d], background: `color-mix(in srgb, ${DIM_COLORS[d]} 12%, transparent)`, color: DIM_COLORS[d] } : {}}
                    onClick={() => setDimension(d)}
                  >
                    <Icon size={13} strokeWidth={2} />
                    {DIM_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <div className="form-label">Títol de l'objectiu *</div>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Llegir 10 minuts seguits sense interrupcions"
            />
          </div>

          <div className="form-field">
            <div className="form-label">Dificultat</div>
            <div className="diff-selector">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`diff-btn${difficulty === String(d) ? " active" : ""}`}
                  onClick={() => setDifficulty(String(d))}
                >
                  <DiffStars count={d} />
                  <span className="diff-label">{DIFF_LABELS[d]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <div className="form-label">Data objectiu</div>
            <input
              className="form-input"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <div className="form-label">Criteri observable</div>
            <textarea
              className="form-textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Com sabrem que s'ha assolit? Descriu el comportament observable..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            className="btn-primary"
            disabled={!isFormValid || saveMutation.isPending}
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
            {saveMutation.isPending ? "Guardant..." : "Guardar micro-objectiu"}
          </button>
          {saveMutation.isSuccess && (
            <span className="form-success">
              <Check size={13} strokeWidth={3} />
              Micro-objectiu creat correctament
            </span>
          )}
        </div>
      </div>

      {/* ── Llistat actiu ────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header-row">
          <h3 className="card-title">
            Micro-objectius actius
            {goals && <span className="card-count">{goals.length}</span>}
          </h3>
          <div className="filter-toggle-group">
            <button className={`filter-toggle${filterDim === "" ? " active" : ""}`} onClick={() => setFilterDim("")}>
              Tots
            </button>
            {Object.keys(DIM_LABELS).map((d) => {
              const Icon = DIM_ICONS[d] ?? BookOpen;
              return (
                <button
                  key={d}
                  className={`filter-toggle${filterDim === d ? " active" : ""}`}
                  onClick={() => setFilterDim(d)}
                  style={filterDim === d ? { borderColor: DIM_COLORS[d], color: DIM_COLORS[d] } : {}}
                >
                  <Icon size={13} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  {DIM_LABELS[d]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
          <table className="participants-table">
            <thead>
              <tr>
                <th>Objectiu</th>
                <th>Dimensió</th>
                <th>Dificultat</th>
                <th>Data objectiu</th>
                <th>Assoliments</th>
              </tr>
            </thead>
            <tbody>
              {filteredGoals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty-row">
                    {programId
                      ? "Cap micro-objectiu actiu per a aquest programa."
                      : "Selecciona un programa per veure els micro-objectius."}
                  </td>
                </tr>
              ) : (
                filteredGoals.map((goal) => (
                  <tr key={goal.id} className="participants-table-row" style={{ cursor: "default" }}>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{goal.title}</span>
                    </td>
                    <td><DimBadge dim={goal.dimension} /></td>
                    <td><DiffStars count={goal.difficulty} /></td>
                    <td className="text-secondary">
                      {goal.target_date
                        ? new Date(goal.target_date).toLocaleDateString("ca-ES", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 28,
                          height: 28,
                          borderRadius: 999,
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          background: goal.completions_count > 0 ? "var(--risk-low-bg)" : "var(--surface-2)",
                          color: goal.completions_count > 0 ? "var(--risk-low)" : "var(--text-muted)",
                        }}
                      >
                        {goal.completions_count}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
