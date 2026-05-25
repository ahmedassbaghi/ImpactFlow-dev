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
  periodEnd: string
) {
  const { data } = await apiClient.get("/analytics/cost-effectiveness", {
    params: {
      program_id: programId,
      period_start: periodStart,
      period_end: periodEnd,
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
    period_investment?: {
      n_sessions: number;
      cost_per_session_eur: number;
      total_cost_eur: number;
      auto_calculated: boolean;
    };
    comparator_investment?: {
      n_sessions: number;
      total_cost_eur: number;
      auto_calculated: boolean;
    };
  };
}

export type SroiFormulaExplanation = {
  headline: string;
  numerator_eur: number;
  denominator_eur: number;
  ratio: number;
  numerator_components: Array<{
    key: string;
    label: string;
    short: string;
    hint: string;
    color: string;
    eur: number;
    share_pct: number;
  }>;
  denominator_components: Array<{
    id: string;
    label: string;
    eur: number;
    formula_text: string;
  }>;
  inputs: Record<string, number>;
  corrections: {
    deadweight_pct: number;
    attribution_pct: number;
    drop_off_pct: number;
    combined_multiplier: number;
    note: string;
  };
  saturation_note: string;
  sensitivity: Record<string, number>;
  methodology_reference: string;
};

export async function getPeriodSroi(programId: string, periodStart: string, periodEnd: string) {
  const { data } = await apiClient.get("/analytics/sroi", {
    params: {
      program_id: programId,
      period_start: periodStart,
      period_end: periodEnd,
    },
  });
  return data as {
    sroi_ratio: number;
    sroi_statement: string;
    total_social_value_eur: number;
    total_investment_eur: number;
    value_breakdown: Record<string, number>;
    n_participants: number;
    avg_ipi_gain: number;
    program_duration_months: number;
    period_investment?: {
      n_sessions: number;
      cost_per_session_eur: number;
      marginal_cost_per_session_eur?: number;
      monthly_fixed_cost_per_participant_eur?: number;
      total_cost_eur: number;
      auto_calculated: boolean;
      volunteer_reference_value_eur?: number;
    };
    outcomes_breakdown?: Record<string, number>;
    formula_explanation?: SroiFormulaExplanation;
    sensitivity_analysis?: { conservative: number; central: number; optimistic: number };
  };
}

export async function getDonorDashboard(orgSlug: string, programId?: string) {
  const { data } = await apiClient.get(`/dashboard/donor/${orgSlug}`, {
    params: programId ? { program_id: programId } : undefined,
  });
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

export type NgoSroiCalculator = {
  model_explanation?: {
    input_label: string;
    output_label: string;
    ratio_label: string;
    excluded_note: string;
  };
  methodology_reference: string;
  program: {
    n_participants: number;
    n_sessions: number;
    total_volunteer_hours: number;
    imputed_volunteer_cost_eur?: number;
    imputed_program_cost_eur?: number;
    hourly_rate_eur: number;
    avg_duration_h: number;
    program_duration_months: number;
    avg_ipi_gain: number;
  };
  impact: {
    outcomes_value_eur: number;
    family_benefit_eur: number;
    collective_benefit_eur: number;
    outcomes_breakdown?: Record<string, number>;
    sroi_per_euro_invested: number;
    sroi_statement: string;
    total_value_eur?: number;
    economic_value_eur?: number;
    social_value_eur?: number;
    value_breakdown?: Record<string, number>;
    sroi_ratio_imputed?: number;
    sroi_outcomes_only?: number;
    sroi_statement_imputed?: string;
  };
  money_calculator: {
    contribution_eur: number;
    family_benefit_eur: number;
    collective_benefit_eur: number;
    total_benefit_eur: number;
    value_per_euro: number;
    share_of_program_pct?: number;
    statement: string;
    note: string;
    social_value_eur?: number;
    economic_value_eur?: number;
    total_value_eur?: number;
  };
  volunteer_calculator: {
    volunteer_hours: number;
    family_benefit_eur: number;
    collective_benefit_eur: number;
    total_benefit_eur: number;
    family_benefit_per_hour_eur?: number;
    collective_benefit_per_hour_eur?: number;
    outcomes_per_hour_eur?: number;
    statement: string;
    note: string;
    social_value_eur?: number;
    economic_value_eur?: number;
    total_value_eur?: number;
    social_value_per_hour_eur?: number;
    economic_value_per_hour_eur?: number;
    total_value_per_hour_eur?: number;
  };
  sensitivity_analysis?: Record<string, number>;
};

export async function getDonorSROICalculator(
  orgSlug: string,
  opts: {
    contributionEur?: number;
    volunteerHours?: number;
    programId?: string;
  } = {}
) {
  const { data } = await apiClient.get<NgoSroiCalculator>(
    `/dashboard/donor/${orgSlug}/sroi-calculator`,
    {
      params: {
        contribution_eur: opts.contributionEur ?? 1000,
        volunteer_hours: opts.volunteerHours ?? 1,
        program_id: opts.programId,
      },
    }
  );
  return data;
}

/** @deprecated Usa getDonorSROICalculator */
export async function getDonorSROI(
  orgSlug: string,
  costEur?: number,
  months?: number,
  programId?: string
) {
  const { data } = await apiClient.get(`/dashboard/donor/${orgSlug}/sroi`, {
    params: {
      ...(costEur != null && costEur > 0 ? { cost_eur: costEur } : {}),
      ...(months != null ? { months } : {}),
      ...(programId ? { program_id: programId } : {}),
    },
  });
  return data;
}

export async function getSROI(programId: string, costEur: number, months: number) {
  const { data } = await apiClient.get("/analytics/sroi", {
    params: { program_id: programId, cost_eur: costEur, months },
  });
  return data as {
    total_social_value_eur: number;
    total_investment_eur: number;
    sroi_ratio: number;
    sroi_statement: string;
    value_breakdown: Record<string, number>;
    sensitivity_analysis: { conservative: number; central: number; optimistic: number };
    methodology_reference: string;
    deadweight_factor: number;
    attribution_factor: number;
    n_participants: number;
    avg_ipi_gain: number;
    program_duration_months: number;
  };
}

export async function getInterRaterReliability(programId: string) {
  const { data } = await apiClient.get("/analytics/inter-rater-reliability", {
    params: { program_id: programId },
  });
  return data as {
    overall_icc: number;
    icc_by_dimension: Record<string, number>;
    icc_interpretation: string;
    n_raters: number;
    n_observations: number;
    bias_alerts: Array<{ rater_id: string; bias_type: string; dimension: string }>;
    icc_computable?: boolean;
    overlap_targets?: number;
    overlap_by_dimension?: Record<string, number>;
    message?: string;
  };
}

export async function getEvidenceExport(
  programId: string,
  periodStart?: string,
  periodEnd?: string,
  costEur?: number,
) {
  const { data } = await apiClient.get("/analytics/evidence-export", {
    params: {
      program_id: programId,
      period_start: periodStart,
      period_end: periodEnd,
      cost_eur: costEur,
    },
  });
  return data;
}

export async function getPublicPrograms(orgSlug: string) {
  const { data } = await apiClient.get(`/organization/${orgSlug}/programs/public`);
  return data as Array<{ id: string; name: string }>;
}
