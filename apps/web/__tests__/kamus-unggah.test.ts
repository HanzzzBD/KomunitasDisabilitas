// Helper unggah kamus BISINDO (PR-085b) — tanpa DOM, XHR palsu.
import { describe, expect, it, vi } from "vitest";
import {
  acceptUntuk,
  periksaBerkas,
  persenDiumumkan,
  tipeBerkas,
  unggahKeStorage,
  UnggahGagal,
  type XhrMinimal,
} from "../src/features/admin/kamus-unggah.js";

const IZIN = {
  uploadUrl: "https://storage.uji.test/sign-videos/x/caption-1.vtt?sig=1",
  method: "PUT" as const,
  headers: { "content-type": "text/vtt" },
};

function xhrPalsu() {
  const xhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(() => xhr.onabort?.()),
    status: 0,
    upload: { onprogress: null },
    onload: null,
    onerror: null,
    onabort: null,
  } as XhrMinimal & {
    open: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  return xhr;
}

describe("unggahKeStorage", () => {
  it("PUT ke URL izin dengan header izin; progres tanpa duplikat; 100 saat selesai", async () => {
    const xhr = xhrPalsu();
    const progres: number[] = [];
    const berkas = new Blob(["WEBVTT\n"]);
    const janji = unggahKeStorage(IZIN, berkas, {
      onProgres: (p) => progres.push(p),
      buatXhr: () => xhr,
    });
    expect(xhr.open).toHaveBeenCalledWith("PUT", IZIN.uploadUrl);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith("content-type", "text/vtt");
    expect(xhr.send).toHaveBeenCalledWith(berkas);

    for (const loaded of [10, 10, 50, 90]) {
      xhr.upload.onprogress?.({ loaded, total: 100, lengthComputable: true });
    }
    xhr.status = 200;
    xhr.onload?.();
    await janji;
    expect(progres).toEqual([10, 50, 90, 100]);
  });

  it.each([
    ["403 → ditolak", (x: XhrMinimal) => ((x.status = 403), x.onload?.()), "ditolak"],
    ["putus → jaringan", (x: XhrMinimal) => x.onerror?.(), "jaringan"],
  ] as const)("%s", async (_n, picu, jenis) => {
    const xhr = xhrPalsu();
    const janji = unggahKeStorage(IZIN, new Blob(["a"]), { onProgres: () => {}, buatXhr: () => xhr });
    picu(xhr);
    await expect(janji).rejects.toMatchObject({ jenis });
  });

  it("signal abort → dibatalkan; signal yang sudah abort tidak membuka koneksi", async () => {
    const xhr = xhrPalsu();
    const pengendali = new AbortController();
    const janji = unggahKeStorage(IZIN, new Blob(["a"]), {
      onProgres: () => {},
      signal: pengendali.signal,
      buatXhr: () => xhr,
    });
    pengendali.abort();
    await expect(janji).rejects.toBeInstanceOf(UnggahGagal);
    expect(xhr.abort).toHaveBeenCalled();

    const xhr2 = xhrPalsu();
    await expect(
      unggahKeStorage(IZIN, new Blob(["a"]), {
        onProgres: () => {},
        signal: pengendali.signal,
        buatXhr: () => xhr2,
      }),
    ).rejects.toMatchObject({ jenis: "dibatalkan" });
    expect(xhr2.open).not.toHaveBeenCalled();
  });
});

describe("validasi berkas di browser", () => {
  it("`.vtt` bertipe kosong (Windows) dikenali dari ekstensinya", () => {
    expect(tipeBerkas("caption", { name: "terima-kasih.VTT", type: "" })).toBe("text/vtt");
    expect(tipeBerkas("thumbnail", { name: "a.jpeg", type: "" })).toBe("image/jpeg");
    expect(tipeBerkas("video", { name: "a.mov", type: "" })).toBe("");
  });

  it("kosong, tipe salah, dan terlalu besar ditolak dengan kunci per jenis", () => {
    expect(periksaBerkas("video", { name: "a.mp4", type: "video/mp4", size: 0 })).toBe(
      "admin.kamus.unggah.galat.kosong",
    );
    expect(periksaBerkas("video", { name: "a.mov", type: "video/quicktime", size: 9 })).toBe(
      "admin.kamus.unggah.galat.tipe.video",
    );
    expect(
      periksaBerkas("caption", { name: "a.vtt", type: "", size: 200 * 1024 + 1 }),
    ).toBe("admin.kamus.unggah.galat.ukuran.caption");
    expect(periksaBerkas("video", { name: "a.webm", type: "video/webm", size: 50 * 1024 * 1024 })).toBeNull();
  });

  it("accept memuat MIME dan ekstensi", () => {
    expect(acceptUntuk("caption")).toBe("text/vtt,.vtt");
  });

  it("persen diumumkan hanya kelipatan 25", () => {
    expect([0, 24, 25, 49, 50, 99, 100].map(persenDiumumkan)).toEqual([0, 0, 25, 25, 50, 75, 100]);
  });
});
