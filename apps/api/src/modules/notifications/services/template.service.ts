// modules/notifications — katalog template + renderer dua varian bahasa (PR-047).
//
// SATU-SATUNYA TEMPAT KALIMAT NOTIFIKASI DITULIS. Bukan di service, bukan di
// controller, bukan di klien: PR-050 (web) dan PR-048/049 (push, email) semuanya
// membaca kalimat yang dirakit di sini. Kalimat yang ditulis ulang di sisi klien
// akan berbeda dari yang dibacakan screen reader lewat kanal lain, dan tidak ada
// test yang akan menangkap perbedaan itu.
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkapnya di
// docs/panduan-bahasa-sederhana.md. Ringkasnya: kalimat pendek, satu gagasan per
// kalimat, kata sehari-hari, kalimat aktif dengan pelaku disebut, tanpa kiasan.
// "Sederhana" TIDAK berarti "lebih pendek": varian sederhana yang lebih panjang
// tetapi langsung dimengerti adalah varian yang benar.
//
// KENAPA KATALOGNYA DI apps/api DAN BUKAN DI apps/web/src/shared/i18n. Katalog
// web melayani teks yang dirender komponen React; kalimat ini dirakit server
// dari data yang hanya server punya (status lamaran), lalu ikut ke push dan
// email yang tidak pernah menyentuh React sama sekali. Menaruhnya di web berarti
// backend meng-import paket frontend — pelanggaran batas modul yang akan
// ditolak eslint-plugin-boundaries, dan pantas ditolak.
import {
  type NotificationParams,
  type NotificationText,
  type NotificationType,
  type ApplicationStatus,
} from "@nawasena/schemas";

/** Satu template: judul + isi, masing-masing dua varian. */
export interface TemplateNotifikasi<T extends NotificationType> {
  title: (params: NotificationParams<T>) => NotificationText;
  body: (params: NotificationParams<T>) => NotificationText;
}

/**
 * Label status lamaran yang dibaca PENGGUNA — bukan nilai enum-nya.
 *
 * `in_review` yang bocor apa adanya ke layar adalah istilah mesin yang
 * dibacakan screen reader huruf per huruf. Kedua varian ditulis penuh di sini,
 * dan `Record<ApplicationStatus, …>` membuat status baru di Prisma menjadi
 * `typecheck` merah — bukan label yang diam-diam hilang.
 */
export const LABEL_STATUS: Record<ApplicationStatus, NotificationText> = {
  submitted: { id: "Terkirim", "id-simple": "Sudah dikirim" },
  viewed: { id: "Dilihat perusahaan", "id-simple": "Sudah dilihat perusahaan" },
  in_review: { id: "Sedang ditinjau", "id-simple": "Sedang diperiksa" },
  interview: { id: "Undangan wawancara", "id-simple": "Anda diundang wawancara" },
  offered: { id: "Penawaran kerja", "id-simple": "Anda ditawari kerja" },
  hired: { id: "Diterima bekerja", "id-simple": "Anda diterima kerja" },
  rejected: { id: "Belum berhasil", "id-simple": "Belum berhasil kali ini" },
  withdrawn: { id: "Dibatalkan", "id-simple": "Anda batalkan" },
};

/**
 * KATALOG TEMPLATE. Kuncinya SELURUH `NotificationType` — `satisfies` di bawah
 * membuat tipe baru tanpa template menjadi kegagalan typecheck, jadi tidak ada
 * jalan melahirkan notifikasi yang tampil kosong di layar pengguna.
 */
export const TEMPLATE = {
  "auth.selamat_datang": {
    title: () => ({
      id: "Selamat datang di Nawasena",
      // "Selamat datang" sudah sederhana; yang ditambahkan varian ini adalah
      // sapaan langsung kepada pembacanya, bukan kepada ruangan.
      "id-simple": "Selamat datang, senang Anda di sini",
    }),
    body: () => ({
      id: "Lengkapi profil Anda agar lowongan yang cocok bisa kami tampilkan.",
      // Dipecah jadi dua kalimat pendek, satu gagasan masing-masing, dan
      // langkahnya disebut sebagai tindakan ("Isi profil"), bukan sebagai
      // syarat ("agar ... bisa kami tampilkan").
      "id-simple": "Isi profil Anda dulu. Setelah itu kami tunjukkan kerja yang cocok.",
    }),
  },

  "lamaran.terkirim": {
    title: () => ({
      id: "Lamaran Anda terkirim",
      "id-simple": "Lamaran Anda sudah dikirim",
    }),
    body: () => ({
      id: "Perusahaan akan meninjau lamaran Anda. Anda kami kabari bila statusnya berubah.",
      // "meninjau" → "membaca"; "statusnya berubah" → "ada kabar baru".
      // Kalimat penenang ("Anda tidak perlu mengirim ulang") DIPERTAHANKAN:
      // pengguna yang ragu apakah lamarannya masuk akan mengirim berulang kali.
      "id-simple":
        "Perusahaan akan membaca lamaran Anda. Anda tidak perlu mengirim ulang. Kami kabari kalau ada kabar baru.",
    }),
  },

  "lamaran.status_berubah": {
    title: (params) => ({
      id: `Status lamaran: ${LABEL_STATUS[params.status].id}`,
      // Tanpa titik dua dan tanpa kata "status": pembaca hanya perlu tahu
      // keadaannya sekarang.
      "id-simple": `Kabar lamaran Anda: ${LABEL_STATUS[params.status]["id-simple"]}`,
    }),
    body: (params) => ({
      id: `Lamaran Anda kini berstatus "${LABEL_STATUS[params.status].id}". Buka rincian lamaran untuk melihat langkah berikutnya.`,
      "id-simple": `${LABEL_STATUS[params.status]["id-simple"]}. Buka lamaran Anda untuk tahu langkah berikutnya.`,
    }),
  },
} as const satisfies { [T in NotificationType]: TemplateNotifikasi<T> };

/** Hasil render satu notifikasi — kedua varian, judul dan isi. */
export interface TeksNotifikasi {
  title: NotificationText;
  body: NotificationText;
}

/**
 * Rakit kalimat sebuah notifikasi dari tipe + parameternya.
 *
 * MURNI: tidak menyentuh DB, jam, maupun jaringan. Itulah yang membuatnya bisa
 * diuji sebagai snapshot, dan yang membuat perubahan kalimat berlaku SURUT bagi
 * seluruh notifikasi yang sudah tersimpan — termasuk yang lahir tahun lalu.
 */
export function renderNotifikasi<T extends NotificationType>(
  type: T,
  params: NotificationParams<T>,
): TeksNotifikasi {
  const template = TEMPLATE[type] as TemplateNotifikasi<T>;
  return { title: template.title(params), body: template.body(params) };
}
