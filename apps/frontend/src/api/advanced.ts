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

export async function getMonteCarloSROI(
  programId: string,
  costEur: number,
  months: number = 9,
  nIter: number = 5000
): Promise<MonteCarloSROIResult> {
  const { data } = await apiClient.get<MonteCarloSROIResult>("/analytics/sroi-monte-carlo", {
    params: { program_id: programId, cost_eur: costEur, months, n_iter: nIter },
  });
  return data;
}

export async function getTrajectoryAnomalies(programId: string): Promise<AnomalyResult> {
  const { data } = await apiClient.get<AnomalyResult>("/analytics/trajectory-anomalies", {
    params: { program_id: programId },
  });
  return data;
}
