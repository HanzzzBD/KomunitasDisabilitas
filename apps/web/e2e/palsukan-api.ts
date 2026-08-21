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
  // Bagian `profile` WAJIB sejak PR-038 — profil karier beserta riwayat kerja,
  // pendidikan, dan keahlian. Klien memarse jawabannya terhadap
  // `dataExportSchema`, jadi berkas uji yang kekurangan bagian wajib tidak
  // menghasilkan unduhan sama sekali: tombolnya ditekan dan tidak terjadi
  // apa-apa. Itulah yang menjatuhkan ketiga test di berkas ini saat bagiannya
  // ditambahkan ke kontrak.
  profile: {
    headline: "Analis data",
    summary: null,
    city: "Yogyakarta",
    province: null,
    openToRemote: true,
    disclosureDefault: "ask_each_time",
    // Consent tidak diberikan → `sensitive` null. Bukan sekadar bentuk yang
    // paling mudah: berkas uji yang memuat data disabilitas akan menyalinnya ke
    // artefak CI setiap kali test ini gagal.
    consentSensitiveAt: null,
    sensitive: null,
    experiences: [
      {
        id: "01912345-89ab-7def-8123-4567890abc01",
        title: "Analis Data",
        company: "PT Contoh",
        startDate: "2020-01-15",
        endDate: null,
        description: null,
      },
    ],
    educations: [],
    skills: [],
  },
} as const;

/**
 * Profil karier uji untuk `GET/PUT /me/profile` (PR-037/PR-038; dipakai PR-040).
 *
 * `sensitive` NULL dan `consentSensitiveAt` NULL — keadaan pengguna yang belum
 * memberi izin. Dua alasan, dan keduanya nyata: itulah keadaan yang dilihat
 * setiap pengguna baru (jadi ia yang paling perlu dijaga), dan berkas uji yang
 * memuat data disabilitas akan menyalinnya ke artefak CI setiap kali test ini
 * gagal — alasan yang sama dengan `BERKAS_UJI` di atas.
 */
const PROFIL_KARIER_UJI = {
  headline: "Analis data",
  summary: null,
  city: "Yogyakarta",
  province: null,
  openToRemote: true,
  disclosureDefault: "ask_each_time",
  consentSensitiveAt: null,
  sensitive: null,
} as const;

/**
 * Preferensi uji untuk `GET/PUT /me/accessibility` (PR-034; dipakai PR-035).
 *
 * Seluruhnya BAWAAN. Nilai yang sudah berbeda dari bawaan akan membuat
 * pratinjau langsung di wizard tampak bekerja sekalipun ia tidak menulis apa
 * pun — layarnya sudah berbeda sejak dimuat.
 */
const PREFERENSI_UJI = {
  textScale: 100,
  highContrast: false,
  reduceMotion: false,
  simpleLanguage: false,
  prefersSignLanguage: false,
  largeTouchTargets: false,
  screenReaderHint: false,
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
    if (jalur.endsWith("/me/accessibility")) {
      // DIPERIKSA SEBELUM `/me`, sebab `endsWith("/me")` tidak akan pernah
      // cocok dengan alamat ini — tetapi urutan ini juga yang menahan cabang
      // baru di bawahnya dari menelan alamat yang lebih spesifik kelak.
      //
      // `PUT` MEMANTULKAN BADAN PERMINTAAN, bukan mengembalikan bawaan: layar
      // ringkasan onboarding menyimpan lalu berpindah, dan jawaban yang tidak
      // mencerminkan yang barusan dikirim membuat setiap cacat "yang tersimpan
      // bukan yang dipilih" lolos tanpa gejala.
      const kirim = route.request().method() === "PUT" ? route.request().postDataJSON() : {};
      return route.fulfill(
        jsonkan(200, { data: { ...PREFERENSI_UJI, ...(kirim as Record<string, unknown>) } }),
      );
    }
    // --- Profil karier (PR-040) ---
    //
    // DIPERIKSA SEBELUM `/me`, sebab urutan cabang di sini menentukan siapa
    // yang menelan alamat siapa. Ketiga sub-entitas ikut dijawab: halaman
    // profil memuat keempatnya sekaligus, dan yang tidak terjawab akan
    // menampilkan kegagalan — yang lalu terbaca sebagai pelanggaran
    // aksesibilitas oleh gerbang ini.
    if (jalur.endsWith("/me/profile")) {
      // `PUT` MEMANTULKAN badan permintaan, dengan alasan yang sama seperti
      // `/me/accessibility` di atas: jawaban yang tidak mencerminkan yang
      // barusan dikirim membuat setiap cacat "yang tersimpan bukan yang
      // diisi" lolos tanpa gejala.
      //
      // `consentSensitive` DITERJEMAHKAN, bukan dipantulkan apa adanya: ia
      // sakelar di badan PERMINTAAN, sementara jawabannya memakai
      // `consentSensitiveAt` + `sensitive`. Meniru pemetaan itu di sini
      // adalah satu-satunya cara layar pencabutan consent bisa diperiksa
      // sama sekali.
      if (route.request().method() !== "PUT") {
        return route.fulfill(jsonkan(200, { data: PROFIL_KARIER_UJI }));
      }

      const kirim = route.request().postDataJSON() as Record<string, unknown>;
      const { consentSensitive, disabilityTypes, accommodationNeeds, ...aman } = kirim;

      if (consentSensitive === false) {
        return route.fulfill(
          jsonkan(200, {
            data: { ...PROFIL_KARIER_UJI, ...aman, consentSensitiveAt: null, sensitive: null },
          }),
        );
      }

      const adaSensitif = disabilityTypes !== undefined || accommodationNeeds !== undefined;
      return route.fulfill(
        jsonkan(200, {
          data: {
            ...PROFIL_KARIER_UJI,
            ...aman,
            consentSensitiveAt:
              consentSensitive === true ? "2026-02-01T03:00:00.000Z" : PROFIL_KARIER_UJI.consentSensitiveAt,
            sensitive: adaSensitif
              ? {
                  disabilityTypes: disabilityTypes ?? [],
                  accommodationNeeds: accommodationNeeds ?? { tags: [], notes: null },
                }
              : PROFIL_KARIER_UJI.sensitive,
          },
        }),
      );
    }
    if (
      jalur.endsWith("/me/experiences") ||
      jalur.endsWith("/me/educations") ||
      jalur.endsWith("/me/skills")
    ) {
      // Daftar KOSONG, dan itu disengaja. Yang diperiksa gerbang ini adalah
      // keadaan yang paling sering dilihat pengguna baru — daftar kosong
      // beserta kalimat penjelasnya — dan keadaan kosong justru yang paling
      // mudah luput dari perhatian saat mengembangkan dengan data contoh.
      if (route.request().method() === "GET") return route.fulfill(jsonkan(200, { data: [] }));
      if (route.request().method() === "POST") {
        return route.fulfill(
          jsonkan(201, {
            data: {
              id: "01912345-89ab-7def-8123-4567890abc99",
              ...(route.request().postDataJSON() as Record<string, unknown>),
            },
          }),
        );
      }
      return route.fulfill(jsonkan(200, { data: {} }));
    }
    if (/\/me\/(experiences|educations|skills)\/[^/]+$/.test(jalur)) {
      if (route.request().method() === "DELETE") return route.fulfill({ status: 204, body: "" });
      return route.fulfill(
        jsonkan(200, {
          data: {
            id: jalur.split("/").pop(),
            ...(route.request().postDataJSON() as Record<string, unknown>),
          },
        }),
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
