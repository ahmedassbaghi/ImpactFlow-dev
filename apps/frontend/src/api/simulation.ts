import { apiClient } from "./client";

// ─── Status ───────────────────────────────────────────────────────────────────
export type SimulationStatus = {
  participants_active: number;
  participants_with_baseline: number;
  avg_sessions_per_participant: number;
  min_sessions: number;
  max_sessions: number;
  total_sessions: number;
  profile_options: Array<{ id: string; label: string; weight_pct: number }>;
};

// ─── Simulation params ────────────────────────────────────────────────────────
export type PeriodConfig = {
  weeks: number;
  intensity: number;  // 0.1 – 3.0
  label?: string;
};

export type SimulationPayload = {
  sessions_per_participant: number;
  run_mode?: "additive" | "fill";
  clear_existing_sessions?: boolean;
  program_id?: string;
  span_weeks?: number;
  absence_rate?: number;
  optimism_bias?: number;       // -1.0 to 1.0
  noise_level?: number;         // 0.2 to 2.5
  profile_weights?: Record<string, number>;
  period_configs?: PeriodConfig[];
  random_seed?: number;
};

export type SimulationResult = {
  participants_processed: number;
  sessions_created: number;
  observations_created: number;
  sessions_cleared: number;
  profile_counts: Record<string, number>;
  profile_ipi_start: Record<string, number[]>;
  profile_ipi_end: Record<string, number[]>;
  ipi_gain_avg: number;
  ipi_gain_by_profile: Record<string, number>;
  messages: string[];
};

// ─── Reset & seed ────────────────────────────────────────────────────────────
export type ResetAndSeedPayload = {
  n_participants: number;
  program_id?: string;
  random_seed?: number;
};

export type ResetAndSeedResult = {
  participants_created: number;
  program_name: string;
  school_name: string;
  baseline_ipi_avg: number;
  baseline_ipi_min: number;
  baseline_ipi_max: number;
  profile_counts: Record<string, number>;
  messages: string[];
};

// ─── Job ─────────────────────────────────────────────────────────────────────
export type LogEntry = {
  t: string;
  name: string;
  session: number;
  total: number;
  ipi: number;
  delta: string;
  profile: string;
  att: string;
};

export type SimulationJobStatus = {
  status: "pending" | "running" | "done" | "error";
  progress: number;
  current_name: string;
  participants_done: number;
  participants_total: number;
  sessions_created: number;
  log: LogEntry[];
  result: SimulationResult | null;
  error: string | null;
};

// ─── API functions ────────────────────────────────────────────────────────────

export async function getSimulationStatus(programId?: string): Promise<SimulationStatus> {
  const { data } = await apiClient.get<SimulationStatus>("/simulation/status", {
    params: programId ? { program_id: programId } : undefined,
  });
  return data;
}

export async function resetAndSeed(payload: ResetAndSeedPayload): Promise<ResetAndSeedResult> {
  const { data } = await apiClient.post<ResetAndSeedResult>("/simulation/reset-and-seed", payload);
  return data;
}

export async function startSimulationJob(payload: SimulationPayload): Promise<{ job_id: string }> {
  const { data } = await apiClient.post<{ job_id: string }>("/simulation/generate-async", payload);
  return data;
}

export async function getSimulationJob(jobId: string): Promise<SimulationJobStatus> {
  const { data } = await apiClient.get<SimulationJobStatus>(`/simulation/job/${jobId}`);
  return data;
}

export async function dedupePeriodicAssessments(programId?: string): Promise<{
  removed: number;
  message: string;
}> {
  const { data } = await apiClient.post<{ removed: number; message: string }>(
    "/simulation/dedupe-periodic",
    null,
    { params: programId ? { program_id: programId } : undefined }
  );
  return data;
}

// Legacy — still used by old synchronous path
export async function generateSimulation(payload: SimulationPayload): Promise<SimulationResult> {
  const { data } = await apiClient.post<SimulationResult>("/simulation/generate", payload);
  return data;
}
