// Katalog halaman publik profil perusahaan (PR-054, Gap G5, US-09).
//
// KENAPA FITUR TERPISAH DARI `admin`. Halaman ini dibuka kandidat, seringkali
// tanpa sesi (US-09) — memuat katalog `admin` untuknya akan mengunduh teks
// kurasi yang tidak pernah ia lihat, dan penjaga pemuatan malas (`i18n-lazy.
// test.ts`) memang menolak satu fitur meminjam prefiks fitur lain.
//
// LABEL AKOMODASI TIDAK DIULANG DI SINI — dipinjam dari katalog `profil`
// (`profil.akomodasi.*`), sama seperti formulir admin (lihat komentar
// `companies-formulir.tsx`). Kandidat dan admin harus membaca nama akomodasi
// yang SAMA PERSIS.
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkap di
// docs/panduan-bahasa-sederhana.md.
import type { KatalogFitur } from "../tipe.js";

export const katalogCompanies = {
  "companies.memuat": {
    id: "Memuat profil perusahaan…",
    "id-simple": "Sebentar, profil perusahaan sedang dibuka…",
  },
  "companies.gagalMuat": {
    id: "Profil perusahaan belum bisa ditampilkan.",
    "id-simple": "Profil perusahaan gagal dibuka.",
  },
  "companies.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Coba lagi",
  },
  "companies.tidakDitemukan.judul": {
    id: "Perusahaan tidak ditemukan",
    "id-simple": "Perusahaan tidak ada",
  },
  "companies.tidakDitemukan.penjelasan": {
    id: "Periksa kembali tautannya — perusahaan ini mungkin sudah dihapus.",
    "id-simple": "Coba periksa lagi tautannya.",
  },
  "companies.kembaliBeranda": {
    id: "Kembali ke beranda",
    "id-simple": "Kembali ke beranda",
  },

  // --- Status verifikasi (AC: dibedakan tekstual, bukan warna saja) ---
  "companies.status.verified": {
    id: "Terverifikasi",
    "id-simple": "Sudah diperiksa",
  },
  "companies.status.selfClaimed": {
    id: "Klaim mandiri",
    "id-simple": "Klaim sendiri, belum diperiksa",
  },
  "companies.status.unverified": {
    id: "Belum diverifikasi",
    "id-simple": "Belum diperiksa",
  },
  "companies.status.penjelasan.verified": {
    id: "Data inklusivitas perusahaan ini sudah diperiksa tim kami.",
    "id-simple": "Tim kami sudah memeriksa data perusahaan ini.",
  },
  "companies.status.penjelasan.selfClaimed": {
    id: "Data ini ditulis sendiri oleh perusahaan dan belum diperiksa tim kami.",
    "id-simple": "Perusahaan ini yang menulis datanya sendiri. Belum diperiksa tim kami.",
  },
  "companies.status.penjelasan.unverified": {
    id: "Data ini belum diperiksa siapa pun.",
    "id-simple": "Data ini belum diperiksa.",
  },

  // --- Info dasar ---
  "companies.info.kotaLabel": {
    id: "Kota",
    "id-simple": "Kota",
  },
  "companies.info.websiteLabel": {
    id: "Situs web",
    "id-simple": "Alamat situs web",
  },

  // --- Akomodasi ---
  "companies.akomodasi.judul": {
    id: "Akomodasi yang tersedia",
    "id-simple": "Bantuan yang perusahaan ini sediakan",
  },
  "companies.akomodasi.kosong": {
    id: "Perusahaan ini belum mencantumkan akomodasi apa pun.",
    "id-simple": "Belum ada info bantuan dari perusahaan ini.",
  },

  // --- Lowongan aktif ---
  "companies.lowongan.judul": {
    id: "Lowongan aktif",
    "id-simple": "Lowongan yang masih dibuka",
  },
  "companies.lowongan.memuat": {
    id: "Memuat lowongan aktif…",
    "id-simple": "Sebentar, lowongan sedang dibuka…",
  },
  "companies.lowongan.gagalMuat": {
    id: "Daftar lowongan belum bisa ditampilkan.",
    "id-simple": "Daftar lowongan gagal dibuka.",
  },
  "companies.lowongan.kosong.judul": {
    id: "Belum ada lowongan aktif",
    "id-simple": "Belum ada lowongan yang dibuka",
  },
  "companies.lowongan.kosong.penjelasan": {
    id: "Perusahaan ini belum memiliki lowongan aktif saat ini.",
    "id-simple": "Perusahaan ini belum membuka lowongan.",
  },
  "companies.lowongan.lihat": {
    id: "Lihat detail",
    "id-simple": "Lihat lowongan",
  },
  "companies.lowongan.lihatLabel": {
    id: "Lihat detail lowongan {judul}",
    "id-simple": "Lihat lowongan {judul}",
  },

  // --- Taksonomi jenis & mode kerja (nilainya di packages/schemas) ---
  "companies.lowongan.tipe.full_time": {
    id: "Purna waktu",
    "id-simple": "Kerja penuh waktu",
  },
  "companies.lowongan.tipe.part_time": {
    id: "Paruh waktu",
    "id-simple": "Kerja paruh waktu",
  },
  "companies.lowongan.tipe.contract": {
    id: "Kontrak",
    "id-simple": "Kerja kontrak",
  },
  "companies.lowongan.tipe.internship": {
    id: "Magang",
    "id-simple": "Magang",
  },
  "companies.lowongan.tipe.freelance": {
    id: "Lepas (freelance)",
    "id-simple": "Kerja lepas",
  },
  "companies.lowongan.mode.onsite": {
    id: "Di kantor",
    "id-simple": "Kerja di kantor",
  },
  "companies.lowongan.mode.hybrid": {
    id: "Hibrida",
    "id-simple": "Kadang di kantor, kadang di rumah",
  },
  "companies.lowongan.mode.remote": {
    id: "Jarak jauh",
    "id-simple": "Kerja dari rumah",
  },
} as const satisfies KatalogFitur;
