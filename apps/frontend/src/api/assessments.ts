import { apiClient } from "./client";

export async function createFollowUpAssessment(payload: {
  participant_id: string;
  program_id: string;
  assessment_date: string;
  period_label?: string;
  academic_score?: number;
  cognitive_score?: number;
  social_score?: number;
  integration_score?: number;
  notes?: string;
}) {
  const { data } = await apiClient.post("/assessments/follow-up", payload);
  return data;
}
