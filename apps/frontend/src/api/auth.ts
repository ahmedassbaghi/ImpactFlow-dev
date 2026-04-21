import { apiClient } from "./client";

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
  user_id: string;
};

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", { email, password });
  return data;
}
