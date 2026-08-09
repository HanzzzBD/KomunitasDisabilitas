// Perakitan klien API + pemulihan sesi saat boot (PR-030a).
//
// Yang diuji di sini adalah SIMPULNYA: klien butuh hook refresh, hook refresh
// butuh klien. Perakitan yang salah tidak gagal saat dipasang — ia gagal
// belakangan, saat token pertama kedaluwarsa, dan gejalanya "pengguna
// terlempar keluar tanpa sebab".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { buatKlienApi, pulihkanSesi, PenyediaKlienApi, useKlienApi } from "../src/app/klien-api.js";
import { ambilTokenAkses, useStoreSesi } from "../src/shared/sesi/store.js";

beforeEach(() => {
  useStoreSesi.getState().keluar();
  useStoreSesi.setState({ status: "memulihkan" });
});

/** Jawaban `/auth/refresh` yang berhasil. */
function jawabRefresh(accessToken: string) {
  return new Response(JSON.stringify({ data: { accessToken, expiresIn: 900 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("pemulihan sesi saat boot", () => {
  it("cookie yang masih sah → status 'masuk' dan token tersimpan", async () => {
    const fetchPalsu = vi.fn(() => Promise.resolve(jawabRefresh("token-pulih")));
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    await pulihkanSesi(klien);

    expect(useStoreSesi.getState().status).toBe("masuk");
    expect(ambilTokenAkses()).toBe("token-pulih");
  });

  it("tanpa cookie → status 'keluar', bukan macet di 'memulihkan'", async () => {
    // Macet di 'memulihkan' berarti guard menampilkan penanda memuat
    // selamanya — halaman yang tidak pernah selesai, tanpa pesan kesalahan.
    const fetchPalsu = vi.fn(() => Promise.resolve(new Response("{}", { status: 401 })));
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    await pulihkanSesi(klien);

    expect(useStoreSesi.getState().status).toBe("keluar");
    expect(ambilTokenAkses()).toBeNull();
  });

  it("jaringan mati → 'keluar' juga, tidak melempar", async () => {
    const fetchPalsu = vi.fn(() => Promise.reject(new Error("jaringan mati")));
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    await expect(pulihkanSesi(klien)).resolves.toBeUndefined();
    expect(useStoreSesi.getState().status).toBe("keluar");
  });

  it("TIDAK mencabut sesi yang terbentuk selagi pemulihan berjalan", async () => {
    // BUG NYATA, ditemukan test PR-030c. Pemulihan berjalan sejak aplikasi
    // dipasang, sementara pengguna bisa menyelesaikan login di halaman yang
    // sama sebelum jawabannya tiba — paling nyata di `/masuk/google`, yang
    // menukarkan code segera setelah dimuat. Pemulihan yang GAGAL (wajar:
    // pengunjung itu memang belum punya cookie) lalu memanggil `keluar()`
    // sesudah penukaran berhasil, dan mencabut sesi yang baru saja terbentuk.
    // Pengguna terlempar keluar tepat setelah berhasil masuk, tanpa satu pun
    // pesan kesalahan.
    let tolak: (sebab: Error) => void = () => {};
    const fetchPalsu = vi.fn(
      () =>
        new Promise<Response>((_, r) => {
          tolak = r;
        }),
    );
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    const berjalan = pulihkanSesi(klien);
    // Tunggu fetch benar-benar dipanggil: penolaknya baru terpasang di dalam
    // executor promise, dan `doFetch` menunggu `getAccessToken` lebih dulu.
    await waitFor(() => expect(fetchPalsu).toHaveBeenCalled());
    // Login lain selesai lebih dulu.
    useStoreSesi.getState().masuk("token-dari-google");
    tolak(new Error("tanpa cookie"));
    await berjalan;

    expect(useStoreSesi.getState().status).toBe("masuk");
    expect(ambilTokenAkses()).toBe("token-dari-google");
  });

  it("TIDAK menimpa token yang lebih baru saat pemulihan berhasil terlambat", async () => {
    let selesaikan: (r: Response) => void = () => {};
    const fetchPalsu = vi.fn(
      () =>
        new Promise<Response>((res) => {
          selesaikan = res;
        }),
    );
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    const berjalan = pulihkanSesi(klien);
    await waitFor(() => expect(fetchPalsu).toHaveBeenCalled());
    useStoreSesi.getState().masuk("token-dari-google");
    selesaikan(jawabRefresh("token-pulih-basi"));
    await berjalan;

    expect(ambilTokenAkses()).toBe("token-dari-google");
  });

  it("memanggil /auth/refresh pada base URL relatif", async () => {
    // Base URL absolut ke host lain berarti cookie HttpOnly tidak ikut
    // terkirim, dan sesi tidak pernah bisa dipulihkan.
    const fetchPalsu = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(jawabRefresh("t")),
    );
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    await pulihkanSesi(klien);

    expect(fetchPalsu.mock.calls[0]?.[0]).toBe("/api/v1/auth/refresh");
  });
});

describe("simpul klien ↔ refresh tersambung", () => {
  it("401 pada permintaan biasa memicu refresh lalu mengulang SEKALI", async () => {
    useStoreSesi.getState().masuk("token-basi");

    const panggilan: string[] = [];
    const fetchPalsu = vi.fn((url: string) => {
      panggilan.push(url);
      if (url.endsWith("/auth/refresh")) return Promise.resolve(jawabRefresh("token-segar"));
      // Permintaan pertama 401; sesudah refresh, berhasil.
      if (panggilan.filter((p) => p.endsWith("/apa-saja")).length === 1) {
        return Promise.resolve(new Response("{}", { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));
    });

    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });
    await klien.request("/apa-saja");

    expect(panggilan).toEqual(["/api/v1/apa-saja", "/api/v1/auth/refresh", "/api/v1/apa-saja"]);
    // Token baru dari refresh benar-benar dipakai — bukan hanya disimpan.
    expect(ambilTokenAkses()).toBe("token-segar");
  });

  it("refresh yang ditolak mengakhiri sesi", async () => {
    useStoreSesi.getState().masuk("token-basi");

    const fetchPalsu = vi.fn(() => Promise.resolve(new Response("{}", { status: 401 })));
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    await expect(klien.request("/apa-saja")).rejects.toThrow();
    expect(useStoreSesi.getState().status).toBe("keluar");
    expect(ambilTokenAkses()).toBeNull();
  });

  it("token dikirim sebagai Bearer saat ada", async () => {
    useStoreSesi.getState().masuk("token-aktif");

    const fetchPalsu = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ data: "ok" }), { status: 200 })),
    );
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });
    await klien.request("/apa-saja");

    const init = fetchPalsu.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer token-aktif");
  });
});

describe("penyedia klien", () => {
  function Pembaca() {
    // Membuktikan konteksnya benar-benar terpasang, bukan hanya ada.
    return <p>{useKlienApi() === null ? "kosong" : "ada klien"}</p>;
  }

  it("menyediakan klien ke pohon di bawahnya", async () => {
    const klien = { request: () => new Promise<never>(() => {}) };
    render(
      <PenyediaKlienApi klien={klien}>
        <Pembaca />
      </PenyediaKlienApi>,
    );

    expect(await screen.findByText("ada klien")).toBeInTheDocument();
  });

  it("memicu pemulihan sesi saat dipasang", async () => {
    const fetchPalsu = vi.fn(() => Promise.resolve(jawabRefresh("token-dari-provider")));
    const klien = buatKlienApi({ fetch: fetchPalsu as unknown as typeof globalThis.fetch });

    render(
      <PenyediaKlienApi klien={klien}>
        <p>isi</p>
      </PenyediaKlienApi>,
    );

    await waitFor(() => expect(useStoreSesi.getState().status).toBe("masuk"));
    expect(ambilTokenAkses()).toBe("token-dari-provider");
  });

  it("dipakai di luar penyedianya → galat yang menyebut penyebabnya", () => {
    const diam = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Pembaca />)).toThrow(/PenyediaKlienApi/);
    diam.mockRestore();
  });
});
