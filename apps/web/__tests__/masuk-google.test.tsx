// AC PR-030 nomor 2 (login Google) — halaman kembalian `/masuk/google`.
//
// Pengguna tidak pernah meminta halaman ini, ia hanya melewatinya. Karena itu
// yang diuji adalah apa yang terjadi SESUDAHNYA: sesi terbentuk dan ia
// mendarat di tempat yang benar, atau ia diberi tahu apa yang harus dilakukan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { MasukGoogle } from "../src/routes/masuk-google.js";
import { ambilTokenAkses, useStoreSesi } from "../src/shared/sesi/store.js";
import { siapkanMasukGoogle } from "../src/features/auth/google.js";

const OK_GOOGLE = {
  data: { userId: "u-1", isNewUser: false, accessToken: "tok-google", expiresIn: 900 },
};

beforeEach(() => {
  useStoreSesi.getState().keluar();
  sessionStorage.clear();
});

/**
 * Klien palsu yang MENOLAK `/auth/refresh`.
 *
 * `Providers` memulihkan sesi saat dipasang (PR-030a) memakai klien yang sama.
 * Klien palsu yang menjawab "berhasil" untuk SEMUA path ikut menjawab
 * pemulihan itu — dan halaman jadi berstatus "masuk" sebelum test berbuat apa
 * pun. Akibatnya test yang seharusnya membuktikan "penyerang TIDAK berhasil
 * masuk" lulus atau gagal karena hal yang sama sekali lain.
 *
 * Penolakan adalah keadaan yang benar di sini: pengunjung halaman masuk memang
 * belum punya cookie sesi.
 */
function klienPalsu(jawab: (path: string, body: unknown) => unknown): ApiClient {
  return {
    request: (path: string, opsi?: { body?: unknown }) => {
      if (path === "/auth/refresh")
        return Promise.reject(new Error("tanpa sesi")) as Promise<never>;
      return Promise.resolve(jawab(path, opsi?.body)) as Promise<never>;
    },
  };
}

/** Asal jsdom — jangan ditulis tangan; port-nya ditentukan konfigurasi vitest. */
const ASAL = window.location.origin;

/** Titipkan seperti tombol Google melakukannya, lalu kembalikan state-nya. */
async function titipkan(tujuan = "/lamaran"): Promise<string> {
  await siapkanMasukGoogle({
    clientId: "klien-uji",
    asal: ASAL,
    tujuan,
    simpanan: sessionStorage,
  });
  const mentah = sessionStorage.getItem("nawasena-google-oauth");
  return (JSON.parse(mentah ?? "{}") as { state: string }).state;
}

function renderKembalian(klien: ApiClient, query: string) {
  const router = createMemoryRouter(
    [
      // `<main>` disediakan harness, bukan halaman — sejak PR-032a landmark
      // utama milik `TataLetak`, satu untuk seluruh aplikasi.
      { path: "/masuk/google", element: <main>{<MasukGoogle />}</main> },
      { path: "/masuk", element: <h1>Halaman masuk</h1> },
      { path: "/lamaran", element: <h1>Lamaran</h1> },
      { path: "/", element: <h1>Beranda</h1> },
    ],
    { initialEntries: [`/masuk/google${query}`] },
  );
  render(
    <Providers queryClient={createQueryClient()} klienApi={klien}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

describe("AC-2: penukaran code berhasil", () => {
  it("sesi terbentuk dan pengguna diantar ke tujuan awalnya", async () => {
    const state = await titipkan("/lamaran");
    const klien = klienPalsu(() => OK_GOOGLE);

    const router = renderKembalian(klien, `?code=kode-google&state=${state}`);

    await waitFor(() => expect(useStoreSesi.getState().status).toBe("masuk"));
    expect(ambilTokenAkses()).toBe("tok-google");
    await waitFor(() => expect(router.state.location.pathname).toBe("/lamaran"));
  });

  it("verifier dan redirect_uri ikut dikirim ke server", async () => {
    const state = await titipkan();
    const dikirim: unknown[] = [];
    const klien = klienPalsu((path, body) => {
      if (path === "/auth/google") dikirim.push(body);
      return OK_GOOGLE;
    });

    renderKembalian(klien, `?code=kode-google&state=${state}`);

    await waitFor(() => expect(dikirim).toHaveLength(1));
    const body = dikirim[0] as Record<string, string>;
    expect(body.code).toBe("kode-google");
    expect(body.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    // Harus sama persis dengan yang dipakai saat meminta code — Google menolak
    // bila berbeda, dan pesannya tidak menyebutkan sebabnya.
    expect(body.redirectUri).toBe(`${ASAL}/masuk/google`);
    expect(body.client).toBe("web");
  });

  it("code hanya ditukarkan SEKALI", async () => {
    // Code dari Google sekali pakai; penukaran kedua selalu gagal dan bisa
    // menimpa keberhasilan yang pertama.
    //
    // BATAS TEST INI, disebut apa adanya: yang benar-benar dijaga di sini
    // adalah titipan sekali-pakai (lihat google-oauth.test.ts). Penjaga
    // `sudahJalan` di komponen menahan efek ganda React 18 StrictMode — dan
    // efek ganda itu TIDAK bisa direproduksi di jsdom/vitest ini: dibungkus
    // StrictMode sekalipun, efeknya tetap berjalan sekali. Jadi penjaga itu
    // tidak terjaga test mana pun; ia bertahan atas dasar alasan, bukan bukti.
    const state = await titipkan();
    let jumlah = 0;
    const klien = klienPalsu((path) => {
      if (path === "/auth/google") jumlah += 1;
      return OK_GOOGLE;
    });

    renderKembalian(klien, `?code=kode-google&state=${state}`);
    await waitFor(() => expect(useStoreSesi.getState().status).toBe("masuk"));

    expect(jumlah).toBe(1);
  });

  it("selagi menukar, menunggunya diumumkan", async () => {
    const state = await titipkan();
    const klien = klienPalsu(() => new Promise(() => {}) as never);

    renderKembalian(klien, `?code=kode-google&state=${state}`);

    const status = await screen.findByRole("status");
    expect(status.textContent ?? "").toMatch(/menyelesaikan masuk|selesaikan masuk/i);
  });
});

describe("state tidak cocok — alur dihentikan", () => {
  it("code milik penyerang TIDAK pernah ditukarkan", async () => {
    // Login-CSRF: korban mendarat di aplikasi yang benar dan tampak sudah
    // masuk, tetapi ke akun penyerang.
    await titipkan();
    let jumlah = 0;
    const klien = klienPalsu((path) => {
      if (path === "/auth/google") jumlah += 1;
      return OK_GOOGLE;
    });

    renderKembalian(klien, "?code=kode-penyerang&state=state-karangan");

    await screen.findByRole("alert");
    expect(jumlah).toBe(0);
    expect(useStoreSesi.getState().status).not.toBe("masuk");
  });

  it("pesannya menyebut alasannya, bukan galat umum", async () => {
    await titipkan();
    const klien = klienPalsu(() => OK_GOOGLE);

    renderKembalian(klien, "?code=kode-penyerang&state=state-karangan");

    expect(await screen.findByRole("alert")).toHaveTextContent(/tidak berasal dari|tidak aman/i);
  });
});

describe("kegagalan lain diberi jalan keluar", () => {
  it("tanpa titipan sama sekali → disuruh mengulang dari halaman masuk", async () => {
    const klien = klienPalsu(() => OK_GOOGLE);
    renderKembalian(klien, "?code=kode&state=apa-saja");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /sudah dipakai|kedaluwarsa|tidak bisa dipakai/i,
    );
  });

  it("pengguna membatalkan di layar Google → bukan pesan yang menuduh ada yang rusak", async () => {
    const klien = klienPalsu(() => OK_GOOGLE);
    renderKembalian(klien, "?error=access_denied");

    expect(await screen.findByRole("alert")).toHaveTextContent(/membatalkan|batal masuk/i);
  });

  it("penukaran ditolak server → pesan yang menyuruh ulangi dari awal", async () => {
    const { ApiError } = await import("@nawasena/api-client");
    const state = await titipkan();
    const klien = klienPalsu((path) => {
      if (path !== "/auth/google") return OK_GOOGLE;
      throw new ApiError(
        { code: "GOOGLE_EXCHANGE_GAGAL", message: "Masuk dengan Google tidak berhasil" },
        401,
      );
    });

    renderKembalian(klien, `?code=kode&state=${state}`);

    expect(await screen.findByRole("alert")).toHaveTextContent(/ulangi|coba lagi/i);
    expect(useStoreSesi.getState().status).not.toBe("masuk");
  });

  it("selalu ada tombol kembali ke halaman masuk", async () => {
    // Halaman buntu tanpa jalan keluar adalah tempat pengguna berhenti memakai
    // produk — apalagi halaman yang tidak pernah ia minta.
    const klien = klienPalsu(() => OK_GOOGLE);
    const router = renderKembalian(klien, "?error=access_denied");
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: /Kembali ke halaman masuk/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"));
  });
});

describe("gerbang aksesibilitas", () => {
  it("halaman menunggu lolos axe", async () => {
    const state = await titipkan();
    const klien = klienPalsu(() => new Promise(() => {}) as never);
    renderKembalian(klien, `?code=kode&state=${state}`);
    await screen.findByRole("status");

    await harusLolosAksesibilitas(document.body);
  });

  it("halaman gagal lolos axe", async () => {
    const klien = klienPalsu(() => OK_GOOGLE);
    renderKembalian(klien, "?error=access_denied");
    await screen.findByRole("alert");

    await harusLolosAksesibilitas(document.body);
  });

  it("penjaga ini tidak lulus hampa — tombol tanpa nama tertangkap", async () => {
    const palsu = document.createElement("div");
    palsu.innerHTML = '<button type="button"></button>';
    document.body.append(palsu);
    try {
      await expect(harusLolosAksesibilitas(palsu)).rejects.toThrow(/button-name/);
    } finally {
      palsu.remove();
    }
  });
});

describe("tombol Google di halaman masuk", () => {
  it("TIDAK muncul bila client ID belum diatur", async () => {
    // Tombol yang pasti gagal lebih buruk daripada tidak ada: pengguna mengira
    // dirinya yang salah, mencoba berulang, lalu menyerah.
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    const { Masuk } = await import("../src/routes/masuk.js");
    const klien = klienPalsu(() => ({ data: { retryAfterSeconds: 0 } }));

    render(
      <Providers queryClient={createQueryClient()} klienApi={klien}>
        <RouterProvider
          router={createMemoryRouter([{ path: "/masuk", element: <Masuk /> }], {
            initialEntries: ["/masuk"],
          })}
        />
      </Providers>,
    );
    await screen.findByLabelText(/Nomor HP/);

    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    // Jalur OTP tetap terbuka penuh.
    expect(screen.getByRole("button", { name: "Kirim kode" })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("muncul bila client ID ada", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "klien-uji.apps.googleusercontent.com");
    const { Masuk } = await import("../src/routes/masuk.js");
    const klien = klienPalsu(() => ({ data: { retryAfterSeconds: 0 } }));

    render(
      <Providers queryClient={createQueryClient()} klienApi={klien}>
        <RouterProvider
          router={createMemoryRouter([{ path: "/masuk", element: <Masuk /> }], {
            initialEntries: ["/masuk"],
          })}
        />
      </Providers>,
    );
    await screen.findByLabelText(/Nomor HP/);

    expect(screen.getByRole("button", { name: "Masuk dengan Google" })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
