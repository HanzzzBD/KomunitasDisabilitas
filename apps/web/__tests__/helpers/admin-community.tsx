import { vi } from "vitest";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient, RequestOptions } from "@nawasena/api-client";
import type { Community, CommunityPost, CommunityQueueReport } from "@nawasena/schemas";
import { Providers } from "../../src/app/providers.js";
import { createQueryClient } from "../../src/app/query-client.js";
import { ruteApp } from "../../src/app/routes.js";
import { useStoreSesi } from "../../src/shared/sesi/store.js";
import {
  COMMUNITY_UJI,
  COMMUNITY_POST_UJI,
  COMMUNITY_COMMENT_UJI,
} from "../../e2e/community-fixture.js";
import { COMMUNITY_REPORT_UJI, COMMUNITY_METRICS_UJI } from "../../e2e/admin-community-fixture.js";
export function bukaAdminCommunity(
  path = "/admin/community",
  options: {
    role?: string;
    guest?: boolean;
    report?: CommunityQueueReport;
    post?: CommunityPost;
    handler?: (p: string, o?: RequestOptions<unknown>) => unknown;
  } = {},
) {
  const role = options.role ?? "admin";
  const sub = COMMUNITY_POST_UJI.author!.id;
  if (options.guest) useStoreSesi.getState().keluar();
  else useStoreSesi.getState().masuk(`a.${btoa(JSON.stringify({ sub, role }))}.b`);
  let room: Community = { ...COMMUNITY_UJI };
  let report = { ...(options.report ?? COMMUNITY_REPORT_UJI) };
  let post = { ...(options.post ?? COMMUNITY_POST_UJI) };
  const request = vi.fn(async (p: string, o?: RequestOptions<unknown>) => {
    const custom = options.handler?.(p, o);
    if (custom !== undefined) return await custom;
    if (p === "/auth/refresh") return new Promise(() => {});
    if (p === "/me") return { data: { id: sub, role, fullName: "Admin Uji" } };
    if (p === "/me/accessibility") return { data: {} };
    if (p.startsWith("/me/notifications"))
      return { data: [], meta: { nextCursor: null, unreadCount: 0 } };
    if (p === "/admin/community-metrics") return { data: COMMUNITY_METRICS_UJI };
    if (p.startsWith("/admin/communities?")) return { data: [room], meta: { nextCursor: null } };
    if (p === "/admin/communities" && o?.method === "POST") {
      room = { ...room, ...(o.body as object) };
      return { data: room };
    }
    if (p === `/admin/communities/${room.id}`) {
      if (o?.method === "PATCH") room = { ...room, ...(o.body as object) };
      if (o?.method === "DELETE") room = { ...room, status: "archived" };
      return { data: room };
    }
    if (p.startsWith("/admin/community-queue?"))
      return { data: [report], meta: { nextCursor: null } };
    if (p === `/admin/community-queue/${report.id}`) return { data: report };
    if (p === `/admin/community-queue/${report.id}/reject`) {
      report = { ...report, status: "rejected", resolvedAt: room.createdAt };
      return { data: report };
    }
    if (p === `/admin/community-content/comment/${COMMUNITY_COMMENT_UJI.id}`)
      return { data: { targetType: "comment", content: COMMUNITY_COMMENT_UJI } };
    if (p === `/admin/community-content/post/${post.id}/moderate`) {
      const body = o?.body as { action: "hide" | "restore" | "remove"; reason: string };
      post = {
        ...post,
        status:
          body.action === "hide" ? "hidden" : body.action === "remove" ? "removed" : "published",
        moderation: { ...body, createdAt: room.createdAt },
      };
      if (body.action !== "restore")
        report = { ...report, status: "resolved", resolvedAt: room.createdAt };
      return { data: { targetType: "post", content: post } };
    }
    if (p === `/admin/community-content/post/${post.id}`)
      return { data: { targetType: "post", content: post } };
    throw new Error(`Unexpected test path: ${p}`);
  });
  const cache = createQueryClient();
  cache.setDefaultOptions({
    queries: { retry: false, staleTime: 60_000 },
    mutations: { retry: false },
  });
  const router = createMemoryRouter(ruteApp, { initialEntries: [path] });
  const view = render(
    <Providers queryClient={cache} klienApi={{ request } as ApiClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { container: view.container, unmount: view.unmount, router, request, cache };
}
