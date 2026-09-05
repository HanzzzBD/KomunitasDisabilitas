// Setup Vitest untuk apps/web.
//
// `@testing-library/jest-dom` menambah matcher yang membaca DOM sebagaimana
// pengguna melihatnya (`toBeVisible`, `toHaveAccessibleName`) — bukan sekadar
// "elemen ini ada di pohon". Perbedaannya penting di proyek ini: elemen yang
// hadir tetapi tersembunyi dari screen reader adalah cacat, bukan keberhasilan.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { useStoreSesi } from "../src/shared/sesi/store.js";

// Tanpa ini, DOM satu test bocor ke test berikutnya dan kueri `getByRole`
// menemukan dua elemen — gagal dengan pesan yang menyesatkan tentang duplikasi
// alih-alih tentang kebocoran.
afterEach(() => {
  cleanup();
});

/**
 * `fetch` DITOLAK sebagai bawaan — bukan dibiarkan menyentuh jaringan.
 *
 * Sejak PR-030a, `Providers` memulihkan sesi saat dipasang, sehingga SETIAP
 * test yang merendernya akan memanggil `/auth/refresh`. Dibiarkan apa adanya,
 * panggilan itu benar-benar mencoba menghubungi localhost: lambat, bergantung
 * pada apa yang kebetulan berjalan di mesin itu, dan hasilnya berbeda antara
 * laptop dan CI.
 *
 * Penolakan cepat adalah bawaan yang JUJUR: ia berarti "tidak ada server", dan
 * jalur yang benar untuk itu memang `keluar()`. Test yang ingin menguji sesi
 * menyediakan `fetch`-nya sendiri lewat klien yang disuntik.
 */
globalThis.fetch = vi.fn(() =>
  Promise.reject(new Error("fetch tidak tersedia di test; suntikkan klien sendiri")),
) as unknown as typeof globalThis.fetch;

/**
 * Store sesi adalah singleton modul, jadi status yang ditulis satu test
 * terbawa ke test berikutnya — dan test berikutnya lulus atau gagal karena
 * tetangganya, bukan karena dirinya.
 */
afterEach(() => {
  useStoreSesi.setState({ status: "memulihkan" });
});

/**
 * `matchMedia` TIDAK ADA di jsdom — bukan "ada tapi selalu false", melainkan
 * tidak diimplementasikan sama sekali.
 *
 * Bawaan ini melaporkan `matches: false` untuk semua kueri, artinya "OS tidak
 * meminta apa pun". Itu titik awal yang benar: test yang ingin menguji sinyal
 * OS harus MENYATAKANNYA sendiri (lihat `packages/a11y/__tests__/os.test.ts`),
 * bukan mewarisinya dari lingkungan.
 *
 * `media` dikembalikan apa adanya — bukan `"not all"` — supaya kueri dianggap
 * DIKENALI. Mengembalikan "not all" akan membuat seluruh sinyal terbaca
 * `undefined` dan diam-diam mematikan jalur rekonsiliasi OS di setiap test.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (kueri: string) =>
    ({
      media: kueri,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// KATALOG i18n LENGKAP UNTUK TEST.
//
// Sejak katalog dimuat malas per rute (shell eager, fitur menyusul lewat
// `muatKatalog` di `app/routes.ts`), test yang merender KOMPONEN langsung —
// lewat `Providers`, bukan lewat router — tidak akan pernah memicu pemuatan
// itu, dan seluruh teksnya keluar sebagai kunci mentah.
//
// Diseed di sini alih-alih menambahkan `await muatKatalog(...)` ke ratusan
// berkas: test-test itu sedang menguji perilaku komponen, bukan pemuatan
// katalog.
//
// YANG MENJAGA DEKLARASI PER RUTE tetap ada dan justru harus memakai registri
// BERSIH — `i18n-lazy.test.ts` mereset registri lalu menelusuri router
// sungguhan. Tanpa berkas itu, seed di sini akan menyembunyikan rute yang lupa
// menyebut katalognya.
import { seedKatalogUntukTest } from "../src/shared/i18n/registri.js";
import { katalogShell } from "../src/shared/i18n/katalog/shell.js";
import { katalogAuth } from "../src/shared/i18n/katalog/auth.js";
import { katalogBeranda } from "../src/shared/i18n/katalog/beranda.js";
import { katalogPengaturan } from "../src/shared/i18n/katalog/pengaturan.js";
import { katalogOnboarding } from "../src/shared/i18n/katalog/onboarding.js";
import { katalogProfil } from "../src/shared/i18n/katalog/profil.js";

seedKatalogUntukTest({
  shell: katalogShell,
  auth: katalogAuth,
  beranda: katalogBeranda,
  pengaturan: katalogPengaturan,
  onboarding: katalogOnboarding,
  profil: katalogProfil,
});
