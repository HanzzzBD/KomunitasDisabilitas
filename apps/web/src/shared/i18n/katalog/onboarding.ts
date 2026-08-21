// Katalog wizard onboarding aksesibilitas (PR-035).
//
// CARA MENULIS VARIAN `id-simple` — panduan lengkapnya di
// docs/panduan-bahasa-sederhana.md; ringkasnya: kalimat pendek, satu gagasan
// per kalimat, kata sehari-hari, tanpa kiasan. Varian simple BOLEH sama dengan
// `id` bila kalimatnya memang sudah sederhana; yang sama WAJIB terdaftar
// beserta alasannya di `SAMA_DENGAN_SENGAJA` (katalog-kelengkapan.test.ts).
//
// SATU CATATAN KHUSUS HALAMAN INI, dan ia menentukan seluruh nadanya. Ini layar
// PERTAMA yang dilihat pengguna baru, dan sebagian pembacanya justru yang
// paling terbantu oleh varian sederhana — pengguna autisme dan disabilitas
// kognitif (persona Dimas). Jadi tidak ada kalimat yang menjanjikan lebih dari
// yang terjadi, dan tidak ada satu pun langkah yang menyembunyikan bahwa ia
// boleh dilewati.
//
// Satu lagi: layar "ragam disabilitas" menanyakan data paling sensitif di
// seluruh produk ini. Teksnya harus menyebut APA ADANYA bahwa jawabannya tidak
// dikirim ke mana pun — pengguna yang mengira datanya sudah tersimpan di server
// akan mengambil keputusan berdasarkan hal yang tidak benar.
import type { KatalogFitur } from "../tipe.js";

export const katalogOnboarding = {
  // --- Kerangka wizard ---
  "onboarding.judul": {
    id: "Atur kenyamanan Anda",
    "id-simple": "Atur aplikasi ini",
  },
  "onboarding.deskripsi": {
    id: "Empat langkah singkat supaya Nawasena nyaman dipakai. Semua langkah boleh dilewati, dan Anda bisa mengubahnya lagi kapan saja.",
    "id-simple": "Ada 4 langkah pendek. Anda boleh lewati semua. Anda juga boleh ubah lagi nanti.",
  },
  "onboarding.progres.label": {
    id: "Kemajuan pengaturan",
    "id-simple": "Langkah Anda sekarang",
  },
  "onboarding.progres.status": {
    // Diumumkan lewat live region setiap kali langkahnya berganti. Tanpa ini,
    // pengguna screen reader menekan "Lanjut" lalu tidak mendengar apa pun —
    // ia tidak punya cara tahu bahwa layarnya sudah berganti.
    id: "Langkah {nomor} dari {total}: {nama}",
    "id-simple": "Langkah {nomor} dari {total}: {nama}",
  },
  "onboarding.langkah.ragam": {
    id: "Ragam disabilitas",
    "id-simple": "Kondisi Anda",
  },
  "onboarding.langkah.persetujuan": {
    id: "Persetujuan",
    "id-simple": "Izin Anda",
  },
  "onboarding.langkah.preferensi": {
    id: "Preferensi tampilan",
    "id-simple": "Tampilan aplikasi",
  },
  "onboarding.langkah.ringkasan": {
    id: "Ringkasan",
    "id-simple": "Ringkasan",
  },

  // --- Kendali ---
  "onboarding.aksi.lanjut": {
    id: "Lanjut",
    "id-simple": "Lanjut",
  },
  "onboarding.aksi.kembali": {
    id: "Kembali",
    "id-simple": "Kembali",
  },
  "onboarding.aksi.lewati": {
    // Ada di SETIAP langkah, bukan hanya di langkah pertama. Pengguna yang
    // berubah pikiran di tengah tidak boleh dipaksa menyelesaikannya dulu.
    id: "Lewati pengaturan ini",
    "id-simple": "Lewati saja",
  },
  "onboarding.aksi.selesai": {
    id: "Simpan dan mulai",
    "id-simple": "Simpan lalu mulai",
  },
  "onboarding.aksi.menyimpan": {
    id: "Menyimpan pilihan Anda…",
    "id-simple": "Sebentar, pilihan Anda sedang disimpan…",
  },
  "onboarding.aksi.lanjutkanSaja": {
    // Muncul HANYA setelah pengiriman gagal. Ia menyatakan bahwa melanjutkan
    // memang boleh — pengguna yang melihat pesan galat lalu menemukan tombol
    // "Simpan" yang sama akan mengira ia harus mencoba lagi sampai berhasil.
    id: "Lanjutkan ke beranda",
    "id-simple": "Lanjut ke halaman awal",
  },
  "onboarding.galat.simpan": {
    id: "Pilihan Anda belum bisa dikirim ke akun Anda. Periksa koneksi internet Anda.",
    "id-simple": "Pilihan Anda belum sampai ke akun Anda. Cek internet Anda.",
  },
  "onboarding.galat.tetapBerlaku": {
    // Bagian yang paling menenangkan DAN paling benar: preferensinya sudah
    // berlaku di perangkat ini, dan tetap berlaku. Yang gagal hanya
    // penyalinannya ke akun. Tanpa kalimat ini, pengguna mengira pilihannya
    // hilang lalu mengulanginya dari awal.
    //
    // TIDAK LAGI menunjuk ke halaman Pengaturan (QC-1 review PR-035):
    // "/pengaturan/aksesibilitas" tidak punya satu pun kendali hari ini, jadi
    // menjanjikan "simpan lagi lewat Pengaturan" adalah janji ke kapasitas
    // yang tidak ada — dan kalimat ini SATU-SATUNYA petunjuk yang dilihat
    // pengguna di layar galat (tidak ada tombol coba lagi, lihat D-3 di log
    // implementasi). Tombol "Lanjutkan ke beranda" yang sudah tampil di layar
    // yang sama tetap jadi jalan keluarnya — kalimat ini hanya bertugas
    // menenangkan, bukan menunjuk jalan yang belum ada.
    id: "Pilihan Anda tetap berlaku di perangkat ini, meski belum tersimpan ke akun Anda.",
    "id-simple":
      "Tampilan Anda sudah berubah di HP atau komputer ini. Tampilan itu belum tersimpan ke akun Anda.",
  },

  // --- Langkah 1: ragam disabilitas ---
  //
  // TEKS PALING SENSITIF DI PR INI. Yang membacanya diminta menyebutkan
  // kondisinya sendiri, dan ia berhak tahu ke mana jawabannya pergi SEBELUM ia
  // menjawab — bukan sesudah.
  "onboarding.ragam.penjelasan": {
    id: "Kalau Anda bersedia, beri tahu kami ragam disabilitas Anda. Ini membantu kami menyiapkan lowongan dan fasilitas yang cocok.",
    "id-simple":
      "Anda boleh beri tahu kondisi Anda. Ini membantu kami mencarikan kerja yang cocok. Anda juga boleh tidak menjawab.",
  },
  "onboarding.ragam.tidakDikirim": {
    id: "Jawaban Anda di langkah ini belum dikirim ke server kami. Ia hanya tersimpan sementara di perangkat Anda selama pengaturan ini berlangsung.",
    "id-simple":
      "Jawaban ini tidak kami kirim ke mana pun. Jawaban hanya ada di HP atau komputer Anda, dan hilang setelah selesai.",
  },
  "onboarding.ragam.legenda": {
    id: "Ragam disabilitas Anda (boleh lebih dari satu)",
    "id-simple": "Pilih kondisi Anda. Boleh pilih lebih dari satu.",
  },
  "onboarding.ragam.tuli": {
    id: "Tuli atau kurang dengar",
    "id-simple": "Tuli atau susah dengar",
  },
  "onboarding.ragam.netra": {
    id: "Netra atau penglihatan terbatas",
    "id-simple": "Buta atau susah lihat",
  },
  "onboarding.ragam.daksa": {
    id: "Daksa atau keterbatasan gerak",
    "id-simple": "Susah bergerak atau memakai tangan",
  },
  "onboarding.ragam.autisme": {
    id: "Autisme atau disabilitas kognitif",
    "id-simple": "Autisme, atau susah memahami bacaan panjang",
  },
  "onboarding.ragam.lainnya": {
    // Daftar tertutup selalu meninggalkan seseorang di luar — dan di layar ini,
    // orang itu paling tidak boleh disuruh memilih kotak yang salah tentang
    // dirinya.
    id: "Lainnya",
    "id-simple": "Lainnya",
  },
  "onboarding.ragam.opsional": {
    id: "Anda boleh melanjutkan tanpa memilih satu pun.",
    "id-simple": "Anda boleh lanjut tanpa memilih.",
  },

  // --- Langkah 2: persetujuan (UU PDP) ---
  "onboarding.persetujuan.penjelasan": {
    id: "Data tentang disabilitas termasuk data pribadi yang bersifat spesifik menurut UU Pelindungan Data Pribadi. Kami hanya boleh memakainya kalau Anda mengizinkan.",
    "id-simple":
      "Data tentang disabilitas adalah data yang sangat pribadi. Undang-undang melindunginya. Kami hanya boleh memakainya kalau Anda izinkan.",
  },
  "onboarding.persetujuan.butir.belumDikirim": {
    id: "Sampai hari ini, jawaban Anda di langkah sebelumnya belum kami kirim ke mana pun — juga kalau Anda mengizinkan di layar ini.",
    "id-simple": "Sampai sekarang, jawaban Anda tidak kami kirim ke mana pun.",
  },
  "onboarding.persetujuan.butir.tidakTersimpan": {
    // Dulu bernama "bisaDicabut" dan berjanji ada kendali pencabutan di
    // halaman Pengaturan — kendali itu tidak ada di rilis ini, DAN, per AC-8,
    // nilai `setuju` sendiri dibuang begitu wizard ini ditutup (selesai,
    // dilewati, atau ditinggalkan), jadi sebetulnya tidak ada apa pun yang
    // tersimpan untuk dicabut (QC-2 review PR-035). Kalimatnya sekarang
    // menyatakan itu apa adanya, bukan menjanjikan kendali yang belum ada.
    id: "Izin ini tidak kami simpan di mana pun. Begitu Anda meninggalkan pengaturan ini, izinnya hilang dengan sendirinya.",
    "id-simple": "Izin ini tidak kami simpan. Kalau Anda tutup pengaturan ini, izinnya hilang sendiri.",
  },
  "onboarding.persetujuan.butir.takWajib": {
    id: "Menolak tidak mengurangi apa pun: seluruh fitur Nawasena tetap terbuka untuk Anda.",
    "id-simple": "Kalau Anda menolak, Anda tetap bisa memakai semua fitur.",
  },
  "onboarding.persetujuan.kotak": {
    id: "Saya mengizinkan Nawasena memakai data ragam disabilitas saya",
    "id-simple": "Ya, saya izinkan",
  },
  "onboarding.persetujuan.kotakBantuan": {
    id: "Kotak ini kosong sampai Anda sendiri yang mencentangnya.",
    "id-simple": "Kotak ini kosong. Anda sendiri yang harus mencentangnya.",
  },
  "onboarding.persetujuan.belumMemilih": {
    id: "Anda belum memilih ragam disabilitas apa pun di langkah sebelumnya.",
    "id-simple": "Anda belum memilih kondisi apa pun tadi.",
  },
  "onboarding.persetujuan.sudahMemilih": {
    id: "Anda memilih {jumlah} ragam disabilitas di langkah sebelumnya.",
    "id-simple": "Tadi Anda memilih {jumlah} hal.",
  },

  // --- Langkah 3: preferensi ---
  "onboarding.preferensi.penjelasan": {
    id: "Setiap perubahan di sini langsung terlihat di layar, sebelum Anda menyimpan apa pun.",
    "id-simple":
      "Setiap pilihan langsung berubah di layar. Anda bisa lihat hasilnya sekarang juga.",
  },
  "onboarding.preferensi.skalaTeks": {
    id: "Ukuran teks",
    "id-simple": "Besar huruf",
  },
  "onboarding.preferensi.skalaBantuan": {
    id: "Geser ke kanan untuk memperbesar. Maksimal dua kali ukuran normal.",
    "id-simple": "Geser ke kanan supaya huruf lebih besar.",
  },
  "onboarding.preferensi.skalaNilai": {
    id: "{persen} persen",
    "id-simple": "{persen} persen",
  },
  "onboarding.preferensi.legenda": {
    id: "Pilihan tampilan lain",
    "id-simple": "Pilihan lain",
  },
  "onboarding.preferensi.kontras": {
    id: "Kontras tinggi",
    "id-simple": "Warna lebih tegas",
  },
  "onboarding.preferensi.kontrasBantuan": {
    id: "Warna dibuat lebih tegas supaya teks lebih mudah dibedakan dari latarnya.",
    "id-simple": "Huruf jadi lebih jelas dari warna belakangnya.",
  },
  "onboarding.preferensi.gerak": {
    id: "Kurangi animasi",
    "id-simple": "Kurangi gerakan",
  },
  "onboarding.preferensi.gerakBantuan": {
    id: "Perpindahan dan animasi dimatikan. Berguna bila gerakan membuat Anda pusing atau sulit fokus.",
    "id-simple":
      "Gambar dan tombol berhenti bergerak. Ini membantu kalau gerakan membuat Anda pusing.",
  },
  "onboarding.preferensi.bahasa": {
    id: "Teks sederhana",
    "id-simple": "Teks sederhana",
  },
  "onboarding.preferensi.bahasaBantuan": {
    id: "Kalimat dibuat lebih pendek dengan kata sehari-hari.",
    "id-simple": "Kalimat jadi pendek. Katanya sehari-hari.",
  },
  "onboarding.preferensi.sentuh": {
    id: "Tombol lebih besar",
    "id-simple": "Tombol lebih besar",
  },
  "onboarding.preferensi.sentuhBantuan": {
    id: "Tombol dan tautan diberi ruang sentuh lebih lebar, sehingga lebih sulit meleset.",
    "id-simple": "Tombol jadi lebih besar. Jarinya lebih mudah kena.",
  },
  "onboarding.preferensi.bisindo": {
    id: "Utamakan konten BISINDO",
    "id-simple": "Utamakan video bahasa isyarat",
  },
  "onboarding.preferensi.bisindoBantuan": {
    // Menyebut bahwa isinya BELUM ada. Preferensi yang tampak menyala tanpa
    // pernah menghasilkan apa pun membuat pengguna mengira aplikasinya rusak.
    id: "Bila video Bahasa Isyarat Indonesia tersedia, video itu yang ditampilkan lebih dulu. Videonya sendiri menyusul di tahap berikutnya.",
    "id-simple":
      "Kalau ada video bahasa isyarat, video itu tampil duluan. Videonya belum ada sekarang.",
  },
  "onboarding.preferensi.pembacaLayar": {
    id: "Saya memakai pembaca layar",
    "id-simple": "Saya pakai pembaca layar",
  },
  "onboarding.preferensi.pembacaLayarBantuan": {
    // PETUNJUK, bukan deteksi: peramban tidak menyediakan cara mendeteksi
    // screen reader, dan setiap upaya menebaknya adalah sidik jari pengguna
    // (lihat catatan field-nya di packages/schemas).
    id: "Kami tidak bisa dan tidak ingin mendeteksinya sendiri. Bila Anda menyalakannya, kami menambahkan keterangan yang berguna untuk dibacakan.",
    "id-simple":
      "Kami tidak mengintip alat Anda. Kalau Anda nyalakan, kami tambah keterangan suara.",
  },

  // --- Langkah 4: ringkasan ---
  "onboarding.ringkasan.penjelasan": {
    id: "Periksa sekali lagi. Tekan Kembali bila ada yang ingin Anda ubah.",
    "id-simple": "Cek dulu. Kalau mau ubah, tekan Kembali.",
  },
  "onboarding.ringkasan.preferensi": {
    id: "Preferensi tampilan",
    "id-simple": "Tampilan aplikasi",
  },
  "onboarding.ringkasan.ragam": {
    id: "Ragam disabilitas",
    "id-simple": "Kondisi Anda",
  },
  "onboarding.ringkasan.ragamKosong": {
    id: "Anda tidak memilih satu pun.",
    "id-simple": "Anda tidak memilih apa pun.",
  },
  "onboarding.ringkasan.setuju": {
    id: "Anda mengizinkan kami memakai data ini kelak.",
    "id-simple": "Anda izinkan kami memakai data ini nanti.",
  },
  "onboarding.ringkasan.tidakSetuju": {
    id: "Anda tidak memberi izin, dan itu tidak menghalangi apa pun.",
    "id-simple": "Anda tidak memberi izin. Itu tidak apa-apa.",
  },
  "onboarding.ringkasan.simpanKeProfil": {
    // Jalan keluar bagi pengguna yang MEMANG ingin menyimpan pilihannya
    // (PR-040). Kalimatnya menyebut tempatnya, bukan tindakannya saja: yang
    // menekan ini berpindah halaman, dan janji "simpan" tanpa menyebut ke mana
    // akan terbaca seolah penyimpanannya terjadi di sini.
    id: "Simpan ini di halaman profil karier saya",
    "id-simple": "Simpan ini di halaman profil kerja saya",
  },
  "onboarding.ringkasan.tidakDikirim": {
    id: "Bagian ini tidak ikut disimpan ke akun Anda dan tidak dikirim ke server kami.",
    "id-simple": "Bagian ini tidak kami simpan. Bagian ini juga tidak kami kirim.",
  },
  "onboarding.ringkasan.aktif": {
    id: "Aktif",
    "id-simple": "Menyala",
  },
  "onboarding.ringkasan.nonaktif": {
    id: "Tidak aktif",
    "id-simple": "Mati",
  },
} as const satisfies KatalogFitur;
