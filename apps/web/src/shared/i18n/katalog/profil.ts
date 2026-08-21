// Katalog halaman profil karier (PR-040).
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkapnya di
// docs/panduan-bahasa-sederhana.md; ringkasnya: kalimat pendek, satu gagasan
// per kalimat, kata sehari-hari, tanpa kiasan. Varian simple BOLEH sama dengan
// `id` bila kalimatnya memang sudah sederhana; yang sama WAJIB terdaftar
// beserta alasannya di `SAMA_DENGAN_SENGAJA` (katalog-kelengkapan.test.ts).
//
// SATU HAL YANG MENENTUKAN SELURUH NADA HALAMAN INI. Bagian tengahnya meminta
// data paling sensitif di seluruh produk: ragam disabilitas dan kebutuhan
// akomodasi. Karena itu setiap kalimat di sekitarnya harus menjawab tiga
// pertanyaan APA ADANYA, sebelum ditanyakan:
//
//   1. Untuk apa datanya dipakai?
//   2. Siapa yang bisa melihatnya?
//   3. Bagaimana cara menariknya kembali?
//
// Kalimat yang menjanjikan lebih dari yang terjadi bukan sekadar salah di sini
// — ia membuat seseorang menyerahkan data tentang tubuhnya berdasarkan hal yang
// tidak benar. Jadi teks pencabutan menyebut akibatnya secara harfiah ("data
// disabilitas Anda akan DIHAPUS"), bukan melembutkannya.
import type { KatalogFitur } from "../tipe.js";

export const katalogProfil = {
  // --- Kerangka halaman ---
  "profil.judul": {
    id: "Profil karier saya",
    "id-simple": "Profil kerja saya",
  },
  "profil.deskripsi": {
    id: "Isi profil Anda supaya kami bisa mencarikan lowongan yang cocok. Setiap bagian disimpan sendiri-sendiri, jadi Anda boleh berhenti kapan saja.",
    "id-simple":
      "Isi profil Anda. Kami pakai ini untuk cari kerja yang cocok. Setiap bagian disimpan sendiri. Anda boleh berhenti kapan saja.",
  },
  "profil.memuat": {
    id: "Sedang memuat profil Anda…",
    "id-simple": "Tunggu sebentar. Profil Anda sedang dibuka…",
  },
  "profil.gagal": {
    id: "Profil Anda belum bisa dimuat.",
    "id-simple": "Profil Anda belum bisa dibuka.",
  },
  "profil.cobaLagi": {
    id: "Coba lagi",
    "id-simple": "Coba lagi",
  },

  // --- Aksi yang dipakai SETIAP bagian ---
  "profil.aksi.simpan": {
    id: "Simpan bagian ini",
    "id-simple": "Simpan bagian ini",
  },
  "profil.aksi.menyimpan": {
    id: "Sedang menyimpan…",
    "id-simple": "Tunggu sebentar. Sedang disimpan…",
  },
  "profil.status.tersimpan": {
    // Diumumkan lewat live region tiap kali satu bagian selesai disimpan.
    // Menyebut NAMA bagiannya, bukan "tersimpan" saja: di halaman dengan lima
    // tombol simpan, pengumuman tanpa nama tidak memberi tahu yang mana.
    id: "Bagian {bagian} sudah disimpan.",
    "id-simple": "Bagian {bagian} sudah disimpan.",
  },
  "profil.galat.jaringan": {
    id: "Perubahan Anda belum sampai ke server. Periksa koneksi internet Anda, lalu simpan lagi.",
    "id-simple": "Perubahan Anda belum tersimpan. Cek internet Anda. Lalu simpan lagi.",
  },
  "profil.galat.periksaKolom": {
    id: "Ada isian yang perlu diperbaiki. Pesannya ada di bawah kolom yang bersangkutan.",
    "id-simple": "Ada isian yang salah. Lihat pesan merah di bawah kolomnya.",
  },

  // --- Bagian 1: data dasar ---
  "profil.dasar.judul": {
    id: "Data dasar",
    "id-simple": "Data dasar",
  },
  "profil.dasar.deskripsi": {
    id: "Bagian ini boleh dilihat perusahaan yang menerima lamaran Anda.",
    "id-simple": "Bagian ini boleh dilihat perusahaan. Mereka lihat saat Anda melamar.",
  },
  "profil.dasar.headline": {
    id: "Judul profil",
    "id-simple": "Judul profil",
  },
  "profil.dasar.headlineBantuan": {
    id: "Satu kalimat pendek tentang pekerjaan yang Anda cari. Contoh: “Admin data, terbiasa bekerja dari rumah”.",
    "id-simple": "Tulis 1 kalimat pendek. Contoh: “Admin data, biasa kerja dari rumah”.",
  },
  "profil.dasar.ringkasan": {
    id: "Ringkasan tentang Anda",
    "id-simple": "Cerita singkat tentang Anda",
  },
  "profil.dasar.ringkasanBantuan": {
    id: "Ceritakan pengalaman dan kemampuan Anda dengan bahasa Anda sendiri. Boleh dikosongkan dulu.",
    "id-simple": "Ceritakan pengalaman Anda. Pakai bahasa Anda sendiri. Boleh kosong dulu.",
  },
  "profil.dasar.kota": {
    id: "Kota",
    "id-simple": "Kota",
  },
  "profil.dasar.provinsi": {
    id: "Provinsi",
    "id-simple": "Provinsi",
  },
  "profil.dasar.remote": {
    id: "Saya bersedia bekerja jarak jauh",
    "id-simple": "Saya mau kerja dari rumah",
  },
  "profil.dasar.remoteBantuan": {
    id: "Kami akan ikut menawarkan lowongan yang boleh dikerjakan dari rumah.",
    "id-simple": "Kami akan tawarkan juga kerja dari rumah.",
  },
  "profil.dasar.disclosure": {
    id: "Saat melamar, beri tahu perusahaan tentang disabilitas saya",
    "id-simple": "Saat melamar, beri tahu perusahaan soal disabilitas saya",
  },
  "profil.dasar.disclosureBantuan": {
    id: "Anda tetap bisa mengubah pilihan ini pada setiap lamaran.",
    "id-simple": "Anda tetap bisa ubah pilihan ini tiap kali melamar.",
  },
  "profil.dasar.disclosureNever": {
    id: "Jangan pernah",
    "id-simple": "Jangan pernah",
  },
  "profil.dasar.disclosureTanya": {
    id: "Tanya saya dulu setiap kali",
    "id-simple": "Tanya saya dulu tiap kali",
  },
  "profil.dasar.disclosureSelalu": {
    id: "Selalu beri tahu",
    "id-simple": "Selalu beri tahu",
  },

  // --- Bagian 2: data sensitif ---
  "profil.sensitif.judul": {
    id: "Disabilitas dan kebutuhan akomodasi",
    "id-simple": "Disabilitas dan bantuan yang Anda perlukan",
  },
  "profil.sensitif.penanda": {
    // Muncul sebagai penanda di sebelah judul bagian — AC "indikator jelas data
    // mana yang sensitif". Ia juga dibacakan screen reader, bukan hanya
    // diwarnai: penanda yang hanya berupa warna tidak ada bagi Bayu.
    id: "Data sensitif",
    "id-simple": "Data sensitif",
  },
  "profil.sensitif.penjelasan": {
    id: "Data ini dipakai untuk dua hal: mencarikan lowongan di perusahaan yang fasilitasnya cocok, dan memberi tahu kebutuhan akomodasi Anda bila Anda mengizinkannya saat melamar.",
    "id-simple":
      "Data ini dipakai untuk 2 hal. Pertama, mencari kerja di tempat yang cocok. Kedua, memberi tahu bantuan yang Anda perlukan. Itu pun hanya kalau Anda izinkan.",
  },
  "profil.sensitif.siapaMelihat": {
    id: "Perusahaan tidak bisa melihat data ini sampai Anda mengizinkannya pada satu lamaran.",
    "id-simple": "Perusahaan tidak bisa lihat data ini. Kecuali Anda izinkan saat melamar.",
  },
  "profil.sensitif.consentLabel": {
    id: "Saya mengizinkan Nawasena menyimpan data disabilitas saya",
    "id-simple": "Saya izinkan Nawasena simpan data disabilitas saya",
  },
  "profil.sensitif.consentBantuan": {
    id: "Tanpa izin ini, data di bawah tidak akan disimpan sama sekali. Anda bisa menariknya kembali kapan saja.",
    "id-simple": "Tanpa izin ini, data di bawah tidak disimpan. Anda bisa tarik izin kapan saja.",
  },
  "profil.sensitif.consentSejak": {
    id: "Anda memberi izin ini pada {tanggal}.",
    "id-simple": "Anda beri izin ini pada {tanggal}.",
  },
  "profil.sensitif.belumDiizinkan": {
    id: "Anda belum mengizinkan penyimpanan data disabilitas, jadi kami tidak menyimpan apa pun tentang hal ini.",
    "id-simple": "Anda belum beri izin. Jadi kami tidak simpan apa pun soal ini.",
  },
  "profil.sensitif.ragamLegenda": {
    id: "Ragam disabilitas Anda (boleh lebih dari satu)",
    "id-simple": "Kondisi Anda (boleh pilih lebih dari satu)",
  },
  "profil.sensitif.akomodasiLegenda": {
    id: "Kebutuhan akomodasi Anda (boleh lebih dari satu)",
    "id-simple": "Bantuan yang Anda perlukan (boleh pilih lebih dari satu)",
  },
  "profil.sensitif.catatan": {
    id: "Kebutuhan lain yang belum ada di daftar",
    "id-simple": "Bantuan lain yang belum ada di daftar",
  },
  "profil.sensitif.catatanBantuan": {
    id: "Tulis dengan bahasa Anda sendiri. Bagian ini ikut dilindungi seperti data di atasnya.",
    "id-simple": "Tulis pakai bahasa Anda sendiri. Bagian ini juga dilindungi.",
  },
  "profil.sensitif.cabut": {
    id: "Tarik izin dan hapus data ini",
    "id-simple": "Tarik izin dan hapus data ini",
  },
  "profil.sensitif.cabutBantuan": {
    id: "Data disabilitas dan kebutuhan akomodasi Anda akan dihapus dari server kami.",
    "id-simple": "Data disabilitas Anda akan dihapus dari server kami.",
  },
  "profil.sensitif.cabutKonfirmasi": {
    id: "Hapus data disabilitas Anda?",
    "id-simple": "Hapus data disabilitas Anda?",
  },
  "profil.sensitif.cabutAkibat": {
    // Dibacakan BERSAMA judul dialog saat ia terbuka (Radix `Description`).
    // Isinya karena itu harus menyebut apa yang akan HILANG — bukan hal lain.
    id: "Pilihan ragam disabilitas, kebutuhan akomodasi, dan catatan Anda akan dihapus dari server kami.",
    "id-simple": "Pilihan Anda akan dihapus. Catatan Anda juga dihapus.",
  },
  "profil.sensitif.cabutSetelah": {
    // Isi dialog, DI BAWAH deskripsi di atas — dan sengaja mengatakan hal yang
    // BERBEDA. Mengulang kalimat yang sama membuat screen reader membacakannya
    // dua kali berturut-turut: sekali sebagai deskripsi dialog, sekali lagi
    // sebagai isinya.
    id: "Kami tidak menyimpan salinannya. Anda boleh mengisinya lagi kapan saja.",
    "id-simple": "Kami tidak simpan salinan. Anda boleh isi lagi kapan saja.",
  },
  "profil.sensitif.cabutYa": {
    id: "Ya, hapus data saya",
    "id-simple": "Ya, hapus data saya",
  },
  "profil.sensitif.cabutBatal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "profil.sensitif.dicabut": {
    id: "Izin sudah ditarik. Data disabilitas Anda sudah dihapus.",
    "id-simple": "Izin sudah ditarik. Data disabilitas Anda sudah dihapus.",
  },

  // --- Taksonomi akomodasi (nilainya di packages/schemas) ---
  "profil.akomodasi.akses_kursi_roda": {
    id: "Akses kursi roda",
    "id-simple": "Jalan masuk untuk kursi roda",
  },
  "profil.akomodasi.ramah_screen_reader": {
    id: "Perangkat lunak ramah pembaca layar",
    "id-simple": "Aplikasi yang bisa dibacakan suara",
  },
  "profil.akomodasi.wawancara_via_teks": {
    id: "Wawancara lewat teks",
    "id-simple": "Wawancara dengan tulisan, bukan bicara",
  },
  "profil.akomodasi.jam_kerja_fleksibel": {
    id: "Jam kerja fleksibel",
    "id-simple": "Jam kerja bisa diatur",
  },
  "profil.akomodasi.ruang_kerja_tenang": {
    id: "Ruang kerja yang tenang",
    "id-simple": "Ruang kerja yang tenang",
  },
  "profil.akomodasi.juru_bahasa_isyarat": {
    id: "Juru bahasa isyarat",
    "id-simple": "Juru bahasa isyarat",
  },

  // --- Bagian 3: karier ---
  "profil.karier.judul": {
    id: "Riwayat karier",
    "id-simple": "Riwayat kerja dan sekolah",
  },
  "profil.karier.deskripsi": {
    id: "Bagian ini menjadi bahan CV Anda nanti. Setiap baris disimpan begitu Anda menekan Simpan.",
    "id-simple": "Bagian ini jadi bahan CV Anda nanti. Tiap baris disimpan saat Anda tekan Simpan.",
  },
  "profil.karier.tambah": {
    id: "Tambah {bagian}",
    "id-simple": "Tambah {bagian}",
  },
  "profil.karier.ubah": {
    id: "Ubah",
    "id-simple": "Ubah",
  },
  "profil.karier.hapus": {
    id: "Hapus",
    "id-simple": "Hapus",
  },
  "profil.karier.batal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "profil.karier.simpanBaris": {
    id: "Simpan",
    "id-simple": "Simpan",
  },
  "profil.karier.hapusLabel": {
    // Nama aksi yang dibacakan screen reader. Tombol "Hapus" berulang di satu
    // daftar terbaca sebagai deretan "Hapus, Hapus, Hapus" tanpa satu pun
    // petunjuk yang mana — dan yang terhapus adalah baris yang salah.
    id: "Hapus {judul}",
    "id-simple": "Hapus {judul}",
  },
  "profil.karier.ubahLabel": {
    id: "Ubah {judul}",
    "id-simple": "Ubah {judul}",
  },
  "profil.karier.ditambah": {
    id: "{judul} sudah ditambahkan.",
    "id-simple": "{judul} sudah ditambahkan.",
  },
  "profil.karier.diubah": {
    id: "{judul} sudah diubah.",
    "id-simple": "{judul} sudah diubah.",
  },
  "profil.karier.dihapus": {
    id: "{judul} sudah dihapus.",
    "id-simple": "{judul} sudah dihapus.",
  },
  "profil.karier.tanggalBantuan": {
    id: "Tulis dengan urutan tahun-bulan-tanggal. Contoh: 2024-03-01.",
    "id-simple": "Tulis tahun, bulan, lalu tanggal. Contoh: 2024-03-01.",
  },

  // Pengalaman kerja
  "profil.pengalaman.judul": {
    id: "Pengalaman kerja",
    "id-simple": "Pengalaman kerja",
  },
  "profil.pengalaman.satuan": {
    id: "pengalaman kerja",
    "id-simple": "pengalaman kerja",
  },
  "profil.pengalaman.kosong": {
    id: "Anda belum menambahkan pengalaman kerja.",
    "id-simple": "Anda belum menambah pengalaman kerja.",
  },
  "profil.pengalaman.title": {
    id: "Nama posisi",
    "id-simple": "Nama pekerjaan",
  },
  "profil.pengalaman.company": {
    id: "Nama perusahaan",
    "id-simple": "Nama perusahaan",
  },
  "profil.pengalaman.startDate": {
    id: "Mulai bekerja",
    "id-simple": "Mulai kerja",
  },
  "profil.pengalaman.endDate": {
    id: "Selesai bekerja",
    "id-simple": "Berhenti kerja",
  },
  "profil.pengalaman.endDateBantuan": {
    id: "Kosongkan bila Anda masih bekerja di sana.",
    "id-simple": "Biarkan kosong kalau Anda masih kerja di sana.",
  },
  "profil.pengalaman.description": {
    id: "Apa yang Anda kerjakan",
    "id-simple": "Apa yang Anda kerjakan",
  },

  // Pendidikan
  "profil.pendidikan.judul": {
    id: "Pendidikan",
    "id-simple": "Sekolah dan kuliah",
  },
  "profil.pendidikan.satuan": {
    id: "pendidikan",
    "id-simple": "sekolah",
  },
  "profil.pendidikan.kosong": {
    id: "Anda belum menambahkan riwayat pendidikan.",
    "id-simple": "Anda belum menambah sekolah atau kuliah.",
  },
  "profil.pendidikan.institution": {
    id: "Nama sekolah atau kampus",
    "id-simple": "Nama sekolah atau kampus",
  },
  "profil.pendidikan.degree": {
    id: "Jenjang",
    "id-simple": "Tingkat sekolah",
  },
  "profil.pendidikan.degreeBantuan": {
    id: "Contoh: SMA, D3, S1.",
    "id-simple": "Contoh: SMA, D3, S1.",
  },
  "profil.pendidikan.field": {
    id: "Bidang studi",
    "id-simple": "Jurusan",
  },
  "profil.pendidikan.year": {
    id: "Tahun lulus",
    "id-simple": "Tahun lulus",
  },
  "profil.pendidikan.yearBantuan": {
    id: "Bila Anda masih bersekolah, tulis perkiraan tahun lulusnya.",
    "id-simple": "Kalau Anda masih sekolah, tulis kira-kira tahun lulusnya.",
  },

  // Keahlian
  "profil.keahlian.judul": {
    id: "Keahlian",
    "id-simple": "Kemampuan Anda",
  },
  "profil.keahlian.satuan": {
    id: "keahlian",
    "id-simple": "kemampuan",
  },
  "profil.keahlian.kosong": {
    id: "Anda belum menambahkan keahlian.",
    "id-simple": "Anda belum menambah kemampuan.",
  },
  "profil.keahlian.name": {
    id: "Nama keahlian",
    "id-simple": "Nama kemampuan",
  },
  "profil.keahlian.level": {
    id: "Tingkat kemampuan",
    "id-simple": "Seberapa mahir Anda",
  },
  "profil.keahlian.levelBantuan": {
    id: "Contoh: pemula, menengah, mahir.",
    "id-simple": "Contoh: pemula, menengah, mahir.",
  },
} satisfies KatalogFitur;
