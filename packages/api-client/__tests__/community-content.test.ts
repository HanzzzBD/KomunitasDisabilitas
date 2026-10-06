import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  getCommunityById,
  communityContentKeys,
  listCommunityPosts,
  getCommunityPost,
  createCommunityPost,
  updateCommunityPost,
  deleteCommunityPost,
  listCommunityComments,
  getCommunityComment,
  createCommunityComment,
  updateCommunityComment,
  deleteCommunityComment,
  reportCommunityContent,
} from "../src/index.js";

const ROOM = "01912345-89ab-7def-8123-4567890acc01";
const ID = "01912345-89ab-7def-8123-4567890acd01";
const POST = {
  id: ID,
  communityId: ROOM,
  author: null,
  body: "Teks",
  status: "published",
  commentCount: 0,
  createdAt: "2026-10-06T06:00:00.000Z",
  updatedAt: "2026-10-06T06:00:00.000Z",
};
const COMMENT = {
  id: ID,
  postId: ID,
  author: null,
  body: "Teks",
  status: "published",
  createdAt: POST.createdAt,
  updatedAt: POST.updatedAt,
};
function setup(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }),
  );
  return { fetch, client: createApiClient({ baseUrl: "https://uji.test/api/v1", fetch }) };
}
describe("Community content boundaries", () => {
  it.each(["post", "comment"] as const)(
    "%s CRUD uses the strict input and response contracts",
    async (kind) => {
      const fixture = kind === "post" ? POST : COMMENT;
      const { fetch, client } = setup({ data: fixture });
      const signal = new AbortController().signal;
      expect(
        await (kind === "post" ? getCommunityPost : getCommunityComment)(client, ID, signal),
      ).toEqual(fixture);
      expect(fetch.mock.calls[0]?.[1]?.signal).toBe(signal);
      await (kind === "post" ? createCommunityPost : createCommunityComment)(client, ROOM, {
        body: "  A\r\nB  ",
      });
      await (kind === "post" ? updateCommunityPost : updateCommunityComment)(client, ID, {
        body: "Perbaikan",
      });
      await (kind === "post" ? deleteCommunityPost : deleteCommunityComment)(client, ID);
      expect(fetch.mock.calls.map((c) => c[1]?.method)).toEqual(["GET", "POST", "PATCH", "DELETE"]);
      expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({ body: "A\nB" });
      expect(fetch.mock.calls[3]![1]!.body).toBeUndefined();
      expect(fetch.mock.calls[1]![0]).toBe(
        `https://uji.test/api/v1/${kind === "post" ? `communities/${ROOM}/posts` : `community-posts/${ROOM}/comments`}`,
      );
    },
  );
  it.each(["posts", "comments"] as const)(
    "%s keeps cursor metadata and forwards cancellation",
    async (kind) => {
      const { fetch, client } = setup({
        data: [kind === "posts" ? POST : COMMENT],
        meta: { nextCursor: "next" },
      });
      const signal = new AbortController().signal;
      const result = await (kind === "posts" ? listCommunityPosts : listCommunityComments)(
        client,
        ROOM,
        { cursor: "a & b", limit: 7 },
        signal,
      );
      expect(result.meta.nextCursor).toBe("next");
      const url = new URL(fetch.mock.calls[0]![0] as string);
      expect(url.searchParams.get("cursor")).toBe("a & b");
      expect(url.searchParams.get("limit")).toBe("7");
      expect(fetch.mock.calls[0]?.[1]?.signal).toBe(signal);
    },
  );
  it("reports do not send a reporter id and reject reason/target injection before fetch", async () => {
    const receipt = {
      id: ID,
      targetType: "post",
      targetId: ID,
      status: "open",
      createdAt: POST.createdAt,
    };
    const { client, fetch } = setup({ data: receipt });
    expect(
      await reportCommunityContent(client, "post", ID, { reason: "  Perlu ditinjau  " }),
    ).toEqual(receipt);
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
      reason: "Perlu ditinjau",
    });
    await expect(
      reportCommunityContent(client, "post", "../admin", { reason: "Masalah" }),
    ).rejects.toThrow();
    await expect(reportCommunityContent(client, "post", ID, { reason: " " })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("room-by-id validates the public detail envelope and identifier", async () => {
    const { client, fetch } = setup({ data: {} });
    await expect(getCommunityById(client, "invalid")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(getCommunityById(client, ROOM)).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
    expect(fetch.mock.calls[0]![0]).toBe(`https://uji.test/api/v1/communities/by-id/${ROOM}`);
  });
  it("content keys isolate every private read between accounts", () => {
    for (const key of [
      communityContentKeys.feed,
      communityContentKeys.post,
      communityContentKeys.comment,
      communityContentKeys.comments,
    ])
      expect(key("A", ID)).not.toEqual(key("B", ID));
  });
  it("invalid content fields never reach the API", async () => {
    const { client, fetch } = setup({ data: POST });
    await expect(createCommunityPost(client, ROOM, { body: " " })).rejects.toThrow();
    await expect(createCommunityPost(client, ROOM, { body: "a".repeat(5001) })).rejects.toThrow();
    await expect(createCommunityComment(client, ID, { body: "a".repeat(2001) })).rejects.toThrow();
    await expect(
      updateCommunityPost(client, ID, { body: "x", authorId: ID } as { body: string }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("unknown status and leaked report identities fail closed", async () => {
    await expect(
      getCommunityPost(setup({ data: { ...POST, status: "pending" } }).client, ID),
    ).rejects.toMatchObject({ code: "RESPONS_TIDAK_DIKENAL" });
    await expect(
      reportCommunityContent(
        setup({
          data: {
            id: ID,
            targetType: "post",
            targetId: ID,
            status: "open",
            createdAt: POST.createdAt,
            reporterId: ID,
          },
        }).client,
        "post",
        ID,
        { reason: "Masalah" },
      ),
    ).rejects.toMatchObject({ code: "RESPONS_TIDAK_DIKENAL" });
  });
});
