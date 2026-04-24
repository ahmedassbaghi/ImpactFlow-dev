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
