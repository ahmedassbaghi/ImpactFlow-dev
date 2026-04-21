import { apiClient } from "./client";

export type OrganizationPlan = {
  organization_id: string;
  name: string;
  plan: "free" | "starter" | "pro" | "enterprise";
};

export async function getOrganizationPlan(): Promise<OrganizationPlan> {
  const { data } = await apiClient.get<OrganizationPlan>("/organizations/me/plan");
  return data;
}

export async function updateOrganizationPlan(plan: OrganizationPlan["plan"]) {
  const { data } = await apiClient.patch<OrganizationPlan>("/organizations/me/plan", { plan });
  return data;
}
