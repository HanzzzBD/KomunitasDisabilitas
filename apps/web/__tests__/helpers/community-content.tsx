import { vi } from "vitest";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient, type RequestOptions } from "@nawasena/api-client";
import type {
  Community,
  CommunityPost,
  CommunityComment,
  CommunityMembership,
} from "@nawasena/schemas";
import { Providers } from "../../src/app/providers.js";
import { createQueryClient } from "../../src/app/query-client.js";
import { ruteApp } from "../../src/app/routes.js";
import { useStoreSesi } from "../../src/shared/sesi/store.js";
import {
  COMMUNITY_UJI as ROOM,
  COMMUNITY_POST_UJI as POST,
  COMMUNITY_COMMENT_UJI as COMMENT,
} from "../../e2e/community-fixture.js";

export const SUB = POST.author!.id;
export function bukaDiskusi(
  path = `/community/${ROOM.slug}`,
  options: {
    guest?: boolean;
    recovering?: boolean;
    room?: Community;
    post?: CommunityPost;
    comment?: CommunityComment;
    member?: CommunityMembership | null;
    handler?: (path: string, init?: RequestOptions<unknown>) => unknown;
  } = {},
) {
  if (options.recovering) useStoreSesi.setState({ status: "memulihkan" });
  else if (options.guest) useStoreSesi.getState().keluar();
  else useStoreSesi.getState().masuk(`a.${btoa(JSON.stringify({ sub: SUB, role: "seeker" }))}.b`);
  let post = options.post ?? POST;
  let comment = options.comment ?? COMMENT;
  const room = options.room ?? ROOM;
  let comments = [comment];
  const request = vi.fn(async (path: string, init?: RequestOptions<unknown>) => {
    const custom = options.handler?.(path, init);
    if (custom !== undefined) return await custom;
    if (path === "/auth/refresh") return new Promise(() => {});
    if (path === "/me") return { data: { id: SUB, role: "seeker", fullName: "Rina Pratiwi" } };
    if (path === "/me/accessibility") return { data: {} };
    if (path.startsWith("/me/notifications"))
      return { data: [], meta: { nextCursor: null, unreadCount: 0 } };
    if (path === `/communities/${room.slug}` || path === `/communities/by-id/${room.id}`)
      return { data: room };
    if (path === `/communities/${room.id}/membership`)
      return {
        data:
          options.member === undefined
            ? { communityId: room.id, status: "active", joinedAt: room.createdAt }
            : options.member,
      };
    if (path.startsWith(`/communities/${room.id}/posts?`))
      return { data: [post], meta: { nextCursor: null } };
    if (path === `/communities/${room.id}/posts` && init?.method === "POST") {
      post = {
        ...POST,
        id: "01912345-89ab-7def-8123-4567890acd03",
        body: (init.body as { body: string }).body,
      };
      return { data: post };
    }
    if (path === `/community-posts/${POST.id}`) {
      if (init?.method === "PATCH") post = { ...post, body: (init.body as { body: string }).body };
      if (init?.method === "DELETE") post = { ...post, body: "", status: "removed" };
      return { data: post };
    }
    if (path.startsWith(`/community-posts/${POST.id}/comments?`))
      return { data: comments, meta: { nextCursor: null } };
    if (path === `/community-posts/${POST.id}/comments` && init?.method === "POST") {
      comment = {
        ...COMMENT,
        id: "01912345-89ab-7def-8123-4567890acd04",
        author: POST.author,
        body: (init.body as { body: string }).body,
      };
      comments = [...comments, comment];
      return { data: comment };
    }
    if (path === `/community-comments/${COMMENT.id}`) {
      if (init?.method === "PATCH")
        comment = { ...comment, body: (init.body as { body: string }).body };
      if (init?.method === "DELETE") comment = { ...comment, body: "", status: "removed" };
      return { data: comment };
    }
    if (path.includes("/reports"))
      return {
        data: {
          id: POST.id,
          targetType: "post",
          targetId: POST.id,
          status: "open",
          createdAt: ROOM.createdAt,
        },
      };
    throw new ApiError(
      { code: "KONTEN_KOMUNITAS_TIDAK_DITEMUKAN", message: "Tulisan tidak tersedia" },
      404,
    );
  });
  const cache = createQueryClient();
  cache.setDefaultOptions({
    queries: { retry: false, staleTime: 60_000 },
    mutations: { retry: false },
  });
  const router = createMemoryRouter(ruteApp, { initialEntries: [path] });
  const rendered = render(
    <Providers queryClient={cache} klienApi={{ request } as ApiClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { unmount: rendered.unmount, router, cache, request };
}
