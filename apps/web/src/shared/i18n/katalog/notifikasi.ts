// Katalog teks notification center (PR-050).
//
// KALIMAT NOTIFIKASINYA SENDIRI TIDAK ADA DI SINI, dan itu keputusan pokok
// PR-047 yang berlaku sampai ke layar: judul dan isi setiap notifikasi dirakit
// SERVER dari `type` + parameternya, lalu dikirim dalam kedua varian bahasa
// sekaligus. Yang ada di berkas ini hanyalah teks KERANGKA-nya — judul halaman,
// label tombol, keadaan kosong, dan kalimat galat.
//
// Kalau kalimat notifikasi ikut ditulis di sini, ia akan menjadi salinan kedua
// yang bebas menyimpang dari yang dibacakan lewat push dan email — dan tidak
// ada satu pun test yang bisa menangkap perbedaan itu, sebab keduanya benar
// menurut katalognya masing-masing.
import type { KatalogFitur } from "../tipe.js";

export const katalogNotifikasi = {
  "notifikasi.judul": {
    id: "Notifikasi",
    "id-simple": "Notifikasi",
  },
  "notifikasi.penjelasan": {
    id: "Kabar tentang lamaran dan akun Anda. Yang belum dibaca ditandai.",
    "id-simple": "Kabar untuk Anda. Yang belum Anda baca diberi tanda.",
  },
  "notifikasi.memuat": {
    id: "Memuat daftar notifikasi",
    "id-simple": "Sebentar, daftar notifikasi sedang dibuka",
  },
  "notifikasi.kosong.judul": {
    id: "Belum ada notifikasi",
    "id-simple": "Belum ada kabar untuk Anda",
  },
  "notifikasi.kosong.isi": {
    // Menyebutkan KAPAN ia akan terisi. Layar kosong tanpa itu membuat orang
    // menebak apakah ia salah memakai aplikasinya.
    id: "Kami akan mengabari Anda di sini saat ada perkembangan lamaran atau akun Anda.",
    "id-simple": "Kalau ada kabar baru, kami tulis di sini.",
  },
  "notifikasi.kosongBelumDibaca.judul": {
    id: "Semua sudah dibaca",
    "id-simple": "Semua sudah Anda baca",
  },
  "notifikasi.kosongBelumDibaca.isi": {
    id: "Tidak ada notifikasi yang belum Anda baca.",
    "id-simple": "Tidak ada kabar baru untuk Anda.",
  },
  "notifikasi.saring.semua": {
    id: "Semua",
    "id-simple": "Semua",
  },
  "notifikasi.saring.belumDibaca": {
    id: "Belum dibaca",
    "id-simple": "Belum dibaca",
  },
  "notifikasi.saring.label": {
    id: "Saring notifikasi",
    "id-simple": "Pilih notifikasi yang tampil",
  },
  "notifikasi.tandaiDibaca": {
    id: "Tandai dibaca",
    "id-simple": "Tandai sudah dibaca",
  },
  "notifikasi.tandaiSemua": {
    id: "Tandai semua dibaca",
    "id-simple": "Tandai semua sudah dibaca",
  },
  "notifikasi.belumDibacaTanda": {
    // Dibaca screen reader sebagai bagian dari judul notifikasinya. Penanda
    // "belum dibaca" TIDAK boleh hanya berupa warna atau titik (WCAG 1.4.1).
    id: "Belum dibaca",
    "id-simple": "Belum dibaca",
  },
  "notifikasi.muatLagi": {
    id: "Muat lebih banyak",
    "id-simple": "Tampilkan lagi",
  },
  "notifikasi.galat": {
    id: "Daftar notifikasi belum bisa dimuat. Periksa koneksi internet Anda.",
    "id-simple": "Daftar notifikasi belum bisa dibuka. Cek internet Anda.",
  },
  "notifikasi.galatTandai": {
    // MENYEBUTKAN bahwa tandanya dikembalikan. Tanpa ini pengguna melihat
    // notifikasinya "belum dibaca" lagi dan mengira aplikasinya sendiri yang
    // membatalkan perbuatannya tanpa sebab.
    id: "Notifikasi belum bisa ditandai. Tandanya kami kembalikan seperti semula.",
    "id-simple": "Notifikasi belum bisa ditandai. Tandanya kami kembalikan.",
  },
} as const satisfies KatalogFitur;
