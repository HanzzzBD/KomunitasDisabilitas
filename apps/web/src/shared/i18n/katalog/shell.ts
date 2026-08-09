// Katalog kerangka aplikasi: banner luring, layar kesalahan, penanda memuat,
// dan halaman sementara. Katalog per fitur lain menyusul di PR-nya
// masing-masing (auth = PR-030, dst.).
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkapnya di PR-029b; ringkasnya:
// kalimat pendek, satu gagasan per kalimat, kata sehari-hari, tanpa kiasan.
// Varian simple BOLEH sama dengan `id` bila kalimat aslinya memang sudah
// sederhana ("Masuk"); yang tidak boleh adalah menyalinnya karena malas.
import type { KatalogFitur } from "../tipe.js";

export const katalogShell = {
  "shell.merek": {
    id: "Nawasena",
    // Nama produk tidak diterjemahkan dan tidak disederhanakan.
    "id-simple": "Nawasena",
  },
  "shell.beranda.tagline": {
    id: "Ekosistem karier inklusif untuk penyandang disabilitas.",
    // "Ekosistem karier inklusif" adalah jargon: tiga kata abstrak berturut-turut.
    "id-simple": "Cari kerja yang ramah untuk penyandang disabilitas.",
  },
  "shell.aksi.masuk": {
    id: "Masuk",
    "id-simple": "Masuk",
  },
  "shell.memuat": {
    id: "Memuat halaman…",
    "id-simple": "Sebentar, halaman sedang dibuka…",
  },

  // --- Banner luring ---
  "shell.luring.judul": {
    id: "Anda sedang tidak terhubung ke internet.",
    "id-simple": "Internet Anda mati.",
  },
  "shell.luring.penjelasan": {
    id: "Perubahan yang Anda buat akan dikirim setelah terhubung kembali.",
    "id-simple": "Perubahan Anda aman. Kami kirim setelah internet menyala.",
  },
  "shell.luring.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Coba lagi",
  },

  // --- Layar kesalahan ---
  "shell.kesalahan.takDitemukan.judul": {
    id: "Halaman tidak ditemukan",
    "id-simple": "Halaman ini tidak ada",
  },
  "shell.kesalahan.takDitemukan.penjelasan": {
    id: "Alamat yang Anda tuju mungkin salah ketik atau sudah dipindahkan.",
    "id-simple": "Mungkin alamatnya salah ketik. Coba periksa lagi.",
  },
  "shell.kesalahan.perluMasuk.judul": {
    id: "Anda belum bisa membuka halaman ini",
    "id-simple": "Halaman ini terkunci",
  },
  "shell.kesalahan.perluMasuk.penjelasan": {
    id: "Coba masuk lebih dulu, lalu buka kembali halaman ini.",
    "id-simple": "Masuk dulu. Setelah itu halaman ini bisa dibuka.",
  },
  "shell.kesalahan.umum.judul": {
    id: "Ada yang tidak berjalan semestinya",
    "id-simple": "Ada yang salah di aplikasi kami",
  },
  "shell.kesalahan.umum.penjelasan": {
    id: "Ini bukan kesalahan Anda. Coba muat ulang halaman ini.",
    // Menyebut "bukan kesalahan Anda" dipertahankan di kedua varian: ia bukan
    // basa-basi melainkan informasi — pengguna yang mengira dirinya salah akan
    // berhenti mencoba.
    "id-simple": "Ini bukan salah Anda. Coba buka ulang halaman ini.",
  },
  "shell.kesalahan.muatUlang": {
    id: "Muat ulang halaman",
    "id-simple": "Buka ulang halaman",
  },

  // --- Sesi ---
  "shell.sesi.memulihkan": {
    id: "Memeriksa apakah Anda masih masuk…",
    // "Memulihkan sesi" adalah istilah teknis: pengguna tidak punya gambaran
    // apa itu "sesi", apalagi apa artinya "dipulihkan".
    "id-simple": "Sebentar, kami cek dulu akun Anda.",
  },

  // --- Halaman sementara ---
  "shell.masuk.judul": {
    id: "Masuk",
    "id-simple": "Masuk",
  },
  "shell.masuk.sedangDisiapkan": {
    id: "Halaman masuk sedang disiapkan.",
    "id-simple": "Halaman ini belum siap.",
  },
} as const satisfies KatalogFitur;
