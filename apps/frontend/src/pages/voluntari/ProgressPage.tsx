import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { apiClient } from "../../api/client";
import { VolunteerPageHeader } from "../../components/voluntari/VolunteerPageHeader";
import { PremiumSelect } from "../../components/voluntari/PremiumSelect";
import { VolunteerParticipantRow } from "../../components/voluntari/VolunteerParticipantRow";

type ParticipantProgress = {
  participant_id: string;
  code: string;
  first_name: string;
  school_abbreviation?: string | null;
  baseline_ipi: number | null;
  current_ipi: number | null;
  delta_vs_baseline: number | null;
};

type ProfessionalDashboard = {
  avg_ipi: number;
  trend: Array<{ period: string; avg_ipi: number }>;
  by_school: Array<{ school_id: string; name: string; abbreviation: string; avg_ipi: number }>;
  by_program: Array<{ program_id: string; name: string; avg_ipi: number }>;
  by_participant: ParticipantProgress[];
  comparison: {
    baseline_avg: number | null;
    current_avg: number | null;
    avg_delta: number | null;
    n_with_baseline: number;
    n_with_current: number;
    n_improving: number;
    n_declining: number;
    n_stable: number;
  };
  n_participants: number;
};

async function getProfessionalDashboard(programId?: string, schoolId?: string) {
  const { data } = await apiClient.get("/dashboard/professional", {
    params: { program_id: programId, school_id: schoolId },
  });
  return data as ProfessionalDashboard;
}

function shortName(first: string, max = 14) {
  const s = first.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatDelta(delta: number | null | undefined) {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}`;
}

export default function ProgressPage() {
  const navigate = useNavigate();
  const [programId, setProgramId] = useState("");
  const [schoolId, setSchoolId] = useState("");

  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => listPrograms(true) });
  const { data: schools = [] } = useQuery({ queryKey: ["schools"], queryFn: listSchools });

  useEffect(() => {
    if (!programId && programs.length > 0) {
      setProgramId(programs[0].id);
    }
  }, [programs, programId]);

  const { data, isLoading } = useQuery({
    queryKey: ["professional-dashboard", programId, schoolId],
    queryFn: () => getProfessionalDashboard(programId || undefined, schoolId || undefined),
    enabled: !!programId,
  });

  const programName = programs.find((p) => p.id === programId)?.name;
  const comparison = data?.comparison;
  const students = data?.by_participant ?? [];

  const compareChartData = useMemo(() => {
    return students
      .filter((s) => s.current_ipi != null)
      .slice(0, 12)
      .map((s) => ({
        name: shortName(s.first_name),
        baseline: s.baseline_ipi ?? 0,
        actual: s.current_ipi ?? 0,
      }));
  }, [students]);

  const schoolsWithData = (data?.by_school ?? []).filter((s) => s.avg_ipi > 0);

  return (
    <div className="vol-page">
      <VolunteerPageHeader
        title="Progrés"
        subtitle="Consulta l'IPI dels teus alumnes assignats: comparativa abans/ara i llista per persona."
      />

      <div className="vol-filter-strip">
        <PremiumSelect
          label="Programa"
          value={programId}
          onChange={setProgramId}
          options={[
            { value: "", label: "Selecciona un programa…" },
            ...programs.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <PremiumSelect
          label="Escola (filtre)"
          value={schoolId}
          onChange={setSchoolId}
          options={[
            { value: "", label: "Totes les escoles" },
            ...schools.map((s) => ({
              value: s.id,
              label: `${s.abbreviation} — ${s.name}`,
            })),
          ]}
          disabled={!programId}
        />
      </div>

      {isLoading ? (
        <p className="vol-empty">Carregant dades…</p>
      ) : !programId ? (
        <div className="vol-kpi vol-kpi--empty" role="status">
          <div className="vol-kpi-value">—</div>
          <div className="vol-kpi-label">Selecciona un programa</div>
          <p className="vol-kpi-hint">Tria el programa per veure el progrés dels alumnes assignats.</p>
        </div>
      ) : (
        <>
          <div className="vol-compare-kpis" role="group" aria-label="Resum comparatiu del grup">
            <div className="vol-compare-kpi">
              <span className="vol-compare-kpi-val">
                {comparison?.current_avg != null ? comparison.current_avg.toFixed(1) : "—"}
              </span>
              <span className="vol-compare-kpi-lbl">IPI mitjà ara</span>
            </div>
            <div className="vol-compare-kpi">
              <span className="vol-compare-kpi-val">
                {comparison?.baseline_avg != null ? comparison.baseline_avg.toFixed(1) : "—"}
              </span>
              <span className="vol-compare-kpi-lbl">IPI mitjà entrada</span>
            </div>
            <div className="vol-compare-kpi">
              <span
                className={`vol-compare-kpi-val${
                  (comparison?.avg_delta ?? 0) > 0
                    ? " vol-compare-kpi-val--up"
                    : (comparison?.avg_delta ?? 0) < 0
                      ? " vol-compare-kpi-val--down"
                      : ""
                }`}
              >
                {comparison?.avg_delta != null ? formatDelta(comparison.avg_delta) : "—"}
              </span>
              <span className="vol-compare-kpi-lbl">Canvi mitjà (pts)</span>
            </div>
          </div>

          <p className="vol-kpi-hint" style={{ marginTop: "-0.25rem" }}>
            {data?.n_participants ?? 0} alumnes assignats i inscrits al programa
            {programName ? ` · ${programName}` : ""}
            {comparison && comparison.n_with_current > 0 && (
              <>
                {" "}
                · {comparison.n_improving} milloren, {comparison.n_stable} estables,{" "}
                {comparison.n_declining} baixen
              </>
            )}
          </p>

          {!!data?.trend?.length && (
            <section className="vol-progress-section vol-card" aria-labelledby="trend-heading">
              <h2 id="trend-heading">Evolució del grup</h2>
              <p className="vol-section-hint">IPI mitjà de tots els alumnes amb avaluacions al llarg del temps.</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      fontSize: "0.88rem",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_ipi"
                    name="IPI mitjà"
                    stroke="#f58220"
                    strokeWidth={2.5}
                    dot={{ fill: "#f58220", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          {compareChartData.length > 0 && (
            <section className="vol-progress-section vol-card" aria-labelledby="compare-heading">
              <h2 id="compare-heading">Comparativa per alumne</h2>
              <p className="vol-section-hint">
                IPI d&apos;entrada (gris) i última avaluació vàlida (taronja), una per alumne i data. Fins a
                12 alumnes.
              </p>
              <ResponsiveContainer width="100%" height={Math.max(200, compareChartData.length * 36)}>
                <BarChart data={compareChartData} layout="vertical" margin={{ left: 4, right: 12, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fontSize: 11, fill: "#0f172a" }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                  <Bar dataKey="baseline" name="Entrada" fill="#94a3b8" radius={3} />
                  <Bar dataKey="actual" name="Ara" fill="#f58220" radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          <section className="vol-list-section" aria-labelledby="students-heading">
            <div className="vol-list-section-head">
              <h2 id="students-heading" className="vol-list-section-title">
                Per alumne
              </h2>
              <span className="vol-list-count">{students.length}</span>
            </div>
            {students.length === 0 ? (
              <p className="vol-empty">
                Encara no hi ha avaluacions per als alumnes d&apos;aquest programa. Registra sessions o una
                avaluació trimestral.
              </p>
            ) : (
              <div className="vol-person-list">
                {students.map((s) => {
                  const meta =
                    s.current_ipi != null
                      ? `IPI ${s.current_ipi.toFixed(0)} · ${formatDelta(s.delta_vs_baseline)} vs entrada`
                      : "Sense IPI encara";
                  return (
                    <VolunteerParticipantRow
                      key={s.participant_id}
                      id={s.participant_id}
                      firstName={s.first_name}
                      code={s.code}
                      schoolAbbreviation={s.school_abbreviation}
                      meta={meta}
                      actionLabel="Perfil"
                      onAction={() => navigate(`/coordinator/participants/${s.participant_id}`)}
                      onRowClick={() => navigate(`/coordinator/participants/${s.participant_id}`)}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {schoolsWithData.length >= 2 && (
            <section className="vol-progress-section vol-card" aria-labelledby="school-heading">
              <h2 id="school-heading">Resum per escola</h2>
              <p className="vol-section-hint">Només escoles amb alumnes assignats i dades d&apos;IPI.</p>
              <ResponsiveContainer width="100%" height={Math.max(160, schoolsWithData.length * 40)}>
                <BarChart data={schoolsWithData} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis
                    type="category"
                    dataKey="abbreviation"
                    width={48}
                    tick={{ fontSize: 11, fill: "#0f172a" }}
                  />
                  <Tooltip />
                  <Bar dataKey="avg_ipi" name="IPI mitjà" fill="#3b82f6" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

        </>
      )}
    </div>
  );
}
