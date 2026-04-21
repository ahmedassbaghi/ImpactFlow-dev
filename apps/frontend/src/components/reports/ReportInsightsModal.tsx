type InsightsContent = {
  headline_metrics?: {
    evaluations?: number;
    improvement_pct?: number;
    retention_rate?: number;
  };
  session_quality?: {
    evidence_completeness?: number;
    attendance_present_rate?: number;
    avg_mood?: number | null;
    avg_sentiment?: number | null;
  };
  goals_summary?: {
    methodology?: string;
    assigned_goals?: number;
    completed_goals?: number;
    goal_completion_rate?: number;
    on_time_completion_rate?: number;
    avg_time_to_completion_days?: number | null;
  };
  risk_distribution?: Record<string, number>;
  narrative?: string;
  key_statements?: string[];
};

type ReportInsightsModalProps = {
  open: boolean;
  title: string;
  content: InsightsContent | null;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
};

export function ReportInsightsModal({
  open,
  title,
  content,
  onClose,
  onSave,
  saveLabel = "Guardar",
  saving = false,
}: ReportInsightsModalProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div style={{ display: "flex", gap: "0.55rem" }}>
            {onSave && (
              <button onClick={onSave} disabled={saving}>
                {saving ? "Guardando..." : saveLabel}
              </button>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        {!content && <div className="empty-box">No hay contenido para mostrar.</div>}

        {content && (
          <div className="grid">
            <div className="grid grid-3">
              <div className="card">
                <h4>Evaluaciones</h4>
                <div className="metric-value">{content.headline_metrics?.evaluations ?? 0}</div>
              </div>
              <div className="card">
                <h4>Mejora</h4>
                <div className="metric-value">{content.headline_metrics?.improvement_pct ?? 0}%</div>
              </div>
              <div className="card">
                <h4>Retencion</h4>
                <div className="metric-value">{content.headline_metrics?.retention_rate ?? 0}%</div>
              </div>
            </div>
            <div className="grid grid-2">
              <div className="card">
                <h4>Calidad de sesiones</h4>
                <div className="dash-row">
                  <span>Evidencia completa</span>
                  <strong>{Math.round((content.session_quality?.evidence_completeness ?? 0) * 100)}%</strong>
                </div>
                <div className="dash-row">
                  <span>Asistencia efectiva</span>
                  <strong>{Math.round((content.session_quality?.attendance_present_rate ?? 0) * 100)}%</strong>
                </div>
                <div className="dash-row">
                  <span>Mood medio</span>
                  <strong>{content.session_quality?.avg_mood ?? "-"}</strong>
                </div>
                <div className="dash-row">
                  <span>Sentimiento medio</span>
                  <strong>{content.session_quality?.avg_sentiment ?? "-"}</strong>
                </div>
              </div>
              <div className="card">
                <h4>Distribucion de riesgo</h4>
                {Object.entries(content.risk_distribution ?? {}).map(([key, value]) => (
                  <div key={key} className="dash-row">
                    <span>{key}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            </div>
            {content.goals_summary && (
              <div className="card">
                <h4>Microobjetivos (RBM)</h4>
                <div className="dash-row">
                  <span>Objetivos asignados</span>
                  <strong>{content.goals_summary.assigned_goals ?? 0}</strong>
                </div>
                <div className="dash-row">
                  <span>Objetivos completados</span>
                  <strong>{content.goals_summary.completed_goals ?? 0}</strong>
                </div>
                <div className="dash-row">
                  <span>Goal Completion Rate</span>
                  <strong>{Math.round((content.goals_summary.goal_completion_rate ?? 0) * 100)}%</strong>
                </div>
                <div className="dash-row">
                  <span>On-Time Completion Rate</span>
                  <strong>{Math.round((content.goals_summary.on_time_completion_rate ?? 0) * 100)}%</strong>
                </div>
                <div className="dash-row">
                  <span>Tiempo medio de logro</span>
                  <strong>
                    {content.goals_summary.avg_time_to_completion_days == null
                      ? "-"
                      : `${content.goals_summary.avg_time_to_completion_days} dias`}
                  </strong>
                </div>
              </div>
            )}
            <div className="card">
              <h4>Narrativa</h4>
              <p className="insight-box">{content.narrative ?? "Sin narrativa disponible."}</p>
              <div className="grid">
                {(content.key_statements ?? []).map((statement) => (
                  <div key={statement} className="dash-row">
                    <span>{statement}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
