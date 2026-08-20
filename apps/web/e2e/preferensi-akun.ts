// Server preferensi palsu BERSTATUS — dipakai spec PR-036.
//
// BERBEDA DARI `palsukanApi`, dan perbedaannya adalah seluruh alasannya ada.
// Jawaban di `palsukan-api.ts` sengaja TETAP: gerbang aksesibilitas memeriksa
// tampilan, dan halaman yang isinya berubah-ubah membuat gerbang itu kadang
// merah karena sebab lain. Yang diuji di sini justru PERUBAHANNYA — "disimpan
// di satu perangkat, muncul di perangkat lain" tidak bisa dibuktikan oleh
// server yang selalu menjawab hal yang sama.
//
// Satu objek `PREFERENSI` dipakai bersama oleh SEMUA konteks peramban yang
// memasangnya. Itulah "akun yang sama": dua konteks Playwright punya cookie,
// localStorage, dan proses render sendiri-sendiri — yang mereka bagi hanyalah
// keadaan di sisi server, persis seperti dua perangkat sungguhan.
import type { Page } from "@playwright/test";
import type { AccessibilityPreferences } from "@nawasena/schemas";

export const BAWAAN: AccessibilityPreferences = {
  textScale: 100,
  highContrast: false,
  reduceMotion: false,
  simpleLanguage: false,
  prefersSignLanguage: false,
  largeTouchTargets: false,
  screenReaderHint: false,
};

/** Kunci penyimpanan store `@nawasena/a11y` (`KUNCI_PENYIMPANAN`, PR-026a). */
const KUNCI_LOKAL = "nawasena-a11y";

export interface AkunPalsu {
  /** Keadaan preferensi "di akun" — dibaca & ditulis semua konteks. */
  nilai: () => AccessibilityPreferences;
  setel: (perubahan: Partial<AccessibilityPreferences>) => void;
  /** Pasang jawaban API pada satu halaman/konteks. */
  pasang: (page: Page) => Promise<void>;
}

export function buatAkunPalsu(awal: Partial<AccessibilityPreferences> = {}): AkunPalsu {
  let preferensi: AccessibilityPreferences = { ...BAWAAN, ...awal };

  return {
    nilai: () => preferensi,
    setel: (perubahan) => {
      preferensi = { ...preferensi, ...perubahan };
    },
    pasang: async (page) => {
      await page.route("**/api/v1/**", async (route) => {
        const jalur = new URL(route.request().url()).pathname;
        const jsonkan = (status: number, body: unknown) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });

        if (jalur.endsWith("/auth/refresh")) {
          // Token BUKAN JWT dengan sengaja — sama seperti `palsukan-api.ts`.
          // `idPenggunaSaatIni()` mengembalikan null untuknya, sehingga pemicu
          // onboarding di kerangka tidak mengalihkan halaman yang sedang diuji.
          return jsonkan(200, { data: { accessToken: "token-uji", expiresIn: 900 } });
        }
        if (jalur.endsWith("/me/accessibility")) {
          if (route.request().method() === "PUT") {
            preferensi = {
              ...preferensi,
              ...(route.request().postDataJSON() as Partial<AccessibilityPreferences>),
            };
          }
          return jsonkan(200, { data: preferensi });
        }
        return jsonkan(503, { code: "BELUM_SIAP", message: "Belum tersedia" });
      });
    },
  };
}

/**
 * Tanam preferensi ke `localStorage` SEBELUM skrip apa pun berjalan.
 *
 * Dipakai matriks kombinasi: menyetelnya lewat kendali di layar berarti delapan
 * kali menempuh interaksi yang bukan objek pemeriksaan, dan tiap langkahnya
 * adalah kesempatan gagal karena sebab yang tidak ada hubungannya dengan
 * aksesibilitas.
 *
 * Bentuknya mengikuti `persist` Zustand: `{ state, version }`. Bila bentuk itu
 * berubah, `bersihkanTersimpan` membuang isinya dan matriks ini diam-diam
 * memeriksa delapan halaman yang identik — karena itu spec-nya MEMASTIKAN token
 * `<html>` benar-benar berubah sebelum axe dijalankan.
 */
export async function tanamPreferensiLokal(
  page: Page,
  pilihan: Partial<AccessibilityPreferences>,
): Promise<void> {
  await page.addInitScript(
    ({ kunci, isi }) => {
      globalThis.localStorage.setItem(
        kunci,
        JSON.stringify({ state: { pilihanPengguna: isi }, version: 1 }),
      );
    },
    { kunci: KUNCI_LOKAL, isi: pilihan },
  );
}
