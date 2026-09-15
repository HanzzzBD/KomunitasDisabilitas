// Katalog halaman publik "Cari Lowongan" (PR-058, US-08).
//
// KENAPA FITUR TERPISAH DARI `companies` MESKI KEDUANYA HALAMAN PUBLIK. Ini
// halaman TERSENDIRI ("/lowongan"), bukan bagian dari profil perusahaan
// ("/companies/:id") — kandidat yang membuka pencarian lowongan belum tentu
// pernah membuka satu pun profil perusahaan, dan sebaliknya. Memuat katalog
// `companies` PENUH untuknya akan mengunduh teks profil perusahaan (status
// verifikasi, dsb.) yang tidak pernah ia lihat di halaman ini.
//
// TAKSONOMI JENIS/MODE KERJA TIDAK DIULANG DI SINI — dipinjam dari katalog
// `companies` (`companies.lowongan.tipe.*`/`companies.lowongan.mode.*`,
// lahir PR-054 untuk kartu lowongan di profil perusahaan). Kandidat harus
// membaca istilah yang SAMA PERSIS di kedua tempat ia melihat kartu lowongan.
// Begitu pula LABEL AKOMODASI — dipinjam dari `profil`
// (`profil.akomodasi.*`), pola yang sama dengan `companies.ts` dan admin/jobs.
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkap di
// docs/panduan-bahasa-sederhana.md.
import type { KatalogFitur } from "../tipe.js";

export const katalogLowongan = {
  "lowongan.judul": {
    id: "Cari Lowongan",
    "id-simple": "Cari Lowongan",
  },
  "lowongan.penjelasan": {
    id: "Temukan lowongan yang mencantumkan akomodasi sesuai kebutuhan Anda — tanpa perlu masuk lebih dulu.",
    "id-simple": "Cari lowongan kerja di sini. Anda tidak perlu masuk dulu untuk mencarinya.",
  },

  "lowongan.filter.label": {
    id: "Filter pencarian lowongan",
    "id-simple": "Kotak untuk mencari lowongan",
  },
  "lowongan.filter.query": {
    id: "Kata kunci",
    "id-simple": "Kata yang Anda cari",
  },
  "lowongan.filter.queryBantuan": {
    id: "Contoh: kasir, admin, layanan pelanggan.",
    "id-simple": "Contoh: kasir, admin, layanan pelanggan.",
  },
  "lowongan.filter.kota": {
    id: "Kota",
    "id-simple": "Kota",
  },
  "lowongan.filter.provinsi": {
    id: "Provinsi",
    "id-simple": "Provinsi",
  },
  "lowongan.filter.modeKerja": {
    id: "Mode kerja",
    "id-simple": "Cara kerja",
  },
  "lowongan.filter.modeKerjaSemua": {
    id: "Semua mode kerja",
    "id-simple": "Semua cara kerja",
  },
  "lowongan.filter.akomodasiLegenda": {
    id: "Akomodasi yang Anda butuhkan",
    "id-simple": "Bantuan yang Anda perlukan",
  },
  "lowongan.filter.cari": {
    id: "Cari",
    "id-simple": "Cari",
  },
  "lowongan.filter.reset": {
    id: "Hapus semua filter",
    "id-simple": "Hapus semua filter",
  },

  "lowongan.hasil.jumlah": {
    id: "{jumlah} lowongan ditemukan.",
    "id-simple": "Kami menemukan {jumlah} lowongan.",
  },
  "lowongan.hasil.kosong.judul": {
    id: "Tidak ada lowongan yang cocok",
    "id-simple": "Tidak ada lowongan yang cocok",
  },
  "lowongan.hasil.kosong.penjelasanFilter": {
    id: "Coba kata kunci lain, atau kurangi filter yang Anda pilih.",
    "id-simple": "Coba kata lain. Anda juga bisa menghapus sebagian filter.",
  },
  "lowongan.hasil.kosong.penjelasanPolos": {
    id: "Belum ada lowongan yang bisa ditampilkan saat ini. Coba periksa lagi nanti.",
    "id-simple": "Belum ada lowongan sekarang. Coba buka lagi nanti.",
  },

  "lowongan.muatLagi": {
    id: "Muat lebih banyak",
    "id-simple": "Tampilkan lebih banyak",
  },
  "lowongan.memuat": {
    id: "Memuat lowongan…",
    "id-simple": "Sebentar, lowongan sedang dibuka…",
  },
  "lowongan.gagalMuat": {
    id: "Daftar lowongan belum bisa ditampilkan.",
    "id-simple": "Daftar lowongan gagal dibuka.",
  },

  "lowongan.kartu.lokasiTakDisebut": {
    id: "Lokasi tidak dicantumkan",
    "id-simple": "Lokasi tidak ditulis",
  },
  "lowongan.kartu.akomodasiKosong": {
    id: "Belum ada akomodasi yang dicantumkan untuk posisi ini.",
    "id-simple": "Belum ada bantuan yang ditulis untuk posisi ini.",
  },
} as const satisfies KatalogFitur;
