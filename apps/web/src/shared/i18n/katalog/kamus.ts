// Katalog kamus BISINDO publik (PR-086). Pembacanya pengguna Tuli yang bisa
// jadi baru belajar membaca bahasa Indonesia tulis — varian `id-simple` di sini
// paling penting di seluruh aplikasi. Panduan: docs/panduan-bahasa-sederhana.md.
import type { KatalogFitur } from "../tipe.js";

export const katalogKamus = {
  "kamus.judul": { id: "Kamus BISINDO", "id-simple": "Kamus bahasa isyarat" },
  "kamus.penjelasan": {
    id: "Cari kata atau kalimat, lalu tonton isyaratnya dalam Bahasa Isyarat Indonesia (BISINDO). Setiap video punya caption dan transkrip.",
    "id-simple": "Cari kata. Lalu tonton video bahasa isyaratnya. Setiap video ada teksnya.",
  },
  "kamus.cari.label": { id: "Cari di kamus", "id-simple": "Cari kata" },
  "kamus.cari.kataKunci": { id: "Kata atau kalimat", "id-simple": "Kata yang dicari" },
  "kamus.cari.kategori": { id: "Kategori", "id-simple": "Kelompok kata" },
  "kamus.cari.tombol": { id: "Cari", "id-simple": "Cari kata" },
  "kamus.kategori.semua": { id: "Semua kategori", "id-simple": "Semua kelompok" },
  "kamus.kategori.salam": { id: "Salam", "id-simple": "Salam (sapaan)" },
  "kamus.kategori.perkenalan": { id: "Perkenalan", "id-simple": "Kenalan" },
  "kamus.kategori.wawancara": {
    id: "Wawancara kerja",
    "id-simple": "Wawancara (tanya jawab kerja)",
  },
  "kamus.kategori.tempat_kerja": { id: "Tempat kerja", "id-simple": "Di kantor" },
  "kamus.kategori.akomodasi": { id: "Akomodasi", "id-simple": "Bantuan di tempat kerja" },
  "kamus.kategori.waktu": { id: "Waktu", "id-simple": "Jam dan hari" },
  "kamus.kategori.angka": { id: "Angka", "id-simple": "Angka (bilangan)" },
  "kamus.kategori.umum": { id: "Umum", "id-simple": "Lain-lain" },
  "kamus.hasil.judul": { id: "Hasil pencarian", "id-simple": "Kata yang ditemukan" },
  "kamus.hasil.jumlah": { id: "{jumlah} entri ditemukan.", "id-simple": "Ada {jumlah} kata." },
  "kamus.hasil.kosong": {
    id: "Belum ada entri yang cocok. Coba kata lain atau pilih semua kategori.",
    "id-simple": "Kata itu belum ada. Coba kata lain.",
  },
  "kamus.memuat": { id: "Memuat kamus…", "id-simple": "Sedang membuka kamus…" },
  "kamus.cobaLagi": { id: "Coba lagi", "id-simple": "Ulangi" },
  "kamus.galat.belumSiap": {
    id: "Kamus sedang tidak tersedia. Coba lagi beberapa saat lagi.",
    "id-simple": "Kamus belum bisa dibuka. Coba lagi nanti.",
  },
  "kamus.detail.kembali": { id: "Kembali ke kamus", "id-simple": "Kembali ke daftar kata" },
  "kamus.detail.transkrip": { id: "Transkrip", "id-simple": "Isi video dalam tulisan" },
  "kamus.detail.tidakAda": {
    id: "Entri ini tidak ditemukan. Mungkin sudah tidak tersedia.",
    "id-simple": "Kata ini tidak ada. Kembali ke daftar kata.",
  },
  "kamus.pemutar.videoLabel": {
    id: "Video isyarat: {frasa}",
    "id-simple": "Video bahasa isyarat: {frasa}",
  },
  "kamus.pemutar.captionBahasa": { id: "Bahasa Indonesia", "id-simple": "Teks bahasa Indonesia" },
  "kamus.pemutar.kontrolLabel": {
    id: "Kontrol video {frasa}",
    "id-simple": "Tombol video {frasa}",
  },
  "kamus.pemutar.putar": { id: "Putar", "id-simple": "Mulai video" },
  "kamus.pemutar.jeda": { id: "Jeda", "id-simple": "Hentikan sebentar" },
  "kamus.pemutar.mundur": { id: "Mundur {detik} detik", "id-simple": "Ulang {detik} detik" },
  "kamus.pemutar.maju": { id: "Maju {detik} detik", "id-simple": "Lewati {detik} detik" },
  "kamus.pemutar.caption": { id: "Caption", "id-simple": "Teks di video" },
  "kamus.pemutar.posisi": { id: "Posisi video", "id-simple": "Bagian video" },
  "kamus.pemutar.posisiTeks": {
    id: "{sekarang} dari {total}",
    "id-simple": "Detik ke {sekarang} dari {total}",
  },
  "kamus.pemutar.volume": { id: "Volume", "id-simple": "Kuat suara" },
  "kamus.pemutar.volumeTeks": { id: "{persen} persen", "id-simple": "Suara {persen} persen" },
  "kamus.pemutar.kecepatan": { id: "Kecepatan", "id-simple": "Cepat atau lambat" },
  "kamus.pemutar.kecepatan.0.5": { id: "0,5× (lambat)", "id-simple": "Sangat lambat" },
  "kamus.pemutar.kecepatan.0.75": { id: "0,75×", "id-simple": "Agak lambat" },
  "kamus.pemutar.kecepatan.1": { id: "1× (normal)", "id-simple": "Biasa" },
  "kamus.pemutar.galat": {
    id: "Video belum bisa diputar. Periksa koneksi Anda, lalu coba lagi.",
    "id-simple": "Video belum bisa diputar. Cek internet, lalu coba lagi.",
  },
  "kamus.pemutar.cobaLagi": { id: "Coba putar lagi", "id-simple": "Putar ulang" },
} as const satisfies KatalogFitur;
