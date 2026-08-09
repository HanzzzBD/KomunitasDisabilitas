// AC PR-030 nomor 1 (login OTP) dan 4 (galat diumumkan screen reader), plus
// bagian keyboard dari nomor 3.
//
// Seluruh alur dijalankan lewat perbuatan pengguna — mengetik, menekan Enter,
// menekan tombol — bukan lewat pemanggilan handler. Form yang handler-nya benar
// tetapi tidak pernah tersambung ke tombol akan lolos dari test yang memanggil
// fungsinya langsung.
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { Masuk } from "../src/routes/masuk.js";
import { ambilTokenAkses, useStoreSesi } from "../src/shared/sesi/store.js";

beforeEach(() => {
  useStoreSesi.getState().keluar();
});

/** Klien yang jawabannya ditentukan per-path oleh test. */
function klienPalsu(jawab: (path: string, body: unknown) => unknown): ApiClient {
  return {
    request: (path: string, opsi?: { body?: unknown }) =>
      Promise.resolve(jawab(path, opsi?.body)) as Promise<never>,
  };
}

/**
 * Perekam permintaan yang MENGABAIKAN `/auth/refresh`.
 *
 * `Providers` memulihkan sesi saat dipasang (PR-030a), dan pemulihan itu
 * memakai klien yang sama — jadi tiap halaman yang dirender mengirim satu
 * permintaan sebelum pengguna berbuat apa pun. Menghitungnya bersama
 * permintaan alur OTP membuat angkanya bergeser satu tanpa sebab yang terlihat.
 */
function permintaanAuth() {
  const daftar: Array<{ path: string; body: unknown }> = [];
  return {
    daftar,
    rekam(path: string, body: unknown) {
      if (path !== "/auth/refresh") daftar.push({ path, body });
    },
  };
}

const OK_KIRIM = { data: { retryAfterSeconds: 0 } };
const OK_VERIFIKASI = {
  data: { userId: "u-1", isNewUser: false, accessToken: "tok", expiresIn: 900 },
};

function renderMasuk(klien: ApiClient, jalur = "/masuk") {
  const router = createMemoryRouter(
    [
      // `<main>` disediakan harness, bukan halaman — sejak PR-032a landmark
      // utama milik `TataLetak`, satu untuk seluruh aplikasi. Tanpa dibungkus
      // di sini, gerbang axe akan melaporkan "konten di luar landmark" atas
      // keadaan yang TIDAK PERNAH terjadi di produksi.
      { path: "/masuk", element: <main>{<Masuk />}</main> },
      { path: "/", element: <h1>Beranda</h1> },
      { path: "/lamaran", element: <h1>Lamaran</h1> },
    ],
    { initialEntries: [jalur] },
  );
  render(
    <Providers queryClient={createQueryClient()} klienApi={klien}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

const kotakNomor = () => screen.getByLabelText(/Nomor HP/);
const kotakKode = () => screen.getByLabelText(/Kode 6 angka/);

async function sampaiLangkahKode(klien: ApiClient, jalur?: string) {
  const router = renderMasuk(klien, jalur);
  await userEvent.type(kotakNomor(), "081234567890");
  await userEvent.click(screen.getByRole("button", { name: "Kirim kode" }));
  await screen.findByLabelText(/Kode 6 angka/);
  return router;
}

describe("AC-1: alur OTP dari nomor sampai sesi", () => {
  it("nomor lokal 0812… dikirim ke server sebagai E.164", async () => {
    // Yang diketik pengguna dan yang dituntut skema berbeda; terjemahannya
    // harus benar-benar sampai ke jaringan, bukan hanya ke layar.
    const dikirim = permintaanAuth();
    const klien = klienPalsu((path, body) => {
      dikirim.rekam(path, body);
      return OK_KIRIM;
    });
    renderMasuk(klien);

    await userEvent.type(kotakNomor(), "0812 3456 7890");
    await userEvent.click(screen.getByRole("button", { name: "Kirim kode" }));

    await waitFor(() => expect(dikirim.daftar).toHaveLength(1));
    expect(dikirim.daftar[0]?.path).toBe("/auth/otp/request");
    expect(dikirim.daftar[0]?.body).toEqual({ phone: "+6281234567890" });
  });

  it("kode benar → sesi terbentuk dan pengguna diantar ke beranda", async () => {
    const klien = klienPalsu((path) => (path === "/auth/otp/request" ? OK_KIRIM : OK_VERIFIKASI));
    const router = await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(useStoreSesi.getState().status).toBe("masuk"));
    expect(ambilTokenAkses()).toBe("tok");
    expect(router.state.location.pathname).toBe("/");
  });

  it("tujuan awal dari guard dihormati sesudah masuk", async () => {
    const klien = klienPalsu((path) => (path === "/auth/otp/request" ? OK_KIRIM : OK_VERIFIKASI));
    const router = await sampaiLangkahKode(klien, "/masuk?tujuan=%2Flamaran");

    await userEvent.type(kotakKode(), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/lamaran"));
  });

  it("tujuan ke luar situs TIDAK diikuti", async () => {
    // Pertahanan open redirect ikut berlaku di titik pemakaiannya, bukan hanya
    // di fungsinya.
    const klien = klienPalsu((path) => (path === "/auth/otp/request" ? OK_KIRIM : OK_VERIFIKASI));
    const router = await sampaiLangkahKode(klien, "/masuk?tujuan=https%3A%2F%2Fjahat.example");

    await userEvent.type(kotakKode(), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(useStoreSesi.getState().status).toBe("masuk"));
    expect(router.state.location.pathname).toBe("/");
  });

  it("kode dikirim bersama nomor yang sama dengan langkah pertama", async () => {
    const dikirim = permintaanAuth();
    const klien = klienPalsu((path, body) => {
      dikirim.rekam(path, body);
      return path === "/auth/otp/request" ? OK_KIRIM : OK_VERIFIKASI;
    });
    await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(dikirim.daftar).toHaveLength(2));
    expect(dikirim.daftar[1]?.body).toEqual({
      phone: "+6281234567890",
      code: "482913",
      client: "web",
    });
  });
});

describe("AC-4: galat diumumkan, bukan hanya terlihat", () => {
  it("nomor salah → pesan muncul sebagai alert yang tersambung ke kolomnya", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    renderMasuk(klien);

    await userEvent.type(kotakNomor(), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Kirim kode" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/belum benar|salah/i);
    // Tersambung: pembaca layar mendengar galatnya saat fokus di kotaknya,
    // bukan hanya bila ia kebetulan menjelajah ke bawah.
    expect(kotakNomor()).toHaveAccessibleDescription(new RegExp(alert.textContent ?? "x"));
    expect(kotakNomor()).toHaveAttribute("aria-invalid", "true");
  });

  it("nomor kosong → pesan sendiri, bukan pesan 'tidak valid'", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    renderMasuk(klien);

    await userEvent.click(screen.getByRole("button", { name: "Kirim kode" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/masih kosong|Isi nomor/i);
  });

  it("kode salah dari server → pesan berbahasa Indonesia sederhana", async () => {
    const { ApiError } = await import("@nawasena/api-client");
    const klien = klienPalsu((path) => {
      if (path === "/auth/otp/request") return OK_KIRIM;
      throw new ApiError({ code: "KODE_OTP_SALAH", message: "Kode yang Anda masukkan salah" }, 401);
    });
    await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/salah/i);
    expect(useStoreSesi.getState().status).not.toBe("masuk");
  });

  it("kode kedaluwarsa → pesan menyuruh minta kode baru", async () => {
    const { ApiError } = await import("@nawasena/api-client");
    const klien = klienPalsu((path) => {
      if (path === "/auth/otp/request") return OK_KIRIM;
      throw new ApiError({ code: "KODE_OTP_HANGUS", message: "Kode sudah tidak berlaku" }, 410);
    });
    await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/kode baru|sudah mati/i);
  });

  it("kode salah → fokus KEMBALI ke kotak kode", async () => {
    // Yang harus dilakukan pengguna berikutnya adalah membetulkan isinya.
    // Tanpa ini ia harus mencari jalannya sendiri kembali ke sana.
    const { ApiError } = await import("@nawasena/api-client");
    const klien = klienPalsu((path) => {
      if (path === "/auth/otp/request") return OK_KIRIM;
      throw new ApiError({ code: "KODE_OTP_SALAH", message: "salah" }, 401);
    });
    await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    await screen.findByRole("alert");
    expect(kotakKode()).toHaveFocus();
  });

  it("kode error yang TIDAK dikenal tetap memberi kalimat, bukan kolom kosong", async () => {
    // Kolom bermasalah tanpa pesan menampilkan garis merah tanpa keterangan —
    // pengguna screen reader tidak mendengar apa pun.
    const { ApiError } = await import("@nawasena/api-client");
    const klien = klienPalsu((path) => {
      if (path === "/auth/otp/request") return OK_KIRIM;
      throw new ApiError(
        { code: "BELUM_SIAP", message: "Fitur ini belum tersedia", hint: "Coba cara lain" },
        503,
      );
    });
    await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Fitur ini belum tersedia");
    // `hint` ikut: di sanalah "apa yang harus saya lakukan" berada.
    expect(alert).toHaveTextContent("Coba cara lain");
  });

  it("kegagalan yang bukan ApiError tidak membocorkan detail teknis", async () => {
    const klien = klienPalsu((path) => {
      if (path === "/auth/otp/request") return OK_KIRIM;
      throw new TypeError("Cannot read properties of undefined (reading 'x')");
    });
    await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/Cannot read properties/);
    expect(alert).toHaveTextContent(/internet|terhubung/i);
  });
});

describe("kotak kode: SATU kotak, bukan enam", () => {
  it("memakai autocomplete one-time-code", async () => {
    // Mitigasi Risks PR-030 apa adanya: pola enam kotak memecah satu nilai
    // menjadi enam label, memindahkan fokus otomatis di tengah pengetikan, dan
    // membuat tempel-satu-kode gagal.
    const klien = klienPalsu(() => OK_KIRIM);
    await sampaiLangkahKode(klien);

    expect(kotakKode()).toHaveAttribute("autocomplete", "one-time-code");
    expect(kotakKode()).toHaveAttribute("inputmode", "numeric");
  });

  it("hanya ada SATU kotak isian di langkah kode", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    await sampaiLangkahKode(klien);

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("huruf yang terketik dibuang, bukan ditolak dengan pesan", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    await sampaiLangkahKode(klien);

    await userEvent.type(kotakKode(), "4a8b2c913");
    expect(kotakKode()).toHaveValue("482913");
  });
});

describe("berpindah langkah tanpa kehilangan tempat", () => {
  it("fokus berpindah ke kotak kode saat langkah berganti", async () => {
    // Tombol "Kirim kode" dilepas dari DOM bersama fokusnya; tanpa pemindahan
    // ini pengguna keyboard mendarat di awal dokumen.
    const klien = klienPalsu(() => OK_KIRIM);
    await sampaiLangkahKode(klien);

    expect(kotakKode()).toHaveFocus();
  });

  it("seluruh alur bisa diselesaikan dengan keyboard saja", async () => {
    const klien = klienPalsu((path) => (path === "/auth/otp/request" ? OK_KIRIM : OK_VERIFIKASI));
    const router = renderMasuk(klien);

    kotakNomor().focus();
    await userEvent.keyboard("081234567890{Enter}");
    await screen.findByLabelText(/Kode 6 angka/);

    await userEvent.keyboard("482913{Enter}");

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("'Ganti nomor HP' kembali ke langkah pertama dengan kode dikosongkan", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    await sampaiLangkahKode(klien);
    await userEvent.type(kotakKode(), "482913");

    await userEvent.click(screen.getByRole("button", { name: "Ganti nomor HP" }));

    expect(await screen.findByLabelText(/Nomor HP/)).toBeInTheDocument();
    // Nomornya dipertahankan — pengguna hanya ingin membetulkannya, bukan
    // mengetik ulang dari nol.
    expect(kotakNomor()).toHaveValue("081234567890");
  });
});

describe("kirim ulang dibatasi waktu", () => {
  it("tombol kirim ulang mati selama hitungan berjalan", async () => {
    const klien = klienPalsu(() => ({ data: { retryAfterSeconds: 30 } }));
    await sampaiLangkahKode(klien);

    const tombol = screen.getByRole("button", { name: /Tunggu 30 detik|30 detik/ });
    expect(tombol).toBeDisabled();
  });

  it("hitungan detik TIDAK berada di dalam live region", async () => {
    // Region yang isinya berubah tiap detik membuat screen reader membacakan
    // hitungan mundur tanpa henti dan menenggelamkan segalanya.
    const klien = klienPalsu(() => ({ data: { retryAfterSeconds: 30 } }));
    await sampaiLangkahKode(klien);

    const status = screen.getByRole("status");
    expect(status.textContent ?? "").not.toMatch(/30/);
  });

  it("tanpa jeda, tombol kirim ulang langsung bisa dipakai", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    await sampaiLangkahKode(klien);

    expect(screen.getByRole("button", { name: "Kirim ulang kode" })).toBeEnabled();
  });

  it("kirim ulang mengumumkan bahwa kode baru dikirim", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    await sampaiLangkahKode(klien);

    await userEvent.click(screen.getByRole("button", { name: "Kirim ulang kode" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Kode baru sudah dikirim/i),
    );
  });
});

describe("gerbang aksesibilitas", () => {
  it("langkah nomor lolos axe", async () => {
    const klien = klienPalsu(() => OK_KIRIM);
    const { container } = render(
      <Providers queryClient={createQueryClient()} klienApi={klien}>
        <RouterProvider
          router={createMemoryRouter([{ path: "/masuk", element: <main>{<Masuk />}</main> }], {
            initialEntries: ["/masuk"],
          })}
        />
      </Providers>,
    );
    await screen.findByLabelText(/Nomor HP/);

    await harusLolosAksesibilitas(container);
  });

  it("langkah kode — termasuk saat bermasalah — lolos axe", async () => {
    const { ApiError } = await import("@nawasena/api-client");
    const klien = klienPalsu((path) => {
      if (path === "/auth/otp/request") return OK_KIRIM;
      throw new ApiError({ code: "KODE_OTP_SALAH", message: "Kode salah" }, 401);
    });
    await sampaiLangkahKode(klien);
    await userEvent.type(kotakKode(), "111111");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    await screen.findByRole("alert");

    await harusLolosAksesibilitas(document.body);
  });

  it("penjaga ini tidak lulus hampa — kotak tanpa label tertangkap", async () => {
    const palsu = document.createElement("div");
    palsu.innerHTML = '<input type="text" />';
    document.body.append(palsu);

    try {
      await expect(harusLolosAksesibilitas(palsu)).rejects.toThrow(/label/);
    } finally {
      palsu.remove();
    }
  });
});
