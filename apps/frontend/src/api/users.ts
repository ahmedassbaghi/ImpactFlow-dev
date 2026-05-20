import { apiClient } from "./client";
import type { Participant } from "./participants";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

export async function listUsers(): Promise<User[]> {
  const { data } = await apiClient.get<User[]>("/users");
  return data;
}

export async function createUser(payload: {
  email: string;
  full_name: string;
  role: string;
  password: string;
}) {
  const { data } = await apiClient.post("/users", payload);
  return data;
}

export async function getUserAssignments(userId: string): Promise<Participant[]> {
  const { data } = await apiClient.get<Participant[]>(`/users/${userId}/participants`);
  return data;
}

export async function setUserAssignments(userId: string, participantIds: string[]) {
  const { data } = await apiClient.put(`/users/${userId}/participants`, {
    participant_ids: participantIds,
  });
  return data;
}
