import { apiClient } from "./client";

export type HealthResponse = {
  status: string;
  database: string;
  environment: string;
  websocket: boolean;
  demo_mode: boolean;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>("/health", {
    headers: { "X-Silent": "true" },
  });
  return data;
}

export async function demoSeed(): Promise<void> {
  await apiClient.post("/demo/seed");
}
