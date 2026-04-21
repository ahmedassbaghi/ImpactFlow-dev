import { apiClient } from "./client";

export type Program = {
  id: string;
  name: string;
  program_type: string;
  active: boolean;
};

export async function listPrograms(activeOnly = true): Promise<Program[]> {
  const { data } = await apiClient.get<Program[]>("/programs", { params: { active_only: activeOnly } });
  return data;
}
