# Implementation Log — Phase 13 (Admin Dashboard & Analytics)

> Catatan per PR yang selesai di Phase 13. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-080 — Admin Metrics BE

> **Phase:** [13 - Admin Dashboard & Analytics](../phase-13-admin-analytics.md#pr-080---admin-metrics-be)
> **Tanggal:** 2026-10-02
> **Status:** Selesai
> **Branch:** `pr-080-admin-metrics` → `phase-13-admin-analytics` (branch phase dibuat dari `main` sesudah `phase-12 → main`, PR #189)

### Ringkasan hasil

`GET /api/v1/admin/metrics?periode=7d|30d|semua` (role `admin`): funnel kohort per pengguna
(daftar → profil siap → melamar → wawancara → diterima), North Star (`hired_confirmed_at`),
pemakaian AI per fitur, dan total DLQ. Seluruhnya agregat; tidak ada kolom terenkripsi yang
dibaca. Cache 5 menit per periode di Redis cache.

### Keputusan owner (AskUserQuestion, 2026-10-02)

1. **Funnel per pengguna** — tiap tahap = jumlah pencari kerja kohort yang PERNAH mencapainya.
2. **"Profil" = siap dicocokkan** — baris `seeker_profiles` + `profile_embedding` terisi (syarat
   feed rekomendasi).
3. **Periode `7d | 30d | semua`**, bawaan 30d; kohort = pengguna yang DAFTAR dalam periode.
4. **Tanpa tabel counter harian** — agregasi SQL + cache 5 menit; dicatat utang **U-32**
   berpemicu (query dingin > 300 ms atau > 20.000 seeker).

### Scope selesai

**Kontrak (`packages/schemas/src/admin.ts`, skeleton PR-004 diisi)** — `adminMetricsQuerySchema`,
`adminFunnelSchema`, `adminNorthStarSchema`, `adminAiUsage(Feature)Schema`, `adminMetricsSchema`
+ response; OpenAPI `GET /admin/metrics` (tag `admin`).

**API — modul resmi baru `modules/admin`** (SDD §5.1 "internal ops, analytics"):

* `repositories/metrics.repository.ts` — tiga query SQL read-only ber-jendela eksplisit
  `[dari, sampai)`: funnel (CTE kohort; "wawancara" = status sekarang ATAU riwayat mencapai
  interview/offered/hired, karena admin boleh melompat status dan lamaran yang ditolak sesudah
  wawancara tetap pernah diwawancara), North Star (dalam periode + total), AI per fitur.
  Lintas tabel dengan sengaja — preseden `matching/repositories/embeddings.repository.ts`.
* `services/metrics.service.ts` — periode → jendela; jendela AI dipotong ke retensi `ai_usage`
  (90 hari) dan dilaporkan jujur sebagai `aiUsage.since`; cache respons utuh (termasuk
  `generatedAt`) 300 detik; **fail-open** bila Redis sakit; `dlqTotal: null` bila antrean tidak
  terjangkau (bukan 500).
* Controller + router (`access.role("admin")`, `validate({ query })`).
* `boot.ts` — DLQ dibaca lewat `createQueuesService` modul `internal` (sumber yang sama dengan
  `/internal/queues`).
* Operasi admin atas entitas domain TETAP di modul domainnya (preseden PR-051/PR-077a); modul
  `admin` hanya membaca agregat.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Funnel cocok fixture deterministik | `admin-metrics-db.test.ts`: fixture bertanggal Jan 2001 + jam modul dipatok 2001-02-01 → jendela 30d hanya berisi fixture; `{5,1,3,2,1}` persis; soft-delete, admin, dan pendaftar di luar jendela tidak terhitung |
| Query tidak menyentuh kolom terenkripsi | `admin-metrics.test.ts` membaca kolom `Bytes`/CIPHERTEXT LANGSUNG dari `schema.prisma` (tidak lulus hampa: menemukan `disability_types`, `accommodation_needs`, `disclosure_snapshot`) lalu memastikan ketiga SQL tidak memuatnya — juga tanpa `phone`/`email`/`full_name` |
| Cache 5 menit (hit kedua tanpa query berat) | unit: repository dipanggil sekali untuk dua permintaan, TTL 300; DB: baris baru tidak terlihat sampai cache dikosongkan, `generatedAt` sama |
| North Star = count `hired_confirmed_at` | `confirmedInPeriod` 2 (kohort E + pendaftar lama H yang konfirmasinya jatuh di jendela) |
| Respons < 500 ms (cache hangat) | DB test mengukur permintaan kedua < 500 ms |

### Verifikasi

* Unit `admin-metrics.test.ts` 11/11; integrasi `admin-metrics-db.test.ts` 4/4 di PostgreSQL dev
  (5433, migrasi mutakhir) — dijalankan, bukan terlewat; fixture terbersihkan (0 baris tersisa).
* Manual count: periode `semua` di DB dev = hitungan psql langsung (daftar 5, melamar 4, North
  Star 1).
* `turbo run lint typecheck test --concurrency=1`: **27/27** dengan Docker hidup (API 2114 lulus). `openapi-parity` sempat merah — perakitan test belum memuat modul `admin`; penjaganya bekerja, perakitannya diperbarui. `check:openapi` sinkron.

### Risiko & catatan

* Tahap funnel tidak dijamin menurun ("profil siap" dan "melamar" diukur independen) — dicatat di
  kontrak; layar PR-081 perlu menampilkannya sebagai angka per tahap, bukan corong yang menyiratkan
  subset.
* `confirmedTotal` sepanjang waktu tidak di-cache terpisah — ikut cache periode.

### Next steps

1. PR-081 — dashboard admin (tiles aksesibel: angka + label + tren tekstual) mengonsumsi endpoint ini.

---

## PR-081 — Admin Dashboard FE

> **Phase:** [13 - Admin Dashboard & Analytics](../phase-13-admin-analytics.md#pr-081---admin-dashboard-fe)
> **Tanggal:** 2026-10-03
> **Status:** Selesai
> **Branch:** `pr-081-admin-dashboard` → `phase-13-admin-analytics`

### Ringkasan hasil

Ringkasan `/admin` kini dibuka dengan dasbor "Kesehatan pilot": pilihan periode (7 hari / 30 hari
/ sepanjang waktu), tile funnel lima tahap, tile penempatan kerja (dalam periode + sepanjang
waktu) dan DLQ, serta tabel pemakaian AI per fitur. Tiap tile menyebut label DAN periodenya,
angkanya, dan tren dalam kalimat ("Naik 3 dibanding 30 hari sebelumnya (12)"). Diperbarui
otomatis tiap 5 menit tanpa pengumuman dan tanpa memindah fokus.

### Keputusan owner (AskUserQuestion, 2026-10-02/03)

1. **Tren dari API** — respons `GET /admin/metrics` bertambah `previous` (jendela sebelumnya yang
   sama panjang); `null` untuk `semua`. Perubahan aditif di PR ini (dokumen: "Backend: tidak ada").
2. **Lokasi: Ringkasan `/admin`**, di atas kartu tautan yang sudah ada.
3. **Refresh tiap 5 menit, diam** (ikut umur cache server; berhenti saat tab tak terlihat) +
   tombol "Perbarui sekarang".
4. **NVDA dijalankan sekarang.**

### Scope selesai

**API (aditif)** — `adminMetricsPreviousSchema`; service menghitung jendela sebelumnya
(`jendelaSebelumnya`) — kohort yang daftar di jendela itu dengan tahap yang dicapai sampai
sekarang, plus konfirmasi diterima di jendela itu. Kunci cache `v1 → v2` (bentuk berubah).
Test DB: pendaftar Des 2000 → `previous {registered:1, applied:1}`.

**`@nawasena/api-client`** — `getAdminMetrics(client, periode)`, `adminKeys.metrics(periode)`.

**Web**

* `features/admin/metrik-tren.ts` — fungsi murni `hitungTren`/`kalimatTren`: arah, selisih, DAN
  nilai pembanding disebut; `semua` tanpa tren.
* `features/admin/metrik-dasbor.tsx` — radio grup periode; tile = `<dt>` (label + periode) /
  `<dd>` (angka + tren; panah `aria-hidden`); tabel AI ber-`caption`, `th scope=col/row`; tidak
  ada live region di atas angka (dua belas angka dibacakan tiap 5 menit = gangguan); "Data per
  … WIB" dari `generatedAt`.
* `routes/admin.tsx` — `AdminRingkasan` memasang dasbor di atas kartu tautan.
* Katalog `admin.metrik.*` (±50 entri id + id-simple).
* Pemalsu e2e `metrikAdminUji` (naik/turun/sama sekaligus) → registry "admin — ringkasan" kini
  memeriksa dasbor dengan axe.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Semua metrik terbaca SR dengan konteks (label+nilai+periode) | jsdom `<dt>` "Pendaftar baru, 30 hari terakhir" / `<dd>`; NVDA membacakan label → "15. Naik 3 …" |
| Tren naik/turun tekstual | unit `metrik-tren.test.ts` (naik/turun/sama, ribuan id-ID, `semua` tanpa tren); panah `aria-hidden` |
| Auto-refresh tidak mencuri fokus | jsdom: refetch → fokus tetap, wilayah status kosong; e2e: jam palsu maju 5 menit → permintaan baru, radio tetap terfokus |
| axe pass | `admin-metrik.spec.ts` (30d, 7d) + registry; suite a11y 141/141 |
| Angka cocok fixture E2E | e2e: 15 / naik 3 (12) / turun 2 (8) / total 4 / 1.250 permintaan AI |

### Verifikasi

* jsdom `admin-metrik.test.tsx` 4/4, unit `metrik-tren.test.ts`; api-client `admin.test.ts`; API
  `admin-metrics(-db)` 20/20 (DB hidup).
* Playwright sesudah `build`: `admin-metrik.spec.ts` 2/2, suite penuh **141/141**.
* `cek:budget`: 108,6 KB (tidak berubah — dasbor di chunk admin).
* `turbo run lint typecheck test --concurrency=1`: **27/27**.
* NVDA: 3 run sah — [checklist](pr-081-nvda-checklist.md). **Cacat nyata ditemukan & diperbaiki:**
  angka dan tren terbaca menempel ("15Naik 3…") → pemisah `sr-only`, dijaga test.

### Risiko & catatan

* "Perbarui sekarang" dalam 5 menit sejak hitungan terakhir mengembalikan angka yang sama (cache
  server) — "Data per … WIB" menunjukkan umur angkanya dengan jujur.
* Manual Verification "data staging" belum — staging belum ada (Phase 16).

### Next steps

1. PR-082 — analytics Umami privacy-first + funnel KPI.

---

## PR-082 — Analytics Instrumentation — Umami + Funnel (Gap G2)

> **Phase:** [13 - Admin Dashboard & Analytics](../phase-13-admin-analytics.md#pr-082---analytics-instrumentation--umami--funnel-gap-g2)
> **Tanggal:** 2026-10-03
> **Status:** Selesai (AC "funnel di Umami staging" → utang **U-33**, staging belum ada)
> **Branch:** `pr-082-analytics-umami` → `phase-13-admin-analytics`

### Ringkasan hasil

Analytics privacy-first tanpa skrip pihak ketiga: web mengirim pageview (path ternormal) dan enam
event funnel KPI langsung ke Umami self-host di origin sendiri (`/analitik/api/send`). Kontrak
event no-PII hidup di `packages/schemas` (dipakai mobile PR-094). Opt-out per perangkat di
Pengaturan; Do Not Track/GPC dihormati; tanpa website id (dev/test/CI) semuanya no-op.

### Keputusan owner (AskUserQuestion, 2026-10-03)

1. **Opt-out + hormati DNT/GPC** (menyala bawaan, tanpa PII).
2. **Util sendiri ke `/api/send`**, bukan skrip resmi Umami.
3. **Pageview ikut**, path tanpa id/query (KPI retensi).
4. **Opt-out per perangkat** (localStorage) — tanpa ubah backend.
5. **`profil_lengkap`** = profil berisi headline + kota/provinsi + ≥1 keahlian, sekali per akun
   per perangkat.
6. **`wawancara`** dikirim dari peramban PELAMAR saat melihat lamarannya sampai wawancara atau
   lebih jauh, sekali per lamaran.
7. **Umami di compose dev profil `analitik`** (tidak naik dengan `up` biasa).

### Scope selesai

* **Kontrak** `packages/schemas/src/analytics.ts` — enum 6 event; `data` per event `.strict()`
  (hanya `daftar.metode`, `cv_dibuat.via`); `normalkanPath` (UUID/angka → `:id`, buang
  query/hash); `analyticsPayloadSchema` (path ber-id/beremail/ber-query ditolak). Tidak ada data
  disabilitas — termasuk pilihan pengungkapan saat melamar.
* **Web** — `shared/analitik.ts` (pintu: config env / seam uji `window.__nawasenaAnalitik`,
  DNT/GPC, opt-out, `track`, `trackPageview`, `sekaliSaja`) dan `shared/analitik-kirim.ts`
  (dimuat malas: validasi + `POST` keepalive, `credentials: omit`, tanpa `title`/`referrer`,
  galat ditelan). Pageview di `TataLetak` lewat **impor dinamis**.
* **Titik funnel** — `daftar` (OTP & Google, hanya `isNewUser`), `profil_lengkap`
  (`features/profil/analitik-profil.ts`; simpan profil & tambah keahlian), `cv_dibuat` (dari
  profil; sesi AI selesai dengan CV, sekali per CV), `lamar` (lamaran baru), `wawancara`,
  `hired_confirmed`.
* **Opt-out** — kartu "Statistik pemakaian" di Pengaturan → Akun & Data Saya (KotakCentang +
  status; diganti penjelasan bila DNT).
* **Infra dev** — `umami` + `umami-db` (database sendiri) di compose profil `analitik`; proxy Vite
  `/analitik` → `:3010`.
* **Dokumen** — `docs/katalog-event-analitik.md` (event ↔ KPI PRD §15, kebijakan privasi,
  konfigurasi); utang **U-33**.

### Temuan sampingan — bug dialog lamar PR-078 (diperbaiki)

E2E analytics menekan "Kirim lamaran" sebelum daftar CV tiba → muncul galat palsu "Pilih CV…",
padahal sesaat kemudian CV bawaan tampil terpilih. Di 3G lambat ini pengalaman nyata. Perbaikan:
Kirim `aria-disabled` + menolak selama daftar CV dimuat; test regresi di `lamar.test.tsx`.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Funnel lengkap terlihat di Umami staging | **Belum** (staging = Phase 16, U-33). Umami DEV sungguhan: ke-6 event + pageview `/lowongan/:id` tercatat dari `badanUmami` yang sama |
| Payload lolos schema no-PII (test) | `packages/schemas/__tests__/analytics.test.ts` 15 (UUID, query, email, event liar, data liar, pengungkapan, kolom tambahan ditolak); e2e: tidak ada id/query/`disclose`/`+62`/`@` di payload |
| Analytics gagal → aplikasi tidak terganggu | unit: fetch ditolak → resolve; e2e: endpoint 500 → lamaran tetap berhasil |
| Event terdokumentasi | `docs/katalog-event-analitik.md` |
| Opt-out di settings | e2e: matikan di Pengaturan → nol kiriman sesudahnya; DNT → nol kiriman + kotak diganti penjelasan |

### Verifikasi

* Unit/jsdom: schemas `analytics.test.ts` 15/15, web `analitik.test.ts` 7/7, `lamar.test.tsx` 13/13.
* Playwright sesudah `build`: `analitik.spec.ts` 4/4, `lamar.spec.ts` 3/3.
* `cek:budget` 108,7 KB; **Lighthouse 3G lokal 0,76** (impor statis pageview sempat menurunkannya
  ke 0,75 = tepat ambang → diganti impor dinamis).
* Umami dev: dinaikkan, diverifikasi, lalu dimatikan lagi.

### Risiko & catatan

* Opt-out per perangkat — login di perangkat lain perlu mematikan lagi (dikatakan di UI).
* Umami bukan sumber angka resmi: perangkat opt-out/DNT tidak tercatat; North Star resmi tetap
  `GET /admin/metrics` (PR-080).
* Seam uji `window.__nawasenaAnalitik` hanya dibaca bila env kosong; yang bisa dinyalakan hanyalah
  pengiriman ke origin sendiri lewat skema no-PII.

### Next steps

1. PR-083 — moderasi suspend user.
2. PR-097 (Phase 16) — bayar U-33.

---

## PR-083a — Moderasi — Suspend User (API)

> **Phase:** [13 - Admin Dashboard & Analytics](../phase-13-admin-analytics.md#pr-083---moderasi--suspend-user)
> **Tanggal:** 2026-10-03
> **Status:** Selesai (bagian API; halaman admin "Pengguna" = PR-083b)
> **Branch:** `pr-083a-suspend-api` → `phase-13-admin-analytics`

### Ringkasan hasil

Admin bisa menangguhkan dan memulihkan akun pencari kerja dengan alasan wajib yang tercatat di
audit. Akun yang ditangguhkan seketika kehilangan semua sesinya. Login berikutnya, lewat OTP
maupun Google, ditolak dengan `403 AKUN_DITANGGUHKAN` beserta alamat banding. Data akun tidak
disentuh. Pemulihan mengembalikan akses, tetapi sesi lama tidak hidup lagi: pengguna harus
masuk ulang.

### Keputusan owner (AskUserQuestion, 2026-10-03)

1. **Bagian "Pengguna" baru** — `GET /admin/users` (cari nama/nomor/email, saring status, cursor
   50) untuk halaman PR-083b.
2. **Hanya pencari kerja** yang bisa ditangguhkan; admin tidak bisa menangguhkan admin lain
   maupun dirinya sendiri.
3. **Pesan umum + cara banding** — alasan admin TIDAK ditampilkan ke pengguna; status hanya
   terungkap SESUDAH kredensial terbukti (orang lain yang mengetik nomornya tidak tahu).
4. **Alamat banding dari env `SUPPORT_EMAIL`** — opsional di dev (bawaan
   `dukungan@nawasena.local`), wajib di production.
5. **Disembunyikan dari listing normal:** daftar lamaran admin, kabar admin, dan kohort metrik.
6. **PR dipecah** 083a (API) / 083b (web) — preseden PR-077a/b.

### Scope selesai

* **DB** — migrasi 21: `users.suspended_at`, `users.suspend_reason` + CHECK
  `users_suspend_berpasangan`. Migrasi 22: nilai enum `RefreshRevokedReason.suspended`. Migrasi
  21 sudah terlanjur diterapkan di DB dev sebelum kebutuhan enum ditemukan; mengubahnya akan
  memicu ketidakcocokan checksum. Keduanya aditif, `down.sql` ada.
* **Auth** — `findActiveSessionUser` menyaring `suspendedAt: null`, sehingga penjaga tiap
  permintaan dan refresh menolak seketika. Login OTP & Google bermuara di `sessionService.issue()`
  → `findLoginTarget` → `AKUN_DITANGGUHKAN` dengan `hint` berisi alamat banding.
  `createSessionRevoker(prisma)`: `ver` naik dulu, lalu refresh token dicabut (`suspended`).
* **Users** — `moderation.repository` (daftar keyset `created_at`, cari `contains` tak peka
  huruf; suspend/unsuspend sebagai CAS), `moderation.service` (aturan sasaran, cabut sesi, audit),
  controller, rute `role("admin")`. Rute hanya didaftarkan bila pencabut sesi disediakan.
* **Kontrak** — `packages/schemas/src/admin-users.ts`. Berkas terpisah dari `users.ts`, yang ikut
  bundel awal web. Audit `USER_SUSPENDED` / `USER_UNSUSPENDED { reason }`; OpenAPI 3 path +
  `termasuk_ditangguhkan`.
* **Galat** — `AKUN_DITANGGUHKAN` 403, `PENGGUNA_TIDAK_DITEMUKAN` 404,
  `PENGGUNA_TIDAK_BISA_DIMODERASI` 422, `STATUS_PENGGUNA_TIDAK_BERUBAH` 409.
* **Penyaring** — daftar lamaran admin menyembunyikan akun ditangguhkan bawaan
  (`?termasuk_ditangguhkan=true` untuk melihatnya). Kohort metrik PR-080
  `AND u.suspended_at IS NULL`. Kabar admin: pelanggan notifikasi tidak perlu diubah. Kabar admin
  hanya lahir dari tindakan pelamar (melamar, menarik, konfirmasi), dan akun ditangguhkan tidak
  punya sesi untuk bertindak. Test siklus membuktikan access token lama sudah 401.
* **Env & dokumen** — `SUPPORT_EMAIL` (+ `.env.example`, superRefine production); katalog audit;
  ekspor PDP: `suspended_at`/`suspend_reason` dikecualikan dengan alasan tertulis.

### Acceptance Criteria (bagian API)

| AC | Bukti |
|---|---|
| Suspended tidak bisa login/refresh | unit `auth-session.test.ts`: issue → `AKUN_DITANGGUHKAN` + alamat banding, tanpa sesi; refresh lama 401. DB `moderasi-db.test.ts`: access token lama 401 (penjaga produksi), refresh lama 401, login 403, refresh token tercabut `suspended` |
| Alasan wajib; audit tercatat | 400 bila alasan kosong; `USER_SUSPENDED`/`USER_UNSUSPENDED` ber-actor admin + `reason` |
| Unsuspend memulihkan akses | login baru berhasil; refresh LAMA tetap 401 (pemulihan = masuk ulang) |
| Suspended tidak di listing normal | daftar lamaran admin (bawaan tersembunyi / tampil dengan flag), kohort metrik, kabar admin (lihat Scope) |
| Konfirmasi dua langkah di FE | PR-083b |

### Verifikasi

* `turbo run lint typecheck test --concurrency=1`: **27/27**, DB hidup (API 2124 lulus). Test
  baru: `moderasi-db.test.ts` 5, unit suspend 2, env `SUPPORT_EMAIL` 2.
* Test yang ikut diperbarui:
  - prisma palsu auth kini mengembalikan `suspendedAt: null` seperti Prisma sungguhan;
  - test storage `production` mengisi `SUPPORT_EMAIL`;
  - snapshot katalog galat: tepat 4 kode baru.
* `check:openapi` sinkron.

### Insiden: database dev terhapus (2026-10-03)

Saat memeriksa drift skema, saya menjalankan `prisma migrate diff` dengan **database dev sebagai
`--shadow-database-url`**. Prisma mereset shadow DB, sehingga seluruh baris DB dev lokal (5433)
dan riwayat migrasinya hilang. Pemulihan otomatis ditolak pengaman. Atas izin owner, DB dibangun
ulang dengan `prisma migrate reset --force`: 21 migrasi + seed (5 pengguna, 5 perusahaan,
20 lowongan, 6 lamaran, 4 CV). Data uji manual sebelumnya tidak bisa dikembalikan, dan vektor
embedding perlu `embed:ulang` lagi. Pelajaran dicatat di memori agen: jangan pernah memakai DB
berisi data sebagai shadow.

### Risiko & catatan

* Selama ditangguhkan, pengguna tidak bisa mengekspor datanya sendiri (perlu masuk). Hak akses
  PDP dilayani lewat alamat banding — dicatat juga di alasan pengecualian ekspor.
* Pencarian `contains` tanpa indeks trigram pada `users` — cukup untuk skala pilot.

### Next steps

1. PR-083b — halaman admin "Pengguna" (daftar, cari, saring) + dialog tangguhkan/pulihkan dua
   langkah + pesan `AKUN_DITANGGUHKAN` di halaman masuk.

---

## PR-083b — Moderasi — Suspend User (halaman admin)

> **Phase:** [13 - Admin Dashboard & Analytics](../phase-13-admin-analytics.md#pr-083---moderasi--suspend-user)
> **Tanggal:** 2026-10-03
> **Status:** Selesai — PR-083 lengkap (083a API + 083b web); seluruh PR Phase 13 selesai
> **Branch:** `pr-083b-suspend-web` → `phase-13-admin-analytics`

### Ringkasan hasil

Bagian admin baru **"Pengguna"** (`/admin/pengguna`): cari nama/nomor/email (dikirim saat
formulir dikirim, bukan per ketukan), saring status, "Muat lebih banyak", dan tombol
Tangguhkan/Pulihkan per pencari kerja. Baris admin tidak punya tombol aksi. Aksi lewat
**dialog dua langkah**: (1) alasan wajib (catatan internal), (2) tinjau akibat + alasan yang akan
dicatat, lalu tombol final. "Kembali" tidak membuang isian, dan fokus pindah ke judul langkah.

### Scope selesai

* **`@nawasena/api-client`** — `listUsersAdmin` (q dipangkas; kosong tidak dikirim),
  `suspendUserAdmin`, `unsuspendUserAdmin` (alasan divalidasi sebelum berangkat),
  `adminKeys.users`. `listApplicationsAdmin` mendapat `termasukDitangguhkan`.
* **Web**
  - `features/admin/pengguna-daftar.tsx` dan `pengguna-moderasi.tsx` (satu dialog dua langkah;
    dialog bertumpuk dilarang `@nawasena/ui`).
  - `routes/admin-pengguna.tsx` + rute `admin/pengguna`; entri navigasi dan kartu Ringkasan
    admin.
  - Kotak "Tampilkan lamaran dari akun yang ditangguhkan" di daftar lamaran admin; sesudah
    moderasi, daftar pengguna & lamaran di-invalidasi.
  - 56 entri katalog (`admin.pengguna.*` + saringan lamaran).
* **Masuk dengan Google** — `AKUN_DITANGGUHKAN` tidak lagi ditelan menjadi "gagal umum". Layar
  menampilkan status + alamat banding dari server (alasan admin tidak pernah dikirim). Jalur OTP
  sudah menampilkan pesan + saran server lewat `pesanGalatApi`.
* **Test & verifikasi** — `admin-pengguna.test.tsx` 3, `masuk-google` +1, test navigasi admin
  lima entri. Registry a11y "admin — pengguna" dan pemalsu `/admin/users*` (stateful).
  `e2e/admin-pengguna.spec.ts` 2. Harness `verifikasi/admin-pengguna-nvda.verifikasi.ts`.

### Acceptance Criteria (PR-083 utuh)

| AC | Bukti |
|---|---|
| Suspended tidak bisa login/refresh | 083a (unit + DB); web: layar Google menampilkan status + banding |
| Alasan wajib; audit tercatat | 083a; web: Lanjut tanpa alasan → galat, tidak ada POST |
| Unsuspend memulihkan akses | 083a; e2e: Pulihkan → tombol kembali "Tangguhkan" |
| Konfirmasi dua langkah di FE | jsdom: POST hanya sesudah "Ya, tangguhkan" di langkah 2; fokus ke judul langkah; e2e keyboard-only + axe di kedua langkah; NVDA |
| Tidak di listing normal (flag) | 083a + kotak saringan di daftar lamaran admin |

### Verifikasi

* `turbo run lint typecheck test --concurrency=1`: **27/27** (DB hidup).
* Playwright sesudah `build`: **149/149**. Dua lari sebelumnya masing-masing gagal di spec
  BERBEDA (`aksesibilitas-matriks`, `admin-lamaran`), dan keduanya lulus diulang 4× (44/44),
  jadi itu flake akibat beban mesin, bukan regresi.
* `cek:budget` 108,8 KB.
* NVDA: satu run sah — [checklist](pr-083-nvda-checklist.md).

### Risiko & catatan

* Manual Verification "akun uji" (staging) belum — siklus penuh sudah dibuktikan integrasi DB 083a.
* Pengumuman status sesudah berhasil tertutup pengumuman fokus; nama tombol yang berubah menjadi
  penanda utamanya (checklist NVDA).

### Next steps

1. Seluruh PR Phase 13 (080, 081, 082, 083a/b) selesai — `phase-13-admin-analytics → main`
   menunggu perintah eksplisit owner.
