// Jawaban API palsu untuk gerbang lapis ketiga (PR-031b; dipisah di PR-033a).
//
// JARINGAN DIPALSUKAN, DAN ITU KEPUTUSAN — bukan jalan pintas.
//
// Gerbang ini memeriksa TAMPILAN, bukan integrasi. Menggantungkannya pada API
// yang berjalan berarti: pipeline butuh Postgres + Redis + worker hanya untuk
// memeriksa kontras warna; kegagalan jaringan terbaca sebagai pelanggaran
// aksesibilitas; dan keadaan halaman ikut berubah-ubah mengikuti isi basis
// data. Gerbang yang kadang merah karena sebab lain akan diabaikan orang, dan
// gerbang yang diabaikan tidak menjaga apa pun.
//
// DIPISAH DARI SPEC-NYA di PR-033a karena kini ada DUA spec yang membutuhkannya
// (axe dan tautan lompat), dan keduanya harus melihat aplikasi dalam keadaan
// yang sama persis. Dua salinan akan menyimpang — dan yang menyimpang di sini
// berarti satu spec memeriksa halaman yang berbeda dari yang dikira.
//
// Jawabannya sengaja MINIMAL: hanya yang membuat halaman mencapai keadaan yang
// ingin diperiksa.
import { expect, type Page } from "@playwright/test";
import type { HalamanDijaga } from "./halaman.js";

/** Profil uji untuk `GET /me`. Bentuknya mengikuti `meSchema` (PR-020). */
const PROFIL_UJI = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Rina Pratiwi",
  email: "rina@contoh.id",
  phone: "+6281234567890",
  role: "seeker",
  createdAt: "2026-01-15T20:00:00.000Z",
} as const;

/**
 * Berkas ekspor uji (PR-033b). `exportedAt` sengaja pukul 20.00 UTC — yaitu
 * hari BERIKUTNYA di WIB — supaya nama berkas yang salah zona langsung
 * ketahuan, bukan lolos karena kebetulan tanggalnya sama.
 */
const BERKAS_UJI = {
  formatVersion: 1,
  exportedAt: "2026-01-15T20:00:00.000Z",
  account: { ...PROFIL_UJI, emailVerified: true, authMethods: ["otp"] },
} as const;

function jsonkan(status: number, body: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

export async function palsukanApi(page: Page, halaman?: HalamanDijaga): Promise<void> {
  const bersesi = halaman?.butuhSesi === true;

  await page.route("**/api/v1/**", async (route) => {
    const jalur = new URL(route.request().url()).pathname;

    if (jalur.endsWith("/auth/refresh")) {
      // Halaman terlindungi dijawab dengan sesi yang sah; sisanya 401, sebab
      // pengunjung halaman masuk memang belum punya sesi. Tanpa cabang pertama,
      // halaman terlindungi mengalihkan ke `/masuk` dan gerbangnya memeriksa
      // halaman yang salah — lihat `butuhSesi` di halaman.ts.
      //
      // Token tidak pernah diverifikasi di sisi klien: ia hanya dititipkan ke
      // header permintaan berikutnya, yang juga dipalsukan di sini.
      return route.fulfill(
        bersesi
          ? jsonkan(200, { data: { accessToken: "token-uji", expiresIn: 900 } })
          : jsonkan(401, { code: "SESI_TIDAK_VALID", message: "Sesi Anda sudah berakhir" }),
      );
    }
    if (jalur.endsWith("/me/export")) {
      return route.fulfill(jsonkan(200, { data: BERKAS_UJI }));
    }
    if (jalur.endsWith("/me")) {
      return route.fulfill(jsonkan(200, { data: PROFIL_UJI }));
    }
    if (jalur.endsWith("/auth/otp/request")) {
      return route.fulfill(jsonkan(202, { data: { retryAfterSeconds: 0 } }));
    }
    if (jalur.endsWith("/auth/account")) {
      // 204 tanpa body — persis seperti server (PR-021).
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill(jsonkan(503, { code: "BELUM_SIAP", message: "Belum tersedia" }));
  });
}

/**
 * Menunggu halamannya benar-benar terbentuk, lalu memastikan alamatnya tidak
 * berpindah. Dipanggil kedua spec sesudah `goto`.
 *
 * DUA HAL DALAM SATU FUNGSI, dan penggabungannya disengaja — versi pertama
 * memisahkannya dan pemeriksaan alamatnya menjadi TIDAK BERGUNA. Aplikasi ini
 * SPA: `goto` selesai begitu kerangka kosong terunduh, jauh sebelum React
 * menulis apa pun, dan pengalihan `<Navigate>` milik route guard baru terjadi
 * sesudah itu. Alamat yang dibaca segera setelah `goto` karena itu SELALU sama
 * dengan yang diminta — termasuk pada halaman terlindungi yang sedetik kemudian
 * melempar pengguna ke `/masuk`.
 *
 * Terbukti bukan teori: uji mutasi (melepas `butuhSesi` dari registry) tetap
 * hijau pada versi yang memisahkan keduanya. Menunggu `h1` lebih dulu membuat
 * mutasi itu merah — dan itulah satu-satunya alasan penjaga ini ada.
 *
 * Pengalihan diam-diam membuat gerbang memeriksa halaman yang salah sambil
 * melaporkan nama halaman yang benar. Ia tidak pernah merah, jadi tidak ada
 * yang menyelidikinya.
 */
export async function harusTidakBerpindah(page: Page, halaman: HalamanDijaga): Promise<void> {
  await page.waitForSelector("h1");

  const diminta = halaman.jalur.split("?")[0] ?? halaman.jalur;
  expect(new URL(page.url()).pathname, `"${halaman.nama}" dialihkan ke alamat lain`).toBe(diminta);
}

/**
 * Menunggu seluruh transisi & animasi CSS selesai.
 *
 * UNTUK DETERMINISME, BUKAN KARENA TERBUKTI MENANGKAP CACAT. Ini perlu
 * dinyatakan apa adanya: uji mutasi PR-033c-1 menunjukkan gerbang kontras tetap
 * menggigit TANPA penantian ini. Yang sempat membuat mutasi itu lolos adalah
 * hal lain (`aria-disabled` pada tombolnya — axe memang melewati kendali
 * nonaktif), bukan transisi.
 *
 * Yang MEMANG terbukti adalah gejalanya: probe langsung atas tombol perusak,
 * diukur segera sesudah dialognya terbuka, melaporkan latar abu-abu gelap
 * (`oklab(0.27 …)`) alih-alih merah — nilai ANTARA dari `transition-colors`
 * yang masih berjalan. Warna antara itulah yang dibaca axe bila ia mengukur
 * pada saat yang sama.
 *
 * Penantian ini ada karena gerbang yang mengukur nilai antara akan berperilaku
 * berbeda mengikuti kecepatan mesin — dan gerbang yang "kadang hijau" berhenti
 * dipercaya (playwright.config.ts menyatakan sikap yang sama tentang retry).
 * `document.getAnimations()` mencakup transisi CSS maupun animasi; menunggunya
 * lebih jujur daripada menidurkan test sekian milidetik dan berharap cukup.
 */
export async function tungguGayaTenang(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.getAnimations().every((animasi) => animasi.playState !== "running"),
    undefined,
    { timeout: 5_000 },
  );
}
