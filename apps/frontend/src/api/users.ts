import { apiClient } from "./client";

export type UserItem = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

export async function listUsers(): Promise<UserItem[]> {
  const { data } = await apiClient.get<UserItem[]>("/users");
  return data;
}

export async function createUser(payload: {
  email: string;
  full_name: string;
  role: string;
  password: string;
}) {
  const { data } = await apiClient.post<UserItem>("/users", payload);
  return data;
}
