import { apiClient } from "./client";

export type GoalProgressPayload = {
  micro_goal_id: string;
  progress: number; // GAS scale: -2..+2
  note?: string;
};

export type ObservationPayload = {
  participant_id: string;
  academic_score?: number;
  cognitive_score?: number;
  social_score?: number;
  integration_score?: number;
  qualitative_note?: string;
  mood_indicator?: string;
  attendance_status: string;
  // Bespoke session-registration fields (all optional, server-defaults safe).
  arrival_mood?: string;
  departure_mood?: string;
  verbal_participation?: number; // 0..3
  time_on_task_pct?: number;     // 0..100
  flag_alert?: boolean;
  self_eval_emoji?: string;
  goal_progress?: GoalProgressPayload[];
  volunteer_progress_sense?: "progressed" | "similar" | "step_back";
};

export type CreateSessionPayload = {
  program_id: string;
  session_date: string;
  session_time?: string;
  session_type: string;
  duration_minutes?: number;
  notes?: string;
  observations: ObservationPayload[];
  micro_goal_completions?: Array<{ goal_id: string; note?: string }>;
  activity_tag_ids?: string[];
};

export type SessionParticipantBrief = {
  id: string;
  first_name: string;
  code: string;
};

export type SessionListItem = {
  id: string;
  program_id: string;
  session_date: string;
  session_time?: string | null;
  session_type: string;
  duration_minutes: number | null;
  notes: string | null;
  notes_ai_summary: string | null;
  notes_sentiment: number | null;
  activity_tag_ids?: string[];
  participants?: SessionParticipantBrief[];
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
  arrival_mood?: string | null;
  departure_mood?: string | null;
  verbal_participation?: number | null;
  time_on_task_pct?: number | null;
  flag_alert?: boolean;
  self_eval_emoji?: string | null;
  goal_progress?: Array<{ micro_goal_id: string; progress: number; note: string | null }>;
};

export async function listSessions(filters?: {
  program_id?: string;
  participant_id?: string;
  school_id?: string;
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
