import type { KatalogFitur } from "../tipe.js";
import { katalogCommunityContent } from "./community-content.js";

export const katalogCommunity = {
  ...katalogCommunityContent,
  "community.judul": { id: "Komunitas", "id-simple": "Komunitas" },
  "community.penjelasan": {
    id: "Temukan ruang seputar karier, berdasarkan topik atau kota. Pilih ruang untuk mengenalnya dan bergabung.",
    "id-simple":
      "Cari ruang tentang kerja atau kota Anda. Buka ruang untuk melihat isinya dan bergabung.",
  },
  "community.filter.label": { id: "Filter ruang", "id-simple": "Pilih ruang yang dicari" },
  "community.filter.jenis": { id: "Jenis ruang", "id-simple": "Ruang tentang apa?" },
  "community.filter.semua": { id: "Semua jenis", "id-simple": "Semua ruang" },
  "community.jenis.topic": { id: "Topik karier", "id-simple": "Tentang kerja" },
  "community.jenis.city": { id: "Komunitas kota", "id-simple": "Ruang satu kota" },
  "community.filter.kota": { id: "Nama kota", "id-simple": "Kota yang dicari" },
  "community.filter.kotaPetunjuk": {
    id: "Misalnya Jakarta. Kosongkan untuk melihat semua kota.",
    "id-simple": "Tulis nama kota, misalnya Jakarta. Biarkan kosong untuk semua kota.",
  },
  "community.filter.terapkan": { id: "Terapkan filter", "id-simple": "Cari ruang" },
  "community.filter.reset": { id: "Hapus filter", "id-simple": "Tampilkan semua ruang" },
  "community.hasil.judul": { id: "Ruang komunitas", "id-simple": "Daftar ruang" },
  "community.hasil.jumlah": {
    id: "{jumlah} ruang ditampilkan.",
    "id-simple": "Ada {jumlah} ruang di daftar ini.",
  },
  "community.hasil.kosong": { id: "Belum ada ruang", "id-simple": "Ruang belum tersedia" },
  "community.hasil.kosongPenjelasan": {
    id: "Ruang akan tampil di sini setelah dibuat oleh pengelola. Anda bisa kembali lagi nanti.",
    "id-simple": "Pengelola belum membuat ruang. Coba buka halaman ini lagi nanti.",
  },
  "community.hasil.tidakCocok": {
    id: "Tidak ada ruang yang cocok",
    "id-simple": "Ruang yang dicari tidak ada",
  },
  "community.hasil.ubahFilter": {
    id: "Coba nama kota lain atau hapus filter untuk melihat semua ruang.",
    "id-simple": "Ganti kota yang dicari. Atau tampilkan semua ruang.",
  },
  "community.anggota.jumlah": { id: "{jumlah} anggota", "id-simple": "{jumlah} orang bergabung" },
  "community.memuat": { id: "Memuat ruang…", "id-simple": "Sedang membuka ruang…" },
  "community.muatLagi": { id: "Muat ruang lainnya", "id-simple": "Tampilkan ruang lain" },
  "community.semuaDimuat": {
    id: "Semua ruang sudah ditampilkan",
    "id-simple": "Tidak ada ruang lain",
  },
  "community.cobaLagi": { id: "Coba lagi", "id-simple": "Ulangi" },
  "community.luring": {
    id: "Anda sedang luring. Sambungkan internet untuk memuat ruang atau mengubah keanggotaan.",
    "id-simple": "Internet mati. Nyalakan internet untuk membuka ruang, bergabung, atau keluar.",
  },
  "community.cacheLuring": {
    id: "Anda melihat data yang sudah dimuat. Jumlah anggota dan status ruang mungkin telah berubah.",
    "id-simple": "Ini data yang tadi sudah dibuka. Jumlah anggota atau keadaan ruang bisa berubah.",
  },
  "community.detail.kembali": {
    id: "Kembali ke komunitas",
    "id-simple": "Kembali ke daftar ruang",
  },
  "community.detail.tentang": { id: "Tentang ruang ini", "id-simple": "Isi ruang ini" },
  "community.detail.tidakAda": { id: "Ruang tidak ditemukan", "id-simple": "Ruang ini tidak ada" },
  "community.detail.tidakAdaPenjelasan": {
    id: "Ruang ini mungkin sudah tidak tersedia. Kembali ke daftar untuk mencari ruang lain.",
    "id-simple": "Buka daftar ruang. Pilih ruang lain di sana.",
  },
  "community.arsip.judul": { id: "Ruang diarsipkan", "id-simple": "Ruang sudah ditutup" },
  "community.arsip.penjelasan": {
    id: "Ruang ini tidak menerima anggota atau tulisan baru. Anggota yang sudah bergabung tetap boleh keluar.",
    "id-simple": "Anda tidak bisa bergabung atau menulis lagi di sini. Anggota masih bisa keluar.",
  },
  "community.member.judul": { id: "Keanggotaan Anda", "id-simple": "Anda di ruang ini" },
  "community.member.memuat": {
    id: "Memeriksa keanggotaan…",
    "id-simple": "Sedang melihat apakah Anda sudah bergabung…",
  },
  "community.member.belum": {
    id: "Anda belum bergabung",
    "id-simple": "Anda belum menjadi anggota",
  },
  "community.member.aktif": {
    id: "Anda sudah bergabung",
    "id-simple": "Anda sudah menjadi anggota",
  },
  "community.member.blocked": {
    id: "Keanggotaan Anda diblokir",
    "id-simple": "Anda tidak bisa bergabung di ruang ini",
  },
  "community.member.blockedPenjelasan": {
    id: "Pengelola membatasi keanggotaan Anda di ruang ini. Bergabung ulang atau keluar tidak membatalkan pembatasan.",
    "id-simple":
      "Pengelola menutup keanggotaan Anda di sini. Anda tidak bisa bergabung lagi atau keluar.",
  },
  "community.member.masuk": {
    id: "Masuk untuk bergabung",
    "id-simple": "Masuk, lalu gabung ruang ini",
  },
  "community.member.tamu": {
    id: "Anda dapat mengenal ruang tanpa akun. Masuk untuk bergabung; membaca diskusi tidak memerlukan keanggotaan.",
    "id-simple":
      "Anda bisa melihat keterangan ruang sekarang. Masuk untuk bergabung. Setelah masuk, Anda bisa membaca diskusi tanpa bergabung.",
  },
  "community.member.join": { id: "Gabung ruang", "id-simple": "Gabung ruang" },
  "community.member.leave": { id: "Keluar dari ruang", "id-simple": "Keluar dari ruang" },
  "community.member.menyimpan": {
    id: "Memperbarui keanggotaan…",
    "id-simple": "Sedang mengubah keanggotaan…",
  },
  "community.member.berhasilJoin": {
    id: "Anda berhasil bergabung.",
    "id-simple": "Anda sekarang menjadi anggota.",
  },
  "community.member.berhasilLeave": {
    id: "Anda sudah keluar dari ruang.",
    "id-simple": "Anda tidak lagi menjadi anggota ruang ini.",
  },
  "community.galat.umum": {
    id: "Ruang belum bisa dimuat. Coba lagi beberapa saat lagi.",
    "id-simple": "Ruang belum bisa dibuka. Coba lagi nanti.",
  },
  "community.galat.batas": {
    id: "Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.",
    "id-simple": "Anda terlalu sering mencoba. Tunggu dulu, lalu coba lagi.",
  },
  "community.galat.sesi": {
    id: "Masuk lagi untuk mengubah keanggotaan.",
    "id-simple": "Anda perlu masuk lagi. Setelah itu, coba bergabung atau keluar.",
  },
} as const satisfies KatalogFitur;
