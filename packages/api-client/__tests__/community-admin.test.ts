import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  communityAdminKeys,
  listCommunityQueue,
  getCommunityQueueReport,
  getCommunityMetrics,
  listCommunitiesAdmin,
  getCommunityContentAdmin,
  moderateCommunityContentAdmin,
  rejectCommunityReportAdmin,
  createCommunityAdmin,
  updateCommunityAdmin,
  archiveCommunityAdmin,
} from "../src/index.js";
const ID = "01912345-89ab-7def-8123-4567890acc01";
const TIME = "2026-10-06T06:00:00.000Z";
const REPORT = {
  id: ID,
  targetType: "post",
  targetId: ID,
  status: "open",
  reason: "Aturan",
  createdAt: TIME,
  resolvedAt: null,
};
const ROOM = {
  id: ID,
  name: "Karier",
  slug: "karier",
  description: "Ruang karier",
  type: "topic",
  city: null,
  status: "active",
  memberCount: 1,
  membershipStatus: null,
  createdAt: TIME,
  updatedAt: TIME,
};
const CONTENT = {
  targetType: "post",
  content: {
    id: ID,
    communityId: ID,
    author: null,
    body: "Teks",
    status: "published",
    commentCount: 0,
    createdAt: TIME,
    updatedAt: TIME,
  },
};
function setup(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }),
  );
  return { fetch, client: createApiClient({ baseUrl: "https://uji.test", fetch }) };
}
describe("Community admin SDK", () => {
  it("filters/paginates queue and rooms with cancellation and account-scoped keys", async () => {
    const q = setup({ data: [REPORT], meta: { nextCursor: "next" } });
    const signal = new AbortController().signal;
    await listCommunityQueue(q.client, { status: "open", cursor: "a&b" }, signal);
    const url = new URL(q.fetch.mock.calls[0]![0] as string);
    expect(url.searchParams.get("cursor")).toBe("a&b");
    expect(url.searchParams.get("status")).toBe("open");
    expect(q.fetch.mock.calls[0]![1]?.signal).toBe(signal);
    const r = setup({ data: [ROOM], meta: { nextCursor: null } });
    await listCommunitiesAdmin(r.client, { status: "archived" });
    expect(String(r.fetch.mock.calls[0]![0])).toContain("status=archived");
    expect(communityAdminKeys.report("a", ID)).not.toEqual(communityAdminKeys.report("b", ID));
  });
  it("queue strict validation rejects reporter/resolver/profile leaks", async () => {
    for (const extra of [{ reporterId: ID }, { resolvedBy: ID }, { disability: "sensitive" }]) {
      const q = setup({ data: { ...REPORT, ...extra } });
      await expect(getCommunityQueueReport(q.client, ID)).rejects.toThrow();
    }
  });
  it("rejects invalid target, missing reason, identity injection and room input before HTTP", async () => {
    const { client, fetch } = setup({ data: CONTENT });
    await expect(
      moderateCommunityContentAdmin(client, "post", ID, "remove", "   "),
    ).rejects.toThrow();
    await expect(getCommunityContentAdmin(client, "post", "invalid")).rejects.toThrow();
    await expect(rejectCommunityReportAdmin(client, ID, "")).rejects.toThrow();
    await expect(
      createCommunityAdmin(client, {
        name: "A",
        slug: "invalid slug",
        description: "D",
        type: "topic",
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("moderation sends normalized reason and uses the minimal rejection endpoint", async () => {
    const c = setup({ data: CONTENT });
    await moderateCommunityContentAdmin(c.client, "post", ID, "hide", "  Aturan\r\nruang  ");
    expect(JSON.parse(c.fetch.mock.calls[0]![1]!.body as string)).toEqual({
      action: "hide",
      reason: "Aturan\nruang",
    });
    const r = setup({ data: { ...REPORT, status: "rejected", resolvedAt: TIME } });
    expect(await rejectCommunityReportAdmin(r.client, ID, "Aturan")).not.toHaveProperty(
      "reporterId",
    );
    expect(r.fetch.mock.calls[0]![0]).toBe(`https://uji.test/admin/community-queue/${ID}/reject`);
  });
  it("room create/edit/archive use their existing contracts", async () => {
    const { client, fetch } = setup({ data: ROOM });
    await createCommunityAdmin(client, {
      name: ROOM.name,
      slug: ROOM.slug,
      description: ROOM.description,
      type: "topic",
      city: null,
    });
    await updateCommunityAdmin(client, ID, { description: "Penjelasan baru" });
    await archiveCommunityAdmin(client, ID);
    expect(fetch.mock.calls.map(([, o]) => o?.method)).toEqual(["POST", "PATCH", "DELETE"]);
  });
  it("metrics accept empty resolution data and reject PII/invalid aggregates", async () => {
    const metrics = {
      periodDays: 30,
      from: TIME,
      to: TIME,
      newMemberships: 0,
      posts: 0,
      openReports: 0,
      closedReports: 0,
      averageResolutionSeconds: null,
    };
    await expect(getCommunityMetrics(setup({ data: metrics }).client)).resolves.toEqual(metrics);
    await expect(
      getCommunityMetrics(setup({ data: { ...metrics, userId: ID } }).client),
    ).rejects.toThrow();
    await expect(
      getCommunityMetrics(setup({ data: { ...metrics, openReports: -1 } }).client),
    ).rejects.toThrow();
  });
});
