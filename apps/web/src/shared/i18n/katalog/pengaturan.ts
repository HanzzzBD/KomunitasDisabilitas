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

  // Jalur Google (PR-033c-2).
  "pengaturan.hapus.google.judul": {
    id: "Buktikan dulu lewat akun Google Anda",
    "id-simple": "Buktikan dulu lewat akun Google",
  },
  "pengaturan.hapus.google.deskripsi": {
    id: "Anda akan dibawa ke halaman Google untuk masuk sekali lagi. Setelah kembali, kami tanya sekali lagi sebelum menghapus.",
    "id-simple": "Anda akan dibawa ke halaman Google. Masuk sekali lagi di sana. Setelah kembali, kami tanya lagi.",
  },
  "pengaturan.hapus.google.lanjut": {
    id: "Lanjut ke Google",
    "id-simple": "Lanjut ke Google",
  },
  "pengaturan.hapus.google.gagalSiap": {
    id: "Kami tidak bisa membuka halaman Google sekarang. Coba lagi nanti, atau hubungi kami lewat kanal resmi Nawasena.",
    "id-simple": "Halaman Google tidak bisa dibuka. Coba lagi nanti, atau hubungi kami.",
  },

  // Layar kembalian dari Google — konfirmasi TERAKHIR sebelum akun dihapus.
  "pengaturan.hapus.kembali.judul": {
    id: "Konfirmasi terakhir: hapus akun Anda?",
    "id-simple": "Terakhir: hapus akun Anda?",
  },
  "pengaturan.hapus.kembali.penjelasan": {
    // Akibatnya DIULANG di sini, bukan diandalkan pada ingatan. Antara membaca
    // peringatan dan sampai di layar ini, pengguna menyeberangi halaman Google
    // — perhatiannya sudah pindah, dan sebagian orang tiba di sini beberapa
    // menit kemudian.
    id: "Anda sudah masuk lewat Google. Menekan tombol di bawah akan menghapus akun Anda, menghentikan seluruh lamaran Anda, dan mengeluarkan Anda dari semua perangkat.",
    "id-simple": "Google sudah memastikan ini Anda. Kalau tombol di bawah ditekan, akun Anda dihapus. Semua lamaran Anda berhenti.",
  },
  "pengaturan.hapus.kembali.batal": {
    id: "Batal, jangan hapus akun saya",
    "id-simple": "Batal. Jangan hapus.",
  },
  "pengaturan.hapus.kembali.memeriksaSesi": {
    id: "Sebentar, kami periksa dulu akun Anda…",
    "id-simple": "Sebentar, kami cek dulu akun Anda…",
  },
  "pengaturan.hapus.kembali.sesiHabis": {
    id: "Sesi Anda sudah berakhir, jadi kami belum bisa menghapus akun. Masuk lagi, lalu ulangi dari halaman pengaturan.",
    "id-simple": "Sesi Anda habis. Masuk lagi, lalu ulangi dari halaman pengaturan.",
  },
  "pengaturan.hapus.kembali.masuk": {
    id: "Masuk ke akun Anda",
    "id-simple": "Masuk ke akun Anda",
  },
  "pengaturan.hapus.galat.bedaAkun": {
    // Hampir selalu salah pilih akun di layar Google — bukan serangan. Pesannya
    // menyebut penyebabnya alih-alih menolak dengan "tidak valid" yang buntu.
    id: "Akun Google yang Anda pilih berbeda dengan akun Nawasena ini. Ulangi, lalu pilih akun Google yang biasa Anda pakai untuk masuk.",
    "id-simple": "Anda memilih akun Google yang lain. Ulangi, lalu pilih akun Google yang biasa Anda pakai.",
  },
  "pengaturan.hapus.galat.kedaluwarsa": {
    id: "Konfirmasi dari Google sudah kedaluwarsa. Ulangi dari halaman pengaturan.",
    "id-simple": "Konfirmasi dari Google sudah lewat waktu. Ulangi dari halaman pengaturan.",
  },

  // Akun tanpa nomor HP DAN tanpa jalur Google (kredensial Google belum di-set).
  "pengaturan.hapus.tanpaNomor": {
    // Dikatakan APA ADANYA, bukan disembunyikan di balik tombol yang gagal.
    // Pengguna yang menekan tombol lalu ditolak server akan mengira dirinya
    // yang salah — padahal jalurnya memang belum kami bangun.
    id: "Akun Anda tidak punya nomor HP, dan konfirmasi lewat Google sedang tidak tersedia. Hubungi kami lewat kanal resmi Nawasena untuk dibantu menghapus akun.",
    "id-simple": "Akun Anda tidak punya nomor HP. Cara lewat Google juga sedang mati. Hubungi kami, nanti kami bantu.",
  },

  // --- Aksesibilitas (PR-036) ---
  //
  // SLOT-nya SUDAH TERISI. Dua kunci `pengaturan.aksesibilitas.slot.*` yang
  // dulu menjelaskan ketiadaan kendali dihapus bersama keadaan kosongnya:
  // kalimat "belum tersedia" yang tertinggal di katalog akan dipungut kembali
  // oleh halaman berikutnya yang mencarinya, dan kali itu ia berbohong.
  // --- Panel kanal notifikasi (PR-049b) ---
  //
  // KENAPA "IN-APP" TIDAK PUNYA SAKELAR DI SINI, dan kenapa itu dikatakan
  // kepada pengguna alih-alih didiamkan: notifikasi in-app bukan kanal yang
  // dikirimi melainkan riwayat yang bisa dibaca ulang. Mematikannya berarti
  // tidak menulis apa pun, dan pengguna kehilangan catatan yang justru ia
  // butuhkan saat ingin memeriksa "apa yang terjadi dengan lamaran saya".
  // Panel yang diam soal ini membuat orang mengira ada sakelar yang hilang.
  "pengaturan.notifikasi.judul": {
    id: "Notifikasi",
    "id-simple": "Notifikasi",
  },
  "pengaturan.notifikasi.penjelasan": {
    id: "Pilih cara kami mengabari Anda saat ada perkembangan lamaran. Kabar di dalam aplikasi selalu ada dan tidak bisa dimatikan.",
    // Dipecah menjadi kalimat-kalimat pendek, satu gagasan masing-masing, dan
    // "perkembangan lamaran" → "kabar tentang lamaran Anda".
    "id-simple": "Pilih cara kami mengabari Anda. Kabar di dalam aplikasi selalu ada. Itu tidak bisa dimatikan.",
  },
  "pengaturan.notifikasi.legenda": {
    id: "Kabar di luar aplikasi",
    // Menyebut TEMPATNYA, bukan istilah "kanal" yang tidak berarti apa-apa
    // bagi pembacanya.
    "id-simple": "Kabar yang datang ke luar aplikasi",
  },
  "pengaturan.notifikasi.email": {
    id: "Kirim ke email saya",
    "id-simple": "Kirim ke email saya",
  },
  "pengaturan.notifikasi.emailBantuan": {
    // MENYEBUTKAN PENGECUALIANNYA. Pemberitahuan keamanan akun (mis. kabar
    // bahwa akun sudah dihapus) tetap dikirim meski sakelar ini mati — kabar
    // itu tidak punya kanal lain. Pengguna yang mematikan email lalu tidak
    // diberi tahu tentang pengecualian ini akan mengira kami mengabaikan
    // pilihannya.
    id: "Mati secara bawaan. Pemberitahuan keamanan akun, seperti kabar bahwa akun Anda dihapus, tetap dikirim ke email meski sakelar ini mati.",
    "id-simple": "Bawaannya mati. Satu hal tetap kami kirim: kabar penting tentang keamanan akun Anda. Contohnya kalau akun Anda dihapus.",
  },
  "pengaturan.notifikasi.push": {
    id: "Kirim ke layar ponsel saya",
    // "Push" adalah istilah mesin; yang dipahami pembacanya adalah TEMPAT
    // kabar itu muncul.
    "id-simple": "Kirim ke layar ponsel saya",
  },
  "pengaturan.notifikasi.pushBantuan": {
    id: "Hidup secara bawaan. Kabar muncul di layar ponsel Anda meski aplikasi sedang tertutup.",
    "id-simple": "Bawaannya hidup. Kabar muncul di ponsel Anda walau aplikasi ditutup.",
  },
  "pengaturan.notifikasi.memuat": {
    id: "Memuat pilihan Anda…",
    "id-simple": "Sebentar, pilihan Anda sedang dibuka…",
  },
  "pengaturan.notifikasi.menyimpan": {
    id: "Menyimpan pilihan Anda…",
    "id-simple": "Sebentar, pilihan Anda sedang disimpan…",
  },
  "pengaturan.notifikasi.tersimpan": {
    id: "Pilihan Anda sudah tersimpan ke akun.",
    "id-simple": "Pilihan Anda sudah masuk ke akun Anda.",
  },
  "pengaturan.notifikasi.galat": {
    id: "Pilihan Anda belum bisa dikirim ke akun Anda. Periksa koneksi internet Anda.",
    "id-simple": "Pilihan Anda belum sampai ke akun Anda. Cek internet Anda.",
  },
  "pengaturan.notifikasi.gagalMuat": {
    id: "Sakelar di bawah menampilkan setelan bawaan, bukan pilihan Anda yang tersimpan.",
    // Kalimat ini mencegah kesalahpahaman yang paling mahal di halaman ini:
    // pengguna melihat sakelar bawaan, mengira itu pilihannya, lalu tidak
    // mengubah apa pun.
    "id-simple": "Sakelar di bawah bukan pilihan Anda. Itu setelan bawaan.",
  },
  "pengaturan.notifikasi.belumBerubah": {
    // BERBEDA dari kalimat serupa di panel aksesibilitas, dan bedanya penting:
    // di sana pilihan pengguna tetap berlaku di perangkatnya meski gagal
    // terkirim. Kanal notifikasi hanya hidup di akun, jadi gagal berarti
    // benar-benar belum berubah. Mengatakan sebaliknya akan membuat seseorang
    // mengira ia sudah berhenti menerima email padahal belum.
    id: "Pilihan Anda belum berubah. Coba tekan sakelarnya sekali lagi.",
    "id-simple": "Pilihan Anda belum berubah. Coba tekan lagi.",
  },
  "pengaturan.nav.notifikasi": {
    id: "Notifikasi",
    "id-simple": "Notifikasi",
  },

  "pengaturan.aksesibilitas.judul": {
    id: "Aksesibilitas",
    "id-simple": "Aksesibilitas",
  },
  "pengaturan.aksesibilitas.penjelasan": {
    id: "Atur cara aplikasi ini tampil dan bekerja, sesuai kebutuhan Anda.",
    "id-simple": "Atur tampilan aplikasi supaya nyaman untuk Anda.",
  },
  "pengaturan.aksesibilitas.ikutPerangkat": {
    // Ditempelkan pada sakelar yang BELUM pernah dipilih pengguna tetapi punya
    // sinyal perangkat (kontras, kurangi gerak). Tanpa kalimat ini tombol
    // "kembalikan ke bawaan" tampak rusak: sakelarnya tetap menyala sesudah
    // ditekan, dan alasannya — setelan perangkat muncul kembali — tidak punya
    // satu pun tanda di layar.
    id: "Saat ini mengikuti setelan perangkat Anda.",
    "id-simple": "Sekarang ini ikut setelan HP atau komputer Anda.",
  },

  // Simpan otomatis: tidak ada tombol "Simpan", jadi ketiga kalimat di bawah
  // adalah SATU-SATUNYA cara pengguna tahu apa yang terjadi dengan pilihannya.
  "pengaturan.aksesibilitas.menyimpan": {
    id: "Menyimpan pilihan Anda…",
    "id-simple": "Sebentar, pilihan Anda sedang disimpan…",
  },
  "pengaturan.aksesibilitas.tersimpan": {
    id: "Pilihan Anda sudah tersimpan ke akun.",
    // Menyebut AKUN, bukan sekadar "tersimpan": itulah yang membedakannya dari
    // perubahan di layar, yang sudah terjadi sejak sakelarnya ditekan.
    "id-simple": "Pilihan Anda sudah masuk ke akun Anda.",
  },
  "pengaturan.aksesibilitas.galat": {
    id: "Pilihan Anda belum bisa dikirim ke akun Anda. Periksa koneksi internet Anda.",
    "id-simple": "Pilihan Anda belum sampai ke akun Anda. Cek internet Anda.",
  },
  "pengaturan.aksesibilitas.tetapBerlaku": {
    // Kalimat yang paling menenangkan DAN paling benar: preferensinya sudah
    // berlaku di perangkat ini dan tetap berlaku. Yang gagal hanya
    // penyalinannya ke akun. Tanpa ini, pengguna mengira pilihannya hilang lalu
    // menekan sakelarnya berulang kali.
    id: "Pilihan Anda tetap berlaku di perangkat ini, meski belum tersimpan ke akun Anda.",
    "id-simple":
      "Tampilan Anda sudah berubah di HP atau komputer ini. Perubahan itu belum tersimpan ke akun.",
  },

  // Kembali ke bawaan.
  "pengaturan.aksesibilitas.reset": {
    id: "Kembalikan ke setelan bawaan",
    "id-simple": "Kembalikan seperti semula",
  },
  "pengaturan.aksesibilitas.resetBantuan": {
    // MENYEBUTKAN AKIBAT SEBENARNYA, bukan "semuanya dimatikan". Tombol ini
    // MENGHAPUS pilihan, sehingga setelan perangkat berlaku lagi — pengguna
    // yang perangkatnya menyalakan kontras tinggi akan melihatnya tetap menyala,
    // dan itu benar. Menjanjikan "semua dimatikan" akan menjadikan perilaku
    // yang benar itu tampak seperti kegagalan.
    id: "Semua pilihan di halaman ini dihapus. Setelah itu aplikasi mengikuti setelan perangkat Anda lagi.",
    "id-simple":
      "Semua pilihan Anda di halaman ini dihapus. Aplikasi ikut setelan HP atau komputer Anda lagi.",
  },
} as const satisfies KatalogFitur;
