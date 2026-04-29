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

export type SessionListItem = {
  id: string;
  program_id: string;
  session_date: string;
  session_type: string;
  duration_minutes: number | null;
  notes: string | null;
  notes_ai_summary: string | null;
  notes_sentiment: number | null;
};

export async function createSession(payload: CreateSessionPayload) {
  const { data } = await apiClient.post("/sessions", payload);
  return data;
}

export type SessionObservation = {
  id: string;
  participant_id: string;
  academic_score: number | null;
  cognitive_score: number | null;
  social_score: number | null;
  integration_score: number | null;
  qualitative_note: string | null;
  mood_indicator: string | null;
};

export async function listSessions(filters?: {
  program_id?: string;
  participant_id?: string;
  date_from?: string;
  date_to?: string;
}): Promise<SessionListItem[]> {
  const { data } = await apiClient.get<SessionListItem[]>("/sessions", { params: filters });
  return data;
}

export async function getSessionObservations(sessionId: string): Promise<SessionObservation[]> {
  const { data } = await apiClient.get<SessionObservation[]>(`/sessions/${sessionId}/observations`);
  return data;
}
