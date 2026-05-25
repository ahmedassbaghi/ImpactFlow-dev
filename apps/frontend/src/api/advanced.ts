import { apiClient } from "./client";

export type DimensionEffect = {
  n: number;
  dz: number | null;
  mean_diff: number | null;
  sd_diff?: number;
  p_value: number | null;
  ci_95: [number | null, number | null];
  interpretation: string;
  color: "muted" | "warn" | "info" | "good";
  baseline_mean: number | null;
  post_mean: number | null;
  is_significant?: boolean;
};

export type DimensionEffectsResult = {
  dimensions: Record<"academic" | "cognitive" | "social" | "integration", DimensionEffect>;
  n: number;
  strongest_dimension: string | null;
  strongest_dz: number | null;
  weakest_dimension: string | null;
  weakest_dz: number | null;
  methodology: string;
};

export type DoseResponseResult = {
  dose_type: string;
  vmax: number | null;
  k_half: number | null;
  optimal_dose_90pct: number | null;
  r_squared: number | null;
  n_observations: number;
  curve_points: { dose: number; gain: number }[];
  observed_points: { dose: number; gain: number }[];
  interpretation: string;
  interpretation_plain?: string;
  interpretation_dose?: string;
  model: string;
};

export type MonteCarloSROIResult = {
  n_iter: number;
  mean: number;
  median: number;
  se_mean: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  prob_above_1: number;
  prob_above_2: number;
  central_estimate: number;
  distribution_bins: { x: number; count: number }[];
  interpretation: string;
  methodology?: string;
  inputs?: {
    n_participants: number;
    n_sessions_central: number;
    program_duration_months: number;
    central_cost_eur: number;
    avg_ipi_gain_mean: number;
    avg_duration_h: number;
  };
};

export type AnomalyAlert = {
  participant_id: string;
  participant_code: string;
  participant_name: string;
  type: "plateau" | "regression" | "breakthrough";
  severity: number;
  message: string;
  n_observations: number;
  current_ipi: number;
  trajectory: { date: string; ipi: number }[];
};

export type AnomalyResult = {
  program_id: string;
  n_participants_scanned: number;
  counts: {
    plateau: number;
    regression: number;
    breakthrough: number;
    stable: number;
    insufficient: number;
  };
  alerts: AnomalyAlert[];
  methodology: string;
};

export async function getDimensionEffects(programId: string): Promise<DimensionEffectsResult> {
  const { data } = await apiClient.get<DimensionEffectsResult>("/analytics/dimension-effects", {
    params: { program_id: programId },
  });
  return data;
}

export async function getDoseResponse(
  programId: string,
  doseType: "sessions" | "hours" = "sessions"
): Promise<DoseResponseResult> {
  const { data } = await apiClient.get<DoseResponseResult>("/analytics/dose-response", {
    params: { program_id: programId, dose_type: doseType },
  });
  return data;
}

export type ProgramSroiSnapshot = {
  sroi_ratio: number;
  sroi_statement: string;
  total_social_value_eur: number;
  total_investment_eur: number;
  outcomes_breakdown?: Record<string, number>;
  formula_explanation?: import("./dashboard").SroiFormulaExplanation;
  dose_metrics?: {
    baseline_sessions: number;
    sessions_registered: number;
    sessions_effective: number;
    dose_ratio: number;
    dose_outcomes_multiplier: number;
    sessions_per_participant: number;
  };
  n_participants: number;
  avg_ipi_gain: number;
  program_duration_months: number;
  sensitivity_analysis?: { conservative: number; central: number; optimistic: number };
};

/** SROI del període (mateix endpoint que el dashboard del coordinador). */
export async function getProgramSroi(
  programId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ProgramSroiSnapshot> {
  const { data } = await apiClient.get("/analytics/sroi", {
    params: {
      program_id: programId,
      period_start: periodStart,
      period_end: periodEnd,
    },
  });
  return data as ProgramSroiSnapshot;
}

export async function getMonteCarloSROI(
  programId: string,
  options?: {
    costEur?: number;
    months?: number;
    periodStart?: string;
    periodEnd?: string;
    nIter?: number;
  }
): Promise<MonteCarloSROIResult> {
  const { data } = await apiClient.get<MonteCarloSROIResult>("/analytics/sroi-monte-carlo", {
    params: {
      program_id: programId,
      ...(options?.costEur != null && options.costEur > 0
        ? { cost_eur: options.costEur }
        : {}),
      ...(options?.months != null ? { months: options.months } : {}),
      ...(options?.periodStart && options?.periodEnd
        ? { period_start: options.periodStart, period_end: options.periodEnd }
        : {}),
      n_iter: options?.nIter ?? 5000,
    },
  });
  return data;
}

export async function getTrajectoryAnomalies(programId: string): Promise<AnomalyResult> {
  const { data } = await apiClient.get<AnomalyResult>("/analytics/trajectory-anomalies", {
    params: { program_id: programId },
  });
  return data;
}
