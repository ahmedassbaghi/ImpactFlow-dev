import { apiClient } from "./client";

export type MicroGoal = {
  id: string;
  program_id: string;
  title: string;
  description?: string | null;
  dimension: string;
  difficulty: number;
  target_date?: string | null;
  active: boolean;
  created_at: string;
  completions_count: number;
  last_completed_at?: string | null;
};

export async function listMicroGoals(params?: { programId?: string; activeOnly?: boolean }) {
  const { data } = await apiClient.get<MicroGoal[]>("/micro-goals", {
    params: {
      program_id: params?.programId,
      active_only: params?.activeOnly ?? true,
    },
  });
  return data;
}

export async function listMicroGoalTemplates() {
  const { data } = await apiClient.get<Array<{ dimension: string; title: string; difficulty: number }>>(
    "/micro-goals/templates"
  );
  return data;
}

export async function createMicroGoal(payload: {
  program_id: string;
  title: string;
  description?: string;
  dimension: string;
  difficulty: number;
  target_date?: string;
}) {
  const { data } = await apiClient.post("/micro-goals", payload);
  return data;
}

// ── Individualised micro-goals (per participant, used by SessionLogger GAS) ──
export type IndividualMicroGoal = {
  id: string;
  participant_id: string;
  program_id: string;
  title: string;
  description: string | null;
  dimension: "academic" | "cognitive" | "social" | "integration";
  difficulty: number;
  target_date: string | null;
  active: boolean;
};

export async function listParticipantActiveGoals(
  participantId: string,
  programId?: string,
): Promise<IndividualMicroGoal[]> {
  const { data } = await apiClient.get<IndividualMicroGoal[]>(
    `/participants/${participantId}/active-goals`,
    { params: programId ? { program_id: programId } : undefined },
  );
  return data;
}

export async function createIndividualMicroGoal(payload: {
  participant_id: string;
  program_id: string;
  title: string;
  description?: string;
  dimension: "academic" | "cognitive" | "social" | "integration";
  difficulty: number;
  target_date?: string;
}): Promise<IndividualMicroGoal> {
  const { data } = await apiClient.post<IndividualMicroGoal>(
    "/micro-goals/individual",
    payload,
  );
  return data;
}

export async function updateIndividualMicroGoal(
  goalId: string,
  payload: Partial<{
    title: string;
    description: string;
    dimension: string;
    difficulty: number;
    target_date: string | null;
    active: boolean;
  }>,
): Promise<IndividualMicroGoal> {
  const { data } = await apiClient.patch<IndividualMicroGoal>(
    `/micro-goals/individual/${goalId}`,
    payload,
  );
  return data;
}
