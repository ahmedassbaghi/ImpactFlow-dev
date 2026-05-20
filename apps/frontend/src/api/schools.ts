import { apiClient } from "./client";
import type { Participant } from "./participants";

export type School = {
  id: string;
  name: string;
  abbreviation: string;
  active: boolean;
  participant_count: number;
};

export async function listSchools(): Promise<School[]> {
  const { data } = await apiClient.get<School[]>("/schools");
  return data;
}

export async function createSchool(payload: { name: string; abbreviation: string }) {
  const { data } = await apiClient.post<School>("/schools", {
    ...payload,
    abbreviation: payload.abbreviation.toUpperCase(),
  });
  return data;
}

export async function updateSchool(
  id: string,
  payload: Partial<{ name: string; abbreviation: string; active: boolean }>
) {
  const body = { ...payload };
  if (body.abbreviation) body.abbreviation = body.abbreviation.toUpperCase();
  const { data } = await apiClient.patch<School>(`/schools/${id}`, body);
  return data;
}

export async function deleteSchool(id: string) {
  await apiClient.delete(`/schools/${id}`);
}

export async function listSchoolParticipants(schoolId: string): Promise<Participant[]> {
  const { data } = await apiClient.get<Participant[]>(`/schools/${schoolId}/participants`);
  return data;
}
