// Setup Vitest untuk apps/web.
//
// `@testing-library/jest-dom` menambah matcher yang membaca DOM sebagaimana
// pengguna melihatnya (`toBeVisible`, `toHaveAccessibleName`) — bukan sekadar
// "elemen ini ada di pohon". Perbedaannya penting di proyek ini: elemen yang
// hadir tetapi tersembunyi dari screen reader adalah cacat, bukan keberhasilan.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Tanpa ini, DOM satu test bocor ke test berikutnya dan kueri `getByRole`
// menemukan dua elemen — gagal dengan pesan yang menyesatkan tentang duplikasi
// alih-alih tentang kebocoran.
afterEach(() => {
  cleanup();
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
