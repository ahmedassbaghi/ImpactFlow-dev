import { apiClient } from "./client";

export type ObservationPayload = {
  participant_id: string;
  academic_score?: number;
  cognitive_score?: number;
  social_score?: number;
  integration_score?: number;
  qualitative_note?: string;
  mood_indicator?: string;
  attendance_status: string;
};

export type CreateSessionPayload = {
  program_id: string;
  session_date: string;
  session_type: string;
  duration_minutes?: number;
  notes?: string;
  observations: ObservationPayload[];
  micro_goal_completions?: Array<{ goal_id: string; note?: string }>;
};

export async function createSession(payload: CreateSessionPayload) {
  const { data } = await apiClient.post("/sessions", payload);
  return data;
}
