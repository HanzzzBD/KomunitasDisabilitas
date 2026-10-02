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
  "admin.nav.jobs": {
    // Harus SAMA dengan `admin.jobs.judul` — alasan sama dengan `admin.nav.companies`.
    id: "Lowongan",
    "id-simple": "Lowongan",
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
} as const satisfies KatalogFitur;
