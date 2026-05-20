import { apiClient } from "./client";

export async function getOrganizationPlan() {
  const { data } = await apiClient.get<{ organization_id: string; name: string; plan: string }>(
    "/organizations/me/plan"
  );
  return data;
}

export async function updateOrganizationPlan(plan: string) {
  const { data } = await apiClient.patch("/organizations/me/plan", { plan });
  return data;
}

export async function getOrgSettings() {
  const { data } = await apiClient.get<{ participant_code_pattern: string }>("/organization/settings");
  return data;
}

export async function updateOrgSettings(participant_code_pattern: string) {
  const { data } = await apiClient.patch("/organization/settings", { participant_code_pattern });
  return data;
}

export async function getLandingContent(orgSlug = "narinan") {
  const { data } = await apiClient.get<{ sections: unknown[] }>("/organization/landing", {
    params: { org_slug: orgSlug },
  });
  return data;
}

export async function updateLandingContent(landing_content: string) {
  const { data } = await apiClient.patch("/organization/landing", { landing_content });
  return data;
}
