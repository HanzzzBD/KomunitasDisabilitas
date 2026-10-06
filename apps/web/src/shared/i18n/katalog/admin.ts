// Katalog shell admin (PR-052) — AC "id + id-simple" berlaku di sini juga,
// meski pembacanya seorang admin: preferensi teks sederhana adalah pilihan
// GLOBAL pengguna (ADR-008), dan admin yang menyalakannya berhak melihatnya
// berlaku di seluruh aplikasi, termasuk bagian yang jarang ia lihat orang lain.
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkap di
// docs/panduan-bahasa-sederhana.md.
import type { KatalogFitur } from "../tipe.js";
import { katalogAdminCommunity } from "./admin-community.js";

export const katalogAdmin = {
  "admin.nav.employers": { id: "Employer", "id-simple": "Perusahaan employer" },
  "admin.nav.moderasi": { id: "Moderasi", "id-simple": "Moderasi" },
  "admin.nav.analytics": { id: "Analytics", "id-simple": "Statistik" },
  "admin.nav.pengaturan": { id: "Pengaturan", "id-simple": "Pengaturan" },
  "admin.nav.profilAkun": { id: "Profil akun", "id-simple": "Profil akun" },
  ...katalogAdminCommunity,
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
    id: "Dashboard",
    "id-simple": "Dashboard",
  },
  "admin.nav.companies": {
    // Harus SAMA dengan `admin.companies.judul` — pengguna mencocokkan kata
    // yang tadi ia tekan dengan judul halaman yang terbuka.
    id: "Perusahaan",
    "id-simple": "Perusahaan",
  },
  "admin.nav.jobs": {
    // Harus SAMA dengan `admin.jobs.judul` — alasan sama dengan `admin.nav.companies`.
    id: "Lowongan",
    "id-simple": "Lowongan",
  },
  "admin.nav.kamus": {
    // Harus SAMA dengan `admin.kamus.judul` — alasan sama dengan `admin.nav.companies`.
    id: "Kamus BISINDO",
    "id-simple": "Kamus isyarat",
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
  "admin.ringkasan.jobs.judul": {
    id: "Lowongan",
    "id-simple": "Lowongan",
  },
  "admin.ringkasan.jobs.penjelasan": {
    id: "Tambah, ubah, terbitkan, dan tutup lowongan kerja.",
    "id-simple": "Buat lowongan baru. Anda juga bisa mengubah, menerbitkan, atau menutupnya.",
  },
  "admin.ringkasan.jobs.tautan": {
    id: "Buka daftar lowongan",
    "id-simple": "Buka daftar lowongan",
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
    "id-simple":
      "Mau menandai 'Terverifikasi'? Pakai tombol Verifikasi di bawah, bukan pilihan ini.",
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

  // --- Kurasi lowongan (PR-057) ---
  "admin.jobs.judul": {
    id: "Lowongan",
    "id-simple": "Lowongan",
  },
  "admin.jobs.penjelasan": {
    id: "Kelola lowongan kerja: buat, ubah, terbitkan, dan tutup.",
    "id-simple": "Atur lowongan kerja. Anda bisa membuat, mengubah, menerbitkan, atau menutupnya.",
  },
  "admin.jobs.tambah": {
    id: "Tambah lowongan",
    "id-simple": "Tambah lowongan",
  },
  "admin.jobs.tabelJudul": {
    id: "Daftar lowongan",
    "id-simple": "Daftar lowongan",
  },
  "admin.jobs.kolom.judul": {
    id: "Judul",
    "id-simple": "Judul",
  },
  "admin.jobs.kolom.perusahaan": {
    id: "Perusahaan",
    "id-simple": "Perusahaan",
  },
  "admin.jobs.kolom.perusahaanTakDikenal": {
    // Keadaan pagar: `companyId` menunjuk baris yang belum/tidak ada di
    // daftar perusahaan yang sedang di-cache (mis. baru dibuat di tab lain).
    // Kolom tidak boleh kosong tanpa keterangan — sel kosong terbaca screen
    // reader sebagai "tidak ada apa-apa", bukan "namanya belum diketahui".
    id: "Perusahaan tidak dikenali",
    "id-simple": "Nama perusahaan belum diketahui",
  },
  "admin.jobs.kolom.status": {
    id: "Status",
    "id-simple": "Status",
  },
  "admin.jobs.kolom.aksi": {
    id: "Aksi",
    "id-simple": "Aksi",
  },
  "admin.jobs.ubah": {
    id: "Ubah",
    "id-simple": "Ubah",
  },
  "admin.jobs.ubahLabel": {
    id: "Ubah {judul}",
    "id-simple": "Ubah {judul}",
  },
  "admin.jobs.duplikat": {
    id: "Duplikat",
    "id-simple": "Buat salinan",
  },
  "admin.jobs.duplikatLabel": {
    id: "Duplikat {judul}",
    "id-simple": "Buat salinan {judul}",
  },
  "admin.jobs.memuat": {
    id: "Memuat daftar lowongan…",
    "id-simple": "Sebentar, daftar lowongan sedang dibuka…",
  },
  "admin.jobs.gagalMuat": {
    id: "Daftar lowongan belum bisa ditampilkan.",
    "id-simple": "Daftar lowongan gagal dibuka.",
  },
  "admin.jobs.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Coba lagi",
  },
  "admin.jobs.kosong.judul": {
    id: "Belum ada lowongan",
    "id-simple": "Belum ada lowongan",
  },
  "admin.jobs.kosong.penjelasan": {
    id: "Tambahkan lowongan pertama untuk mulai menerima lamaran.",
    "id-simple": "Tambah lowongan pertama Anda di sini.",
  },

  "admin.jobs.filterStatus.label": {
    id: "Saring berdasarkan status",
    "id-simple": "Tampilkan lowongan dengan status",
  },
  "admin.jobs.filterStatus.semua": {
    id: "Semua status",
    "id-simple": "Semua",
  },
  "admin.jobs.filterStatus.draft": {
    id: "Draf",
    "id-simple": "Belum selesai (draf)",
  },
  "admin.jobs.filterStatus.published": {
    id: "Diterbitkan",
    "id-simple": "Sudah terbit",
  },
  "admin.jobs.filterStatus.closed": {
    id: "Ditutup",
    "id-simple": "Sudah ditutup",
  },

  "admin.jobs.status.draft": {
    id: "Draf",
    "id-simple": "Belum selesai (draf)",
  },
  "admin.jobs.status.published": {
    id: "Diterbitkan",
    "id-simple": "Sudah terbit",
  },
  "admin.jobs.status.closed": {
    id: "Ditutup",
    "id-simple": "Sudah ditutup",
  },

  "admin.jobs.form.judulBuat": {
    id: "Tambah lowongan",
    "id-simple": "Tambah lowongan",
  },
  "admin.jobs.form.judulUbah": {
    id: "Ubah {judul}",
    "id-simple": "Ubah {judul}",
  },
  "admin.jobs.form.tidakDitemukan": {
    id: "Lowongan itu tidak ditemukan.",
    "id-simple": "Lowongan itu tidak ada.",
  },
  "admin.jobs.form.kembaliKeDaftar": {
    id: "Kembali ke daftar lowongan",
    "id-simple": "Kembali ke daftar lowongan",
  },
  "admin.jobs.form.bagianDasar": {
    id: "Informasi dasar",
    "id-simple": "Informasi dasar",
  },
  "admin.jobs.form.perusahaan": {
    id: "Perusahaan",
    "id-simple": "Perusahaan",
  },
  "admin.jobs.form.perusahaanPlaceholder": {
    id: "Pilih perusahaan",
    "id-simple": "Pilih perusahaan",
  },
  "admin.jobs.form.perusahaanTakBisaDiubah": {
    id: "Perusahaan tidak bisa diubah setelah lowongan dibuat.",
    "id-simple": "Anda tidak bisa mengganti perusahaan lowongan yang sudah dibuat.",
  },
  "admin.jobs.form.judul": {
    id: "Judul lowongan",
    "id-simple": "Judul lowongan",
  },
  "admin.jobs.form.deskripsi": {
    id: "Deskripsi",
    "id-simple": "Cerita tentang pekerjaan ini",
  },
  "admin.jobs.form.persyaratan": {
    id: "Persyaratan",
    "id-simple": "Syarat yang dicari",
  },
  "admin.jobs.form.persyaratanBantuan": {
    id: "Opsional — tuliskan kualifikasi atau pengalaman yang dicari.",
    "id-simple": "Boleh dikosongkan. Tulis di sini kalau ada syarat khusus.",
  },
  "admin.jobs.form.jenisPekerjaanLabel": {
    id: "Jenis pekerjaan",
    "id-simple": "Jenis pekerjaan",
  },
  "admin.jobs.form.jenisPekerjaan.fullTime": {
    id: "Penuh waktu",
    "id-simple": "Kerja penuh waktu",
  },
  "admin.jobs.form.jenisPekerjaan.partTime": {
    id: "Paruh waktu",
    "id-simple": "Kerja paruh waktu",
  },
  "admin.jobs.form.jenisPekerjaan.contract": {
    id: "Kontrak",
    "id-simple": "Kerja kontrak",
  },
  "admin.jobs.form.jenisPekerjaan.internship": {
    id: "Magang",
    "id-simple": "Magang",
  },
  "admin.jobs.form.jenisPekerjaan.freelance": {
    id: "Lepas (freelance)",
    "id-simple": "Kerja lepas, tidak terikat kantor",
  },
  "admin.jobs.form.bagianLokasi": {
    id: "Lokasi dan mode kerja",
    "id-simple": "Lokasi dan cara kerja",
  },
  "admin.jobs.form.modeKerjaLabel": {
    id: "Mode kerja",
    "id-simple": "Cara kerja",
  },
  "admin.jobs.form.modeKerja.onsite": {
    id: "Di kantor (on-site)",
    "id-simple": "Kerja di kantor",
  },
  "admin.jobs.form.modeKerja.hybrid": {
    id: "Campuran (hybrid)",
    "id-simple": "Kadang di kantor, kadang di rumah",
  },
  "admin.jobs.form.modeKerja.remote": {
    id: "Jarak jauh (remote)",
    "id-simple": "Kerja dari rumah",
  },
  "admin.jobs.form.kota": {
    id: "Kota",
    "id-simple": "Kota",
  },
  "admin.jobs.form.provinsi": {
    id: "Provinsi",
    "id-simple": "Provinsi",
  },
  "admin.jobs.form.bagianGaji": {
    id: "Gaji",
    "id-simple": "Gaji",
  },
  "admin.jobs.form.gajiMin": {
    id: "Gaji minimum (Rp/bulan)",
    "id-simple": "Gaji paling rendah, per bulan (Rupiah)",
  },
  "admin.jobs.form.gajiMax": {
    id: "Gaji maksimum (Rp/bulan)",
    "id-simple": "Gaji paling tinggi, per bulan (Rupiah)",
  },
  "admin.jobs.form.gajiTampil": {
    id: "Tampilkan gaji ke publik",
    "id-simple": "Tunjukkan gaji ke semua orang",
  },
  "admin.jobs.form.gajiTampilBantuan": {
    id: "Bila dimatikan, gaji tersimpan tetapi tidak tampil di halaman lowongan.",
    "id-simple": "Kalau ini dimatikan, gaji tetap tersimpan. Hanya saja tidak ditampilkan.",
  },
  "admin.jobs.form.akomodasiLegenda": {
    id: "Akomodasi untuk posisi ini",
    "id-simple": "Bantuan yang tersedia untuk posisi ini",
  },
  "admin.jobs.form.ragamLegenda": {
    id: "Ragam disabilitas yang disambut",
    "id-simple": "Disabilitas yang boleh melamar posisi ini",
  },
  "admin.jobs.form.simpan": {
    id: "Simpan",
    "id-simple": "Simpan",
  },
  "admin.jobs.form.menyimpan": {
    id: "Menyimpan…",
    "id-simple": "Sebentar, sedang disimpan…",
  },
  "admin.jobs.form.batal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "admin.jobs.form.diubah": {
    id: "Perubahan pada {judul} sudah tersimpan.",
    "id-simple": "Perubahan pada {judul} sudah disimpan.",
  },
  "admin.jobs.galat.periksaKolom": {
    id: "Periksa kembali kolom yang ditandai di bawah.",
    "id-simple": "Cek lagi kolom yang ditandai merah.",
  },
  "admin.jobs.galat.tidakDitemukan": {
    id: "Lowongan ini sudah tidak ada — mungkin dihapus dari tempat lain.",
    "id-simple": "Lowongan ini sudah tidak ada.",
  },

  "admin.jobs.terbitkan.tombol": {
    id: "Terbitkan lowongan ini",
    "id-simple": "Terbitkan, supaya orang bisa melamar",
  },
  "admin.jobs.terbitkan.sedang": {
    id: "Menerbitkan…",
    "id-simple": "Sebentar, sedang diterbitkan…",
  },
  "admin.jobs.terbitkan.akomodasiWajib": {
    // AC PR-057 "Validasi akomodasi wajib sebelum publish (server+client)" —
    // kalimat inilah yang menjelaskan KENAPA tombolnya nonaktif, bukan
    // sekadar membiarkannya abu-abu tanpa keterangan.
    id: "Tambahkan minimal satu akomodasi sebelum bisa menerbitkan lowongan ini.",
    "id-simple": "Anda perlu memilih paling sedikit satu akomodasi dulu, baru bisa terbit.",
  },
  "admin.jobs.terbitkan.berhasil": {
    id: "{judul} sudah diterbitkan.",
    "id-simple": "{judul} sudah terbit.",
  },

  "admin.jobs.tutup.tombol": {
    id: "Tutup lowongan ini",
    "id-simple": "Tutup lowongan ini",
  },
  "admin.jobs.tutup.sedang": {
    id: "Menutup…",
    "id-simple": "Sebentar, sedang ditutup…",
  },
  "admin.jobs.tutup.dialogJudul": {
    id: "Tutup {judul}?",
    "id-simple": "Tutup lowongan {judul}?",
  },
  "admin.jobs.tutup.dialogDeskripsi": {
    // Security Considerations PR-057: "Konfirmasi close (berdampak
    // pelamar)" — kalimat ini yang menyebut dampaknya, pola sama
    // `admin.companies.verifikasi.dialogDeskripsi`.
    id: "Lowongan ini akan hilang dari pencarian publik. Pelamar yang sudah melamar tetap bisa Anda lihat riwayatnya.",
    "id-simple":
      "Orang lain tidak akan melihat lowongan ini lagi. Lamaran yang sudah masuk tetap aman dan bisa Anda buka.",
  },
  "admin.jobs.tutup.dialogYa": {
    id: "Ya, tutup",
    "id-simple": "Ya, tutup",
  },
  "admin.jobs.tutup.dialogBatal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "admin.jobs.tutup.berhasil": {
    id: "{judul} sudah ditutup.",
    "id-simple": "{judul} sudah ditutup. Orang tidak bisa melamar lagi ke lowongan ini.",
  },
  // --- Lamaran (PR-077b) ---
  "admin.nav.lamaran": {
    id: "Lamaran",
    "id-simple": "Lamaran",
  },
  "admin.ringkasan.lamaran.judul": {
    id: "Lamaran",
    "id-simple": "Lamaran",
  },
  "admin.ringkasan.lamaran.penjelasan": {
    id: "Teruskan lamaran ke perusahaan partner dan perbarui statusnya.",
    "id-simple": "Kirim lamaran ke perusahaan. Lalu ubah statusnya.",
  },
  "admin.ringkasan.lamaran.tautan": {
    id: "Kelola lamaran",
    "id-simple": "Buka daftar lamaran",
  },
  "admin.lamaran.judul": {
    id: "Lamaran",
    "id-simple": "Lamaran",
  },
  "admin.lamaran.penjelasan": {
    id: "Teruskan lamaran ke perusahaan partner, lalu perbarui statusnya sesuai kabar dari perusahaan.",
    "id-simple": "Kirim lamaran ke perusahaan. Lalu ubah statusnya sesuai kabar dari perusahaan.",
  },
  "admin.lamaran.filterStatus.label": {
    id: "Saring menurut status",
    "id-simple": "Pilih status",
  },
  "admin.lamaran.filterStatus.semua": {
    id: "Semua status",
    "id-simple": "Semua",
  },
  "admin.lamaran.filterLowongan.label": {
    id: "Saring menurut lowongan",
    "id-simple": "Pilih lowongan",
  },
  "admin.lamaran.filterLowongan.semua": {
    id: "Semua lowongan",
    "id-simple": "Semua",
  },
  "admin.lamaran.tabelJudul": {
    id: "Daftar lamaran",
    "id-simple": "Lamaran yang masuk",
  },
  "admin.lamaran.kolom.pelamar": {
    id: "Pelamar",
    "id-simple": "Pelamar",
  },
  "admin.lamaran.kolom.lowongan": {
    id: "Lowongan",
    "id-simple": "Lowongan",
  },
  "admin.lamaran.kolom.status": {
    id: "Status",
    "id-simple": "Status",
  },
  "admin.lamaran.kolom.diungkap": {
    id: "Data disabilitas",
    "id-simple": "Data disabilitas dikirim?",
  },
  "admin.lamaran.kolom.tanggal": {
    id: "Tanggal melamar",
    "id-simple": "Kapan melamar",
  },
  "admin.lamaran.kolom.aksi": {
    id: "Aksi",
    "id-simple": "Aksi",
  },
  "admin.lamaran.diungkap.ya": {
    id: "Diungkap",
    "id-simple": "Dikirim pelamar",
  },
  "admin.lamaran.diungkap.tidak": {
    id: "Tidak diungkap",
    "id-simple": "Tidak dikirim",
  },
  "admin.lamaran.akunDihapus": {
    id: "Akun sudah dihapus",
    "id-simple": "Akunnya sudah dihapus",
  },
  "admin.lamaran.lowonganTakDikenal": {
    id: "Lowongan tidak dikenal",
    "id-simple": "Lowongan tidak ditemukan",
  },
  "admin.lamaran.lihat": {
    id: "Lihat",
    "id-simple": "Buka",
  },
  "admin.lamaran.lihatLabel": {
    id: "Lihat lamaran {nama}",
    "id-simple": "Buka lamaran {nama}",
  },
  "admin.lamaran.muatLagi": {
    id: "Muat lebih banyak",
    "id-simple": "Tampilkan lagi",
  },
  "admin.lamaran.memuatLagi": {
    id: "Memuat lamaran berikutnya…",
    "id-simple": "Sebentar, lamaran lain sedang dimuat…",
  },
  "admin.lamaran.memuat": {
    id: "Memuat daftar lamaran…",
    "id-simple": "Sebentar, daftar lamaran sedang dimuat…",
  },
  "admin.lamaran.gagalMuat": {
    id: "Daftar lamaran gagal dimuat.",
    "id-simple": "Daftar lamaran tidak bisa dibuka.",
  },
  "admin.lamaran.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Ulangi",
  },
  "admin.lamaran.kosong.judul": {
    id: "Belum ada lamaran",
    "id-simple": "Belum ada yang melamar",
  },
  "admin.lamaran.kosong.penjelasan": {
    id: "Lamaran yang cocok dengan saringan akan tampil di sini.",
    "id-simple": "Kalau ada yang melamar, lamarannya muncul di sini.",
  },
  "admin.lamaran.jumlahTampil": {
    id: "{jumlah} lamaran ditampilkan.",
    "id-simple": "Ada {jumlah} lamaran di layar.",
  },
  "admin.lamaran.status.submitted": {
    id: "Terkirim",
    "id-simple": "Sudah dikirim",
  },
  "admin.lamaran.status.viewed": {
    id: "Dilihat perusahaan",
    "id-simple": "Sudah dilihat perusahaan",
  },
  "admin.lamaran.status.in_review": {
    id: "Sedang ditinjau",
    "id-simple": "Sedang diperiksa",
  },
  "admin.lamaran.status.interview": {
    id: "Undangan wawancara",
    "id-simple": "Diundang wawancara",
  },
  "admin.lamaran.status.offered": {
    id: "Penawaran kerja",
    "id-simple": "Ditawari kerja",
  },
  "admin.lamaran.status.hired": {
    id: "Diterima bekerja",
    "id-simple": "Diterima kerja",
  },
  "admin.lamaran.status.rejected": {
    id: "Belum berhasil",
    "id-simple": "Belum berhasil kali ini",
  },
  "admin.lamaran.status.withdrawn": {
    id: "Dibatalkan pelamar",
    "id-simple": "Dibatalkan oleh pelamar",
  },
  "admin.lamaran.galat.tidakDitemukan": {
    id: "Lamaran ini tidak ditemukan. Mungkin akun pelamarnya sudah dihapus.",
    "id-simple": "Lamaran ini tidak ada lagi.",
  },
  "admin.lamaran.galat.statusBerubah": {
    id: "Status lamaran ini sudah berubah atau sudah akhir. Muat ulang untuk melihat status terbaru.",
    "id-simple": "Statusnya sudah berubah. Muat ulang halaman ini.",
  },
  "admin.lamaran.detail.kembali": {
    id: "Kembali ke daftar lamaran",
    "id-simple": "Kembali ke semua lamaran",
  },
  "admin.lamaran.detail.judul": {
    id: "Lamaran {nama}",
    "id-simple": "Lamaran dari {nama}",
  },
  "admin.lamaran.detail.memuat": {
    id: "Memuat lamaran…",
    "id-simple": "Sebentar, lamaran sedang dimuat…",
  },
  "admin.lamaran.detail.ringkasanJudul": {
    id: "Ringkasan lamaran",
    "id-simple": "Tentang lamaran ini",
  },
  "admin.lamaran.detail.statusSekarang": {
    id: "Status saat ini",
    "id-simple": "Statusnya sekarang",
  },
  "admin.lamaran.detail.lowonganTutup": {
    id: "Lowongan ini sudah ditutup.",
    "id-simple": "Lowongan ini sudah tidak dibuka.",
  },
  "admin.lamaran.detail.terkonfirmasi": {
    id: "Pelamar sudah mengonfirmasi diterima bekerja pada {tanggal}.",
    "id-simple": "Pelamar sudah bilang diterima kerja, tanggal {tanggal}.",
  },
  "admin.lamaran.detail.kontakJudul": {
    id: "Kontak pelamar",
    "id-simple": "Cara menghubungi pelamar",
  },
  "admin.lamaran.detail.nama": {
    id: "Nama",
    "id-simple": "Nama",
  },
  "admin.lamaran.detail.telepon": {
    id: "Nomor HP",
    "id-simple": "Nomor HP",
  },
  "admin.lamaran.detail.email": {
    id: "Email",
    "id-simple": "Email",
  },
  "admin.lamaran.detail.tidakAda": {
    id: "Tidak ada",
    "id-simple": "Tidak diisi",
  },
  "admin.lamaran.detail.cvJudul": {
    id: "CV yang dilampirkan",
    "id-simple": "CV yang dikirim",
  },
  "admin.lamaran.detail.cvTanpa": {
    id: "Lamaran ini tidak melampirkan CV.",
    "id-simple": "Pelamar tidak mengirim CV.",
  },
  "admin.lamaran.detail.cvRingkasan": {
    id: "Ringkasan",
    "id-simple": "Tentang pelamar",
  },
  "admin.lamaran.detail.cvPengalaman": {
    id: "Pengalaman kerja",
    "id-simple": "Pernah bekerja di",
  },
  "admin.lamaran.detail.cvPendidikan": {
    id: "Pendidikan",
    "id-simple": "Sekolah dan kuliah",
  },
  "admin.lamaran.detail.cvKeahlian": {
    id: "Keahlian",
    "id-simple": "Kemampuan",
  },
  "admin.lamaran.detail.riwayatJudul": {
    id: "Riwayat status",
    "id-simple": "Perjalanan lamaran",
  },
  "admin.lamaran.detail.riwayatKosong": {
    id: "Status belum pernah berubah sejak lamaran dikirim.",
    "id-simple": "Statusnya belum pernah berubah.",
  },
  "admin.lamaran.detail.riwayatEntri": {
    id: "{ke}, sebelumnya {dari}. Diubah {oleh} pada {waktu}.",
    "id-simple": "{ke}. Sebelumnya {dari}. Diubah {oleh}, {waktu}.",
  },
  "admin.lamaran.detail.oleh.admin": {
    id: "oleh admin",
    "id-simple": "oleh admin",
  },
  "admin.lamaran.detail.oleh.seeker": {
    id: "oleh pelamar",
    "id-simple": "oleh pelamar",
  },
  "admin.lamaran.ubah.judul": {
    id: "Ubah status",
    "id-simple": "Ganti status",
  },
  "admin.lamaran.ubah.statusBaru": {
    id: "Status baru",
    "id-simple": "Status yang baru",
  },
  "admin.lamaran.ubah.pilihStatus": {
    id: "Pilih status",
    "id-simple": "Pilih salah satu",
  },
  "admin.lamaran.ubah.alasan": {
    id: "Alasan perubahan",
    "id-simple": "Kenapa diubah?",
  },
  "admin.lamaran.ubah.alasanBantuan": {
    id: "Wajib, maksimal 200 karakter. Tercatat di jejak audit dan tidak terlihat pelamar. Jangan tulis nama, nomor, atau kondisi seseorang.",
    "id-simple":
      "Wajib diisi, paling banyak 200 huruf. Pelamar tidak melihatnya. Jangan tulis nama, nomor HP, atau kondisi orang.",
  },
  "admin.lamaran.ubah.simpan": {
    id: "Simpan status",
    "id-simple": "Simpan",
  },
  "admin.lamaran.ubah.menyimpan": {
    id: "Menyimpan status…",
    "id-simple": "Sebentar, sedang disimpan…",
  },
  "admin.lamaran.ubah.berhasil": {
    id: "Status diubah menjadi {status}. Pelamar sudah dikabari.",
    "id-simple": "Status sekarang {status}. Pelamar sudah diberi tahu.",
  },
  "admin.lamaran.ubah.akhir": {
    id: "Status ini sudah akhir dan tidak bisa diubah lagi.",
    "id-simple": "Status ini sudah selesai. Tidak bisa diganti lagi.",
  },
  "admin.lamaran.ubah.galat.statusKosong": {
    id: "Pilih status baru.",
    "id-simple": "Pilih dulu status barunya.",
  },
  "admin.lamaran.ubah.galat.alasanKosong": {
    id: "Tulis alasan perubahan.",
    "id-simple": "Tulis dulu alasannya.",
  },
  "admin.lamaran.ubah.galat.alasanPanjang": {
    id: "Alasan maksimal 200 karakter.",
    "id-simple": "Alasan paling banyak 200 huruf.",
  },
  "admin.lamaran.ungkap.galat.alasanKosong": {
    id: "Tulis alasan membuka data ini.",
    "id-simple": "Tulis dulu kenapa data ini dibuka.",
  },
  "admin.lamaran.ungkap.judul": {
    id: "Data disabilitas yang diungkap",
    "id-simple": "Data disabilitas dari pelamar",
  },
  "admin.lamaran.ungkap.tidakDiungkap": {
    id: "Pelamar memilih tidak mengungkap data disabilitas pada lamaran ini. Teruskan lamaran tanpa data tersebut.",
    "id-simple":
      "Pelamar tidak mengirim data disabilitas. Hormati pilihannya. Kirim lamaran tanpa data itu.",
  },
  "admin.lamaran.ungkap.tersembunyi": {
    id: "Pelamar mengungkap data disabilitasnya untuk lamaran ini. Data disembunyikan sampai Anda membukanya dengan alasan.",
    "id-simple":
      "Pelamar mengirim data disabilitas. Data ini tertutup. Buka hanya kalau perlu, dan tulis alasannya.",
  },
  "admin.lamaran.ungkap.tombol": {
    id: "Tampilkan data yang diungkap",
    "id-simple": "Buka data disabilitas",
  },
  "admin.lamaran.ungkap.dialogJudul": {
    id: "Buka data disabilitas pelamar",
    "id-simple": "Buka data disabilitas?",
  },
  "admin.lamaran.ungkap.dialogDeskripsi": {
    id: "Pembukaan ini dicatat beserta akun Anda dan alasannya. Buka hanya bila diperlukan untuk meneruskan lamaran.",
    "id-simple": "Kami mencatat siapa yang membuka dan alasannya. Buka hanya kalau perlu.",
  },
  "admin.lamaran.ungkap.alasan": {
    id: "Alasan membuka",
    "id-simple": "Kenapa dibuka?",
  },
  "admin.lamaran.ungkap.buka": {
    id: "Buka data",
    "id-simple": "Buka",
  },
  "admin.lamaran.ungkap.batal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "admin.lamaran.ungkap.membuka": {
    id: "Membuka data…",
    "id-simple": "Sebentar…",
  },
  "admin.lamaran.ungkap.ragam": {
    id: "Ragam disabilitas",
    "id-simple": "Jenis disabilitas",
  },
  "admin.lamaran.ungkap.akomodasi": {
    id: "Kebutuhan akomodasi",
    "id-simple": "Bantuan yang dibutuhkan",
  },
  "admin.lamaran.ungkap.catatan": {
    id: "Catatan pelamar",
    "id-simple": "Catatan dari pelamar",
  },
  "admin.lamaran.ungkap.diambil": {
    id: "Diungkap pada {tanggal}.",
    "id-simple": "Dikirim tanggal {tanggal}.",
  },
  "admin.lamaran.ungkap.kosong": {
    id: "Tidak ada",
    "id-simple": "Tidak diisi",
  },
  "admin.lamaran.ungkap.sembunyikan": {
    id: "Sembunyikan lagi",
    "id-simple": "Tutup lagi",
  },
  "admin.lamaran.ungkap.terbuka": {
    id: "Data disabilitas ditampilkan.",
    "id-simple": "Data disabilitas sekarang terlihat.",
  },
  // ---------------------------------------------------------------------
  // Dasbor metrik pilot (PR-081). Label tile menyebut periodenya sendiri —
  // screen reader yang melompat ke satu tile tidak perlu mencari konteks.
  // ---------------------------------------------------------------------
  "admin.metrik.judul": { id: "Kesehatan pilot", "id-simple": "Keadaan program sekarang" },
  "admin.metrik.memuat": { id: "Memuat metrik…", "id-simple": "Angka sedang dimuat…" },
  "admin.metrik.gagal": {
    id: "Metrik belum bisa ditampilkan.",
    "id-simple": "Angka gagal dimuat.",
  },
  "admin.metrik.cobaLagi": { id: "Coba lagi", "id-simple": "Ulangi" },
  "admin.metrik.periode.legend": { id: "Periode", "id-simple": "Rentang waktu" },
  "admin.metrik.periode.7d": { id: "7 hari terakhir", "id-simple": "Seminggu ini" },
  "admin.metrik.periode.30d": { id: "30 hari terakhir", "id-simple": "Sebulan ini" },
  "admin.metrik.periode.semua": { id: "Sepanjang waktu", "id-simple": "Semua waktu" },
  "admin.metrik.periodeLalu.7d": { id: "7 hari sebelumnya", "id-simple": "minggu lalu" },
  "admin.metrik.periodeLalu.30d": { id: "30 hari sebelumnya", "id-simple": "bulan lalu" },
  "admin.metrik.labelPeriode": { id: "{label}, {periode}", "id-simple": "{label} ({periode})" },
  "admin.metrik.dataPer": {
    id: "Data per {waktu} WIB. Diperbarui otomatis tiap 5 menit.",
    "id-simple": "Angka dari {waktu} WIB. Berganti sendiri tiap 5 menit.",
  },
  "admin.metrik.segarkan": { id: "Perbarui sekarang", "id-simple": "Muat ulang angka" },
  "admin.metrik.menyegarkan": { id: "Memperbarui…", "id-simple": "Sedang dimuat…" },
  "admin.metrik.tren.naik": {
    id: "Naik {selisih} dibanding {pembanding} ({lalu})",
    "id-simple": "Bertambah {selisih} dari {pembanding} ({lalu})",
  },
  "admin.metrik.tren.turun": {
    id: "Turun {selisih} dibanding {pembanding} ({lalu})",
    "id-simple": "Berkurang {selisih} dari {pembanding} ({lalu})",
  },
  "admin.metrik.tren.sama": {
    id: "Sama dengan {pembanding} ({lalu})",
    "id-simple": "Tidak berubah dari {pembanding} ({lalu})",
  },
  "admin.metrik.funnel.judul": {
    id: "Perjalanan pencari kerja",
    "id-simple": "Langkah pencari kerja",
  },
  "admin.metrik.funnel.penjelasan": {
    id: "Pencari kerja yang mendaftar dalam periode ini, dan berapa yang sudah mencapai tiap langkah. Langkah diukur terpisah, jadi angkanya tidak selalu menurun.",
    "id-simple":
      "Orang yang daftar di rentang ini, dan sampai mana mereka. Tiap langkah dihitung sendiri.",
  },
  "admin.metrik.tahap.registered": { id: "Pendaftar baru", "id-simple": "Orang baru daftar" },
  "admin.metrik.tahap.profileReady": {
    id: "Profil siap dicocokkan",
    "id-simple": "Profil sudah siap",
  },
  "admin.metrik.tahap.applied": { id: "Sudah melamar", "id-simple": "Sudah kirim lamaran" },
  "admin.metrik.tahap.interviewed": {
    id: "Sampai wawancara",
    "id-simple": "Sudah diwawancara",
  },
  "admin.metrik.tahap.hired": {
    id: "Diterima bekerja (dikonfirmasi)",
    "id-simple": "Sudah dapat kerja",
  },
  "admin.metrik.northStar.judul": {
    id: "Penempatan kerja dan antrean",
    "id-simple": "Orang dapat kerja dan antrean",
  },
  "admin.metrik.northStar.periode": {
    id: "Konfirmasi diterima bekerja",
    "id-simple": "Orang bilang sudah dapat kerja",
  },
  "admin.metrik.northStar.total": {
    id: "Konfirmasi diterima bekerja, sepanjang waktu",
    "id-simple": "Semua orang yang sudah dapat kerja",
  },
  "admin.metrik.dlq.label": {
    id: "Pekerjaan gagal di antrean (DLQ)",
    "id-simple": "Tugas sistem yang gagal",
  },
  "admin.metrik.dlq.takTerbaca": { id: "Tidak terbaca", "id-simple": "Tidak bisa dicek" },
  "admin.metrik.dlq.catatan": {
    id: "Angka di atas 0 perlu diperiksa tim teknis.",
    "id-simple": "Kalau lebih dari 0, beri tahu tim teknis.",
  },
  "admin.metrik.ai.judul": { id: "Pemakaian AI", "id-simple": "Pemakaian bantuan AI" },
  "admin.metrik.ai.kosong": {
    id: "Belum ada pemakaian AI dalam periode ini.",
    "id-simple": "AI belum dipakai di rentang ini.",
  },
  "admin.metrik.ai.caption": {
    id: "Pemakaian AI per fitur sejak {sejak} WIB (data mentah disimpan 90 hari).",
    "id-simple": "Pemakaian AI sejak {sejak} WIB. Data disimpan 90 hari.",
  },
  "admin.metrik.ai.kolom.fitur": { id: "Fitur", "id-simple": "Fitur AI" },
  "admin.metrik.ai.kolom.permintaan": { id: "Permintaan", "id-simple": "Jumlah pakai" },
  "admin.metrik.ai.kolom.tokenMasuk": { id: "Token masuk", "id-simple": "Token dikirim" },
  "admin.metrik.ai.kolom.tokenKeluar": { id: "Token keluar", "id-simple": "Token diterima" },
  "admin.metrik.ai.cv_chat": { id: "Obrolan CV", "id-simple": "Ngobrol buat CV" },
  "admin.metrik.ai.cv_finalize": { id: "Penyusunan CV", "id-simple": "Menyusun CV" },
  "admin.metrik.ai.cv_check": { id: "Pemeriksa CV", "id-simple": "Cek CV" },
  "admin.metrik.ai.simplify_text": { id: "Penyederhana teks", "id-simple": "Membuat teks mudah" },
  "admin.metrik.ai.interview_sim": { id: "Simulasi wawancara", "id-simple": "Latihan wawancara" },
  "admin.metrik.ai.rerank": { id: "Urutan rekomendasi", "id-simple": "Mengurutkan saran kerja" },
  "admin.metrik.ai.embed": { id: "Vektor profil & lowongan", "id-simple": "Data pencocokan" },
  "admin.metrik.ai.lainnya": { id: "Fitur lain", "id-simple": "Lainnya" },
  // ---------------------------------------------------------------------
  // Moderasi akun (PR-083b). Alasan = catatan INTERNAL: tidak pernah
  // ditampilkan ke pengguna yang ditangguhkan (keputusan owner 2026-10-03).
  // ---------------------------------------------------------------------
  "admin.nav.pengguna": { id: "Pengguna", "id-simple": "Akun pengguna" },
  "admin.ringkasan.pengguna.judul": { id: "Pengguna", "id-simple": "Akun pengguna" },
  "admin.ringkasan.pengguna.penjelasan": {
    id: "Cari akun dan tangguhkan pencari kerja yang menyalahgunakan Nawasena.",
    "id-simple": "Cari akun. Hentikan sementara akun yang disalahgunakan.",
  },
  "admin.ringkasan.pengguna.tautan": { id: "Buka pengguna", "id-simple": "Lihat akun" },
  "admin.pengguna.judul": { id: "Pengguna", "id-simple": "Akun pengguna" },
  "admin.pengguna.penjelasan": {
    id: "Akun yang ditangguhkan tidak bisa masuk sampai dipulihkan. Datanya tidak dihapus. Hanya akun pencari kerja yang bisa ditangguhkan.",
    "id-simple":
      "Akun yang dihentikan tidak bisa masuk sampai dibuka lagi. Datanya tetap ada. Hanya akun pencari kerja.",
  },
  "admin.pengguna.cari.label": { id: "Cari pengguna", "id-simple": "Cari akun" },
  "admin.pengguna.cari.bantuan": {
    id: "Nama, nomor HP, atau email — sebagian saja juga bisa.",
    "id-simple": "Ketik nama, nomor HP, atau email.",
  },
  "admin.pengguna.cari.tombol": { id: "Cari", "id-simple": "Cari akun" },
  "admin.pengguna.filterStatus.label": { id: "Status akun", "id-simple": "Keadaan akun" },
  "admin.pengguna.filterStatus.semua": { id: "Semua status", "id-simple": "Semua akun" },
  "admin.pengguna.status.aktif": { id: "Aktif", "id-simple": "Bisa dipakai" },
  "admin.pengguna.status.ditangguhkan": { id: "Ditangguhkan", "id-simple": "Dihentikan sementara" },
  "admin.pengguna.status.ditangguhkanSejak": {
    id: "Ditangguhkan sejak {tanggal}",
    "id-simple": "Dihentikan sejak {tanggal}",
  },
  "admin.pengguna.alasanTercatat": { id: "Alasan: {alasan}", "id-simple": "Sebab: {alasan}" },
  "admin.pengguna.peran.seeker": { id: "Pencari kerja", "id-simple": "Pencari kerja (pelamar)" },
  "admin.pengguna.peran.admin": { id: "Admin", "id-simple": "Admin Nawasena" },
  "admin.pengguna.kolom.nama": { id: "Nama", "id-simple": "Nama orang" },
  "admin.pengguna.kolom.kontak": { id: "Kontak", "id-simple": "HP / email" },
  "admin.pengguna.kolom.peran": { id: "Peran", "id-simple": "Jenis akun" },
  "admin.pengguna.kolom.status": { id: "Status", "id-simple": "Keadaan" },
  "admin.pengguna.kolom.aksi": { id: "Aksi", "id-simple": "Tindakan" },
  "admin.pengguna.tabelJudul": { id: "Daftar pengguna", "id-simple": "Semua akun" },
  "admin.pengguna.tanpaNama": { id: "(nama belum diisi)", "id-simple": "(belum ada nama)" },
  "admin.pengguna.tanpaKontak": { id: "—", "id-simple": "Tidak ada" },
  "admin.pengguna.tanpaAksi": { id: "—", "id-simple": "Tidak bisa diubah" },
  "admin.pengguna.memuat": { id: "Memuat pengguna…", "id-simple": "Sedang membuka akun…" },
  "admin.pengguna.gagalMuat": {
    id: "Daftar pengguna belum bisa ditampilkan.",
    "id-simple": "Akun gagal dibuka.",
  },
  "admin.pengguna.cobaLagi": { id: "Coba lagi", "id-simple": "Ulangi" },
  "admin.pengguna.kosong": {
    id: "Tidak ada pengguna yang cocok dengan pencarian ini.",
    "id-simple": "Tidak ada akun yang cocok.",
  },
  "admin.pengguna.muatLagi": { id: "Muat lebih banyak", "id-simple": "Tampilkan lagi" },
  "admin.pengguna.memuatLagi": { id: "Memuat…", "id-simple": "Sebentar…" },
  "admin.pengguna.kabar.ditangguhkan": {
    id: "Akun {nama} ditangguhkan. Semua sesinya sudah berakhir.",
    "id-simple": "Akun {nama} dihentikan. Ia sudah keluar dari semua perangkat.",
  },
  "admin.pengguna.kabar.dipulihkan": {
    id: "Akun {nama} dipulihkan. Ia bisa masuk lagi.",
    "id-simple": "Akun {nama} dibuka lagi. Ia bisa masuk.",
  },
  "admin.pengguna.tangguhkan.tombol": {
    id: "Tangguhkan {nama}",
    "id-simple": "Hentikan akun {nama}",
  },
  "admin.pengguna.pulihkan.tombol": { id: "Pulihkan {nama}", "id-simple": "Buka lagi akun {nama}" },
  "admin.pengguna.tangguhkan.judul": {
    id: "Tangguhkan akun {nama}?",
    "id-simple": "Hentikan akun {nama}?",
  },
  "admin.pengguna.pulihkan.judul": {
    id: "Pulihkan akun {nama}?",
    "id-simple": "Buka lagi akun {nama}?",
  },
  "admin.pengguna.tangguhkan.akibat": {
    id: "Semua sesinya langsung berakhir dan ia tidak bisa masuk sampai dipulihkan. Datanya tidak dihapus.",
    "id-simple": "Ia langsung keluar dan tidak bisa masuk sampai dibuka lagi. Datanya tetap ada.",
  },
  "admin.pengguna.pulihkan.akibat": {
    id: "Ia bisa masuk lagi. Sesi lamanya tidak hidup kembali — ia perlu masuk ulang.",
    "id-simple": "Ia bisa masuk lagi. Ia perlu masuk dari awal.",
  },
  "admin.pengguna.langkah1": {
    id: "Langkah 1 dari 2: tulis alasan",
    "id-simple": "Langkah 1 dari 2: tulis sebabnya",
  },
  "admin.pengguna.langkah2": {
    id: "Langkah 2 dari 2: periksa lalu konfirmasi",
    "id-simple": "Langkah 2 dari 2: cek lagi, lalu setujui",
  },
  "admin.pengguna.alasan": {
    id: "Alasan (catatan internal)",
    "id-simple": "Sebab (untuk tim saja)",
  },
  "admin.pengguna.alasanBantuan": {
    id: "Masuk ke jejak audit. Tidak ditampilkan ke pengguna. Jangan tulis nama, nomor, atau kondisi siapa pun — tulis apa yang terjadi, mis. nomor tiket laporan.",
    "id-simple":
      "Disimpan untuk tim. Pengguna tidak melihatnya. Jangan tulis data pribadi. Tulis apa yang terjadi.",
  },
  "admin.pengguna.alasanDicatat": {
    id: "Alasan yang akan dicatat:",
    "id-simple": "Sebab yang disimpan:",
  },
  "admin.pengguna.tangguhkan.tinjau": {
    id: "Anda akan menangguhkan akun {nama}. Semua sesinya berakhir saat ini juga.",
    "id-simple": "Akun {nama} akan dihentikan. Ia langsung keluar.",
  },
  "admin.pengguna.pulihkan.tinjau": {
    id: "Anda akan memulihkan akun {nama}. Ia bisa masuk lagi.",
    "id-simple": "Akun {nama} akan dibuka lagi. Ia bisa masuk.",
  },
  "admin.pengguna.lanjut": { id: "Lanjut", "id-simple": "Lanjut ke langkah 2" },
  "admin.pengguna.kembali": { id: "Kembali ubah alasan", "id-simple": "Kembali" },
  "admin.pengguna.batal": { id: "Batal", "id-simple": "Tidak jadi" },
  "admin.pengguna.tutup": { id: "Tutup", "id-simple": "Tutup jendela ini" },
  "admin.pengguna.menyimpan": { id: "Menyimpan…", "id-simple": "Sedang disimpan…" },
  "admin.pengguna.tangguhkan.ya": { id: "Ya, tangguhkan", "id-simple": "Ya, hentikan" },
  "admin.pengguna.pulihkan.ya": { id: "Ya, pulihkan", "id-simple": "Ya, buka lagi" },
  "admin.pengguna.galat.alasanKosong": {
    id: "Tulis alasannya dulu.",
    "id-simple": "Isi sebabnya dulu.",
  },
  "admin.pengguna.galat.tidakDitemukan": {
    id: "Akun ini sudah tidak ada. Muat ulang daftar pengguna.",
    "id-simple": "Akun tidak ada. Buka lagi daftarnya.",
  },
  "admin.pengguna.galat.statusBerubah": {
    id: "Status akun ini baru saja diubah admin lain. Tutup lalu muat ulang daftar.",
    "id-simple": "Admin lain baru mengubah akun ini. Tutup, lalu buka lagi daftarnya.",
  },
  "admin.pengguna.galat.tidakBisa": {
    id: "Akun ini tidak bisa ditangguhkan. Hanya akun pencari kerja yang bisa.",
    "id-simple": "Akun ini tidak bisa dihentikan. Hanya akun pencari kerja.",
  },
  "admin.lamaran.filterDitangguhkan.label": {
    id: "Tampilkan lamaran dari akun yang ditangguhkan",
    "id-simple": "Tampilkan juga lamaran dari akun yang dihentikan",
  },
  "admin.lamaran.filterDitangguhkan.bantuan": {
    id: "Bawaan: disembunyikan, supaya lamaran dari akun yang ditangguhkan tidak ikut diteruskan.",
    "id-simple": "Biasanya disembunyikan, supaya tidak ikut dikirim ke perusahaan.",
  },
  // --- Kamus video BISINDO (PR-085b) ---
  "admin.ringkasan.kamus.judul": { id: "Kamus BISINDO", "id-simple": "Kamus isyarat" },
  "admin.ringkasan.kamus.penjelasan": {
    id: "Unggah video isyarat beserta caption dan transkripnya, lalu terbitkan.",
    "id-simple": "Unggah video bahasa isyarat, teks di video, dan tulisan isinya. Lalu terbitkan.",
  },
  "admin.ringkasan.kamus.tautan": { id: "Kelola kamus", "id-simple": "Buka kamus isyarat" },
  "admin.kamus.judul": { id: "Kamus BISINDO", "id-simple": "Kamus isyarat" },
  "admin.kamus.penjelasan": {
    id: "Setiap entri baru tampil di kamus publik setelah video, caption, dan transkripnya lengkap lalu diterbitkan.",
    "id-simple":
      "Kata baru muncul untuk umum kalau video, teks di video, dan tulisan isinya sudah ada, lalu Anda terbitkan.",
  },
  "admin.kamus.tambah": { id: "Tambah entri", "id-simple": "Tambah kata baru" },
  "admin.kamus.filterStatus.label": { id: "Status entri", "id-simple": "Keadaan kata" },
  "admin.kamus.filterStatus.semua": { id: "Semua status", "id-simple": "Semua kata" },
  "admin.kamus.filterStatus.draft": { id: "Draf", "id-simple": "Belum terbit" },
  "admin.kamus.filterStatus.published": { id: "Diterbitkan", "id-simple": "Sudah terbit" },
  "admin.kamus.kolom.frasa": { id: "Frasa", "id-simple": "Kata" },
  "admin.kamus.kolom.kategori": { id: "Kategori", "id-simple": "Kelompok" },
  "admin.kamus.kolom.status": { id: "Status", "id-simple": "Keadaan" },
  "admin.kamus.kolom.kelengkapan": { id: "Kelengkapan", "id-simple": "Yang sudah ada" },
  "admin.kamus.kolom.aksi": { id: "Aksi", "id-simple": "Tindakan" },
  "admin.kamus.tanpaKategori": { id: "—", "id-simple": "Belum ada kelompok" },
  "admin.kamus.kategori.salam": { id: "Salam", "id-simple": "Salam (sapaan)" },
  "admin.kamus.kategori.perkenalan": { id: "Perkenalan", "id-simple": "Kenalan" },
  "admin.kamus.kategori.wawancara": {
    id: "Wawancara kerja",
    "id-simple": "Wawancara (tanya jawab kerja)",
  },
  "admin.kamus.kategori.tempat_kerja": { id: "Tempat kerja", "id-simple": "Di kantor" },
  "admin.kamus.kategori.akomodasi": { id: "Akomodasi", "id-simple": "Bantuan di tempat kerja" },
  "admin.kamus.kategori.waktu": { id: "Waktu", "id-simple": "Jam dan hari" },
  "admin.kamus.kategori.angka": { id: "Angka", "id-simple": "Angka (bilangan)" },
  "admin.kamus.kategori.umum": { id: "Umum", "id-simple": "Lain-lain" },
  "admin.kamus.lengkap": { id: "Lengkap, siap terbit", "id-simple": "Sudah lengkap" },
  "admin.kamus.kurangDaftar": { id: "Kurang: {daftar}", "id-simple": "Belum ada: {daftar}" },
  "admin.kamus.kurang.video": { id: "video", "id-simple": "video isyarat" },
  "admin.kamus.kurang.caption": { id: "caption (.vtt)", "id-simple": "teks di video (.vtt)" },
  "admin.kamus.kurang.transkrip": { id: "transkrip", "id-simple": "tulisan isi video" },
  "admin.kamus.ubah": { id: "Ubah", "id-simple": "Ubah kata" },
  "admin.kamus.ubahLabel": { id: "Ubah entri {frasa}", "id-simple": "Ubah kata {frasa}" },
  "admin.kamus.memuat": { id: "Memuat kamus…", "id-simple": "Sedang membuka kamus…" },
  "admin.kamus.gagalMuat": {
    id: "Kamus belum bisa dimuat.",
    "id-simple": "Kamus belum bisa dibuka.",
  },
  "admin.kamus.cobaLagi": { id: "Coba lagi", "id-simple": "Ulangi" },
  "admin.kamus.tabelJudul": { id: "Daftar entri kamus", "id-simple": "Semua kata di kamus" },
  "admin.kamus.kosong.judul": { id: "Belum ada entri", "id-simple": "Kamus masih kosong" },
  "admin.kamus.kosong.penjelasan": {
    id: "Tekan “Tambah entri” untuk membuat entri pertama.",
    "id-simple": "Tekan “Tambah entri” untuk menambah kata pertama.",
  },
  "admin.kamus.galat.tidakDitemukan": {
    id: "Entri ini tidak ditemukan. Mungkin sudah tidak ada di daftar.",
    "id-simple": "Kata ini tidak ada. Kembali ke daftar kamus.",
  },
  "admin.kamus.galat.storageBelumSiap": {
    id: "Penyimpanan berkas belum siap di server. Hubungi tim teknis.",
    "id-simple": "Tempat simpan berkas belum siap. Hubungi tim teknis.",
  },
  "admin.kamus.form.judulBuat": { id: "Tambah entri kamus", "id-simple": "Tambah kata baru" },
  "admin.kamus.form.judulUbah": { id: "Ubah entri: {frasa}", "id-simple": "Ubah kata: {frasa}" },
  "admin.kamus.form.disimpan": {
    id: "Entri {frasa} tersimpan.",
    "id-simple": "Kata {frasa} sudah disimpan.",
  },
  "admin.kamus.form.periksaKolom": {
    id: "Ada isian yang perlu diperbaiki. Periksa kolom bertanda merah.",
    "id-simple": "Ada isian yang salah. Lihat kolom yang merah.",
  },
  "admin.kamus.form.kembali": { id: "Kembali ke daftar kamus", "id-simple": "Kembali ke kamus" },
  "admin.kamus.form.bagianIsi": { id: "Isi entri", "id-simple": "Kata dan isinya" },
  "admin.kamus.form.frasa": { id: "Frasa", "id-simple": "Kata atau kalimat" },
  "admin.kamus.form.kategori": { id: "Kategori", "id-simple": "Kelompok" },
  "admin.kamus.form.kategoriPlaceholder": { id: "Pilih kategori", "id-simple": "Pilih kelompok" },
  "admin.kamus.form.transkrip": { id: "Transkrip", "id-simple": "Tulisan isi video" },
  "admin.kamus.form.transkripBantuan": {
    id: "Jelaskan isi video dalam kalimat, termasuk gerakan isyaratnya. Wajib sebelum terbit.",
    "id-simple": "Tulis isi video, juga gerakan tangannya. Harus diisi sebelum terbit.",
  },
  "admin.kamus.form.simpan": { id: "Simpan", "id-simple": "Simpan isian" },
  "admin.kamus.form.menyimpan": { id: "Menyimpan…", "id-simple": "Sedang menyimpan…" },
  "admin.kamus.form.batal": { id: "Batal", "id-simple": "Batal, kembali" },
  "admin.kamus.form.bagianMedia": { id: "Berkas media", "id-simple": "Berkas video dan teks" },
  "admin.kamus.form.mediaPenjelasan": {
    id: "Setiap berkas diunggah sendiri-sendiri. Bila satu gagal, yang lain tidak perlu diulang.",
    "id-simple": "Unggah berkas satu per satu. Kalau satu gagal, yang lain tetap aman.",
  },
  "admin.kamus.terbitkan.tombol": { id: "Terbitkan", "id-simple": "Terbitkan untuk umum" },
  "admin.kamus.terbitkan.sedang": { id: "Menerbitkan…", "id-simple": "Sedang menerbitkan…" },
  "admin.kamus.terbitkan.berhasil": {
    id: "{frasa} sudah terbit di kamus publik.",
    "id-simple": "{frasa} sekarang bisa dilihat semua orang.",
  },
  "admin.kamus.terbitkan.syarat": {
    id: "Belum bisa terbit. Lengkapi dulu: {daftar}.",
    "id-simple": "Belum bisa terbit. Yang belum ada: {daftar}.",
  },
  "admin.kamus.tarik.tombol": { id: "Tarik ke draf", "id-simple": "Sembunyikan dari umum" },
  "admin.kamus.tarik.sedang": { id: "Menarik…", "id-simple": "Sedang menyembunyikan…" },
  "admin.kamus.tarik.berhasil": {
    id: "{frasa} ditarik ke draf dan tidak lagi tampil di kamus publik.",
    "id-simple": "{frasa} sudah disembunyikan dari umum.",
  },
  "admin.kamus.tarik.dialogJudul": {
    id: "Tarik {frasa} ke draf?",
    "id-simple": "Sembunyikan {frasa}?",
  },
  "admin.kamus.tarik.dialogDeskripsi": {
    id: "Entri ini langsung hilang dari kamus publik. Video, caption, dan transkrip tetap tersimpan, jadi bisa diterbitkan lagi.",
    "id-simple":
      "Kata ini langsung hilang untuk umum. Berkasnya tidak dihapus. Anda bisa menerbitkannya lagi.",
  },
  "admin.kamus.tarik.dialogYa": { id: "Ya, tarik ke draf", "id-simple": "Ya, sembunyikan" },
  "admin.kamus.tarik.dialogBatal": { id: "Batal", "id-simple": "Jangan sembunyikan" },
  "admin.kamus.unggah.label.video": { id: "Video isyarat", "id-simple": "Video bahasa isyarat" },
  "admin.kamus.unggah.label.caption": { id: "Caption (.vtt)", "id-simple": "Teks di video (.vtt)" },
  "admin.kamus.unggah.label.thumbnail": {
    id: "Gambar sampul",
    "id-simple": "Gambar kecil untuk daftar",
  },
  "admin.kamus.unggah.bantuan.video": {
    id: "MP4 atau WebM, maksimal 50 MB. Disarankan 720p, H.264, tanpa suara.",
    "id-simple": "Berkas MP4 atau WebM. Paling besar 50 MB.",
  },
  "admin.kamus.unggah.bantuan.caption": {
    id: "Berkas WebVTT (.vtt), maksimal 200 KB. Wajib sebelum terbit.",
    "id-simple": "Berkas .vtt, paling besar 200 KB. Harus ada sebelum terbit.",
  },
  "admin.kamus.unggah.bantuan.thumbnail": {
    id: "JPG, PNG, atau WebP, maksimal 1 MB. Boleh dikosongkan.",
    "id-simple": "Gambar JPG, PNG, atau WebP, paling besar 1 MB. Boleh tidak ada.",
  },
  "admin.kamus.unggah.belumAda": { id: "Belum ada berkas.", "id-simple": "Berkas belum diunggah." },
  "admin.kamus.unggah.sudahAda": { id: "Tersimpan: {nama}", "id-simple": "Sudah ada: {nama}" },
  "admin.kamus.unggah.mulai": { id: "Mengunggah {label}…", "id-simple": "{label} mulai dikirim…" },
  "admin.kamus.unggah.progres": {
    id: "Mengunggah {label}: {persen}%",
    "id-simple": "{label} sudah terkirim {persen} persen",
  },
  "admin.kamus.unggah.progresLabel": {
    id: "Kemajuan unggah {label}",
    "id-simple": "Seberapa jauh {label} terkirim",
  },
  "admin.kamus.unggah.menyimpan": {
    id: "{label} terunggah. Menyimpan…",
    "id-simple": "{label} sudah terkirim. Sedang disimpan…",
  },
  "admin.kamus.unggah.berhasil": {
    id: "{label} tersimpan.",
    "id-simple": "{label} sudah disimpan.",
  },
  "admin.kamus.unggah.batal": { id: "Batalkan", "id-simple": "Hentikan" },
  "admin.kamus.unggah.batalLabel": {
    id: "Batalkan unggah {label}",
    "id-simple": "Hentikan kirim {label}",
  },
  "admin.kamus.unggah.cobaLagi": { id: "Coba lagi", "id-simple": "Kirim ulang" },
  "admin.kamus.unggah.cobaLagiLabel": {
    id: "Coba unggah {label} lagi",
    "id-simple": "Kirim ulang {label}",
  },
  "admin.kamus.unggah.gagal.jaringan": {
    id: "{label} gagal diunggah karena koneksi terputus. Periksa internet, lalu coba lagi.",
    "id-simple": "{label} gagal dikirim. Internet terputus. Cek internet, lalu kirim ulang.",
  },
  "admin.kamus.unggah.gagal.ditolak": {
    id: "Penyimpanan menolak {label}. Izin unggah mungkin kedaluwarsa — coba lagi.",
    "id-simple": "{label} ditolak tempat simpan. Coba kirim ulang.",
  },
  "admin.kamus.unggah.gagal.dibatalkan": {
    id: "Unggah {label} dibatalkan.",
    "id-simple": "Kirim {label} dihentikan.",
  },
  "admin.kamus.unggah.galat.kosong": {
    id: "Berkas ini kosong. Pilih berkas lain.",
    "id-simple": "Berkas ini tidak ada isinya. Pilih yang lain.",
  },
  "admin.kamus.unggah.galat.tipe.video": {
    id: "Video harus berformat MP4 atau WebM.",
    "id-simple": "Video harus MP4 atau WebM.",
  },
  "admin.kamus.unggah.galat.tipe.caption": {
    id: "Caption harus berkas WebVTT (.vtt).",
    "id-simple": "Teks di video harus berkas .vtt.",
  },
  "admin.kamus.unggah.galat.tipe.thumbnail": {
    id: "Gambar sampul harus JPG, PNG, atau WebP.",
    "id-simple": "Gambar harus JPG, PNG, atau WebP.",
  },
  "admin.kamus.unggah.galat.ukuran.video": {
    id: "Video lebih dari 50 MB. Kompres dulu (720p, H.264), lalu unggah lagi.",
    "id-simple": "Video terlalu besar (lebih dari 50 MB). Perkecil dulu.",
  },
  "admin.kamus.unggah.galat.ukuran.caption": {
    id: "Caption lebih dari 200 KB. Periksa apakah berkasnya benar.",
    "id-simple": "Berkas teks terlalu besar. Cek lagi berkasnya.",
  },
  "admin.kamus.unggah.galat.ukuran.thumbnail": {
    id: "Gambar sampul lebih dari 1 MB. Perkecil dulu, lalu unggah lagi.",
    "id-simple": "Gambar terlalu besar (lebih dari 1 MB). Perkecil dulu.",
  },
} as const satisfies KatalogFitur;
