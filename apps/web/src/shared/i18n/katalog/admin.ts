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
  "admin.nav.companies": {
    // Harus SAMA dengan `admin.companies.judul` — pengguna mencocokkan kata
    // yang tadi ia tekan dengan judul halaman yang terbuka.
    id: "Perusahaan",
    "id-simple": "Perusahaan",
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
  "admin.ringkasan.penjelasan": {
    id: "Pilih bagian yang ingin Anda kurasi.",
    "id-simple": "Pilih bagian yang mau Anda atur.",
  },
  "admin.ringkasan.companies.judul": {
    id: "Perusahaan",
    "id-simple": "Perusahaan",
  },
  "admin.ringkasan.companies.penjelasan": {
    id: "Tambah, ubah, dan verifikasi data inklusivitas perusahaan.",
    "id-simple": "Tambah, ubah, dan periksa data perusahaan.",
  },
  "admin.ringkasan.companies.tautan": {
    id: "Buka daftar perusahaan",
    "id-simple": "Buka daftar perusahaan",
  },

  // --- Kurasi perusahaan (PR-053) ---
  "admin.companies.judul": {
    id: "Perusahaan",
    "id-simple": "Perusahaan",
  },
  "admin.companies.penjelasan": {
    id: "Kelola data perusahaan dan verifikasi status inklusivitasnya.",
    "id-simple": "Atur data perusahaan. Periksa juga apakah datanya benar.",
  },
  "admin.companies.tambah": {
    id: "Tambah perusahaan",
    "id-simple": "Tambah perusahaan",
  },
  "admin.companies.tabelJudul": {
    id: "Daftar perusahaan",
    "id-simple": "Daftar perusahaan",
  },
  "admin.companies.kolom.nama": {
    id: "Nama",
    "id-simple": "Nama",
  },
  "admin.companies.kolom.kota": {
    id: "Kota",
    "id-simple": "Kota",
  },
  "admin.companies.kolom.status": {
    id: "Status",
    "id-simple": "Status",
  },
  "admin.companies.kolom.aksi": {
    // Kolom terakhir hanya berisi tautan "Ubah" — judulnya sendiri tidak
    // tampil ke pengguna sighted (kolom aksi lazimnya tanpa judul terlihat),
    // tetapi tetap WAJIB bagi `scope=col` supaya screen reader tahu kolom apa
    // yang sedang ia jelajahi.
    id: "Aksi",
    "id-simple": "Aksi",
  },
  "admin.companies.ubah": {
    id: "Ubah",
    "id-simple": "Ubah",
  },
  "admin.companies.ubahLabel": {
    id: "Ubah {nama}",
    "id-simple": "Ubah {nama}",
  },
  "admin.companies.memuat": {
    id: "Memuat daftar perusahaan…",
    "id-simple": "Sebentar, daftar perusahaan sedang dibuka…",
  },
  "admin.companies.gagalMuat": {
    id: "Daftar perusahaan belum bisa ditampilkan.",
    "id-simple": "Daftar perusahaan gagal dibuka.",
  },
  "admin.companies.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Coba lagi",
  },
  "admin.companies.kosong.judul": {
    id: "Belum ada perusahaan",
    "id-simple": "Belum ada perusahaan",
  },
  "admin.companies.kosong.penjelasan": {
    id: "Tambahkan perusahaan pertama untuk mulai mengurasi lowongan.",
    "id-simple": "Tambah perusahaan pertama Anda di sini.",
  },

  "admin.companies.status.verified": {
    id: "Terverifikasi",
    "id-simple": "Sudah diperiksa",
  },
  "admin.companies.status.selfClaimed": {
    id: "Klaim mandiri",
    "id-simple": "Klaim sendiri, belum diperiksa",
  },
  "admin.companies.status.unverified": {
    id: "Belum diverifikasi",
    "id-simple": "Belum diperiksa",
  },

  "admin.companies.form.judulBuat": {
    id: "Tambah perusahaan",
    "id-simple": "Tambah perusahaan",
  },
  "admin.companies.form.judulUbah": {
    id: "Ubah {nama}",
    "id-simple": "Ubah {nama}",
  },
  "admin.companies.form.tidakDitemukan": {
    id: "Perusahaan itu tidak ditemukan.",
    "id-simple": "Perusahaan itu tidak ada.",
  },
  "admin.companies.form.kembaliKeDaftar": {
    id: "Kembali ke daftar perusahaan",
    "id-simple": "Kembali ke daftar perusahaan",
  },
  "admin.companies.form.nama": {
    id: "Nama perusahaan",
    "id-simple": "Nama perusahaan",
  },
  "admin.companies.form.deskripsi": {
    id: "Deskripsi",
    "id-simple": "Cerita singkat",
  },
  "admin.companies.form.website": {
    id: "Situs web",
    "id-simple": "Alamat situs web",
  },
  "admin.companies.form.websiteBantuan": {
    id: "Sertakan https:// di depan alamatnya.",
    "id-simple": "Tulis lengkap, mulai dari https://.",
  },
  "admin.companies.form.kota": {
    id: "Kota",
    "id-simple": "Kota",
  },
  "admin.companies.form.akomodasiLegenda": {
    id: "Akomodasi yang tersedia di perusahaan ini",
    "id-simple": "Bantuan yang perusahaan ini sediakan",
  },
  "admin.companies.form.status": {
    id: "Status verifikasi",
    "id-simple": "Status",
  },
  "admin.companies.form.statusBantuan": {
    // Menjelaskan KENAPA pilihannya cuma dua, bukan tiga — admin yang berharap
    // bisa memilih "Terverifikasi" di sini perlu tahu jalan yang benar.
    id: "Untuk menandai perusahaan sebagai terverifikasi, gunakan tombol Verifikasi di bawah, bukan pilihan ini.",
    "id-simple": "Mau menandai 'Terverifikasi'? Pakai tombol Verifikasi di bawah, bukan pilihan ini.",
  },
  "admin.companies.form.simpan": {
    id: "Simpan",
    "id-simple": "Simpan",
  },
  "admin.companies.form.menyimpan": {
    id: "Menyimpan…",
    "id-simple": "Sebentar, sedang disimpan…",
  },
  "admin.companies.form.batal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "admin.companies.form.ditambah": {
    id: "Perusahaan {nama} sudah ditambahkan.",
    "id-simple": "Perusahaan {nama} sudah ditambah.",
  },
  "admin.companies.form.diubah": {
    id: "Perubahan pada {nama} sudah tersimpan.",
    "id-simple": "Perubahan pada {nama} sudah disimpan.",
  },
  "admin.companies.galat.periksaKolom": {
    id: "Periksa kembali kolom yang ditandai di bawah.",
    "id-simple": "Cek lagi kolom yang ditandai merah.",
  },
  "admin.companies.galat.tidakDitemukan": {
    id: "Perusahaan ini sudah tidak ada — mungkin dihapus dari tempat lain.",
    "id-simple": "Perusahaan ini sudah tidak ada.",
  },

  "admin.companies.verifikasi.tombol": {
    id: "Verifikasi perusahaan ini",
    "id-simple": "Tandai sudah diperiksa",
  },
  "admin.companies.verifikasi.tombolUlang": {
    id: "Verifikasi ulang",
    "id-simple": "Periksa lagi",
  },
  "admin.companies.verifikasi.dialogJudul": {
    id: "Verifikasi {nama}?",
    "id-simple": "Tandai {nama} sudah diperiksa?",
  },
  "admin.companies.verifikasi.dialogDeskripsi": {
    // Security Considerations PR-053: "Konfirmasi verifikasi eksplisit (dampak
    // label publik)" — deskripsi ini yang menyebut dampaknya.
    id: "Badge 'Terverifikasi' akan tampil di halaman publik perusahaan ini, terlihat oleh semua pencari kerja.",
    "id-simple": "Badge 'Terverifikasi' akan muncul di halaman umum. Semua orang bisa melihatnya.",
  },
  "admin.companies.verifikasi.dialogYa": {
    id: "Ya, verifikasi",
    "id-simple": "Ya, tandai",
  },
  "admin.companies.verifikasi.dialogBatal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "admin.companies.verifikasi.sedang": {
    id: "Memverifikasi…",
    "id-simple": "Sebentar, sedang ditandai…",
  },
  "admin.companies.verifikasi.berhasil": {
    id: "{nama} sudah terverifikasi.",
    "id-simple": "{nama} sudah ditandai selesai diperiksa.",
  },
} as const satisfies KatalogFitur;
