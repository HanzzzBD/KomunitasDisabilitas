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
  // Bagian `accessibility` dan `notifications` WAJIB sejak 2026-09-05 (utang
  // U-03 & U-04). Peringatan di komentar `profile` di atas terbukti tepat:
  // saat kedua bagian ini ditambahkan ke kontrak, ketiga test di berkas ini
  // jatuh dengan timeout — tombolnya ditekan dan tidak terjadi apa-apa, sebab
  // klien menolak berkas yang tidak lolos `dataExportSchema`.
  accessibility: {
    textScale: 150,
    highContrast: null,
    reduceMotion: null,
    simpleLanguage: true,
    prefersSignLanguage: null,
    largeTouchTargets: null,
    screenReaderHint: null,
  },
  // PR-049b. Nilai campuran dengan sengaja: satu kanal yang benar-benar dipilih
  // dan satu yang belum, supaya berkas uji ini bisa menangkap `null` yang
  // diam-diam berubah menjadi `false` di sepanjang jalur.
  notificationChannels: { email: true, push: null },
  // Satu notifikasi, bukan array kosong: berkas uji yang kosong tidak akan
  // pernah menangkap bentuk yang salah pada isinya.
  notifications: [
    {
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
      readAt: null,
      createdAt: "2026-01-15T20:00:00.000Z",
    },
  ],
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

export const CV_UJI_ID = "01912345-89ab-7def-8123-4567890abf01";
const ISI_CV_UJI = {
  schemaVersion: 1,
  headline: "Analis data",
  summary: null as string | null,
  contact: {
    email: PROFIL_UJI.email,
    phone: PROFIL_UJI.phone,
    city: PROFIL_KARIER_UJI.city,
    province: PROFIL_KARIER_UJI.province,
    links: [] as { label: string; url: string }[],
  },
  experiences: [] as Record<string, unknown>[],
  educations: [] as Record<string, unknown>[],
  skills: [] as Record<string, unknown>[],
  certifications: [] as Record<string, unknown>[],
  organizations: [] as Record<string, unknown>[],
};

const CV_UJI = {
  id: CV_UJI_ID,
  title: "CV Utama",
  content: ISI_CV_UJI,
  pdfUrl: null,
  createdVia: "manual" as const,
  createdAt: "2026-09-25T00:00:00.000Z",
  updatedAt: "2026-09-25T00:00:00.000Z",
};

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

/**
 * Satu notifikasi uji (PR-050) — BELUM DIBACA dengan sengaja.
 *
 * Kalimatnya sama persis dengan katalog template server (`template.service.ts`)
 * supaya berkas ini tidak menjadi tempat kalimat versi kedua tumbuh: yang
 * diperiksa gerbang a11y harus berbentuk sama dengan yang dilihat pengguna.
 */
const DIBACA_PADA = "2026-01-16T03:00:00.000Z";

const NOTIFIKASI_UJI = {
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

/**
 * Perusahaan uji untuk `/admin/companies*` (PR-053).
 *
 * `registry-halaman.test.ts` membaca `path` route APA ADANYA dari `ruteApp` —
 * untuk route dinamis `companies/:id` itu berarti entri registry yang
 * menavigasi LANGSUNG ke sana wajib memakai jalur LITERAL
 * `/admin/companies/:id` (lihat `halaman.ts`). Playwright membuka alamat itu
 * apa adanya, sehingga `useParams().id` di halaman selalu literal `":id"` —
 * yang TIDAK PERNAH sama dengan id UUID sungguhan mana pun.
 *
 * Ini BUKAN kekurangan: keadaan yang dijangkau lewat navigasi langsung itu
 * memang "perusahaan tidak ditemukan", dan itulah yang diperiksa di sana.
 * Keadaan FORM TERISI (dan dialog verifikasinya) dijangkau lewat alur
 * sungguhan — klik "Ubah" dari daftar — di `admin-companies.spec.ts`, bukan
 * lewat registry `HALAMAN`.
 */
export const PERUSAHAAN_UJI_ID = "01912345-89ab-7def-8123-4567890abd10";

const PERUSAHAAN_UJI = {
  id: PERUSAHAAN_UJI_ID,
  name: "PT Uji Fiktif",
  description: null as string | null,
  website: null as string | null,
  city: "Jakarta" as string | null,
  inclusivityStatus: "unverified" as "unverified" | "self_claimed" | "verified",
  accommodationsAvailable: [] as string[],
  verifiedBy: null as string | null,
  verifiedAt: null as string | null,
  createdAt: "2026-01-15T20:00:00.000Z",
  updatedAt: "2026-01-15T20:00:00.000Z",
};

/**
 * Perusahaan uji untuk halaman PUBLIK "/companies/:id" (PR-054, Gap G5).
 *
 * ID TERPISAH dari `PERUSAHAAN_UJI_ID` (admin) dengan sengaja: halaman publik
 * dijangkau lewat navigasi LANGSUNG di `companies-public.spec.ts` (bukan lewat
 * klik dari sebuah daftar, sebab daftar publik semacam itu tidak ada) — jadi
 * spec itu perlu id UUID SUNGGUHAN yang route mocking ini kenali, berbeda dari
 * entri `HALAMAN` generik yang justru sengaja memakai literal `:id` untuk
 * menjangkau keadaan "tidak ditemukan" (lihat catatan `PERUSAHAAN_UJI_ID`).
 */
export const PERUSAHAAN_PUBLIK_UJI_ID = "01912345-89ab-7def-8123-4567890abd20";

const PERUSAHAAN_PUBLIK_UJI = {
  id: PERUSAHAAN_PUBLIK_UJI_ID,
  name: "PT Inklusif Publik",
  description: "Perusahaan uji untuk halaman profil publik.",
  website: "https://contoh.id",
  city: "Jakarta",
  inclusivityStatus: "verified" as "unverified" | "self_claimed" | "verified",
  accommodationsAvailable: ["akses_kursi_roda", "ramah_screen_reader"] as string[],
  verifiedAt: "2026-01-16T03:00:00.000Z" as string | null,
};

/**
 * Lowongan uji untuk `/admin/jobs*` (PR-057) — pola SAMA PERSIS dengan
 * `PERUSAHAAN_UJI` di atas. `companyId` menunjuk `PERUSAHAAN_UJI_ID` yang
 * sudah ada, supaya kolom "Perusahaan" di daftar terisi nama sungguhan
 * (bukan "Perusahaan tidak dikenali") dan pemilih perusahaan di formulir
 * punya satu opsi nyata untuk diperiksa axe.
 */
export const LOWONGAN_UJI_ID = "01912345-89ab-7def-8123-4567890abd30";

const LOWONGAN_UJI = {
  id: LOWONGAN_UJI_ID,
  companyId: PERUSAHAAN_UJI_ID,
  title: "Staf Admin Uji",
  description: "Deskripsi lowongan uji untuk gerbang aksesibilitas.",
  requirements: null as string | null,
  employmentType: "full_time" as const,
  workMode: "onsite" as const,
  city: "Jakarta" as string | null,
  province: "DKI Jakarta" as string | null,
  salaryMin: null as number | null,
  salaryMax: null as number | null,
  salaryVisible: true,
  accommodations: ["akses_kursi_roda"] as string[],
  welcomedDisabilityTypes: [] as string[],
  source: "admin_curated" as const,
  status: "draft" as "draft" | "published" | "closed",
  createdBy: null as string | null,
  publishedAt: null as string | null,
  expiresAt: null as string | null,
  createdAt: "2026-01-15T20:00:00.000Z",
  updatedAt: "2026-01-15T20:00:00.000Z",
};

/**
 * Detail lowongan publik (PR-059, `JobPublic`) — DITURUNKAN dari
 * `LOWONGAN_PENCARIAN_UJI`, bukan fixture terpisah: judul/perusahaan di
 * halaman detail harus sama dengan kartu yang diklik di daftar.
 *
 * Fixture PERTAMA sengaja "berat": deskripsi berparagraf panjang dengan satu
 * kata tanpa spasi yang sangat panjang (AC "konten panjang tidak merusak
 * layout" di 320px), gaji rentang, dan ragam disabilitas. Fixture KEDUA:
 * gaji disembunyikan server (`null`) — baris Gaji tidak boleh muncul.
 */
function detailLowonganUji(id: string) {
  const dasar = LOWONGAN_PENCARIAN_UJI.find((l) => l.id === id);
  if (dasar === undefined) return null;
  const pertama = id === LOWONGAN_PENCARIAN_UJI[0]?.id;
  return {
    id: dasar.id,
    companyId: dasar.companyId,
    title: dasar.title,
    description: pertama
      ? [
          "Anda akan menjawab pertanyaan pelanggan lewat surel dan obrolan teks, mencatat keluhan, dan meneruskannya ke tim terkait. ".repeat(
            4,
          ),
          "Tim kami terbiasa bekerja dengan juru bahasa isyarat dan pembaca layar.",
          "Rujukan-internal:" + "SOPLAYANANPELANGGANVERSITERBARU".repeat(4),
        ].join("\n\n")
      : "Menulis artikel dan naskah media sosial dari rumah.",
    requirements: pertama ? "Terbiasa mengetik.\nSabar menghadapi pelanggan." : null,
    employmentType: dasar.employmentType,
    workMode: dasar.workMode,
    city: dasar.city,
    province: dasar.province,
    salaryMin: pertama ? 5_000_000 : null,
    salaryMax: pertama ? 8_000_000 : null,
    accommodations: dasar.accommodations,
    welcomedDisabilityTypes: pertama ? ["tuli", "netra"] : [],
    publishedAt: dasar.publishedAt,
    expiresAt: pertama ? "2026-12-31T16:59:59.000Z" : null,
  };
}

/** Satu lowongan aktif — bukan daftar kosong, alasan sama dengan `NOTIFIKASI_UJI`. */
const LOWONGAN_PUBLIK_UJI = {
  id: "01912345-89ab-7def-8123-4567890abd21",
  title: "Staf Admin",
  employmentType: "full_time",
  workMode: "onsite",
  city: "Jakarta",
  province: "DKI Jakarta",
  publishedAt: "2026-01-10T00:00:00.000Z",
};

/**
 * Hasil pencarian lowongan publik untuk "/lowongan" (PR-058, `GET /jobs`).
 *
 * TIGA baris, bukan satu — cukup untuk `lowongan-browse.spec.ts` menguji
 * filter (kota/mode kerja/kata kunci berbeda per baris) tanpa satu pun baris
 * saling menyamarkan yang lain. Bentuknya `JobSearchResult`
 * (`@nawasena/schemas`) — beda dari `LOWONGAN_PUBLIK_UJI` di atas
 * (`JobPublicSummary`, dipakai `GET /companies/:id/jobs`): yang ini punya
 * `companyName`+`accommodations`, yang itu tidak.
 */
const LOWONGAN_PENCARIAN_UJI = [
  {
    id: "01912345-89ab-7def-8123-4567890abe01",
    companyId: PERUSAHAAN_UJI_ID,
    companyName: "PT Uji Fiktif",
    title: "Staf Layanan Pelanggan",
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    accommodations: ["akses_kursi_roda", "ramah_screen_reader"],
    publishedAt: "2026-01-12T00:00:00.000Z",
  },
  {
    id: "01912345-89ab-7def-8123-4567890abe02",
    companyId: PERUSAHAAN_UJI_ID,
    companyName: "PT Uji Fiktif",
    title: "Penulis Konten Jarak Jauh",
    employmentType: "freelance",
    workMode: "remote",
    city: null as string | null,
    province: null as string | null,
    accommodations: ["jam_kerja_fleksibel"],
    publishedAt: "2026-01-11T00:00:00.000Z",
  },
  {
    id: "01912345-89ab-7def-8123-4567890abe03",
    companyId: PERUSAHAAN_UJI_ID,
    companyName: "PT Uji Fiktif",
    title: "Analis Data Bandung",
    employmentType: "full_time",
    workMode: "hybrid",
    city: "Bandung" as string | null,
    province: "Jawa Barat" as string | null,
    accommodations: [] as string[],
    publishedAt: "2026-01-10T00:00:00.000Z",
  },
];

function jsonkan(status: number, body: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

export async function palsukanApi(page: Page, halaman?: HalamanDijaga): Promise<void> {
  const bersesi = halaman?.butuhSesi === true;
  // Keadaan PER PEMANGGILAN, bukan modul: dua test dalam satu berkas tidak
  // boleh saling mewarisi notifikasi yang sudah ditandai oleh yang lain.
  const notifikasi: { readAt: string | null } & typeof NOTIFIKASI_UJI = { ...NOTIFIKASI_UJI };
  // Sama alasannya untuk daftar perusahaan — mode UBAH menemukan barisnya di
  // sini, dan mode BUAT menambahkan baris baru ke larik yang sama.
  const perusahaan: (typeof PERUSAHAAN_UJI)[] = [{ ...PERUSAHAAN_UJI }];
  // Sama alasannya untuk daftar lowongan (PR-057).
  const lowongan: (typeof LOWONGAN_UJI)[] = [{ ...LOWONGAN_UJI }];
  const cv = [{ ...CV_UJI, content: { ...CV_UJI.content } }];
  let pdfDiminta = false;
  let pembacaanPdf = 0;

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
    // --- Notification center (PR-050) ---
    //
    // DIPERIKSA SEBELUM `/me/notification-prefs` DAN `/me`: `endsWith` menelan
    // alamat berdasarkan akhirannya, dan cabang yang lebih umum di atas cabang
    // yang lebih spesifik adalah cara endpoint diam-diam tidak pernah terjawab.
    if (jalur.endsWith("/me/notifications/read-all")) {
      const ditandai = notifikasi.readAt === null ? 1 : 0;
      notifikasi.readAt = DIBACA_PADA;
      return route.fulfill(jsonkan(200, { data: { ditandai }, meta: { unreadCount: 0 } }));
    }
    if (jalur.endsWith("/read")) {
      // KEADAANNYA BENAR-BENAR BERUBAH, tidak sekadar dijawab 200. Palsu yang
      // tetap menjawab `readAt: null` sesudah penandaan berhasil membuat
      // pemuatan ulang mengembalikan tandanya — dan test alur "terima → baca"
      // akan gagal atas kesalahan di PALSU-nya, bukan di aplikasinya.
      notifikasi.readAt = DIBACA_PADA;
      return route.fulfill(jsonkan(200, { data: { ...notifikasi }, meta: { unreadCount: 0 } }));
    }
    if (jalur.endsWith("/me/notifications")) {
      // SATU notifikasi BELUM DIBACA, bukan daftar kosong: gerbang a11y
      // memeriksa halaman ini dengan axe, dan halaman kosong tidak merender
      // satu pun item — penanda "belum dibaca", tombol tandai, maupun waktunya.
      // Daftar kosong akan membuat gerbangnya lulus atas halaman yang bukan
      // halaman yang dilihat pengguna sungguhan.
      return route.fulfill(
        jsonkan(200, {
          data: [{ ...notifikasi }],
          meta: { nextCursor: null, unreadCount: notifikasi.readAt === null ? 1 : 0 },
        }),
      );
    }
    if (jalur.endsWith("/me/notification-prefs")) {
      // DIPERIKSA SEBELUM `/me`, alasan yang sama dengan `/me/accessibility`.
      //
      // Nilai awalnya CAMPURAN — satu kanal yang benar-benar dipilih dan satu
      // yang belum — supaya gerbang ini bisa menangkap `null` yang diam-diam
      // berubah menjadi `false` di sepanjang jalur. Preferensi yang seluruhnya
      // `null` akan tampak benar meski panelnya kehilangan pembedaan itu.
      //
      // `PUT` MEMANTULKAN badan permintaan di atas nilai awal: jawaban yang
      // tidak mencerminkan yang barusan dikirim membuat cacat "sakelar kembali
      // ke posisi lama sesudah disimpan" lolos tanpa gejala.
      const kirim = route.request().method() === "PUT" ? route.request().postDataJSON() : {};
      return route.fulfill(
        jsonkan(200, {
          data: { email: true, push: null, ...(kirim as Record<string, unknown>) },
        }),
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
              consentSensitive === true
                ? "2026-02-01T03:00:00.000Z"
                : PROFIL_KARIER_UJI.consentSensitiveAt,
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
    // --- Editor CV manual (PR-061) ---
    if (/\/me\/resumes\/[^/]+\/pdf$/.test(jalur)) {
      if (route.request().method() === "POST") {
        pdfDiminta = true;
        pembacaanPdf = 0;
        return route.fulfill(jsonkan(202, { data: { status: "queued" } }));
      }
      if (!pdfDiminta) return route.fulfill(jsonkan(200, { data: { status: "idle" } }));
      pembacaanPdf += 1;
      if (pembacaanPdf === 1) {
        return route.fulfill(jsonkan(200, { data: { status: "processing" } }));
      }
      return route.fulfill(
        jsonkan(200, {
          data: {
            status: "ready",
            downloadUrl: "http://127.0.0.1:3000/berkas/cv.pdf?signature=baru",
            expiresAt: "2026-09-25T12:05:00.000Z",
          },
        }),
      );
    }
    if (jalur.endsWith("/me/resumes")) {
      if (route.request().method() === "POST") {
        const kirim = route.request().postDataJSON() as {
          title: string;
          content: typeof ISI_CV_UJI;
        };
        const baru = { ...CV_UJI, ...kirim, title: kirim.title };
        cv.push(baru);
        return route.fulfill(jsonkan(201, { data: baru }));
      }
      return route.fulfill(
        jsonkan(200, {
          data: cv.map(({ content: _content, ...ringkas }) => ringkas),
        }),
      );
    }
    if (/\/me\/resumes\/[^/]+$/.test(jalur)) {
      const id = decodeURIComponent(jalur.split("/").pop() ?? "");
      const indeks = cv.findIndex((item) => item.id === id);
      if (indeks < 0) {
        return route.fulfill(
          jsonkan(404, { code: "CV_TIDAK_DITEMUKAN", message: "CV tidak ditemukan" }),
        );
      }
      if (route.request().method() === "DELETE") {
        cv.splice(indeks, 1);
        return route.fulfill({ status: 204, body: "" });
      }
      if (route.request().method() === "PUT") {
        const sekarang = cv[indeks]!;
        cv[indeks] = {
          ...sekarang,
          ...(route.request().postDataJSON() as Partial<typeof CV_UJI>),
          updatedAt: "2026-09-25T01:00:00.000Z",
        };
      }
      return route.fulfill(jsonkan(200, { data: cv[indeks] }));
    }
    // --- Kurasi perusahaan (PR-053) ---
    //
    // DIPERIKSA SEBELUM `/me`: alasan yang sama dengan blok lain di atas —
    // `endsWith("/me")` tidak akan pernah cocok dengan `/admin/companies`,
    // tetapi urutan ini tetap menahan cabang baru di bawahnya dari menelan
    // alamat yang lebih spesifik kelak.
    if (jalur.endsWith("/admin/companies")) {
      if (route.request().method() === "POST") {
        const kirim = route.request().postDataJSON() as Record<string, unknown>;
        const baru = {
          ...PERUSAHAAN_UJI,
          description: null,
          website: null,
          city: null,
          accommodationsAvailable: [],
          ...kirim,
          id: "01912345-89ab-7def-8123-4567890abd11",
          inclusivityStatus: "unverified" as const,
          verifiedBy: null,
          verifiedAt: null,
        };
        perusahaan.push(baru);
        return route.fulfill(jsonkan(201, { data: baru }));
      }
      return route.fulfill(jsonkan(200, { data: perusahaan }));
    }
    if (jalur.endsWith("/verify")) {
      // `decodeURIComponent`: klien mengirim id lewat `encodeURIComponent`
      // (`@nawasena/api-client`), jadi `:` pada fixture `":id"` tiba di sini
      // sebagai `%3Aid`.
      const id = decodeURIComponent(jalur.split("/").slice(-2)[0] ?? "");
      const baris = perusahaan.find((p) => p.id === id);
      if (baris === undefined) {
        return route.fulfill(
          jsonkan(404, {
            code: "PERUSAHAAN_TIDAK_DITEMUKAN",
            message: "Perusahaan tidak ditemukan",
          }),
        );
      }
      baris.inclusivityStatus = "verified";
      baris.verifiedBy = "01912345-89ab-7def-8123-456789abcdef";
      baris.verifiedAt = "2026-01-16T03:00:00.000Z";
      return route.fulfill(jsonkan(200, { data: { ...baris } }));
    }
    if (/\/admin\/companies\/[^/]+$/.test(jalur)) {
      const id = decodeURIComponent(jalur.split("/").pop() ?? "");
      const baris = perusahaan.find((p) => p.id === id);
      if (baris === undefined) {
        return route.fulfill(
          jsonkan(404, {
            code: "PERUSAHAAN_TIDAK_DITEMUKAN",
            message: "Perusahaan tidak ditemukan",
          }),
        );
      }
      Object.assign(baris, route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill(jsonkan(200, { data: { ...baris } }));
    }
    // --- Kurasi lowongan (PR-057) ---
    //
    // Pola SAMA PERSIS dengan kurasi perusahaan di atas, urutan cabang sama
    // pentingnya: `/publish` dan `/close` diperiksa SEBELUM `/admin/jobs/:id`
    // generik (alasan sama dengan `/verify` companies).
    if (jalur.endsWith("/admin/jobs")) {
      if (route.request().method() === "POST") {
        const kirim = route.request().postDataJSON() as Record<string, unknown>;
        const baru = {
          ...LOWONGAN_UJI,
          requirements: null,
          salaryMin: null,
          salaryMax: null,
          accommodations: [],
          welcomedDisabilityTypes: [],
          ...kirim,
          id: "01912345-89ab-7def-8123-4567890abd31",
          source: "admin_curated" as const,
          status: "draft" as const,
          createdBy: null,
          publishedAt: null,
        };
        lowongan.push(baru);
        return route.fulfill(jsonkan(201, { data: baru }));
      }
      return route.fulfill(jsonkan(200, { data: lowongan }));
    }
    if (jalur.endsWith("/publish")) {
      const id = decodeURIComponent(jalur.split("/").slice(-2)[0] ?? "");
      const baris = lowongan.find((j) => j.id === id);
      if (baris === undefined) {
        return route.fulfill(
          jsonkan(404, { code: "LOWONGAN_TIDAK_DITEMUKAN", message: "Lowongan tidak ditemukan" }),
        );
      }
      baris.status = "published";
      baris.publishedAt = "2026-01-16T03:00:00.000Z";
      return route.fulfill(jsonkan(200, { data: { ...baris } }));
    }
    if (jalur.endsWith("/close")) {
      const id = decodeURIComponent(jalur.split("/").slice(-2)[0] ?? "");
      const baris = lowongan.find((j) => j.id === id);
      if (baris === undefined) {
        return route.fulfill(
          jsonkan(404, { code: "LOWONGAN_TIDAK_DITEMUKAN", message: "Lowongan tidak ditemukan" }),
        );
      }
      baris.status = "closed";
      return route.fulfill(jsonkan(200, { data: { ...baris } }));
    }
    if (/\/admin\/jobs\/[^/]+$/.test(jalur)) {
      const id = decodeURIComponent(jalur.split("/").pop() ?? "");
      const baris = lowongan.find((j) => j.id === id);
      if (baris === undefined) {
        return route.fulfill(
          jsonkan(404, { code: "LOWONGAN_TIDAK_DITEMUKAN", message: "Lowongan tidak ditemukan" }),
        );
      }
      Object.assign(baris, route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill(jsonkan(200, { data: { ...baris } }));
    }
    // --- Cari lowongan publik (PR-058, GET /jobs) ---
    //
    // KESAMAAN PERSIS (`===`), BUKAN `endsWith` — `/api/v1/admin/jobs` JUGA
    // diakhiri "jobs", dan `endsWith("/jobs")` akan menelannya kalau cabang
    // ini diperiksa lebih dulu. Aman di sini karena cabang admin di ATAS
    // sudah menjawab dan `return` duluan; kesamaan persis ditulis eksplisit
    // supaya urutan pemeriksaan tidak pernah jadi syarat diam-diam.
    //
    // Filter DITERAPKAN SUNGGUHAN (bukan diabaikan) — `lowongan-browse.spec.ts`
    // menguji kata kunci, kota, mode kerja, DAN akomodasi sungguhan lewat
    // pemalsuan ini, bukan hanya membuka halaman kosong.
    if (jalur === "/api/v1/jobs") {
      const cari = new URL(route.request().url()).searchParams;
      const query = cari.get("query")?.toLowerCase() ?? null;
      const city = cari.get("city");
      const workMode = cari.get("workMode");
      const akomodasiDiminta = cari.getAll("accommodations");

      const cocok = LOWONGAN_PENCARIAN_UJI.filter((l) => {
        if (query !== null && !l.title.toLowerCase().includes(query)) return false;
        if (city !== null && l.city !== city) return false;
        if (workMode !== null && l.workMode !== workMode) return false;
        if (akomodasiDiminta.some((a) => !l.accommodations.includes(a))) return false;
        return true;
      });

      // Ukuran halaman KECIL SENGAJA (2, bukan `limit` yang dikirim klien):
      // tiga baris fixture cukup untuk memunculkan "Muat lebih banyak" tanpa
      // perlu puluhan baris fixture — pemalsuan ini tidak wajib menghormati
      // `limit` klien persis seperti server sungguhan, hanya perlu
      // menghasilkan `nextCursor` yang masuk akal.
      const UKURAN_HALAMAN = 2;
      const cursor = cari.get("cursor");
      const mulai = cursor === null ? 0 : Number(cursor);
      const halaman = cocok.slice(mulai, mulai + UKURAN_HALAMAN);
      const adaLagi = mulai + UKURAN_HALAMAN < cocok.length;

      return route.fulfill(
        jsonkan(200, {
          data: halaman,
          meta: { nextCursor: adaLagi ? String(mulai + UKURAN_HALAMAN) : null },
        }),
      );
    }
    // --- Detail lowongan publik (PR-059, `GET /jobs/:id`) ---
    //
    // ANCHORED (`^/api/v1/jobs/[^/]+$`) — alasan sama dengan blok profil
    // publik perusahaan di bawah: `/admin/jobs/:id` di atas juga diakhiri
    // "jobs/<sesuatu>". Hanya id dari `LOWONGAN_PENCARIAN_UJI` yang dikenali,
    // supaya alur daftar→detail memakai data yang SAMA dengan kartunya; id lain
    // (termasuk literal `:id` registry `HALAMAN`) → 404 "tidak ditemukan".
    if (/^\/api\/v1\/jobs\/[^/]+$/.test(jalur)) {
      const id = decodeURIComponent(jalur.split("/").pop() ?? "");
      const detail = detailLowonganUji(id);
      if (detail === null) {
        return route.fulfill(
          jsonkan(404, { code: "LOWONGAN_TIDAK_DITEMUKAN", message: "Lowongan tidak ditemukan" }),
        );
      }
      return route.fulfill(jsonkan(200, { data: detail }));
    }
    // --- Profil publik perusahaan (PR-054, Gap G5) ---
    //
    // ANCHORED DI AWAL (`^/api/v1/companies/`), BUKAN `endsWith` seperti
    // blok lain: tanpa jangkar itu, alamat ini ikut cocok dengan akhiran
    // `/admin/companies/:id` di atas (keduanya sama-sama diakhiri
    // "companies/<sesuatu>") dan akan menelan permintaan admin yang
    // seharusnya dijawab blok itu.
    if (/^\/api\/v1\/companies\/[^/]+\/jobs$/.test(jalur)) {
      const id = decodeURIComponent(jalur.split("/").slice(-2)[0] ?? "");
      return route.fulfill(
        jsonkan(200, { data: id === PERUSAHAAN_PUBLIK_UJI_ID ? [LOWONGAN_PUBLIK_UJI] : [] }),
      );
    }
    if (/^\/api\/v1\/companies\/[^/]+$/.test(jalur)) {
      const id = decodeURIComponent(jalur.split("/").pop() ?? "");
      // `PERUSAHAAN_UJI_ID` ikut dijawab (PR-059): lowongan di
      // `LOWONGAN_PENCARIAN_UJI` milik perusahaan itu, dan halaman detail
      // lowongan memuat blok "Tentang perusahaan" dari endpoint publik ini.
      // Bentuknya `CompanyPublic` — TANPA kolom admin (`verifiedBy`, stempel).
      if (id === PERUSAHAAN_UJI_ID) {
        return route.fulfill(
          jsonkan(200, {
            data: {
              id: PERUSAHAAN_UJI.id,
              name: PERUSAHAAN_UJI.name,
              description: PERUSAHAAN_UJI.description,
              website: PERUSAHAAN_UJI.website,
              city: PERUSAHAAN_UJI.city,
              inclusivityStatus: PERUSAHAAN_UJI.inclusivityStatus,
              accommodationsAvailable: PERUSAHAAN_UJI.accommodationsAvailable,
              verifiedAt: PERUSAHAAN_UJI.verifiedAt,
            },
          }),
        );
      }
      if (id !== PERUSAHAAN_PUBLIK_UJI_ID) {
        return route.fulfill(
          jsonkan(404, {
            code: "PERUSAHAAN_TIDAK_DITEMUKAN",
            message: "Perusahaan tidak ditemukan",
          }),
        );
      }
      return route.fulfill(jsonkan(200, { data: PERUSAHAAN_PUBLIK_UJI }));
    }
    if (jalur.endsWith("/me/export")) {
      return route.fulfill(jsonkan(200, { data: BERKAS_UJI }));
    }
    if (jalur.endsWith("/me")) {
      // `role` mengikuti `butuhAdmin` (PR-052): tanpa ini, `PenjagaAdmin`
      // SELALU melihat "seeker" dan mengalihkan halaman admin ke "/" —
      // gerbangnya lulus atas beranda sambil mengira sedang memeriksa /admin.
      const role = halaman?.butuhAdmin === true ? "admin" : "seeker";
      return route.fulfill(jsonkan(200, { data: { ...PROFIL_UJI, role } }));
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
