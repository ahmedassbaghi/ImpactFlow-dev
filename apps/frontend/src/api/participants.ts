import { apiClient } from "./client";

export type Participant = {
  id: string;
  code: string;
  first_name: string;
  nationality?: string;
  enrollment_date: string;
  is_control_group: boolean;
  active: boolean;
  school_id: string;
  school_name?: string;
  school_abbreviation?: string;
};

export async function listParticipants(params?: {
  programId?: string;
  schoolId?: string;
  notInProgram?: string;
}): Promise<Participant[]> {
  const { data } = await apiClient.get<Participant[]>("/participants", {
    params: {
      program_id: params?.programId,
      school_id: params?.schoolId,
      not_in_program: params?.notInProgram,
    },
  });
  return data;
}

export async function updateParticipant(
  id: string,
  payload: Partial<{ school_id: string; first_name: string; code: string; active: boolean }>
) {
  const { data } = await apiClient.patch<Participant>(`/participants/${id}`, payload);
  return data;
}

export async function previewNextCode(schoolId: string): Promise<string> {
  const { data } = await apiClient.post<{ code: string }>("/participants/next-code", null, {
    params: { school_id: schoolId },
  });
  return data.code;
}

export async function createParticipant(payload: {
  program_id?: string;
  school_id: string;
  code?: string;
  first_name: string;
  birth_year?: number;
  gender?: string;
  nationality?: string;
  enrollment_date: string;
  consent_given: boolean;
  is_control_group: boolean;
}) {
  const { data } = await apiClient.post("/participants", payload);
  return data;
}

export type BaselinePayload = {
  participant_id: string;
  program_id: string;
  assessment_date: string;
  reading_level?: number;
  math_level?: number;
  comprehension_level?: number;
  attention_level?: number;
  memory_level?: number;
  autonomy_level?: number;
  peer_interaction?: number;
  group_work?: number;
  emotional_regulation?: number;
  language_fluency?: number;
  cultural_adaptation?: number;
  notes?: string;
};

export async function createBaseline(participantId: string, payload: BaselinePayload) {
  const { data } = await apiClient.post(`/participants/${participantId}/baseline`, payload);
  return data;
}

export type ParticipantEvolution = {
  participant_id: string;
  program_id?: string | null;
  code: string;
  first_name: string;
  school_abbreviation?: string | null;
  school_name?: string | null;
  baseline_ipi: number | null;
  current_ipi: number | null;
  history?: Array<{
    date: string;
    period_label?: string;
    ipi_score: number;
    delta_vs_baseline?: number | null;
    risk_level?: string | null;
  }>;
  timeline?: Array<{
    date: string;
    period_label?: string;
    ipi_score: number;
  }>;
  dimensions_baseline?: Record<string, number | null>;
  dimensions_current?: Record<string, number | null>;
  weeks_in_program?: number | null;
  trend?: string;
  prediction?: { predicted_ipi?: number | null; trend?: string };
};

export async function getParticipant(participantId: string): Promise<Participant> {
  const { data } = await apiClient.get<Participant>(`/participants/${participantId}`);
  return data;
}

export type SessionContext = {
  has_previous: boolean;
  baseline_ipi: number | null;
  previous_ipi?: number | null;
  previous_date?: string | null;
  last_session_date?: string | null;
  previous_dimensions?: Record<string, number | null>;
  previous_dimensions_1_5?: Record<string, number | null>;
  max_session_ipi_step?: number;
};

export async function getParticipantSessionContext(
  participantId: string,
  programId: string,
  sessionDate?: string
): Promise<SessionContext> {
  const { data } = await apiClient.get<SessionContext>(
    `/participants/${participantId}/session-context`,
    {
      params: {
        program_id: programId,
        ...(sessionDate ? { session_date: sessionDate } : {}),
      },
    }
  );
  return data;
}

export async function getParticipantEvolution(participantId: string, programId?: string) {
  const { data } = await apiClient.get<ParticipantEvolution>(
    `/participants/${participantId}/evolution`,
    { params: programId ? { program_id: programId } : undefined }
  );
  return data;
}

export async function getParticipantRisk(participantId: string, programId: string) {
  const { data } = await apiClient.get(`/participants/${participantId}/risk`, {
    params: { program_id: programId },
  });
  return data;
}

export async function getParticipantPredictionProbabilistic(
  participantId: string,
  params?: { weeks_ahead?: number; target_ipi?: number; confidence?: number }
) {
  const { data } = await apiClient.get(
    `/participants/${participantId}/prediction-probabilistic`,
    { params }
  );
  return data;
}

export async function getDropoutProbability(participantId: string, programId: string) {
  const { data } = await apiClient.get(
    `/analytics/dropout-probability/${participantId}`,
    { params: { program_id: programId } }
  );
  return data;
}

export async function getParticipantCluster(participantId: string, programId: string) {
  const { data } = await apiClient.get(
    `/participants/${participantId}/profile-cluster`,
    { params: { program_id: programId } }
  );
  return data;
}

export async function getParticipantSegments(programId: string) {
  const { data } = await apiClient.get("/analytics/participant-segments", {
    params: { program_id: programId },
  });
  return data;
}

export async function getParticipantPrograms(participantId: string) {
  const { data } = await apiClient.get(`/participants/${participantId}/programs`);
  return data as Array<{ id: string; name: string; active: boolean }>;
}

export async function getEnrolledParticipants(programId: string): Promise<Participant[]> {
  const { data } = await apiClient.get<Participant[]>(`/programs/${programId}/participants`);
  return data;
}

export async function enrollParticipant(programId: string, participantId: string): Promise<void> {
  await apiClient.post(`/programs/${programId}/participants`, { participant_id: participantId });
}

export async function unenrollParticipant(programId: string, participantId: string): Promise<void> {
  await apiClient.delete(`/programs/${programId}/participants/${participantId}`);
}
