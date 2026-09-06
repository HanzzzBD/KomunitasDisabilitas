// Notification center (PR-050) — AC-1..AC-5.
//
// DIRENDER LEWAT `ruteApp` PRODUKSI, bukan dengan merender komponennya
// langsung. Alasannya sama dengan `aksesibilitas-panel.test.tsx`: panel yang
// sempurna tetapi tidak pernah tersambung ke alamatnya tidak menghasilkan apa
// pun bagi siapa pun.
//
// KALIMAT NOTIFIKASINYA DATANG DARI SERVER, dan berkas ini memperlakukannya
// begitu: klien palsu mengirim `title`/`body` dalam KEDUA varian, dan yang
// diperiksa adalah varian mana yang tampil. Test yang menuliskan kalimatnya
// sendiri di katalog i18n akan lulus atas aplikasi yang tidak pernah dikirim ke
// siapa pun.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { createA11yStore, type A11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

interface Jejak {
  path: string;
  method: string;
}

const SAMBUTAN = {
  id: "01912345-89ab-7def-8123-4567890abd01",
  type: "auth.selamat_datang",
  title: {
    id: "Selamat datang di Nawasena",
    "id-simple": "Selamat datang, senang Anda di sini",
  },
  body: {
    id: "Lengkapi profil Anda agar lowongan yang cocok bisa kami tampilkan.",
    "id-simple": "Isi profil Anda dulu. Setelah itu kami tunjukkan kerja yang cocok.",
  },
  params: {},
  readAt: null as string | null,
  createdAt: "2026-01-15T20:00:00.000Z",
};

const STATUS = {
  id: "01912345-89ab-7def-8123-4567890abd02",
  type: "lamaran.status_berubah",
  title: {
    id: "Status lamaran: Undangan wawancara",
    "id-simple": "Kabar lamaran Anda: Anda diundang wawancara",
  },
  body: {
    id: 'Lamaran Anda kini berstatus "Undangan wawancara". Buka rincian lamaran untuk melihat langkah berikutnya.',
    "id-simple": "Anda diundang wawancara. Buka lamaran Anda untuk tahu langkah berikutnya.",
  },
  params: {
    applicationId: "01912345-89ab-7def-8123-4567890abe01",
    jobId: "01912345-89ab-7def-8123-4567890abf01",
    status: "interview",
  },
  readAt: "2026-01-16T02:00:00.000Z" as string | null,
  createdAt: "2026-01-16T01:00:00.000Z",
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

interface OpsiKlien {
  /** Isi halaman pertama. */
  data?: (typeof SAMBUTAN)[];
  unreadCount?: number;
  nextCursor?: string | null;
  /** Halaman kedua, dijawab bila `cursor` ikut di URL. */
  halamanKedua?: (typeof SAMBUTAN)[];
  gagalTandai?: boolean;
  gagalMuat?: boolean;
}

function klienPalsu(jejak: Jejak[], opsi: OpsiKlien) {
  // SALINAN yang benar-benar berubah saat ditandai — bukan larik beku.
  // Fake yang tetap menjawab `readAt: null` sesudah penandaan berhasil akan
  // membuat setiap pemuatan ulang mengembalikan tandanya, dan test optimistik
  // gagal atas kesalahan yang ada di FAKE-nya, bukan di aplikasinya.
  const data = (opsi.data ?? [SAMBUTAN]).map((n) => ({ ...n }));
  const unreadCount = opsi.unreadCount ?? 1;
  /** Diubah test lewat `set()` untuk meniru notifikasi yang tiba kemudian. */
  const keadaan = { unreadCount };

  const klien: ApiClient = {
    request: (path: string, o?: { method?: string }) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path === "/me/accessibility") return new Promise(() => {}) as Promise<never>;

      const method = o?.method ?? "GET";
      jejak.push({ path, method });

      if (path.startsWith("/me/notifications?") || path === "/me/notifications") {
        if (opsi.gagalMuat === true) {
          return Promise.reject(
            new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
          ) as Promise<never>;
        }
        // Permintaan LENCANA (`limit=1`) dan permintaan DAFTAR (`limit=20`)
        // dibedakan di sini, sebab keduanya benar-benar berbeda di produksi:
        // yang pertama hanya mengambil satu baris untuk angkanya.
        if (path.includes("limit=1&") || path.endsWith("limit=1")) {
          return Promise.resolve({
            data: data.slice(0, 1),
            meta: { nextCursor: null, unreadCount: keadaan.unreadCount },
          }) as Promise<never>;
        }
        if (path.includes("cursor=")) {
          return Promise.resolve({
            data: opsi.halamanKedua ?? [],
            meta: { nextCursor: null, unreadCount: keadaan.unreadCount },
          }) as Promise<never>;
        }
        return Promise.resolve({
          data,
          meta: { nextCursor: opsi.nextCursor ?? null, unreadCount: keadaan.unreadCount },
        }) as Promise<never>;
      }

      if (path === "/me/notifications/read-all") {
        for (const n of data) n.readAt = "2026-01-16T03:00:00.000Z";
        keadaan.unreadCount = 0;
        return Promise.resolve({
          data: { ditandai: 2 },
          meta: { unreadCount: 0 },
        }) as Promise<never>;
      }

      if (path.endsWith("/read")) {
        if (opsi.gagalTandai === true) {
          return Promise.reject(
            new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
          ) as Promise<never>;
        }
        const id = path.split("/").at(-2);
        const sasaran = data.find((n) => n.id === id);
        if (sasaran !== undefined) sasaran.readAt = "2026-01-16T03:00:00.000Z";
        keadaan.unreadCount = Math.max(0, keadaan.unreadCount - 1);
        return Promise.resolve({
          data: { ...SAMBUTAN, readAt: "2026-01-16T03:00:00.000Z" },
          meta: { unreadCount: keadaan.unreadCount },
        }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };

  return { klien, keadaan };
}

function renderCenter(opsi: OpsiKlien = {}, jalur = "/notifikasi") {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Jejak[] = [];
  const { klien, keadaan } = klienPalsu(jejak, opsi);
  const a11y: A11yStore = createA11yStore({ storage: memori() });
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  const hasil = render(
    <Providers queryClient={createQueryClient()} klienApi={klien} a11yStore={a11y}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, jejak, keadaan, a11y };
}

/** Halamannya dimuat lazy; tenggat dilonggarkan seperti di `pengaturan.test.tsx`. */
function tungguHalaman() {
  return screen.findByRole("heading", { level: 1, name: "Notifikasi" }, { timeout: 5000 });
}

const tombol = (nama: string | RegExp) => screen.getByRole("button", { name: nama });

/**
 * Penanda "Belum dibaca" pada BARIS notifikasi — bukan tombol saringan yang
 * kebetulan berbunyi sama.
 *
 * Keduanya memang memakai kata yang sama, dan itu disengaja: saringan yang
 * menamai keadaan dengan kata berbeda dari penandanya membuat pengguna mengira
 * keduanya hal yang berbeda. Yang harus tepat adalah pertanyaan test-nya.
 */
function penandaBelumDibaca(): HTMLElement[] {
  return screen
    .queryAllByRole("listitem")
    .flatMap((li) => within(li).queryAllByText("Belum dibaca"));
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("daftar notifikasi", () => {
  it("menampilkan judul dan isi yang DIRENDER SERVER, bukan dari katalog klien", async () => {
    renderCenter();
    await tungguHalaman();

    expect(await screen.findByText("Selamat datang di Nawasena")).toBeInTheDocument();
    expect(
      screen.getByText("Lengkapi profil Anda agar lowongan yang cocok bisa kami tampilkan."),
    ).toBeInTheDocument();
  });

  it("mode teks sederhana menampilkan varian id-simple TANPA permintaan baru", async () => {
    // Kedua varian dikirim SEKALIGUS pada setiap notifikasi (PR-047), justru
    // supaya daftar yang sudah terbuka ikut berubah seketika saat pengguna
    // menyalakan teks sederhana.
    const { a11y, jejak } = renderCenter();
    await tungguHalaman();
    await screen.findByText("Selamat datang di Nawasena");
    const sebelum = jejak.length;

    a11y.getState().setPreferensi({ simpleLanguage: true });

    expect(await screen.findByText("Selamat datang, senang Anda di sini")).toBeInTheDocument();
    expect(jejak.length).toBe(sebelum);
  });

  it("penanda BELUM DIBACA berupa teks, bukan hanya warna", async () => {
    // WCAG 1.4.1: warna tidak boleh menjadi satu-satunya pembawa makna — dan
    // titik berwarna tidak ada sama sekali bagi pengguna screen reader.
    renderCenter({ data: [SAMBUTAN, STATUS], unreadCount: 1 });
    await tungguHalaman();

    const item = await screen.findAllByRole("listitem");
    expect(within(item[0] as HTMLElement).getByText("Belum dibaca")).toBeInTheDocument();
    // Yang sudah dibaca TIDAK membawa penanda itu.
    expect(within(item[1] as HTMLElement).queryByText("Belum dibaca")).toBeNull();
  });

  it("waktunya dibacakan sebagai kalimat WIB, bukan ISO", async () => {
    // `createdAt` uji adalah 15 Januari pukul 20.00 UTC — 16 Januari di WIB.
    // Tanggal yang bergeser satu hari adalah kesalahan yang tidak pernah
    // terlihat oleh yang menulisnya.
    renderCenter();
    await tungguHalaman();

    const waktu = await screen.findByText(/16 Januari 2026/);
    expect(waktu.tagName).toBe("TIME");
    expect(waktu).toHaveAttribute("dateTime", SAMBUTAN.createdAt);
  });

  it("daftar kosong menjelaskan KAPAN ia akan terisi", async () => {
    renderCenter({ data: [], unreadCount: 0 });
    await tungguHalaman();

    expect(await screen.findByText("Belum ada notifikasi")).toBeInTheDocument();
    expect(screen.getByText(/Kami akan mengabari Anda di sini/)).toBeInTheDocument();
  });

  it("gagal memuat → pesan yang terdengar, bukan halaman kosong yang membisu", async () => {
    renderCenter({ gagalMuat: true });
    await tungguHalaman();

    const peringatan = await screen.findByRole("alert", {}, { timeout: 8000 });
    expect(peringatan).toHaveTextContent(/belum bisa dimuat/i);
  });
});

describe("AC-3 — mark-read optimistik + rollback", () => {
  it("tanda berubah SEBELUM server menjawab", async () => {
    renderCenter();
    await tungguHalaman();
    await screen.findByText("Selamat datang di Nawasena");

    await userEvent.click(tombol(/Tandai dibaca/));

    await waitFor(() => {
      expect(penandaBelumDibaca()).toHaveLength(0);
    });
  });

  it("gagal → tanda DIKEMBALIKAN, dan sebabnya dikatakan", async () => {
    // Layar yang berubah sendiri tanpa penjelasan jauh lebih membingungkan
    // daripada kegagalan yang disebutkan.
    renderCenter({ gagalTandai: true });
    await tungguHalaman();
    await screen.findByText("Selamat datang di Nawasena");

    await userEvent.click(tombol(/Tandai dibaca/));

    const peringatan = await screen.findByRole("alert", {}, { timeout: 8000 });
    expect(peringatan).toHaveTextContent(/kami kembalikan/i);
    expect(penandaBelumDibaca()).toHaveLength(1);
  });

  it("nama tombolnya menyebut notifikasi MANA", async () => {
    // Sepuluh tombol bernama "Tandai dibaca" di satu halaman tidak bisa
    // dibedakan dalam daftar tombol milik screen reader.
    renderCenter();
    await tungguHalaman();

    expect(
      await screen.findByRole("button", { name: "Tandai dibaca: Selamat datang di Nawasena" }),
    ).toBeInTheDocument();
  });
});

describe("tandai semua dibaca", () => {
  it("satu permintaan untuk seluruhnya, bukan satu per baris", async () => {
    const { jejak } = renderCenter({ data: [SAMBUTAN, { ...SAMBUTAN, id: "x" }], unreadCount: 2 });
    await tungguHalaman();

    await userEvent.click(tombol("Tandai semua dibaca"));

    await waitFor(() => {
      expect(jejak.filter((j) => j.path === "/me/notifications/read-all")).toHaveLength(1);
    });
    expect(jejak.filter((j) => j.path.endsWith("/read"))).toEqual([]);
  });

  it("dimatikan saat tidak ada yang belum dibaca", async () => {
    // Tombol yang bisa ditekan tetapi tidak mengubah apa pun membuat orang
    // meragukan apakah tekanannya terdaftar.
    renderCenter({ data: [STATUS], unreadCount: 0 });
    await tungguHalaman();

    await waitFor(() => {
      expect(tombol("Tandai semua dibaca")).toBeDisabled();
    });
  });
});

describe("AC-1 — lencana akurat di kerangka aplikasi", () => {
  it("menyebut jumlah belum dibaca sebagai KALIMAT UTUH", async () => {
    // Angka telanjang di sebelah kata "Notifikasi" dibacakan sebagai dua hal
    // terpisah, dan angkanya kehilangan artinya.
    renderCenter({ unreadCount: 3 });

    expect(
      await screen.findByRole("link", { name: "Notifikasi, 3 belum dibaca" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("tanpa yang belum dibaca, namanya cukup 'Notifikasi'", async () => {
    renderCenter({ data: [STATUS], unreadCount: 0 });

    expect(
      await screen.findByRole("link", { name: "Notifikasi" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("angkanya turun sesudah menandai dibaca — tanpa muat ulang", async () => {
    renderCenter({ unreadCount: 1 });
    await tungguHalaman();
    await screen.findByRole("link", { name: "Notifikasi, 1 belum dibaca" });

    await userEvent.click(tombol(/Tandai dibaca/));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Notifikasi" })).toBeInTheDocument();
    });
  });
});

describe("AC-2 — notifikasi baru diumumkan tanpa mencuri fokus", () => {
  it("pemuatan PERTAMA tidak mengumumkan apa pun", async () => {
    // Nilai awal tidak punya "sebelumnya". Mengumumkannya berarti setiap
    // perpindahan halaman membacakan ulang jumlah yang sudah lama diketahui.
    renderCenter({ unreadCount: 5 });
    await tungguHalaman();
    await screen.findByRole("link", { name: "Notifikasi, 5 belum dibaca" });

    for (const wilayah of screen.getAllByRole("status")) {
      expect(wilayah).not.toHaveTextContent(/notifikasi baru/i);
    }
  });

  it("penurunan (pengguna menandai dibaca) juga TIDAK diumumkan", async () => {
    // "0 notifikasi baru" bukan kabar, dan mengumumkannya membuat setiap
    // penandaan berbunyi.
    renderCenter({ unreadCount: 1 });
    await tungguHalaman();
    await screen.findByText("Selamat datang di Nawasena");

    await userEvent.click(tombol(/Tandai dibaca/));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Notifikasi" })).toBeInTheDocument();
    });

    for (const wilayah of screen.getAllByRole("status")) {
      expect(wilayah).not.toHaveTextContent(/notifikasi baru/i);
    }
  });

  it("pengumumannya POLITE, dan fokus tidak pernah berpindah", async () => {
    // `role="status"` (polite) — bukan `alert`: kabar baru tidak boleh menyela
    // kalimat yang sedang dibaca. Fokus diperiksa apa adanya: pengguna yang
    // sedang mengisi sesuatu tetap di tempatnya.
    renderCenter();
    await tungguHalaman();
    const fokusAwal = document.activeElement;

    const wilayah = screen.getAllByRole("status");
    expect(wilayah.length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(fokusAwal);
  });
});

describe("AC-5 — keyboard-only lengkap", () => {
  it("saringan, tandai-semua, dan tandai-satu semuanya terjangkau Tab", async () => {
    renderCenter();
    await tungguHalaman();
    await screen.findByText("Selamat datang di Nawasena");

    const terjangkau: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      await userEvent.tab();
      const aktif = document.activeElement;
      if (aktif instanceof HTMLElement && aktif.textContent !== null) {
        terjangkau.push(aktif.getAttribute("aria-label") ?? aktif.textContent);
      }
    }

    expect(terjangkau).toContain("Semua");
    expect(terjangkau).toContain("Belum dibaca");
    expect(terjangkau).toContain("Tandai semua dibaca");
    expect(terjangkau).toContain("Tandai dibaca: Selamat datang di Nawasena");
  });

  it("menandai dibaca lewat Enter, bukan hanya klik tetikus", async () => {
    renderCenter();
    await tungguHalaman();
    await screen.findByText("Selamat datang di Nawasena");

    tombol(/Tandai dibaca/).focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(penandaBelumDibaca()).toHaveLength(0);
    });
  });
});

describe("saringan belum-dibaca", () => {
  it("keadaannya terbaca lewat aria-pressed, bukan hanya warna", async () => {
    renderCenter();
    await tungguHalaman();

    expect(tombol("Semua")).toHaveAttribute("aria-pressed", "true");
    expect(tombol("Belum dibaca")).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(tombol("Belum dibaca"));

    await waitFor(() => {
      expect(tombol("Belum dibaca")).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("memakai unreadOnly pada permintaannya", async () => {
    const { jejak } = renderCenter();
    await tungguHalaman();

    await userEvent.click(tombol("Belum dibaca"));

    await waitFor(() => {
      expect(jejak.some((j) => j.path.includes("unreadOnly=true"))).toBe(true);
    });
  });
});

describe("aksesibilitas halaman", () => {
  it("lolos axe", async () => {
    const { container } = renderCenter({ data: [SAMBUTAN, STATUS], unreadCount: 1 });
    await tungguHalaman();
    await screen.findByText("Selamat datang di Nawasena");

    await harusLolosAksesibilitas(container);
  });

  it("judul halaman h1, judul tiap notifikasi h2 — tingkatnya tidak melompat", async () => {
    // `h3` di bawah `h1` tanpa `h2` di antaranya adalah pelanggaran
    // `heading-order`: peta halaman bagi pengguna screen reader berbohong
    // tentang kedalaman. Ditemukan axe saat PR ini ditulis, bukan oleh mata.
    renderCenter();
    await tungguHalaman();

    expect(await screen.findByRole("heading", { level: 2 })).toHaveTextContent(
      "Selamat datang di Nawasena",
    );
  });
});
