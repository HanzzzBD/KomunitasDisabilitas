// Katalog PELAMAR (PR-079) — "Lamaran Saya" (`/lamaran`, `/lamaran/:id`) dan
// kotak "sudah melamar" di detail lowongan.
//
// NAMA `pelamar`, BUKAN `lamaran`: prefiks `lamaran.` sudah dipakai tipe
// notifikasi (`lamaran.terkirim`, `lamaran.status_berubah`), dan penjaga
// `i18n-lazy.test.ts` membaca literal berpola `"<fitur>.` untuk menentukan
// katalog yang wajib dimuat sebuah rute — alasan yang sama dengan catatan
// `NOTIFICATION_TYPE` di `features/notifikasi/tautan.ts`. Satu kata huruf
// kecil: penjaga yang sama hanya mengenali nama fitur berpola `[a-z]+`.
//
// Label status ditulis untuk PELAMAR, terpisah dari `admin.lamaran.status.*`:
// admin membaca istilah operasional ("Ditinjau"), pelamar membaca apa artinya
// bagi dirinya.
import type { KatalogFitur } from "../tipe.js";

export const katalogPelamar = {
  "pelamar.judul": { id: "Lamaran Saya", "id-simple": "Lamaran saya" },
  "pelamar.deskripsi": {
    id: "Semua lamaran yang Anda kirim lewat Nawasena, yang terbaru berubah di atas.",
    "id-simple": "Ini lamaran yang sudah Anda kirim. Yang baru berubah ada di atas.",
  },
  "pelamar.memuat": { id: "Memuat lamaran Anda…", "id-simple": "Membuka lamaran Anda…" },
  "pelamar.gagalMuat": {
    id: "Lamaran Anda belum bisa ditampilkan.",
    "id-simple": "Lamaran gagal dibuka.",
  },
  "pelamar.cobaLagi": { id: "Coba lagi", "id-simple": "Ulangi" },
  "pelamar.kosong.judul": {
    id: "Belum ada lamaran",
    "id-simple": "Anda belum melamar",
  },
  "pelamar.kosong.penjelasan": {
    id: "Lamaran yang Anda kirim akan muncul di sini, lengkap dengan statusnya.",
    "id-simple": "Kalau Anda melamar, lamarannya muncul di sini.",
  },
  "pelamar.kosong.cari": { id: "Cari lowongan", "id-simple": "Cari kerja" },
  "pelamar.muatLagi": { id: "Muat lebih banyak", "id-simple": "Tampilkan lagi" },
  "pelamar.memuatLagi": { id: "Memuat…", "id-simple": "Sebentar…" },
  "pelamar.jumlah": {
    id: "{jumlah} lamaran ditampilkan.",
    "id-simple": "Ada {jumlah} lamaran di layar.",
  },
  "pelamar.lihat": {
    id: "Lihat lamaran {judul}",
    "id-simple": "Buka lamaran {judul}",
  },
  "pelamar.lowonganHilang": {
    id: "Lowongan tidak tersedia",
    "id-simple": "Lowongan tidak ada",
  },
  "pelamar.lowonganDitutup": {
    id: "Lowongan ini sudah ditutup. Lamaran Anda tetap tercatat.",
    "id-simple": "Lowongan ini sudah tutup. Lamaran Anda tetap ada.",
  },
  "pelamar.dilamar": { id: "Dilamar {tanggal}", "id-simple": "Dikirim {tanggal}" },
  "pelamar.diperbarui": {
    id: "Terakhir berubah {tanggal}",
    "id-simple": "Berubah {tanggal}",
  },
  "pelamar.statusLabel": { id: "Status", "id-simple": "Status sekarang" },

  // --- Label status untuk pelamar ---
  "pelamar.status.submitted": { id: "Terkirim", "id-simple": "Sudah dikirim" },
  "pelamar.status.viewed": { id: "Sudah dilihat", "id-simple": "Sudah dibaca" },
  "pelamar.status.in_review": { id: "Sedang ditinjau", "id-simple": "Sedang dicek" },
  "pelamar.status.interview": { id: "Undangan wawancara", "id-simple": "Diundang wawancara" },
  "pelamar.status.offered": { id: "Penawaran kerja", "id-simple": "Ditawari kerja" },
  "pelamar.status.hired": { id: "Diterima bekerja", "id-simple": "Diterima kerja" },
  "pelamar.status.rejected": { id: "Tidak dilanjutkan", "id-simple": "Tidak lanjut" },
  "pelamar.status.withdrawn": { id: "Ditarik", "id-simple": "Anda tarik" },

  // --- Penjelasan status (detail) ---
  "pelamar.arti.submitted": {
    id: "Lamaran Anda sudah sampai. Tim kami akan meneruskannya ke perusahaan.",
    "id-simple": "Lamaran sudah sampai. Kami kirim ke perusahaan.",
  },
  "pelamar.arti.viewed": {
    id: "Perusahaan sudah membuka lamaran Anda.",
    "id-simple": "Perusahaan sudah membaca lamaran Anda.",
  },
  "pelamar.arti.in_review": {
    id: "Perusahaan sedang menimbang lamaran Anda. Tahap ini bisa memakan beberapa hari.",
    "id-simple": "Perusahaan sedang memikirkan lamaran Anda. Bisa beberapa hari.",
  },
  "pelamar.arti.interview": {
    id: "Anda diundang wawancara. Detailnya dikirim lewat notifikasi atau kontak Anda.",
    "id-simple": "Anda diundang wawancara. Info lengkap dikirim ke Anda.",
  },
  "pelamar.arti.offered": {
    id: "Perusahaan menawari Anda pekerjaan ini. Bila Anda sudah menerimanya, beri tahu kami di bawah.",
    "id-simple": "Perusahaan mau menerima Anda. Kalau Anda sudah setuju, tekan tombol di bawah.",
  },
  "pelamar.arti.hired": {
    id: "Anda diterima bekerja di posisi ini.",
    "id-simple": "Anda diterima kerja di sini.",
  },
  "pelamar.arti.rejected": {
    id: "Perusahaan tidak melanjutkan lamaran ini. Masih banyak lowongan lain yang bisa Anda coba.",
    "id-simple": "Perusahaan tidak lanjut. Anda bisa coba lowongan lain.",
  },
  "pelamar.arti.withdrawn": {
    id: "Anda sudah menarik lamaran ini. Perusahaan tidak memprosesnya lagi.",
    "id-simple": "Anda sudah tarik lamaran ini. Tidak diproses lagi.",
  },

  // --- Detail ---
  "pelamar.detail.kembali": {
    id: "Kembali ke Lamaran Saya",
    "id-simple": "Kembali ke semua lamaran",
  },
  "pelamar.detail.tidakDitemukan.judul": {
    id: "Lamaran tidak ditemukan",
    "id-simple": "Lamaran tidak ada",
  },
  "pelamar.detail.tidakDitemukan.penjelasan": {
    id: "Lamaran ini tidak ada di akun Anda. Buka daftar Lamaran Saya untuk melihat semua lamaran Anda.",
    "id-simple": "Lamaran ini tidak ada di akun Anda. Buka daftar lamaran Anda.",
  },
  "pelamar.detail.statusTerbaru": {
    id: "Status terbaru lamaran {judul}: {status}.",
    "id-simple": "Lamaran {judul} sekarang: {status}.",
  },
  "pelamar.detail.statusSekarang": {
    id: "Status sekarang",
    "id-simple": "Keadaan sekarang",
  },
  "pelamar.detail.lihatLowongan": {
    id: "Lihat lowongan {judul}",
    "id-simple": "Buka lowongan {judul}",
  },
  "pelamar.detail.pengungkapan.ya": {
    id: "Data disabilitas Anda ikut dikirim bersama lamaran ini.",
    "id-simple": "Data disabilitas Anda ikut dikirim.",
  },
  "pelamar.detail.pengungkapan.tidak": {
    id: "Data disabilitas Anda tidak dikirim bersama lamaran ini.",
    "id-simple": "Data disabilitas Anda tidak dikirim.",
  },

  // --- Riwayat (timeline) ---
  "pelamar.riwayat.judul": { id: "Riwayat status", "id-simple": "Perjalanan lamaran" },
  "pelamar.riwayat.dikirim": { id: "Lamaran dikirim", "id-simple": "Anda kirim lamaran" },
  "pelamar.riwayat.olehAnda": { id: "oleh Anda", "id-simple": "Anda yang ubah" },
  "pelamar.riwayat.olehTim": {
    id: "oleh tim Nawasena atas nama perusahaan",
    "id-simple": "diubah tim Nawasena",
  },
  "pelamar.riwayat.terbaru": { id: "Terbaru", "id-simple": "Paling baru" },

  // --- Konfirmasi diterima (North Star) ---
  "pelamar.diterima.judul": {
    id: "Sudah diterima bekerja?",
    "id-simple": "Anda sudah diterima?",
  },
  "pelamar.diterima.penjelasan": {
    id: "Beri tahu kami bila Anda sudah menerima pekerjaan ini. Ini membantu kami mengukur berapa orang yang mendapat kerja lewat Nawasena.",
    "id-simple": "Kalau Anda sudah setuju kerja di sini, tekan tombol ini. Ini membantu kami.",
  },
  "pelamar.diterima.tombol": { id: "Saya diterima", "id-simple": "Saya diterima kerja" },
  "pelamar.diterima.menyimpan": { id: "Menyimpan…", "id-simple": "Sedang disimpan…" },
  "pelamar.diterima.selamat": {
    id: "Selamat, Anda diterima bekerja!",
    "id-simple": "Selamat, Anda dapat kerja!",
  },
  "pelamar.diterima.selamatIsi": {
    id: "Terima kasih sudah memberi tahu kami. Semoga lancar di tempat kerja baru.",
    "id-simple": "Terima kasih sudah memberi tahu. Semoga lancar kerjanya.",
  },
  "pelamar.diterima.tercatat": {
    id: "Dikonfirmasi {tanggal}.",
    "id-simple": "Anda konfirmasi {tanggal}.",
  },

  // --- Tarik lamaran ---
  "pelamar.tarik.tombol": { id: "Tarik lamaran", "id-simple": "Batalkan lamaran" },
  "pelamar.tarik.dialogJudul": {
    id: "Tarik lamaran ini?",
    "id-simple": "Batalkan lamaran ini?",
  },
  "pelamar.tarik.dialogIsi": {
    id: "Perusahaan berhenti memproses lamaran Anda dan tim kami diberi tahu. Ini tidak bisa dibatalkan, dan Anda tidak bisa melamar lowongan yang sama lagi.",
    "id-simple":
      "Lamaran berhenti diproses. Ini tidak bisa diulang. Anda tidak bisa melamar di sini lagi.",
  },
  "pelamar.tarik.ya": { id: "Ya, tarik lamaran", "id-simple": "Ya, batalkan" },
  "pelamar.tarik.batal": { id: "Jangan tarik", "id-simple": "Tidak jadi" },
  "pelamar.tarik.tutup": { id: "Tutup", "id-simple": "Tutup jendela ini" },
  "pelamar.tarik.menarik": { id: "Menarik lamaran…", "id-simple": "Sedang dibatalkan…" },

  // --- Galat ---
  "pelamar.galat.tidakDitemukan": {
    id: "Lamaran ini sudah tidak ada. Muat ulang daftar lamaran Anda.",
    "id-simple": "Lamaran tidak ada. Buka lagi daftar lamaran.",
  },
  "pelamar.galat.statusBerubah": {
    id: "Status lamaran baru saja berubah, jadi aksi ini tidak bisa dilakukan. Muat ulang halaman untuk melihat status terbaru.",
    "id-simple": "Status lamaran baru berubah. Muat ulang halaman, lalu lihat lagi.",
  },
  "pelamar.galat.bukanPelamar": {
    id: "Halaman ini hanya untuk akun pencari kerja.",
    "id-simple": "Halaman ini untuk pencari kerja saja.",
  },

  // --- Kotak "sudah melamar" di detail lowongan ---
  "pelamar.sudah.judul": {
    id: "Anda sudah melamar lowongan ini",
    "id-simple": "Anda sudah melamar di sini",
  },
  "pelamar.sudah.status": {
    id: "Status lamaran Anda: {status}.",
    "id-simple": "Lamaran Anda sekarang: {status}.",
  },
  "pelamar.sudah.lihat": {
    id: "Lihat lamaran saya",
    "id-simple": "Buka lamaran saya",
  },
  "pelamar.sudah.memeriksa": {
    id: "Memeriksa lamaran Anda untuk lowongan ini…",
    "id-simple": "Kami cek lamaran Anda…",
  },
} as const satisfies KatalogFitur;
