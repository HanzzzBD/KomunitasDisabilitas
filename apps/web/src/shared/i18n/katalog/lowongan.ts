// Katalog halaman publik "Cari Lowongan" (PR-058, US-08).
//
// KENAPA FITUR TERPISAH DARI `companies` MESKI KEDUANYA HALAMAN PUBLIK. Ini
// halaman TERSENDIRI ("/lowongan"), bukan bagian dari profil perusahaan
// ("/companies/:id") — kandidat yang membuka pencarian lowongan belum tentu
// pernah membuka satu pun profil perusahaan, dan sebaliknya. Memuat katalog
// `companies` PENUH untuknya akan mengunduh teks profil perusahaan (status
// verifikasi, dsb.) yang tidak pernah ia lihat di halaman ini.
//
// TAKSONOMI JENIS/MODE KERJA TIDAK DIULANG DI SINI — dipinjam dari katalog
// `companies` (`companies.lowongan.tipe.*`/`companies.lowongan.mode.*`,
// lahir PR-054 untuk kartu lowongan di profil perusahaan). Kandidat harus
// membaca istilah yang SAMA PERSIS di kedua tempat ia melihat kartu lowongan.
// Begitu pula LABEL AKOMODASI — dipinjam dari `profil`
// (`profil.akomodasi.*`), pola yang sama dengan `companies.ts` dan admin/jobs.
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkap di
// docs/panduan-bahasa-sederhana.md.
import type { KatalogFitur } from "../tipe.js";

export const katalogLowongan = {
  "lowongan.judul": {
    id: "Cari Lowongan",
    "id-simple": "Cari Lowongan",
  },
  "lowongan.penjelasan": {
    id: "Temukan lowongan yang mencantumkan akomodasi sesuai kebutuhan Anda — tanpa perlu masuk lebih dulu.",
    "id-simple": "Cari lowongan kerja di sini. Anda tidak perlu masuk dulu untuk mencarinya.",
  },

  "lowongan.filter.label": {
    id: "Filter pencarian lowongan",
    "id-simple": "Kotak untuk mencari lowongan",
  },
  "lowongan.filter.query": {
    id: "Kata kunci",
    "id-simple": "Kata yang Anda cari",
  },
  "lowongan.filter.queryBantuan": {
    id: "Contoh: kasir, admin, layanan pelanggan.",
    "id-simple": "Contoh: kasir, admin, layanan pelanggan.",
  },
  "lowongan.filter.kota": {
    id: "Kota",
    "id-simple": "Kota",
  },
  "lowongan.filter.provinsi": {
    id: "Provinsi",
    "id-simple": "Provinsi",
  },
  "lowongan.filter.modeKerja": {
    id: "Mode kerja",
    "id-simple": "Cara kerja",
  },
  "lowongan.filter.modeKerjaSemua": {
    id: "Semua mode kerja",
    "id-simple": "Semua cara kerja",
  },
  "lowongan.filter.akomodasiLegenda": {
    id: "Akomodasi yang Anda butuhkan",
    "id-simple": "Bantuan yang Anda perlukan",
  },
  "lowongan.filter.cari": {
    id: "Cari",
    "id-simple": "Cari",
  },
  "lowongan.filter.reset": {
    id: "Hapus semua filter",
    "id-simple": "Hapus semua filter",
  },

  "lowongan.hasil.jumlah": {
    id: "{jumlah} lowongan ditemukan.",
    "id-simple": "Kami menemukan {jumlah} lowongan.",
  },
  "lowongan.hasil.kosong.judul": {
    id: "Tidak ada lowongan yang cocok",
    "id-simple": "Tidak ada lowongan yang cocok",
  },
  "lowongan.hasil.kosong.penjelasanFilter": {
    id: "Coba kata kunci lain, atau kurangi filter yang Anda pilih.",
    "id-simple": "Coba kata lain. Anda juga bisa menghapus sebagian filter.",
  },
  "lowongan.hasil.kosong.penjelasanPolos": {
    id: "Belum ada lowongan yang bisa ditampilkan saat ini. Coba periksa lagi nanti.",
    "id-simple": "Belum ada lowongan sekarang. Coba buka lagi nanti.",
  },

  "lowongan.muatLagi": {
    id: "Muat lebih banyak",
    "id-simple": "Tampilkan lebih banyak",
  },
  "lowongan.memuat": {
    id: "Memuat lowongan…",
    "id-simple": "Sebentar, lowongan sedang dibuka…",
  },
  "lowongan.gagalMuat": {
    id: "Daftar lowongan belum bisa ditampilkan.",
    "id-simple": "Daftar lowongan gagal dibuka.",
  },

  "lowongan.kartu.lokasiTakDisebut": {
    id: "Lokasi tidak dicantumkan",
    "id-simple": "Lokasi tidak ditulis",
  },
  "lowongan.kartu.akomodasiKosong": {
    id: "Belum ada akomodasi yang dicantumkan untuk posisi ini.",
    "id-simple": "Belum ada bantuan yang ditulis untuk posisi ini.",
  },

  // --- Detail lowongan (PR-059) ---
  "lowongan.kembaliKeDaftar": {
    id: "Kembali ke daftar lowongan",
    "id-simple": "Kembali ke daftar lowongan",
  },
  "lowongan.detail.gagalMuat": {
    id: "Lowongan ini belum bisa ditampilkan.",
    "id-simple": "Lowongan ini gagal dibuka.",
  },
  "lowongan.detail.tidakDitemukan.judul": {
    id: "Lowongan tidak ditemukan",
    "id-simple": "Lowongan ini tidak ada",
  },
  "lowongan.detail.tidakDitemukan.penjelasan": {
    // Server sengaja tidak membedakan "tidak pernah ada", "sudah ditutup", dan
    // "lewat batas waktu" (PR-055) — kalimatnya menyebut kemungkinan yang
    // paling sering, tanpa berpura-pura tahu sebab pastinya.
    id: "Lowongan ini mungkin sudah ditutup atau melewati batas waktu melamar.",
    "id-simple": "Mungkin lowongan ini sudah ditutup. Coba cari lowongan lain.",
  },
  "lowongan.detail.ringkasan": {
    id: "Ringkasan lowongan",
    "id-simple": "Info singkat lowongan",
  },
  "lowongan.detail.info.jenis": {
    id: "Jenis pekerjaan",
    "id-simple": "Jenis pekerjaan",
  },
  "lowongan.detail.info.mode": {
    id: "Mode kerja",
    "id-simple": "Cara kerja",
  },
  "lowongan.detail.info.lokasi": {
    id: "Lokasi",
    "id-simple": "Tempat kerja",
  },
  "lowongan.detail.info.gaji": {
    id: "Gaji",
    "id-simple": "Gaji",
  },
  "lowongan.detail.info.diterbitkan": {
    id: "Diterbitkan",
    "id-simple": "Dibuka sejak",
  },
  "lowongan.detail.info.batas": {
    id: "Batas melamar",
    "id-simple": "Terakhir bisa melamar",
  },
  "lowongan.detail.gaji.rentang": {
    id: "{min} – {max} per bulan",
    "id-simple": "Antara {min} dan {max} setiap bulan",
  },
  "lowongan.detail.gaji.mulai": {
    id: "Mulai {min} per bulan",
    "id-simple": "Paling sedikit {min} setiap bulan",
  },
  "lowongan.detail.gaji.hingga": {
    id: "Hingga {max} per bulan",
    "id-simple": "Paling banyak {max} setiap bulan",
  },
  "lowongan.detail.deskripsi": {
    id: "Deskripsi pekerjaan",
    "id-simple": "Tentang pekerjaan ini",
  },
  "lowongan.detail.persyaratan": {
    id: "Persyaratan",
    "id-simple": "Syarat yang dicari",
  },
  "lowongan.detail.akomodasi": {
    id: "Akomodasi untuk posisi ini",
    "id-simple": "Bantuan untuk posisi ini",
  },
  "lowongan.detail.ragam.judul": {
    id: "Terbuka untuk",
    "id-simple": "Siapa yang disambut melamar",
  },
  "lowongan.detail.ragam.semua": {
    id: "Lowongan ini tidak menyebut ragam disabilitas tertentu — semua pelamar disambut.",
    "id-simple": "Semua orang boleh melamar posisi ini.",
  },
  "lowongan.detail.perusahaan.judul": {
    id: "Tentang perusahaan",
    "id-simple": "Tentang perusahaannya",
  },
  "lowongan.detail.perusahaan.akomodasi": {
    id: "Akomodasi di perusahaan ini",
    "id-simple": "Bantuan di perusahaan ini",
  },
  "lowongan.detail.perusahaan.lihatProfil": {
    id: "Lihat profil lengkap {nama}",
    "id-simple": "Buka profil {nama}",
  },
  "lowongan.detail.perusahaan.gagalMuat": {
    id: "Informasi perusahaan belum bisa ditampilkan.",
    "id-simple": "Info perusahaan gagal dibuka.",
  },
  "lowongan.detail.melamar.judul": {
    id: "Cara melamar",
    "id-simple": "Cara melamar",
  },
  // ---------------------------------------------------------------------
  // Alur lamar (PR-078). Kalimat konsekuensi Ya/Tidak adalah bagian paling
  // sensitif katalog ini: keduanya ditulis SEPANJANG dan SETEGAS satu sama
  // lain, dan tidak ada yang menyebut salah satu pilihan "disarankan".
  // ---------------------------------------------------------------------
  "lowongan.lamar.ajakan": {
    id: "Kirim lamaran langsung lewat Nawasena. Anda memilih CV dan memutuskan sendiri apakah data disabilitas ikut dikirim.",
    "id-simple":
      "Lamar lewat Nawasena. Anda pilih CV. Anda juga pilih: kirim data disabilitas atau tidak.",
  },
  "lowongan.lamar.tombol": {
    id: "Lamar lowongan ini",
    "id-simple": "Lamar sekarang",
  },
  "lowongan.lamar.memeriksaSesi": {
    id: "Memeriksa status masuk Anda…",
    "id-simple": "Sebentar, kami cek dulu…",
  },
  "lowongan.lamar.perluMasuk": {
    id: "Masuk dulu untuk melamar. Sesudah masuk, Anda kembali ke lowongan ini.",
    "id-simple": "Anda perlu masuk dulu. Nanti Anda kembali ke sini.",
  },
  "lowongan.lamar.masukUntukMelamar": {
    id: "Masuk untuk melamar",
    "id-simple": "Masuk, lalu lamar",
  },
  "lowongan.lamar.judul": {
    id: "Lamar: {judul}",
    "id-simple": "Melamar {judul}",
  },
  "lowongan.lamar.deskripsi": {
    id: "Dua langkah: pilih CV, lalu putuskan apakah data disabilitas Anda ikut dikirim.",
    "id-simple": "Pilih CV. Lalu pilih: kirim data disabilitas atau tidak.",
  },
  "lowongan.lamar.batal": {
    id: "Batal",
    "id-simple": "Tutup",
  },
  "lowongan.lamar.kirim": {
    id: "Kirim lamaran",
    "id-simple": "Kirim",
  },
  "lowongan.lamar.mengirim": {
    id: "Mengirim lamaran…",
    "id-simple": "Sedang dikirim…",
  },
  "lowongan.lamar.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Ulangi",
  },
  "lowongan.lamar.cv.legend": {
    id: "CV yang dikirim",
    "id-simple": "Pilih CV",
  },
  "lowongan.lamar.cv.memuat": {
    id: "Memuat daftar CV Anda…",
    "id-simple": "Membuka CV Anda…",
  },
  "lowongan.lamar.cv.diperbarui": {
    id: "Terakhir diubah {tanggal}",
    "id-simple": "Diubah {tanggal}",
  },
  "lowongan.lamar.cv.kosongJudul": {
    id: "Anda belum punya CV",
    "id-simple": "Belum ada CV",
  },
  "lowongan.lamar.cv.kosongPenjelasan": {
    id: "Lamaran perlu CV. Buat CV dulu — sesudah selesai, ada tautan untuk kembali melamar lowongan ini.",
    "id-simple":
      "Untuk melamar, Anda perlu CV. Buat CV dulu. Nanti ada tombol untuk kembali ke sini.",
  },
  "lowongan.lamar.cv.buatChat": {
    id: "Buat CV dengan bantuan AI",
    "id-simple": "Buat CV dibantu AI",
  },
  "lowongan.lamar.cv.buatProfil": {
    id: "Buat CV dari profil saya",
    "id-simple": "Buat CV dari profil",
  },
  "lowongan.lamar.cv.membuat": {
    id: "Membuat CV…",
    "id-simple": "CV sedang dibuat…",
  },
  "lowongan.lamar.cv.judulBawaan": {
    id: "CV saya",
    "id-simple": "CV",
  },
  "lowongan.lamar.ungkap.legend": {
    id: "Kirim data disabilitas Anda ke perusahaan?",
    "id-simple": "Kirim data disabilitas ke perusahaan?",
  },
  "lowongan.lamar.ungkap.bantuan": {
    id: "Anda yang memutuskan. Pilihan ini hanya berlaku untuk lamaran ini, dan tidak ada jawaban yang salah.",
    "id-simple": "Anda yang pilih. Pilihan ini hanya untuk lamaran ini. Dua-duanya boleh.",
  },
  "lowongan.lamar.ungkap.ya": {
    id: "Ya, kirim data disabilitas saya",
    "id-simple": "Ya, kirim",
  },
  "lowongan.lamar.ungkap.yaAkibat": {
    id: "Perusahaan menerima salinan ragam disabilitas dan kebutuhan akomodasi Anda hari ini, supaya bisa menyiapkan bantuan. Salinan ini tidak ikut berubah bila profil Anda berubah nanti.",
    "id-simple":
      "Perusahaan bisa lihat disabilitas dan bantuan yang Anda perlu. Mereka bisa bersiap. Kalau profil Anda berubah nanti, yang sudah dikirim tetap sama.",
  },
  "lowongan.lamar.ungkap.tidak": {
    id: "Tidak, jangan kirim data disabilitas saya",
    "id-simple": "Tidak, jangan kirim",
  },
  "lowongan.lamar.ungkap.tidakAkibat": {
    id: "Perusahaan hanya menerima CV Anda. Data disabilitas tetap tersimpan rahasia di Nawasena. Anda tetap bisa menceritakannya sendiri nanti, misalnya saat wawancara.",
    "id-simple":
      "Perusahaan hanya lihat CV Anda. Data disabilitas tetap rahasia. Anda boleh cerita sendiri nanti, misalnya saat wawancara.",
  },
  "lowongan.lamar.ungkap.memuatProfil": {
    id: "Memeriksa data disabilitas di profil Anda…",
    "id-simple": "Kami cek data disabilitas Anda…",
  },
  "lowongan.lamar.ungkap.tidakAdaData": {
    id: 'Pilihan "Ya" belum bisa dipakai: profil Anda belum berisi data disabilitas atau kebutuhan akomodasi.',
    "id-simple": 'Belum bisa pilih "Ya". Profil Anda belum ada data disabilitas.',
  },
  "lowongan.lamar.ungkap.profilGagal": {
    id: 'Pilihan "Ya" belum bisa dipakai karena profil Anda gagal dimuat. Anda tetap bisa melamar tanpa mengirim data disabilitas.',
    "id-simple":
      'Profil Anda gagal dibuka, jadi belum bisa pilih "Ya". Anda tetap bisa melamar tanpa data itu.',
  },
  "lowongan.lamar.ungkap.keProfil": {
    id: "Lengkapi di halaman Profil",
    "id-simple": "Isi di Profil",
  },
  "lowongan.lamar.pratinjau.judul": {
    id: "Yang akan dikirim ke perusahaan",
    "id-simple": "Ini yang dikirim",
  },
  "lowongan.lamar.pratinjau.ragam": {
    id: "Ragam disabilitas",
    "id-simple": "Disabilitas",
  },
  "lowongan.lamar.pratinjau.akomodasi": {
    id: "Kebutuhan akomodasi",
    "id-simple": "Bantuan yang perlu",
  },
  "lowongan.lamar.pratinjau.catatan": {
    id: "Catatan akomodasi",
    "id-simple": "Catatan",
  },
  "lowongan.lamar.pratinjau.kosong": {
    id: "Tidak diisi",
    "id-simple": "Kosong",
  },
  "lowongan.lamar.pratinjau.salinan": {
    id: "Untuk mengubah isinya, sunting profil Anda sebelum mengirim lamaran.",
    "id-simple": "Mau ubah? Ubah profil dulu, baru kirim.",
  },
  "lowongan.lamar.galat.cvKosong": {
    id: "Pilih CV yang akan dikirim.",
    "id-simple": "Pilih satu CV dulu.",
  },
  "lowongan.lamar.galat.ungkapKosong": {
    id: "Pilih salah satu: kirim data disabilitas, atau jangan kirim.",
    "id-simple": "Pilih dulu: kirim atau jangan kirim.",
  },
  "lowongan.lamar.galat.ungkapTakBisa": {
    id: 'Data disabilitas di profil Anda kosong, jadi tidak ada yang bisa dikirim. Pilih "Tidak", atau lengkapi profil dulu.',
    "id-simple": 'Profil Anda belum ada data disabilitas. Pilih "Tidak", atau isi profil dulu.',
  },
  "lowongan.lamar.galat.dataKosong": {
    id: 'Data disabilitas di profil Anda kosong. Pilih "Tidak", atau lengkapi profil dulu.',
    "id-simple": 'Data disabilitas Anda kosong. Pilih "Tidak", atau isi profil dulu.',
  },
  "lowongan.lamar.galat.lowonganTutup": {
    id: "Lowongan ini baru saja ditutup, jadi lamaran tidak bisa dikirim.",
    "id-simple": "Lowongan ini sudah tutup. Lamaran tidak bisa dikirim.",
  },
  "lowongan.lamar.galat.cvHilang": {
    id: "CV yang dipilih sudah tidak ada. Tutup dialog ini lalu buka lagi untuk memilih CV lain.",
    "id-simple": "CV itu sudah dihapus. Tutup, lalu buka lagi dan pilih CV lain.",
  },
  "lowongan.lamar.galat.sedangDiproses": {
    id: "Lamaran Anda sedang dikirim. Tunggu sebentar — Anda tidak perlu menekan tombol lagi.",
    "id-simple": "Lamaran sedang dikirim. Tunggu ya. Jangan tekan lagi.",
  },
  "lowongan.lamar.hasil.terkirimJudul": {
    id: "Lamaran terkirim",
    "id-simple": "Lamaran sudah dikirim",
  },
  "lowongan.lamar.hasil.terkirimIsi": {
    id: "Lamaran Anda untuk {judul} sudah kami terima. Kabar berikutnya akan muncul di Notifikasi.",
    "id-simple": "Lamaran Anda untuk {judul} sudah sampai. Kabar baru ada di Notifikasi.",
  },
  "lowongan.lamar.hasil.diungkap": {
    id: "Data disabilitas Anda ikut dikirim bersama lamaran ini.",
    "id-simple": "Data disabilitas Anda ikut dikirim.",
  },
  "lowongan.lamar.hasil.tidakDiungkap": {
    id: "Data disabilitas Anda tidak dikirim. Perusahaan hanya menerima CV.",
    "id-simple": "Data disabilitas tidak dikirim. Perusahaan hanya dapat CV.",
  },
  "lowongan.lamar.hasil.sudahAdaJudul": {
    id: "Anda sudah melamar lowongan ini",
    "id-simple": "Anda sudah melamar di sini",
  },
  "lowongan.lamar.hasil.sudahAdaIsi": {
    id: "Lamaran Anda untuk lowongan ini sudah tercatat, jadi tidak dikirim dua kali. Kabar berikutnya akan muncul di Notifikasi.",
    "id-simple": "Lamaran Anda sudah ada. Tidak dikirim dua kali. Kabar baru ada di Notifikasi.",
  },
  "lowongan.lamar.hasil.keNotifikasi": {
    id: "Buka Notifikasi",
    "id-simple": "Lihat Notifikasi",
  },
} as const satisfies KatalogFitur;
