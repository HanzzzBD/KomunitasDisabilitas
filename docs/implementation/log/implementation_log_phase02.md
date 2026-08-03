# Implementation Log — Phase 02 (Authentication & Account)

> Catatan per PR yang selesai di Phase 02. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---
## PR-016a — OTP Core: Store Redis, Limiter, Lockout, Endpoint request/verify

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-016---auth-otp-whatsapp-fonnte--fallback-twilio)
> **Tanggal:** 2026-08-03
> **Status:** Selesai (bagian pertama dari PR-016; adapter provider = PR-016b)

### Ringkasan hasil

Modul `auth` lahir dengan alur login OTP lengkap dari sisi platform: `POST /api/v1/auth/otp/request` dan `POST /api/v1/auth/otp/verify`, kuota kirim 3/nomor/jam, maksimum 5 percobaan per kode, lockout progresif setelah kode dihanguskan, dan find-or-create akun pada verifikasi yang berhasil. Kode OTP hanya hidup sebagai HMAC-SHA256 ber-pepper di Redis; nomor HP tidak pernah menjadi bagian kunci Redis maupun isi log/audit. Pengiriman pesan sengaja belum tersambung ke provider mana pun — yang ada baru interface `OtpSender` dan implementasi "belum dikonfigurasi" yang menolak (503) secara sadar.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 (apps/api: 190 test lulus; 31 test integrasi berjalan terhadap PostgreSQL & Redis compose dev yang nyata).

### Scope selesai

* **Kontrak** (`packages/schemas`): `otpCodeSchema`, `verifyOtpSchema`, `verifyOtpResponseSchema` (`userId` + `isNewUser`); path `/auth/otp/verify` dan response 401/410/429/503 masuk dokumen OpenAPI; `openapi.json` di-regenerate (drift check CI hijau).
* **core/http**: tiga kode katalog baru — `KODE_OTP_SALAH` (401), `KODE_OTP_HANGUS` (410), `TERLALU_BANYAK_PERCOBAAN` (429). `AppError` kini bisa membawa `retryAfterSeconds`, dan error handler global menuliskannya sebagai header `Retry-After` (sebelumnya hanya rate limit global yang punya header ini).
* **core/config**: `OTP_HASH_SECRET` opsional (min 32 karakter) + dokumentasi di `.env.example`.
* **core/db**: `createPrismaClient()` — klien Prisma aplikasi pertama di API, di-inject ke repository (repository tidak membuat koneksi sendiri).
* **core/logger**: `phone` dan `target` masuk deny-list redaction.
* **modules/auth**: `repositories/otp.repository.ts` (hash kode, sidik nomor, pencacah kirim/percobaan/strike, lock), `repositories/user.repository.ts` (find-or-create), `services/otp.service.ts` (kebijakan SDD §8.1), `services/otp-sender.ts` (interface + sender "belum dikonfigurasi"), controller, router, dan wiring modul.
* **Wiring entry point**: modul auth di-mount pada `/api/v1`; `createAuditLog` PR-014 dipakai pertama kali (writer Prisma + sink metrik hitungan memori); `prisma.$disconnect()` masuk graceful shutdown.
* **Test**: `auth-otp.test.ts` (14 unit), `auth-otp-http.test.ts` (9 integrasi HTTP), `auth-otp-redis.test.ts` (4 integrasi Redis nyata), `auth-user-db.test.ts` (4 integrasi PostgreSQL nyata).

### Scope tidak selesai (dan alasannya)

* **Adapter Fonnte + Twilio dan fallback otomatis → PR-016b.** Scope utuh PR-016 diperkirakan 600–700 LOC, di atas target <500 (CLAUDE.md §9). Owner menyetujui pemecahan 2026-08-03, mengikuti preseden PR-015a/PR-015b. Akibatnya AC "Fonnte gagal → fallback Twilio otomatis" dan Manual Verification staging belum bisa dicentang.
* **Penerbitan JWT** tetap milik PR-018: verify mengembalikan `{ userId, isNewUser }`, dan PR-018 menambah token pada envelope yang sama (perubahan additive).
* **Endpoint OTP di `packages/api-client`** tidak ditambahkan — konsumen pertamanya adalah UI login (PR-030); menambahkannya sekarang hanya menambah kode tanpa pemakai.

### Keputusan teknis

1. **Kunci Redis memakai sidik HMAC nomor, bukan nomor.** SDD hanya mensyaratkan hash OTP, tetapi `KEYS otp:*` dengan nomor mentah sama saja dengan mengekspor daftar nomor pengguna. Biayanya satu HMAC per operasi; hasilnya Redis tidak lagi menyimpan PII dalam bentuk apa pun.
2. **Hash OTP di-pepper dan diikat ke nomor.** `HMAC(secret, "otp:<phone>:<code>")`: dump Redis tanpa `OTP_HASH_SECRET` tidak bisa di-brute force menjadi kode (6 digit akan trivial bila hash tanpa kunci), dan hash yang bocor tidak bisa dipakai ulang untuk nomor lain. Perbandingan memakai `timingSafeEqual`.
3. **Tanpa `OTP_HASH_SECRET`, endpoint OTP dimatikan (503), bukan degradasi diam-diam.** Mengikuti pola `INTERNAL_TOKEN` (PR-015b): `.env` lama tetap valid dan API tetap bisa boot, tetapi tidak pernah ada hash tanpa kunci. Alternatif "env wajib" ditolak karena akan mematikan boot semua environment yang sudah jalan.
4. **`retryAfterSeconds` menjadi properti `AppError`, bukan `res.setHeader` di controller.** Service adalah tempat kebijakan waktu tunggu diketahui; menuliskan header dari sana akan membocorkan urusan HTTP ke lapisan bisnis. Dengan ini setiap 429 di masa depan (PR-105) otomatis konsisten.
5. **Percobaan yang DITOLAK ikut menaikkan pencacah kirim, tetapi TTL tidak diperpanjang.** Lebih ketat terhadap penyalahguna, dan `Retry-After` yang dilaporkan tetap jujur karena jendela terus bergerak maju.
6. **Percobaan ke-6 (bukan ke-5) yang menghanguskan kode.** Membaca AC secara harfiah: pengguna berhak atas 5 percobaan penuh; percobaan ke-6 adalah peristiwa yang menghapus kode, menaikkan strike, dan menyalakan lockout. Diuji dengan memastikan kode BENAR pun ditolak setelah itu.
7. **Tangga lockout 5m → 15m → 60m per "kode hangus" beruntun (jendela strike 24 jam).** Angka lockout tidak disebut SDD; tangga dipilih agar salah ketik biasa tidak menghukum berlebihan, sementara serangan otomatis cepat mahal. Semua angka berada di satu konstanta `OTP_POLICY` yang juga dipakai test.
8. **Kegagalan kirim menghanguskan kode yang telanjur dibuat.** Kode yang tidak pernah sampai tidak boleh menggantung 5 menit dan memakan kuota percobaan pengguna.
9. **Kuota kirim TIDAK di-reset setelah login berhasil.** Kalau di-reset, batas 3/jam bisa dilewati dengan berkali-kali login sukses.
10. **`fullName` akun baru diisi string kosong.** Login OTP tidak menanyakan nama; mengarang nama ("Pengguna Nawasena") akan menjadi data palsu di baris pengguna nyata. Pengisian nama adalah urusan onboarding (PUT /me, PR-020).
11. **Balapan find-or-create diserahkan ke unique index parsial PR-009.** Dua verifikasi bersamaan: pemenang membuat baris, yang kalah menangkap P2002 lalu membaca ulang baris pemenang. Diuji terhadap PostgreSQL nyata.
12. **`code` sengaja TIDAK dimasukkan deny-list redaction logger.** Kunci `code` sudah dipakai error handler untuk kode error; meredaksinya akan membutakan observability. Kode OTP dijaga dengan tidak pernah memasukkannya ke objek log sama sekali (dan `otp` sudah ada di deny-list sejak PR-006).

### Risiko yang ditemukan

* **Lockout berbasis nomor bisa dipakai menyerang korban tertentu (denial of login).** Penyerang yang tahu nomor seseorang dapat memancing lockout dengan sengaja salah kode. Mitigasi yang sudah ada: lockout maksimal 60 menit dan tidak menyentuh sesi yang sudah berjalan. Mitigasi lanjutan yang direkomendasikan: rate limit per-IP di lapisan HTTP (PR-105) agar biaya serangan naik, dan jalur masuk alternatif Google (PR-017).
* **Limiter belum punya batas per-IP.** Satu IP masih bisa menyapu banyak nomor berbeda (masing-masing 3 kirim/jam). Redis store `express-rate-limit` + limit per endpoint adalah scope PR-105 — dicatat di "Out of Scope" file phase.
* **Rotasi `OTP_HASH_SECRET` menghanguskan seluruh OTP yang sedang beredar.** Tidak berbahaya (pengguna cukup minta kode baru), tetapi harus disebut di runbook saat rotasi kunci dilakukan pada jam sibuk.
* **API kini membawa dua klien database** (`pg` untuk readiness ping + Prisma untuk aplikasi). Utang ini sudah terdaftar dan dimiliki PR-097; PR ini tidak menambah pemakai `pg`, hanya menandainya di komentar `core/db`.
* **Sink metrik audit masih hitungan memori** di entry point — cukup untuk mendeteksi kegagalan tulis lewat log, tetapi belum terkirim ke backend metrik (PR-103).
* **Redis cache bertipe `allkeys-lru`**: secara teori kunci OTP bisa ter-evict sebelum TTL habis saat memori penuh. Dampaknya pengguna diminta meminta kode baru (bukan kebocoran). Bila ini terlihat di produksi, pindahkan namespace OTP ke instance `noeviction`.

### Next steps

* **PR-016b** — adapter Fonnte (primer) + Twilio SMS (fallback) di balik `OtpSender`, env kredensial provider (opsional, deny-by-default seperti `OTP_HASH_SECRET`), test fallback dengan mock HTTP, dan Manual Verification kirim OTP nyata ke nomor uji di staging.
* **PR-018** — tambahkan pasangan JWT pada response verify (additive terhadap `verifyOtpResponseSchema`).
* **PR-105** — rate limit per-IP untuk `/auth/otp/*` + Redis store `express-rate-limit`, melengkapi limiter per-nomor di PR ini.
* **PR-030** — UI login memanggil endpoint ini; tambahkan `verifyOtp` di `packages/api-client` saat itu.
* **Katalog audit**: bila PR-017/018 membutuhkan aksi "login sukses", tambahkan action baru di `packages/schemas/src/audit.ts` — saat ini hanya `AUTH_LOGIN_FAILED` yang tersedia.

**Out of Scope (dicatat):** adapter provider (PR-016b); JWT (PR-018); UI login & E2E (PR-030); rate limit per-IP (PR-105); endpoint di api-client (PR-030).

---
## PR-016b — Adapter Fonnte + Twilio di balik OtpSender & Fallback Otomatis

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-016---auth-otp-whatsapp-fonnte--fallback-twilio)
> **Tanggal:** 2026-08-03
> **Status:** Selesai (Manual Verification staging menunggu kredensial nyata)

### Ringkasan hasil

OTP sekarang benar-benar bisa terkirim: adapter Fonnte (WhatsApp, primer) dan Twilio (SMS, cadangan) hidup di balik interface `OtpSender` dari PR-016a, dirangkai `createFallbackOtpSender` yang otomatis mencoba provider berikutnya saat yang pertama gagal. Rantai dirakit dari env oleh `createOtpSenderFromEnv`; provider yang kredensialnya kosong dilewati, dan tanpa satu pun provider endpoint tetap menjawab 503 (deny-by-default PR-016a tidak berubah). Service OTP tidak berubah sama sekali — ia tetap tidak tahu nama provider mana pun, yang merupakan inti mitigasi risiko "ketergantungan Fonnte".

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 (apps/api 227 test lulus, termasuk integrasi PostgreSQL & Redis nyata).

### Scope selesai

* `services/fonnte.sender.ts` — `POST {baseUrl}/send`, header `Authorization: <token>` (Fonnte memakai token mentah, bukan `Bearer`), body form-urlencoded `target`/`message`/`countryCode`.
* `services/twilio.sender.ts` — `POST {baseUrl}/2010-04-01/Accounts/{sid}/Messages.json`, Basic auth, body `To`/`From`/`Body`.
* `createFallbackOtpSender(senders, logger)` — coba berurutan, log per kegagalan, gagal total → `OtpSenderError` menyebut seluruh rantai.
* `buildOtpMessage(code)` — isi pesan Bahasa Indonesia sederhana + peringatan anti-phishing.
* `createOtpSenderFromEnv(env, logger, fetchImpl?)` — urutan Fonnte → Twilio sesuai SDD §8.1; di-wire di entry point.
* env baru (semua opsional): `FONNTE_TOKEN`, `FONNTE_BASE_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_BASE_URL`, `OTP_SEND_TIMEOUT_MS` + dokumentasi `.env.example`.
* Test: `auth-otp-sender.test.ts` (18 test) + 2 test alur penuh HTTP baru di `auth-otp-http.test.ts`.

### Scope tidak selesai (dan alasannya)

* **Manual Verification "kirim OTP nyata ke nomor uji di staging"** — butuh akun Fonnte/Twilio berbayar dan environment staging; tidak bisa dilakukan agent. Prosedurnya sudah dituliskan di checklist file phase agar tinggal dijalankan owner.

### Keputusan teknis

1. **HTTP 200 dari Fonnte tidak dianggap sukses begitu saja.** Fonnte melaporkan kegagalan pengiriman sebagai `200 {"status": false, "reason": "..."}`. Memeriksa status HTTP saja akan membuat sistem yakin pesan terkirim sementara pengguna menunggu kode yang tidak pernah datang — dan fallback Twilio tidak akan pernah menyala. Body diperiksa eksplisit; `status !== true` = gagal.
2. **`fetch` diinjeksi (`FetchLike`), bukan di-stub global.** Test tidak menyentuh `globalThis.fetch` sehingga tidak ada kebocoran state antar-file test, dan adapter tetap memakai `fetch` bawaan Node 20 di produksi (tanpa dependensi HTTP baru).
3. **Timeout via `AbortSignal.timeout` per panggilan (default 10 detik, dari env).** Tanpa ini, satu provider yang menggantung akan menahan request pengguna sampai batas Express; dengan ini, provider lambat otomatis menyerahkan giliran ke cadangan.
4. **Kredensial Twilio wajib lengkap bertiga atau kosong sama sekali** — divalidasi `superRefine` di `core/config`, jadi salin-tempel yang terpotong membuat boot GAGAL dengan menyebut variabel yang hilang. Cadangan yang diam-diam mati justru berbahaya: ia baru ketahuan saat Fonnte bermasalah, yaitu saat paling dibutuhkan.
5. **Kegagalan provider di-log `warn`, bukan `error`, selama masih ada cadangan.** Pengguna tetap menerima kodenya, jadi itu belum insiden; `error` hanya muncul dari service saat seluruh rantai gagal.
6. **Pesan error provider ikut di-log, pesan error jaringan tidak.** Alasan dari provider ("saldo habis", "Authenticate") berguna untuk operator dan tidak memuat PII; sebaliknya error jaringan Node bisa membawa URL/parameter, jadi hanya nama jenis errornya (`TimeoutError`) yang dicatat. Alasan provider dipotong 120 karakter.
7. **Satu provider terkonfigurasi = pengirim itu langsung dipakai, tanpa pembungkus rantai.** Menghindari lapisan try/catch yang tidak berguna dan membuat nama di log (`fonnte`) apa adanya.
8. **Nama pengirim rantai adalah `"fonnte → twilio"`.** Muncul di log/metrik dan langsung memberi tahu operator urutan yang berlaku pada environment tersebut.

### Risiko yang ditemukan

* **Belum ada bukti dari dunia nyata.** Seluruh perilaku provider di sini berasal dari dokumentasi API, bukan panggilan nyata: bentuk body Fonnte, kode status Twilio, dan format nomor tujuan bisa berbeda di lapangan. Manual Verification staging adalah gerbang yang harus dilewati sebelum PR-030 (UI login) dianggap dapat dipakai pengguna nyata.
* **Kegagalan Fonnte membuat pengguna menunggu dua kali timeout** (hingga ~20 detik dengan default) sebelum SMS terkirim. Bila terlihat mengganggu di staging, turunkan `OTP_SEND_TIMEOUT_MS` — nilainya sudah dari env, bukan hardcode.
* **Biaya SMS Twilio tidak berkuota di sini.** Fonnte yang mati berkepanjangan akan mengalihkan seluruh trafik OTP ke SMS berbayar. Kuota kirim per nomor (3/jam) membatasi penyalahgunaan per pengguna, tetapi batas biaya global belum ada — pantau lewat dashboard Twilio; alerting = PR-103.
* **Isi pesan memuat kode dalam bentuk teks di jaringan provider.** Tidak terhindarkan untuk OTP, tetapi berarti provider adalah pihak tepercaya: token provider harus diperlakukan sebagai kredensial produksi (ADR-015) dan tidak boleh dipakai lintas environment.
* **Nomor tujuan dikirim ke pihak ketiga** — konsekuensi PDP yang perlu tercermin di kebijakan privasi (pemrosesan oleh prosesor data). Dicatat untuk PR dokumen legal/rilis.

### Next steps

* **Owner:** jalankan Manual Verification di staging (prosedur ada di checklist file phase), lalu centang butir terakhir PR-016.
* **PR-017/018** — Google OAuth & JWT; setelah PR-018, response verify memuat pasangan token.
* **PR-103** — alert bila rantai OTP gagal total (metrik "semua pengirim gagal" sudah terbaca dari log `error` service).
* **PR-105** — rate limit per-IP untuk `/auth/otp/*`, melengkapi limiter per-nomor.

**Out of Scope (dicatat):** Manual Verification staging (butuh kredensial nyata); batas biaya/kuota global provider (operasional + PR-103); notifikasi non-OTP via provider yang sama (modul notifications).

---
## Tambahan PR-016 — Dua Kegagalan Test yang Lolos dari CI

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-016---auth-otp-whatsapp-fonnte--fallback-twilio)
> **Tanggal:** 2026-08-03
> **Status:** Selesai
> **Pemicu:** owner menjalankan `pnpm test` di mesin lokal dan menemukan 2 kegagalan yang TIDAK muncul di CI maupun di run agent.

### Ringkasan

Dua kegagalan berbeda, keduanya berakar pada PR-016a, keduanya tidak mungkin muncul di CI:

1. **`crypto-boot.test.ts` — boot tanpa `FIELD_KEY_V*` malah berhasil.** Ini **regresi keamanan nyata**, bukan test yang cerewet.
2. **`db-seed.test.ts` — seed 2× menghasilkan `users` 7 lalu 5.** Seed tidak bersalah; hitungannya yang terkontaminasi test lain.

### 1. Gerbang fail-fast dilangkahi oleh dotenv milik Prisma

**Gejala:** dengan `apps/api/.env` ada di mesin, boot dengan env bersih (tanpa `FIELD_KEY_V1`) tetap mencapai "API siap menerima koneksi".

**Akar masalah:** `import "@prisma/client"` **memuat `apps/api/.env` ke `process.env` sebagai efek samping saat modul di-import**. Dibuktikan langsung:

```
FIELD_KEY_V1 ada SEBELUM import prisma: false
FIELD_KEY_V1 ada SESUDAH import prisma: true
```

PR-016a menambahkan `createPrismaClient()` di `core/db` dan `Prisma` di `auth/repositories/user.repository.ts`. Keduanya masuk graf import statis `index.ts`. Karena ESM mengevaluasi seluruh import SEBELUM statement pertama, urutannya menjadi: `.env` ditambal ke `process.env` → baru `loadEnv()`/`parseFieldKeys()` berjalan. Gerbangnya tidak rusak; ia hanya dijalankan setelah lubangnya ditutup diam-diam.

**Mengapa lolos CI dan run agent:** runner CI dan working tree agent tidak punya `apps/api/.env` — tidak ada yang bisa menambal, jadi test hijau. File `.env` lokal owner-lah yang membuka regresinya. Dampak nyatanya melampaui test: environment mana pun yang tidak sengaja membawa `.env` basi akan boot dengan konfigurasi yang bukan dari env var (melanggar ADR-015/12-factor), dan kunci enkripsi yang seharusnya wajib jadi opsional.

**Perbaikan:** `index.ts` dipangkas menjadi HANYA gerbang (`loadEnv` → `parseFieldKeys` → `loadQueueConfigs`); seluruh perakitan pindah ke `src/boot.ts` yang di-import **secara dinamis** setelah gerbang lolos. Tidak ada lagi modul penyentuh Prisma di graf statis entry point. Larangannya ditulis sebagai komentar di kepala kedua file.

**Penjagaan regresi:** test baru di `crypto-boot.test.ts` — membuat `apps/api/.env` berisi `FIELD_KEY_V1`, lalu memastikan boot dengan env bersih tetap exit ≠ 0. Test menolak berjalan (skip anggun) bila `.env` developer sudah ada, sehingga tidak pernah menimpa file siapa pun; **di CI yang tidak punya `.env`, test inilah yang menjaga urutan boot**.

### 2. `db-seed` terkontaminasi test paralel

**Gejala:** `users` 7 pada hitungan pertama, 5 pada hitungan kedua.

**Akar masalah:** seed **sudah** idempotent — seluruh operasinya `upsert` dengan ID fixture stabil (users, companies, 20 jobs, skills, resumes, applications). Yang tidak stabil adalah pengukurannya: `hitung()` memakai `prisma.user.count()` **global**, sementara Vitest menjalankan file test secara paralel. `auth-user-db.test.ts` (baru di PR-016a) membuat hingga 5 user dan menghapusnya di `afterAll`. Bila `afterAll` itu jatuh di antara dua hitungan db-seed, selisihnya persis seperti yang terlihat: 7 → 5.

**Perbaikan:** `apps/api/vitest.config.ts` baru dengan `fileParallelism: false`.

**Alternatif yang ditolak:** menyempitkan `hitung()` ke ID fixture. Itu menghilangkan gejala sekaligus **melemahkan** testnya — baris duplikat ber-ID acak (persis yang dicari AC "tanpa duplikat") justru tidak akan terhitung. Keadaan global tetap diuji apa adanya; yang dibuang paralelismenya.

**Biaya:** durasi suite apps/api naik ~8 detik → ~20 detik. Dibayar sekali dan menutup seluruh kelas flaky ini untuk modul berikutnya (PR-017+ akan menambah lebih banyak test DB bersama).

### Risiko yang ditemukan

* **CI tidak mewakili mesin developer dalam hal `.env`.** Kelas bug "hanya muncul bila ada `.env`" masih bisa terulang untuk variabel lain (mis. `DATABASE_URL` basi menutupi env var yang hilang). Penjagaan yang ditambahkan hanya mengunci kasus `FIELD_KEY_V1`.
* **Efek samping dotenv Prisma tidak bisa dimatikan** di Prisma 5 — mitigasinya struktural (jauhkan Prisma dari graf import entry point), jadi ia bergantung pada disiplin import. Komentar peringatan sudah dipasang, tetapi tidak ada lint rule yang menegakkannya.
* **Ergonomi dev berubah kembali seperti sebelum PR-016a:** menjalankan API hanya berbekal `apps/api/.env` (tanpa env var di shell) kini gagal lagi di gerbang. Selama ~1 jam antara merge PR-016a dan perbaikan ini, itu tanpa sengaja "berfungsi". Bila memuat `.env` untuk proses API memang diinginkan (`.env.example` menyiratkan demikian), lakukan **secara eksplisit** lewat script dev (`--env-file`), bukan sebagai efek samping import Prisma — keputusan owner, belum dikerjakan.

### Next steps

* **Owner:** putuskan apakah proses API dev boleh memuat `apps/api/.env` secara eksplisit lewat script `dev` (`--env-file`). Bila ya, `.env.example` dan CLAUDE.md §5.6 perlu disamakan bunyinya.
* **PR-105 / PR-097:** pertimbangkan lint rule atau test arsitektur yang melarang import `@prisma/client` di graf statis `index.ts`, agar penjagaannya tidak bergantung komentar.
* Perhatikan `apps/api/.env.example` di working tree owner: ada perubahan indentasi yang belum di-commit dan bukan bagian PR ini.
