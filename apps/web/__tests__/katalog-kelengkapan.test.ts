// Penjaga katalog i18n — AC PR-029 nomor 2 & 4.
//
// PEMBAGIAN TUGAS yang perlu dipahami sebelum menambah aturan di sini:
//
//   TIPE menjamin kedua varian ADA (`EntriTeks`, PR-029a). Varian yang hilang
//   adalah `typecheck` merah, jadi TIDAK perlu diuji ulang di sini.
//
//   Penjaga ini menangani yang TIDAK bisa dijamin tipe: varian simple yang
//   disalin mentah dari `id`, struktur katalog per fitur, dan kunci yang saling
//   menimpa diam-diam.
//
// Panduan menulis varian simple: docs/panduan-bahasa-sederhana.md
import { describe, expect, it } from "vitest";
import { fiturKatalog, katalog } from "../src/shared/i18n/katalog/semua.js";
import { MODE_BAHASA } from "../src/shared/i18n/tipe.js";

/**
 * Entri yang varian `id`-nya SAMA PERSIS dengan `id-simple`, beserta alasannya.
 *
 * Menyalin `id` ke `id-simple` adalah cara termudah membuat katalog tampak
 * "lengkap" tanpa benar-benar menulis varian sederhananya — dan tipe tidak bisa
 * membedakan salinan malas dari kalimat yang memang sudah sesederhana mungkin.
 * Yang bisa membedakan hanya manusia, jadi penjaga ini memaksa manusia itu
 * menuliskan keputusannya.
 */
const SAMA_DENGAN_SENGAJA: Readonly<Record<string, string>> = {
  "shell.merek": "Nama produk — tidak diterjemahkan dan tidak disederhanakan.",
  "shell.aksi.masuk": "Satu kata sehari-hari; tidak ada bentuk yang lebih sederhana.",
  "shell.luring.cobaLagi": "Label tombol dua kata, sudah memakai kata sehari-hari.",

  // --- auth (PR-030b) ---
  // Sebagian besar di sini adalah LABEL, bukan kalimat. Label yang panjangnya
  // dua-tiga kata sehari-hari tidak punya bentuk yang lebih sederhana, dan
  // mengarang perbedaan hanya membuat kedua varian tidak konsisten satu sama
  // lain — pengguna yang berpindah mode akan menyangka tombolnya berubah.
  "auth.judul": "Nama produk plus dua kata sehari-hari.",
  "auth.nomor.label": "Label dua kata; 'Nomor HP' adalah sebutan sehari-harinya.",
  "auth.nomor.kirim": "Label tombol dua kata sehari-hari.",
  "auth.nomor.mengirim": "Kalimat penanda tunggu, sudah sependek mungkin.",
  "auth.kode.label": "Label yang sudah menyebut bentuknya secara harfiah ('6 angka').",
  "auth.kode.takValid":
    "Kalimat empat kata; menyederhanakannya hanya mengubah kata tanpa menambah kejelasan.",
  "auth.kode.masuk": "Satu kata sehari-hari, sama dengan label aksi di shell.",
  "auth.kode.memeriksa": "Kalimat penanda tunggu, sudah sependek mungkin.",
  "auth.kode.terkirim": "Kalimat empat kata dengan kata sehari-hari.",
  "auth.google.atau": "Satu kata penghubung; tidak ada bentuk yang lebih sederhana.",
  "auth.google.kembali": "Label tautan empat kata sehari-hari, sudah menyebut tujuannya.",

  // --- beranda (PR-032a) ---
  "beranda.hero.daftar": "Ajakan dua kata sehari-hari; label CTA tidak punya bentuk lebih sederhana.",
  "beranda.cara.judul": "Judul bagian tiga kata, seluruhnya kata sehari-hari.",
  "beranda.penutup.daftar":
    "Label tautan tiga kata sehari-hari, dan 'daftar'/'masuk' harus SAMA di kedua varian — " +
    "keduanya muncul lagi di halaman masuk, dan pengguna mencocokkan kata yang tadi ia tekan.",

  // --- shell (PR-032b) ---
  "shell.kesalahan.perluMasuk.masuk":
    "Label aksi empat kata sehari-hari. 'Masuk' harus SAMA dengan label di " +
    "halaman tujuan — pengguna mencocokkan kata yang tadi ia tekan.",

  // --- pengaturan (PR-033a) ---
  // Sebagian besar di sini LABEL, bukan kalimat — pola yang sama dengan auth.
  // Yang perlu dibaca dua kali hanyalah dua nama bagian di bawah.
  "pengaturan.judul": "Satu kata sehari-hari; nama halaman tidak punya bentuk lebih sederhana.",
  "pengaturan.nav.label":
    "Nama landmark navigasi — dibacakan screen reader, tidak tampil di layar. Dua kata sehari-hari.",
  "pengaturan.nav.aksesibilitas":
    "Harus SAMA dengan judul panel tujuannya (`pengaturan.aksesibilitas.judul`) — pengguna " +
    "mencocokkan kata yang tadi ia tekan dengan judul halaman yang terbuka.",
  // --- notification center (PR-050) ---
  "notifikasi.judul":
    "Satu kata sehari-hari; nama halaman tidak punya bentuk lebih sederhana. " +
    "Harus SAMA dengan lencana di kerangka aplikasi — pengguna mencocokkan kata " +
    "yang tadi ia tekan dengan judul halaman yang ia buka.",
  "shell.notifikasi.lencanaKosong":
    "Alasan yang sama dengan `notifikasi.judul`, dan HARUS identik dengannya.",
  "notifikasi.saring.semua": "Satu kata sehari-hari; label saringan tidak punya bentuk lebih sederhana.",
  "notifikasi.saring.belumDibaca":
    "Dua kata sehari-hari, dan HARUS sama dengan penanda pada tiap notifikasi " +
    "(`notifikasi.belumDibacaTanda`) — saringan yang menamai keadaan dengan kata " +
    "berbeda dari penandanya membuat pengguna mengira keduanya hal yang berbeda.",
  "notifikasi.belumDibacaTanda":
    "Alasan yang sama dengan `notifikasi.saring.belumDibaca`, dan HARUS identik dengannya.",
  // --- panel kanal notifikasi (PR-049b) ---
  "pengaturan.notifikasi.email":
    "Label empat kata sehari-hari; 'email' adalah sebutan sehari-harinya di Indonesia.",
  "pengaturan.notifikasi.push":
    "Label lima kata sehari-hari, dan sengaja menyebut TEMPAT kabarnya muncul alih-alih " +
    "istilah 'push' — jadi tidak ada bentuk yang lebih sederhana lagi.",
  "pengaturan.akun.nama": "Label satu kata sehari-hari.",
  "pengaturan.akun.email": "Label satu kata; 'email' adalah sebutan sehari-harinya di Indonesia.",
  "pengaturan.akun.nomor": "Label dua kata; sama dengan label di halaman masuk (`auth.nomor.label`).",
  "pengaturan.akun.belumDiisi": "Dua kata sehari-hari, sudah menyebut keadaannya secara harfiah.",
  "pengaturan.akun.cobaLagi": "Label tombol dua kata, sama dengan `shell.luring.cobaLagi`.",
  // --- hapus akun (PR-033c-1) ---
  // Sebagian besar LABEL. Dua di antaranya — `hapus.tombol` dan
  // `kode.konfirmasi` — sengaja identik meski kalimatnya panjang: keduanya
  // menyebut akibatnya secara harfiah ("Hapus akun saya", "Hapus akun saya
  // sekarang"), dan tidak ada bentuk yang lebih sederhana tanpa MENGABURKAN
  // apa yang akan terjadi. Pada tombol paling final di seluruh aplikasi,
  // mengaburkan adalah kesalahan yang lebih besar daripada mengulang.
  "pengaturan.hapus.judul": "Label dua kata sehari-hari; nama bagian tidak punya bentuk lebih sederhana.",
  "pengaturan.hapus.tombol":
    "Menyebut akibatnya secara harfiah. Menyederhanakannya hanya bisa dengan mengaburkan, " +
    "dan pada tombol ini kabur jauh lebih berbahaya daripada panjang.",
  "pengaturan.hapus.batal": "Satu kata sehari-hari; jalan keluar harus dikenali seketika.",
  "pengaturan.hapus.akibat.judul": "Tiga kata sehari-hari yang sudah menyebut isinya secara harfiah.",
  "pengaturan.hapus.kode.terkirim":
    "Kalimat lima kata dengan kata sehari-hari; nomornya disisipkan apa adanya.",
  "pengaturan.hapus.kode.label": "Label yang sudah menyebut bentuknya secara harfiah ('6 angka').",
  "pengaturan.hapus.kode.konfirmasi":
    "Label tombol paling final di aplikasi ini. Ia menyebut persis apa yang akan terjadi; " +
    "varian yang lebih pendek akan mengurangi kejelasan tepat di tempat yang paling menuntutnya.",
  "pengaturan.hapus.selesai.judul":
    "Kalimat empat kata sehari-hari yang menyatakan keadaan secara harfiah.",

  // --- hapus akun lewat Google (PR-033c-2) ---
  "pengaturan.hapus.google.lanjut":
    "Label tombol tiga kata sehari-hari. 'Google' adalah nama layanan — tidak diterjemahkan " +
    "dan tidak disederhanakan, sama seperti nama produk.",
  "pengaturan.hapus.kembali.masuk":
    "Label aksi empat kata sehari-hari, sama persis dengan `shell.kesalahan.perluMasuk.masuk` — " +
    "keduanya mengantar ke halaman yang sama, dan dua nama untuk satu tujuan membuat pengguna " +
    "menyangka ia sedang menuju tempat yang berbeda.",

  "pengaturan.ekspor.tombol":
    "Label tombol tiga kata sehari-hari. 'Unduh' harus SAMA di kedua varian — ia muncul lagi " +
    "di kalimat pengumuman dan di judul bagiannya, dan pengguna mencocokkan kata yang tadi ia tekan.",
  "pengaturan.aksesibilitas.judul":
    "ISTILAH PRODUK, dan sengaja tidak disederhanakan. Kata ini muncul di navigasi, di judul " +
    "panel, dan kelak di seluruh panel preferensi (PR-036); menggantinya hanya di mode sederhana " +
    "berarti satu tempat yang sama punya dua nama, dan pengguna yang berpindah mode akan " +
    "menyangka ia tersesat.",

  // --- onboarding (PR-035) ---
  // Pola yang sama dengan auth dan pengaturan: yang tersisa identik di sini
  // adalah LABEL dan POLA KALIMAT, bukan penjelasan. Setiap penjelasan di
  // katalog onboarding punya varian sederhananya sendiri — layar ini justru
  // yang paling dibaca pengguna yang membutuhkannya (persona Dimas).
  "onboarding.progres.status":
    "Pola pengumuman, bukan kalimat: isinya hanya nomor, jumlah, dan nama langkah — " +
    "dan ketiganya sudah disederhanakan di kuncinya masing-masing.",
  "onboarding.langkah.ringkasan":
    "Satu kata sehari-hari. Ia muncul sebagai nama langkah DI INDIKATOR PROGRES dan " +
    "sebagai judul langkahnya; dua kata berbeda untuk satu tempat membuat pengguna " +
    "menyangka ia berpindah ke layar lain.",
  "onboarding.aksi.lanjut": "Satu kata sehari-hari; label tombol maju tidak punya bentuk lebih sederhana.",
  "onboarding.aksi.kembali": "Satu kata sehari-hari, sama dengan sebutan tombol kembali peramban.",
  "onboarding.ragam.lainnya": "Satu kata sehari-hari; pilihan penutup daftar.",
  "onboarding.preferensi.skalaNilai":
    "Pola nilai, bukan kalimat: satu angka plus satuannya. 'Persen' adalah kata yang " +
    "dipakai sehari-hari dan tidak punya padanan yang lebih pendek.",
  "onboarding.preferensi.bahasa":
    "Label saklar yang MENYALAKAN mode sederhana itu sendiri. Kalau labelnya ikut " +
    "berganti kata begitu disalakan, pengguna melihat tombol yang barusan ia tekan " +
    "berubah nama — dan tidak punya cara memastikan ia menekan yang benar.",
  "onboarding.preferensi.sentuh": "Label tiga kata sehari-hari yang sudah menyebut akibatnya.",

  // --- pintasan aksesibilitas (PR-036) ---
  // Keduanya memuat kata "Aksesibilitas", dan kata itu ISTILAH PRODUK yang
  // sengaja tidak disederhanakan — alasan yang sama persis dengan
  // `pengaturan.aksesibilitas.judul` di atas. Tautan ini mengantar KE panel
  // itu; menamainya lain di mode sederhana berarti pengguna menekan satu kata
  // lalu mendarat di halaman berjudul kata yang lain.
  "shell.pintas.label":
    "Nama landmark navigasi — dibacakan screen reader, tidak tampil di layar. Dua kata " +
    "sehari-hari sejak PR-040 ('Pintasan halaman'); tidak ada bentuk yang lebih sederhana.",
  "shell.pintas.aksesibilitas":
    "Label tautan dua kata yang keduanya muncul lagi di halaman tujuan ('Pengaturan' sebagai " +
    "judul halaman, 'Aksesibilitas' sebagai judul panel). Pengguna mencocokkan kata yang tadi " +
    "ia tekan — mengubahnya di mode sederhana justru memutus pencocokan itu.",

  // --- profil (PR-040) ---
  // Pola yang sama dengan auth, pengaturan, dan onboarding: yang tersisa
  // identik di sini adalah LABEL dan POLA KALIMAT, bukan penjelasan. SETIAP
  // penjelasan di katalog profil punya varian sederhananya sendiri — dan itu
  // yang paling menentukan, sebab bagian tengah halaman ini meminta data
  // disabilitas seseorang.
  //
  // Satu kelompok perlu dibaca dua kali, yaitu label pencabutan consent. Ia
  // sengaja identik di kedua varian: kalimatnya menyebut akibatnya secara
  // harfiah ("hapus data saya"), dan satu-satunya cara memendekkannya adalah
  // MENGABURKAN apa yang akan terjadi. Pada tindakan yang menghapus data
  // tentang tubuh seseorang, kabur jauh lebih berbahaya daripada panjang —
  // penalaran yang sama persis dengan `pengaturan.hapus.tombol`.
  "profil.cobaLagi": "Label tombol dua kata, sama dengan `shell.luring.cobaLagi`.",
  "profil.aksi.simpan":
    "Label tombol tiga kata sehari-hari. Ia muncul di SETIAP bagian halaman ini; " +
    "dua kata berbeda untuk tombol yang sama membuat pengguna menyangka bagiannya berbeda pula.",
  "profil.status.tersimpan":
    "Pola pengumuman, bukan kalimat: isinya hanya nama bagian, dan nama itu sudah " +
    "disederhanakan di kuncinya masing-masing.",
  "profil.dasar.judul": "Label dua kata sehari-hari; nama bagian tidak punya bentuk lebih sederhana.",
  "profil.dasar.headline":
    "Label dua kata sehari-hari. Penjelasannya ada di `profil.dasar.headlineBantuan`, " +
    "yang PUNYA varian sederhananya sendiri.",
  "profil.dasar.kota": "Satu kata sehari-hari.",
  "profil.dasar.provinsi": "Satu kata sehari-hari.",
  "profil.dasar.disclosureNever": "Dua kata sehari-hari; pilihan paling tegas, dan ketegasannya justru terletak pada kependekannya.",
  "profil.dasar.disclosureSelalu": "Tiga kata sehari-hari, sudah menyebut akibatnya secara harfiah.",
  "profil.sensitif.penanda":
    "Penanda dua kata yang dibacakan screen reader. Ia harus SAMA di kedua varian: pengguna " +
    "yang berpindah mode dan melihat penanda berganti nama tidak punya cara memastikan " +
    "penandanya menandai hal yang sama.",
  "profil.sensitif.cabut":
    "Menyebut akibatnya secara harfiah ('tarik izin dan hapus data ini'). Menyederhanakannya " +
    "hanya bisa dengan mengaburkan salah satu dari dua akibat itu.",
  "profil.sensitif.cabutKonfirmasi":
    "Pertanyaan empat kata sehari-hari yang menyebut persis apa yang akan terjadi.",
  "profil.sensitif.cabutYa":
    "Label tombol paling menentukan di halaman ini. Ia menyebut persis apa yang akan terjadi; " +
    "varian yang lebih pendek akan mengurangi kejelasan tepat di tempat yang paling menuntutnya.",
  "profil.sensitif.cabutBatal": "Satu kata sehari-hari; jalan keluar harus dikenali seketika.",
  "profil.sensitif.dicabut":
    "Dua kalimat pendek berkata sehari-hari, masing-masing satu gagasan — bentuk yang " +
    "justru dituju panduan bahasa sederhana. Tidak ada yang tersisa untuk disederhanakan.",
  "profil.akomodasi.ruang_kerja_tenang": "Tiga kata sehari-hari yang sudah menyebut kebutuhannya secara harfiah.",
  "profil.akomodasi.juru_bahasa_isyarat":
    "Sebutan resmi DAN sehari-hari untuk profesi ini. Menggantinya di mode sederhana berarti " +
    "menamai satu hal dengan dua nama — dan pengguna Tuli, yang paling mungkin memilih opsi " +
    "ini, adalah yang paling dirugikan bila namanya tidak konsisten.",
  "profil.karier.tambah": "Pola label tombol: satu kata kerja sehari-hari plus nama bagian, dan nama itu sudah disederhanakan sendiri.",
  "profil.karier.ubah": "Satu kata sehari-hari.",
  "profil.karier.hapus": "Satu kata sehari-hari; tindakan perusak harus dikenali seketika.",
  "profil.karier.batal": "Satu kata sehari-hari; sama dengan `profil.sensitif.cabutBatal`.",
  "profil.karier.simpanBaris": "Satu kata sehari-hari, sama dengan kata pertama `profil.aksi.simpan`.",
  "profil.karier.hapusLabel":
    "Pola nama aksi untuk screen reader: satu kata kerja plus judul baris yang diisi pengguna sendiri.",
  "profil.karier.ubahLabel":
    "Pola nama aksi untuk screen reader: satu kata kerja plus judul baris yang diisi pengguna sendiri.",
  "profil.karier.ditambah": "Pola pengumuman: judul baris milik pengguna plus dua kata sehari-hari.",
  "profil.karier.diubah": "Pola pengumuman: judul baris milik pengguna plus dua kata sehari-hari.",
  "profil.karier.dihapus": "Pola pengumuman: judul baris milik pengguna plus dua kata sehari-hari.",
  "profil.pengalaman.judul":
    "Dua kata sehari-hari. Ia muncul sebagai judul bagian DAN di dalam label tombol " +
    "'Tambah pengalaman kerja'; dua kata berbeda membuat pengguna menyangka keduanya bagian lain.",
  "profil.pengalaman.satuan":
    "Potongan yang disisipkan ke label tombol dan pengumuman. Harus SAMA dengan judul bagiannya " +
    "(`profil.pengalaman.judul`) — pengguna mencocokkan kata yang tadi ia tekan.",
  "profil.pengalaman.company": "Label dua kata sehari-hari.",
  "profil.pengalaman.description":
    "Sudah berupa pertanyaan sehari-hari empat kata; menyederhanakannya hanya mengubah kata " +
    "tanpa menambah kejelasan.",
  "profil.pendidikan.institution":
    "Label empat kata sehari-hari yang sudah menyebut kedua kemungkinannya ('sekolah atau kampus') " +
    "alih-alih memakai satu istilah payung.",
  "profil.pendidikan.degreeBantuan": "Tiga contoh, tanpa kalimat. Tidak ada yang tersisa untuk disederhanakan.",
  "profil.pendidikan.year": "Label dua kata sehari-hari.",
  "profil.keahlian.levelBantuan": "Tiga contoh, tanpa kalimat. Tidak ada yang tersisa untuk disederhanakan.",

  // --- shell (PR-032a) ---
  "shell.judulDokumen":
    "Pola judul tab, bukan kalimat: isinya hanya nama halaman + nama produk, dan " +
    "keduanya sudah disederhanakan di kuncinya masing-masing.",

  // --- admin (PR-052) ---
  "admin.judul": "Satu kata sehari-hari; nama halaman tidak punya bentuk lebih sederhana.",
  "admin.nav.label":
    "Nama landmark navigasi — dibacakan screen reader, tidak tampil di layar. Dua kata sehari-hari.",
  "admin.nav.ringkasan":
    "Satu kata sehari-hari. Harus SAMA dengan `admin.ringkasan.judul` — pengguna mencocokkan " +
    "kata yang tadi ia tekan dengan judul halaman yang terbuka.",
  "admin.ringkasan.judul": "Satu kata sehari-hari; nama panel tidak punya bentuk lebih sederhana.",

  // --- admin/companies (PR-053) ---
  // Sebagian besar di sini LABEL pendek — nama kolom tabel, judul halaman,
  // label tombol — pola yang sama dengan `pengaturan`/`profil`: dua-tiga kata
  // sehari-hari tidak punya bentuk yang lebih sederhana.
  "admin.nav.companies":
    "Satu kata sehari-hari. Harus SAMA dengan `admin.companies.judul` — pengguna mencocokkan " +
    "kata yang tadi ia tekan dengan judul halaman yang terbuka.",
  "admin.ringkasan.companies.judul": "Satu kata sehari-hari; nama bagian tidak punya bentuk lebih sederhana.",
  "admin.ringkasan.companies.tautan": "Label tautan tiga kata sehari-hari.",
  "admin.companies.judul": "Satu kata sehari-hari; nama halaman tidak punya bentuk lebih sederhana.",
  "admin.companies.tambah": "Label tombol dua kata sehari-hari.",
  "admin.companies.tabelJudul": "Caption tabel dua kata sehari-hari — nama tabelnya sendiri.",
  "admin.companies.kolom.nama": "Judul kolom satu kata.",
  "admin.companies.kolom.kota": "Judul kolom satu kata.",
  "admin.companies.kolom.status": "Judul kolom satu kata, istilah yang sudah dipakai sehari-hari.",
  "admin.companies.kolom.aksi":
    "Judul kolom satu kata; kolom ini hanya berisi tautan Ubah dan judulnya tidak tampil visual, " +
    "tetapi tetap wajib bagi scope=col.",
  "admin.companies.ubah": "Label tautan satu kata sehari-hari.",
  "admin.companies.ubahLabel":
    "Label tombol dua kata + nama perusahaan — sudah menyebut aksinya secara harfiah.",
  "admin.companies.cobaLagi": "Label tombol dua kata sehari-hari, sama dengan `pengaturan.akun.cobaLagi`.",
  "admin.companies.kosong.judul": "Kalimat tiga kata, sudah sesederhana mungkin.",
  "admin.companies.form.judulBuat": "Label tombol/judul dua kata sehari-hari.",
  "admin.companies.form.judulUbah": "Pola judul 'Ubah {nama}' — sudah harfiah.",
  "admin.companies.form.kembaliKeDaftar": "Label tautan empat kata sehari-hari, sudah menyebut tujuannya.",
  "admin.companies.form.nama": "Label kolom dua kata sehari-hari.",
  "admin.companies.form.kota": "Label kolom satu kata.",
  "admin.companies.form.simpan": "Label tombol satu kata sehari-hari.",
  "admin.companies.form.batal": "Label tombol satu kata sehari-hari, sama dengan `pengaturan.hapus.batal`.",
  "admin.companies.verifikasi.dialogBatal": "Label tombol satu kata sehari-hari.",

  // --- admin/jobs (PR-057) ---
  // Pola yang sama dengan admin/companies di atas: label kolom tabel, judul
  // halaman, dan label tombol pendek yang sudah memakai kata sehari-hari.
  "admin.nav.jobs":
    "Satu kata sehari-hari. Harus SAMA dengan `admin.jobs.judul` — pengguna mencocokkan " +
    "kata yang tadi ia tekan dengan judul halaman yang terbuka.",
  "admin.ringkasan.jobs.judul": "Satu kata sehari-hari; nama bagian tidak punya bentuk lebih sederhana.",
  "admin.ringkasan.jobs.tautan": "Label tautan tiga kata sehari-hari.",
  "admin.jobs.judul": "Satu kata sehari-hari; nama halaman tidak punya bentuk lebih sederhana.",
  "admin.jobs.tambah": "Label tombol dua kata sehari-hari.",
  "admin.jobs.tabelJudul": "Caption tabel dua kata sehari-hari — nama tabelnya sendiri.",
  "admin.jobs.kolom.judul": "Judul kolom satu kata.",
  "admin.jobs.kolom.perusahaan": "Judul kolom satu kata, sama dengan `admin.jobs.form.perusahaan`.",
  "admin.jobs.kolom.status": "Judul kolom satu kata, istilah yang sudah dipakai sehari-hari.",
  "admin.jobs.kolom.aksi":
    "Judul kolom satu kata; kolom ini hanya berisi tautan Ubah dan tombol Duplikat, judulnya " +
    "tidak tampil visual tetapi tetap wajib bagi scope=col.",
  "admin.jobs.ubah": "Label tautan satu kata sehari-hari.",
  "admin.jobs.ubahLabel": "Label tautan dua kata + judul lowongan — sudah menyebut aksinya secara harfiah.",
  "admin.jobs.cobaLagi": "Label tombol dua kata sehari-hari, sama dengan `admin.companies.cobaLagi`.",
  "admin.jobs.kosong.judul": "Kalimat tiga kata, sudah sesederhana mungkin.",
  "admin.jobs.form.judulBuat": "Label tombol/judul dua kata sehari-hari.",
  "admin.jobs.form.judulUbah": "Pola judul 'Ubah {judul}' — sudah harfiah.",
  "admin.jobs.form.kembaliKeDaftar": "Label tautan empat kata sehari-hari, sudah menyebut tujuannya.",
  "admin.jobs.form.bagianDasar": "Judul bagian dua kata sehari-hari, tidak ada istilah teknis.",
  "admin.jobs.form.perusahaan": "Label kolom satu kata.",
  "admin.jobs.form.perusahaanPlaceholder": "Instruksi dua kata sehari-hari, sudah sesederhana mungkin.",
  "admin.jobs.form.judul": "Label kolom dua kata sehari-hari.",
  "admin.jobs.form.jenisPekerjaanLabel": "Label kolom dua kata sehari-hari, tidak ada bentuk lebih sederhana.",
  "admin.jobs.form.jenisPekerjaan.internship":
    "Satu kata sehari-hari; tidak ada bentuk yang lebih sederhana, sama dengan `companies.lowongan.tipe.internship`.",
  "admin.jobs.form.kota": "Label kolom satu kata, sama dengan `admin.companies.form.kota`.",
  "admin.jobs.form.provinsi": "Label kolom satu kata, istilah yang sudah dipakai sehari-hari.",
  "admin.jobs.form.bagianGaji": "Judul bagian satu kata sehari-hari.",
  "admin.jobs.form.simpan": "Label tombol satu kata sehari-hari, sama dengan `admin.companies.form.simpan`.",
  "admin.jobs.form.batal": "Label tombol satu kata sehari-hari, sama dengan `admin.companies.form.batal`.",
  "admin.jobs.tutup.tombol":
    "Tiga kata sehari-hari — beda dengan 'Verifikasi perusahaan ini' (companies), 'tutup' sudah " +
    "kata umum sehingga tidak butuh kata ganti yang lebih sederhana lagi.",
  "admin.jobs.tutup.dialogYa": "Label tombol dua kata sehari-hari, 'tutup' tidak butuh kata ganti.",
  "admin.jobs.tutup.dialogBatal":
    "Label tombol satu kata sehari-hari, sama dengan `admin.companies.verifikasi.dialogBatal`.",

  // --- Profil publik perusahaan (PR-054) ---
  "companies.cobaLagi": "Label tombol dua kata sehari-hari, sama dengan `pengaturan.akun.cobaLagi`.",
  "companies.kembaliBeranda": "Label tautan tiga kata sehari-hari, sudah menyebut tujuannya.",
  "companies.info.kotaLabel": "Label satu kata, sama dengan `admin.companies.kolom.kota`.",
  "companies.lowongan.tipe.internship": "Satu kata sehari-hari; tidak ada bentuk yang lebih sederhana.",
};

const entri = Object.entries(katalog) as ReadonlyArray<
  readonly [string, Readonly<Record<string, string>>]
>;

function identik([, e]: readonly [string, Readonly<Record<string, string>>]): boolean {
  return e.id === e["id-simple"];
}

describe("katalog — varian simple yang disalin mentah", () => {
  it("setiap entri identik SUDAH didaftarkan beserta alasannya", () => {
    const belumTerdaftar = entri
      .filter(identik)
      .map(([kunci]) => kunci)
      .filter((kunci) => !Object.hasOwn(SAMA_DENGAN_SENGAJA, kunci));

    expect(
      belumTerdaftar,
      "Varian `id-simple` sama persis dengan `id`. Tulis varian sederhananya " +
        "(lihat docs/panduan-bahasa-sederhana.md), atau daftarkan di " +
        "SAMA_DENGAN_SENGAJA beserta alasannya bila kalimatnya memang sudah sederhana.",
    ).toEqual([]);
  });

  it("daftar pengecualian tidak menyimpan entri basi", () => {
    // Arah sebaliknya. Tanpa ini, kunci yang sudah diperbaiki varian
    // sederhananya akan meninggalkan alasan yang tidak lagi benar — dan daftar
    // pengecualian yang memuat kebohongan berhenti bisa dipercaya.
    const takLagiIdentik = Object.keys(SAMA_DENGAN_SENGAJA).filter((kunci) => {
      const e = katalog[kunci as keyof typeof katalog] as Record<string, string> | undefined;
      return e === undefined || e.id !== e["id-simple"];
    });

    expect(
      takLagiIdentik,
      "Entri ini tidak lagi identik (atau kuncinya sudah hilang) — hapus dari SAMA_DENGAN_SENGAJA.",
    ).toEqual([]);
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    // Katalog kosong akan membuat kedua test di atas lulus tanpa memeriksa apa
    // pun. Dan bila SEMUA entri identik, katalog `id-simple` sesungguhnya tidak
    // pernah ditulis.
    expect(entri.length).toBeGreaterThan(5);
    expect(entri.filter(identik).length).toBeLessThan(entri.length / 2);
  });
});

describe("katalog — struktur per fitur (AC 4)", () => {
  it("setiap kunci berprefiks nama fiturnya", () => {
    // Prefiks yang cocok dengan berkasnya membuat kunci bisa dilacak dengan
    // grep apa adanya — dan mencegah satu fitur menaruh kuncinya di katalog
    // fitur lain, tempat ia tidak akan pernah dicari.
    for (const { nama, entri: milikFitur } of fiturKatalog) {
      for (const kunci of Object.keys(milikFitur)) {
        expect(kunci.startsWith(`${nama}.`), `kunci "${kunci}" tidak berprefiks "${nama}."`).toBe(
          true,
        );
      }
    }
  });

  it("tidak ada kunci yang saling menimpa antar fitur", () => {
    // Katalog dirakit dengan spread; kunci kembar akan menimpa DIAM-DIAM, dan
    // fitur yang kalah kehilangan teksnya tanpa satu pun galat.
    const semua = fiturKatalog.flatMap(({ entri: e }) => Object.keys(e));
    expect(semua).toHaveLength(new Set(semua).size);
  });

  it("`katalog` dan `fiturKatalog` memuat kunci yang sama", () => {
    // Keduanya sengaja terpisah (lihat catatan di katalog/index.ts). Penjaga
    // ini yang membuat pemisahan itu aman: fitur yang ditambahkan ke salah satu
    // saja langsung merah.
    const dariFitur = fiturKatalog.flatMap(({ entri: e }) => Object.keys(e)).sort();
    expect(Object.keys(katalog).sort()).toEqual(dariFitur);
  });

  it("setiap fitur menyumbang setidaknya satu kunci", () => {
    for (const { nama, entri: e } of fiturKatalog) {
      expect(Object.keys(e).length, `fitur "${nama}" kosong`).toBeGreaterThan(0);
    }
  });
});

describe("katalog — isi entri", () => {
  it("tidak ada varian kosong", () => {
    // Tipe menjamin field-nya ADA; string kosong tetap lolos tipe dan akan
    // tampil sebagai ruang hampa di layar.
    for (const [kunci, e] of entri) {
      for (const mode of MODE_BAHASA) {
        expect(e[mode]?.trim(), `"${kunci}" varian ${mode} kosong`).not.toBe("");
      }
    }
  });

  it("tidak ada spasi menggantung di awal/akhir", () => {
    // Spasi tak sengaja terbaca screen reader sebagai jeda dan menggeser
    // tata letak — tidak terlihat saat review, terlihat di layar.
    for (const [kunci, e] of entri) {
      for (const mode of MODE_BAHASA) {
        expect(e[mode], `"${kunci}" varian ${mode} punya spasi menggantung`).toBe(e[mode]?.trim());
      }
    }
  });
});
