// Katalog halaman landing (PR-032a) — AC PR-032 nomor 5: "Konten tersedia dalam
// id + id-simple".
//
// Halaman ini adalah SATU-SATUNYA halaman yang dibaca orang sebelum ia memutuskan
// apakah produk ini untuknya. Karena itu varian `id-simple` di sini bukan
// pelengkap: pembaca yang tidak memahami kalimat pertama tidak akan sampai ke
// kalimat kedua, apalagi ke tombol daftar.
//
// CARA MENULIS VARIAN `id-simple`: docs/panduan-bahasa-sederhana.md. Yang paling
// sering dilanggar justru di halaman pemasaran — "ekosistem", "inklusif",
// "solusi", "berdaya" adalah kata yang terasa berwibawa saat ditulis dan tidak
// berarti apa-apa saat dibaca.
import type { KatalogFitur } from "../tipe.js";

export const katalogBeranda = {
  // --- Hero ---
  "beranda.hero.judul": {
    id: "Cari kerja tanpa hambatan",
    // "Hambatan" masih abstrak: pembaca harus menebak hambatan yang mana.
    // Varian sederhana menyebutnya apa adanya.
    "id-simple": "Cari kerja yang cocok untuk Anda",
  },
  // Melengkapi `shell.beranda.tagline` yang dipakai sebagai kalimat pembuka,
  // dan sengaja TIDAK mengulanginya: paragraf kedua yang mengatakan hal yang
  // sama membuat pembaca menyimpulkan sisa halaman juga tidak membawa apa-apa.
  "beranda.hero.penjelasan": {
    id: "Kami tunjukkan perusahaan yang siap menerima Anda, lengkap dengan fasilitas yang tersedia di sana.",
    // Satu gagasan per kalimat (panduan §1).
    "id-simple":
      "Kami tunjukkan perusahaan yang siap menerima Anda. Kami juga tulis fasilitas apa saja yang ada di sana.",
  },
  "beranda.hero.daftar": {
    id: "Mulai sekarang",
    "id-simple": "Mulai sekarang",
  },
  "beranda.hero.gratis": {
    id: "Gratis, dan Anda bisa berhenti kapan saja.",
    "id-simple": "Tidak perlu bayar. Anda boleh berhenti kapan saja.",
  },

  // --- Nilai produk ---
  "beranda.nilai.judul": {
    id: "Yang Anda dapat di sini",
    "id-simple": "Apa yang Anda dapat di sini",
  },
  "beranda.nilai.cocok.judul": {
    id: "Lowongan yang benar-benar cocok",
    "id-simple": "Lowongan yang pas untuk Anda",
  },
  "beranda.nilai.cocok.isi": {
    id: "Kami mencocokkan keahlian Anda dengan lowongan, termasuk kebutuhan akomodasi yang Anda sebutkan.",
    // "Akomodasi" adalah istilah kebijakan, bukan kata sehari-hari.
    "id-simple":
      "Ceritakan keahlian Anda. Ceritakan juga bantuan apa yang Anda butuhkan di tempat kerja. Kami carikan lowongan yang cocok.",
  },
  "beranda.nilai.terbuka.judul": {
    id: "Perusahaan yang terbuka, apa adanya",
    "id-simple": "Anda tahu dulu soal perusahaannya",
  },
  "beranda.nilai.terbuka.isi": {
    id: "Setiap perusahaan menuliskan fasilitas yang tersedia, sehingga Anda tahu keadaannya sebelum melamar.",
    // Sebutkan pelakunya (panduan §3) dan katakan apa yang bisa dilakukan
    // pembaca (§4).
    "id-simple":
      "Setiap perusahaan menulis fasilitas apa saja yang mereka punya. Anda bisa membacanya dulu, sebelum melamar.",
  },
  "beranda.nilai.menyesuaikan.judul": {
    id: "Tampilan mengikuti Anda",
    "id-simple": "Tampilan bisa Anda atur",
  },
  "beranda.nilai.menyesuaikan.isi": {
    id: "Ukuran teks, kontras warna, dan bahasa sederhana bisa Anda atur sekali, lalu berlaku di seluruh halaman.",
    "id-simple":
      "Atur sekali saja: ukuran huruf, warna yang lebih jelas, dan bahasa yang lebih mudah. Semua halaman langsung ikut berubah.",
  },

  // --- Cara memulai ---
  "beranda.cara.judul": {
    id: "Cara memulai",
    "id-simple": "Cara memulai",
  },
  "beranda.cara.satu": {
    id: "Masuk dengan nomor HP atau akun Google Anda.",
    "id-simple": "Masuk pakai nomor HP. Bisa juga pakai akun Google.",
  },
  "beranda.cara.dua": {
    id: "Ceritakan keahlian dan kebutuhan Anda di tempat kerja.",
    "id-simple": "Isi keahlian Anda. Isi juga bantuan yang Anda butuhkan di tempat kerja.",
  },
  "beranda.cara.tiga": {
    id: "Lihat lowongan yang cocok, lalu lamar dari sini.",
    "id-simple": "Lihat lowongan yang cocok. Lamar langsung dari sini.",
  },

  // --- Ajakan penutup ---
  "beranda.penutup.judul": {
    id: "Siap mencoba?",
    // Tanpa kiasan dan tanpa basa-basi (panduan §5); sebut langkahnya.
    "id-simple": "Mau mulai sekarang?",
  },
  "beranda.penutup.daftar": {
    id: "Daftar atau masuk",
    "id-simple": "Daftar atau masuk",
  },

  // Judul dokumen SENGAJA memakai `beranda.hero.judul` yang sudah ada, bukan
  // kunci `beranda.meta.judul` tersendiri. Judul tab dan judul besar di layar
  // yang boleh berbeda akan berbeda — lalu pengguna yang mencari kembali
  // halamannya di antara belasan tab tidak menemukan kalimat yang tadi ia baca.
} as const satisfies KatalogFitur;
