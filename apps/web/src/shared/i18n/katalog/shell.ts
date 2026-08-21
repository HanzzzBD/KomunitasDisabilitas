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
  "shell.lompatKeKonten": {
    id: "Lompat ke konten utama",
    // "Konten" adalah kata yang dipakai pembuat situs, bukan pembacanya.
    "id-simple": "Langsung ke isi halaman",
  },
  // --- Pintasan tingkat atas (PR-036; ditambah satu di PR-040) ---
  //
  // SATU-SATUNYA navigasi tingkat atas di aplikasi ini. PR-036 memasangnya
  // dengan SATU tautan dan mencatat bahwa menu lengkap adalah keputusan produk
  // yang belum diambil "karena halaman-halamannya sendiri sebagian belum ada".
  //
  // Salah satunya kini ADA: halaman profil karier (PR-040). Alasan yang sama
  // dengan tautan pertama berlaku persis — tanpa entri di sini, satu-satunya
  // jalan ke `/profil` adalah mengetikkan alamatnya, dan halaman yang harus
  // ditebak alamatnya sama saja dengan halaman yang tidak ada. Yang MASIH
  // ditunda adalah menu lengkapnya; dua tautan bukan menu.
  "shell.pintas.label": {
    // Nama landmark navigasi — dibacakan saat pengguna screen reader melompat
    // antar landmark, bukan ditampilkan di layar.
    //
    // DIUBAH DI PR-040 dari "Pintasan aksesibilitas". Sejak tautan profil
    // masuk, nama lamanya menjanjikan isi yang tidak lagi benar: pengguna
    // screen reader yang melompat ke landmark bernama "aksesibilitas" lalu
    // menemukan tautan profil di dalamnya tidak salah membaca — namanya yang
    // salah.
    id: "Pintasan halaman",
    "id-simple": "Pintasan halaman",
  },
  "shell.pintas.profil": {
    // Menyebut kata yang sama dengan judul halaman tujuannya ("Profil karier
    // saya"), dipendekkan supaya muat di bilah sempit ponsel. Pengguna
    // mencocokkan kata yang tadi ia tekan dengan judul yang terbuka.
    id: "Profil karier",
    "id-simple": "Profil kerja",
  },
  "shell.pintas.aksesibilitas": {
    // Menyebut DUA kata yang akan ia temui di halaman tujuan: "Pengaturan"
    // (judul halaman) dan "Aksesibilitas" (judul panel). Pengguna mencocokkan
    // kata yang tadi ia tekan dengan yang terbuka; label yang hanya menyebut
    // salah satunya membuat separuh pencocokan itu gagal.
    id: "Pengaturan aksesibilitas",
    "id-simple": "Pengaturan aksesibilitas",
  },

  "shell.judulDokumen": {
    // Judul tab: nama halaman lebih dulu, merek belakangan. Di tab yang menyempit
    // karena belasan tab terbuka, yang tersisa terbaca adalah bagian DEPAN — dan
    // yang berguna di sana adalah nama halamannya, bukan merek yang sama di
    // semua tab.
    id: "{halaman} · Nawasena",
    "id-simple": "{halaman} · Nawasena",
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
  "shell.kesalahan.takDitemukan.pulang": {
    id: "Kembali ke beranda",
    // "Beranda" sudah lazim, tetapi ia tetap istilah aplikasi. "Halaman awal"
    // menyebut tempatnya, bukan namanya.
    "id-simple": "Buka halaman awal",
  },
  "shell.kesalahan.perluMasuk.judul": {
    id: "Anda belum bisa membuka halaman ini",
    "id-simple": "Halaman ini terkunci",
  },
  "shell.kesalahan.perluMasuk.penjelasan": {
    id: "Coba masuk lebih dulu, lalu buka kembali halaman ini.",
    "id-simple": "Masuk dulu. Setelah itu halaman ini bisa dibuka.",
  },
  "shell.kesalahan.perluMasuk.masuk": {
    id: "Masuk ke akun Anda",
    "id-simple": "Masuk ke akun Anda",
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

  // --- Galat lintas fitur ---
  "shell.galat.jaringan": {
    id: "Tidak dapat terhubung ke server. Periksa internet Anda, lalu coba lagi.",
    "id-simple": "Internet Anda bermasalah. Coba lagi nanti.",
  },

  // --- Sesi ---
  "shell.sesi.memulihkan": {
    id: "Memeriksa apakah Anda masih masuk…",
    // "Memulihkan sesi" adalah istilah teknis: pengguna tidak punya gambaran
    // apa itu "sesi", apalagi apa artinya "dipulihkan".
    "id-simple": "Sebentar, kami cek dulu akun Anda.",
  },
} as const satisfies KatalogFitur;
