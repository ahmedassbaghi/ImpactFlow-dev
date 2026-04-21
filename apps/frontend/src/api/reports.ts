import { apiClient } from "./client";

export async function generateReport(payload: {
  program_id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  title: string;
}) {
  const { data } = await apiClient.post("/reports/generate", payload);
  return data;
}

export async function downloadReport(reportId: string) {
  const { data } = await apiClient.get(`/reports/${reportId}/download`);
  return data as { report_id: string; title: string; content: any };
}

export type ReportListItem = {
  id: string;
  title: string;
  status: string;
  report_type: string;
  period_start: string;
  period_end: string;
  created_at: string;
  created_by_name: string;
  program_id?: string | null;
  program_name?: string | null;
};

export async function listReports(limit = 100) {
  const { data } = await apiClient.get<ReportListItem[]>("/reports", { params: { limit } });
  return data;
}
