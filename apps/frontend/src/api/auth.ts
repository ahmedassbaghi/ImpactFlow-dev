import { apiClient } from "./client";

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: string;
  user_id: string;
};

export async function login(login: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", {
    login: login.trim(),
    password,
  });
  return data;
}

export type RegisterPayload = {
  email: string;
  full_name: string;
  username: string;
  password: string;
  organization_slug?: string;
};

export type RegisterResponse = {
  id: string;
  email: string;
  full_name: string;
  username: string;
  message: string;
};

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const { data } = await apiClient.post<RegisterResponse>("/auth/register", {
    organization_slug: "narinan",
    ...payload,
  });
  return data;
}
