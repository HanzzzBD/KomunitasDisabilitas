import type { Page } from "@playwright/test";
import { palsukanApi } from "./palsukan-api.js";
import {
  COMMUNITY_UJI as ROOM,
  COMMUNITY_POST_UJI as POST,
  COMMUNITY_COMMENT_UJI as COMMENT,
} from "./community-fixture.js";

export async function palsukanDiskusi(page: Page, pagination = false) {
  await palsukanApi(page, {
    nama: "community-discussion",
    jalur: `/community/${ROOM.slug}`,
    butuhSesi: true,
  });
  const posts = [{ ...POST }];
  const comments = [{ ...COMMENT }];
  let next = 4;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === `/api/v1/communities/${ROOM.id}/posts`) {
      if (method === "POST") {
        const post = {
          ...POST,
          id: `01912345-89ab-7def-8123-4567890acd0${next++}`,
          body: (request.postDataJSON() as { body: string }).body,
        };
        posts.unshift(post);
        return route.fulfill(json({ data: post }));
      }
      return route.fulfill(
        json({
          data: url.searchParams.has("cursor")
            ? [
                {
                  ...POST,
                  id: "01912345-89ab-7def-8123-4567890acd03",
                  body: "Tulisan halaman kedua",
                },
              ]
            : posts,
          meta: { nextCursor: pagination && !url.searchParams.has("cursor") ? "feed-2" : null },
        }),
      );
    }
    const found = posts.find((p) => path === `/api/v1/community-posts/${p.id}`);
    if (found) {
      if (method === "PATCH") found.body = (request.postDataJSON() as { body: string }).body;
      if (method === "DELETE") {
        found.body = "";
        found.status = "removed";
      }
      return route.fulfill(json({ data: found }));
    }
    if (path === `/api/v1/community-posts/${POST.id}/comments`) {
      if (method === "POST") {
        const comment = {
          ...COMMENT,
          id: `01912345-89ab-7def-8123-4567890acd0${next++}`,
          author: POST.author!,
          body: (request.postDataJSON() as { body: string }).body,
        };
        comments.push(comment);
        return route.fulfill(json({ data: comment }));
      }
      return route.fulfill(
        json({
          data: url.searchParams.has("cursor")
            ? [
                {
                  ...COMMENT,
                  id: "01912345-89ab-7def-8123-4567890acd03",
                  body: "Komentar halaman kedua",
                },
              ]
            : comments,
          meta: { nextCursor: pagination && !url.searchParams.has("cursor") ? "comments-2" : null },
        }),
      );
    }
    if (path.endsWith("/reports")) {
      const parts = path.split("/");
      return route.fulfill(
        json({
          data: {
            id: POST.id,
            targetType: parts.at(-3),
            targetId: parts.at(-2),
            status: "open",
            createdAt: POST.createdAt,
          },
        }),
      );
    }
    return route.fallback();
  });
}
