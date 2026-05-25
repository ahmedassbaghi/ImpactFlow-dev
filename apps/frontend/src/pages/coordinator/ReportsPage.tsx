import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { downloadReport, listReports } from "../../api/reports";
import { ReportInsightsModal } from "../../components/reports/ReportInsightsModal";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ca-ES");
}

export default function ReportsPage() {
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedContent, setSelectedContent] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["reports-list"],
    queryFn: () => listReports(200),
  });

  const openReportMutation = useMutation({
    mutationFn: (reportId: string) => downloadReport(reportId),
    onSuccess: (payload) => {
      setSelectedTitle(payload.title);
      setSelectedContent(payload.content);
      setIsModalOpen(true);
    },
  });

  if (isLoading) return <p>Carregant informes…</p>;

  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Informes generats</h1>
        <span className="chip">Historial</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Títol</th>
                <th>Autor</th>
                <th>Data</th>
                <th>Període</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((report) => (
                <tr key={report.id} onClick={() => openReportMutation.mutate(report.id)} className="reports-row-clickable">
                  <td>{report.title}</td>
                  <td>{report.created_by_name}</td>
                  <td>{formatDate(report.created_at)}</td>
                  <td>
                    {formatDate(report.period_start)} - {formatDate(report.period_end)}
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: "1rem" }}>
                    Encara no hi ha informes desats.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReportInsightsModal
        open={isModalOpen}
        title={selectedTitle || "Informe"}
        content={selectedContent}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
