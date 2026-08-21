// Kerangka aplikasi (PR-032a) — bagian "landmark/skip-link final" pada Scope
// PR-032, dan penopang AC nomor 2.
//
// BATAS YANG HARUS DIPAHAMI SEBELUM MENAMBAH TEST DI SINI: jsdom tidak
// menjalankan navigasi fragmen (`#konten-utama`). Menekan tautan lompat di sini
// TIDAK memindahkan fokus, jadi berkas ini menguji SYARAT-syarat yang membuat
// perpindahan itu mungkin — urutan, sasaran, dan kefokusan sasaran. Perpindahan
// fokus yang sesungguhnya diuji di peramban: `e2e/lompat-ke-konten.spec.ts`.
//
// Pembagian itu disengaja. Menguji "tautannya ada" lalu menyebutnya selesai
// adalah cara paling umum melahirkan tautan lompat yang tidak melompat ke mana
// pun.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import type { ApiClient } from "@nawasena/api-client";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { ID_KONTEN_UTAMA } from "../src/app/tata-letak.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import { kunciPenanda } from "../src/features/onboarding/identitas.js";

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

async function renderDi(jalur: string) {
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  const hasil = render(
    <Providers a11yStore={createA11yStore({ storage: memori() })}>
      <RouterProvider router={router} />
    </Providers>,
  );
  // Timeout dinaikkan dari bawaan 1 detik — alasan sama dengan
  // `beranda.test.tsx`: chunk route dimuat dinamis, dan satu detik di runner CI
  // yang sibuk cukup untuk gagal karena mesinnya, bukan karena kodenya.
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
  return hasil;
}

/** Halaman yang memakai kerangka. `/masuk/google` memerlukan titipan OAuth. */
const HALAMAN_BERKERANGKA = ["/", "/masuk"];

afterEach(cleanup);

describe("tautan lompat ke konten", () => {
  it("adalah elemen fokusabel PERTAMA di dokumen", async () => {
    const { container } = await renderDi("/");

    // Ditaruh di urutan kedua, tautan ini tidak menyelesaikan apa pun:
    // gunanya justru menghindari penekanan Tab yang mendahuluinya.
    const fokusabel = container.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    expect(fokusabel[0]).toHaveTextContent("Lompat ke konten utama");
  });

  it("menunjuk sasaran yang BENAR-BENAR ADA dan bisa menerima fokus", async () => {
    const { container } = await renderDi("/");

    const tautan = screen.getByRole("link", { name: "Lompat ke konten utama" });
    expect(tautan).toHaveAttribute("href", `#${ID_KONTEN_UTAMA}`);

    const sasaran = container.querySelector(`#${ID_KONTEN_UTAMA}`);
    expect(sasaran, "sasaran tautan lompat tidak ada di DOM").not.toBeNull();

    // `tabindex="-1"` bukan hiasan: tanpa itu sebagian peramban hanya menggulir
    // ke sasaran tanpa memindahkan fokus, sehingga Tab berikutnya melanjutkan
    // dari tautan lompat — pengguna melihat isi halaman, tetapi fokusnya masih
    // di atas.
    expect(sasaran).toHaveAttribute("tabindex", "-1");
  });

  it("tersembunyi secara visual, TETAPI tetap ada di pohon aksesibilitas", async () => {
    await renderDi("/");

    // `hidden`/`display:none` akan mengeluarkannya dari urutan Tab — yaitu
    // menghapus fungsinya sambil menyisakan markupnya. `getByRole` gagal bila
    // itu terjadi, sebab peran tersembunyi tidak ikut terhitung.
    const tautan = screen.getByRole("link", { name: "Lompat ke konten utama" });
    expect(tautan.className).toContain("sr-only");
    expect(tautan.className).toContain("focus:not-sr-only");
  });

  it("hadir di SETIAP halaman berkerangka, bukan hanya beranda", async () => {
    for (const jalur of HALAMAN_BERKERANGKA) {
      const { unmount } = await renderDi(jalur);
      expect(
        screen.getByRole("link", { name: "Lompat ke konten utama" }),
        `tautan lompat hilang di ${jalur}`,
      ).toBeInTheDocument();
      unmount();
    }
  });
});

describe("landmark utama", () => {
  it("tepat satu <main> di tiap halaman", async () => {
    for (const jalur of HALAMAN_BERKERANGKA) {
      const { container, unmount } = await renderDi(jalur);
      expect(container.querySelectorAll("main"), `jumlah <main> salah di ${jalur}`).toHaveLength(1);
      unmount();
    }
  });

  it("halaman TIDAK menulis <main> sendiri — kerangka yang menyediakannya", async () => {
    // Inilah yang menahan erosi. Halaman berikutnya yang menyalin pola lama
    // ("bungkus semuanya dengan <main>") akan menghasilkan landmark utama
    // ganda, dan gejalanya tidak terlihat sama sekali di layar.
    const { container } = await renderDi("/masuk");
    const utama = container.querySelector("main");
    expect(utama?.id).toBe(ID_KONTEN_UTAMA);
    expect(utama?.querySelector("main"), "halaman merender <main> di dalam <main>").toBeNull();
  });

  it("layar kesalahan punya landmark sendiri — ia MENGGANTIKAN kerangka", async () => {
    // `ErrorBoundary` terpasang di route induk, jadi ia menggantikan `TataLetak`
    // seutuhnya. Tanpa `<main>` sendiri, pengguna screen reader yang melompat ke
    // konten utama akan mendarat di ketiadaan tepat saat ia paling butuh
    // membaca apa yang terjadi.
    const { container } = await renderDi("/jalur-yang-tidak-ada");
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Pengalihan onboarding (PR-035)
//
// PEMICUNYA DIPASANG DI KERANGKA, bukan di `Terlindungi`, dan itu yang membuat
// blok test ini ada di berkas ini: guard hanya dipasang halaman yang
// memintanya, sementara pengguna yang baru mendaftar mendarat di `/` — halaman
// publik tanpa guard sama sekali.
// ---------------------------------------------------------------------------

const SUB = "01912345-89ab-7def-8123-456789abcdef";

/** Token tiga segmen dengan `sub` yang bisa dibaca; TIDAK ditandatangani. */
function tokenUji(sub: string = SUB): string {
  const b64 = btoa(JSON.stringify({ sub, role: "seeker", ver: 1 }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `header.${b64}.tanda`;
}

/** Klien yang menggantung: pemulihan sesi tidak boleh menimpa `status` yang kita pasang. */
const klienMenggantung: ApiClient = {
  request: () => new Promise(() => {}) as Promise<never>,
};

async function renderBersesi(jalur: string) {
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  const hasil = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienMenggantung}
      a11yStore={createA11yStore({ storage: memori() })}
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, router };
}

describe("pengalihan onboarding", () => {
  afterEach(() => {
    useStoreSesi.setState({ status: "memulihkan" });
    globalThis.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("pengguna yang belum pernah onboarding dialihkan dari `/`", async () => {
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/onboarding");
    });
  });

  it("pengalihannya `replace` — wizard tidak meninggalkan jebakan tombol kembali", async () => {
    // Tanpa `replace`, halaman asal tertinggal di riwayat: menekan kembali
    // sesudah wizard akan mengalihkan pengguna ke sini lagi, yang mengalihkannya
    // lagi — terasa seperti tombol kembali yang rusak.
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/onboarding");
    });

    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("penanda yang SUDAH ada membuatnya tinggal di tempat", async () => {
    globalThis.localStorage.setItem(kunciPenanda(SUB), "1");
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/");
  });

  it("penanda milik pengguna LAIN tidak menutupi pengguna ini", async () => {
    // Perangkat bersama. Penanda tanpa cakupan id akan membuat akun kedua
    // melewati onboarding yang tidak pernah ia jalani.
    globalThis.localStorage.setItem(kunciPenanda("pengguna-lain"), "1");
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/onboarding");
    });
  });

  it("pengunjung yang belum masuk tidak pernah dialihkan", async () => {
    useStoreSesi.getState().keluar();

    const { router } = await renderBersesi("/");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/");
  });

  it("token yang tidak bisa dibaca TIDAK dianggap pengguna baru", async () => {
    // Kalau `sub` yang null diperlakukan sebagai "belum onboarding", pengguna
    // itu dikirim ke wizard yang penandanya tidak akan pernah bisa ditulis —
    // pengalihan yang berulang selamanya.
    useStoreSesi.getState().masuk("token-yang-bukan-jwt");

    const { router } = await renderBersesi("/");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/");
  });

  it("tidak mengalihkan `/masuk/google` meski status sudah masuk — regresi kembalian OAuth", async () => {
    // RISIKO NOMOR SATU PR INI, dan ia diuji SENDIRI — bukan diserahkan pada
    // kebetulan di alur E2E.
    //
    // `/masuk/google` menukarkan authorization code segera setelah dimuat, dan
    // status sesi di klien bisa sudah "masuk" dari pemulihan boot yang berlomba
    // dengan penukaran itu (lihat catatan panjang di `klien-api.tsx`).
    // Mengalihkannya di tengah berarti penukarannya tidak pernah selesai —
    // dan pengguna mendarat di wizard onboarding seolah-olah berhasil masuk.
    //
    // Sekaligus menjaga satu ketergantungan yang halus: `useLocation().pathname`
    // TIDAK memuat query string, sehingga `?code=…&state=…` di bawah tetap harus
    // cocok dengan entri `/masuk/google` di daftar pengecualian.
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/masuk/google?code=kode-dari-google&state=acak");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/masuk/google");
  });

  it("tidak mengalihkan `/masuk`", async () => {
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/masuk");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/masuk");
  });

  it("tidak mengalihkan `/onboarding` ke dirinya sendiri", async () => {
    // Tanpa entri ini di daftar pengecualian, wizard mengalihkan ke wizard
    // pada setiap render — halaman tidak pernah selesai terbentuk.
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/onboarding");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/onboarding");
  });

  it("sakelar mati → tidak ada seorang pun dikirim ke wizard", async () => {
    vi.stubEnv("VITE_ONBOARDING_WIZARD_ENABLED", "false");
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/");
  });

  it('sakelar bernilai apa pun SELAIN "false" tetap menyalakan wizard', async () => {
    // Polaritasnya: yang mematikan harus menyatakannya. Bendera yang mati
    // kecuali dinyalakan adalah fitur yang diam-diam tidak pernah tayang di
    // lingkungan yang lupa menyetelnya.
    vi.stubEnv("VITE_ONBOARDING_WIZARD_ENABLED", "true");
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/onboarding");
    });
  });
});

// ---------------------------------------------------------------------------
// Pintasan aksesibilitas (PR-036) — AC-5: "panel terjangkau dalam ≤ 2
// interaksi dari mana pun".
//
// DIUJI DI BERKAS INI karena "dari mana pun" adalah klaim tentang KERANGKA,
// bukan tentang satu halaman. Sebelum PR-036 aplikasi ini tidak punya navigasi
// tingkat atas sama sekali, jadi satu-satunya jalan ke panel adalah mengetikkan
// alamatnya — dan tidak ada satu pun test yang merah karenanya.
// ---------------------------------------------------------------------------

describe("pintasan ke panel aksesibilitas", () => {
  afterEach(() => {
    useStoreSesi.setState({ status: "memulihkan" });
    globalThis.localStorage.clear();
  });

  it("TIDAK ditawarkan kepada pengunjung yang belum masuk", async () => {
    // Alamatnya terlindungi. Tautan bagi yang belum masuk berjanji membawa ke
    // panel lalu mendaratkannya di halaman masuk — janji yang tidak ditepati
    // oleh aplikasi sendiri.
    useStoreSesi.getState().keluar();

    await renderBersesi("/");
    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(screen.queryByRole("link", { name: "Pengaturan aksesibilitas" })).toBeNull();
  });

  it("satu interaksi dari halaman mana pun membuka panelnya", async () => {
    // SATU klik, bukan dua: itulah yang membuat AC-nya terpenuhi dengan margin.
    // Ditempuh sebagai PERBUATAN — tautan yang benar tetapi tidak pernah
    // terpasang di kerangka punya href yang tampak baik-baik saja.
    globalThis.localStorage.setItem(kunciPenanda(SUB), "1");
    useStoreSesi.getState().masuk(tokenUji());

    const { router } = await renderBersesi("/");
    const tautan = await screen.findByRole(
      "link",
      { name: "Pengaturan aksesibilitas" },
      { timeout: 5000 },
    );

    await userEvent.click(tautan);

    await waitFor(() => expect(router.state.location.pathname).toBe("/pengaturan/aksesibilitas"), {
      timeout: 5000,
    });
  });

  it("TIDAK menggeser tautan lompat dari urutan fokus pertama", async () => {
    // Risiko nomor satu dari menambah elemen di kerangka. Tautan lompat yang
    // berada di urutan kedua tidak menyelesaikan apa pun — gunanya justru
    // menghindari penekanan Tab yang mendahuluinya.
    globalThis.localStorage.setItem(kunciPenanda(SUB), "1");
    useStoreSesi.getState().masuk(tokenUji());

    const { container } = await renderBersesi("/");
    await screen.findByRole("link", { name: "Pengaturan aksesibilitas" }, { timeout: 5000 });

    const fokusabel = container.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    expect(fokusabel[0]).toHaveTextContent("Lompat ke konten utama");
  });

  it("navigasinya PUNYA NAMA, bukan landmark 'navigation' tanpa keterangan", async () => {
    // Halaman pengaturan sudah punya navigasi sendiri. Dua landmark navigasi
    // tanpa nama muncul di daftar screen reader sebagai dua baris "navigation"
    // yang tidak bisa dibedakan satu sama lain.
    globalThis.localStorage.setItem(kunciPenanda(SUB), "1");
    useStoreSesi.getState().masuk(tokenUji());

    await renderBersesi("/");

    expect(
      await screen.findByRole("navigation", { name: "Pintasan halaman" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
