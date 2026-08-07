// core/db — penjaga global soft delete untuk tabel `users` (PR-021).
//
// MASALAH YANG DIPECAHKAN. Hak hapus UU PDP (PRD FR-1.4) diwujudkan sebagai
// `deleted_at`, bukan DELETE: baris harus bertahan sampai purge ≤ 30 hari
// (PR-023) supaya penghapusan yang keliru masih bisa dibatalkan lewat support.
// Konsekuensinya, akun yang "sudah dihapus" tetap ada di tabel — dan SATU query
// yang lupa menyaring `deletedAt` sudah cukup untuk menghidupkannya kembali di
// satu tempat: login yang menemukan nomornya, feed yang menampilkan namanya,
// ekspor yang menyertakan datanya.
//
// Menyerahkan itu pada disiplin per-query berarti bertaruh bahwa TIDAK SATU PUN
// query users di seluruh umur proyek akan lupa. Penjaga ini membalik posisi
// bakunya: yang harus disebut eksplisit bukan lagi "sembunyikan yang terhapus",
// melainkan "saya memang mau melihat yang terhapus".
//
// BATAS YANG TIDAK BISA DITUTUP DI SINI — dan justru karena itu ditulis:
//
//   1. RELASI BERSARANG. `prisma.application.findMany({ include: { user: true } })`
//      dijalankan sebagai operasi model `application`; ekstensi ini tidak pernah
//      dipanggil untuk `user` di dalamnya. Tidak ada API Prisma yang menjangkau
//      itu. Mitigasinya konvensi repository + review (risiko tercatat di file
//      phase PR-021).
//   2. RAW SQL. `$queryRaw` melewati seluruh lapisan ekstensi, by design.
//      Setiap raw SQL yang menyentuh `users` WAJIB menulis filternya sendiri.
//
// Keduanya bukan kelalaian yang menunggu diperbaiki, melainkan bentuk alat yang
// dipakai. Penjaga yang diam soal batasnya jauh lebih berbahaya daripada yang
// tidak ada, sebab ia mengundang orang berhenti berpikir.

/**
 * Operasi model `user` yang dibuat BUTA terhadap baris terhapus.
 *
 * `update`/`updateMany` ikut disaring: akun yang sudah dihapus tidak boleh
 * berubah lagi. `upsert` juga — pada baris terhapus ia jatuh ke cabang create,
 * dan itu memang benar, sebab unique index nomor/google_id/email bersifat
 * PARSIAL (`WHERE deleted_at IS NULL`) sehingga nilai lamanya memang bebas
 * dipakai ulang.
 */
export const OPERASI_DISARING = [
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "upsert",
] as const;

/**
 * Operasi yang SENGAJA dibiarkan melihat baris terhapus. `delete`/`deleteMany`
 * adalah persis pekerjaan purge (PR-023): menyaringnya akan membuat job itu
 * tidak pernah bisa menghapus apa pun. `create*` tidak punya `where`.
 */
export const OPERASI_DILEWATI = ["create", "createMany", "delete", "deleteMany"] as const;

const disaring = new Set<string>(OPERASI_DISARING);

/** Nama kolom penanda hapus pada model Prisma (bukan nama kolom DB). */
const KOLOM = "deletedAt";

function objek(nilai: unknown): Record<string, unknown> {
  return typeof nilai === "object" && nilai !== null ? (nilai as Record<string, unknown>) : {};
}

/**
 * Sisipkan `deletedAt: null` ke `where`, kecuali pemanggil sudah menyebut kolom
 * itu sendiri.
 *
 * OPT-OUT-NYA SENGAJA BERBENTUK INI. Alternatifnya (flag konteks async, klien
 * kedua tanpa ekstensi) sama-sama bekerja, tetapi tak satu pun terbaca di
 * tempat panggilan: pembaca query harus tahu ada tidaknya pembungkus di
 * kejauhan. Di sini, setiap query yang melihat baris terhapus WAJIB menuliskan
 * `deletedAt` di where-nya sendiri — jadi `grep "deletedAt"` adalah daftar
 * lengkap tempat yang perlu ditinjau, dan tidak ada cara diam-diam untuk keluar.
 *
 * Fungsi murni supaya bisa diuji tanpa database.
 */
export function terapkanFilterAktif(operation: string, args: unknown): unknown {
  if (!disaring.has(operation)) return args;

  const semula = objek(args);
  const where = objek(semula.where);
  // Sudah disebut pemanggil (mis. repository yang memang menulis
  // `deletedAt: null`, atau purge yang mencari `{ not: null }`) → jangan ditimpa.
  if (KOLOM in where) return args;

  return { ...semula, where: { ...where, [KOLOM]: null } };
}
