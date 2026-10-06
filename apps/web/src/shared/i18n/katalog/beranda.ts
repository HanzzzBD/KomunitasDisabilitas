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
  "beranda.personal.penjelasan": {
    id: "Siapkan langkah karier berikutnya. Profil, CV, dan kabar lamaran Anda ada di sini.",
    "id-simple": "Lihat profil, CV, dan kabar lamaran Anda di sini.",
  },
  "beranda.personal.salam": { id: "Selamat datang, {nama}.", "id-simple": "Halo, {nama}." },
  "beranda.personal.profil": {
    id: "Kelengkapan profil dasar",
    "id-simple": "Isi profil dasar Anda",
  },
  "beranda.personal.progress": {
    id: "{jumlah} dari 4 bagian terisi: judul profil, ringkasan, kota, dan provinsi.",
    "id-simple":
      "{jumlah} dari 4 bagian sudah diisi. Bagian ini adalah judul profil, ringkasan, kota, dan provinsi.",
  },
  "beranda.personal.lengkapi": { id: "Lengkapi profil", "id-simple": "Isi profil Anda" },
  "beranda.personal.cvJumlah": {
    id: "Anda memiliki {jumlah} CV.",
    "id-simple": "Anda punya {jumlah} CV.",
  },
  "beranda.personal.siapkanCv": { id: "Siapkan CV saya", "id-simple": "Buka dan siapkan CV" },
  "beranda.personal.lamaran": { id: "Lamaran terbaru", "id-simple": "Lamaran terbaru" },
  "beranda.personal.belumLamaran": {
    id: "Belum ada lamaran. Temukan pekerjaan yang sesuai di Lowongan.",
    "id-simple": "Anda belum melamar. Cari pekerjaan di Lowongan.",
  },
  "beranda.personal.detailLamaran": { id: "Detail lamaran", "id-simple": "Buka lamaran" },
  "beranda.personal.semuaLamaran": { id: "Lihat semua lamaran", "id-simple": "Buka semua lamaran" },
  "beranda.personal.semuaRekomendasi": {
    id: "Lihat semua rekomendasi",
    "id-simple": "Buka semua pekerjaan yang cocok",
  },
  "beranda.personal.gagal": {
    id: "Ringkasan belum bisa dimuat. Anda dapat membuka halamannya untuk mencoba lagi.",
    "id-simple": "Ringkasan tidak bisa dibuka. Buka halaman ini untuk mencoba lagi.",
  },
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

  // --- Feed matching untuk pengguna yang sudah masuk (PR-074) ---
  //
  // Satu katalog dengan landing karena satu alamat ("/"): yang sudah masuk
  // melihat feed, yang belum melihat landing. Taksonomi kartu (jenis/mode
  // kerja, akomodasi) TIDAK diulang — dipinjam dari `companies`/`profil`
  // lewat `KartuLowongan`/`DaftarAkomodasi`, pola sama halaman cari lowongan.
  "beranda.feed.judul": {
    id: "Lowongan untuk Anda",
    "id-simple": "Lowongan yang cocok untuk Anda",
  },
  "beranda.feed.penjelasan": {
    id: "Diurutkan dari yang paling cocok dengan keahlian, lokasi, dan kebutuhan akomodasi Anda.",
    "id-simple": "Lowongan yang paling cocok ada di paling atas.",
  },
  "beranda.feed.daftarJudul": {
    id: "Daftar lowongan yang cocok",
    "id-simple": "Daftar lowongan",
  },
  "beranda.feed.memuat": {
    id: "Memuat lowongan untuk Anda…",
    "id-simple": "Sebentar, kami sedang mencari lowongan untuk Anda…",
  },
  "beranda.feed.gagalMuat": {
    id: "Rekomendasi lowongan gagal dimuat.",
    "id-simple": "Daftar lowongan tidak bisa dibuka.",
  },
  "beranda.feed.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Coba buka lagi",
  },
  "beranda.feed.status.menyusun": {
    id: "Urutan dan alasan dari AI sedang disusun. Untuk sementara, lowongan diurutkan menurut skor kecocokan.",
    "id-simple": "AI sedang menyusun daftar ini. Sementara itu, kami tampilkan urutan biasa.",
  },
  "beranda.feed.status.tampilkanTerbaru": {
    id: "Tampilkan urutan terbaru",
    "id-simple": "Lihat urutan yang baru",
  },
  "beranda.feed.status.turun": {
    id: "Rekomendasi AI sedang tidak tersedia. Lowongan tetap diurutkan menurut kecocokan dengan profil Anda.",
    "id-simple": "AI sedang tidak bisa dipakai. Daftar ini tetap diurutkan dari yang paling cocok.",
  },
  "beranda.feed.refresh.tombol": {
    id: "Segarkan rekomendasi",
    "id-simple": "Perbarui daftar",
  },
  "beranda.feed.refresh.sisa": {
    id: "Bisa disegarkan {jumlah} kali lagi hari ini.",
    "id-simple": "Hari ini masih bisa diperbarui {jumlah} kali.",
  },
  "beranda.feed.refresh.habis": {
    id: "Kesempatan menyegarkan hari ini sudah habis. Coba lagi besok.",
    "id-simple": "Hari ini daftar tidak bisa diperbarui lagi. Coba lagi besok.",
  },
  "beranda.feed.refresh.berhasil": {
    id: "Rekomendasi diperbarui.",
    "id-simple": "Daftar sudah diperbarui.",
  },
  "beranda.feed.refresh.gagal": {
    id: "Rekomendasi gagal disegarkan. Daftar yang lama tetap ditampilkan.",
    "id-simple": "Daftar tidak bisa diperbarui. Daftar lama masih bisa Anda lihat.",
  },
  "beranda.feed.kartu.skor": {
    id: "Kecocokan {persen}% — {tingkat}",
    "id-simple": "{tingkat} ({persen}%)",
  },
  "beranda.feed.kartu.tingkat.tinggi": {
    id: "sangat cocok",
    "id-simple": "Sangat cocok",
  },
  "beranda.feed.kartu.tingkat.sedang": {
    id: "cocok",
    "id-simple": "Cocok",
  },
  "beranda.feed.kartu.tingkat.rendah": {
    id: "mungkin cocok",
    "id-simple": "Mungkin cocok",
  },
  "beranda.feed.kartu.alasanLabel": {
    id: "Kenapa cocok:",
    "id-simple": "Alasannya:",
  },
  "beranda.feed.kartu.dariAi": {
    id: "Alasan disusun AI",
    "id-simple": "Alasan ini ditulis AI",
  },
  "beranda.feed.muatLagi": {
    id: "Muat lebih banyak",
    "id-simple": "Tampilkan lebih banyak",
  },
  "beranda.feed.kosong.profil.judul": {
    id: "Lengkapi profil untuk mendapat rekomendasi",
    "id-simple": "Isi profil Anda dulu",
  },
  "beranda.feed.kosong.profil.isi": {
    id: "Kami mencocokkan lowongan dari keahlian dan pengalaman di profil Anda.",
    "id-simple": "Kami perlu tahu keahlian dan pengalaman Anda untuk mencarikan lowongan.",
  },
  "beranda.feed.kosong.profil.aksi": {
    id: "Lengkapi profil",
    "id-simple": "Isi profil",
  },
  "beranda.feed.kosong.tanpa.judul": {
    id: "Belum ada lowongan yang cocok",
    "id-simple": "Belum ada lowongan yang cocok untuk Anda",
  },
  "beranda.feed.kosong.tanpa.isi": {
    id: "Lowongan baru terus ditambahkan. Sementara itu, Anda bisa mencari lowongan sendiri.",
    "id-simple": "Nanti akan ada lowongan baru. Anda juga bisa mencari lowongan sendiri.",
  },
  "beranda.feed.cariLain": {
    id: "Cari lowongan lain",
    "id-simple": "Cari lowongan sendiri",
  },

  // Judul dokumen SENGAJA memakai `beranda.hero.judul` yang sudah ada, bukan
  // kunci `beranda.meta.judul` tersendiri. Judul tab dan judul besar di layar
  // yang boleh berbeda akan berbeda — lalu pengguna yang mencari kembali
  // halamannya di antara belasan tab tidak menemukan kalimat yang tadi ia baca.
  // PR-086 — kamus publik, terbuka sebelum mendaftar (ADR-010 v1).
  "beranda.kamus.judul": { id: "Kamus BISINDO", "id-simple": "Kamus bahasa isyarat" },
  "beranda.kamus.isi": {
    id: "Pelajari isyarat untuk salam, wawancara kerja, dan tempat kerja. Gratis, tanpa perlu masuk.",
    "id-simple": "Belajar bahasa isyarat untuk kerja. Gratis. Tidak perlu masuk.",
  },
  "beranda.kamus.tautan": { id: "Buka kamus", "id-simple": "Lihat kamus isyarat" },
} as const satisfies KatalogFitur;
