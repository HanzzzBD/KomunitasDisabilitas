import {
  communityIdParamsSchema,
  communityTargetParamsSchema,
  communityFeedQuerySchema,
  paginationQuerySchema,
  communityFeedResponseSchema,
  communityPostResponseSchema,
  communityCommentResponseSchema,
  communityCommentListResponseSchema,
  communityReportResponseSchema,
  createCommunityPostSchema,
  updateCommunityPostSchema,
  createCommunityCommentSchema,
  updateCommunityCommentSchema,
  communityReasonInputSchema,
  type CommunityFeedQuery,
  type PaginationQuery,
  type CommunityReportTargetType,
  type CreateCommunityPost,
  type CreateCommunityComment,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
export { communityContentKeys } from "../community-query-keys.js";
function idPath(prefix: string, id: string) {
  communityIdParamsSchema.parse({ id });
  return `${prefix}/${id}`;
}
function params(input: { limit: number; cursor?: string; query?: string }) {
  const result = new URLSearchParams({ limit: String(input.limit) });
  if (input.cursor) result.set("cursor", input.cursor);
  if (input.query) result.set("query", input.query);
  return result;
}
export function listCommunityPosts(
  client: ApiClient,
  id: string,
  options: Partial<CommunityFeedQuery> = {},
  signal?: AbortSignal,
) {
  return client.request(
    `${idPath("/communities", id)}/posts?${params(communityFeedQuerySchema.parse(options))}`,
    { responseSchema: communityFeedResponseSchema, signal },
  );
}
export async function getCommunityPost(client: ApiClient, id: string, signal?: AbortSignal) {
  return (
    await client.request(idPath("/community-posts", id), {
      responseSchema: communityPostResponseSchema,
      signal,
    })
  ).data;
}
export async function createCommunityPost(
  client: ApiClient,
  communityId: string,
  input: CreateCommunityPost,
) {
  return (
    await client.request(`${idPath("/communities", communityId)}/posts`, {
      method: "POST",
      body: createCommunityPostSchema.parse(input),
      responseSchema: communityPostResponseSchema,
    })
  ).data;
}
export async function updateCommunityPost(
  client: ApiClient,
  id: string,
  input: CreateCommunityPost,
) {
  return (
    await client.request(idPath("/community-posts", id), {
      method: "PATCH",
      body: updateCommunityPostSchema.parse(input),
      responseSchema: communityPostResponseSchema,
    })
  ).data;
}
export async function deleteCommunityPost(client: ApiClient, id: string) {
  return (
    await client.request(idPath("/community-posts", id), {
      method: "DELETE",
      responseSchema: communityPostResponseSchema,
    })
  ).data;
}
export function listCommunityComments(
  client: ApiClient,
  id: string,
  options: Partial<PaginationQuery> = {},
  signal?: AbortSignal,
) {
  return client.request(
    `${idPath("/community-posts", id)}/comments?${params(paginationQuerySchema.parse(options))}`,
    { responseSchema: communityCommentListResponseSchema, signal },
  );
}
export async function getCommunityComment(client: ApiClient, id: string, signal?: AbortSignal) {
  return (
    await client.request(idPath("/community-comments", id), {
      responseSchema: communityCommentResponseSchema,
      signal,
    })
  ).data;
}
export async function createCommunityComment(
  client: ApiClient,
  postId: string,
  input: CreateCommunityComment,
) {
  return (
    await client.request(`${idPath("/community-posts", postId)}/comments`, {
      method: "POST",
      body: createCommunityCommentSchema.parse(input),
      responseSchema: communityCommentResponseSchema,
    })
  ).data;
}
export async function updateCommunityComment(
  client: ApiClient,
  id: string,
  input: CreateCommunityComment,
) {
  return (
    await client.request(idPath("/community-comments", id), {
      method: "PATCH",
      body: updateCommunityCommentSchema.parse(input),
      responseSchema: communityCommentResponseSchema,
    })
  ).data;
}
export async function deleteCommunityComment(client: ApiClient, id: string) {
  return (
    await client.request(idPath("/community-comments", id), {
      method: "DELETE",
      responseSchema: communityCommentResponseSchema,
    })
  ).data;
}
export async function reportCommunityContent(
  client: ApiClient,
  targetType: CommunityReportTargetType,
  targetId: string,
  input: { reason: string },
) {
  communityTargetParamsSchema.parse({ targetType, targetId });
  return (
    await client.request(`/community-content/${targetType}/${targetId}/reports`, {
      method: "POST",
      body: communityReasonInputSchema.parse(input),
      responseSchema: communityReportResponseSchema,
    })
  ).data;
}
