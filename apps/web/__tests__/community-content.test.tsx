import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { ApiError, communityContentKeys } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import { kunciDrafCommunity } from "../src/features/community/draf.js";
import {
  COMMUNITY_UJI as ROOM,
  COMMUNITY_POST_UJI as POST,
  COMMUNITY_COMMENT_UJI as COMMENT,
} from "../e2e/community-fixture.js";
import { bukaDiskusi, SUB } from "./helpers/community-content.js";
const DETAIL = `/community/content/post/${POST.id}`;
const member = { communityId: ROOM.id, status: "active" as const, joinedAt: ROOM.createdAt };
afterEach(() => {
  useStoreSesi.getState().keluar();
  localStorage.clear();
  sessionStorage.clear();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});
describe("Community discussion", () => {
  it("a failed session recovery during reload preserves drafts until the account can sign in again", async () => {
    const key = kunciDrafCommunity(SUB, "post", ROOM.id);
    localStorage.setItem(key, "Draf sebelum internet putus");
    bukaDiskusi(undefined, {
      recovering: true,
      handler: (p) => {
        if (p === "/auth/refresh")
          throw new ApiError({ code: "JARINGAN_GAGAL", message: "Tidak tersambung" }, 0);
      },
    });
    await screen.findByRole("link", { name: "Masuk untuk membaca" });
    expect(localStorage.getItem(key)).toBe("Draf sebelum internet putus");
    expect(screen.queryByDisplayValue("Draf sebelum internet putus")).toBeNull();
  });
  it("switching accounts removes the previous discussion and cannot restore the other account's draft", async () => {
    let identity = SUB;
    const accountB = "01912345-89ab-7def-8123-456789abcd02";
    const { cache } = bukaDiskusi(undefined, {
      handler: (p) => {
        if (p === "/me") return { data: { id: identity, fullName: "Pembaca", role: "seeker" } };
        if (p.includes("/posts?"))
          return {
            data: [{ ...POST, body: identity === SUB ? "Tulisan sesi A" : "Tulisan sesi B" }],
            meta: { nextCursor: null },
          };
      },
    });
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    fireEvent.change(field, { target: { value: "Draf akun A" } });
    await screen.findByText("Tulisan sesi A");
    act(() => {
      identity = accountB;
      useStoreSesi
        .getState()
        .masuk(`a.${btoa(JSON.stringify({ sub: accountB, role: "seeker" }))}.b`);
    });
    await screen.findByText("Tulisan sesi B");
    expect(screen.queryByText("Tulisan sesi A")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" })).toHaveValue("");
    expect(cache.getQueryData(communityContentKeys.feed(SUB, ROOM.id))).toBeUndefined();
    expect(localStorage.getItem(kunciDrafCommunity(accountB, "post", ROOM.id))).toBeNull();
  });
  it("removed content never renders a retained body or editing controls", async () => {
    bukaDiskusi(DETAIL, {
      post: {
        ...POST,
        status: "removed",
        body: "Teks audit tidak boleh tampil",
        moderation: {
          action: "remove",
          reason: "Alasan pengelola untuk penulis",
          createdAt: POST.createdAt,
        },
      },
    });
    await screen.findByText("Alasan pengelola untuk penulis");
    expect(screen.queryByText("Teks audit tidak boleh tampil")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
  });
  it("guests never fetch discussion content, including direct links", async () => {
    const { request } = bukaDiskusi(DETAIL, { guest: true });
    expect(await screen.findByRole("link", { name: "Masuk untuk membaca" })).toHaveAttribute(
      "href",
      `/masuk?tujuan=${encodeURIComponent(DETAIL)}`,
    );
    expect(request.mock.calls.some(([p]) => p.includes("community-posts"))).toBe(false);
  });
  it.each([null, { ...member, status: "blocked" as const }])(
    "nonmembers/blocked can read and report but cannot compose",
    async (membership) => {
      bukaDiskusi(undefined, { member: membership });
      await screen.findByText(POST.body);
      expect(screen.queryByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" })).toBeNull();
      expect(screen.getByRole("button", { name: "Laporkan tulisan" })).toBeVisible();
    },
  );
  it("publishes once, stays in room, inserts at the top and clears its persisted draft", async () => {
    const user = userEvent.setup();
    const { router, request } = bukaDiskusi();
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    await user.type(field, "Pengalaman baru");
    expect(localStorage.getItem(kunciDrafCommunity(SUB, "post", ROOM.id))).toBe("Pengalaman baru");
    await user.click(screen.getByRole("button", { name: "Kirim tulisan" }));
    await screen.findByText("Tulisan berhasil dikirim.");
    const list = screen.getByRole("list", { name: "Diskusi ruang" });
    expect(within(list).getAllByRole("article")[0]).toHaveTextContent("Pengalaman baru");
    expect(router.state.location.pathname).toBe(`/community/${ROOM.slug}`);
    expect(field).toHaveValue("");
    expect(localStorage.getItem(kunciDrafCommunity(SUB, "post", ROOM.id))).toBeNull();
    expect(
      request.mock.calls.filter(([p, o]) => p.endsWith("/posts") && o?.method === "POST"),
    ).toHaveLength(1);
  });
  it("restores drafts on remount, isolates accounts and allows discarding", async () => {
    const first = bukaDiskusi();
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    fireEvent.change(field, { target: { value: "Draf pribadi" } });
    first.unmount();
    const next = bukaDiskusi();
    expect(
      await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" }),
    ).toHaveValue("Draf pribadi");
    expect(localStorage.getItem(kunciDrafCommunity("akun-B", "post", ROOM.id))).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Buang draf" }));
    expect(screen.getByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" })).toHaveFocus();
    expect(localStorage.getItem(kunciDrafCommunity(SUB, "post", ROOM.id))).toBeNull();
    next.unmount();
  });
  it("blocked storage keeps the editor usable and announces the persistence limitation", async () => {
    bukaDiskusi();
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    fireEvent.change(field, { target: { value: "Tetap bisa menulis" } });
    expect(field).toHaveValue("Tetap bisa menulis");
    await screen.findByText(/Browser tidak dapat menyimpan draf/);
  });
  it("empty input focuses the labelled field and does not send a request; axe covers the composer", async () => {
    const { request } = bukaDiskusi();
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    await userEvent.click(screen.getByRole("button", { name: "Kirim tulisan" }));
    expect(await screen.findByText("Isi tulisan terlebih dahulu.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(request.mock.calls.some(([p, o]) => p.endsWith("/posts") && o?.method === "POST")).toBe(
      false,
    );
    await harusLolosAksesibilitas(document.body);
  });
  it("offline writing never queues a mutation or sends on reconnect", async () => {
    const { request } = bukaDiskusi();
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    fireEvent.change(field, { target: { value: "Draf luring" } });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      onlineManager.setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    await userEvent.click(screen.getByRole("button", { name: "Kirim tulisan" }));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => {
      onlineManager.setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(request.mock.calls.some(([p, o]) => p.endsWith("/posts") && o?.method === "POST")).toBe(
      false,
    );
    expect(field).toHaveValue("Draf luring");
  });
  it("errors preserve draft; late completion after logout cannot restore cache or storage", async () => {
    let resolve!: (v: unknown) => void;
    const { request, cache } = bukaDiskusi(undefined, {
      handler: (p, o) =>
        p.endsWith("/posts") && o?.method === "POST"
          ? new Promise((r) => {
              resolve = r;
            })
          : undefined,
    });
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    fireEvent.change(field, { target: { value: "Hanya sekali" } });
    const button = screen.getByRole("button", { name: "Kirim tulisan" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      request.mock.calls.filter(([p, o]) => p.endsWith("/posts") && o?.method === "POST"),
    ).toHaveLength(1);
    act(() => useStoreSesi.getState().keluar());
    await act(async () => resolve({ data: { ...POST, body: "Hanya sekali" } }));
    expect(localStorage.getItem(kunciDrafCommunity(SUB, "post", ROOM.id))).toBeNull();
    expect(cache.getQueryData(communityContentKeys.post(SUB, POST.id))).toBeUndefined();
    expect(screen.queryByText("Hanya sekali")).toBeNull();
  });
  it("rate-limit failure leaves the draft available for an explicit retry", async () => {
    bukaDiskusi(undefined, {
      handler: (p, o) => {
        if (p.endsWith("/posts") && o?.method === "POST")
          throw new ApiError({ code: "TERLALU_BANYAK_PERMINTAAN", message: "Batas" }, 429);
      },
    });
    const field = await screen.findByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
    fireEvent.change(field, { target: { value: "Draf tetap ada" } });
    await userEvent.click(screen.getByRole("button", { name: "Kirim tulisan" }));
    await screen.findByText(/Terlalu banyak permintaan/);
    expect(field).toHaveValue("Draf tetap ada");
  });
  it("report validates inline, traps focus, announces success and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const { request } = bukaDiskusi(undefined, { member: null });
    const trigger = await screen.findByRole("button", { name: "Laporkan tulisan" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Laporkan tulisan" });
    await user.click(within(dialog).getByRole("button", { name: "Kirim laporan" }));
    const field = within(dialog).getByRole("textbox", { name: "Alasan laporan" });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-invalid", "true");
    await harusLolosAksesibilitas(document.body);
    await user.type(field, "Data pribadi dibagikan");
    await user.click(within(dialog).getByRole("button", { name: "Kirim laporan" }));
    await screen.findByText(/Laporan Anda diterima/);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(request.mock.calls.find(([p]) => p.includes("/reports"))?.[1]?.body).toEqual({
      reason: "Data pribadi dibagikan",
    });
    expect(JSON.stringify(localStorage)).not.toContain("Data pribadi dibagikan");
  });
  it("edits own hidden text without restoring it, then deletes with confirmation and stable focus", async () => {
    bukaDiskusi(DETAIL, {
      post: {
        ...POST,
        status: "hidden",
        moderation: { action: "hide", reason: "Perbaiki bahasa", createdAt: POST.createdAt },
      },
    });
    await screen.findByText("Perbaiki bahasa");
    await userEvent.click(await screen.findByRole("button", { name: "Ubah" }));
    const field = await screen.findByRole("textbox", { name: "Ubah tulisan" });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: "Bahasa yang lebih baik" } });
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await screen.findByText("Bahasa yang lebih baik");
    expect(screen.getByText("Disembunyikan pengelola")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Laporkan tulisan" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Hapus" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Hapus tulisan ini" }));
    await screen.findByText("Tulisan berhasil dihapus.");
    expect(screen.queryByText("Bahasa yang lebih baik")).toBeNull();
    await waitFor(() => expect(screen.getByRole("article")).toHaveFocus());
  });
  it("archive/leave prevents edit and new comments, but the owner can still delete", async () => {
    bukaDiskusi(DETAIL, { room: { ...ROOM, status: "archived" }, member: null });
    await screen.findByText(POST.body);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hapus" })).toBeVisible();
  });
  it("comments keep chronological DOM order, and markup is literal text", async () => {
    const html = "<img src=x onerror=alert(1)>";
    bukaDiskusi(DETAIL, { comment: { ...COMMENT, body: html } });
    await screen.findByText(html);
    expect(document.querySelector("article img")).toBeNull();
    const field = await screen.findByRole("textbox", { name: "Tulis komentar" });
    fireEvent.change(field, { target: { value: "Komentar kedua" } });
    await userEvent.click(screen.getByRole("button", { name: "Kirim komentar" }));
    await screen.findByText("Komentar berhasil dikirim.");
    const list = screen.getByRole("list", { name: "Komentar" });
    expect(
      within(list)
        .getAllByRole("article")
        .map((a) => a.textContent),
    ).toEqual([expect.stringContaining(html), expect.stringContaining("Komentar kedua")]);
  });
  it("own moderated comment remains readable when the parent is unavailable", async () => {
    bukaDiskusi(`/community/content/comment/${COMMENT.id}?room=${ROOM.id}`, {
      comment: {
        ...COMMENT,
        author: POST.author,
        status: "hidden",
        moderation: { action: "hide", reason: "Alasan untuk penulis", createdAt: POST.createdAt },
      },
      handler: (p) => {
        if (p === `/community-posts/${POST.id}`)
          throw new ApiError(
            { code: "KONTEN_KOMUNITAS_TIDAK_DITEMUKAN", message: "Tidak ada" },
            404,
          );
      },
    });
    await screen.findByText("Alasan untuk penulis");
    await screen.findByText(/Diskusi asal tidak tersedia/);
    expect(screen.queryByText(POST.body)).toBeNull();
    expect(screen.queryByRole("button", { name: "Laporkan tulisan" })).toBeNull();
    expect(await screen.findByRole("button", { name: "Ubah" })).toBeVisible();
  });
});
