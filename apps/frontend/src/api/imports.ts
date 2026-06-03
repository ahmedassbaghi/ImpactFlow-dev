import { apiClient } from "./client";

export async function getImportFormat() {
  const { data } = await apiClient.get<{ description: string; example: object }>("/imports/format");
  return data;
}

export async function validateImport(data: object, source_filename?: string) {
  const { data: res } = await apiClient.post("/imports/validate", { data, source_filename });
  return res as { valid: boolean; errors: { section: string; field: string; message: string; index?: number }[]; warnings: string[] };
}

export async function previewImport(data: object, source_filename?: string) {
  const { data: res } = await apiClient.post("/imports/preview", { data, source_filename });
  return res;
}

export async function commitImport(data: object, source_filename?: string) {
  const { data: res } = await apiClient.post("/imports/commit", { data, source_filename });
  return res;
}

export async function listImportHistory() {
  const { data } = await apiClient.get("/imports/history");
  return data;
}
