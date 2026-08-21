# Log Gerbang Riset — SignBridge v2

> **Status gerbang:** BELUM TERPENUHI — syarat 2 ✅ terpenuhi (pendanaan ada sejak 2026-08-21); syarat 1 ⚠️ sebagian; syarat 3 ❌ belum
> **Sumber keputusan:** [ADR-010](adr/ADR-010-signbridge-v2-service-terpisah.md), SDD §7.4
> **Terkait:** [Phase 14 — SignBridge v1 & Simplify](implementation/phase-14-signbridge-simplify.md) (PR-084..PR-087)
> **Terakhir diperbarui:** 2026-08-21

## 1. Untuk apa dokumen ini ada

ADR-010 menutup SignBridge v2 di balik gerbang riset dengan tiga syarat, dan menutup
kalimatnya dengan larangan yang tidak ambigu:

> "Tidak ada kode v2 yang ditulis sebelum gerbang tersebut."

Larangan itu mudah dipatuhi hari ini dan sulit dipatuhi nanti — saat sebuah dataset
muncul, terlihat menjanjikan, dan tidak ada seorang pun yang ingat persis apa yang
gerbangnya minta. Dokumen ini adalah tempat menaruh bukti sebelum lupa: setiap kandidat
dataset dicatat beserta hasil penilaiannya terhadap kriteria di §2, supaya evaluasi
gerbang di Fase 3 tidak dimulai dari nol dan tidak dimulai dari kesan.

Dokumen ini **bukan** izin untuk mulai. Ia justru alat untuk menunjukkan kapan kita belum
boleh mulai, dengan alasan yang bisa diperiksa orang lain.

## 2. Kriteria penilaian dataset

Kriteria diturunkan dari apa yang SignBridge v2 sebenarnya harus lakukan menurut SDD §7.4
— aliran frame video masuk, teks parsial keluar — bukan dari apa yang kebetulan tersedia
di internet.

| Kode | Kriteria | Mengapa ini mengikat |
|------|----------|----------------------|
| **K1** | **Lisensi mengizinkan penggunaan produk** — komersial dan karya turunan | Model yang dilatih adalah karya turunan. Lisensi NonCommercial (NC) atau NoDerivatives (ND) menutup jalur produk, bukan sekadar merepotkan. |
| **K2** | **Provenance & persetujuan penutur terdokumentasi** | Datanya adalah tubuh orang Tuli. Platform disabilitas yang melatih model dari rekaman tanpa jejak persetujuan mengambil posisi moral yang tidak bisa dipertahankan, terlepas dari apa kata lisensinya. |
| **K3** | **Tugas cocok dengan v2** — isyarat kontinu → teks, bukan pengenalan terisolasi | Isyarat terisolasi (satu klip, satu kata, sudah dipotong) tidak memuat ko-artikulasi maupun batas antar-tanda. Model darinya tidak bisa diperbaiki menjadi penerjemah; ia harus diganti. |
| **K4** | **Skala & keluasan kosakata** | Percakapan kerja butuh ribuan tanda. Puluhan kata adalah demo. |
| **K5** | **Keragaman penutur + evaluasi signer-independent** | Model yang diuji pada penutur yang sudah dilihatnya saat latihan akan melaporkan akurasi yang tidak akan pernah ia capai di depan pengguna asli. |
| **K6** | **Gerakan & penanda non-manual terekam** | BISINDO memakai ekspresi wajah dan arah pandang sebagai penanda gramatikal. Data gambar statis, atau video yang wajahnya diblur, membuang lapisan tata bahasa. |
| **K7** | **Varian regional cocok dengan kota target** | BISINDO berbeda antar daerah. Model dari varian yang salah gagal tepat di depan pengguna Tuli pertama yang mencobanya. |

Legenda penilaian: ✅ terpenuhi · ⚠️ sebagian / tidak jelas · ❌ tidak terpenuhi

## 3. Ringkasan kandidat

| # | Dataset | Bentuk | Kelas | Lisensi | K1 | K2 | K3 | K4 | K5 | K6 | K7 |
|---|---------|--------|-------|---------|----|----|----|----|----|----|----|
| D1 | [Multimodal BISINDO Corpus](https://data.mendeley.com/datasets/235c78xbmk/2) | Gambar + video | 26 (A–Z) | CC BY 4.0 | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ⚠️ |
| D2 | [BISINDO Video Dataset](https://data.mendeley.com/datasets/f33k9w86wr/1) | Urutan JPG | 6 kategori | CC BY 4.0 | ✅ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ |
| D3 | [BISINDO Dataset (UM)](https://data.mendeley.com/datasets/4xnkvr88tk/1) | Gambar | 26 (A–Z) | CC BY 4.0 | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | ❌ | ⚠️ |
| D4 | [BISINDO-12](https://www.kaggle.com/datasets/jnzega/dataset-bisindo) | Video + keypoint | 12 kata | **konflik** | ❌ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ⚠️ |
| D5 | [Bisindo Kosakata](https://universe.roboflow.com/justkai-j0o8y/bisindo-kosakata-0mulz) | Gambar (deteksi objek) | 38 kata | CC BY 4.0 | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ |

**Tidak satu pun memenuhi K3.** Lihat §5.

## 4. Penilaian per dataset

### D1 — A Multimodal BISINDO Corpus

* **Sumber:** <https://data.mendeley.com/datasets/235c78xbmk/2> (v2)
* **Penulis:** Lilis Nur Hayati, Anik Nur Handayani, Wahyu Sakti Gunawan Irianto, Rosa Andrie Asmara, Dolly Indra
* **Isi:** 19.760 sampel gambar hasil ekstraksi dari video, 26 kelas abjad A–Z, kondisi
  dalam ruangan (terang & redup) dan luar ruangan
* **Lisensi:** CC BY 4.0

**Penilaian.** Variasi pencahayaannya nyata dan berguna, tapi isinya **fingerspelling** —
mengeja huruf, bukan berbahasa isyarat (K3, K4 ❌). Versi publiknya berasal dari **satu
peraga dengan wajah diblur**. Peng-aburan itu keputusan privasi yang benar dan patut
dihormati, namun konsekuensinya untuk kita jelas: penanda non-manual hilang seluruhnya
(K6 ❌) dan tidak ada variasi antarpenutur untuk diuji (K5 ❌).

**Kegunaan realistis:** materi latih pengenal abjad, atau data pembanding. Bukan bahan v2.

### D2 — BISINDO Video Dataset

* **Sumber:** <https://data.mendeley.com/datasets/f33k9w86wr/1> · DOI 10.17632/f33k9w86wr.1
* **Penulis:** Tito Sugiharto (Universitas Kuningan, Telkom University), 27 Mei 2025
* **Isi:** 6 kategori — abjad (2:27), angka (0:42), hari (0:40), sapaan (1:55),
  keluarga (3:48), cerita pendek (4:09); video dikonversi ke urutan JPG
* **Lisensi:** CC BY 4.0

**Penilaian.** Satu-satunya yang memuat **cerita pendek** — yaitu isyarat kontinu yang
sesungguhnya. Sayangnya total durasi seluruh dataset hanya sekitar **13 menit dari satu
penutur**, dan tidak ada anotasi temporal maupun transkrip yang menyertainya. Isyarat
kontinu tanpa anotasi tidak bisa dipakai melatih apa pun (K3 ⚠️→❌); yang tersisa hanya
nilai ilustratif.

Konversi ke JPG juga menghapus informasi waktu antar-frame yang seharusnya menjadi
kekuatan format video (K6 ⚠️).

### D3 — BISINDO Dataset (Universitas Negeri Malang)

* **Sumber:** <https://data.mendeley.com/datasets/4xnkvr88tk/1> · DOI 10.17632/4xnkvr88tk.1
* **Penulis:** Arya Raden, Muhammad Asshafi (Universitas Negeri Malang), 3 Juli 2026
* **Isi:** gambar abjad A–Z sesuai standar Kemendikdasmen, kamera ELP fisheye 180°,
  jarak 30–60 cm, 7 partisipan
* **Lisensi:** CC BY 4.0

**Penilaian.** Prosedur pengambilannya paling terdokumentasi di antara ketiga dataset
Mendeley, dan **7 partisipan** adalah keragaman terbaik di kelompok itu (K5 ⚠️ — jumlahnya
cukup, tapi pembagian train/test per partisipan tidak dinyatakan). Tetap saja: abjad,
gambar statis (K3, K4, K6 ❌).

Catatan teknis: lensa **fisheye 180°** memasukkan distorsi geometris yang khas perangkat
itu. Model yang dilatih tanpa koreksi akan terikat pada kamera tersebut, sementara
pengguna kita memakai kamera ponsel biasa.

### D4 — BISINDO-12 (turunan WL-BISINDO)

* **Sumber:** <https://www.kaggle.com/datasets/jnzega/dataset-bisindo> (v3, 9 Des 2025, 1,17 GB)
* **Penulis:** J. N. Zega — **karya turunan** dari
  [WL-BISINDO](https://www.kaggle.com/datasets/glennleonali/wl-bisindo) oleh Glenn Leonali,
  Grace Oktaviani Kindy, dkk.
* **Isi:** 12 kata (air, belajar, cari, hari, ingat, lagi, maaf, makan, motor, saya,
  terima kasih, tuli); ~600 video .mp4 + keypoint MediaPipe Holistic (.npy, 225 dimensi:
  pose 99 + tangan kiri 63 + tangan kanan 63); anotasi ELAN start–end per isyarat
* **Split:** **signer-independent** — train signer 00/01/04, val 02, test 03
* **Sumber asli:** 1.600 video, 32 isyarat, 5 penutur, **varian regional Banten**

**Penilaian metodologi — terbaik dari kelimanya.** Isyarat kata (bukan ejaan), anotasi
ELAN yang membuang gerakan diam di ujung klip, dan pembagian data **per penutur**. Poin
terakhir itu yang membedakan pekerjaan serius dari yang tidak: penulisnya paham bahwa
menguji model pada penutur yang sudah ia lihat saat latihan menghasilkan angka yang
bohong (K5 ✅, K2 ✅).

**Tetapi lisensinya menutup pintu (K1 ❌), dan ini yang menentukan:**

| Tempat | Lisensi tertulis |
|--------|------------------|
| Field metadata Kaggle | **CC BY-ND 4.0** (NoDerivatives) |
| Teks deskripsi di halaman yang sama | **CC BY-NC 4.0** (NonCommercial) |
| Dataset sumber (WL-BISINDO) | **CC BY-NC 4.0** |

Dua pernyataan yang saling bertabrakan di satu halaman berarti status lisensinya belum
diselesaikan penulisnya. Dan kedua pembacaan sama-sama menutup jalan kita:

* Bila **ND** yang berlaku — melatih lalu mendistribusikan model adalah karya turunan.
  Tertutup.
* Bila **NC** yang berlaku — dan ini yang mengikat, karena lisensi sumber ikut turun ke
  karya turunan — maka pertanyaannya adalah apakah Nawasena, platform ketenagakerjaan
  dengan sisi perusahaan, termasuk "penggunaan komersial" dalam definisi CC. **Itu
  keputusan hukum, bukan keputusan engineering**, dan bukan keputusan yang boleh diambil
  diam-diam lewat sebuah commit.

Catatan tambahan: 12 kata (32 di sumbernya) adalah skala demo (K4 ❌); keypoint 225-dimensi
mencakup pose dan kedua tangan tetapi **tidak wajah**, sehingga penanda non-manual tetap
hilang meski MediaPipe Holistic sebenarnya menyediakannya (K6 ⚠️); dan varian Banten belum
tentu cocok dengan kota target kita (K7 ⚠️, lihat §6).

**Tindakan yang membuka dataset ini:** hubungi penulis WL-BISINDO untuk izin tertulis dan
konfirmasi lisensi. Mereka akademisi dengan jejak publik yang bisa dihubungi. Inilah bentuk
konkret dari kata **"termitrakan"** di ADR-010 — selama ini kita membacanya sebagai
"datasetnya ada", padahal yang dimaksud adalah izin yang jelas.

### D5 — Bisindo Kosakata (Roboflow Universe)

* **Sumber:** <https://universe.roboflow.com/justkai-j0o8y/bisindo-kosakata-0mulz>
* **Penulis:** Justkai · diperbarui ~November 2025
* **Isi:** 2.850 gambar, **38 kelas kata** (ambil, apa, bantu, berdoa, berhenti, berjalan,
  berpikir, membaca, menulis, menggambar, tolong, terima kasih, …); anotasi **kotak
  pembatas (object detection)**, model YOLOv11s terlatih tersedia
* **Metrik yang dilaporkan:** mAP@50 98,6% · presisi 95,4% · recall 98,2%
* **Lisensi:** CC BY 4.0

**Penilaian.** **Lisensinya paling bersih dari kelima kandidat** — CC BY 4.0 tanpa klausa
NC maupun ND — dan **kosakatanya paling banyak** (38 kata, di atas WL-BISINDO). Dua hal itu
nyata dan patut dicatat.

Tiga hal lain membatalkannya sebagai bahan v2:

1. **Tugasnya deteksi objek pada frame statis (K3, K6 ❌).** Kata seperti *berjalan*,
   *membaca*, *menulis* adalah isyarat **gerak**. Satu frame diam tidak dapat
   membedakannya secara andal. Dataset ini memampatkan kata menjadi pose tangan, dan yang
   dibuang justru dimensi yang menentukan maknanya.

2. **Metrik 98,6% adalah tanda bahaya, bukan prestasi (K5 ❌).** 2.850 gambar dibagi 38
   kelas ≈ 75 gambar per kelas, tanpa metodologi pembagian data yang dinyatakan di mana
   pun. Angka mendekati sempurna pada data sekecil itu hampir selalu berarti frame dari
   sesi rekaman yang sama bocor melintasi train/val/test — model mengenali kembali gambar
   yang praktis sama, bukan menggeneralisasi. Bandingkan dengan D4 yang memisahkan per
   penutur secara eksplisit dan karena itu jujur.

3. **Nol provenance (K2 ❌).** Halamannya menyatakan "A description for this project has not
   been published yet". Tidak diketahui siapa yang memeragakan, berapa orang, di mana, dan
   apakah ada persetujuan. Lisensi CC BY 4.0 di Roboflow adalah **pilihan dropdown
   pengunggah** — platform tidak memverifikasi bahwa pengunggah berhak memberikannya. Untuk
   dataset berisi tubuh orang, klaim lisensi tanpa provenance adalah klaim yang tidak dapat
   diperiksa, sehingga K1 turun menjadi ⚠️.

**Ringkasnya: lisensi terbaik, provenance terburuk.** Berguna sebagai pembanding dan sebagai
petunjuk cakupan kosakata yang mungkin, bukan sebagai bahan latih yang bisa
dipertanggungjawabkan.

## 5. Temuan lintas-dataset: kesenjangan yang tidak tertutup oleh penambahan dataset

Kelima kandidat, digabungkan sekalipun, adalah **pengenalan isyarat terisolasi** (*isolated
sign recognition*): satu klip atau satu gambar, satu label, batas awal-akhir sudah
ditentukan manusia. SignBridge v2 sebagaimana didefinisikan SDD §7.4 adalah **terjemahan
kontinu**: aliran frame masuk tanpa batas yang ditandai, teks parsial keluar.

Di antara keduanya terdapat masalah-masalah yang tidak ada datanya di sini sama sekali:

* **Segmentasi** — menemukan sendiri di mana satu tanda berakhir dan berikutnya dimulai.
* **Ko-artikulasi** — bentuk sebuah tanda berubah tergantung tanda sebelum dan sesudahnya.
* **Tata bahasa BISINDO** — urutan kata, penanda non-manual, penggunaan ruang. Tidak satu
  pun terwakili dalam data berlabel kata tunggal.

**Konsekuensi untuk gerbang:** menambah dataset abjad atau kata terisolasi yang keenam,
ketujuh, dan kedelapan **tidak akan menggerakkan syarat K3**. Yang dibutuhkan adalah jenis
data yang berbeda — korpus BISINDO kontinu beranotasi (gloss + terjemahan sejajar) — dan
sejauh penelusuran ini, korpus semacam itu belum tersedia publik untuk BISINDO.

**Opsi yang terbuka sejak pendanaan tersedia (2026-08-21).** Selama tidak ada anggaran,
satu-satunya strategi adalah menunggu ada orang lain merilis korpus yang kita butuhkan —
strategi yang tidak punya tanggal. Dengan dana, muncul jalan ketiga di samping *build* dan
*partner* yang disebut ADR-010: **membangun korpusnya sendiri bersama komunitas Tuli.**

Yang membuat opsi ini masuk akal justru posisi kita: Nawasena sudah harus merekrut juru
bahasa BISINDO untuk kamus video SignBridge **v1** (Phase 14) — kebutuhan yang PRD §17
tandai sebagai celah anggaran yang belum tertutup. Perekaman korpus v2 dan produksi konten
v1 memakai orang yang sama, studio yang sama, dan hubungan komunitas yang sama. Mendanai
keduanya sekaligus jauh lebih murah daripada dua kali membangun kepercayaan dari nol.

Ini juga satu-satunya jalur yang menyelesaikan **K2** alih-alih menghindarinya: penutur
yang kita rekam adalah orang yang kita ajak bekerja sama, dengan persetujuan tertulis dan
kompensasi yang layak — bukan wajah tak dikenal dari unggahan tanpa deskripsi. Untuk
platform yang tujuannya menempatkan penyandang disabilitas ke pekerjaan, membayar penutur
Tuli untuk membangun data yang melatih produknya bukan sekadar praktik data yang benar;
ia adalah produknya bekerja.

Konsekuensi anggaran yang perlu diputuskan lebih dulu: berapa bagian dana yang ke
**produksi data** (juru bahasa, studio, anotator ELAN, waktu komunitas) dan berapa ke
**komputasi**. Berdasarkan §4, kesenjangan terbesar ada di data — dan komputasi yang
menganggur menunggu data adalah biaya yang terbakar tanpa hasil.

**Pertanyaan produk yang terbuka (untuk owner, bukan untuk engineer):** kalau data yang
tersedia hanya sanggup mendukung *pengenal kosakata*, apakah "pengenal kosakata BISINDO"
adalah fitur yang layak dengan namanya sendiri — terpisah dari, dan tidak dipasarkan
sebagai, penerjemah? Itu keputusan lingkup produk yang belum pernah diambil. Dokumen ini
hanya mencatat bahwa keputusan itu kini ada di meja.

## 6. Status tiga syarat gerbang ADR-010

| # | Syarat (ADR-010) | Status | Catatan |
|---|------------------|--------|---------|
| 1 | Dataset BISINDO tersedia/termitrakan | ⚠️ **sebagian** | Tersedia untuk isyarat **terisolasi** (5 kandidat, §3–§4). Tidak tersedia untuk **terjemahan kontinu** (§5). "Termitrakan" belum: belum ada satu pun izin tertulis dari penulis mana pun. |
| 2 | Pendanaan GPU jelas | ✅ **terpenuhi** | Dana tersedia — dinyatakan owner, 2026-08-21. Nominal dan alokasinya belum dicatat di sini; isi saat ditetapkan. Tiga catatan: (a) dana ini **tidak harus habis ke GPU** — hambatan terbesar sekarang **data, bukan komputasi** (§5); (b) untuk spike skala D4 (keypoint 225-dim, belasan kelas), GRU/LSTM kecil cukup dilatih di CPU dalam hitungan menit dan diinferensi di peramban, jadi spike tidak perlu menunggu belanja perangkat apa pun; (c) VPS produksi tetap tanpa GPU (ADR-006) — v2 memang host terpisah, jadi pendanaan ini tidak mengubah arsitektur monolith. |
| 3 | North Star awal tercapai | ❌ **belum** | Metrik utama = jumlah penempatan kerja. Produk belum rilis. Posisi backlog per 2026-08-21: **PR-037 dari 119, Phase 05 dari 19**. SignBridge **v1** (Phase 14, PR-084..PR-087) belum dimulai — tabel `sign_videos` sudah ada dari PR-011, modul `signbridge` belum lahir. |

**Kesimpulan: gerbang tetap tertutup** — kini oleh syarat 1 dan 3 saja. Larangan ADR-010 atas
kode v2 masih berlaku penuh; gerbangnya konjungtif, bukan mayoritas suara.

Yang berubah dengan hadirnya pendanaan bukanlah status gerbang, melainkan **daftar pilihan
yang kini terbuka untuk menutup syarat 1** — lihat §5 dan §7. Uang tidak membeli korpus
BISINDO kontinu yang sudah jadi (tidak ada yang dijual), tetapi uang membuat kita bisa
**membangunnya bersama komunitas Tuli**, dan itu jalan yang sebelumnya tertutup.

## 7. Tindakan berikutnya (urut prioritas)

Diperbarui 2026-08-21 (kedua kalinya) setelah eksperimen gerbang §10 dan demo publik §11
masuk rencana. Urutannya mengikuti ketergantungan nyata, bukan kemudahan.

1. **Tetapkan pembagian anggaran: produksi data vs komputasi** — putuskan sebelum belanja
   apa pun. §5 berargumen bagian terbesar seharusnya ke produksi data. Catat angkanya di
   §6 baris syarat 2 supaya keputusannya punya jejak.
2. **Clearance D4 — hubungi penulis WL-BISINDO dan pengunggah BISINDO-12** (§11.3). Minta
   konfirmasi tertulis: lisensi mana yang berlaku (ND atau NC), dan izin **penyajian
   publik** untuk demo pameran. Kini bertenggat — pameran tidak menunggu. Bisa disertai
   tawaran kompensasi atau kerja sama riset, yang sebelumnya tidak bisa kita ajukan. Ini
   juga satu-satunya jalan mengubah status "tersedia" menjadi "termitrakan" di §6.
3. **Jalankan eksperimen gerbang** (§10) — evaluasi speaker-independent pada D4, termasuk
   kurva jumlah penutur. Tidak menunggu butir 2 selesai (jalur tertutup, tidak
   didistribusikan), tetapi artefaknya tidak boleh tampil publik sebelum butir 2 beres.
4. **Siapkan demo publik** (§11) — halaman statis offline, label SignBridge Lab, plus
   **fallback abjad D1+D3 disiapkan sejak awal** agar pameran tetap jalan bila clearance
   belum turun.
5. **Rancang program perekaman korpus bersama komunitas Tuli** (§5) — **ukurannya
   ditentukan hasil butir 3**, jadi jangan dikunci lebih dulu. Gabungkan dengan perekrutan
   juru bahasa untuk konten SignBridge v1 (Phase 14), yang PRD §17 tandai sebagai celah
   anggaran. Satu program, dua kebutuhan terpenuhi. Butuh: protokol persetujuan tertulis,
   skema kompensasi, daftar kosakata prioritas, dan alur anotasi (ELAN, mengikuti pola D4
   yang sudah terbukti rapi).
6. **Telusuri keberadaan korpus BISINDO kontinu beranotasi** — bila tetap tidak ada, catat
   ketiadaannya di sini sebagai temuan; itu argumen terkuat untuk butir 5 dan masukan bagi
   keputusan **build vs partner** di ADR-010.
7. **Bawa pertanyaan lingkup di akhir §5 ke owner** — "pengenal kosakata" sebagai fitur
   tersendiri, ya atau tidak.
8. **Kerjakan SignBridge v1 sesuai urutan** (Phase 14) — kamus video oleh juru bahasa
   manusia. Inilah nilai BISINDO yang nyata dan tidak terblokir riset, persis sebagaimana
   dirancang ADR-010. Dengan pendanaan tersedia, celah konten yang dicatat PRD §17 kini
   dapat ditutup — dan bila digabungkan dengan butir 5, rekamannya sekaligus menjadi bahan
   korpus v2.

## 8. Cara memperbarui dokumen ini

Saat kandidat dataset baru muncul: nilai terhadap **ketujuh kriteria di §2 sebelum**
menambahkannya ke §3–§4, dan tulis alasan setiap ⚠️ dan ❌. Kandidat yang gagal pun tetap
dicatat — daftar yang hanya memuat kandidat menjanjikan akan membuat gerbang tampak lebih
dekat daripada keadaan sebenarnya, dan itu justru kegagalan yang dokumen ini dibuat untuk
mencegah.

Perbarui §6 hanya bila status syarat benar-benar berubah, dengan bukti yang dapat ditunjuk
(surat izin, alokasi anggaran, angka penempatan kerja).

## 9. Riwayat

| Tanggal | Perubahan |
|---------|-----------|
| 2026-08-21 | Dokumen dibuat. Lima kandidat dinilai (D1–D5). Gerbang dinyatakan tertutup: syarat 1 sebagian, syarat 2 & 3 belum terpenuhi. |
| 2026-08-21 | **Syarat 2 (pendanaan GPU) → ✅ terpenuhi** atas pernyataan owner. Gerbang tetap tertutup oleh syarat 1 & 3. §5 ditambah opsi membangun korpus sendiri bersama komunitas Tuli — jalan yang sebelumnya tertutup tanpa anggaran. §7 diurut ulang. Nominal & alokasi anggaran belum tercatat. |
| 2026-08-21 | **§10 (eksperimen gerbang) dan §11 (demo publik) ditambahkan** atas keputusan owner. D4 ditetapkan sebagai dataset eksperimen **dan** kandidat utama demo interaktif 12 kata; clearance lisensi D4 menjadi **gerbang sebelum pameran**, bukan alasan mencoret D4. D1+D3 dicatat sebagai fallback demo. Nama mengikat: **SignBridge Lab / prototipe pengenal isyarat** — bukan `v2`, bukan penerjemah BISINDO. §7 diurut ulang mengikuti §10–§11. ADR-010 tidak diubah. Belum ada kode. |
| _(kosong)_ | Hasil clearance D4 — isi tanggal dan hasilnya di sini (§11.3). |
| _(kosong)_ | Hasil eksperimen gerbang — isi ringkasan angka dan rekomendasi ukuran korpus di sini (§10.10). |

## 10. Eksperimen gerbang — SignBridge Lab

> **Status: rencana. Belum ada kode, belum ada dependency, belum ada pipeline.**

### 10.1 Status & posisi — baca ini sebelum bagian mana pun

Eksperimen ini bernama **SignBridge Lab**, atau **prototipe pengenal isyarat**. Nama itu
mengikat, di dokumen maupun di depan publik (§11.2).

Yang **bukan** dirinya:

* **Bukan `SignBridge v2`.** Definisi v2 tetap sebagaimana ADR-010 dan SDD §7.4 —
  terjemahan dua arah kontinu, service GPU terpisah di belakang AI Gateway. **ADR-010
  tidak diubah oleh dokumen ini, dalam bentuk apa pun.**
* **Bukan penerjemah BISINDO.** Ia mengenali kata terisolasi dari daftar tertutup. Itu
  tugas yang berbeda secara kategori, bukan versi kecil dari terjemahan (§5).
* **Bukan bagian Nawasena production.** Tidak ada endpoint, tidak ada UI di produk, tidak
  ada baris kode di `apps/api` maupun `apps/worker`.

Yang **memang** dirinya: riset yang menghasilkan **bukti untuk gerbang** ADR-010. ADR-010
melarang menulis kode v2 sebelum gerbang terbuka; ia tidak melarang — dan justru
mengandaikan — riset yang dievaluasi per kuartal di Fase 3. Eksperimen ini adalah masukan
bagi keputusan **build vs partner**, bukan pelaksanaannya.

### 10.2 Tujuan — tiga pertanyaan yang dijawab

| | Pertanyaan | Kenapa penting |
|---|---|---|
| **RQ1** | Apakah pengenalan kata BISINDO menggeneralisasi ke **penutur yang belum pernah dilihat model**, pada skala data seperti D4? | Ini satu-satunya angka yang meramalkan perilaku di depan pengguna asli. |
| **RQ2** | **Berapa penutur** yang perlu direkam agar akurasi memadai? | Menjawab pertanyaan anggaran §5 memakai data gratis, **sebelum** rupiah pertama keluar untuk perekaman korpus. |
| **RQ3** | Apakah ekstraksi keypoint + inferensi **layak real-time di CPU/peramban**? | Menentukan apakah demo §11 bisa jalan offline tanpa server. |

RQ2 adalah alasan terkuat menjalankan eksperimen ini sekarang: ia membuat belanja korpus
lebih terarah. Salah menebak jumlah penutur berarti membayar ratusan jam rekaman yang
ternyata kurang — atau berlebih.

### 10.3 Lingkup

**Masuk:** dataset D4; fitur keypoint yang sudah tersedia; model temporal kecil (GRU/LSTM
atau sejenis); evaluasi speaker-independent; kurva jumlah penutur; pengukuran latensi dan
ukuran model.

**Tidak masuk:** terjemahan kalimat kontinu; segmentasi otomatis batas antar-tanda;
arah teks→isyarat (avatar/pose); penambahan kosakata di luar 12 kelas D4; adaptasi model
ke pengguna tertentu; penyimpanan data pengguna dalam bentuk apa pun.

### 10.4 Dataset: D4 (BISINDO-12)

Identitas yang dikunci untuk eksperimen ini — versi **v3, 9 Desember 2025**, 1,17 GB, 12
kelas, ~600 video, keypoint MediaPipe Holistic 225 dimensi (pose 99 + tangan kiri 63 +
tangan kanan 63), anotasi ELAN. Rincian lengkap di §4 (D4).

**Alasan dipilih di atas D1, D2, D3, dan D5:** satu-satunya kandidat yang menyediakan
**pembagian data per penutur** dan anotasi temporal yang rapi. Tanpa itu, angka apa pun
yang dihasilkan eksperimen ini tidak akan bisa dipercaya — dan eksperimen yang menghasilkan
angka tidak bisa dipercaya lebih buruk daripada tidak ada eksperimen, karena ia mengundang
keputusan yang salah dengan rasa percaya diri.

**Catatan lisensi.** D4 memuat dua pernyataan lisensi yang bertabrakan (§4, D4). Untuk
lingkup §10 — model tidak dirilis, tidak dipasang di produk, hanya angkanya yang
dilaporkan — posisinya jauh lebih ringan, karena lisensi CC mengatur penyebaran dan bukan
pembuatan. **Untuk demo publik §11 posisinya berbeda dan diatur tersendiri di §11.3.**
Konfirmasi tertulis tetap dikejar untuk keduanya (§7 butir 2).

### 10.5 Evaluasi speaker-independent — aturan yang tidak boleh dilanggar

Pembagian data bawaan D4 dipakai **apa adanya**:

| Split | Signer ID | Perkiraan video | Fungsi |
|---|---|---|---|
| Train | 00, 01, 04 | ~360 | melatih |
| Validation | 02 | ~120 | menyetel (tuning) |
| **Test** | **03** | ~120 | **evaluasi akhir, penutur tak-dikenal** |

Empat aturan mengikat:

1. **Jangan membagi ulang data.** `dataset_split.json` dipakai sebagaimana adanya. Membagi
   ulang secara acak akan mencampur penutur antar-split dan menaikkan angka secara palsu —
   persis penyakit yang membuat metrik D5 tidak bisa dipercaya (§4, D5).
2. **Frame dari satu video tidak boleh tersebar ke dua split.** Video adalah unit terkecil.
3. **Augmentasi hanya di train.** Tidak pernah di val, tidak pernah di test.
4. **Test signer 03 dibuka satu kali, di akhir.** Seluruh penyetelan memakai val (signer
   02). Setiap kali test dibuka, angkanya menjadi sedikit kurang jujur; bila terpaksa
   dibuka lebih dari sekali, **catat berapa kali** di laporan.

**Kurva jumlah penutur (menjawab RQ2).** Latih tiga kali dengan train yang bertambah —
{00}, lalu {00, 01}, lalu {00, 01, 04} — sementara val dan test tetap sama persis.
Bentuk kurvanya, bukan titik terakhirnya, yang memberi tahu apakah menambah penutur masih
berbuah dan berapa banyak yang perlu direkam.

### 10.6 Metrik

**Primer:** top-1 accuracy pada **test signer tak-dikenal**. Ini angka yang dilaporkan bila
hanya satu angka yang boleh disebut.

**Sekunder:** top-3 accuracy; macro-F1 (12 kelas belum tentu seimbang); **confusion matrix
per kelas** — yang menunjukkan kata mana saling tertukar, dan biasanya lebih berguna
daripada angka rata-rata; recall per kelas.

**Operasional (menjawab RQ3):** latensi inferensi per klip di CPU; laju ekstraksi keypoint
(FPS); ukuran artefak model.

**Wajib dilaporkan:** **selisih akurasi val vs test**. Selisih besar berarti model
menghafal penutur, bukan mempelajari isyarat — dan itu temuan yang justru paling penting
bagi keputusan di §5.

### 10.7 Kriteria keberhasilan

**Eksperimen ini berhasil bila menghasilkan jawaban yang dapat dipertanggungjawabkan atas
RQ1–RQ3 — berapa pun angkanya.** Keberhasilannya diukur dari mutu buktinya, bukan dari
tingginya akurasi.

Ambang di bawah ini adalah **penafsiran hasil**, bukan lulus/gagal:

| Top-1 pada penutur tak-dikenal | Pembacaan |
|---|---|
| **≥ 80%** | Sinyal kuat. Perluasan kosakata layak dipertimbangkan; program korpus §5 punya dasar. |
| **60–80%** | Marginal. Lihat kurva §10.5 — kemungkinan besar kurang penutur, bukan kurang model. |
| **< 60%** | Skala data ini tidak memadai. Ini **bukti kuat** untuk menimbang jalur **partner** di ADR-010, dan itu hasil yang berharga. |

**Hasil rendah adalah temuan, bukan kegagalan.** Melaporkan angka rendah apa adanya adalah
syarat eksperimen ini, bukan pilihan. Eksperimen gerbang yang hanya boleh menghasilkan
kabar baik tidak menjaga gerbang apa pun — ia hanya memberi stempel pada keputusan yang
sudah diambil lebih dulu.

### 10.8 Syarat reproducibility

1. **Seed acak tetap dan dicatat** di laporan.
2. **Versi dataset dikunci dan diverifikasi** — D4 v3 (9 Des 2025), simpan checksum berkas
   yang benar-benar diunduh. Versi baru boleh dipakai, tetapi harus dicatat sebagai
   eksperimen yang berbeda.
3. **`dataset_split.json` dipakai apa adanya**, tanpa modifikasi (§10.5).
4. **Environment terkunci** — versi Python, MediaPipe, dan framework tercatat dalam berkas
   lock. Ekstraksi keypoint sangat sensitif terhadap versi MediaPipe.
5. **Setiap angka di laporan dapat dihasilkan ulang oleh satu perintah** yang tertulis di
   laporan. Angka yang tidak bisa diproduksi ulang tidak boleh masuk laporan.
6. **Hasil negatif dan percobaan yang gagal ikut dilaporkan**, termasuk konfigurasi yang
   dicoba lalu ditinggalkan.
7. **Jumlah pembukaan test set dicatat** (§10.5 aturan 4).

### 10.9 Batasan eksperimen

* **Di luar monolith.** Tidak ada kode, dependency, atau berkas konfigurasi baru di
  `apps/api` maupun `apps/worker`.
* **Pipeline training tidak tinggal di repo ini** — lihat §11.7.
* **Tidak menempati critical path.** Bukan bagian dari exit criteria phase mana pun, dan
  tidak boleh menjadi syarat rilis apa pun.
* **Artefak model tidak disebarkan** sebelum clearance §11.3 selesai.
* **Tidak mengubah ADR-010, SDD §7.4, atau definisi `v2`.**
* Biaya sesungguhnya di sini adalah **waktu engineer**, bukan komputasi — repo ini berada
  di PR-037 dari 119 (§6).

### 10.10 Keluaran

1. **Laporan hasil ditulis balik ke §10 dokumen ini** — angka, kurva penutur, confusion
   matrix, dan penafsiran menurut §10.7.
2. **Rekomendasi konkret untuk program korpus §5** — jumlah penutur dan jumlah rekaman per
   kata. Inilah keluaran yang paling bernilai rupiah.
3. **Artefak model** untuk demo §11 — hanya boleh tampil publik setelah §11.3 beres.
4. **Baris baru di §9 Riwayat** yang menandai tanggal dan hasilnya.

## 11. Demo publik interaktif — pameran & pitching

> **Status: rencana. Belum ada kode, belum ada dependency.**

### 11.1 Bentuk & tujuan

Pengunjung berdiri di depan kamera, memperagakan salah satu dari **12 kata** yang dikenali,
dan hasilnya muncul seketika di layar. Demo dipakai untuk **pameran dan pitching**.

**D4 adalah kandidat utama demo ini**, dan alasannya lurus: sasarannya memang agar
pengunjung dapat mencoba pengenalan 12 kata secara langsung, dan D4 adalah dataset yang
persis memuat 12 kata itu beserta model yang dilatih darinya di §10. Eksperimen dan demo
memakai artefak yang sama; yang membedakan hanya siapa yang melihatnya — dan perbedaan itu
yang diatur di §11.3.

### 11.2 Aturan penamaan — mengikat, di layar maupun di lisan

**Nama yang dipakai:** **"SignBridge Lab — prototipe pengenal isyarat"**.

**Dilarang dipakai**, di panel booth, slide, materi cetak, maupun penjelasan lisan:

* "Penerjemah BISINDO" atau "penerjemah bahasa isyarat"
* "SignBridge v2" atau kesan bahwa v2 sudah ada
* Klaim menerjemahkan **kalimat**, percakapan, atau bahasa isyarat secara umum

**Wajib ditampilkan:**

* **Daftar 12 kata yang dikenali, terbuka dan terlihat.** Pengunjung yang mencoba kata di
  luar daftar lalu melihat layar diam akan menyimpulkan alatnya rusak — padahal ia bekerja
  sesuai rancangan. Daftar terbuka mengubah kebingungan menjadi pemahaman.
* **Label "prototipe"** yang terbaca tanpa harus dicari.
* **Satu kalimat batas kemampuan**, misalnya: *"Mengenali 12 kata terpisah. Belum
  menerjemahkan kalimat."*

Alasan aturan ini bukan kehati-hatian hukum, melainkan strategi. Di acara teknologi
disabilitas akan hadir orang Tuli, aktivis, dan panelis yang tahu persis bahwa mengenali 12
kata bukan menerjemahkan bahasa isyarat. Label yang berlebihan akan dikoreksi di tempat,
di depan audiens yang ingin Anda yakinkan. Label yang tepat justru memperlihatkan tim yang
menguasai batas karyanya — dan pameran ini juga menyediakan sesuatu yang jarang dimiliki
peserta lain: **dokumen gerbang ini**, yang dapat ditunjukkan sebagai bukti kerja riset.

### 11.3 Gerbang clearance D4 sebelum pameran — WAJIB

**D4 tetap ada di rencana.** Yang dituntut di sini bukan penggantiannya, melainkan
kepastian haknya sebelum tampil di depan publik.

Alasannya spesifik: dalam CC 4.0, **"Share" mencakup *public display* dan *public
performance***. Model yang berjalan di booth dan dipakai pengunjung masuk ke dalamnya —
berbeda dari eksperimen tertutup §10 yang tidak menyebarkan apa pun. Ditambah kedua
pernyataan lisensi D4 yang saling bertabrakan (ND vs NC, lihat §4 D4), status hak untuk
penyajian publik belum pasti dan harus dipastikan lebih dulu.

**Langkah clearance:**

1. **Tentukan lisensi mana yang berlaku** — field metadata Kaggle (BY-ND) atau teks
   deskripsi (BY-NC) — dan telusuri syarat dataset sumber WL-BISINDO (BY-NC).
2. **Kirim permintaan tertulis** ke pembuat WL-BISINDO (Glenn Leonali, Grace Oktaviani
   Kindy, dkk.) dan pengunggah BISINDO-12 (J. N. Zega). Isi permintaan: konfirmasi lisensi
   yang benar, dan izin **penyajian publik** untuk demo pameran non-komersial. Sebutkan
   dengan jujur bahwa demo dipakai juga dalam konteks pitching.
3. **Verifikasi provenance** — tanyakan apakah penutur dalam rekaman memberi persetujuan
   untuk penggunaan publik semacam ini (K2, §2).
4. **Simpan balasannya** sebagai bukti, dan catat tanggal serta hasilnya di §9 Riwayat.

**Kriteria lolos gerbang — salah satu:**

* ✅ Izin tertulis untuk penyajian publik diperoleh → **demo D4 tampil.**
* ⚠️ Belum ada balasan saat pameran tiba → **beralih ke fallback §11.6.** D4 tetap di
  rencana dan tetap dipakai di §10; hanya penayangan publiknya yang ditunda.

Gerbang ini tidak menghapus D4 dari rencana mana pun. Ia hanya menentukan **kapan** D4
boleh dilihat orang banyak.

### 11.4 Offline & privasi

* **Seluruh proses berjalan di perangkat.** Ekstraksi keypoint dan inferensi terjadi di
  peramban pengunjung.
* **Tidak ada frame yang dikirim ke mana pun, dan tidak ada yang disimpan.** Tidak ada
  unggahan, tidak ada rekaman, tidak ada telemetri berisi gambar.
* **Tidak butuh jaringan saat berjalan.** Wifi pameran hampir selalu buruk di jam ramai;
  demo yang bergantung pada internet adalah demo yang mati tepat saat booth paling penuh.
* **Pernyataan privasi terlihat di layar booth**, dalam bahasa sederhana. Di acara
  disabilitas ini bukan sekadar kepatuhan — ia bagian dari apa yang sedang Anda tawarkan.

### 11.5 Aksesibilitas demo (WCAG 2.2 AA)

Demo tidak aksesibel di pameran disabilitas adalah kerusakan yang tidak sebanding dengan
apa pun yang didapat darinya. Syarat minimum:

* **Ada jalur mencoba tanpa harus memeragakan isyarat** — misalnya memutar klip contoh dan
  menampilkan hasil pengenalannya. Pengunjung Daksa atau siapa pun yang tidak dapat
  memperagakan tetap bisa memahami demonya.
* **Hasil diumumkan lewat live region**, bukan hanya perubahan visual.
* **Operable penuh dengan keyboard**; target sentuh minimal 44×44 px.
* **Teks sederhana** (rujuk `docs/panduan-bahasa-sederhana.md`) dan kontras memadai.
* **`prefers-reduced-motion` dihormati** — tanpa animasi hasil yang berkedip atau bergerak
  cepat.
* Kamera **tidak menyala otomatis**; pengunjung yang menyalakannya, dengan tombol yang jelas.

### 11.6 Fallback: D1 + D3 (pengenal abjad)

**Disiapkan sejak awal, bukan disiapkan saat panik.** Dipakai bila clearance §11.3 belum
turun pada hari pameran.

* **Lisensi CC BY 4.0** pada keduanya — tanpa klausa NC maupun ND, jadi penyajian publik
  aman tanpa izin tambahan (§3).
* **Bentuk demo:** pengunjung mengeja namanya sendiri, huruf muncul satu per satu. Mudah
  dipahami tanpa penjelasan, dan jujur secara teknis — huruf BISINDO memang pose statis,
  sehingga pengenalan dari frame diam bukan penyederhanaan yang menyesatkan.
* **Aturan penamaan §11.2 tetap berlaku penuh**, dengan penyesuaian batas: *"Mengenali
  abjad BISINDO A–Z. Belum mengenali kata atau kalimat."*
* Fallback ini **tidak menggantikan** D4 di §10 maupun sebagai kandidat utama §11.1.

### 11.7 Tempat kode hidup & jalur implementasi

Pertanyaannya: bagaimana agar demo ini **ikut terbangun** saat proyek dilanjutkan, tanpa
menyentuh monolith dan tanpa mengganggu backlog 119 PR.

| Bagian | Tempat | Alasan |
|---|---|---|
| **Halaman demo** | `apps/signbridge-lab/` — workspace baru di monorepo ini | Ikut `pnpm build` dan ikut a11y gate CI, jadi §11.5 ditegakkan otomatis, bukan diingat manual. |
| **Artefak model** | aset statis di dalam workspace tersebut | Dimuat di peramban; tidak ada server. |
| **Pipeline training & eksperimen §10** | **repo terpisah** (`nawasena-signbridge-lab`) | Python, tidak cocok di pnpm workspace, dan tidak perlu ikut CI repo ini. |
| **Monolith `apps/api`, `apps/worker`** | **tidak disentuh sama sekali** | Menjaga ADR-010 tetap utuh. |

**Kenapa bukan menambah PR ke Phase 14.** Tiga alasan: (a) exit criteria Phase 14
mensyaratkan seluruh PR-nya merged — riset yang hasilnya belum diketahui tidak boleh
menyandera penutupan sebuah phase produk; (b) Phase 14 dijadwalkan sprint 7–8, sedangkan
nilai eksperimen ini justru muncul **sebelum** belanja korpus; (c) gerbang CI phase ini
mengasumsikan kode produk TypeScript, sedangkan pipeline training bukan itu.

**Usulan penempatan backlog: Phase 20 — SignBridge Lab**, mengikuti pola Phase 19
(Community): **di luar sprint MVP, tidak menempati critical path**, dikerjakan paralel.
Nomor PR melanjutkan setelah 119. Rancangan awal:

| PR | Isi |
|---|---|
| PR-120 | Scaffold `apps/signbridge-lab` — halaman statis, kerangka a11y, label prototipe & daftar 12 kata |
| PR-121 | Kamera + ekstraksi keypoint di peramban; indikator status; tanpa model |
| PR-122 | Muat artefak model + inferensi; tampilan hasil dengan live region |
| PR-123 | Mode pameran — offline penuh, reset otomatis antar-pengunjung, panel privasi & batas kemampuan |
| PR-124 | Jalur fallback abjad (§11.6) |

**Dokumen Phase 20 sudah dibuat** (2026-08-21):
[`phase-20-signbridge-lab.md`](implementation/phase-20-signbridge-lab.md), terdaftar di
indeks [`implementation/README.md`](implementation/README.md). Tidak ada satu pun PR
001–119 yang berubah, dan Phase 14 tidak disentuh. Rincian PR-120..PR-126 serta jalur
menuju v2 ada di dokumen itu; dokumen ini tetap sumber kebenaran untuk penilaian dataset
dan status gerbang.

Satu catatan kejujuran arsitektur: menaruh `apps/signbridge-lab/` di monorepo ini berada
dekat dengan batas yang dijaga ADR-010. Ia lolos karena monolith (`apps/api`) tidak
disentuh dan karena yang dibangun bukan v2 — tetapi kedekatan itu sebaiknya dicatat
sebagai ADR tersendiri saat implementasi dimulai (mis. ADR-020), **tanpa mengubah
ADR-010**. Keputusan yang dicatat dapat ditinjau ulang; keputusan yang tersirat tidak.
