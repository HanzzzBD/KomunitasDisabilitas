// Hapus akun lewat konfirmasi Google (PR-033c-2) — menutup AC PR-033 nomor 2
// bagi akun yang tidak punya nomor HP.
//
// YANG PALING MENENTUKAN DI BERKAS INI: penghapusan TIDAK boleh terjadi hanya
// karena halaman kembalian dibuka. Alamat `/masuk/google` bisa dibuka ulang
// lewat tombol kembali, riwayat, atau tab yang dipulihkan — dan yang terakhir
// ditekan pengguna sebelum sampai di sini adalah tombol milik GOOGLE, yang
// berbunyi "Lanjutkan" dan tidak menyebut penghapusan apa pun.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi, type StatusSesi } from "../src/shared/sesi/store.js";
import { siapkanHapusAkunGoogle, siapkanMasukGoogle } from "../src/features/auth/google.js";

const KUNCI = "nawasena-google-oauth";

interface Jejak {
  path: string;
  body: unknown;
}

type Hasil = "ok" | "bedaAkun" | "kedaluwarsa";

function klienPalsu(jejak: Jejak[], hasil: Hasil): ApiClient {
  return {
    request: (path: string, opsi?: { body?: unknown }) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      jejak.push({ path, body: opsi?.body });

      if (path === "/auth/account") {
        if (hasil === "bedaAkun") {
          return Promise.reject(
            new ApiError(
              { code: "KONFIRMASI_GOOGLE_BEDA_AKUN", message: "Akun Google berbeda" },
              403,
            ),
          ) as Promise<never>;
        }
        if (hasil === "kedaluwarsa") {
          return Promise.reject(
            new ApiError({ code: "GOOGLE_EXCHANGE_GAGAL", message: "Gagal" }, 400),
          ) as Promise<never>;
        }
        return Promise.resolve(undefined) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

/**
 * Menitipkan bekal OAuth seperti yang dilakukan halaman pengaturan, lalu
 * membuka alamat kembalian dengan `state` yang cocok.
 *
 * Titipannya dibuat lewat fungsi PRODUKSI, bukan ditulis tangan: bentuk titipan
 * yang dirakit test bebas menyimpang dari yang benar-benar ditulis aplikasi —
 * dan yang menyimpang di sini membuat seluruh berkas ini menguji alur yang
 * tidak pernah terjadi.
 */
async function titipkan(maksud: "masuk" | "hapus-akun") {
  sessionStorage.clear();
  const alamat =
    maksud === "hapus-akun"
      ? await siapkanHapusAkunGoogle({ clientId: "uji", asal: window.location.origin })
      : await siapkanMasukGoogle({ clientId: "uji", asal: window.location.origin, tujuan: "/" });
  const state = new URL(alamat).searchParams.get("state");
  return { alamat, state };
}

async function renderKembalian({
  maksud = "hapus-akun" as "masuk" | "hapus-akun",
  hasil = "ok" as Hasil,
  status = "masuk" as StatusSesi,
} = {}) {
  const { state } = await titipkan(maksud);
  useStoreSesi.setState({ status });

  const jejak: Jejak[] = [];
  const router = createMemoryRouter(ruteApp, {
    initialEntries: [`/masuk/google?code=kode-uji-dari-google&state=${state ?? ""}`],
  });
  const hasilRender = render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(jejak, hasil)}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasilRender, jejak, router };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllEnvs();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("titipan membawa MAKSUD perjalanan", () => {
  it("alur hapus akun ditandai, alur masuk tidak", async () => {
    await titipkan("hapus-akun");
    expect(JSON.parse(sessionStorage.getItem(KUNCI) ?? "{}")).toMatchObject({
      maksud: "hapus-akun",
    });

    await titipkan("masuk");
    expect(JSON.parse(sessionStorage.getItem(KUNCI) ?? "{}")).toMatchObject({ maksud: "masuk" });
  });

  it("titipan TANPA maksud diperlakukan sebagai MASUK, bukan hapus akun", async () => {
    // Bentuk lama (sebelum PR-033c-2) bisa masih tersimpan di tab yang belum
    // ditutup. Menebak "hapus akun" untuk sesuatu yang tidak menyatakannya
    // adalah cara terburuk untuk salah.
    const { state } = await titipkan("hapus-akun");
    const lama = JSON.parse(sessionStorage.getItem(KUNCI) ?? "{}") as Record<string, unknown>;
    delete lama.maksud;
    sessionStorage.setItem(KUNCI, JSON.stringify(lama));

    useStoreSesi.setState({ status: "masuk" });
    const jejak: Jejak[] = [];
    render(
      <Providers queryClient={createQueryClient()} klienApi={klienPalsu(jejak, "ok")}>
        <RouterProvider
          router={createMemoryRouter(ruteApp, {
            initialEntries: [`/masuk/google?code=kode&state=${state ?? ""}`],
          })}
        />
      </Providers>,
    );

    // Layar konfirmasi hapus akun TIDAK muncul.
    await waitFor(() => expect(jejak.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(jejak.map((j) => j.path)).not.toContain("/auth/account");
    expect(screen.queryByText(/Konfirmasi terakhir/)).toBeNull();
  });

  it("alur hapus akun MEMINTA Google membuktikan ulang", async () => {
    // Tanpa `max_age`, Google boleh mengembalikan code diam-diam karena
    // peramban ini masih punya sesi Google yang hidup — dan yang terbukti
    // hanyalah "peramban ini pernah dipakai masuk ke Google", persis kelemahan
    // yang seharusnya ditutup langkah re-auth.
    const { alamat } = await titipkan("hapus-akun");
    const params = new URL(alamat).searchParams;

    expect(params.get("max_age")).toBe("0");
    expect(params.get("prompt")).toBe("select_account");
  });

  it("alur MASUK biasa tidak memaksa autentikasi ulang", async () => {
    // Memaksanya di setiap login hanya menyulitkan tanpa menambah apa pun:
    // login memang boleh memakai sesi Google yang sudah ada.
    const { alamat } = await titipkan("masuk");
    const params = new URL(alamat).searchParams;

    expect(params.get("max_age")).toBeNull();
  });
});

describe("halaman kembalian TIDAK menghapus apa pun sendiri", () => {
  it("membuka alamat kembalian tidak mengirim permintaan hapus", async () => {
    // Inti PR ini. Alamat ini bisa dibuka ulang lewat tombol kembali, riwayat,
    // atau tab yang dipulihkan.
    const { jejak } = await renderKembalian();

    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });
    expect(jejak.map((j) => j.path)).not.toContain("/auth/account");
  });

  it("akibatnya DIULANG di layar ini, bukan diandalkan pada ingatan", async () => {
    // Antara membaca peringatan dan sampai di sini, pengguna menyeberangi
    // halaman Google — dan sebagian tiba beberapa menit kemudian.
    await renderKembalian();

    const judul = await screen.findByRole(
      "heading",
      { name: /Konfirmasi terakhir/ },
      { timeout: 5000 },
    );
    expect(judul).toBeInTheDocument();
    expect(screen.getByText(/menghapus akun Anda/i)).toBeInTheDocument();
  });

  it("penghapusan baru terkirim setelah tombol yang MENYEBUT AKIBATNYA ditekan", async () => {
    const { jejak } = await renderKembalian();
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });

    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    await waitFor(() => expect(jejak.map((j) => j.path)).toContain("/auth/account"));
    const permintaan = jejak.find((j) => j.path === "/auth/account");
    expect(permintaan?.body).toMatchObject({
      google: {
        code: "kode-uji-dari-google",
        // Alamat kembalian harus SAMA PERSIS dengan yang dipakai saat meminta
        // code — Google menolak bila berbeda, dan pesannya tidak menyebut
        // sebabnya. Keduanya dihitung dari `window.location.origin`, jadi test
        // ini memakai asal yang sama seperti halamannya.
        redirectUri: `${window.location.origin}/masuk/google`,
      },
    });
  });

  it("membatalkan mengantar ke pengaturan TANPA menghapus apa pun", async () => {
    const { jejak, router } = await renderKembalian();
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });

    await userEvent.click(screen.getByRole("button", { name: "Batal, jangan hapus akun saya" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/pengaturan"));
    expect(jejak.map((j) => j.path)).not.toContain("/auth/account");
  });
});

describe("keadaan sesi saat kembali", () => {
  it("selama sesi masih dipulihkan, tombol hapus BELUM ditawarkan", async () => {
    // `DELETE /auth/account` butuh access token, yang baru ada setelah cookie
    // refresh ditukarkan. Menawarkan tombolnya lebih dulu berarti menawarkan
    // tombol yang pasti gagal 401.
    await renderKembalian({ status: "memulihkan" });

    expect(await screen.findByText(/kami periksa dulu akun Anda/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus akun saya sekarang" })).toBeNull();
  });

  it("sesi yang sudah berakhir dikatakan sebabnya, bukan tombol yang pasti gagal", async () => {
    await renderKembalian({ status: "keluar" });

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/sesi Anda sudah berakhir/i);
    expect(screen.queryByRole("button", { name: "Hapus akun saya sekarang" })).toBeNull();
  });
});

describe("kegagalan konfirmasi", () => {
  it("akun Google berbeda → menyebut sebabnya dan cara memperbaikinya", async () => {
    // Hampir selalu salah pilih akun di layar Google, bukan serangan.
    const { jejak } = await renderKembalian({ hasil: "bedaAkun" });
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });

    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/berbeda dengan akun Nawasena ini/i);
    expect(alert).toHaveTextContent(/pilih akun Google yang biasa Anda pakai/i);
    // Akunnya TETAP ada: hanya satu percobaan yang terkirim.
    expect(jejak.filter((j) => j.path === "/auth/account")).toHaveLength(1);
  });

  it("konfirmasi kedaluwarsa → diminta mengulang dari pengaturan", async () => {
    await renderKembalian({ hasil: "kedaluwarsa" });
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });

    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent(
      /ulangi dari halaman pengaturan/i,
    );
  });
});

describe("sesudah akun terhapus", () => {
  it("layar terakhir menyebut jendela 30 hari", async () => {
    await renderKembalian();
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });

    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    const judul = await screen.findByRole(
      "heading",
      { name: "Akun Anda sudah dihapus" },
      { timeout: 5000 },
    );
    expect(judul).toBeInTheDocument();
    expect(screen.getByText(/30 hari/)).toBeInTheDocument();
  });

  it("menutupnya MENGAKHIRI sesi dan mengantar ke beranda", async () => {
    const { router } = await renderKembalian();
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));
    await screen.findByRole("heading", { name: "Akun Anda sudah dihapus" }, { timeout: 5000 });

    await userEvent.click(screen.getByRole("button", { name: "Kembali ke beranda" }));

    await waitFor(() => expect(useStoreSesi.getState().status).toBe("keluar"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("gerbang aksesibilitas lapis kedua", () => {
  it("layar konfirmasi terakhir lolos axe", async () => {
    const { container } = await renderKembalian();
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });

    await harusLolosAksesibilitas(container);
  });

  it("layar sesudah terhapus lolos axe", async () => {
    const { container } = await renderKembalian();
    await screen.findByRole("heading", { name: /Konfirmasi terakhir/ }, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));
    await screen.findByRole("heading", { name: "Akun Anda sudah dihapus" }, { timeout: 5000 });

    await harusLolosAksesibilitas(container);
  });
});
