import { apiClient } from "./client";
import type { AcademicYearItem } from "../stores/academicYearStore";

export type AcademicYear = AcademicYearItem;

export async function listAcademicYears(): Promise<AcademicYear[]> {
  const { data } = await apiClient.get<AcademicYear[]>("/academic-years");
  return data;
}

export async function suggestAcademicYear(): Promise<{
  title: string;
  start_date: string;
  end_date: string;
}> {
  const { data } = await apiClient.get("/academic-years/suggest");
  return data;
}

export async function createAcademicYear(payload: {
  title: string;
  start_date: string;
  end_date: string;
  is_current?: boolean;
}) {
  const { data } = await apiClient.post<AcademicYear>("/academic-years", payload);
  return data;
}

export async function updateAcademicYear(
  id: string,
  payload: Partial<{ title: string; start_date: string; end_date: string; is_current: boolean }>
) {
  const { data } = await apiClient.patch<AcademicYear>(`/academic-years/${id}`, payload);
  return data;
}

export async function deleteAcademicYear(id: string) {
  await apiClient.delete(`/academic-years/${id}`);
}

export async function setCurrentAcademicYear(id: string) {
  const { data } = await apiClient.post<AcademicYear>(`/academic-years/${id}/set-current`);
  return data;
}

export type YearStudent = {
  participant_id: string;
  code: string;
  first_name: string;
  school_name: string | null;
  grade_key: string | null;
  grade_label: string | null;
  grade_status: string | null;
};

export async function listYearStudents(yearId: string): Promise<YearStudent[]> {
  const { data } = await apiClient.get<YearStudent[]>(`/academic-years/${yearId}/students`);
  return data;
}

export type PromoteItem = {
  participant_id: string;
  code: string;
  first_name: string;
  current_grade_key: string | null;
  current_grade_label: string | null;
  proposed_grade_key: string | null;
  proposed_grade_label: string | null;
  action: string;
};

export async function promoteStudents(
  yearId: string,
  execute: boolean,
  overrides?: { participant_id: string; action: string }[]
) {
  const { data } = await apiClient.post(`/academic-years/${yearId}/promote-students`, {
    execute,
    overrides,
  });
  return data as {
    preview: PromoteItem[];
    applied: number;
    skipped: number;
    no_next_level: string[];
  };
}
