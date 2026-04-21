import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAnalyticsTrend,
  getCostEffectiveness,
  getCoordinatorDashboard,
  getImpactStatement,
  getIpiDistribution,
  getSessionQuality,
} from "../../api/dashboard";
import { ReportInsightsModal } from "../../components/reports/ReportInsightsModal";
import { listPrograms } from "../../api/programs";
import { generateReport } from "../../api/reports";

const RISK_COLORS = ["#10b981", "#f59e0b", "#ef4444"];
const DISTRIBUTION_COLORS = ["#22c55e", "#84cc16", "#f59e0b", "#fb7185", "#ef4444"];
const DASHBOARD_RANGE_DAYS = 365;

function InfoHint({ text }: { text: string }) {
  return (
    <span className="info-hint">
      <CircleHelp size={14} />
      <span className="info-tooltip">{text}</span>
    </span>
  );
}

export default function ProgramDashboardPage() {
  const [programInput, setProgramInput] = useState("");
  const [startDayOffset, setStartDayOffset] = useState(DASHBOARD_RANGE_DAYS - 120);
  const [endDayOffset, setEndDayOffset] = useState(DASHBOARD_RANGE_DAYS);
  const [debouncedStartDayOffset, setDebouncedStartDayOffset] = useState(DASHBOARD_RANGE_DAYS - 120);
  const [debouncedEndDayOffset, setDebouncedEndDayOffset] = useState(DASHBOARD_RANGE_DAYS);
  const [periodCostEur, setPeriodCostEur] = useState("0");
  const [comparatorCostEur, setComparatorCostEur] = useState("0");
  const [reportMessage, setReportMessage] = useState("");
  const [reportMessageType, setReportMessageType] = useState<"success" | "error" | "">("");
  const [isInsightsModalOpen, setIsInsightsModalOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedStartDayOffset(startDayOffset);
      setDebouncedEndDayOffset(endDayOffset);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [startDayOffset, endDayOffset]);

  const periodEndDate = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const periodStartDate = useMemo(() => {
    const start = new Date(periodEndDate);
    start.setDate(periodEndDate.getDate() - (DASHBOARD_RANGE_DAYS - debouncedStartDayOffset));
    return start;
  }, [periodEndDate, debouncedStartDayOffset]);
  const periodEndDateByOffset = useMemo(() => {
    const end = new Date(periodEndDate);
    end.setDate(periodEndDate.getDate() - (DASHBOARD_RANGE_DAYS - debouncedEndDayOffset));
    return end;
  }, [periodEndDate, debouncedEndDayOffset]);
  const periodStart = useMemo(() => periodStartDate.toISOString().slice(0, 10), [periodStartDate]);
  const periodEnd = useMemo(() => periodEndDateByOffset.toISOString().slice(0, 10), [periodEndDateByOffset]);
  const formattedPeriodStart = useMemo(() => periodStartDate.toLocaleDateString("es-ES"), [periodStartDate]);
  const formattedPeriodEnd = useMemo(() => periodEndDateByOffset.toLocaleDateString("es-ES"), [periodEndDateByOffset]);
  const selectedRangeDays = useMemo(
    () => Math.max(1, debouncedEndDayOffset - debouncedStartDayOffset + 1),
    [debouncedStartDayOffset, debouncedEndDayOffset]
  );
  const trendMonths = useMemo(() => Math.max(1, Math.ceil(selectedRangeDays / 30)), [selectedRangeDays]);

  const { data, isLoading } = useQuery({
    queryKey: ["coordinator-dashboard", periodStart, periodEnd],
    queryFn: () => getCoordinatorDashboard(periodStart, periodEnd),
    placeholderData: (previousData) => previousData,
  });
  const { data: programs } = useQuery({
    queryKey: ["programs", "dashboard"],
    queryFn: () => listPrograms(true),
  });

  const programChoices = useMemo(
    () =>
      (programs ?? []).map((program) => ({
        id: program.id,
        label: `${program.name} · ${program.id.slice(0, 8)}`,
        search: `${program.name} ${program.id}`.toLowerCase(),
      })),
    [programs]
  );

  const resolveProgramId = (raw: string) => {
    const query = raw.trim().toLowerCase();
    if (!query) return "";
    const exact = programChoices.find((item) => item.label.toLowerCase() === query || item.id.toLowerCase() === query);
    if (exact) return exact.id;
    return programChoices.find((item) => item.search.includes(query))?.id ?? "";
  };
  const selectedProgramId = useMemo(() => resolveProgramId(programInput), [programInput, programs]);

  useEffect(() => {
    if (!programInput && programChoices.length > 0) {
      setProgramInput(programChoices[0].label);
    }
  }, [programChoices, programInput]);

  const { data: distribution } = useQuery({
    queryKey: ["ipi-distribution", selectedProgramId, periodStart, periodEnd],
    queryFn: () => getIpiDistribution(selectedProgramId, periodStart, periodEnd),
    enabled: !!selectedProgramId,
    placeholderData: (previousData) => previousData,
  });

  const { data: trend } = useQuery({
    queryKey: ["analytics-trend", selectedProgramId, trendMonths],
    queryFn: () => getAnalyticsTrend(selectedProgramId, trendMonths),
    enabled: !!selectedProgramId,
    placeholderData: (previousData) => previousData,
  });

  const { data: impactStatement } = useQuery({
    queryKey: ["impact-statement", selectedProgramId],
    queryFn: () => getImpactStatement(selectedProgramId),
    enabled: !!selectedProgramId,
    placeholderData: (previousData) => previousData,
  });

  const { data: sessionQuality } = useQuery({
    queryKey: ["session-quality", selectedProgramId, periodStart, periodEnd],
    queryFn: () => getSessionQuality(selectedProgramId, periodStart, periodEnd),
    enabled: !!selectedProgramId && !!periodStart && !!periodEnd,
    placeholderData: (previousData) => previousData,
  });

  const periodCostValue = Number(periodCostEur || 0);
  const comparatorCostValue = Number(comparatorCostEur || 0);

  const { data: costEffectiveness } = useQuery({
    queryKey: ["cost-effectiveness", selectedProgramId, periodStart, periodEnd, periodCostValue, comparatorCostValue],
    queryFn: () => getCostEffectiveness(selectedProgramId, periodStart, periodEnd, periodCostValue, comparatorCostValue),
    enabled: !!selectedProgramId && !!periodStart && !!periodEnd,
    placeholderData: (previousData) => previousData,
  });

  const reportMutation = useMutation({
    mutationFn: async (programId: string) => {
      return generateReport({
        program_id: programId,
        report_type: "quarterly",
        period_start: periodStart,
        period_end: periodEnd,
        title: `Analitica ${periodStart} a ${periodEnd}`,
      });
    },
    onSuccess: (payload) => {
      setReportMessageType("success");
      setReportMessage(`Informe guardado correctamente: ${payload.id}`);
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      setReportMessageType("error");
      setReportMessage(
        typeof detail === "string"
          ? `No se pudo generar el informe: ${detail}`
          : "No se pudo generar el informe. Revisa programa y periodo."
      );
    },
  });

  const riskChartData = useMemo(
    () => [
      { name: "Bajo", value: Number(data?.low_risk ?? 0) },
      { name: "Medio", value: Number(data?.medium_risk ?? 0) },
      { name: "Alto", value: Number(data?.high_risk ?? 0) },
    ],
    [data]
  );

  const distributionChartData = useMemo(
    () => Object.entries(distribution ?? {}).map(([range, value]) => ({ range, value: Number(value) })),
    [distribution]
  );

  const trendChartData = useMemo(() => (trend ?? []).map((item) => ({ period: item.period, ipi: item.avg_ipi })), [trend]);

  const radarData = useMemo(() => {
    const scores = sessionQuality?.avg_dimension_scores;
    if (!scores) return [];
    return [
      { dimension: "Academico", score: Number(scores.academic ?? 0) },
      { dimension: "Autonomia", score: Number(scores.cognitive ?? 0) },
      { dimension: "Social", score: Number(scores.social ?? 0) },
      { dimension: "Bienestar", score: Number(scores.integration ?? 0) },
    ];
  }, [sessionQuality]);

  const dashboardReportContent = useMemo(() => {
    const avgIpi = Number(data?.avg_ipi ?? 0);
    const completeEvidence = Number(sessionQuality?.evidence_completeness ?? 0);
    const attendance = Number(data?.attendance_present_rate_last_30d ?? 0);
    const riskAvg = Number(data?.avg_risk_score ?? 0);
    return {
      headline_metrics: {
        evaluations: Number(data?.assessments_count ?? 0),
        improvement_pct: Math.max(0, Math.min(100, Math.round(avgIpi))),
        retention_rate: Math.max(0, Math.min(100, Math.round(attendance * 100))),
      },
      session_quality: {
        evidence_completeness: completeEvidence,
        attendance_present_rate: attendance,
        avg_mood: sessionQuality?.avg_mood ?? null,
        avg_sentiment: sessionQuality?.avg_sentiment ?? null,
      },
      risk_distribution: {
        bajo: Number(data?.low_risk ?? 0),
        medio: Number(data?.medium_risk ?? 0),
        alto: Number(data?.high_risk ?? 0),
      },
      narrative:
        impactStatement?.statement ??
        "Analitica consolidada del periodo seleccionado basada en asistencia, evaluaciones, progreso IPI y calidad de evidencia.",
      key_statements: [
        `Riesgo medio del periodo: ${riskAvg.toFixed(2)}.`,
        `Calidad de evidencia: ${Math.round(completeEvidence * 100)}%.`,
        `Observaciones analizadas: ${sessionQuality?.observations_count ?? 0}.`,
      ],
    };
  }, [data, impactStatement, sessionQuality]);

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return "-";
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  };

  if (isLoading) return <p>Cargando dashboard...</p>;

  return (
    <div className="grid dashboard-root">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Dashboard de analitica de impacto</h1>
        <span className="chip">Vista ejecutiva</span>
      </div>

      <div className="card dashboard-controls">
        <div className="grid grid-2">
          <label>
            Programa
            <div className="combo-field">
              <input
                list="dashboard-program-options"
                value={programInput}
                onChange={(e) => setProgramInput(e.target.value)}
                placeholder="Busca por nombre o ID"
              />
              <datalist id="dashboard-program-options">
                {programChoices.map((item) => (
                  <option key={item.id} value={item.label}>
                    {item.id}
                  </option>
                ))}
              </datalist>
            </div>
          </label>
          <div>
            Rango del informe
            <div className="dash-range-block">
              <div className="dash-range-head">
                <span className="muted">Desde: {formattedPeriodStart}</span>
                <span className="muted">Hasta: {formattedPeriodEnd}</span>
              </div>
              <div className="dash-range-track-wrap">
                <div className="dash-range-track-base" />
                <div
                  className="dash-range-track-active"
                  style={{
                    left: `${(startDayOffset / DASHBOARD_RANGE_DAYS) * 100}%`,
                    width: `${((endDayOffset - startDayOffset) / DASHBOARD_RANGE_DAYS) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={DASHBOARD_RANGE_DAYS}
                  step={1}
                  value={startDayOffset}
                  className="dash-range-slider dash-range-slider-start"
                  style={{ zIndex: startDayOffset > DASHBOARD_RANGE_DAYS - endDayOffset ? 5 : 3 }}
                  onInput={(e) => {
                    const next = Number((e.target as HTMLInputElement).value);
                    setStartDayOffset(Math.min(next, endDayOffset - 1));
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={DASHBOARD_RANGE_DAYS}
                  step={1}
                  value={endDayOffset}
                  className="dash-range-slider dash-range-slider-end"
                  style={{ zIndex: 4 }}
                  onInput={(e) => {
                    const next = Number((e.target as HTMLInputElement).value);
                    setEndDayOffset(Math.max(next, startDayOffset + 1));
                  }}
                />
              </div>
              <p className="muted" style={{ margin: "0.45rem 0 0" }}>
                Ventana seleccionada: {selectedRangeDays} dias
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-2" style={{ marginTop: "0.75rem" }}>
          <label>
            Coste total del periodo (EUR)
            <input
              type="number"
              min={0}
              step="100"
              value={periodCostEur}
              onChange={(e) => setPeriodCostEur(e.target.value)}
              placeholder="Ej. 18000"
            />
          </label>
          <label>
            Coste periodo comparador (EUR)
            <input
              type="number"
              min={0}
              step="100"
              value={comparatorCostEur}
              onChange={(e) => setComparatorCostEur(e.target.value)}
              placeholder="Ej. 15000"
            />
          </label>
        </div>
        <div className="dashboard-actions">
          <button
            onClick={() => setIsInsightsModalOpen(true)}
            disabled={!selectedProgramId}
            style={{ marginTop: "0.75rem" }}
          >
            Abrir informe completo
          </button>
          <Link to="/coordinator/reports" className="btn-secondary dashboard-link-btn">
            Ver informes guardados
          </Link>
        </div>
        {reportMessage && (
          <p style={{ color: reportMessageType === "error" ? "#b45309" : "#059669", marginTop: "0.6rem" }}>
            {reportMessage}
          </p>
        )}
      </div>

      <div className="card">
        <h3>
          Analisis de coste-efectividad (CEA){" "}
          <InfoHint text="Marco de evaluacion de eficiencia para relacionar recursos invertidos con resultados de mejora en el programa." />
        </h3>
        <p className="muted">
          Indicadores de eficiencia y resultado alineados con vocabulario de evaluacion de impacto social.
        </p>
        <div className="dashboard-kpi-grid" style={{ marginTop: "0.8rem" }}>
          <div className="card kpi-card">
            <div className="kpi-label">
              CPB (Cost per Beneficiary)
              <InfoHint text="Coste medio asignado a cada beneficiario atendido durante el periodo." />
            </div>
            <div className="metric-value">{formatCurrency(costEffectiveness?.cost_metrics.cost_per_beneficiary)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">
              CPI (Cost per Improved Participant)
              <InfoHint text="Coste medio asociado a cada participante que alcanza mejora significativa en el periodo." />
            </div>
            <div className="metric-value">{formatCurrency(costEffectiveness?.cost_metrics.cost_per_improved_participant)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">
              Cost per IPI Point
              <InfoHint text="Coste asociado al avance agregado en puntos de progreso integral del grupo." />
            </div>
            <div className="metric-value">{formatCurrency(costEffectiveness?.cost_metrics.cost_per_ipi_point_gained)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">
              OAR (Outcome Achievement Rate)
              <InfoHint text="Proporcion de participantes que alcanzan mejora significativa en el periodo evaluado." />
            </div>
            <div className="metric-value">{Math.round((costEffectiveness?.outcome_achievement_rate ?? 0) * 100)}%</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">
              IPI Gain vs Baseline
              <InfoHint text="Incremento medio de progreso integral frente a la referencia inicial del programa." />
            </div>
            <div className="metric-value">{(costEffectiveness?.avg_ipi_gain_vs_baseline ?? 0).toFixed(1)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">
              ICER vs periodo previo
              <InfoHint text="Coste incremental por unidad adicional de resultado frente al periodo comparador inmediato." />
            </div>
            <div className="metric-value">{formatCurrency(costEffectiveness?.cost_metrics.icer_vs_previous_period)}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-label">
            Participantes activos
            <InfoHint text="Total de participantes actualmente en seguimiento activo dentro del programa u organizacion." />
          </div>
          <div className="metric-value">{data?.participants_active ?? 0}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">
            Evaluaciones registradas
            <InfoHint text="Cantidad de evaluaciones periodicas registradas y disponibles para analisis." />
          </div>
          <div className="metric-value">{data?.assessments_count ?? 0}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">
            IPI medio
            <InfoHint text="Nivel general de progreso integral del grupo en una escala de 0 a 100." />
          </div>
          <div className="metric-value">{data?.avg_ipi ?? 0}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">
            Riesgo medio (0-1)
            <InfoHint text="Nivel medio de riesgo del grupo en una escala de 0 a 1; valores altos indican mayor prioridad de intervencion." />
          </div>
          <div className="metric-value">{data?.avg_risk_score ?? 0}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">
            Asistencia efectiva (30d)
            <InfoHint text="Presencia efectiva del grupo durante los ultimos 30 dias, incluyendo asistencia puntual o con retraso." />
          </div>
          <div className="metric-value">{Math.round((data?.attendance_present_rate_last_30d ?? 0) * 100)}%</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">
            Calidad de evidencia (30d)
            <InfoHint text="Nivel de calidad y utilidad de las observaciones registradas en los ultimos 30 dias." />
          </div>
          <div className="metric-value">{Math.round((data?.evidence_completeness_last_30d ?? 0) * 100)}%</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">
            Sesiones analizadas (periodo)
            <InfoHint text="Volumen de sesiones incluidas en el periodo seleccionado para la lectura analitica." />
          </div>
          <div className="metric-value">{sessionQuality?.observations_count ?? 0}</div>
        </div>
      </div>

      <div className="grid dashboard-chart-grid">
        <div className="card">
          <h3>
            Tendencia IPI <InfoHint text="Evolucion del progreso integral a lo largo del tiempo y direccion general del rendimiento del grupo." />
          </h3>
          <p className="muted">Si sube, el rendimiento escolar medio mejora en el periodo.</p>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ipi" name="IPI medio" stroke="#4f46e5" strokeWidth={3} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {impactStatement?.statement && <p className="insight-box">{impactStatement.statement}</p>}
        </div>
        <div className="card">
          <h3>
            Riesgo por nivel <InfoHint text="Reparto de participantes por nivel de riesgo: bajo, medio y alto." />
          </h3>
          <p className="muted">Bajo, medio y alto para priorizar intervenciones de apoyo.</p>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={riskChartData} dataKey="value" nameKey="name" outerRadius={96} label>
                  {riskChartData.map((entry, index) => (
                    <Cell key={entry.name} fill={RISK_COLORS[index % RISK_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>
            Distribucion IPI por rangos{" "}
            <InfoHint text="Distribucion del grupo por tramos de progreso para identificar concentraciones de rendimiento." />
          </h3>
          <p className="muted">Concentracion de participantes por tramo de rendimiento.</p>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={distributionChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" name="Participantes" radius={[6, 6, 0, 0]}>
                  {distributionChartData.map((item, index) => (
                    <Cell key={item.range} fill={DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>
            Calidad de sesion por dimension{" "}
            <InfoHint text="Nivel de calidad observado por dimension clave de la sesion: academico, autonomia, social y bienestar." />
          </h3>
          <p className="muted">Muestra score medio por dimension en el periodo seleccionado.</p>
          <div className="chart-wrap">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" />
                  <PolarRadiusAxis domain={[0, 5]} />
                  <Tooltip />
                  <Radar dataKey="score" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.45} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-box">No hay observaciones suficientes para este periodo.</div>
            )}
          </div>
        </div>
      </div>
      <ReportInsightsModal
        open={isInsightsModalOpen}
        title="Informe completo del periodo"
        content={dashboardReportContent}
        onClose={() => setIsInsightsModalOpen(false)}
        onSave={() => {
          if (!selectedProgramId) {
            setReportMessageType("error");
            setReportMessage("Selecciona un programa válido antes de guardar.");
            return;
          }
          if (periodEnd < periodStart) {
            setReportMessageType("error");
            setReportMessage("La fecha de fin no puede ser anterior a la fecha de inicio.");
            return;
          }
          setReportMessageType("");
          setReportMessage("");
          reportMutation.mutate(selectedProgramId);
        }}
        saveLabel="Guardar informe"
        saving={reportMutation.isPending}
      />
    </div>
  );
}
