import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  listCommunities,
  getCommunity,
  getMyCommunityMembership,
  joinCommunity,
  leaveCommunity,
  communityKeys,
} from "../src/index.js";

const ID = "01912345-89ab-7def-8123-4567890acc01";
const ROOM = {
  id: ID,
  slug: "karier-jakarta",
  name: "Karier Jakarta",
  description: "Berbagi pengalaman kerja.",
  type: "city",
  city: "Jakarta",
  status: "active",
  memberCount: 7,
  membershipStatus: null,
  createdAt: "2026-10-06T06:00:00.000Z",
  updatedAt: "2026-10-06T06:00:00.000Z",
};
const MEMBER = { communityId: ID, status: "active", joinedAt: ROOM.createdAt };
function setup(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  return { fetch, client: createApiClient({ baseUrl: "https://uji.test/api/v1", fetch }) };
}

describe("Community client", () => {
  it("preserves cursor metadata, encodes filters and forwards cancellation", async () => {
    const { fetch, client } = setup({ data: [ROOM], meta: { nextCursor: "cursor-berikut" } });
    const signal = new AbortController().signal;
    const result = await listCommunities(
      client,
      { city: "  Kota A & B  ", type: "city", cursor: "cursor-1", limit: 20 },
      signal,
    );
    expect(result.meta.nextCursor).toBe("cursor-berikut");
    const url = new URL(fetch.mock.calls[0]![0] as string);
    expect(url.searchParams.get("city")).toBe("Kota A & B");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
    expect((fetch.mock.calls[0]![1] as RequestInit).signal).toBe(signal);
  });
  it("unwraps public detail and own membership envelopes", async () => {
    const room = setup({ data: ROOM });
    await expect(getCommunity(room.client, ROOM.slug)).resolves.toEqual(ROOM);
    const member = setup({ data: MEMBER });
    await expect(getMyCommunityMembership(member.client, ID)).resolves.toEqual(MEMBER);
  });
  it.each(["join", "leave"] as const)(
    "%s sends only the room id, never a user id or request body",
    async (action) => {
      const { fetch, client } = setup({ data: action === "join" ? MEMBER : null });
      const result = await (action === "join" ? joinCommunity : leaveCommunity)(client, ID);
      expect(result).toEqual(action === "join" ? MEMBER : null);
      expect(fetch.mock.calls[0]![0]).toBe(
        `https://uji.test/api/v1/communities/${ID}/${action === "join" ? "join" : "membership"}`,
      );
      const init = fetch.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe(action === "join" ? "POST" : "DELETE");
      expect(init.body).toBeUndefined();
    },
  );
  it("rejects invalid input before making requests", async () => {
    const { fetch, client } = setup({ data: ROOM });
    await expect(getCommunity(client, "../admin")).rejects.toThrow();
    await expect(joinCommunity(client, "user-id")).rejects.toThrow();
    expect(() => listCommunities(client, { limit: 0 })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects drift instead of rendering unknown membership state", async () => {
    const { client } = setup({ data: { ...MEMBER, status: "unknown" } });
    await expect(getMyCommunityMembership(client, ID)).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
  it("scopes private keys by account and keeps filter keys stable", () => {
    expect(communityKeys.membership("A", ID)).not.toEqual(communityKeys.membership("B", ID));
    expect(communityKeys.list({ type: "city", city: "Jakarta" })).toEqual(
      communityKeys.list({ city: "Jakarta", type: "city" }),
    );
  });
});
