import { apiClient } from "./client";

export type GradeLevel = {
  key: string;
  label: string;
  order: number;
  stage: string;
};

export async function listGradeLevels(): Promise<GradeLevel[]> {
  const { data } = await apiClient.get<GradeLevel[]>("/grade-levels");
  return data;
}
