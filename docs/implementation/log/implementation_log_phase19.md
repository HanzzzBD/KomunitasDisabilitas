# Implementation Log — Phase 19 (Community)

## PR-113 — Community Schema + Prisma Migration

> **Tanggal:** 2026-10-06
> **Branch:** `pr-113-community-schema` → `phase-19-community`, dari `main` sesudah Phase 15 (#214).
> **Status:** Selesai dan gerbang lokal lulus; merge mensyaratkan CI `lint-typecheck-test` dan `a11y` hijau.

PR-113 menambahkan kontrak data Community dan migrasi 24 untuk lima tabel: `communities`,
`community_memberships`, `community_posts`, `community_comments`, dan `community_reports`.
Endpoint, UI, dan pembukaan Community tetap mengikuti PR-114..PR-119. Owner meminta
implementasi Phase 19 dilanjutkan setelah build EAS; pekerjaan ini tidak menyatakan bahwa
prasyarat operasional PR-112 sudah terpenuhi atau Community sudah boleh dirilis.

### Keputusan

- **Owner, melalui tool pertanyaan 2026-10-06:** saat PDP purge, kosongkan body post/komentar,
  ubah status menjadi `removed`, dan lepaskan identitas penulis. ID konten dan jejak moderasi
  dipertahankan. Berlaku untuk jalur hapus user maupun jalur anonimisasi user dengan lamaran hired.
- **Bawaan implementasi:** post 5.000 karakter, komentar 2.000 karakter. Pertanyaan pilihan batas
  sudah diajukan; belum ada jawaban saat implementasi. `createCommunityContentSchemas` menerima
  batas server yang dapat diperketat oleh PR-116.
- Ruang `active|archived`; membership `active|blocked`; post/komentar `published|hidden|removed`;
  report `open|resolved|rejected`. Enum sama antara PostgreSQL dan Zod.
- Laporan memakai `target_type + target_id` sebagai referensi polimorfik historis, tanpa FK ke
  konten. PR-116 wajib memeriksa keberadaan, jenis, dan otorisasi target sebelum menyimpan report.
  `reporter_id` cascade; `resolved_by` nullable agar penghapusan admin tidak menghilangkan resolusi.

### Scope selesai

- Migrasi aditif, ditulis tangan agar indeks raw SQL lama tidak dijatuhkan karena Prisma drift.
  Tidak mengubah/backfill tabel lama; transaksi dengan `lock_timeout` 5 detik. FK ke `users`
  tetap memerlukan lock singkat saat pemasangan; migrasi yang gagal memperoleh lock dicoba ulang.
- Composite PK membership `(community_id, user_id)` menjamin unique join. Tidak ada PK UUID
  buatan DB; semua ID konten tetap UUID v7 dari aplikasi. Semua timestamp `timestamptz(6)`.
- Indeks feed/komentar dan queue dengan ID sebagai tiebreaker cursor; indeks kepemilikan untuk
  purge; GIN FTS body dengan konfigurasi `indonesian`, sama dengan pencarian yang sudah ada.
- CHECK kota sesuai jenis ruang, body kosong hanya pada `removed`, alasan report tidak kosong,
  dan timestamp resolusi sesuai status. FK Restrict menjaga post/komentar dari hard delete.
- Kontrak Zod strict untuk ruang, membership, post, komentar, report, moderasi, filter, cursor,
  dan response. Input tidak menerima author/reporter/status buatan klien, media, atau nested reply.
  Respons konten tidak memuat laporan, data profil sensitif, CV, atau lamaran.
- Komponen Community terdaftar di OpenAPI tanpa mendaftarkan route yang belum berjalan.
  Urutan registry eksplisit menjaga hasil generator sama antara tsx dan Vitest.
- Integrasi purge existing: membership/report milik akun dihapus; author/creator/resolver dilepas;
  body dibersihkan pada kedua jalur dalam transaksi yang sama. Dry-run menghitung tanpa menulis.
  Report pengguna lain, target konten, dan audit append-only tetap utuh.

### Verifikasi

- `pnpm lint` dan `pnpm typecheck`: 12 workspace lulus; perubahan penjaga terakhir juga lulus
  lint/typecheck API.
- `pnpm test`: 12 workspace lulus. API lokal: 1.908 test lulus, 316 dilewati karena layanan
  aplikasi PostgreSQL/Redis/MinIO belum berjalan. Test Community menggunakan PostgreSQL 18
  sementara pada localhost, dengan schema acak; tidak mengubah database aplikasi.
- `packages/schemas`: 122 test lulus, termasuk 7 test Community dan guard drift OpenAPI.
- Enam file test migrasi/PDP yang terpengaruh: 55 test lulus. Lima test PostgreSQL Community
  membuktikan up/down/up, tabel/data lama utuh, unique membership, soft status, FK Restrict,
  CHECK, timestamptz, pemakaian indeks FTS, rollback transaksi, dan jejak audit setelah PDP.
- Dua test service purge end-to-end terhadap DB aplikasi disertakan untuk CI: jalur hapus penuh
  dan jalur anonimisasi hired, termasuk dry-run, membership/report, body, author, dan resolver.
- `check:openapi`: sinkron. Formatting seluruh file tracked dan source PR baru lulus; perintah
  `format:check` atas seluruh folder lokal menandai dua JSON runtime yang di-ignore git
  (`google-services.json` dan `.local/tunnel.json`), yang sengaja tidak diubah atau dikirim.
- Diff tidak menyertakan perubahan EAS/mobile, log Phase 15, script provider lokal, atau tunnel.

### Kelanjutan yang wajib

- **PR-114:** router/controller/service/repository Community dan kontributor ekspor membership
  saat endpoint penulisan pertama lahir. Daftar `DITUNDA` di `export-kelengkapan.test.ts` mencatatnya;
  penjaga otomatis menolak create/upsert/INSERT saat penundaan masih ada (U-39).
- **PR-116:** kontributor ekspor post/komentar/report milik pemilik sesi bersama endpoint create;
  sanitasi plain text, konfigurasi batas, validasi target report, serta audit/notifikasi moderasi.
- **PR-119:** gate PDP termasuk ekspor, security/a11y, retensi/SOP, feature flag, dan rollout.

RB-Std produksi mempertahankan migrasi ketika image rollback. `down.sql` hanya diuji pada schema
acak/DB uji; menjalankannya sesudah ruang berisi diskusi akan menghapus data Community.

## Perbaikan redirect login admin web

> **Tanggal:** 2026-10-06
> **Branch:** `fix-admin-login-redirect` → `phase-19-community`.

Login OTP maupun Google sebelumnya menuju beranda atau tujuan awal tanpa memeriksa
peran akun. Admin juga bisa dialihkan ke wizard onboarding pencari kerja sebelum
dashboard terbuka. Perbaikan ini merupakan tindak lanjut penggunaan web lokal,
tanpa membuka scope endpoint/UI Community PR-114..PR-119.

### Keputusan dan perubahan

- Owner memilih melalui tool pertanyaan: admin **selalu** ke `/admin` sesudah login,
  termasuk saat tautan awal menunjuk lowongan, pengaturan, atau subhalaman admin.
- Kedua metode memakai pemilih tujuan yang sama. Sesudah sesi terbentuk, baca profil
  terbaru lewat `GET /me`; batalkan/hapus cache profil akun sebelumnya dan simpan
  respons baru agar pergantian akun tidak memakai role yang masih ter-cache.
- Akun selain admin kembali ke tujuan internal yang telah disanitasi. Jika pembacaan
  profil gagal, pertahankan sesi dan tujuan aman awal; jangan menyebut OTP/code Google
  yang telah berhasil sebagai gagal atau mengulang penukaran code sekali pakai.
- Bagian `/admin` dan `/admin/*` tidak dipotong wizard pencari kerja. Penjaga sesi,
  penjaga peran dari server, serta RBAC API tetap menentukan akses admin.

### Verifikasi

- Enam suite terkait login, pergantian akun, guard admin, kerangka/onboarding, dan
  callback hapus akun: **104 test lulus**; mencakup gerbang axe yang sudah ada.
- Lint, typecheck, serta build web lulus.
- Browser nyata: Google login dari `/masuk?tujuan=%2Flamaran` menggunakan akun admin
  langsung menampilkan `/admin` dengan judul `Admin · Nawasena`.
- Rollback melalui revert perubahan web; tidak ada perubahan skema/data atau konfigurasi
  provider dalam PR ini. Merge tetap menunggu CI `lint-typecheck-test` dan `a11y` hijau.

## Pemisahan navigasi role dan kerangka tampilan web

> **Tanggal:** 2026-10-06
> **Branch:** `fix-role-aware-web-shell` → `phase-19-community`.

Menu lama hanya memeriksa apakah akun sudah masuk. Akibatnya admin melihat
Profil Karier, CV, dan Lamaran Saya seperti pencari kerja; halaman publik juga
tidak memiliki navigasi utama. Perbaikan ini menata menu dan kerangka bersama,
tanpa menambah portal perusahaan atau membuka UI Community.

### Keputusan dan perubahan

- Owner memilih melalui tool pertanyaan: mulai dari navigasi serta kerangka
  tamu, pencari kerja, dan admin. Fitur pribadi dipisahkan; admin berfokus pada
  pengelolaan dan setelan akun, dengan lowongan dan kamus publik tetap terbuka.
- Tiga role kontrak tetap `seeker`, `admin`, dan `employer`. Portal employer
  masih dicadangkan untuk fase berikutnya; akun itu mendapat menu publik dan
  setelan bersama, tanpa menu karier atau pengelolaan admin.
- Header memuat merek, konteks role, menu halaman, penanda halaman aktif, serta
  notifikasi dan setelan saat masuk. Tamu melihat lowongan, kamus, dan tautan
  masuk. Seeker mendapat beranda, lowongan, lamaran, CV, profil, dan kamus.
- Admin mendapat dashboard dan tautan **Lihat lowongan/Lihat kamus** untuk
  membedakan halaman publik dari bagian kurasi pada sidebar pengelolaan.
  Alamat `/`, `/profil`, `/onboarding`, `/cv[/…]`, dan `/lamaran[/…]` menuju
  `/admin` dengan replace; employer dari fitur pribadi menuju `/lowongan`.
- Detail lowongan tetap dapat dibaca admin/employer, tanpa bagian melamar,
  dialog otomatis `?lamar=1`, atau pembacaan data lamaran/CV/profil pribadi.
- Role berasal dari cache `GET /me` yang juga dipakai guard admin/setelan.
  Selama profil dimuat, klaim JWT tervalidasi hanya menjadi petunjuk navigasi.
  Tamu tidak mengirim `GET /me`. Respons profil server mengungguli klaim lama.
- Kanvas hangat, header dan panel putih, aksen hijau, sidebar admin responsif,
  serta footer menggantikan susunan tautan tanpa kerangka. Font sistem, token
  skala teks/kontras, target sentuh, cincin fokus, satu landmark main, dan
  tautan lompat pertama tetap dipertahankan; tidak menambah dependensi/aset.
- Pemisahan halaman ini mengatur UX web. Otorisasi RBAC/owner di API tidak
  diubah; jangan menganggap redirect atau klaim JWT sebagai batas keamanan.

### Verifikasi dan rollback

- Enam suite navigasi, onboarding, notifikasi, setelan, feed, dan lamaran:
  **112 test lulus**. Pengujian lama membatasi kueri pada wilayah fitur agar
  item menu baru tidak terbaca sebagai item notifikasi/kartu feed.
- Lint, typecheck, dan build web lulus.
- Browser lokal dengan akun admin: fitur pribadi tidak muncul di menu;
  mengetik profil, CV, lamaran, dan onboarding kembali ke dashboard. Tamu
  mendapat menu publik. Tampilan 320–1440 px pada teks 100%/200% tidak meluap
  horizontal; menu aktif mode kontras tinggi berwarna putih di atas hitam.
- Seluruh **843 test web** dan **164 test browser** lulus. Setelah penambahan
  batas melamar pada detail publik, dua suite terkait **28 test** (termasuk dua
  kasus admin/employer) serta **11 test browser** lulus pada build akhir.
  Penantian awal dialog dalam pengujian memberi waktu boot route/katalog lazy;
  assertion pengungkapan, idempotensi, dan penulisan lamaran tetap utuh.
- Admin lokal membuka detail lowongan dengan `?lamar=1`: konten publik tampil,
  tombol melamar dan dialog tidak ada. Typecheck/lint/build akhir lulus.
- CI pertama: unit/lint/typecheck serta gerbang browser dan Lighthouse desktop
  lulus; skor 3G **0,74** di bawah ambang repo **0,75**. Perbaikan mempertahankan
  ambang: landing publik dan teksnya tersedia di bundel awal, sedangkan feed
  dan katalog karier/admin tetap dimuat terpisah. Loader mendaftarkan teks
  sebelum halaman ditampilkan; test router membuktikan katalog lain tidak ikut.
- Footer tampil setelah pemulihan sesi selesai agar tidak bergeser dari tengah
  viewport saat landing tersedia. Tiga audit 3G lokal setelah perbaikan:
  performa **0,76/0,76/0,76**, aksesibilitas **100**, CLS **0**. Ambang sementara
  U-31 tetap mengikuti konfigurasi repo; perbaikan ini tidak menyatakan utang
  pre-render/ambang 0,8 sudah selesai.
- Lima suite pemuatan landing, katalog, kerangka, dan navigasi setelah perbaikan
  performa: **62 test lulus**. Lint/typecheck dan budget bundel awal lulus.
- Guard struktur route diperbarui untuk pengecualian landing publik; halaman
  login, karier, dan admin tetap wajib lazy. CI kedua meluluskan gerbang `a11y`
  dan 845 test web; satu assertion kebijakan lama pada landing diperbarui tanpa
  melonggarkan guard fitur lainnya. Kedua gerbang diperiksa ulang pada head akhir.
- Rollback dengan revert perubahan web. Tidak ada perubahan skema, data akun,
  atau provider dalam PR ini. Merge mensyaratkan kedua gerbang CI hijau.

## Perbaikan tata letak seluruh web — 2026-10-06

Owner meminta pembenahan tata letak. Melalui tool pertanyaan, owner memilih
**semua tampilan web, termasuk halaman masuk**. Pembagian fitur antar-role dari
perbaikan sebelumnya tetap berlaku.

### Hasil

- Kotak lebar seragam di kerangka diganti wadah berdasarkan tugas halaman:
  login/kembalian Google ringkas, form dan detail memiliki lebar baca, sedangkan
  daftar lowongan, beranda seeker, CV, dan kamus memakai ruang lebih luas.
- Landing memakai susunan dua kolom pada desktop: pengantar dan manfaat;
  langkah memulai serta kamus berada di bawahnya. HP menyusun isi berurutan.
  Konten dan tautan tetap berasal dari katalog yang sudah ada.
- Pencarian lowongan menempatkan filter di samping hasil pada desktop. HP
  menampilkan hasil dengan filter tertutup pada pencarian awal; filter aktif
  dari URL dibuka agar kriterianya terlihat. Elemen details/summary mendukung
  keyboard dan tidak menghapus isian, filter URL, pagination, atau fokus kembali.
- Judul admin berada di atas ruang kerja; metrik memakai grid yang mengikuti
  skala teks dan kartu pintasan tersusun dalam kolom. Pengaturan memiliki
  navigasi panel di samping isi pada desktop dan di atasnya pada HP.
- Form profil, CV, onboarding, lamaran, notifikasi, profil perusahaan, detail
  lowongan, detail kamus, dan halaman kesalahan memakai jarak/surface konsisten.
  Ukuran teks, kontras tinggi, target sentuh, dan fokus tetap memakai token ADR-008.
- Tidak menambah dependensi, gambar, webfont, endpoint, atau perubahan data.
  Strategi pemuatan landing dari PR sebelumnya dan batas role tetap dipertahankan.

### Verifikasi

- Build, typecheck, dan lint web lulus; seluruh **846 test web** lulus.
  Empat suite login, pengaturan, feed, dan metrik setelah perubahan akhir:
  **71 test lulus**.
- Spec browser tambahan memeriksa setiap halaman registry pada 320 px dengan
  teks 100%/200%, satu main (termasuk saat main inert di belakang dialog),
  serta pembesaran judul yang benar-benar dua kali. Posisi filter/hasil diuji
  pada 320/768/1024/1440 px; ukuran form login desktop dan operasi filter HP
  dengan keyboard juga dijaga.
- Seluruh **49 test tata letak akhir lulus**. Suite browser lengkap meluluskan
  **209/210**; satu alur unggah kamus timeout saat paralel. Kedua test kamus
  kemudian lulus terpisah, termasuk seluruh assertion unggah/publish dan axe.
- CI pertama menemukan overflow pada pengaturan dan halaman perusahaan saat
  teks 200% di 320 px. Grid pengaturan kini memiliki kolom minmax(0, 1fr),
  isi admin membungkus judul panjang, dan fieldset tidak memaksa lebar minimum.
  Tiga regresi memakai font dasar 16 px serta monospace untuk mencakup perbedaan
  font browser lokal dan Linux. **54 test tata letak, kontras/skala, dan alur
  perusahaan lulus** setelah perbaikan; lint, typecheck, dan build tetap lulus.
- Tiga audit 3G lokal pada build akhir: performa **0,76/0,76/0,76**,
  aksesibilitas **100**, CLS **0**. Sandbox Windows sempat menolak penutupan
  Chrome milik audit; menjalankan audit dengan izin proses yang sesuai
  menyelesaikan collect dan assertion tanpa perubahan konfigurasi/ambang.
- Lighthouse desktop lulus seluruh assertion pada tiga audit build akhir.
- Verifikasi browser lengkap, Lighthouse, dan kedua gerbang CI diperiksa
  sebelum merge. Ambang sementara performa 3G milik U-31 tidak diubah.
- Rollback: revert PR ini lalu build ulang. Tidak ada migrasi atau rollback data.

## PR-114 — Community API + Membership

> **Tanggal:** 2026-10-06
> **Branch:** `pr-114-community-api` → `phase-19-community`.

API ruang dan keanggotaan mengikuti router → controller → service → repository.
PR ini melayani discovery, administrasi ruang, membership, dan pembacaan feed.
UI Community menyusul PR-115; penulisan post/komentar/report menyusul PR-116.
Implementasi ini tidak menyatakan prasyarat rilis PR-112 atau rollout PR-119 terpenuhi.

### Keputusan owner melalui tool pertanyaan

- Daftar dan deskripsi ruang dapat dibaca tamu. Isi diskusi memerlukan sesi aktif,
  tanpa wajib join. Membership selalu dibaca/diubah untuk pemilik sesi.
- Arsip tetap bisa dibaca; join dan penulisan baru ditutup; anggota aktif boleh keluar.
- Penanda `blocked` dipertahankan pada percobaan leave/join agar blokir tidak bisa dilewati.
  Semua role mengikuti aturan keanggotaan yang sama, termasuk admin dan employer.

### Scope selesai

- `GET /communities` dengan filter `type`/`city` dan cursor; discovery hanya ruang aktif.
  `GET /communities/:slug` juga melayani ruang arsip dari tautan lama. Respons publik
  memuat jumlah anggota aktif, tanpa daftar identitas atau createdBy. membershipStatus
  publik selalu null; status sesi dibaca lewat `GET /communities/:id/membership`.
- `POST /communities/:id/join` dan `DELETE /communities/:id/membership` idempotent.
  Tidak menerima userId dari body. Join ulang mempertahankan joinedAt dan menerbitkan
  `community.member_joined` hanya untuk baris baru, sesudah transaksi commit.
- Transaksi mengunci akun aktif dan ruang; join paralel tidak menduplikasi membership.
  Status arsip/blokir diperiksa di dalam transaksi. Guard penulisan disediakan dan diuji;
  PR-116 wajib memakai pemeriksaan yang sama di transaksi penulisan kontennya.
- `GET /communities/:id/posts` memerlukan sesi, membatasi ruang dan status published,
  mendukung FTS bahasa Indonesia, cursor, dan jumlah komentar published. Penulis hanya
  id/fullName atau null bila akun dihapus. Tidak membaca profil sensitif, CV, atau lamaran.
- Urutan halaman createdAt DESC/id DESC; posisi menggunakan timestamp asli anchor DB,
  termasuk mikrodetik PostgreSQL yang tidak dapat diwakili Date JavaScript.
- Admin-only GET daftar/detail, POST create, PATCH update/reaktivasi, DELETE archive.
  DELETE menyimpan diskusi dan membership. Patch kota/jenis divalidasi setelah digabung
  dengan row terkini. Konflik slug menjadi 409; mutasi admin memakai audit allowlist.
- Rate limit Redis atomik, dibagi antar replika, bucket read/write terpisah. Discovery
  memakai hash IP; endpoint sesi memakai userId. Default 120 read dan 20 write per
  60 detik, konfigurabel lewat tiga env COMMUNITY_*. Redis gagal → 503; limit → 429
  dengan Retry-After. Boot memakai Redis queue noeviction.
- Ekspor PDP wajib memuat communityMemberships milik sesi, termasuk blocked dan arsip.
  Kontributor hadir saat endpoint join pertama; bagian membership U-39 lunas. Bentuk
  berkas bertambah tanpa menaikkan formatVersion. Client yang memakai kontrak ekspor
  strict lama memerlukan pembaruan sebelum rollout Community; validasi rilis PR-119
  harus mencakup web/mobile yang didukung.
- Sebelas operasi pada tujuh path OpenAPI sesuai registrar nyata; tidak menjanjikan
  endpoint penulisan konten yang belum dilayani. Tidak ada migrasi/dependensi baru.

### Verifikasi

- 96 test terkait pada source akhir lulus: HTTP nyata dengan RS256, schema PostgreSQL acak, Redis nyata,
  ekspor, penjaga kelengkapan, kesepadanan OpenAPI, dan template env.
- Join enam request paralel: satu row, joinedAt sama, satu event. Uji role meliputi tamu,
  seeker, employer, admin, akun suspended/deleted, membership blocked, dan ruang arsip.
- Pagination diuji pada timestamp bertie dan mikrodetik, termasuk anchor yang diarsipkan
  atau disembunyikan di antara dua halaman. Feed hanya ruang/status yang diizinkan.
  Jumlah anggota mengecualikan akun suspended/deleted; ekspor hanya milik sesi.
- 122 test schemas dan 10 test api-client pengguna lulus; OpenAPI sinkron.
- Typecheck seluruh 12 workspace serta lint API/schemas lulus. Pemeriksaan API luas
  meluluskan 1.910 test dan melewati 328 integrasi tanpa layanan lokal. Dua kegagalan
  awal (snapshot kode error baru dan pembacaan relasi user nested) diperbaiki; seluruh
  96 test terkait termasuk kedua penjaga tersebut kemudian lulus. Gerbang CI lengkap
  lint-typecheck-test dan a11y wajib lulus pada commit akhir sebelum merge manual.
- Test DB khusus membuat/menghapus hanya schema pr114 acak. Pemeriksaan suite lokal
  lainnya mengarahkan PostgreSQL/Redis ke endpoint tidak aktif; integrasi luas dijalankan
  CI agar akun dan data aplikasi lokal tidak tersentuh.

Rollback: revert PR lalu restart API. Migrasi PR-113 serta data yang sudah tersimpan
dipertahankan. Scope selanjutnya PR-115 (browse/join web), PR-116 (penulisan/moderasi
dan sisa ekspor U-39), PR-119 (readiness/compatibility/rollout).

## PR-115 — Community Browse + Join Web

> **Tanggal:** 2026-10-06
> **Branch:** `pr-115-community-web` → `phase-19-community`.

### Keputusan owner melalui tool pertanyaan

- Menu Komunitas tampil untuk tamu, seeker, employer, dan admin.
- Pengguna baru yang masuk dari Komunitas langsung kembali ke ruang tanpa
  onboarding profil karier. Bergabung tetap lewat tombol, tanpa join otomatis.
  Kebijakan admin selalu menuju dashboard sesudah login tetap dipertahankan.
- Mengikuti PR-114: discovery/deskripsi publik; pembacaan diskusi memerlukan
  login tanpa wajib join; arsip tetap terbaca dan anggota aktif boleh keluar.

### Scope selesai

- Route lazy `/community` dan `/community/:slug` memakai kerangka web yang ada.
  Desktop menempatkan filter di samping hasil dan keanggotaan di samping deskripsi;
  HP menyusun isi berurutan. Tidak menambah dependensi, font, gambar, atau migrasi.
- Filter jenis/kota disimpan di URL dan diterapkan saat submit. Cursor memakai
  tombol muat berikutnya; halaman lama tetap tampil saat request berikutnya gagal.
  Tombol tetap di DOM setelah halaman terakhir agar fokus keyboard tidak hilang.
  Kembali dari detail memulihkan filter, halaman yang dimuat, dan fokus tautan ruang.
- Nama, jenis/kota, deskripsi plain text, dan jumlah anggota disajikan secara
  semantik. Ada skeleton/status loading, empty dengan arahan, error/retry, 404,
  dan penjelasan data cache saat luring. Luring tanpa cache tidak diklaim kosong.
- Status membership dipisah dari discovery dan key cache mencakup id akun/ruang.
  Join/leave baru mengubah status setelah respons server; batalkan query membership
  yang masih berjalan sebelum mutasi dan invalidasi jumlah anggota sesudah berhasil.
  Galat mutasi memuat ulang membership/detail untuk menangkap perubahan blokir/arsip.
- Seeker, employer, dan admin mengikuti aturan yang sama. Membership blocked
  menonaktifkan aksi; arsip menutup join tetapi anggota aktif tetap boleh keluar.
  Tombol join/leave mempertahankan fokus, mengumumkan progres/sukses/error, dan
  mengecek koneksi sebelum mengirim. Mutasi luring tidak diantre untuk reconnect.
- Lima helper api-client memakai kontrak Zod PR-113/114, encoding input, AbortSignal
  pada read, serta POST/DELETE tanpa userId/body. Katalog Community dimuat lazy dan
  mempunyai varian id/id-simple; nama singkat yang sama memiliki alasan whitelist.
- Analytics menormalkan slug ruang menjadi `/community/:slug`, membuang query/hash,
  dan menolak slug mentah agar topik yang dikunjungi tidak tercatat sebagai path.

### Verifikasi dan batas rilis

- Seluruh 868 test web sebelum perubahan onboarding terakhir lulus. Setelah perubahan
  akhir, 91 test Community, kerangka/onboarding, OTP, dan kembalian Google lulus.
  Regresi memeriksa akun baru tanpa penanda onboarding dan tanpa join otomatis.
- Seluruh 175 test api-client dan 126 test schemas lulus; OpenAPI tetap sinkron.
  Typecheck seluruh 12 workspace dan lint web/api-client/schemas lulus.
- Browser Chrome memeriksa keyboard, pagination/fokus kembali, join/leave semua role,
  luring tanpa antrean, arsip/blokir, axe, dan reflow 320/768/1024/1440 px dengan teks
  200%. Tiga route Community ditambahkan ke registry axe dan tata letak seluruh web.
  Sebanyak 17 test browser Community/registry lulus; test tambahan login akun baru
  juga lulus, kembali ke ruang lalu mengirim join hanya setelah tombol ditekan.
  Screenshot desktop/detail/HP diperiksa; tidak ada error JavaScript di capture.
- Build web beserta service worker lulus. Bundle awal 128,3 KB gzip di bawah batas
  200 KB; route dan katalog Community berada di chunk terpisah. Ambang Lighthouse
  sementara milik U-31 tidak diubah; kedua gerbang CI diperiksa sebelum merge manual.
- Tidak ada perubahan data akun/provider, pesan OTP nyata, atau seed ruang lokal.
  Halaman memakai ruang yang dibuat admin. UI diskusi menyusul PR-117 dan pengelolaan
  ruang menyusul PR-118. Audit manusia serta rollout bertahap tetap di PR-119;
  implementasi ini tidak menyatakan gate rilis PR-112 sudah terpenuhi.

Rollback: revert PR lalu build ulang web. Tidak ada perubahan skema atau rollback data.
Lanjut PR-116 untuk penulisan/moderasi konten dan sisa ekspor PDP U-39.

## PR-116 — Post, Comment, Report + Moderation Service

> **Tanggal:** 2026-10-06.
> **Branch:** `pr-116-community-content` → `phase-19-community`.

Community kini menerima post dan komentar teks satu tingkat, edit/hapus sendiri,
laporan, detail target, antrean laporan admin, hide/restore/remove, serta reject.
Keempat belas operasi HTTP baru mengikuti registry RBAC dan OpenAPI; feed PR-114
tetap tersedia pada path yang sama. UI diskusi/admin menyusul PR-117/118.

### Keputusan owner

- Semua pengguna login boleh melapor, termasuk nonanggota dan membership blocked.
- Hapus sendiri mengosongkan body dan memakai status removed. Remove admin menyimpan
  body hanya bagi admin/audit; removed final dan tidak dapat dipulihkan. PDP purge
  tetap mengosongkan body, melepas penulis, dan mempertahankan ID/audit.
- Hide/remove admin otomatis mengubah semua laporan open target menjadi resolved.
  Reject laporan memakai aksi terpisah dengan reason wajib.

### Implementasi dan jaminan

- Create/edit mensyaratkan akun, ruang dan membership aktif untuk semua role.
  Pemilik boleh menghapus teks setelah keluar/blokir/arsip. Edit hidden tetap hidden;
  ordinary edit/delete menolak impersonasi oleh akun lain, termasuk admin.
- Detail biasa hanya membaca published atau konten milik sendiri; body removed
  selalu kosong. Admin mempunyai endpoint terpisah untuk body retained. Alasan
  moderasi terakhir hanya tersedia bagi pemilik/admin, tanpa identitas pelapor.
  Feed/daftar komentar menyaring hidden/removed; post induk harus published agar
  komentarnya tampil. Antrean laporan oldest-first memakai cursor presisi timestamp.
- Zod strict menolak author/status dari klien, nested reply, NUL, teks kosong dan
  panjang berlebih. NFC/newline dinormalkan, kontrol dibuang, markup tetap teks literal.
  Konsumen harus merender sebagai teks, bukan HTML.
- Batas server post 5000/komentar 2000 boleh diperketat melalui env. Bucket Redis
  create (10/menit) dan report (5/menit) terpisah dari read/write. Lua atomik,
  Retry-After positif, dan kegagalan Redis menolak aksi dengan 503.
- Transaksi mengunci akun → ruang → post → komentar. Pemeriksaan membership/status
  dan mutasi dilakukan dalam transaksi; laporan duplikat open akun/target hanya
  membuat satu baris/event. Moderasi/resolusi laporan dan audit wajib commit bersama;
  reject juga dibatalkan bila audit gagal. Audit memuat actor, target, action,
  reason dan timestamp melalui allowlist terpusat. Remove admin juga menutup laporan
  yang tertinggal setelah hapus sendiri; retry setelah semua terselesaikan tetap
  idempotent.
- Event terbit setelah commit. Notifikasi laporan ke admin aktif dan perubahan
  status ke penulis memakai ID peristiwa untuk deduplikasi; tidak memuat body,
  reason atau identitas pelapor. Perubahan hide/restore berikutnya memakai ID audit
  baru. Bus in-process yang ada bersifat best effort dan tidak tahan restart seperti
  outbox; status/audit tetap menjadi sumber kebenaran.
- U-39 lunas: `communityPosts`, `communityComments`, `communityReports` wajib dalam
  ekspor, dirakit bersama endpoint penulisan pertama. Semua status milik sesi ikut;
  body removed kosong dan identitas resolver/report pengguna lain tidak ikut.
- Web/Android mengenali tipe notifikasi baru tanpa tautan ke halaman yang belum
  tersedia. Tidak ada migrasi baru. Sebelum rollout, PR-119 harus memastikan klien
  strict memakai kontrak ekspor/notifikasi terbaru, termasuk build mobile baru.
  Implementasi di branch phase bukan bukti gate v1.0.0 produksi sudah live/stabil.

### Verifikasi

- PostgreSQL nyata pada schema `pr116_*` terisolasi: **28 test** HTTP/transaksi,
  mencakup RBAC, blokir/arsip, BOLA, sanitasi, privasi, duplikat laporan serentak,
  resolusi atomik, audit failure rollback (moderasi/reject), konflik delete/restore,
  tombstone PDP, pagination mikrodetik, kuota, notifikasi dan ekspor.
- Regresi PR-114 **11 test** dan limiter **5 test**, termasuk Redis nyata dengan
  empat bucket serta cleanup hanya kunci acak milik test: total **44 lulus**.
- Shared schemas **127**, api-client **175**, dan navigasi notifikasi Android **25**
  test lulus; OpenAPI drift check sinkron. Lint dan typecheck seluruh 12 workspace
  lulus. Suite lokal umum memakai endpoint DB/Redis kosong agar data pengguna lokal
  tidak disentuh; integration umum berjalan pada service CI.
- Web **871 test** lulus. Regresi API ekspor HTTP/agregator, audit, error,
  kelengkapan PDP dan parity OpenAPI **73 test** lulus setelah fixture memakai
  kontrak ekspor lengkap. Suite API umum mencatat **1901 test** lulus dengan
  integration DB/Redis/storage dilewati lokal; CI menjadi verifikasi seluruh suite
  pada database/Redis terpisah. Build web + service worker lulus, budget JS awal
  **128,7 KB / 200 KB gzip**. Format berkas scope PR dan diff check bersih.
- CI pertama: seluruh **28 test** baru Community dan total **2269 test API** lulus;
  satu tes MinIO lama gagal pada GET sebelum expiry dengan TTL satu detik. Fixture
  kini memakai TTL lima detik dan menunggu melewati expiry plus margin; assertion
  unsigned/expired tetap 403 dan unduhan sebelum expiry tetap 200. Konfigurasi
  storage produksi tidak berubah. Kedua tes MinIO nyata di bucket uji acak lulus
  setelah perbaikan fixture.

Next: PR-117 UI diskusi/report aksesibel, PR-118 UI admin, PR-119 gate readiness.

## PR-117 — Post, Comment + Report Web UI

> **Tanggal:** 2026-10-06
> **Branch:** `pr-117-community-discussion-web` → `phase-19-community`.
> **Status:** Implementasi dan verifikasi lokal selesai; merge mensyaratkan CI
> `lint-typecheck-test` serta `a11y` hijau pada head terakhir.

### Keputusan owner

- Post berhasil dikirim tetap di ruang dan muncul paling atas.
- Draf post/komentar disimpan di browser agar dapat dilanjutkan setelah reload.
  UI menjelaskan pembersihan setelah kirim, buang draf atau keluar akun.
- Aturan PR-114/116 tetap berlaku: diskusi untuk semua akun login tanpa wajib
  join; ruang arsip tetap terbaca; nonmember/blocked boleh melapor. Menulis/edit
  mensyaratkan ruang dan anggota aktif; pemilik masih boleh hapus setelah keluar,
  blokir atau arsip. Admin memakai aturan anggota yang sama di UI diskusi biasa.

### Implementasi

- Layout ruang menempatkan diskusi/composer di kolom utama, informasi ruang dan
  keanggotaan di samping pada desktop; urutan DOM tetap sama pada layar sempit.
  Post terbaru lebih dahulu, komentar lama lebih dahulu dalam satu tingkat.
  Pagination memakai tombol eksplisit yang mempertahankan fokus hingga halaman
  terakhir; tidak ada infinite scroll otomatis.
- Route lazy `/community/content/:targetType/:id` membuka post atau komentar.
  Pemilik dapat melihat status hidden/removed beserta alasan terakhir, tanpa
  identitas pelapor. Body removed tidak dirender, termasuk bila respons keliru
  memuat body retained. Komentar pemilik tetap terbaca saat induk tidak tersedia;
  room hint dari notifikasi hanya untuk konteks publik, bukan otorisasi.
- Notifikasi moderasi kini menautkan konten pemilik. Antrean admin masih menjadi
  PR-118. Penormal analytics meredaksi seluruh ID/room query dan target route,
  termasuk identifier tidak valid; tidak mengirim body/draf/alasan laporan.
- SDK typed menyediakan read/write post, komentar dan report, validasi strict,
  cursor serta AbortSignal. Tambahan `GET /communities/by-id/{id}` memungkinkan
  detail/notifikasi memperoleh nama, slug dan status ruang tanpa mencari seluruh
  direktori atau memakai endpoint admin. Respons sama dengan detail slug yang
  sudah publik, termasuk arsip, tanpa identitas anggota/konten; OpenAPI sinkron.
- Form berlabel, petunjuk/batas karakter, validasi inline, fokus ke field invalid,
  dan status sukses/galat. Dialog Radix menjebak fokus, Escape kembali ke pemicu;
  setelah hapus fokus pindah ke artikel tombstone karena pemicu tidak lagi tersedia.
  Teks/markup dirender literal. Edit hidden tidak memulihkan tulisan.
- Draf localStorage dipisahkan berdasarkan akun, jenis dan room/post. Kegagalan
  penyimpanan diumumkan dan editor tetap memakai memori. Draf laporan/edit tidak
  disimpan. Logout membersihkan draf dan cache diskusi/keanggotaan; pergantian
  akun mereset identitas dan cache privat. Respons write terlambat tidak boleh
  memasukkan kembali cache/draf setelah sesi berganti.
  Pemulihan sesi yang gagal saat boot (misalnya luring) tidak menghapus draf;
  draf tidak dirender sebelum identitas pemilik berhasil dipulihkan.
- Pengiriman memerlukan koneksi dan klik eksplisit. Pengunci synchronous mencegah
  klik ganda; tidak ada antrean offline/retry otomatis. Kegagalan kuota/jaringan
  mempertahankan draf untuk percobaan eksplisit berikutnya. Seluruh teks memiliki
  varian id/id-simple. Tidak ada migrasi atau perubahan mobile/EAS.

### Verifikasi

- Web suite **888 test** lulus; tambahan pergantian akun, tombstone dan boot luring
  kemudian ikut lulus dalam **76 test** fokus (termasuk **18 test** diskusi), bersama
  regresi membership, notifikasi, i18n-lazy, kelengkapan katalog dan registry.
- Shared schemas **129**, SDK **184** test lulus. Tes privacy analytics tambahan
  memeriksa path post/komentar serta identifier tidak valid.
- API **48 test** lulus dengan PostgreSQL pada schema acak terisolasi dan Redis
  bucket acak: regresi post/comment/report/moderation, detail publik ID/arsip,
  validasi UUID/404, rate limiter dan parity OpenAPI. Data pengguna tidak direset.
- Chrome nyata: **20 test** Community lulus, termasuk **8 test** baru dengan
  draft reload, post/comment/report, edit/delete, keyboard/focus trap/pagination,
  axe dan reflow 320/768/1024/1440 px pada teks 200%. Modal hasil render diperiksa
  visual. Registry a11y mencakup detail post, komentar dan dialog laporan.
  Keenam state Community pada registry axe juga lulus terhadap build terakhir.
- Lint/typecheck workspace lulus; build web/service worker lulus. Budget JS awal
  **129,6 KB / 200 KB gzip**. OpenAPI drift dan diff check bersih.

Uji manual NVDA/TalkBack, PDP dan gate operasional tetap milik PR-119. Draf
localStorage bersifat per perangkat; tidak disinkronkan ke server. Keberhasilan
PR ini tidak menyatakan gate rilis PR-112 produksi sudah terpenuhi.

Next: PR-118 UI admin Community dan antrean moderasi; PR-119 gate readiness.
