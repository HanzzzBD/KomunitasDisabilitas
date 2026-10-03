// Kamus BISINDO admin (PR-085b). Alur browser nyata + axe di
// `e2e/admin-kamus.spec.ts`; berkas ini menjaga cepat di jsdom:
//   - unggah per berkas: presign → PUT (XHR) → simpan key; progres diumumkan;
//   - berkas yang pasti ditolak tidak memakan permintaan;
//   - gagal unggah → alert + "Coba lagi" mengulang HANYA berkas itu;
//   - Terbitkan nonaktif selama kurang; tarik ke draf lewat dialog.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { SignVideoAdmin } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const ADMIN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Admin Uji",
  email: null,
  phone: "+6281234567890",
  role: "admin",
  createdAt: "2026-01-15T20:00:00.000Z",
};
const ID = "01912345-89ab-7def-8123-4567890aac01";
const DRAFT: SignVideoAdmin = {
  id: ID,
  phrase: "Terima kasih",
  category: "salam",
  status: "draft",
  videoKey: `sign-videos/${ID}/video-uji.mp4`,
  thumbnailKey: null,
  captionKey: null,
  transcript: null,
  durationS: null,
  createdBy: null,
  createdAt: "2026-10-03T03:00:00.000Z",
  updatedAt: "2026-10-03T03:00:00.000Z",
};

/** XHR palsu global — dikendalikan test lewat `xhrTerakhir`. */
class XhrUji {
  static semua: XhrUji[] = [];
  status = 0;
  upload: { onprogress: ((e: object) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  url = "";
  header: Record<string, string> = {};
  constructor() {
    XhrUji.semua.push(this);
  }
  open(_m: string, url: string) {
    this.url = url;
  }
  setRequestHeader(n: string, v: string) {
    this.header[n] = v;
  }
  send() {}
  abort() {
    this.onabort?.();
  }
  maju(persen: number) {
    this.upload.onprogress?.({ loaded: persen, total: 100, lengthComputable: true });
  }
  selesai(status = 200) {
    this.status = status;
    this.onload?.();
  }
}
const xhrTerakhir = () => XhrUji.semua.at(-1) as XhrUji;

interface Permintaan {
  path: string;
  method: string;
  body: unknown;
}

function renderKamus(jalur: string, awal: SignVideoAdmin = DRAFT) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  let entri = { ...awal };
  const klien: ApiClient = {
    request: (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }
      if (path === "/me") return Promise.resolve({ data: ADMIN }) as Promise<never>;
      jejak.push({ path, method, body: options?.body });
      if (path === "/admin/sign-videos")
        return Promise.resolve({ data: [entri] }) as Promise<never>;
      if (path === "/admin/sign-videos/presign") {
        const b = options?.body as { kind: string };
        return Promise.resolve({
          data: {
            key: `sign-videos/${ID}/${b.kind}-baru.vtt`,
            uploadUrl: `https://storage.uji.test/${b.kind}?sig=1`,
            method: "PUT",
            headers: { "content-type": "text/vtt" },
            expiresAt: "2026-10-03T03:05:00.000Z",
          },
        }) as Promise<never>;
      }
      if (path.endsWith("/publish")) entri = { ...entri, status: "published" };
      else if (path.endsWith("/unpublish")) entri = { ...entri, status: "draft" };
      else if (method === "PUT") entri = { ...entri, ...(options?.body as object) };
      return Promise.resolve({ data: entri }) as Promise<never>;
    },
  };
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  render(
    <Providers queryClient={createQueryClient()} klienApi={klien}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { jejak };
}

beforeEach(() => {
  XhrUji.semua = [];
  vi.stubGlobal("XMLHttpRequest", XhrUji);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useStoreSesi.setState({ status: "memulihkan" });
});

const vtt = (isi = "WEBVTT\n") => new File([isi], "terima-kasih.vtt", { type: "" });

describe("/admin/kamus", () => {
  it("daftar menulis kelengkapan sebagai teks", async () => {
    renderKamus("/admin/kamus");
    const baris = (await screen.findByText("Terima kasih")).closest("tr") as HTMLElement;
    expect(within(baris).getByText("Kurang: caption (.vtt), transkrip")).toBeInTheDocument();
  });
});

describe("/admin/kamus/:id — unggah per berkas", () => {
  it("caption: presign → PUT ke bucket → simpan key; progres diumumkan per 25%", async () => {
    const { jejak } = renderKamus(`/admin/kamus/${ID}`);
    const user = userEvent.setup();
    const terbitkan = await screen.findByRole("button", { name: "Terbitkan" });
    expect(terbitkan).toHaveAttribute("aria-disabled", "true");
    expect(terbitkan).toHaveAccessibleDescription(
      "Belum bisa terbit. Lengkapi dulu: caption (.vtt), transkrip.",
    );

    await user.upload(screen.getByLabelText("Caption (.vtt)"), vtt());
    await waitFor(() => expect(XhrUji.semua).toHaveLength(1));
    expect(jejak.find((p) => p.path.endsWith("/presign"))?.body).toEqual({
      videoId: ID,
      kind: "caption",
      contentType: "text/vtt",
      size: 7,
    });
    expect(xhrTerakhir().url).toBe("https://storage.uji.test/caption?sig=1");
    expect(xhrTerakhir().header).toEqual({ "content-type": "text/vtt" });

    act(() => xhrTerakhir().maju(30));
    expect(await screen.findByText("Mengunggah Caption (.vtt): 25%")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Kemajuan unggah Caption (.vtt)" }),
    ).toHaveAttribute("value", "30");
    act(() => xhrTerakhir().selesai());
    expect(await screen.findByText("Caption (.vtt) tersimpan.")).toBeInTheDocument();
    expect(jejak.find((p) => p.method === "PUT")?.body).toEqual({
      captionKey: `sign-videos/${ID}/caption-baru.vtt`,
    });
    expect(screen.getByText("Tersimpan: caption-baru.vtt")).toBeInTheDocument();
  });

  it("caption > 200 KB ditolak di browser tanpa permintaan apa pun", async () => {
    const { jejak } = renderKamus(`/admin/kamus/${ID}`);
    const user = userEvent.setup();
    await user.upload(
      await screen.findByLabelText("Caption (.vtt)"),
      vtt("x".repeat(200 * 1024 + 1)),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Caption lebih dari 200 KB");
    expect(jejak.some((p) => p.path.endsWith("/presign"))).toBe(false);
  });

  it("ditolak bucket → alert; Coba lagi mengulang berkas yang sama", async () => {
    const { jejak } = renderKamus(`/admin/kamus/${ID}`);
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText("Caption (.vtt)"), vtt());
    await waitFor(() => expect(XhrUji.semua).toHaveLength(1));
    act(() => xhrTerakhir().selesai(403));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Penyimpanan menolak Caption (.vtt)",
    );

    await user.click(screen.getByRole("button", { name: "Coba unggah Caption (.vtt) lagi" }));
    await waitFor(() => expect(XhrUji.semua).toHaveLength(2));
    act(() => xhrTerakhir().selesai());
    expect(await screen.findByText("Caption (.vtt) tersimpan.")).toBeInTheDocument();
    expect(jejak.filter((p) => p.path.endsWith("/presign"))).toHaveLength(2);
  });

  it("lengkap → Terbitkan aktif → POST publish; tarik lewat dialog → POST unpublish", async () => {
    const { jejak } = renderKamus(`/admin/kamus/${ID}`, {
      ...DRAFT,
      captionKey: `sign-videos/${ID}/caption-uji.vtt`,
      transcript: "Tangan kanan di dagu lalu maju.",
    });
    const user = userEvent.setup();
    const terbitkan = await screen.findByRole("button", { name: "Terbitkan" });
    expect(terbitkan).not.toHaveAttribute("aria-disabled", "true");
    await user.click(terbitkan);
    expect(
      await screen.findByText("Terima kasih sudah terbit di kamus publik."),
    ).toBeInTheDocument();
    expect(jejak.some((p) => p.path === `/admin/sign-videos/${ID}/publish`)).toBe(true);

    await user.click(await screen.findByRole("button", { name: "Tarik ke draf" }));
    const dialog = await screen.findByRole("dialog", { name: "Tarik Terima kasih ke draf?" });
    expect(jejak.some((p) => p.path.endsWith("/unpublish"))).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Ya, tarik ke draf" }));
    expect(await screen.findByText(/ditarik ke draf/)).toBeInTheDocument();
    expect(jejak.some((p) => p.path === `/admin/sign-videos/${ID}/unpublish`)).toBe(true);
  });
});
