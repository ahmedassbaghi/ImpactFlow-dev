import { apiClient } from "./client";

export type SessionActivityTag = {
  id: string;
  slug: string;
  label: string;
  color: string | null;
  dimensions: string[];
  active: boolean;
};

export async function listSessionActivityTags(activeOnly = true): Promise<SessionActivityTag[]> {
  const { data } = await apiClient.get<SessionActivityTag[]>("/session-activity-tags", {
    params: { active_only: activeOnly },
  });
  return data;
}

export async function createSessionActivityTag(payload: {
  slug: string;
  label: string;
  color?: string;
  dimensions?: string[];
}): Promise<SessionActivityTag> {
  const { data } = await apiClient.post<SessionActivityTag>("/session-activity-tags", payload);
  return data;
}

export async function updateSessionActivityTag(
  id: string,
  payload: Partial<{ label: string; color: string; dimensions: string[]; active: boolean }>,
): Promise<SessionActivityTag> {
  const { data } = await apiClient.patch<SessionActivityTag>(
    `/session-activity-tags/${id}`,
    payload,
  );
  return data;
}
