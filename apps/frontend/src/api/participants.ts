import { apiClient } from "./client";

export type Participant = {
  id: string;
  code: string;
  first_name: string;
  nationality?: string;
  enrollment_date: string;
  is_control_group: boolean;
  active: boolean;
};

export async function listParticipants(programId?: string): Promise<Participant[]> {
  const { data } = await apiClient.get<Participant[]>("/participants", { params: { program_id: programId } });
  return data;
}

export async function createParticipant(payload: {
  program_id: string;
  code: string;
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

export async function getParticipantEvolution(participantId: string) {
  const { data } = await apiClient.get(`/participants/${participantId}/evolution`);
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
