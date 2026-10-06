import type { KatalogFitur } from "../tipe.js";
export const katalogAdminCommunity = {
  "admin.nav.community": { id: "Komunitas", "id-simple": "Komunitas" },
  "admin.community.judul": { id: "Ruang komunitas", "id-simple": "Ruang komunitas" },
  "admin.community.queue": { id: "Antrean moderasi", "id-simple": "Laporan yang perlu diperiksa" },
  "admin.community.privacy": {
    id: "Periksa isi dan alasan laporan. Identitas pelapor, profil karier, CV, dan lamaran tidak ditampilkan.",
    "id-simple": "Periksa tulisan dan alasan laporan. Data pribadi pelapor tidak ditampilkan.",
  },
  "admin.community.baru": { id: "Buat ruang", "id-simple": "Buat ruang" },
  "admin.community.edit": { id: "Ubah ruang", "id-simple": "Ubah ruang" },
  "admin.community.kembali": { id: "Kembali ke daftar", "id-simple": "Kembali ke daftar" },
  "admin.community.nama": { id: "Nama ruang", "id-simple": "Nama ruang" },
  "admin.community.slug": { id: "Slug ruang", "id-simple": "Alamat singkat ruang" },
  "admin.community.slugHelp": {
    id: "Huruf kecil, angka, dan tanda hubung. Mengubah slug juga mengubah tautan ruang.",
    "id-simple":
      "Pakai huruf kecil, angka, dan tanda hubung. Jika diubah, tautan ruang ikut berubah.",
  },
  "admin.community.deskripsi": { id: "Deskripsi ruang", "id-simple": "Penjelasan ruang" },
  "admin.community.jenis": { id: "Jenis ruang", "id-simple": "Jenis ruang" },
  "admin.community.topic": { id: "Topik karier", "id-simple": "Tentang kerja" },
  "admin.community.city": { id: "Kota", "id-simple": "Kota" },
  "admin.community.status": { id: "Status", "id-simple": "Status" },
  "admin.community.semua": { id: "Semua status", "id-simple": "Semua status" },
  "admin.community.active": { id: "Aktif", "id-simple": "Aktif" },
  "admin.community.archived": { id: "Diarsipkan", "id-simple": "Diarsipkan" },
  "admin.community.anggota": {
    id: "{jumlah} anggota aktif",
    "id-simple": "{jumlah} anggota aktif",
  },
  "admin.community.open": { id: "Terbuka", "id-simple": "Belum selesai" },
  "admin.community.resolved": { id: "Diselesaikan", "id-simple": "Sudah selesai" },
  "admin.community.rejected": { id: "Ditolak", "id-simple": "Ditolak" },
  "admin.community.published": { id: "Terbit", "id-simple": "Ditampilkan" },
  "admin.community.hidden": { id: "Disembunyikan", "id-simple": "Disembunyikan" },
  "admin.community.removed": { id: "Dihapus permanen", "id-simple": "Sudah dihapus" },
  "admin.community.post": { id: "Post", "id-simple": "Tulisan" },
  "admin.community.comment": { id: "Komentar", "id-simple": "Komentar" },
  "admin.community.kosong": {
    id: "Tidak ada hasil untuk filter ini.",
    "id-simple": "Tidak ada hasil. Coba pilih status lain.",
  },
  "admin.community.memuat": { id: "Memuat data komunitas…", "id-simple": "Sedang membuka data…" },
  "admin.community.lagi": { id: "Muat lebih banyak", "id-simple": "Lihat lebih banyak" },
  "admin.community.simpan": { id: "Simpan ruang", "id-simple": "Simpan ruang" },
  "admin.community.menyimpan": { id: "Menyimpan…", "id-simple": "Sedang menyimpan…" },
  "admin.community.berhasil": {
    id: "Perubahan berhasil disimpan.",
    "id-simple": "Perubahan sudah disimpan.",
  },
  "admin.community.galat": {
    id: "Data belum dapat dimuat. Coba lagi.",
    "id-simple": "Data belum bisa dibuka. Coba lagi.",
  },
  "admin.community.slugDipakai": {
    id: "Slug ini sudah digunakan ruang lain.",
    "id-simple": "Alamat ini sudah dipakai ruang lain.",
  },
  "admin.community.periksa": {
    id: "Periksa kolom yang ditandai.",
    "id-simple": "Periksa bagian yang ditandai.",
  },
  "admin.community.konflik": {
    id: "Status sudah berubah. Muat ulang data sebelum mengambil keputusan berikutnya.",
    "id-simple": "Data sudah berubah. Buka ulang data sebelum memilih tindakan lagi.",
  },
  "admin.community.coba": { id: "Muat ulang", "id-simple": "Buka ulang" },
  "admin.community.arsip": { id: "Arsipkan ruang", "id-simple": "Arsipkan ruang" },
  "admin.community.aktifkan": { id: "Aktifkan kembali", "id-simple": "Buka kembali" },
  "admin.community.arsipAkibat": {
    id: "Diskusi tetap dapat dibaca. Bergabung, post, dan komentar baru ditutup. Anggota tetap boleh keluar.",
    "id-simple":
      "Tulisan tetap bisa dibaca. Orang tidak bisa bergabung atau menulis. Anggota masih bisa keluar.",
  },
  "admin.community.aktifkanAkibat": {
    id: "Ruang kembali menerima anggota dan tulisan dari anggota aktif.",
    "id-simple": "Orang bisa bergabung lagi. Anggota aktif bisa menulis lagi.",
  },
  "admin.community.konfirmasi": { id: "Konfirmasi keputusan", "id-simple": "Pastikan pilihan" },
  "admin.community.batal": { id: "Batal", "id-simple": "Batal" },
  "admin.community.tutup": { id: "Tutup", "id-simple": "Tutup" },
  "admin.community.detail": { id: "Detail laporan", "id-simple": "Isi laporan" },
  "admin.community.buka": { id: "Periksa laporan", "id-simple": "Buka laporan" },
  "admin.community.urutan": {
    id: "Laporan terlama ditampilkan lebih dahulu.",
    "id-simple": "Laporan yang paling lama ada di atas.",
  },
  "admin.community.dilaporkan": { id: "Dilaporkan pada", "id-simple": "Waktu laporan" },
  "admin.community.ditutup": { id: "Diselesaikan pada", "id-simple": "Waktu selesai" },
  "admin.community.alasanLaporan": { id: "Alasan laporan", "id-simple": "Mengapa dilaporkan" },
  "admin.community.target": {
    id: "Konten yang dilaporkan",
    "id-simple": "Tulisan yang dilaporkan",
  },
  "admin.community.induk": { id: "Post induk", "id-simple": "Tulisan utama" },
  "admin.community.bodyKosong": {
    id: "Teks sudah dikosongkan oleh penulis atau proses penghapusan data.",
    "id-simple": "Teks sudah dikosongkan.",
  },
  "admin.community.retained": {
    id: "Teks berikut disimpan untuk moderasi. Konten ini sudah dihapus dari diskusi dan tidak dapat dipulihkan.",
    "id-simple": "Hanya admin bisa melihat teks ini. Tulisan tidak bisa ditampilkan lagi.",
  },
  "admin.community.hide": { id: "Sembunyikan", "id-simple": "Sembunyikan" },
  "admin.community.restore": { id: "Pulihkan", "id-simple": "Tampilkan lagi" },
  "admin.community.remove": { id: "Hapus permanen", "id-simple": "Hapus selamanya" },
  "admin.community.reject": { id: "Tolak laporan", "id-simple": "Tolak laporan" },
  "admin.community.hideAkibat": {
    id: "Konten disembunyikan dari diskusi. Semua laporan terbuka atas konten ini diselesaikan. Penulis menerima status dan alasan keputusan.",
    "id-simple":
      "Tulisan disembunyikan. Semua laporan tentang tulisan ini selesai. Penulis bisa membaca alasan Anda.",
  },
  "admin.community.restoreAkibat": {
    id: "Konten kembali terbit. Untuk komentar, post induk juga harus terbit agar komentar terlihat. Laporan yang sudah ditutup tetap ditutup.",
    "id-simple":
      "Tulisan ditampilkan lagi. Komentar terlihat jika tulisan utama juga tampil. Laporan lama tetap selesai.",
  },
  "admin.community.removeAkibat": {
    id: "Konten dihapus permanen dari diskusi dan tidak dapat dipulihkan. Teks disimpan untuk admin/audit. Semua laporan terbuka atas konten ini diselesaikan.",
    "id-simple":
      "Tulisan dihapus selamanya dari diskusi. Hanya admin bisa melihat teksnya. Semua laporan tentang tulisan ini selesai.",
  },
  "admin.community.rejectAkibat": {
    id: "Hanya laporan ini ditolak. Status konten dan laporan lain tidak berubah.",
    "id-simple": "Hanya laporan ini ditolak. Tulisan dan laporan lain tetap sama.",
  },
  "admin.community.alasan": { id: "Alasan keputusan", "id-simple": "Mengapa memilih tindakan ini" },
  "admin.community.alasanHelp": {
    id: "Wajib, maksimal 2.000 karakter. Hindari data pribadi. Alasan moderasi dapat dibaca penulis; alasan penolakan dicatat di audit.",
    "id-simple":
      "Wajib diisi. Maksimal 2.000 karakter. Jangan tulis data pribadi. Penulis bisa membaca alasan tindakan pada tulisannya.",
  },
  "admin.community.alasanWajib": {
    id: "Isi alasan keputusan yang valid (1–2.000 karakter).",
    "id-simple": "Isi alasan. Tulis 1 sampai 2.000 karakter.",
  },
  "admin.community.lanjut": { id: "Tinjau keputusan", "id-simple": "Periksa pilihan" },
  "admin.community.kembaliAlasan": { id: "Ubah alasan", "id-simple": "Ubah alasan" },
  "admin.community.aksiBerhasil": {
    id: "Keputusan tercatat. Data telah diperbarui.",
    "id-simple": "Pilihan sudah disimpan. Data sudah diperbarui.",
  },
  "admin.community.metrik": {
    id: "Aktivitas 30 hari terakhir",
    "id-simple": "Kegiatan 30 hari terakhir",
  },
  "admin.community.metrikHelp": {
    id: "Keanggotaan baru yang masih aktif dan tercatat dihitung per akun dan ruang; bukan jumlah orang unik atau riwayat semua join. Post mencakup semua status. Laporan terbuka adalah jumlah saat ini. Waktu resolusi mencakup laporan diselesaikan atau ditolak dalam 30 hari terakhir.",
    "id-simple":
      "Satu orang di dua ruang dihitung dua kali. Anggota yang sudah keluar tidak dihitung. Semua tulisan dihitung. Laporan terbuka adalah jumlah sekarang. Waktu selesai dihitung dari laporan yang selesai atau ditolak dalam 30 hari.",
  },
  "admin.community.newMembers": { id: "Keanggotaan baru", "id-simple": "Anggota baru per ruang" },
  "admin.community.posts": { id: "Post baru", "id-simple": "Tulisan baru" },
  "admin.community.openReports": {
    id: "Laporan terbuka saat ini",
    "id-simple": "Laporan yang belum selesai",
  },
  "admin.community.resolution": {
    id: "Rata-rata waktu resolusi",
    "id-simple": "Rata-rata waktu sampai selesai",
  },
  "admin.community.jam": { id: "{jumlah} jam", "id-simple": "{jumlah} jam" },
  "admin.community.noResolution": {
    id: "Belum ada laporan yang ditutup",
    "id-simple": "Belum ada laporan yang selesai",
  },
} as const satisfies KatalogFitur;
