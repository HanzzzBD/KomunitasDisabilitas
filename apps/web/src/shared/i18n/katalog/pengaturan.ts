// Katalog halaman pengaturan (PR-033a) — AC PR-033 nomor 5.
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkapnya di
// docs/panduan-bahasa-sederhana.md; ringkasnya: kalimat pendek, satu gagasan
// per kalimat, kata sehari-hari, tanpa kiasan. Varian simple BOLEH sama dengan
// `id` bila kalimatnya memang sudah sederhana; yang tidak boleh adalah
// menyalinnya karena malas — dan yang sama WAJIB terdaftar beserta alasannya
// di `SAMA_DENGAN_SENGAJA` (katalog-kelengkapan.test.ts).
//
// SATU CATATAN KHUSUS HALAMAN INI. Teks di sini menjelaskan hak atas data
// pribadi, dan pengguna yang membacanya sedang mempertimbangkan tindakan yang
// tidak bisa dibatalkan. Jadi tidak ada kalimat yang menyenangkan tetapi
// kabur: yang dijanjikan harus persis yang terjadi.
import type { KatalogFitur } from "../tipe.js";

export const katalogPengaturan = {
  "pengaturan.judul": {
    id: "Pengaturan",
    "id-simple": "Pengaturan",
  },
  "pengaturan.nav.label": {
    // Nama landmark navigasi — dibacakan saat pengguna screen reader melompat
    // antar landmark, bukan ditampilkan di layar.
    id: "Bagian pengaturan",
    "id-simple": "Bagian pengaturan",
  },
  "pengaturan.nav.akun": {
    id: "Akun & Data Saya",
    // "&" dibacakan berbeda-beda antar screen reader (kadang "dan", kadang
    // "ampersand", kadang dilewati). Varian sederhana menuliskannya sebagai
    // kata, sekaligus memecahnya jadi lebih pendek.
    "id-simple": "Akun saya",
  },
  "pengaturan.nav.aksesibilitas": {
    id: "Aksesibilitas",
    "id-simple": "Aksesibilitas",
  },

  // --- Akun & Data Saya ---
  "pengaturan.akun.judul": {
    id: "Akun & Data Saya",
    "id-simple": "Akun saya",
  },
  "pengaturan.akun.penjelasan": {
    id: "Di sini Anda bisa melihat data yang kami simpan tentang Anda.",
    "id-simple": "Halaman ini menunjukkan data Anda yang kami simpan.",
  },
  "pengaturan.akun.identitas": {
    id: "Identitas Anda",
    "id-simple": "Data diri Anda",
  },
  "pengaturan.akun.nama": {
    id: "Nama",
    "id-simple": "Nama",
  },
  "pengaturan.akun.email": {
    id: "Email",
    "id-simple": "Email",
  },
  "pengaturan.akun.nomor": {
    id: "Nomor HP",
    "id-simple": "Nomor HP",
  },
  "pengaturan.akun.bergabung": {
    id: "Bergabung sejak",
    "id-simple": "Mulai pakai sejak",
  },
  // "Cara Anda masuk" SENGAJA belum ada, dan ketiadaannya adalah keputusan.
  // `GET /me` mengembalikan `phone` tetapi tidak `googleId` (lihat catatan
  // `meSchema`: identitas provider bukan urusan pengguna), jadi satu-satunya
  // cara menampilkannya sekarang adalah menebak dari ada-tidaknya nomor HP —
  // dan tebakan itu SALAH untuk akun yang punya keduanya. Baris yang salah di
  // halaman "data yang kami simpan tentang Anda" lebih merugikan daripada baris
  // yang belum ada. Ia lahir bersama field-nya di kontrak, bukan sebelum itu.
  "pengaturan.akun.belumDiisi": {
    // Dipakai untuk nama/email/nomor yang kosong. "—" saja tidak cukup: tanda
    // hubung tidak dibacakan sebagian screen reader, sehingga barisnya
    // terdengar sebagai label tanpa nilai — dan pengguna tidak bisa
    // membedakan "kosong" dari "gagal dimuat".
    id: "Belum diisi",
    "id-simple": "Belum diisi",
  },
  "pengaturan.akun.memuat": {
    id: "Memuat data akun Anda…",
    "id-simple": "Sebentar, data Anda sedang dibuka…",
  },
  "pengaturan.akun.gagal": {
    id: "Data akun Anda belum bisa ditampilkan.",
    "id-simple": "Data Anda gagal dibuka.",
  },
  "pengaturan.akun.gagalPenjelasan": {
    id: "Ini bukan kesalahan Anda. Periksa koneksi internet, lalu coba lagi.",
    // "Bukan kesalahan Anda" dipertahankan di kedua varian dengan alasan yang
    // sama seperti di layar kesalahan (PR-032b): ia informasi, bukan
    // basa-basi — pengguna yang mengira dirinya salah akan berhenti mencoba.
    "id-simple": "Ini bukan salah Anda. Cek internet Anda, lalu coba lagi.",
  },
  "pengaturan.akun.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Coba lagi",
  },

  // --- Aksesibilitas (slot; diisi PR-036) ---
  "pengaturan.aksesibilitas.judul": {
    id: "Aksesibilitas",
    "id-simple": "Aksesibilitas",
  },
  "pengaturan.aksesibilitas.penjelasan": {
    id: "Atur cara aplikasi ini tampil dan bekerja, sesuai kebutuhan Anda.",
    "id-simple": "Atur tampilan aplikasi supaya nyaman untuk Anda.",
  },
  "pengaturan.aksesibilitas.slot.judul": {
    id: "Pengaturan aksesibilitas belum tersedia",
    "id-simple": "Pengaturan ini belum bisa dipakai",
  },
  "pengaturan.aksesibilitas.slot.penjelasan": {
    // Menyebut apa yang SUDAH berlaku, bukan hanya apa yang belum ada.
    // Preferensi sistem (kurangi gerak, kontras) memang sudah diikuti sejak
    // PR-026 — pengguna yang tidak diberi tahu akan menyangka aplikasinya
    // mengabaikan setelan perangkatnya.
    id: "Untuk sementara, aplikasi ini mengikuti setelan aksesibilitas perangkat Anda.",
    "id-simple": "Untuk sekarang, aplikasi mengikuti setelan HP atau komputer Anda.",
  },
} as const satisfies KatalogFitur;
