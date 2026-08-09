// Katalog fitur auth (PR-030b) — halaman masuk lewat kode OTP.
//
// CARA MENULIS VARIAN `id-simple` — docs/panduan-bahasa-sederhana.md. Di
// katalog ini taruhannya lebih tinggi daripada di shell: ini pintu masuk
// produk. Pengguna yang tidak paham kalimat di sini tidak bisa memakai
// aplikasinya sama sekali — bukan sekadar kehilangan satu fitur.
import type { KatalogFitur } from "../tipe.js";

export const katalogAuth = {
  "auth.judul": {
    id: "Masuk ke Nawasena",
    "id-simple": "Masuk ke Nawasena",
  },
  "auth.penjelasan": {
    id: "Kami akan mengirim kode ke WhatsApp atau SMS Anda.",
    "id-simple": "Kami kirim kode ke WhatsApp atau SMS Anda.",
  },

  // --- Langkah 1: nomor HP ---
  "auth.nomor.label": {
    id: "Nomor HP",
    "id-simple": "Nomor HP",
  },
  "auth.nomor.bantuan": {
    id: "Contoh: 0812 3456 7890. Boleh juga ditulis +62.",
    "id-simple": "Contoh: 0812 3456 7890.",
  },
  "auth.nomor.kosong": {
    id: "Isi nomor HP Anda lebih dulu.",
    "id-simple": "Nomor HP masih kosong.",
  },
  "auth.nomor.takValid": {
    id: "Nomor HP itu belum benar. Contoh yang benar: 0812 3456 7890.",
    "id-simple": "Nomor itu salah. Contoh benar: 0812 3456 7890.",
  },
  "auth.nomor.kirim": {
    id: "Kirim kode",
    "id-simple": "Kirim kode",
  },
  "auth.nomor.mengirim": {
    id: "Sedang mengirim kode…",
    "id-simple": "Sedang mengirim kode…",
  },

  // --- Langkah 2: kode ---
  "auth.kode.label": {
    id: "Kode 6 angka",
    "id-simple": "Kode 6 angka",
  },
  "auth.kode.bantuan": {
    id: "Kami kirim ke {nomor}. Kode berlaku 5 menit.",
    "id-simple": "Kode dikirim ke {nomor}. Berlaku 5 menit.",
  },
  "auth.kode.kosong": {
    id: "Isi kode yang Anda terima.",
    "id-simple": "Kodenya masih kosong.",
  },
  "auth.kode.takValid": {
    id: "Kode harus 6 angka.",
    "id-simple": "Kode harus 6 angka.",
  },
  "auth.kode.masuk": {
    id: "Masuk",
    "id-simple": "Masuk",
  },
  "auth.kode.memeriksa": {
    id: "Sedang memeriksa kode…",
    "id-simple": "Sedang memeriksa kode…",
  },
  "auth.kode.gantiNomor": {
    id: "Ganti nomor HP",
    "id-simple": "Pakai nomor lain",
  },
  "auth.kode.kirimUlang": {
    id: "Kirim ulang kode",
    "id-simple": "Kirim kode lagi",
  },
  "auth.kode.tungguKirimUlang": {
    id: "Kirim ulang kode dalam {detik} detik",
    "id-simple": "Tunggu {detik} detik untuk kode baru",
  },
  "auth.kode.bisaKirimUlang": {
    id: "Sekarang Anda bisa meminta kode baru.",
    "id-simple": "Sekarang Anda bisa minta kode baru.",
  },
  "auth.kode.terkirim": {
    id: "Kode baru sudah dikirim.",
    "id-simple": "Kode baru sudah dikirim.",
  },

  // --- Kegagalan yang punya varian sederhana ---
  //
  // API sudah mengirim `message` + `hint` dalam Bahasa Indonesia (SDD §11), dan
  // itu yang dipakai untuk kode yang TIDAK terdaftar di sini. Yang didaftarkan
  // hanya kegagalan yang paling sering ditemui pengguna, supaya keduanya punya
  // varian `id-simple` — yang tidak bisa datang dari server, sebab server hanya
  // mengenal satu varian.
  "auth.galat.kodeSalah": {
    id: "Kode yang Anda masukkan salah.",
    "id-simple": "Kode itu salah. Coba periksa lagi.",
  },
  "auth.galat.kodeHangus": {
    id: "Kode sudah tidak berlaku. Minta kode baru.",
    "id-simple": "Kode itu sudah mati. Minta kode baru.",
  },
  "auth.galat.terlaluBanyak": {
    id: "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.",
    "id-simple": "Anda mencoba terlalu sering. Tunggu sebentar.",
  },
  "auth.galat.jaringan": {
    id: "Tidak dapat terhubung ke server. Periksa internet Anda, lalu coba lagi.",
    "id-simple": "Internet Anda bermasalah. Coba lagi nanti.",
  },
} as const satisfies KatalogFitur;
