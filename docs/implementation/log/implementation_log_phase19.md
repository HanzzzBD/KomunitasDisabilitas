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
