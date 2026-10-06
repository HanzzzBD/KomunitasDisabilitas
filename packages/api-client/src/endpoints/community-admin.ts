import {
  communityAdminListQuerySchema,
  communityListResponseSchema,
  communityResponseSchema,
  communityIdParamsSchema,
  createCommunitySchema,
  updateCommunitySchema,
  communityReportListQuerySchema,
  communityQueueResponseSchema,
  communityQueueDetailResponseSchema,
  communityMetricsResponseSchema,
  communityTargetParamsSchema,
  communityContentResponseSchema,
  communityModerationInputSchema,
  communityReasonInputSchema,
  type CommunityAdminListQuery,
  type CommunityReportListQuery,
  type CreateCommunity,
  type UpdateCommunity,
  type CommunityReportTargetType,
  type CommunityModerationAction,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

export const communityAdminKeys = {
  all: () => queryKey("community-admin"),
  rooms: (userId: string, filter: Partial<CommunityAdminListQuery> = {}) =>
    ["community-admin", userId, "rooms", filter] as const,
  room: (userId: string, id: string) => ["community-admin", userId, "room", id] as const,
  queue: (userId: string, filter: Partial<CommunityReportListQuery> = {}) =>
    ["community-admin", userId, "queue", filter] as const,
  report: (userId: string, id: string) => ["community-admin", userId, "report", id] as const,
  content: (userId: string, type: CommunityReportTargetType, id: string) =>
    ["community-admin", userId, "content", type, id] as const,
  metrics: (userId: string) => ["community-admin", userId, "metrics"] as const,
};
const idPath = (id: string) => {
  communityIdParamsSchema.parse({ id });
  return encodeURIComponent(id);
};
function query(input: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined) params.set(key, String(value));
  return params;
}
export function listCommunitiesAdmin(
  client: ApiClient,
  options: Partial<CommunityAdminListQuery> = {},
  signal?: AbortSignal,
) {
  return client.request(
    `/admin/communities?${query(communityAdminListQuerySchema.parse(options))}`,
    { responseSchema: communityListResponseSchema, signal },
  );
}
export async function getCommunityAdmin(client: ApiClient, id: string, signal?: AbortSignal) {
  return (
    await client.request(`/admin/communities/${idPath(id)}`, {
      responseSchema: communityResponseSchema,
      signal,
    })
  ).data;
}
export async function createCommunityAdmin(client: ApiClient, input: CreateCommunity) {
  return (
    await client.request("/admin/communities", {
      method: "POST",
      body: createCommunitySchema.parse(input),
      responseSchema: communityResponseSchema,
    })
  ).data;
}
export async function updateCommunityAdmin(client: ApiClient, id: string, input: UpdateCommunity) {
  return (
    await client.request(`/admin/communities/${idPath(id)}`, {
      method: "PATCH",
      body: updateCommunitySchema.parse(input),
      responseSchema: communityResponseSchema,
    })
  ).data;
}
export async function archiveCommunityAdmin(client: ApiClient, id: string) {
  return (
    await client.request(`/admin/communities/${idPath(id)}`, {
      method: "DELETE",
      responseSchema: communityResponseSchema,
    })
  ).data;
}
export function listCommunityQueue(
  client: ApiClient,
  options: Partial<CommunityReportListQuery> = {},
  signal?: AbortSignal,
) {
  return client.request(
    `/admin/community-queue?${query(communityReportListQuerySchema.parse(options))}`,
    { responseSchema: communityQueueResponseSchema, signal },
  );
}
export async function getCommunityQueueReport(client: ApiClient, id: string, signal?: AbortSignal) {
  return (
    await client.request(`/admin/community-queue/${idPath(id)}`, {
      responseSchema: communityQueueDetailResponseSchema,
      signal,
    })
  ).data;
}
export async function getCommunityMetrics(client: ApiClient, signal?: AbortSignal) {
  return (
    await client.request("/admin/community-metrics", {
      responseSchema: communityMetricsResponseSchema,
      signal,
    })
  ).data;
}
function target(type: CommunityReportTargetType, id: string) {
  communityTargetParamsSchema.parse({ targetType: type, targetId: id });
  return `/admin/community-content/${type}/${id}`;
}
export async function getCommunityContentAdmin(
  client: ApiClient,
  type: CommunityReportTargetType,
  id: string,
  signal?: AbortSignal,
) {
  return (
    await client.request(target(type, id), {
      responseSchema: communityContentResponseSchema,
      signal,
    })
  ).data;
}
export async function moderateCommunityContentAdmin(
  client: ApiClient,
  type: CommunityReportTargetType,
  id: string,
  action: CommunityModerationAction,
  reason: string,
) {
  return (
    await client.request(`${target(type, id)}/moderate`, {
      method: "POST",
      body: communityModerationInputSchema.parse({ action, reason }),
      responseSchema: communityContentResponseSchema,
    })
  ).data;
}
export async function rejectCommunityReportAdmin(client: ApiClient, id: string, reason: string) {
  return (
    await client.request(`/admin/community-queue/${idPath(id)}/reject`, {
      method: "POST",
      body: communityReasonInputSchema.parse({ reason }),
      responseSchema: communityQueueDetailResponseSchema,
    })
  ).data;
}
