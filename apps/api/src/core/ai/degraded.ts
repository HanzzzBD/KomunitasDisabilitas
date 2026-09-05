// core/ai — kontrak degradasi lintas fitur (PR-046, ADR-005, ADR-012).
//
// JANJI PRODUKNYA. Setiap fitur AI di Nawasena wajib punya jalur non-AI
// (ADR-005): CV jatuh ke formulir, feed jatuh ke daftar tanpa peringkat,
// "sederhanakan teks" disembunyikan. Berkas ini TIDAK mengimplementasikan satu
// pun dari jalur itu — ia hanya menyediakan dua hal yang membuat ketiganya
// bisa ditulis dengan cara yang sama: penanda "kegagalan ini boleh diturunkan"
// dan pembungkus yang menurunkannya.
//
// MURNI. Tanpa I/O, tanpa Redis, tanpa Prisma, tanpa logger, tanpa konfigurasi
// global — sama seperti `guard.ts`. Itu bukan kebetulan gaya, melainkan syarat
// keamanan yang ditulis di spesifikasi PR-046: "degradasi tidak boleh
// menurunkan kontrol akses". Pembungkus yang tidak pernah menyentuh `req`,
// `res`, middleware, maupun guard RBAC tidak bisa melonggarkan satu pun
// darinya; jalur fallback tetap berjalan DI DALAM controller yang sama, di
// belakang penjaga yang sama. Bila kelak seseorang ingin `withDegradation`
// mencatat sesuatu, catat di pemanggilnya — jangan pindahkan logger ke sini.
//
// PENANDA, BUKAN `instanceof`. Predikat resminya `isDegradedError` yang membaca
// properti `degraded`, persis seperti `isKuotaHabis` membaca `code`
// (lihat quota.ts). Alasannya sama: satu proses bisa memuat dua salinan modul
// ini (bundler, symlink pnpm, test yang me-mock), dan `err instanceof
// DegradedError` diam-diam menjadi `false` justru pada kegagalan yang paling
// ingin kita tangani. Properti biasa selamat dari semua itu.
import { AppError, type AppErrorOverrides, type ErrorCode } from "../http/index.js";

/**
 * Kegagalan yang PUNYA jalur turun: pengguna tetap dilayani, hanya tanpa AI.
 *
 * Turunan `AppError` dengan sengaja — bukan kelas error baru yang berdiri
 * sendiri. Bila fallback-nya ternyata tidak ada (atau ikut gagal), error ini
 * harus tetap keluar sebagai envelope {code, message, hint} Bahasa Indonesia
 * lewat `errorHandler` global, lengkap dengan `Retry-After`-nya. Kelas yang
 * tidak turun dari `AppError` akan berakhir sebagai 500 "Terjadi kesalahan"
 * — persis kebalikan dari maksud degradasi.
 *
 * TIDAK punya kode katalog sendiri. Ia generik atas `ErrorCode` mana pun yang
 * SUDAH terdaftar di `ERROR_CATALOG` (hari ini: `KUOTA_AI_HABIS`), sebab
 * "boleh diturunkan" adalah sifat penanganan, bukan sebab kegagalan. Kode baru
 * ditambahkan saat ada pemanggil nyata yang membutuhkannya, bukan sekarang.
 */
export class DegradedError extends AppError {
  /** Penanda yang dibaca `isDegradedError`. Lihat catatan di kepala berkas. */
  readonly degraded = true;

  constructor(code: ErrorCode, overrides?: AppErrorOverrides) {
    super(code, overrides);
    this.name = "DegradedError";
  }
}

/**
 * Predikat resmi "kegagalan ini boleh diturunkan".
 *
 * Pemanggil WAJIB memakai ini, JANGAN membandingkan kelas. Aman atas nilai apa
 * pun yang dilempar JavaScript — termasuk `string`, `null`, dan `undefined`.
 */
export function isDegradedError(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { degraded?: unknown }).degraded === true
  );
}

/**
 * Nilai pengganti: hasil siap pakai, atau fungsi yang menghitungnya saat
 * dibutuhkan (mis. membaca ulang dari DB — yang tidak boleh dijalankan bila
 * jalur AI-nya ternyata berhasil).
 */
export type FallbackDegradasi<T> = T | (() => T | Promise<T>);

/**
 * Jalankan `fn`; bila ia gagal DENGAN kegagalan yang boleh diturunkan,
 * kembalikan `fallback` sebagai gantinya.
 *
 *   const hasil = await withDegradation(() => client.prompt(...), cvKosong);
 *
 * KEGAGALAN LAIN DILEMPAR ULANG APA ADANYA — tidak dibungkus, tidak dicatat,
 * tidak ditelan. `AI_SAFETY_BLOCK` bukan alasan menyajikan jawaban lain,
 * `TIDAK_BERHAK` apalagi: menurunkannya menjadi fallback berarti menjawab
 * permintaan yang sudah ditolak. Itulah seluruh isi AC-2.
 *
 * Bila `fallback` sendiri gagal, kegagalannya juga naik apa adanya. Tidak ada
 * "fallback dari fallback": pemanggil yang butuh itu menulis dua lapis sendiri,
 * dan dengan begitu keputusannya terlihat di kode pemanggil.
 *
 * Bentuk kembaliannya tetap `T` — BUKAN union `{degraded, data}`. Menandai
 * jawaban sebagai turunan kepada klien adalah urusan lapisan response
 * (`meta.degraded`, @nawasena/schemas), dan controller pertama yang benar-benar
 * memakai fallback-lah yang memutuskan bentuknya.
 */
export async function withDegradation<T>(
  fn: () => Promise<T>,
  fallback: FallbackDegradasi<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isDegradedError(err)) throw err;
    // `typeof === "function"` cukup selama `T` sendiri bukan tipe fungsi —
    // tidak ada jawaban AI yang berbentuk fungsi, dan tidak akan ada.
    return typeof fallback === "function" ? await (fallback as () => T | Promise<T>)() : fallback;
  }
}
