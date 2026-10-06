import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError, communityAdminKeys } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import {
  COMMUNITY_UJI as ROOM,
  COMMUNITY_POST_UJI as POST,
  COMMUNITY_COMMENT_UJI as COMMENT,
} from "../e2e/community-fixture.js";
import { COMMUNITY_REPORT_UJI as REPORT } from "../e2e/admin-community-fixture.js";
import { bukaAdminCommunity } from "./helpers/admin-community.js";
const DETAIL = `/admin/community/laporan/${REPORT.id}`;
afterEach(() => {
  useStoreSesi.getState().keluar();
  vi.restoreAllMocks();
});
describe("PR-118 admin Community", () => {
  it("a pending double click sends once and its late result cannot restore admin cache after logout", async () => {
    let finish: ((result: unknown) => void) | undefined;
    const { request, cache } = bukaAdminCommunity(DETAIL, {
      handler: (p) =>
        p.endsWith("/moderate")
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : undefined,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sembunyikan" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Alasan keputusan/ }), {
      target: { value: "Alasan tindakan" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Tinjau keputusan" }));
    const confirm = screen.getByRole("button", { name: "Konfirmasi keputusan" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(request.mock.calls.filter(([p]) => p.endsWith("/moderate"))).toHaveLength(1);
    act(() => useStoreSesi.getState().keluar());
    await act(async () =>
      finish?.({ data: { targetType: "post", content: { ...POST, status: "hidden" } } }),
    );
    expect(cache.getQueriesData({ queryKey: communityAdminKeys.all() })).toHaveLength(0);
    expect(screen.queryByText("Keputusan tercatat. Data telah diperbarui.")).toBeNull();
  });
  it("offline confirmation is not queued or retried when connectivity returns", async () => {
    const { request } = bukaAdminCommunity(DETAIL);
    await userEvent.click(await screen.findByRole("button", { name: "Sembunyikan" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Alasan keputusan/ }), {
      target: { value: "Alasan tindakan" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Tinjau keputusan" }));
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi keputusan" }));
    expect(request.mock.calls.some(([p]) => p.endsWith("/moderate"))).toBe(false);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(request.mock.calls.some(([p]) => p.endsWith("/moderate"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Konfirmasi keputusan" }));
    await screen.findByText("Keputusan tercatat. Data telah diperbarui.");
  });
  it.each(["seeker", "employer"])("%s cannot read admin Community endpoints", async (role) => {
    const { router, request } = bukaAdminCommunity(DETAIL, { role });
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(request.mock.calls.some(([p]) => p.startsWith("/admin/community"))).toBe(false);
  });
  it("guests are redirected before fetching any admin data", async () => {
    const { router, request } = bukaAdminCommunity(DETAIL, { guest: true });
    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"));
    expect(request.mock.calls.some(([p]) => p.startsWith("/admin/community"))).toBe(false);
  });
  it("renders rooms and aggregate metrics with clear definitions and passes axe", async () => {
    const { container } = bukaAdminCommunity();
    await screen.findByText(ROOM.name);
    await screen.findByText("2 jam");
    expect(screen.getByText(/bukan jumlah orang unik/)).toBeVisible();
    await harusLolosAksesibilitas(container);
  });
  it("uses open oldest-first queue, preserves filter focus and changes URL/query", async () => {
    const { request, router } = bukaAdminCommunity("/admin/community/laporan");
    await screen.findByText(REPORT.reason);
    expect(
      request.mock.calls.some(([p]) => p === "/admin/community-queue?limit=20&status=open"),
    ).toBe(true);
    const filter = screen.getByRole("combobox", { name: "Status" });
    filter.focus();
    await userEvent.selectOptions(filter, "rejected");
    await waitFor(() => expect(router.state.location.search).toBe("?status=rejected"));
    expect(filter).toHaveFocus();
    expect(screen.getByText("Laporan terlama ditampilkan lebih dahulu.")).toBeVisible();
  });
  it("requires reason and an explicit review before one audited moderation request", async () => {
    const { request } = bukaAdminCommunity(DETAIL);
    await screen.findByText(POST.body);
    await userEvent.click(screen.getByRole("button", { name: "Sembunyikan" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tinjau keputusan" }));
    const reason = within(dialog).getByRole("textbox", { name: /Alasan keputusan/ });
    expect(reason).toHaveFocus();
    expect(reason).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(reason, "  Melanggar aturan ruang  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tinjau keputusan" }));
    expect(request.mock.calls.some(([p]) => p.endsWith("/moderate"))).toBe(false);
    expect(within(dialog).getByRole("heading", { name: "Konfirmasi keputusan" })).toHaveFocus();
    await harusLolosAksesibilitas(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Konfirmasi keputusan" }));
    await screen.findByText("Keputusan tercatat. Data telah diperbarui.");
    const calls = request.mock.calls.filter(([p]) => p.endsWith("/moderate"));
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]?.body).toEqual({ action: "hide", reason: "Melanggar aturan ruang" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Detail laporan" })).toHaveFocus(),
    );
  });
  it("Escape cancels moderation and restores trigger focus", async () => {
    const { request } = bukaAdminCommunity(DETAIL);
    const trigger = await screen.findByRole("button", { name: "Hapus permanen" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(request.mock.calls.some(([p]) => p.endsWith("/moderate"))).toBe(false);
  });
  it("removed content retains admin text but never offers restore", async () => {
    bukaAdminCommunity(DETAIL, {
      post: { ...POST, status: "removed" },
      report: { ...REPORT, status: "resolved", resolvedAt: REPORT.createdAt },
    });
    await screen.findByText(POST.body);
    expect(screen.getByText(/Teks berikut disimpan untuk moderasi/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pulihkan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tolak laporan" })).toBeNull();
  });
  it("comment reports load their parent without reading career/profile endpoints", async () => {
    const { request } = bukaAdminCommunity(DETAIL, {
      report: { ...REPORT, targetType: "comment", targetId: COMMENT.id },
    });
    await screen.findByText(COMMENT.body);
    await screen.findByRole("heading", { name: "Post induk" });
    expect(request.mock.calls.some(([p]) => p === `/admin/community-content/post/${POST.id}`)).toBe(
      true,
    );
    expect(request.mock.calls.some(([p]) => /profiles|resumes|applications/.test(p))).toBe(false);
  });
  it("creates a city room only after required fields validate, then supports edit/archive", async () => {
    const { request, router } = bukaAdminCommunity("/admin/community/ruang/baru");
    await screen.findByRole("textbox", { name: /Nama ruang/ });
    await userEvent.click(screen.getByRole("button", { name: "Simpan ruang" }));
    await screen.findByText("Periksa kolom yang ditandai.");
    expect(
      request.mock.calls.some(([p, o]) => p === "/admin/communities" && o?.method === "POST"),
    ).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: /Nama ruang/ }), {
      target: { value: "Karier Bandung" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Slug ruang/ }), {
      target: { value: "karier-bandung" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Deskripsi ruang/ }), {
      target: { value: "Berbagi pengalaman kerja" },
    });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Jenis ruang" }), "city");
    fireEvent.change(screen.getByRole("textbox", { name: /Kota/ }), {
      target: { value: "Bandung" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Simpan ruang" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/admin/community/ruang/${ROOM.id}`),
    );
    const archive = await screen.findByRole("button", { name: "Arsipkan ruang" });
    await userEvent.click(archive);
    expect(request.mock.calls.some(([, o]) => o?.method === "DELETE")).toBe(false);
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Konfirmasi keputusan" }),
    );
    await screen.findByRole("button", { name: "Aktifkan kembali" });
  });
  it("failed moderation retains the reason and reports a concurrent decision conflict", async () => {
    bukaAdminCommunity(DETAIL, {
      handler: (p) =>
        p.endsWith("/moderate")
          ? Promise.reject(
              new ApiError({ code: "KONTEN_KOMUNITAS_DIHAPUS", message: "Konflik" }, 409),
            )
          : undefined,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sembunyikan" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Alasan keputusan/ }), {
      target: { value: "Alasan tetap" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Tinjau keputusan" }));
    await userEvent.click(screen.getByRole("button", { name: "Konfirmasi keputusan" }));
    await screen.findByText(/Status sudah berubah/);
    await userEvent.click(screen.getByRole("button", { name: "Ubah alasan" }));
    expect(screen.getByRole("textbox", { name: /Alasan keputusan/ })).toHaveValue("Alasan tetap");
  });
  it("logout clears all cached admin reports and metrics", async () => {
    const { cache } = bukaAdminCommunity(DETAIL);
    await screen.findByText(POST.body);
    expect(cache.getQueriesData({ queryKey: communityAdminKeys.all() }).length).toBeGreaterThan(0);
    act(() => useStoreSesi.getState().keluar());
    expect(cache.getQueriesData({ queryKey: communityAdminKeys.all() })).toHaveLength(0);
  });
});
