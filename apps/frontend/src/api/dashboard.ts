import { apiClient } from "./client";

export async function getCoordinatorDashboard(periodStart?: string, periodEnd?: string) {
  const { data } = await apiClient.get("/dashboard/coordinator", {
    params: { period_start: periodStart, period_end: periodEnd },
  });
  return data;
}

export async function getIpiDistribution(programId: string, periodStart?: string, periodEnd?: string) {
  const { data } = await apiClient.get("/analytics/ipi-distribution", {
    params: { program_id: programId, period_start: periodStart, period_end: periodEnd },
  });
  return data as Record<string, number>;
}

export async function getAnalyticsTrend(programId: string, months = 6) {
  const { data } = await apiClient.get("/analytics/trend", { params: { program_id: programId, months } });
  return data as Array<{ period: string; avg_ipi: number }>;
}

export async function getImpactStatement(programId: string) {
  const { data } = await apiClient.get("/analytics/impact-statement", { params: { program_id: programId } });
  return data as { statement: string };
}

export async function getSessionQuality(programId: string, periodStart: string, periodEnd: string) {
  const { data } = await apiClient.get("/analytics/session-quality", {
    params: { program_id: programId, period_start: periodStart, period_end: periodEnd },
  });
  return data as {
    observations_count: number;
    avg_dimension_scores: { academic?: number; cognitive?: number; social?: number; integration?: number };
    session_type_distribution: Record<string, number>;
    avg_sentiment: number | null;
    avg_mood: number | null;
    evidence_completeness: number;
    attendance_present_rate: number;
  };
}

export async function getCostEffectiveness(
  programId: string,
  periodStart: string,
  periodEnd: string,
  totalCostEur: number,
  comparatorCostEur: number
) {
  const { data } = await apiClient.get("/analytics/cost-effectiveness", {
    params: {
      program_id: programId,
      period_start: periodStart,
      period_end: periodEnd,
      total_cost_eur: totalCostEur,
      comparator_cost_eur: comparatorCostEur,
    },
  });
  return data as {
    methodology: string;
    standards_reference: string[];
    beneficiaries_n: number;
    improved_participants_n?: number;
    outcome_achievement_rate: number;
    avg_ipi_gain_vs_baseline: number;
    high_risk_share: number;
    comparator_outcome_achievement_rate: number;
    cost_metrics: {
      total_cost_eur: number;
      comparator_cost_eur: number;
      cost_per_beneficiary: number | null;
      cost_per_improved_participant: number | null;
      cost_per_ipi_point_gained: number | null;
      icer_vs_previous_period: number | null;
    };
  };
}

export async function getDonorDashboard(orgSlug: string) {
  const { data } = await apiClient.get(`/dashboard/donor/${orgSlug}`);
  return data;
}


export async function getInterventionEffect(
  programId: string,
  periodStart?: string,
  periodEnd?: string
) {
  const { data } = await apiClient.get("/analytics/intervention-effect", {
    params: { program_id: programId, period_start: periodStart, period_end: periodEnd },
  });
  return data;
}

export async function getCohortTrajectories(programId: string) {
  const { data } = await apiClient.get("/analytics/cohort-trajectories", {
    params: { program_id: programId },
  });
  return data;
}

export async function getCohortRetention(programId: string) {
  const { data } = await apiClient.get("/analytics/cohort-retention", {
    params: { program_id: programId },
  });
  return data;
}

export async function getDimensionVelocity(programId: string) {
  const { data } = await apiClient.get("/analytics/dimension-velocity", {
    params: { program_id: programId },
  });
  return data;
}
