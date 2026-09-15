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

  // --- Detail lowongan (PR-059) ---
  "lowongan.kembaliKeDaftar": {
    id: "Kembali ke daftar lowongan",
    "id-simple": "Kembali ke daftar lowongan",
  },
  "lowongan.detail.gagalMuat": {
    id: "Lowongan ini belum bisa ditampilkan.",
    "id-simple": "Lowongan ini gagal dibuka.",
  },
  "lowongan.detail.tidakDitemukan.judul": {
    id: "Lowongan tidak ditemukan",
    "id-simple": "Lowongan ini tidak ada",
  },
  "lowongan.detail.tidakDitemukan.penjelasan": {
    // Server sengaja tidak membedakan "tidak pernah ada", "sudah ditutup", dan
    // "lewat batas waktu" (PR-055) — kalimatnya menyebut kemungkinan yang
    // paling sering, tanpa berpura-pura tahu sebab pastinya.
    id: "Lowongan ini mungkin sudah ditutup atau melewati batas waktu melamar.",
    "id-simple": "Mungkin lowongan ini sudah ditutup. Coba cari lowongan lain.",
  },
  "lowongan.detail.ringkasan": {
    id: "Ringkasan lowongan",
    "id-simple": "Info singkat lowongan",
  },
  "lowongan.detail.info.jenis": {
    id: "Jenis pekerjaan",
    "id-simple": "Jenis pekerjaan",
  },
  "lowongan.detail.info.mode": {
    id: "Mode kerja",
    "id-simple": "Cara kerja",
  },
  "lowongan.detail.info.lokasi": {
    id: "Lokasi",
    "id-simple": "Tempat kerja",
  },
  "lowongan.detail.info.gaji": {
    id: "Gaji",
    "id-simple": "Gaji",
  },
  "lowongan.detail.info.diterbitkan": {
    id: "Diterbitkan",
    "id-simple": "Dibuka sejak",
  },
  "lowongan.detail.info.batas": {
    id: "Batas melamar",
    "id-simple": "Terakhir bisa melamar",
  },
  "lowongan.detail.gaji.rentang": {
    id: "{min} – {max} per bulan",
    "id-simple": "Antara {min} dan {max} setiap bulan",
  },
  "lowongan.detail.gaji.mulai": {
    id: "Mulai {min} per bulan",
    "id-simple": "Paling sedikit {min} setiap bulan",
  },
  "lowongan.detail.gaji.hingga": {
    id: "Hingga {max} per bulan",
    "id-simple": "Paling banyak {max} setiap bulan",
  },
  "lowongan.detail.deskripsi": {
    id: "Deskripsi pekerjaan",
    "id-simple": "Tentang pekerjaan ini",
  },
  "lowongan.detail.persyaratan": {
    id: "Persyaratan",
    "id-simple": "Syarat yang dicari",
  },
  "lowongan.detail.akomodasi": {
    id: "Akomodasi untuk posisi ini",
    "id-simple": "Bantuan untuk posisi ini",
  },
  "lowongan.detail.ragam.judul": {
    id: "Terbuka untuk",
    "id-simple": "Siapa yang disambut melamar",
  },
  "lowongan.detail.ragam.semua": {
    id: "Lowongan ini tidak menyebut ragam disabilitas tertentu — semua pelamar disambut.",
    "id-simple": "Semua orang boleh melamar posisi ini.",
  },
  "lowongan.detail.perusahaan.judul": {
    id: "Tentang perusahaan",
    "id-simple": "Tentang perusahaannya",
  },
  "lowongan.detail.perusahaan.akomodasi": {
    id: "Akomodasi di perusahaan ini",
    "id-simple": "Bantuan di perusahaan ini",
  },
  "lowongan.detail.perusahaan.lihatProfil": {
    id: "Lihat profil lengkap {nama}",
    "id-simple": "Buka profil {nama}",
  },
  "lowongan.detail.perusahaan.gagalMuat": {
    id: "Informasi perusahaan belum bisa ditampilkan.",
    "id-simple": "Info perusahaan gagal dibuka.",
  },
  "lowongan.detail.melamar.judul": {
    id: "Cara melamar",
    "id-simple": "Cara melamar",
  },
  "lowongan.detail.melamar.penjelasan": {
    // Slot CTA (PR-059) — SENGAJA tanpa tombol: tombol "Lamar" yang tidak
    // berbuat apa-apa adalah kontrol palsu. Tombol sungguhan lahir PR-078.
    id: "Melamar langsung lewat Nawasena akan segera tersedia. Simpan tautan halaman ini untuk kembali nanti.",
    "id-simple":
      "Sebentar lagi Anda bisa melamar di sini. Simpan alamat halaman ini supaya mudah kembali.",
  },
} as const satisfies KatalogFitur;
