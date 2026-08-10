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

  // --- Ekspor data (PR-033b) ---
  //
  // Teks bagian ini menjelaskan HAK, bukan fitur. Yang membacanya sedang
  // memutuskan apakah akan mengambil salinan datanya, dan ia berhak tahu apa
  // yang akan ia terima sebelum menekan apa pun.
  "pengaturan.ekspor.judul": {
    id: "Unduh salinan data Anda",
    "id-simple": "Ambil salinan data Anda",
  },
  "pengaturan.ekspor.penjelasan": {
    id: "Anda berhak mengambil salinan data yang kami simpan. Berkasnya berbentuk JSON dan bisa Anda simpan atau pindahkan ke layanan lain.",
    "id-simple": "Anda boleh mengambil data Anda kapan saja. Data akan diunduh sebagai satu berkas. Berkas itu milik Anda.",
  },
  "pengaturan.ekspor.batas": {
    // Batas kuota disebutkan LEBIH DULU, bukan baru muncul sebagai galat.
    // Pengguna yang tahu jatahnya tiga tidak akan menekan tombolnya berulang
    // kali lalu tiba-tiba ditolak tanpa mengerti sebabnya.
    id: "Anda bisa mengunduh sampai 3 kali dalam 24 jam.",
    "id-simple": "Anda bisa mengunduh 3 kali sehari.",
  },
  "pengaturan.ekspor.tombol": {
    id: "Unduh data saya",
    "id-simple": "Unduh data saya",
  },
  "pengaturan.ekspor.menyiapkan": {
    id: "Menyiapkan berkas data Anda…",
    "id-simple": "Sebentar, berkas Anda sedang disiapkan…",
  },
  "pengaturan.ekspor.selesai": {
    // Diumumkan, bukan hanya ditampilkan. Unduhan tidak mengubah apa pun di
    // halaman: pengguna screen reader menekan tombol lalu tidak mendengar apa
    // pun sama sekali, dan tidak punya cara mengetahui bahwa berkasnya sudah
    // ada. Nama berkasnya ikut disebut supaya ia bisa mencarinya.
    id: "Berkas {nama} sudah diunduh. Cek folder unduhan di perangkat Anda.",
    "id-simple": "Berkas {nama} sudah selesai. Lihat folder unduhan Anda.",
  },
  "pengaturan.ekspor.galat.jatahHabis": {
    id: "Jatah unduhan Anda hari ini sudah habis. Coba lagi besok, atau pakai berkas yang sudah Anda unduh.",
    "id-simple": "Hari ini Anda sudah mengunduh 3 kali. Coba lagi besok.",
  },

  // --- Hapus akun (PR-033c-1) ---
  //
  // TEKS PALING BERAT DI SELURUH APLIKASI INI. Yang membacanya sedang
  // mempertimbangkan tindakan yang tidak bisa dibatalkan sesudah 30 hari, dan
  // ia berhak tahu PERSIS apa yang akan terjadi — bukan versi yang menenangkan.
  //
  // Tiga aturan yang dipegang di seluruh bagian ini:
  //   1. Sebut akibatnya sebelum menyebut caranya.
  //   2. Sebut jalan kembalinya (30 hari), sebab jendela itu tidak berguna bagi
  //      yang tidak tahu ia ada.
  //   3. Jangan pernah memakai kata halus untuk "hapus". Pengguna yang mengira
  //      ia hanya "menonaktifkan" akan terkejut di hari ke-31.
  "pengaturan.hapus.judul": {
    id: "Hapus akun",
    "id-simple": "Hapus akun",
  },
  "pengaturan.hapus.penjelasan": {
    id: "Menghapus akun akan menghentikan seluruh lamaran Anda dan mengeluarkan Anda dari semua perangkat.",
    "id-simple": "Kalau akun dihapus, semua lamaran Anda berhenti. Anda juga keluar dari semua HP dan komputer.",
  },
  "pengaturan.hapus.tombol": {
    id: "Hapus akun saya",
    "id-simple": "Hapus akun saya",
  },

  // Langkah 1 — akibat.
  "pengaturan.hapus.dialog.judul": {
    id: "Yakin ingin menghapus akun Anda?",
    "id-simple": "Anda yakin mau menghapus akun?",
  },
  "pengaturan.hapus.dialog.deskripsi": {
    id: "Baca dulu apa yang akan terjadi. Anda masih bisa membatalkan langkah ini.",
    "id-simple": "Baca dulu. Anda masih boleh berhenti di sini.",
  },
  "pengaturan.hapus.akibat.judul": {
    id: "Yang akan terjadi:",
    "id-simple": "Yang akan terjadi:",
  },
  "pengaturan.hapus.akibat.profil": {
    id: "Profil, CV, dan lamaran Anda tidak bisa dilihat lagi oleh siapa pun.",
    "id-simple": "Profil, CV, dan lamaran Anda hilang dari pencarian.",
  },
  "pengaturan.hapus.akibat.sesi": {
    id: "Anda langsung keluar dari semua perangkat.",
    "id-simple": "Anda langsung keluar dari semua HP dan komputer.",
  },
  "pengaturan.hapus.akibat.tunggu": {
    // Angka harinya datang dari kontrak (`HARI_SEBELUM_PURGE`), bukan diketik
    // ulang di sini: yang dijanjikan harus sama dengan yang ditegakkan job purge.
    id: "Data Anda masih bisa dipulihkan dalam {hari} hari. Setelah itu terhapus permanen.",
    "id-simple": "Dalam {hari} hari, data Anda masih bisa dikembalikan. Lewat itu, hilang selamanya.",
  },
  "pengaturan.hapus.akibat.pulihkan": {
    id: "Untuk memulihkan akun dalam masa itu, hubungi kami lewat kanal resmi Nawasena.",
    "id-simple": "Mau akun Anda kembali? Hubungi kami sebelum {hari} hari lewat.",
  },
  "pengaturan.hapus.batal": {
    id: "Batal",
    "id-simple": "Batal",
  },
  "pengaturan.hapus.lanjut": {
    id: "Saya mengerti, lanjutkan",
    "id-simple": "Saya mengerti. Lanjut.",
  },

  // Langkah 2 — pembuktian ulang.
  "pengaturan.hapus.kode.judul": {
    id: "Buktikan dulu bahwa ini Anda",
    "id-simple": "Buktikan dulu ini Anda",
  },
  "pengaturan.hapus.kode.deskripsi": {
    // Menyebut SEBABNYA, bukan hanya memerintah. Pengguna yang tahu ia sudah
    // masuk akan bertanya-tanya kenapa diminta lagi, dan pertanyaan yang tidak
    // dijawab terbaca sebagai aplikasi yang rewel.
    id: "Anda memang sudah masuk, tetapi menghapus akun adalah langkah terakhir. Kami minta kode baru supaya orang lain yang memegang perangkat Anda tidak bisa melakukannya.",
    "id-simple": "Anda sudah masuk. Tapi ini langkah terakhir. Kami minta kode baru, supaya orang lain tidak bisa menghapus akun Anda.",
  },
  "pengaturan.hapus.kode.kirim": {
    id: "Kirim kode ke nomor saya",
    "id-simple": "Kirim kode ke HP saya",
  },
  "pengaturan.hapus.kode.mengirim": {
    id: "Mengirim kode…",
    "id-simple": "Sebentar, kode sedang dikirim…",
  },
  "pengaturan.hapus.kode.terkirim": {
    id: "Kode sudah dikirim ke {nomor}.",
    "id-simple": "Kode sudah dikirim ke {nomor}.",
  },
  "pengaturan.hapus.kode.label": {
    id: "Kode 6 angka",
    "id-simple": "Kode 6 angka",
  },
  "pengaturan.hapus.kode.bantuan": {
    id: "Cek WhatsApp atau SMS Anda.",
    "id-simple": "Lihat WhatsApp atau SMS Anda.",
  },
  "pengaturan.hapus.kode.konfirmasi": {
    // Label tombol final MENYEBUT AKIBATNYA, bukan "OK" atau "Lanjut". Inilah
    // teks terakhir yang dibaca — dan dibacakan — sebelum akun hilang.
    id: "Hapus akun saya sekarang",
    "id-simple": "Hapus akun saya sekarang",
  },
  "pengaturan.hapus.kode.menghapus": {
    id: "Menghapus akun Anda…",
    "id-simple": "Sebentar, akun Anda sedang dihapus…",
  },

  // Sesudah terhapus.
  "pengaturan.hapus.selesai.judul": {
    id: "Akun Anda sudah dihapus",
    "id-simple": "Akun Anda sudah dihapus",
  },
  "pengaturan.hapus.selesai.penjelasan": {
    id: "Data Anda masih bisa dipulihkan dalam {hari} hari lewat kanal resmi Nawasena. Terima kasih sudah mencoba Nawasena.",
    "id-simple": "Dalam {hari} hari, data Anda masih bisa dikembalikan. Hubungi kami. Terima kasih sudah memakai Nawasena.",
  },
  "pengaturan.hapus.selesai.tutup": {
    id: "Kembali ke beranda",
    "id-simple": "Buka halaman awal",
  },

  // Akun tanpa nomor HP (masuk lewat Google) — jalurnya lahir di PR-033c-2.
  "pengaturan.hapus.tanpaNomor": {
    // Dikatakan APA ADANYA, bukan disembunyikan di balik tombol yang gagal.
    // Pengguna yang menekan tombol lalu ditolak server akan mengira dirinya
    // yang salah — padahal jalurnya memang belum kami bangun.
    id: "Akun Anda masuk lewat Google, dan konfirmasi lewat Google belum tersedia di aplikasi. Hubungi kami lewat kanal resmi Nawasena untuk dibantu menghapus akun.",
    "id-simple": "Anda masuk pakai Google. Cara hapus untuk akun Google belum siap. Hubungi kami, nanti kami bantu.",
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
