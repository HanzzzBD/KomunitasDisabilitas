import {
  communityIdParamsSchema,
  communityListQuerySchema,
  communityListResponseSchema,
  communityMembershipResponseSchema,
  communityResponseSchema,
  communitySlugParamsSchema,
  type CommunityListQuery,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

export type OpsiDaftarCommunity = Partial<CommunityListQuery>;
export const communityKeys = {
  lists: () => queryKey("communities"),
  list: (filter: OpsiDaftarCommunity = {}) => queryKey("communities", filter),
  detail: (slug: string) => queryKey("community", { slug }),
  byId: (id: string) => queryKey("community-by-id", { id }),
  // Private state is scoped to the account, never just the room.
  membership: (userId: string, communityId: string) =>
    queryKey("community-membership", { userId, communityId }),
};

export async function getCommunityById(client: ApiClient, id: string, signal?: AbortSignal) {
  communityIdParamsSchema.parse({ id });
  const response = await client.request(`/communities/by-id/${id}`, {
    responseSchema: communityResponseSchema,
    signal,
  });
  return response.data;
}

export function listCommunities(
  client: ApiClient,
  options: OpsiDaftarCommunity = {},
  signal?: AbortSignal,
) {
  const parsed = communityListQuerySchema.parse(options);
  const query = new URLSearchParams({ limit: String(parsed.limit) });
  if (parsed.type) query.set("type", parsed.type);
  if (parsed.city) query.set("city", parsed.city);
  if (parsed.cursor) query.set("cursor", parsed.cursor);
  return client.request(`/communities?${query}`, {
    responseSchema: communityListResponseSchema,
    signal,
  });
}

export async function getCommunity(client: ApiClient, slug: string, signal?: AbortSignal) {
  communitySlugParamsSchema.parse({ slug });
  const response = await client.request(`/communities/${encodeURIComponent(slug)}`, {
    responseSchema: communityResponseSchema,
    signal,
  });
  return response.data;
}

function membershipPath(id: string) {
  communityIdParamsSchema.parse({ id });
  return `/communities/${encodeURIComponent(id)}`;
}

export async function getMyCommunityMembership(
  client: ApiClient,
  id: string,
  signal?: AbortSignal,
) {
  const response = await client.request(`${membershipPath(id)}/membership`, {
    responseSchema: communityMembershipResponseSchema,
    signal,
  });
  return response.data;
}

export async function joinCommunity(client: ApiClient, id: string) {
  const response = await client.request(`${membershipPath(id)}/join`, {
    method: "POST",
    responseSchema: communityMembershipResponseSchema,
  });
  return response.data;
}

export async function leaveCommunity(client: ApiClient, id: string) {
  const response = await client.request(`${membershipPath(id)}/membership`, {
    method: "DELETE",
    responseSchema: communityMembershipResponseSchema,
  });
  return response.data;
}
