// Hapus akun (PR-033c-1) — AC PR-033 nomor 2 ("dua langkah + re-auth; tidak
// bisa via satu klik") dan nomor 3 ("dialog konfirmasi lolos NVDA checklist").
//
// APA YANG BISA DIJAMIN BERKAS INI, DAN APA YANG TIDAK. Butir NVDA checklist
// yang bersifat STRUKTURAL — peran dialog, namanya, jerat fokus, Escape, fokus
// yang kembali ke pemicu — diperiksa di sini, dan kegagalannya membuat CI
// merah. Yang TIDAK bisa dijamin siapa pun kecuali telinga manusia adalah
// apakah urutan pembacaannya masuk akal saat didengar. Itu tetap utang manual,
// dan dicatat sebagai utang — bukan diklaim tertutup karena test-nya hijau.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const PROFIL = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Rina Pratiwi",
  email: "rina@contoh.id",
  phone: "+6281234567890",
  role: "seeker",
  createdAt: "2026-01-15T20:00:00.000Z",
};

function memori(): PenyimpananA11y {
  const isi: Record<string, string> = {};
  return {
    getItem: (k) => isi[k] ?? null,
    setItem: (k, v) => {
      isi[k] = v;
    },
    removeItem: (k) => {
      delete isi[k];
    },
  };
}

/** Permintaan yang benar-benar sampai ke jaringan — inti AC 2. */
interface Jejak {
  path: string;
  body: unknown;
}

type Hasil = "ok" | "kodeSalah" | "gagalKirim";

function klienPalsu(jejak: Jejak[], hasil: Hasil, profil: Partial<typeof PROFIL> = {}): ApiClient {
  return {
    request: (path: string, opsi?: { body?: unknown }) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path === "/me") return Promise.resolve({ data: { ...PROFIL, ...profil } }) as Promise<never>;

      jejak.push({ path, body: opsi?.body });

      if (path === "/auth/otp/request") {
        return hasil === "gagalKirim"
          ? (Promise.reject(
              new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
            ) as Promise<never>)
          : (Promise.resolve({ data: { retryAfterSeconds: 0 } }) as Promise<never>);
      }
      if (path === "/auth/account") {
        return hasil === "kodeSalah"
          ? (Promise.reject(
              new ApiError({ code: "KODE_OTP_SALAH", message: "Kode salah" }, 401),
            ) as Promise<never>)
          : (Promise.resolve(undefined) as Promise<never>);
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderPanel({ hasil = "ok" as Hasil, profil = {}, sederhana = false } = {}) {
  useStoreSesi.setState({ status: "masuk" });

  const a11y = createA11yStore({ storage: memori() });
  if (sederhana) a11y.getState().setPreferensi({ simpleLanguage: true });

  const jejak: Jejak[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/pengaturan"] });
  const hasilRender = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienPalsu(jejak, hasil, profil)}
      a11yStore={a11y}
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasilRender, jejak, router };
}

function tombolBuka(nama = "Hapus akun saya") {
  return screen.findByRole("button", { name: nama }, { timeout: 5000 });
}

/** Menempuh langkah 1 → langkah 2, dan mengirim kode. */
async function sampaiKotakKode() {
  await userEvent.click(await tombolBuka());
  await userEvent.click(await screen.findByRole("button", { name: "Saya mengerti, lanjutkan" }));
  await userEvent.click(screen.getByRole("button", { name: "Kirim kode ke nomor saya" }));
  return screen.findByRole("textbox", { name: /Kode 6 angka/ }, { timeout: 5000 });
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("AC 2 — tidak bisa lewat satu klik", () => {
  it("menekan tombol hapus TIDAK menghapus apa pun, hanya membuka konfirmasi", async () => {
    const { jejak } = renderPanel();

    await userEvent.click(await tombolBuka());

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(jejak, "sebuah permintaan terkirim hanya karena dialog dibuka").toEqual([]);
  });

  it("langkah pertama menyebut AKIBATNYA sebelum menawarkan cara", async () => {
    // Yang paling sering terjadi bukan pengguna yang berubah pikiran,
    // melainkan pengguna yang salah paham: ia mengira "hapus akun" berarti
    // "keluar" atau "sembunyikan profil sementara".
    renderPanel();
    await userEvent.click(await tombolBuka());

    const dialog = await screen.findByRole("dialog");
    const butir = within(dialog).getAllByRole("listitem");
    expect(butir.length).toBeGreaterThanOrEqual(3);
    expect(dialog).toHaveTextContent(/keluar dari semua perangkat/i);
    expect(dialog).toHaveTextContent(/30 hari/);
  });

  it("langkah kedua menuntut kode BARU — sesi saja tidak cukup", async () => {
    const { jejak } = renderPanel();
    await sampaiKotakKode();

    // Permintaan pertama adalah pengiriman kode, bukan penghapusan.
    expect(jejak.map((j) => j.path)).toEqual(["/auth/otp/request"]);
  });

  it("penghapusan baru terkirim SETELAH kode diisi, dan membawa kodenya", async () => {
    const { jejak } = renderPanel();
    const kotak = await sampaiKotakKode();

    await userEvent.type(kotak, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    await waitFor(() => expect(jejak.map((j) => j.path)).toContain("/auth/account"));
    const permintaan = jejak.find((j) => j.path === "/auth/account");
    expect(permintaan?.body).toEqual({ otpCode: "123456" });
  });

  it("tombol hapus TIDAK bekerja selama kode masih kosong, DAN tidak memarahi pengguna", async () => {
    // Bagian kedua yang membuat test ini bermakna. Tanpa penjaga di handler,
    // permintaannya memang tetap tidak terkirim — skema `deleteAccountSchema`
    // menolaknya di klien — tetapi penolakan itu mendarat sebagai PESAN GALAT.
    // Pengguna menekan tombol yang seharusnya belum aktif, lalu dituduh salah
    // oleh kalimat validasi yang tidak ia mengerti.
    //
    // Diketahui lewat uji mutasi: melepas penjaganya membuat versi pertama test
    // ini tetap hijau, karena ia hanya memeriksa lalu lintas jaringan.
    const { jejak } = renderPanel();
    await sampaiKotakKode();

    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    expect(jejak.map((j) => j.path)).not.toContain("/auth/account");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(dialog).not.toHaveTextContent(/Required|invalid|Invalid/);
  });

  it("kode salah → pesan dan akun TETAP ada", async () => {
    const { jejak } = renderPanel({ hasil: "kodeSalah" });
    const kotak = await sampaiKotakKode();

    await userEvent.type(kotak, "000000");
    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveTextContent(/kode yang Anda masukkan salah/i));
    // Layar "sudah dihapus" tidak boleh muncul.
    expect(screen.queryByText(/Akun Anda sudah dihapus/)).toBeNull();
    expect(jejak.filter((j) => j.path === "/auth/account")).toHaveLength(1);
  });

  it("membatalkan di langkah pertama tidak mengirim apa pun", async () => {
    const { jejak } = renderPanel();
    await userEvent.click(await tombolBuka());
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getAllByRole("button", { name: "Batal" })[0]!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(jejak).toEqual([]);
  });
});

describe("AC 3 — butir NVDA checklist yang bisa dijamin mesin", () => {
  it("dialognya punya PERAN dan NAMA", async () => {
    // Dialog tanpa nama terumumkan sebagai "dialog" saja: pengguna tahu sesuatu
    // terbuka, tetapi tidak tahu apa.
    renderPanel();
    await userEvent.click(await tombolBuka());

    await screen.findByRole("dialog", { name: "Yakin ingin menghapus akun Anda?" });
  });

  it("sisa halaman DISEMBUNYIKAN dari pembaca layar selama dialog terbuka", async () => {
    // Butir checklist yang sesungguhnya, dan ia BUKAN `aria-modal`.
    //
    // Radix sengaja tidak memasang `aria-modal` — dukungannya tidak konsisten
    // antar pembaca layar — melainkan memasang `aria-hidden` pada seluruh isi
    // halaman di luar dialog. Hasilnya yang penting sama: pengguna screen
    // reader tidak bisa menyusuri halaman yang sedang tertutup lalu bertanya-
    // tanya kenapa apa pun yang ia temukan tidak bisa ditekan.
    //
    // Diperiksa lewat AKIBATNYA (judul halaman tak lagi terjangkau peran),
    // bukan lewat nama atributnya: yang harus tetap benar adalah hasilnya, dan
    // menguji atributnya akan membuat test ini merah bila Radix berganti teknik
    // ke sesuatu yang sama-sama benar.
    renderPanel();
    expect(await screen.findByRole("heading", { name: "Pengaturan" })).toBeInTheDocument();

    await userEvent.click(await tombolBuka());
    await screen.findByRole("dialog");

    expect(screen.queryByRole("heading", { name: "Pengaturan" })).toBeNull();
  });

  it("fokus MASUK ke dalam dialog saat dibuka", async () => {
    renderPanel();
    await userEvent.click(await tombolBuka());
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("fokus TIDAK mendarat di tombol perusak", async () => {
    // Pada dialog yang menawarkan tindakan tak-terbalikkan, fokus awal yang
    // jatuh di tombol hapus berarti satu penekanan Enter yang tidak sengaja
    // sudah cukup — persis yang seharusnya dicegah konfirmasi ini.
    renderPanel();
    await userEvent.click(await tombolBuka());
    await screen.findByRole("dialog");

    expect(document.activeElement).not.toHaveTextContent("Saya mengerti, lanjutkan");
  });

  it("Escape menutup dialog dan fokus KEMBALI ke pemicunya", async () => {
    // Fokus yang tidak kembali membuat pengguna mendarat di awal dokumen tanpa
    // tahu ke mana perginya.
    renderPanel();
    const pemicu = await tombolBuka();
    await userEvent.click(pemicu);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(pemicu).toHaveFocus());
  });

  it("seluruh alur bisa ditempuh tanpa satu pun klik", async () => {
    // AC 4 untuk bagian ini. Ditempuh sebagai perbuatan keyboard sungguhan.
    const { jejak } = renderPanel();
    const pemicu = await tombolBuka();
    pemicu.focus();
    await userEvent.keyboard("{Enter}");

    const lanjut = await screen.findByRole("button", { name: "Saya mengerti, lanjutkan" });
    lanjut.focus();
    await userEvent.keyboard("{Enter}");

    const kirim = screen.getByRole("button", { name: "Kirim kode ke nomor saya" });
    kirim.focus();
    await userEvent.keyboard("{Enter}");

    const kotak = await screen.findByRole("textbox", { name: /Kode 6 angka/ }, { timeout: 5000 });
    // Fokus berpindah SENDIRI ke kotak kode begitu ia muncul.
    await waitFor(() => expect(kotak).toHaveFocus());
    await userEvent.keyboard("123456");

    const hapus = screen.getByRole("button", { name: "Hapus akun saya sekarang" });
    hapus.focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(jejak.map((j) => j.path)).toContain("/auth/account"));
  });

  it("selama penghapusan berjalan, tombolnya TIDAK kehilangan fokus", async () => {
    // `disabled` pada tombol yang sedang memegang fokus melemparkan fokus itu
    // ke awal dokumen — dan DI DALAM DIALOG artinya keluar dari jerat fokusnya,
    // tepat pada detik paling menentukan di seluruh aplikasi.
    //
    // Ditulis dengan permintaan yang MENGGANTUNG, sebab tanpa itu keadaan sibuk
    // berlalu terlalu cepat untuk diamati — dan mutasi `aria-disabled` →
    // `disabled` sempat lolos hijau karena versi pertama test ini tidak pernah
    // sempat melihat keadaan tersebut.
    let lepaskan: ((nilai: never) => void) | undefined;
    const klien: ApiClient = {
      request: (path: string) => {
        if (path === "/me") return Promise.resolve({ data: PROFIL }) as Promise<never>;
        if (path === "/auth/otp/request") {
          return Promise.resolve({ data: { retryAfterSeconds: 0 } }) as Promise<never>;
        }
        if (path === "/auth/account") {
          return new Promise<never>((r) => {
            lepaskan = r as (nilai: never) => void;
          });
        }
        return new Promise(() => {}) as Promise<never>;
      },
    };
    useStoreSesi.setState({ status: "masuk" });
    render(
      <Providers queryClient={createQueryClient()} klienApi={klien}>
        <RouterProvider router={createMemoryRouter(ruteApp, { initialEntries: ["/pengaturan"] })} />
      </Providers>,
    );

    const kotak = await sampaiKotakKode();
    await userEvent.type(kotak, "123456");
    const tombol = screen.getByRole("button", { name: "Hapus akun saya sekarang" });
    tombol.focus();
    await userEvent.keyboard("{Enter}");

    const sibuk = await screen.findByRole("button", { name: "Menghapus akun Anda…" });
    expect(sibuk, "fokus terlempar keluar dialog saat penghapusan berjalan").toHaveFocus();
    expect(sibuk).not.toHaveAttribute("disabled");

    lepaskan?.(undefined as never);
  });

  it("pengiriman kode diumumkan lewat live region", async () => {
    renderPanel();
    await userEvent.click(await tombolBuka());
    await userEvent.click(await screen.findByRole("button", { name: "Saya mengerti, lanjutkan" }));

    const dialog = await screen.findByRole("dialog");
    // Region-nya sudah ada SEBELUM kodenya dikirim: region yang lahir bersama
    // pesannya kerap tidak terbaca sama sekali.
    const wilayah = within(dialog).getByRole("status");
    expect(wilayah).toHaveTextContent("");

    await userEvent.click(screen.getByRole("button", { name: "Kirim kode ke nomor saya" }));
    await waitFor(() => expect(wilayah).toHaveTextContent("+6281234567890"));
  });

  it("dialog lolos axe di setiap langkah", async () => {
    const { container } = renderPanel();
    await userEvent.click(await tombolBuka());
    await screen.findByRole("dialog");
    await harusLolosAksesibilitas(container);

    await userEvent.click(screen.getByRole("button", { name: "Saya mengerti, lanjutkan" }));
    await harusLolosAksesibilitas(container);

    await userEvent.click(screen.getByRole("button", { name: "Kirim kode ke nomor saya" }));
    await screen.findByRole("textbox", { name: /Kode 6 angka/ }, { timeout: 5000 });
    await harusLolosAksesibilitas(container);
  });
});

describe("sesudah akun terhapus", () => {
  it("layar terakhir menyebut jendela 30 hari", async () => {
    // Penghapusan bersifat soft selama 30 hari justru supaya yang keliru bisa
    // dibatalkan. Jendela itu tidak berguna sama sekali bagi orang yang tidak
    // tahu ia ada — dan orang yang menghapus akunnya tidak punya alasan untuk
    // membuka aplikasi ini lagi dalam waktu dekat.
    renderPanel();
    const kotak = await sampaiKotakKode();
    await userEvent.type(kotak, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));

    const dialog = await screen.findByRole("dialog", { name: "Akun Anda sudah dihapus" });
    expect(dialog).toHaveTextContent(/30 hari/);
  });

  it("menutup layar terakhir MENGAKHIRI sesi dan memindahkan halaman", async () => {
    // Sesi sudah mati di server (token_version naik, seluruh refresh token
    // dicabut). Membiarkannya "masuk" di klien meninggalkan pengguna di halaman
    // terlindungi dengan sesi hantu, yang baru ambruk pada permintaan
    // berikutnya sebagai pengalihan tanpa penjelasan.
    const { router } = renderPanel();
    const kotak = await sampaiKotakKode();
    await userEvent.type(kotak, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Hapus akun saya sekarang" }));
    await screen.findByRole("dialog", { name: "Akun Anda sudah dihapus" });

    await userEvent.click(screen.getByRole("button", { name: "Kembali ke beranda" }));

    await waitFor(() => expect(useStoreSesi.getState().status).toBe("keluar"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("akun tanpa nomor HP (masuk lewat Google)", () => {
  it("diberi tahu apa adanya, BUKAN tombol yang akan ditolak server", async () => {
    // Pengguna yang ditolak pada langkah terakhir — sesudah membaca seluruh
    // peringatan — akan mengira dirinya yang salah.
    renderPanel({ profil: { phone: null } });

    expect(
      await screen.findByText(/konfirmasi lewat Google belum tersedia/i, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus akun saya" })).toBeNull();
  });
});

describe("AC 5 — bahasa sederhana", () => {
  it("peringatan hapus akun punya varian id-simple yang benar-benar berbeda", async () => {
    renderPanel({ sederhana: true });
    await userEvent.click(await tombolBuka("Hapus akun saya"));

    const dialog = await screen.findByRole("dialog", { name: "Anda yakin mau menghapus akun?" });
    expect(dialog).toHaveTextContent("Lewat itu, hilang selamanya.");
  });
});

describe("penjaga tidak lulus secara hampa", () => {
  it("klien palsu benar-benar merekam permintaan", async () => {
    const { jejak } = renderPanel();
    await sampaiKotakKode();

    expect(jejak.length).toBeGreaterThan(0);
  });
});
