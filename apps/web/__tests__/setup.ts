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
