import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { apiClient } from "../../api/client";
import { VolunteerPageHeader } from "../../components/voluntari/VolunteerPageHeader";
import { PremiumSelect } from "../../components/voluntari/PremiumSelect";

async function getProfessionalDashboard(programId?: string, schoolId?: string) {
  const { data } = await apiClient.get("/dashboard/professional", {
    params: { program_id: programId, school_id: schoolId },
  });
  return data as {
    avg_ipi: number;
    trend: Array<{ period: string; avg_ipi: number }>;
    by_school: Array<{ school_id: string; name: string; abbreviation: string; avg_ipi: number }>;
    by_program: Array<{ program_id: string; name: string; avg_ipi: number }>;
    n_participants: number;
  };
}

export default function ProgressPage() {
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

  const avgIpi = data?.avg_ipi;
  const hasIpi = avgIpi != null && avgIpi > 0;
  const programName = programs.find((p) => p.id === programId)?.name;

  return (
    <div className="vol-page">
      <VolunteerPageHeader
        title="Progrés"
        subtitle="Evolució del grup per escola i programa. Selecciona un programa per veure l'IPI mitjà."
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
          label="Escola"
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
          <p className="vol-kpi-hint">L'IPI mitjà es calcula a partir de les avaluacions del programa triat.</p>
        </div>
      ) : (
        <>
          <div className={`vol-kpi${!hasIpi ? " vol-kpi--empty" : ""}`} role="status" aria-live="polite">
            <div className="vol-kpi-value">{hasIpi ? avgIpi!.toFixed(1) : "—"}</div>
            <div className="vol-kpi-label">
              IPI mitjà{programName ? ` · ${programName}` : ""}
            </div>
            <p className="vol-kpi-hint">
              {data?.n_participants ?? 0} alumnes
              {hasIpi ? " amb avaluacions registrades" : " · encara sense avaluacions en aquest programa"}
            </p>
          </div>

          {!!data?.trend?.length && (
            <section className="vol-progress-section vol-card" aria-labelledby="trend-heading">
              <h2 id="trend-heading">Tendència IPI</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} />
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
                    stroke="#f58220"
                    strokeWidth={2.5}
                    dot={{ fill: "#f58220", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          {!!data?.by_school?.length && (
            <section className="vol-progress-section vol-card" aria-labelledby="school-heading">
              <h2 id="school-heading">Per escola</h2>
              <ResponsiveContainer width="100%" height={Math.max(180, data.by_school.length * 44)}>
                <BarChart data={data.by_school} layout="vertical" margin={{ left: 4, right: 12 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis
                    type="category"
                    dataKey="abbreviation"
                    width={48}
                    tick={{ fontSize: 11, fill: "#0f172a" }}
                  />
                  <Tooltip />
                  <Bar dataKey="avg_ipi" fill="#f58220" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          {!!data?.by_program?.length && (
            <section className="vol-progress-section vol-card" aria-labelledby="program-heading">
              <h2 id="program-heading">Per programa</h2>
              <ResponsiveContainer width="100%" height={Math.max(160, data.by_program.length * 48)}>
                <BarChart data={data.by_program} margin={{ bottom: 48, left: 0, right: 8 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  <Bar dataKey="avg_ipi" fill="#3b82f6" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}
        </>
      )}
    </div>
  );
}
