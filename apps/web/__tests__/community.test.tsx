import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { onlineManager } from "@tanstack/react-query";
import { ApiError, communityKeys, type ApiClient, type RequestOptions } from "@nawasena/api-client";
import type { Community, CommunityMembership, UserRole } from "@nawasena/schemas";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { ruteApp } from "../src/app/routes.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import { kunciPenanda } from "../src/features/onboarding/identitas.js";
import { COMMUNITY_UJI as ROOM, COMMUNITY_KOTA_UJI as CITY } from "../e2e/community-fixture.js";

const SUB = "01912345-89ab-7def-8123-456789abcdef";
const USER_B = "01912345-89ab-7def-8123-456789abcd02";
type Setup = {
  role?: UserRole;
  onboardingSelesai?: boolean;
  member?: CommunityMembership | null;
  room?: Community;
  list?: (params: URLSearchParams) => unknown;
  membershipError?: ApiError;
  mutationError?: ApiError;
};
function buka(path = "/community", options: Setup = {}) {
  if (options.role) {
    useStoreSesi
      .getState()
      .masuk(`header.${btoa(JSON.stringify({ sub: SUB, role: options.role }))}.signature`);
    if (options.onboardingSelesai !== false) localStorage.setItem(kunciPenanda(SUB), "1");
  } else useStoreSesi.getState().keluar();
  let member = options.member ?? null;
  let room = { ...(options.room ?? ROOM) };
  const request = vi.fn(async (path: string, init?: RequestOptions<unknown>) => {
    if (path === "/auth/refresh") return new Promise(() => {});
    if (path === "/me") return { data: { id: SUB, role: options.role, fullName: "Pengguna Uji" } };
    if (path === "/me/accessibility")
      return {
        data: {
          textScale: null,
          highContrast: null,
          reduceMotion: null,
          simpleLanguage: null,
          prefersSignLanguage: null,
          largeTouchTargets: null,
          screenReaderHint: null,
        },
      };
    if (path.startsWith("/me/notifications"))
      return { data: [], meta: { nextCursor: null, unreadCount: 0 } };
    if (path.startsWith("/communities?")) {
      const params = new URLSearchParams(path.split("?")[1]);
      return options.list?.(params) ?? { data: [room, CITY], meta: { nextCursor: null } };
    }
    if (path === `/communities/${ROOM.slug}`) return { data: room };
    if (path === `/communities/${CITY.slug}`) return { data: CITY };
    if (
      path === `/communities/${room.id}/join` ||
      (path === `/communities/${room.id}/membership` && init?.method === "DELETE")
    ) {
      if (options.mutationError) throw options.mutationError;
      const join = init?.method === "POST";
      member = join ? { communityId: room.id, status: "active", joinedAt: room.createdAt } : null;
      room = { ...room, memberCount: room.memberCount + (join ? 1 : -1) };
      return { data: member };
    }
    if (path === `/communities/${room.id}/membership`) {
      if (options.membershipError) throw options.membershipError;
      return { data: member };
    }
    throw new ApiError(
      { code: "KOMUNITAS_TIDAK_DITEMUKAN", message: "Ruang tidak ditemukan" },
      404,
    );
  });
  const cache = createQueryClient();
  cache.setDefaultOptions({
    queries: { retry: false, staleTime: 60_000 },
    mutations: { retry: false },
  });
  const router = createMemoryRouter(ruteApp, { initialEntries: [path] });
  render(
    <Providers queryClient={cache} klienApi={{ request } as ApiClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { request, router, cache };
}
function tindakan(request: ReturnType<typeof vi.fn>) {
  return request.mock.calls.filter(
    ([path, init]) =>
      path.startsWith("/communities/") && (init?.method === "POST" || init?.method === "DELETE"),
  );
}
afterEach(() => {
  useStoreSesi.getState().keluar();
  localStorage.clear();
  sessionStorage.clear();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe("Community browse", () => {
  it.each(["/community", `/community/${ROOM.slug}`])(
    "a new seeker can open %s without career onboarding or automatic membership",
    async (path) => {
      const { request, router } = buka(path, { role: "seeker", onboardingSelesai: false });
      if (path === "/community") await screen.findByRole("link", { name: ROOM.name });
      else {
        await screen.findByText("Anda belum bergabung", { exact: true });
        expect(screen.getByRole("button", { name: "Gabung ruang" })).toHaveAttribute(
          "aria-disabled",
          "false",
        );
      }
      expect(router.state.location.pathname).toBe(path);
      expect(localStorage.getItem(kunciPenanda(SUB))).toBeNull();
      expect(tindakan(request)).toEqual([]);
    },
  );
  it("initial loading gives a status while room data is still unavailable", async () => {
    buka("/community", { list: () => new Promise(() => {}) });
    await screen.findByRole("heading", { level: 1, name: "Komunitas" });
    expect(screen.getByText("Memuat ruang…")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("heading", { name: "Belum ada ruang" })).toBeNull();
  });
  it("initial offline state explains why rooms are unavailable instead of claiming an empty community", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    onlineManager.setOnline(false);
    const { request } = buka();
    await screen.findByText(
      "Anda sedang luring. Sambungkan internet untuk memuat ruang atau mengubah keanggotaan.",
    );
    expect(request.mock.calls.some(([path]) => path.startsWith("/communities"))).toBe(false);
    expect(screen.queryByRole("heading", { name: "Belum ada ruang" })).toBeNull();
  });
  it("public rooms expose names, types and member counts, with labelled keyboard controls and axe", async () => {
    const { request } = buka();
    await screen.findByRole("link", { name: ROOM.name }, { timeout: 5000 });
    expect(screen.getByText("12 anggota")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Jenis ruang" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nama kota" })).toHaveAccessibleDescription(
      /Jakarta/,
    );
    expect(request.mock.calls.some(([p]) => p.endsWith("/membership"))).toBe(false);
    await harusLolosAksesibilitas(document.body);
  });
  it("filters only on submit, preserves focus, paginates without replacing the first page", async () => {
    const { router, request } = buka("/community", {
      list: (p) => ({
        data: p.get("cursor") ? [CITY] : [ROOM],
        meta: { nextCursor: p.get("cursor") ? null : "lanjut" },
      }),
    });
    await screen.findByRole("link", { name: ROOM.name });
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Nama kota" }), " Jakarta ");
    expect(router.state.location.search).toBe("");
    const filter = screen.getByRole("button", { name: "Terapkan filter" });
    await user.click(filter);
    await waitFor(() => expect(router.state.location.search).toBe("?kota=Jakarta"));
    expect(filter).toHaveFocus();
    expect(request.mock.calls.some(([p]) => p.includes("city=Jakarta"))).toBe(true);
    const more = await screen.findByRole("button", { name: "Muat ruang lainnya" });
    await user.click(more);
    await screen.findByRole("link", { name: CITY.name });
    expect(screen.getByRole("link", { name: ROOM.name })).toBeInTheDocument();
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-disabled", "true");
    expect(more).toHaveTextContent("Semua ruang sudah ditampilkan");
    expect(request.mock.calls.some(([p]) => p.includes("cursor=lanjut"))).toBe(true);
  });
  it("returning from detail restores the filter, loaded pages and the opened room link's focus", async () => {
    const { router } = buka("/community?kota=Jakarta", {
      list: (p) => ({
        data: p.get("cursor") ? [CITY] : [ROOM],
        meta: { nextCursor: p.get("cursor") ? null : "lanjut" },
      }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Muat ruang lainnya" }));
    await user.click(await screen.findByRole("link", { name: CITY.name }));
    await screen.findByRole("heading", { level: 1, name: CITY.name });
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(screen.getByRole("link", { name: CITY.name })).toHaveFocus());
    expect(router.state.location.search).toBe("?kota=Jakarta");
    expect(screen.getByRole("textbox", { name: "Nama kota" })).toHaveValue("Jakarta");
  });
  it("empty and retry states explain what to do; a failed next page retains existing rooms", async () => {
    let nextFailed = true;
    const { request } = buka("/community", {
      list: (p) => {
        if (p.get("cursor") && nextFailed)
          throw new ApiError({ code: "BELUM_SIAP", message: "Tidak tersedia" }, 503);
        return {
          data: p.get("cursor") ? [CITY] : [ROOM],
          meta: { nextCursor: p.get("cursor") ? null : "lanjut" },
        };
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Muat ruang lainnya" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: ROOM.name })).toBeVisible();
    nextFailed = false;
    await user.click(screen.getByRole("button", { name: "Coba lagi" }));
    await screen.findByRole("link", { name: CITY.name });
    expect(request.mock.calls.filter(([p]) => p.includes("cursor=lanjut"))).toHaveLength(2);
  });
  it("filtered empty state offers a reset while invalid URL values are ignored", async () => {
    const { router } = buka("/community?jenis=invalide&kota=Jakarta", {
      list: () => ({ data: [], meta: { nextCursor: null } }),
    });
    await screen.findByRole("heading", { name: "Tidak ada ruang yang cocok" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Hapus filter" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    await screen.findByRole("heading", { name: "Belum ada ruang" });
  });
});

describe("Community membership", () => {
  it("guest login CTA keeps its destination and performs no automatic join", async () => {
    const { request } = buka(`/community/${ROOM.slug}`);
    const link = await screen.findByRole("link", { name: "Masuk untuk bergabung" });
    expect(link).toHaveAttribute(
      "href",
      `/masuk?tujuan=${encodeURIComponent(`/community/${ROOM.slug}`)}`,
    );
    expect(tindakan(request)).toHaveLength(0);
  });
  it.each(["seeker", "employer", "admin"] as const)(
    "%s joins/leaves explicitly and keeps focus with refreshed counts",
    async (role) => {
      const { request } = buka(`/community/${ROOM.slug}`, { role });
      const button = await screen.findByRole("button", { name: "Gabung ruang" });
      await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "false"));
      const user = userEvent.setup();
      await user.click(button);
      await screen.findByText("Anda berhasil bergabung.");
      await screen.findByText(/13 anggota/);
      expect(button).toHaveFocus();
      expect(button).toHaveTextContent("Keluar dari ruang");
      await user.click(button);
      await screen.findByText("Anda sudah keluar dari ruang.");
      expect(button).toHaveFocus();
      expect(tindakan(request).map(([, init]) => init.method)).toEqual(["POST", "DELETE"]);
      await harusLolosAksesibilitas(document.body);
    },
  );
  it("blocked membership does not offer a way around the restriction", async () => {
    const { request } = buka(`/community/${ROOM.slug}`, {
      role: "seeker",
      member: { communityId: ROOM.id, status: "blocked", joinedAt: ROOM.createdAt },
    });
    await screen.findByText("Keanggotaan Anda diblokir");
    const join = screen.getByRole("button", { name: "Gabung ruang" });
    expect(join).toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().click(join);
    expect(tindakan(request)).toHaveLength(0);
  });
  it("an archived room permits an active member to leave but never rejoin", async () => {
    const { request } = buka(`/community/${ROOM.slug}`, {
      role: "seeker",
      room: { ...ROOM, status: "archived" },
      member: { communityId: ROOM.id, status: "active", joinedAt: ROOM.createdAt },
    });
    await screen.findByText("Anda sudah bergabung");
    await userEvent.setup().click(screen.getByRole("button", { name: "Keluar dari ruang" }));
    await screen.findByText("Anda sudah keluar dari ruang.");
    expect(screen.getByRole("button", { name: "Gabung ruang" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(tindakan(request)).toHaveLength(1);
  });
  it("unknown membership and failed mutations show actionable errors instead of false success", async () => {
    const { request } = buka(`/community/${ROOM.slug}`, {
      role: "seeker",
      membershipError: new ApiError({ code: "BELUM_SIAP", message: "Tidak tersedia" }, 503),
    });
    await screen.findByRole("alert");
    const join = screen.getByRole("button", { name: "Gabung ruang" });
    expect(join).toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().click(join);
    expect(tindakan(request)).toHaveLength(0);
    expect(screen.queryByText("Anda berhasil bergabung.")).toBeNull();
  });
  it("rate-limited mutation reports failure, retains focus and never announces success", async () => {
    buka(`/community/${ROOM.slug}`, {
      role: "seeker",
      mutationError: new ApiError({ code: "TERLALU_BANYAK_PERMINTAAN", message: "Tunggu" }, 429),
    });
    const join = await screen.findByRole("button", { name: "Gabung ruang" });
    await waitFor(() => expect(join).toHaveAttribute("aria-disabled", "false"));
    await userEvent.setup().click(join);
    await screen.findByRole("alert");
    expect(join).toHaveFocus();
    expect(screen.queryByText("Anda berhasil bergabung.")).toBeNull();
  });
  it("offline disables membership writes and reconnection does not replay clicks", async () => {
    const { request } = buka(`/community/${ROOM.slug}`, { role: "seeker" });
    const join = await screen.findByRole("button", { name: "Gabung ruang" });
    await waitFor(() => expect(join).toHaveAttribute("aria-disabled", "false"));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      onlineManager.setOnline(false);
      fireEvent(window, new Event("offline"));
    });
    expect(join).toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().click(join);
    vi.restoreAllMocks();
    act(() => {
      onlineManager.setOnline(true);
      fireEvent(window, new Event("online"));
    });
    expect(tindakan(request)).toHaveLength(0);
  });
  it("account-scoped cache cannot show another user's membership", async () => {
    const { cache } = buka(`/community/${ROOM.slug}`, { role: "seeker" });
    cache.setQueryData(communityKeys.membership(USER_B, ROOM.id), {
      communityId: ROOM.id,
      status: "active",
      joinedAt: ROOM.createdAt,
    });
    await screen.findByText("Anda belum bergabung");
    expect(screen.queryByText("Anda sudah bergabung")).toBeNull();
  });
  it("invalid or missing room has a real not-found state and a way back", async () => {
    buka("/community/tidak-ada");
    await screen.findByRole("heading", { level: 1, name: "Ruang tidak ditemukan" });
    expect(screen.getByRole("link", { name: "Kembali ke komunitas" })).toHaveAttribute(
      "href",
      "/community",
    );
  });
});
