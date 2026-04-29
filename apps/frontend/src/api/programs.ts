import { apiClient } from "./client";

export type Program = {
  id: string;
  name: string;
  description?: string;
  program_type: string;
  start_date?: string;
  end_date?: string;
  active: boolean;
};

export async function listPrograms(activeOnly = true): Promise<Program[]> {
  const { data } = await apiClient.get<Program[]>("/programs", { params: { active_only: activeOnly } });
  return data;
}

export async function createProgram(payload: {
  name: string;
  description?: string;
  program_type?: string;
  start_date: string;
  end_date?: string;
}): Promise<Program> {
  const { data } = await apiClient.post<Program>("/programs", payload);
  return data;
}

export async function getProgram(id: string): Promise<Program> {
  const { data } = await apiClient.get<Program>(`/programs/${id}`);
  return data;
}

export async function updateProgram(
  id: string,
  payload: Partial<{ name: string; description: string; program_type: string; start_date: string; end_date: string; active: boolean }>
): Promise<Program> {
  const { data } = await apiClient.put<Program>(`/programs/${id}`, payload);
  return data;
}

export async function deleteProgram(id: string): Promise<void> {
  await apiClient.delete(`/programs/${id}`);
}
