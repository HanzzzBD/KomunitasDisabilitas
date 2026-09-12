// Katalog shell admin (PR-052) — AC "id + id-simple" berlaku di sini juga,
// meski pembacanya seorang admin: preferensi teks sederhana adalah pilihan
// GLOBAL pengguna (ADR-008), dan admin yang menyalakannya berhak melihatnya
// berlaku di seluruh aplikasi, termasuk bagian yang jarang ia lihat orang lain.
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkap di
// docs/panduan-bahasa-sederhana.md.
import type { KatalogFitur } from "../tipe.js";

export const katalogAdmin = {
  "admin.judul": {
    id: "Admin",
    "id-simple": "Admin",
  },
  "admin.nav.label": {
    // Nama landmark navigasi — dibacakan saat pengguna screen reader melompat
    // antar landmark, bukan ditampilkan di layar.
    id: "Bagian admin",
    "id-simple": "Bagian admin",
  },
  "admin.nav.ringkasan": {
    id: "Ringkasan",
    "id-simple": "Ringkasan",
  },
  "admin.memuat": {
    id: "Memeriksa hak akses Anda…",
    "id-simple": "Sebentar, kami cek dulu hak akses Anda…",
  },
  "admin.ditolak": {
    // Ditampilkan SETELAH pengalihan — pesan flash di halaman tujuan, bukan
    // di /admin itu sendiri (halaman itu sudah ditinggalkan). Menyebut
    // SEBABNYA ("khusus admin"), bukan sekadar "ditolak": pengguna yang tidak
    // tahu ada peran admin akan mengira ada yang rusak.
    id: "Halaman itu khusus untuk admin, jadi Anda tidak bisa membukanya.",
    "id-simple": "Halaman itu hanya untuk admin. Anda tidak bisa membukanya.",
  },
  "admin.ringkasan.judul": {
    id: "Ringkasan",
    "id-simple": "Ringkasan",
  },
  "admin.ringkasan.kosong.judul": {
    id: "Belum ada modul yang tersedia",
    "id-simple": "Belum ada modul",
  },
  "admin.ringkasan.kosong.penjelasan": {
    id: "Kurasi perusahaan dan lowongan akan muncul di sini begitu modulnya siap.",
    "id-simple": "Nanti perusahaan dan lowongan bisa diatur di sini.",
  },
} as const satisfies KatalogFitur;
