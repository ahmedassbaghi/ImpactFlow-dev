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
