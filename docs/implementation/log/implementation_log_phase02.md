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

* ~~**Owner:** putuskan apakah proses API dev boleh memuat `apps/api/.env` secara eksplisit lewat script `dev` (`--env-file`).~~ **Diputuskan owner 2026-08-03: ya.** Dikerjakan di [Tambahan PR-016 — Pemuatan .env dev yang eksplisit](#tambahan-pr-016--pemuatan-env-dev-yang-eksplisit-env-file).
* **PR-105 / PR-097:** pertimbangkan lint rule atau test arsitektur yang melarang import `@prisma/client` di graf statis `index.ts`, agar penjagaannya tidak bergantung komentar.
* Perhatikan `apps/api/.env.example` di working tree owner: ada perubahan indentasi yang belum di-commit dan bukan bagian PR ini.

---
## Tambahan PR-016 — Pemuatan .env Dev yang Eksplisit (--env-file)

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-016---auth-otp-whatsapp-fonnte--fallback-twilio)
> **Tanggal:** 2026-08-03
> **Status:** Selesai
> **Pemicu:** keputusan owner — dev tetap boleh membaca `apps/api/.env`, asalkan lewat mekanisme yang jelas dan fail-fast `FIELD_KEY_V*` tetap terjadi.

### Ringkasan

Pemuatan `.env` dipindahkan dari **efek samping import Prisma** menjadi **properti perintah peluncur**:

```
dev   → tsx watch --env-file-if-exists=.env src/index.ts
start → tsx src/index.ts            (produksi/kontainer: tanpa .env)
```

Dengan begitu ketiga sifat yang diminta terpenuhi sekaligus: dev nyaman (cukup `apps/api/.env`), gerbang fail-fast tetap berjalan atas hasil gabungan env, dan produksi tidak pernah diam-diam membaca file.

### Scope selesai

* `apps/api/package.json` — script `dev` memakai `--env-file-if-exists=.env`; `start` sengaja dibiarkan bersih.
* Komentar kepala `src/index.ts` diperbarui: menjelaskan bahwa membaca `.env` bukan dilarang — yang dilarang adalah membacanya diam-diam.
* Dokumentasi disamakan bunyinya: `apps/api/.env.example` (siapa yang memuat, aturan presedensi), `CLAUDE.md` §5.6, `README.md` §Secrets & Environment. Kalimat lama "proses API membaca .env" memang tidak pernah benar sebelum ini.
* 4 test boot baru di `crypto-boot.test.ts` (jalur dev).

### Keputusan teknis

1. **`--env-file-if-exists`, bukan `--env-file`.** Varian tanpa `-if-exists` membuat proses mati bila file tidak ada — itu akan memaksa setiap developer (dan kontainer dev, yang `.env`-nya memang tidak pernah ikut karena `.dockerignore`) menyediakan file kosong. Didukung Node 20.18+/22; runner CI memakai Node 20 terbaru.
2. **Hanya script `dev`.** `start` dipakai kontainer/produksi, tempat env var datang dari compose/CI (ADR-015). Memuat `.env` di sana akan mengulang persis masalah yang baru diperbaiki, hanya dengan wajah yang lebih sopan.
3. **Presedensi diverifikasi, bukan diasumsikan:** env var yang sudah ada TIDAK ditimpa isi file (diuji: `PORT` shell menang atas `PORT` file). Artinya `.env` basi tidak akan pernah membajak konfigurasi deploy — ia hanya mengisi yang kosong.
4. **File uji memakai nama `.env.uji-boot`, bukan `.env`.** Test jalur dev jadi selalu berjalan di mesin mana pun tanpa pernah bersinggungan (apalagi menimpa) `.env` milik developer. Hanya test penjaga "jangan baca `.env` diam-diam" yang tetap butuh nama `.env` asli, dan ia tetap skip-anggun.
5. **`apps/worker` tidak diubah.** Worker tidak punya `.env.example` sendiri dan env-nya datang dari compose; menambahkan flag ke sana hanya akan menunjuk file yang tidak pernah ada. Bila nanti worker perlu env lokal, cerminkan pola yang sama.

### Bukti verifikasi

* `pnpm --filter @nawasena/api dev` dijalankan nyata: boot dari `.env` developer → `"msg":"API siap menerima koneksi"`.
* 4 test boot baru, semuanya lulus:
  * env var dari file dipakai (shell hanya berisi `PATH`) → boot berhasil, kunci tidak bocor ke log;
  * file env tanpa `FIELD_KEY_V1` → boot TETAP mati dengan pesan menyebut `FIELD_KEY_V1` (fail-fast tidak dilemahkan);
  * env var shell menang atas isi file;
  * file env tidak ada → tidak error, boot jalan dari env var saja.
* Suite penuh apps/api: 24 file, 231 test lulus (1 skip = penjaga `.env` implisit, karena mesin ini punya `.env`).

### Risiko yang ditemukan

* **Dua jalur konfigurasi berarti dua perilaku.** Bug "hanya muncul di dev" kini mungkin lagi (mis. variabel ada di `.env` tetapi lupa didaftarkan di compose produksi). Mitigasi yang sudah ada: gerbang fail-fast menolak boot produksi yang kekurangan variabel — gagal keras, bukan diam-diam.
* **`--env-file-if-exists` menuntut Node ≥ 20.18.** Developer dengan Node 20 lama akan melihat error flag tidak dikenal. `.nvmrc`/dokumen versi belum diperiksa dalam PR ini; kalau ada mesin tim yang tertinggal, naikkan pin versinya.
* **`.env` tetap file rahasia di disk** (ADR-015): chmod 600 dan jangan disalin antar-environment. Sekarang lebih mudah dipakai, jadi lebih mudah pula tersebar tanpa sadar.

### Next steps

* Pertimbangkan `.nvmrc`/`engines` untuk mengunci Node ≥ 20.18 agar flag ini selalu tersedia.
* Bila `apps/worker` kelak butuh env lokal, tambahkan `apps/worker/.env.example` + flag yang sama pada script `dev`-nya.

---
## PR-017a — Verifikasi id_token Google (JWKS) + Linking Akun

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-017---auth-google-oauth-pkce)
> **Tanggal:** 2026-08-04
> **Status:** Selesai
> **Branch:** `pr-017a-google-id-token-jwks` → `phase-02-authentication-account`

### Ringkasan

Separuh pertama PR-017: **gerbang kepercayaan** login Google. Setelah lapisan ini
mengembalikan identitas, sisa sistem memperlakukannya sebagai fakta — jadi seluruh
pemeriksaan (tanda tangan lewat JWKS, issuer, audience, kedaluwarsa, algoritma,
status verifikasi email) dilakukan eksplisit di satu tempat dan diuji terhadap
token yang benar-benar ditandatangani. Endpoint `POST /api/v1/auth/google` beserta
penukaran authorization code + PKCE menyusul di PR-017b.

### Scope yang selesai

* `packages/schemas/src/auth.ts` — `googleAuthSchema` (code + `codeVerifier` RFC 7636 + `redirectUri`), `googleAuthResponseSchema`. Bentuk response sengaja sama dengan `verifyOtpResponse` supaya PR-018 menambah pasangan JWT ke keduanya sekaligus.
* `packages/schemas/src/audit.ts` — aksi `AUTH_LOGIN_SUCCEEDED` (`{method, isNewUser}`) + tiga `reason` gagal khas Google.
* `apps/api/src/core/config/env.ts` — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (opsional sebagai pasangan), `GOOGLE_JWKS_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_HTTP_TIMEOUT_MS`. Aturan "kredensial harus lengkap" milik Twilio digeneralisasi jadi `GRUP_KREDENSIAL`.
* `apps/api/src/core/http/errors.ts` — `GOOGLE_EXCHANGE_GAGAL` (401), `TOKEN_GOOGLE_TIDAK_VALID` (401), `EMAIL_GOOGLE_BELUM_TERVERIFIKASI` (403).
* `apps/api/src/modules/auth/services/google-id-token.ts` — `parseGoogleIdentity` (validator klaim, fungsi murni) + `createGoogleIdTokenVerifier` (JWKS ber-cache).
* `apps/api/src/modules/auth/repositories/user.repository.ts` — `findActiveByGoogleId`, `findOrCreateByGoogle`.
* `apps/api/.env.example` — blok Google lengkap dengan alasan tiap variabel.
* Test: 21 unit/contract (`auth-google-id-token.test.ts`), 7 PostgreSQL nyata (`auth-google-db.test.ts`), 6 env (`env.test.ts`).

### Scope yang TIDAK selesai (dan kenapa)

* **Endpoint `POST /api/v1/auth/google`, penukaran code + PKCE, OpenAPI** — PR-017b. Pemecahan disetujui owner 2026-08-04 karena scope utuh ~1150 LOC, jauh di atas target <500.
* **Audit sukses untuk login OTP.** Aksi `AUTH_LOGIN_SUCCEEDED` lahir di sini tetapi belum dipasang di `otp.service.ts`: itu perubahan perilaku PR-016, bukan PR-017. Dicatat sebagai follow-up.
* **Manual Verification staging** — butuh OAuth client Google nyata; prosedur ditulis di checklist file phase.

### Keputusan teknis

1. **`jose`, bukan `google-auth-library` — menyimpang dari catatan Risks di file phase ("library resmi").** Checklist menuntut *Integration Test (mock JWKS)*. `jose` membiarkan URL JWKS disuntik, sehingga test menjalankan jalur verifikasi yang sebenarnya terhadap token RS256 yang ditandatangani sungguhan oleh kunci uji. Dengan library resmi kita akan berakhir men-stub librarynya, dan test "audience salah → 401" hanya akan menguji stub. Konsekuensi yang diterima: `iss`/`aud`/`exp`/`alg` divalidasi eksplisit oleh kode kita, bukan diwarisi dari Google.
2. **`algorithms: ["RS256"]` dikunci.** Tanpa itu, token ber-`alg: none` atau HMAC yang memakai kunci publik Google sebagai rahasia bisa lolos — serangan JWT klasik. Ada test khusus untuk `alg: none`.
3. **Dua bentuk issuer diterima** (`https://accounts.google.com` dan `accounts.google.com`). Google memakai keduanya bergantian; menerima satu saja adalah bug yang muncul sporadis dan sulit dilacak.
4. **JWKS tak terjangkau → 503, bukan 401.** Menjawab 401 saat Google tak terjangkau berbohong kepada pengguna ("data Anda tidak sah") padahal masalahnya di pihak kita. `JWKSTimeout` dan kegagalan non-JOSE (jaringan) dipisahkan dari kegagalan klaim.
5. **`email_verified` menerima boolean DAN string `"true"`/`"false"`.** Beberapa jalur Google secara historis mengirimnya sebagai string. Memperlakukan string apa pun sebagai truthy akan menerima `"false"`; memperlakukan string sebagai "bukan boolean → tolak" akan menolak pengguna sah. Dipetakan eksplisit.
6. **Urutan find-or-create: `google_id` → email → buat baru.** `google_id` menang supaya pengguna yang berganti email di Google tetap mendarat di akun yang sama. Penautan lewat email aman HANYA karena `email_verified !== true` sudah ditolak lebih dulu — tanpa syarat itu, langkah ini adalah jalan masuk account takeover (persis yang diminta Security Considerations file phase).
7. **Nama kosong diisi dari Google, nama yang sudah ada tidak ditimpa.** Akun hasil login OTP lahir dengan `fullName: ""`; mengisinya menghemat pengetikan (relevan untuk pengguna dengan hambatan motorik). Nama yang dipilih sendiri oleh pengguna tidak pernah disentuh.
8. **`reason` audit menyebut metodenya sendiri (`google*`), bukan menambah field `method` wajib.** Field wajib baru akan membuat seluruh audit `AUTH_LOGIN_FAILED` lama (PR-016, tanpa field itu) ditolak sanitizer dan hilang diam-diam. Menambah anggota enum bersifat additive.
9. **Verifier dibuat sekali saat wiring, bukan per-permintaan.** `createRemoteJWKSet` menyimpan kunci di memori dan hanya mengambil ulang saat menemui `kid` baru (rotasi). Ada test yang membuktikan tiga verifikasi hanya memicu satu pengambilan JWKS.

### Bukti verifikasi

* `pnpm lint` — 9/9 workspace hijau (termasuk lint boundaries).
* `pnpm typecheck` — 9/9 workspace hijau.
* `pnpm test` — 9/9 workspace hijau. `@nawasena/api`: **26 file, 266 test lulus, 1 skip** (penjaga `.env` implisit, skip-anggun karena mesin ini punya `.env`). Test DB dijalankan terhadap PostgreSQL nyata (`docker compose -f docker-compose.dev.yml up -d postgres redis-cache redis-queue`), bukan dilewati.
* Snapshot inline `ERROR_CATALOG` diperbarui — gerbang itu memang ada supaya kode error baru tidak masuk tanpa terlihat di review.

### Risiko yang ditemukan

* **Penautan lewat email bergantung sepenuhnya pada `email_verified` Google.** Untuk domain Google Workspace, admin domain dapat membuat mailbox dengan alamat apa pun **di domainnya sendiri** dan alamat itu akan terverifikasi. Artinya admin domain bisa menautkan diri ke akun Nawasena milik karyawannya. Ini konsekuensi bawaan model kepercayaan OIDC dan sesuai instruksi file phase ("email verified saja"), tetapi perlu disadari — bukan lubang implementasi.
* **`email` tidak punya unique index** (skema PR-009). Langkah penautan lewat email tidak punya wasit di tingkat DB. Tidak berbahaya di sini (dua login bersamaan dengan email terverifikasi sama pasti membawa `google_id` yang sama, jadi keduanya menulis nilai identik), tetapi asumsi itu akan runtuh bila kelak ada jalur lain yang menulis `email`.
* **Email tidak disegarkan saat berubah di Google.** Akun tetap benar (`google_id` yang menentukan), tetapi kolom `email` bisa basi. Menyegarkannya berarti satu write per login — sengaja ditunda.
* **Belum ada nonce OAuth.** PKCE sudah menutup penyadapan authorization code; nonce menutup replay id_token pada alur implicit yang tidak kita pakai. Dicatat, bukan dikerjakan.
* **Kegagalan JWKS memberi 503 pada endpoint login** — bila Google tak terjangkau, login Google mati total tanpa fallback. Mitigasi produk sudah ada: hint error mengarahkan pengguna ke login OTP.

### Next steps

* **PR-017b** — penukaran authorization code + PKCE, service/controller/router/wiring, OpenAPI, test HTTP end-to-end; lalu centang seluruh AC PR-017.
* **PR-018** — pasangan JWT untuk kedua metode login; response `googleAuthResponse` bertambah field token (additive).
* **Follow-up PR-016:** pasang `AUTH_LOGIN_SUCCEEDED` pada `otp.service.ts` supaya kedua metode login punya jejak sukses yang setara.
* **Owner:** siapkan OAuth 2.0 Client ID di Google Cloud Console + isi env staging untuk Manual Verification.

---
## PR-017b — Endpoint POST /api/v1/auth/google (Exchange + PKCE)

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-017---auth-google-oauth-pkce)
> **Tanggal:** 2026-08-04
> **Status:** Selesai — **PR-017 utuh selesai** (kecuali Manual Verification staging)
> **Branch:** `pr-017b-google-exchange-endpoint` → `phase-02-authentication-account`

### Ringkasan

Separuh kedua PR-017: endpoint yang menyambungkan gerbang kepercayaan dari
PR-017a ke dunia luar. Tiga langkah yang urutannya adalah keamanannya —
tukar authorization code + PKCE → verifikasi id_token lewat JWKS →
find-or-create/link akun — plus audit sukses dan gagal.

### Scope yang selesai

* `apps/api/src/modules/auth/services/google-token.ts` — penukaran authorization code + `code_verifier` di token endpoint Google. Mengembalikan **hanya `id_token`**.
* `apps/api/src/modules/auth/services/google.service.ts` — orkestrasi tiga langkah + pemetaan kegagalan ke `reason` audit.
* `apps/api/src/modules/auth/controllers/google.controller.ts` — controller tipis, pola sama dengan OTP.
* `apps/api/src/modules/auth/routers/index.ts` — **dirombak**: OTP dan Google kini fitur yang berdiri sendiri, masing-masing bisa mati sendiri.
* `apps/api/src/modules/auth/index.ts` — wiring dua fitur, `createGoogleConfigFromEnv`.
* `apps/api/src/boot.ts` — merakit konfigurasi Google dari env.
* `packages/schemas/src/openapi.ts` + `openapi.json` — path `/auth/google` (operationId `loginWithGoogle`).
* Test: 18 HTTP (`auth-google-http.test.ts`), 10 unit (`auth-google-exchange.test.ts`).

### Scope yang TIDAK selesai (dan kenapa)

* **Manual Verification staging** — butuh OAuth 2.0 Client ID nyata + staging. Prosedur ada di checklist file phase.
* **E2E** — PR-030 (UI login), sesuai rencana phase.
* **Pemasangan `AUTH_LOGIN_SUCCEEDED` pada alur OTP** — perubahan perilaku PR-016; tetap follow-up.

### Keputusan teknis

1. **Router dirombak: OTP dan Google jadi fitur yang berdiri sendiri.** Sebelumnya `createAuthModule` mengembalikan satu router tertutup bila `OTP_HASH_SECRET` kosong — artinya kredensial OTP yang hilang akan ikut mematikan login Google. Sekarang tiap fitur punya gerbang sendiri: yang kredensialnya kosong menjawab **503, bukan 404**. Bedanya penting bagi klien — 404 membuatnya mengira endpoint-nya salah; 503 memberitahu fiturnya sedang tidak tersedia, dan hint-nya menunjuk metode masuk yang lain.
2. **Penukaran mengembalikan `string` (id_token), bukan objek balasan Google.** Ini bukan gaya, melainkan cara menegakkan AC "tidak ada token Google tersimpan permanen" **secara struktural**: `access_token`/`refresh_token` tidak punya jalan keluar dari fungsi itu, jadi tidak ada tempat lain yang bisa keliru menyimpannya. Test sengaja menyertakan keduanya di balasan tiruan lalu membuktikan mereka tidak muncul di response, baris `users`, maupun log.
3. **Verifier PKCE salah dan code kedaluwarsa dijawab sama (`GOOGLE_EXCHANGE_GAGAL`).** Google sendiri menjawab `invalid_grant` untuk keduanya, dan membedakannya untuk pengguna hanya berguna bagi penebak.
4. **`code_verifier` divalidasi bentuknya di zod sebelum menyentuh jaringan** (RFC 7636: 43–128 karakter unreserved). Google akan menolaknya juga, tetapi lebih lambat dan dengan satu panggilan jaringan sia-sia. Diuji: input cacat ditolak 400 **tanpa Google pernah dihubungi**.
5. **Gangguan infrastruktur (503) TIDAK diaudit sebagai percobaan login gagal.** `ALASAN_AUDIT` hanya memetakan tiga kode penolakan nyata. Google tak terjangkau bukan percobaan masuk yang ditolak; mencatatnya sebagai kegagalan login akan mengotori sinyal keamanan justru saat sedang ada insiden. Ia tetap terekam sebagai log error biasa.
6. **Log penolakan memuat kode error OAuth (`invalid_grant`) tetapi TIDAK `error_description`.** Kode error menggambarkan jenis kegagalan dan berguna untuk operasi; `error_description` kadang memuat potongan parameter permintaan. Ada test yang menaruh `code_verifier` di dalam `error_description` lalu membuktikan ia tidak sampai ke log.
7. **`CONTRACT_VERSION` tidak dinaikkan.** Ia bernilai `0.1.0` sejak PR-004 dan tidak dinaikkan pula saat PR-016 menambah dua endpoint OTP. Penambahan path bersifat additive; menaikkannya di sini akan menyimpang dari praktik yang sudah berjalan tanpa diminta. Dicatat sebagai pertanyaan untuk owner.

### Bukti verifikasi

* `pnpm lint` — 9/9 workspace hijau (termasuk lint boundaries).
* `pnpm typecheck` — 9/9 workspace hijau.
* `pnpm test` — 9/9 workspace hijau. `@nawasena/api`: **28 file, 294 test lulus, 1 skip** (penjaga `.env` implisit, skip-anggun).
* `pnpm --filter @nawasena/schemas check:openapi` — `openapi.json` sinkron dengan skema zod.
* Test DB dijalankan terhadap PostgreSQL nyata, bukan dilewati.

### Risiko yang ditemukan

* **Belum ada rate limit pada `/auth/google`.** Endpoint ini memanggil Google pada setiap permintaan, jadi banjir permintaan menjadi banjir panggilan keluar. Limiter global `express-rate-limit` (PR-007) masih memakai penyimpanan memori; limiter per-IP ber-Redis dijadwalkan di **PR-105** — endpoint ini perlu ikut disebut di sana.
* **`AUTH_LOGIN_SUCCEEDED` baru dipasang pada jalur Google.** Sampai follow-up PR-016 dikerjakan, statistik login sukses hanya mencerminkan separuh pengguna — berbahaya bila ada yang membaca angkanya sebagai total.
* **Balapan penautan email tidak punya wasit DB** (lanjutan risiko PR-017a): `users.email` tanpa unique index. Aman selama hanya jalur ini yang menulis `email`.
* **Fake Prisma di test HTTP menyederhanakan semantik `findFirst`.** Ia cukup untuk membuktikan alur endpoint, tetapi semantik unique index parsial dan balapan tetap hanya terbukti di `auth-google-db.test.ts` (PostgreSQL nyata). Keduanya sengaja dipisah; jangan perlakukan test HTTP sebagai pengganti test DB.
* **Rotasi `client_secret` menuntut restart.** Konfigurasi Google dirakit sekali saat boot (ADR-015, 12-factor). Ini pilihan sadar, bukan kelalaian — tetapi perlu masuk runbook rotasi kunci.

### Next steps

* **PR-018** — pasangan JWT untuk kedua metode login; `googleAuthResponse` bertambah field token (additive), dan `verifyOtpResponse` ikut.
* **Follow-up PR-016** — pasang `AUTH_LOGIN_SUCCEEDED` pada `otp.service.ts`.
* **PR-105** — sertakan `/auth/google` dalam rate limit per-IP ber-Redis.
* **Owner:** (1) buat OAuth 2.0 Client ID di Google Cloud Console + isi env staging, lalu jalankan Manual Verification dan centang butir terakhir PR-017; (2) putuskan apakah `CONTRACT_VERSION` perlu dinaikkan saat path baru ditambahkan.

---
## PR-018a — Token Service RS256, Rotasi & Reuse Detection

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-018---jwt-rs256--rotating-refresh--reuse-detection)
> **Tanggal:** 2026-08-04
> **Status:** Selesai — separuh pertama PR-018 (AC 1–3 dari 5)
> **Branch:** `pr-018a-token-rotasi-reuse` → `phase-02-authentication-account`

### Ringkasan

Separuh pertama PR-018: seluruh mesin sesi, tanpa kulit HTTP-nya. Token
ditandatangani dan diverifikasi, refresh dirotasi, reuse terdeteksi dan
membakar seluruh keluarga token, dan `ver` bisa menghanguskan semua access
token yang beredar. Belum ada endpoint yang memanggilnya — itu PR-018b.

Pembagiannya sengaja di kulit HTTP, bukan per fitur: bagian Risks file phase
meminta "review keamanan khusus", dan review itu hanya bermakna kalau rotasi,
reuse detection, dan `ver` bisa dibaca sebagai satu kesatuan dalam satu diff.

### Scope yang selesai

* `apps/api/prisma/migrations/20260804090000_04_token_version_users/` — kolom `users.token_version` (aditif, `NOT NULL DEFAULT 0`).
* `apps/api/src/core/auth/keys.ts` — pemuatan pasangan kunci RS256 dari base64 PEM + validasi bentuk/panjang/kecocokan pasangan; `SessionKeyError`.
* `apps/api/src/core/auth/tokens.ts` — tanda tangan & verifikasi access (RS256, klaim `sub/role/ver`, 15 menit), penerbitan & hashing refresh (32 byte acak, SHA-256, 30 hari).
* `apps/api/src/modules/auth/repositories/refresh-token.repository.ts` — insert, findByHash, `rotate` transaksional, `revokeFamily`, `revokeAllForUser`.
* `apps/api/src/modules/auth/repositories/user.repository.ts` — `findActiveSessionUser`, `bumpTokenVersion` (increment di DB).
* `apps/api/src/modules/auth/services/session.service.ts` — `issue`, `refresh` (rotasi + reuse detection), `revokeAllSessions`.
* `apps/api/src/core/config/env.ts` + `index.ts` + `.env.example` — grup `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` dan gerbang fail-fast di entry point.
* `packages/schemas` — `userRoleSchema`, aksi audit `AUTH_REFRESH_REUSED` + skema meta-nya.
* `apps/api/src/core/http/errors.ts` — kode `SESI_TIDAK_VALID`.
* Test: 12 kunci sesi, 19 token, 17 service sesi (fake), 12 integrasi PostgreSQL nyata, 5 gerbang boot, 3 env. **68 test baru.**

### Scope yang TIDAK selesai (dan kenapa)

* **Endpoint `POST /api/v1/auth/refresh`, cookie web, integrasi OTP/Google, OpenAPI, hook api-client** — PR-018b, sesuai pemecahan yang disetujui owner. AC 4 (flag cookie) dan AC 5 (401→refresh→retry) belum bisa dicentang.
* **E2E** — PR-030 (UI login), sesuai rencana phase.
* **Manual Verification (inspeksi cookie di browser)** — baru mungkin setelah PR-018b.

### Keputusan teknis

1. **Migrasi menyimpang dari "Database Changes: Tidak ada" di file phase.** Kolom `ver` yang diminta Objective tidak ada di `users` — terlewat di PR-009, padahal SDD §8.1 eksplisit menempatkannya di sana. Alternatif tanpa migrasi (menyimpan `ver` di Redis) ditolak: `ver` adalah kill-switch sesi yang justru dipakai saat insiden, dan menaruhnya di cache berarti kehilangannya saat evict/restart. Disetujui owner sebelum implementasi.
2. **Kunci disimpan base64 dari PEM, bukan PEM apa adanya.** PEM multi-baris tidak selamat melewati `.env`/compose tanpa lolos-kutip yang rapuh. Konsekuensinya ada round-trip guard: base64 yang terpotong tetap "berhasil" di-decode Node menjadi sampah, jadi hasilnya dibandingkan balik.
3. **Pasangan kunci yang tidak cocok = boot GAGAL.** Tanpa pemeriksaan ini, setiap access token akan terbit lalu ditolak verifikasinya sendiri — kegagalan yang baru terlihat saat pengguna pertama mencoba masuk, dan terbaca seperti bug login alih-alih salah konfigurasi. Diuji dengan menjalankan entry point nyata di child process.
4. **Kunci sesi kosong ≠ boot gagal.** Mengikuti pola OTP/Google: nol variabel = fitur mati (503 di PR-018b), setengah terisi = boot gagal. `.env` lama tetap valid, dan dev tanpa kunci tetap bisa menjalankan API.
5. **Gerbang kunci sesi hidup di `index.ts`, bukan `boot.ts`.** Ini pelajaran PR-013/PR-016 yang diterapkan sejak awal: `core/auth` sengaja tidak menyentuh Prisma sama sekali supaya boleh di-import statis sebelum gerbang. `boot.ts` menerimanya lalu `void sessionKeys` — persis pola `void fieldKeys` yang sudah ada. Validasi sekarang, pemakaian di PR-018b.
6. **`verifyAccessToken` mengembalikan `null` untuk SEMUA penolakan.** Tanda tangan salah, kedaluwarsa, issuer/audience keliru, `alg` bukan RS256, klaim cacat, `ver` usang — satu jawaban. Membedakannya kepada klien hanya berguna bagi penebak. `algorithms: ["RS256"]` dikunci eksplisit; ada test untuk `alg: none`.
7. **Refresh token BUKAN JWT.** 32 byte acak yang opaque. Klien tidak perlu membaca isinya, dan JWT hanya akan menambah permukaan serangan (klaim yang bisa disalahtafsirkan) tanpa manfaat — sifat yang kita butuhkan justru "tidak bermakna tanpa baris DB-nya".
8. **Hash refresh memakai SHA-256 polos, tanpa pepper/bcrypt.** Nilainya 256 bit dari CSPRNG, bukan kata sandi pilihan manusia; tidak ada ruang tebakan yang bisa dipersempit brute force, jadi biaya kerja tambahan hanya memperlambat verifikasi tanpa menambah keamanan. (Berbeda dari OTP 6 angka di PR-016, yang justru butuh pepper karena ruangnya kecil.)
9. **Reuse diperiksa SEBELUM kedaluwarsa.** Token curian yang sudah lewat 30 hari tetap bukti bahwa keluarganya bocor, dan tetap harus memicu pencabutan.
10. **Setiap login memulai keluarga baru.** Kalau semua perangkat berbagi satu keluarga, reuse di satu perangkat akan menjatuhkan seluruh perangkat lain — hukuman yang tidak proporsional untuk sinyal yang kadang berasal dari jaringan yang buruk. Ada test yang membuktikan sesi "laptop" selamat saat "hp" mengalami reuse.
11. **`revokeAllSessions` melakukan DUA hal.** `ver` bump saja tidak cukup: refresh token yang tersisa akan segera menukar dirinya dengan access token ber-`ver` baru, sehingga bump-nya tidak ada artinya. Karena itu refresh-nya ikut dicabut.
12. **`rotate` menaruh `revokedAt: null` di klausa WHERE, bukan hanya memeriksanya lebih dulu.** Dua permintaan dengan refresh yang sama dan tiba bersamaan akan sama-sama lolos pemeriksaan di service; yang menentukan pemenangnya adalah `updateMany` itu. Yang kalah mendapat count 0 → ditolak, bukan sepasang token kembar yang sah. Dibuktikan test balapan terhadap PostgreSQL nyata.
13. **Yang kalah balapan TIDAK menerima access token.** Access sudah terlanjur ditandatangani sebelum rotate; menyerahkannya akan membuat klien memegang access token tanpa refresh yang mendampinginya.
14. **`AUTH_REFRESH_REUSED` jadi aksi audit tersendiri**, bukan `AUTH_LOGIN_FAILED`. Ini bukan percobaan masuk yang salah kode, melainkan sinyal keamanan yang layak dialarmkan terpisah. Meta-nya hanya `revokedCount` — tanpa PII, tanpa potongan token. *(Diamandemen 2026-08-04: alarm ini kini dibatasi **paling banyak sekali per keluarga token**, sementara penolakannya tetap terjadi setiap kali — lihat "Amandemen perilaku audit reuse" di bawah.)*
15. **`bumpTokenVersion` memakai `increment` di DB**, bukan baca-lalu-tulis di aplikasi. Ada test dua bump bersamaan: baca-lalu-tulis akan berhenti di 1, increment DB sampai 2.

### Bukti verifikasi

* `pnpm lint` — 9/9 workspace hijau (termasuk lint boundaries).
* `pnpm typecheck` — 9/9 workspace hijau.
* `pnpm test` — 9/9 workspace hijau. `@nawasena/api`: **32 file, 360 test lulus, 1 skip** (penjaga `.env` implisit, skip-anggun karena `.env` lokal ada).
* `pnpm --filter @nawasena/schemas check:openapi` — `openapi.json` sinkron.
* Migrasi 04 di-apply ke PostgreSQL lokal; seluruh test DB berjalan nyata, bukan dilewati.
* Snapshot inline `ERROR_CATALOG` dan tabel `META_AMAN` diperbarui — kedua gerbang itu memang ada supaya kode error dan aksi audit baru tidak masuk tanpa terlihat di review.

### Risiko yang ditemukan

* **Belum ada job pembersih `refresh_tokens`.** Baris yang dicabut/kedaluwarsa tidak pernah dihapus, jadi tabel ini tumbuh selamanya (30 hari × frekuensi refresh × pengguna). Belum berbahaya di skala MVP, tetapi perlu job retensi — dan retensi yang terlalu agresif akan **membutakan reuse detection**: baris yang sudah dihapus membuat token curian terbaca sebagai "tidak dikenal", bukan sebagai reuse yang memicu pencabutan keluarga. Job itu harus menyimpan baris tercabut lebih lama daripada baris kedaluwarsa.
* **Reuse detection menghukum korban dan penyerang sekaligus.** Kalau penyerang menukar refresh curian lebih dulu, korbanlah yang memicu reuse — dan keduanya kehilangan sesi. Ini perilaku yang benar (fail-safe), tetapi berarti pengguna sah bisa terlempar keluar tanpa penjelasan. Hint error sudah mengarahkan untuk masuk lagi.
* **`/auth/refresh` akan mewarisi celah rate limit yang sama dengan `/auth/google`** (limiter global masih memory-store). Endpoint ini akan jadi sasaran menarik untuk menebak refresh token secara buta — walau ruang tebakannya 256 bit. Perlu ikut disebut di **PR-105**.
* **Rotasi kunci RS256 menuntut restart** dan menghanguskan seluruh access token yang beredar (refresh selamat, karena bukan JWT). Perlu masuk runbook rotasi kunci bersama `client_secret` Google.
* **`ver` belum ditegakkan di jalur permintaan mana pun.** Fungsinya ada dan teruji, tetapi pemeriksaan `expectedVersion` baru bermakna setelah middleware RBAC (**PR-019**) memanggilnya. Sampai saat itu, `ver` bump hanya efektif lewat pencabutan refresh. Ini juga membawa pertanyaan biaya untuk PR-019: memeriksa `ver` pada setiap permintaan berarti satu baca DB per permintaan.

### Next steps

* **PR-018b** — endpoint `POST /api/v1/auth/refresh` + cookie HttpOnly/Secure/SameSite=Strict, integrasi OTP/Google → pasangan JWT (additive pada kedua envelope), OpenAPI, hook refresh api-client; lalu centang AC 4 dan 5.
* **PR-019** — pakai `verifyAccessToken(token, { version })` di middleware, dan putuskan strategi pembacaan `token_version` per permintaan.
* **PR-105** — sertakan `/auth/refresh` dalam rate limit per-IP ber-Redis.
* **Follow-up PR-016** — pasang `AUTH_LOGIN_SUCCEEDED` pada `otp.service.ts` (masih terbuka sejak PR-017).
* **Owner:** (1) generate pasangan kunci RS256 untuk staging/produksi dan simpan di GitHub Secrets (perintah `openssl` ada di `.env.example`); (2) putuskan penjadwalan job retensi `refresh_tokens`.

### Tindak lanjut risiko retensi — diputuskan 2026-08-04

Risiko "job pembersih `refresh_tokens` bisa membutakan reuse detection" ditutup dengan kebijakan konkret, bukan sekadar catatan. Keputusan owner:

* **Retensi agresif ditolak eksplisit** — reuse detection lebih penting daripada penghematan storage.
* Kebijakan berjenjang menurut sebab pencabutan (90 / 180 / 730 hari) ditulis ke **[SDD §6.4](../../../SDD.md)** — tabel itu semula tidak memuat `refresh_tokens` sama sekali — dan ke spesifikasi **PR-024** yang memilikinya, lengkap dengan indeks BRIN, DELETE berbatch, metrik, dan **AC test penjaga**: baris tercabut yang lebih tua dari ambang *expired* tetapi lebih muda dari ambang *revoked* harus selamat.
* Angka 180 hari dicatat sebagai **jendela deteksi reuse**, bukan setelan kebersihan — supaya siapa pun yang kelak "mengoptimalkan" angkanya tahu apa yang sedang ia perpendek.

Sekaligus ditemukan **celah yang lebih besar**: matriks traceability menugaskan FR-1.3 "logout semua perangkat" kepada PR-018, tetapi `API Changes` PR-018 tidak pernah mendefinisikan endpoint logout apa pun — dan tidak ada PR lain yang akan mengambilnya. `revokeAllSessions` dari PR-018a karenanya belum bisa dijangkau siapa pun. Ditambal ke scope **PR-018b**: `POST /auth/logout` + `POST /auth/logout-all`, keduanya diautentikasi refresh token (bukan `requireAuth`, yang baru lahir di PR-019), plus kolom **`revoked_reason`** supaya logout tidak menyalakan alarm reuse palsu. *(Saat implementasi, ketiganya dipindahkan lagi ke PR-018c karena ukuran — lihat entri PR-018b.)*

### Amandemen perilaku audit reuse — diputuskan 2026-08-04

> Mengubah perilaku yang dikirim PR-018a. Dibaca bersama keputusan 14 di atas.
> Pemicunya `markReuse` (keputusan 6 di entri **PR-018c**); yang berikut ini
> adalah kontraknya, bukan efek sampingnya.

**Kontrak:**

| Aspek | Perilaku | Batas |
|---|---|---|
| **Penolakan** | `SESI_TIDAK_VALID` | **SETIAP kali**, tanpa kecuali |
| **Baris audit `AUTH_REFRESH_REUSED`** | ditulis sekali | **PALING BANYAK SEKALI per keluarga token** |

Kedua baris tabel itu sengaja punya batas yang berbeda. Yang diredam adalah
**kebisingan catatan**, bukan penegakannya — percobaan reuse ke-2, ke-7, dan
ke-500 sama-sama ditolak seperti yang pertama.

**Mengapa audit dibatasi.** Alarm pertama sudah mencabut seluruh keluarga. Alarm
berikutnya tidak melaporkan fakta baru dan tidak membuka tindakan baru yang bisa
diambil responder — sementara penyerang yang menggedor token mati bisa menulis
baris audit tanpa batas. Dua hal membuat itu nyata, bukan teoretis: `/auth/refresh`
**belum ber-rate-limit** (risiko terbuka di atas, dijadwalkan **PR-105**), dan
baris reuse **disimpan 2 tahun** oleh kebijakan retensi yang baru saja diputuskan
di bagian sebelumnya. Tanpa batas ini, satu insiden bisa menenggelamkan audit
trail yang justru dibutuhkan untuk menyelidikinya.

**Mengapa penolakan TIDAK dibatasi.** Batas audit adalah soal pencatatan. Kalau
ia sampai merembes ke penegakan, percobaan reuse kedua akan lolos — yaitu
kebalikan persis dari tujuan fitur ini. Pemisahan itu dikunci test, bukan
sekadar dicatat.

**Mekanisme.** `markReuse` menandai baris pemicu sebagai `reuse`; cabang alarm
hanya dimasuki baris yang tercabut karena `rotated` (atau NULL, lihat keputusan 5
di PR-018c). Percobaan berikutnya karenanya melewati cabang alarm — lalu tetap
jatuh ke penolakan yang sama.

**Batasnya PER KELUARGA, bukan per pengguna.** Insiden di perangkat kedua tetap
menghasilkan alarmnya sendiri; kalau batasnya per pengguna, insiden kedua akan
tertelan oleh yang pertama dan tidak pernah terlihat.

**Penjaga di `apps/api/__tests__/auth-session.test.ts`** (ketiganya harus dibaca
sebagai satu paket):

* *"reuse berulang: ditolak SETIAP kali, diaudit PALING BANYAK sekali per keluarga"* — tiga percobaan berturut-turut, memeriksa **ketiga** `AppError`-nya **dan** tepat satu baris audit. Helper `tangkap()` dipakai alih-alih `.catch(() => undefined)` supaya panggilan yang justru berhasil menggagalkan test, bukan lolos diam-diam.
* *"batas sekali itu PER KELUARGA, bukan per pengguna"* — dua perangkat, dua alarm.
* *"seluruh keluarga mati"* — memastikan penegakan tetap utuh setelah alarm.

**Kalau kelak butuh visibilitas atas percobaan berulang**, tempatnya metrik atau
rate limit di **PR-105** — **bukan** melonggarkan batas audit ini.

---
## PR-018b — Endpoint Refresh, Cookie Web & Integrasi Login

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-018---jwt-rs256--rotating-refresh--reuse-detection)
> **Tanggal:** 2026-08-04
> **Status:** Selesai — **seluruh AC PR-018 terpenuhi** (kecuali Manual Verification browser & E2E PR-030)
> **Branch:** `pr-018b-refresh-endpoint-cookie` → `phase-02-authentication-account`

### Ringkasan

Kulit HTTP untuk mesin sesi PR-018a: endpoint perpanjangan, cookie web
ber-flag lengkap, kedua metode masuk kini berakhir dengan pasangan token, dan
api-client menyegarkan sesi sendiri saat 401.

### Scope yang selesai

* `session-cookie.ts` — cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, pembacaan header manual (tanpa dependensi baru).
* `session.controller.ts` — `POST /auth/refresh` + `serahkan()`, satu-satunya tempat pilihan cookie-vs-body dibuat.
* Router: rute `/auth/refresh` + gerbang 503 saat kunci sesi kosong.
* `otp.service` & `google.service` — menerbitkan sesi setelah akun ditemukan/dibuat.
* Wiring `modules/auth/index.ts` + `boot.ts` (`cookieSecure` dari `NODE_ENV`).
* `packages/schemas` — `sessionClientSchema`, `sessionTokensSchema`, `refreshSession*`; kedua envelope login bertambah token secara **additive**.
* `packages/api-client` — `verifyOtp`, `refreshSession`, dan `createSessionRefresher` (single-flight); `skipAuthRefresh` di `RequestOptions`.
* OpenAPI `/auth/refresh`; `openapi.json` di-regenerate.
* Test: 13 HTTP sesi, 8 api-client, plus penyesuaian test OTP/Google lama. **Total 379 test api + 24 api-client lulus.**

### Scope yang TIDAK selesai (dan kenapa)

* **`POST /auth/logout`, `POST /auth/logout-all`, kolom `revoked_reason`** — dipindah ke **PR-018c**. Saat estimasi rinci dibuat, 018b utuh terukur ~665 LOC produksi; dilaporkan ke owner sebelum menulis kode, sesuai rencana cadangan yang sudah disepakati. Tanpa logout, 018b ≈ 435 LOC. Keduanya bukan bagian AC PR-018 mana pun, tetapi tetap wajib untuk menutup FR-1.3.
* **Manual Verification (inspeksi cookie di browser)** — butuh browser + staging; bentuk header sudah dikunci test snapshot.
* **E2E login→refresh** — PR-030, sesuai rencana phase.

### Keputusan teknis

1. **Klien menyatakan dirinya (`client: "web" | "mobile"`), server tidak menebak dari User-Agent.** Tebakan yang meleset berarti klien web menerima refresh token di body — bisa dibaca JavaScript, membatalkan seluruh guna `HttpOnly`. Default `"web"`, jadi klien lama tidak berubah perilaku.
2. **`/auth/refresh` TIDAK punya field `client`.** Sumber tokennya sudah menjawab: body = mobile, cookie = web. Menambah field di situ hanya membuka peluang klien salah menyebut dirinya.
3. **`Path=/api/v1/auth`, bukan `/`.** Cookie hanya ikut pada endpoint auth, bukan pada setiap permintaan API. Mengurangi paparan tanpa biaya. Konsekuensinya `clearCookie` harus memakai atribut yang sama persis — kalau tidak, cookie yang "dihapus" tetap hidup. Ada test yang menjaga itu.
4. **`Secure` hanya dilepas di `NODE_ENV=development`.** Test berjalan dengan nilai produksi supaya snapshot menguji bentuk yang benar-benar dikirim ke pengguna, bukan bentuk yang dilonggarkan untuk test.
5. **Tanpa token sama sekali → 401 `SESI_TIDAK_VALID`, bukan 400.** Bagi pengguna keduanya berarti "masuk lagi"; membedakannya hanya memberi tahu penyerang bentuk permintaan yang benar.
6. **Refresh ditolak → cookie basi ikut dihapus** (hanya pada jalur web), supaya browser tidak mengirimkannya lagi pada percobaan berikutnya.
7. **Service login tidak menerima `client`.** `otp.service.verify` memakai `Pick<VerifyOtp, "phone" | "code">`, `google.service.login` memakai `Omit<GoogleAuth, "client">`. Di mana token diserahkan adalah urusan transport; membiarkannya masuk service akan mencampur lapisan — dan sebagai bonus, test lama tidak perlu diubah.
8. **Tanpa kunci sesi, kedua metode masuk ikut 503 — bukan hanya `/auth/refresh`.** Login yang tidak bisa menerbitkan sesi bukan login; mengembalikan `userId` telanjang akan membuat klien mengira dirinya sudah masuk. Ini penerapan keputusan deny-by-default yang disetujui di PR-018a.
9. **`createSessionRefresher` men-single-flight panggilan refresh.** Bukan optimasi: refresh token dirotasi tiap pemakaian, jadi tiga permintaan 401 bersamaan yang masing-masing memanggil `/auth/refresh` akan mengirim dua token yang sudah dicabut — **persis bentuk yang dibaca server sebagai reuse**, sehingga klien menghancurkan sesinya sendiri justru di jaringan lambat saat permintaan menumpuk. Ada test tiga permintaan paralel → satu panggilan refresh.
10. **`skipAuthRefresh` ditambahkan ke `RequestOptions`.** Ditemukan oleh test, bukan oleh review: permintaan `/auth/refresh` yang dijawab 401 ikut memicu hook refresh, dan karena hook-nya single-flight ia menunggu panggilan yang sedang berjalan — **dirinya sendiri**. Deadlock (tanpa single-flight: rekursi tak berujung). Test-nya timeout 5 detik dan itulah yang membongkarnya.
11. **`AUTH_LOGIN_SUCCEEDED` dipasang pada jalur OTP** — utang PR-016 yang terbuka sejak PR-017. Sengaja diambil di sini meski di luar scope: baris yang diubah persis tail `verify()` yang sedang direstrukturisasi, dan membiarkannya berarti statistik login sukses tetap hanya mencerminkan separuh pengguna.
12. **Sesi diterbitkan SETELAH kode OTP dihanguskan.** Bila penerbitan gagal, kode yang sudah dipakai tidak boleh hidup lagi untuk dicoba ulang.

### Bukti verifikasi

* `pnpm lint` — 9/9 workspace hijau (termasuk lint boundaries).
* `pnpm typecheck` — 9/9 workspace hijau.
* `pnpm test` — 9/9 workspace hijau. `@nawasena/api`: **379 test lulus, 1 skip**; `@nawasena/api-client`: **24 lulus**.
* `check:openapi` — `openapi.json` sinkron dengan skema zod.

### Risiko yang ditemukan

* **`/auth/refresh` belum ber-rate-limit** (limiter global masih memory-store). Ruang tebakan refresh token 256 bit, jadi ini bukan jalan masuk — tetapi endpoint ini melakukan tulis DB pada setiap panggilan. Perlu ikut disebut di **PR-105** bersama `/auth/google`.
* **Klien selain api-client kita bisa merotasi paralel.** Single-flight melindungi pemakai `createSessionRefresher`; integrasi pihak ketiga (atau kode kita sendiri yang memanggil `refreshSession` langsung) tetap bisa memicu reuse pada dirinya sendiri. Sudah diperingatkan di docstring, tetapi ia peringatan, bukan penjagaan.
* **Logout belum ada** sampai PR-018c: pengguna di komputer bersama belum punya cara mengakhiri sesinya, dan `revokeAllSessions` masih tak terjangkau.
* **Cookie `Path=/api/v1/auth` mengikat kontrak URL.** Bila prefiks API berubah, cookie lama tidak akan terkirim dan seluruh sesi web mati diam-diam. Perlu diingat saat memindah versi API.
* **Klien web yang salah mengirim `client: "mobile"`** akan menerima refresh token di body dan kehilangan proteksi `HttpOnly`. Server tidak bisa mencegahnya; hanya review kode FE yang bisa.

### Next steps

* **PR-018c** — `POST /auth/logout` + `/auth/logout-all` + kolom `revoked_reason`, lalu FR-1.3 tertutup penuh.
* **PR-019** — `requireAuth`/RBAC memakai `verifyAccessToken(token, { version })`; putuskan strategi baca `token_version` per permintaan.
* **PR-024** — kebijakan retensi `refresh_tokens` (sudah tertulis, menunggu `revoked_reason` dari 018c).
* **PR-030** — E2E login→refresh; sekalian Manual Verification cookie di browser.
* **PR-105** — rate limit per-IP untuk `/auth/refresh` dan `/auth/google`.

---
## PR-018c — Logout, Logout-All & `revoked_reason`

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-018---jwt-rs256--rotating-refresh--reuse-detection)
> **Tanggal:** 2026-08-04
> **Status:** Selesai — **FR-1.3 tertutup penuh**
> **Branch:** `pr-018c-logout-revoked-reason` → `phase-02-authentication-account`

### Ringkasan

Penutup PR-018. Pengguna akhirnya punya cara mengakhiri sesinya — dan reuse
detection belajar membedakan insiden dari perilaku normal.

### Scope yang selesai

* Migrasi 05 — enum `RefreshRevokedReason` + kolom `refresh_tokens.revoked_reason` (nullable, aditif).
* `POST /api/v1/auth/logout` — mencabut satu keluarga (perangkat ini).
* `POST /api/v1/auth/logout-all` — `ver` bump + cabut semua refresh milik pengguna.
* `session.service` — `logout`, `logoutAll`, `userIdOf`; `refresh` kini membedakan sebab pencabutan.
* `refresh-token.repository` — `markReuse`, sebab pada `rotate`/`revokeFamily`/`revokeAllForUser`.
* OpenAPI dua path baru; api-client `logout`/`logoutAll`.
* Test: 8 unit sesi baru, 9 HTTP baru, 4 DB baru. **`@nawasena/api` 400 test lulus, 1 skip.**

### Keputusan teknis

1. **Kredensialnya refresh token, bukan access token.** `requireAuth` baru lahir di PR-019; menunggunya berarti pengguna tidak punya cara mencabut sesi sama sekali sampai saat itu. Konsekuensi yang diterima sadar: pemegang refresh curian bisa memaksa logout semua perangkat — gangguan, bukan pengambilalihan, dan penyerangnya ikut kehilangan akses. Saat PR-019 mendarat, varian ber-`requireAuth` boleh ditambahkan; endpoint ini tidak perlu dicabut.
2. **Keduanya SELALU 204 — tanpa token, token karangan, atau logout kedua kali.** Dua alasan: pengguna yang menekan "keluar" tidak boleh dihadapkan pada kegagalan (hasil akhirnya sama — ia tidak punya sesi), dan jawaban yang berbeda antara token sah dan token karangan akan menjadikan endpoint ini alat penebak token.
3. **`logout` mencabut KELUARGA, bukan satu baris.** Keluarga adalah rantai rotasi satu login; mencabut satu baris hanya akan menyisakan penerusnya tetap hidup.
4. **Reuse detection kini melihat sebab.** Hanya `rotated` (dan NULL, untuk baris pra-migrasi) yang dicurigai. Token yang dicabut karena logout/hapus akun ditolak **tanpa** alarm: keluarganya memang sengaja dimatikan, tidak ada lagi yang perlu dilindungi, dan mengalarmkannya hanya membuat sinyal keamanan berisik oleh tab lain yang belum tahu pengguna sudah keluar. Inilah alasan utama kolom ini ada.
5. **NULL diperlakukan sebagai `rotated`, bukan sebagai "bukan reuse".** Baris yang dicabut sebelum migrasi 05 hanya mungkin dicabut karena rotasi. Memilih default yang longgar akan diam-diam melemahkan deteksi untuk data lama — ada test khusus untuk ini.
6. **Baris PEMICU ikut ditandai `reuse` lewat `markReuse`.** `revokeFamily` (benar) hanya menyentuh baris yang masih hidup, sedangkan pemicunya sudah tercabut. Tanpa langkah ini, justru token yang diputar ulang — bukti paling langsung dari insiden — akan dibuang retensi 180 hari (PR-024) sementara saudara-saudaranya bertahan 2 tahun. `revokedAt` asli dipertahankan; yang berubah hanya apa yang kemudian kita ketahui tentangnya.
7. **PERUBAHAN SADAR dari PR-018a: reuse berulang kini diaudit SEKALI per keluarga.** Konsekuensi dari (6) — setelah pemicu ditandai `reuse`, percobaan berikutnya tidak lagi terbaca sebagai rotasi. Ini diterima, bukan disesali: keluarganya sudah habis dicabut sehingga alarm kedua tidak menambah apa pun yang bisa ditindaklanjuti, sementara penyerang yang menggedor token mati bisa menulis baris audit tanpa batas (retensi 2 tahun, dan `/auth/refresh` belum ber-rate-limit). Penolakannya sendiri tetap terjadi setiap kali. Test PR-018a yang mengunci perilaku lama diperbarui beserta alasannya.
8. **`userIdOf` ikut memeriksa keaktifan akun.** Tanpa itu, akun terhapus yang tokennya masih hidup akan membuat `logout-all` menjawab 401 (karena `bumpTokenVersion` gagal) — melanggar janji idempoten di (2).
9. **Urutan `logoutAll`: bump DULU, baru cabut.** Kebalikannya meninggalkan jendela saat refresh sudah tercabut tetapi access token lama masih sah.
10. **`logout` di api-client memakai `skipAuthRefresh`.** 401 saat logout tidak boleh memicu refresh — sesinya memang sedang diakhiri.

### Bukti verifikasi

* `pnpm lint` — 9/9 workspace hijau (termasuk lint boundaries).
* `pnpm typecheck` — 9/9 workspace hijau.
* `pnpm test` — 9/9 hijau. `@nawasena/api`: **400 test lulus, 1 skip**; `@nawasena/api-client`: 24 lulus.
* `check:openapi` — `openapi.json` sinkron.
* Migrasi 05 di-apply ke PostgreSQL lokal; test DB berjalan nyata.

### Risiko yang ditemukan

* **Refresh token curian bisa memaksa logout-all.** Diterima sadar (lihat keputusan 1) — denial of service yang juga mematikan akses penyerang. Layak ditinjau ulang saat PR-019 memberi opsi guard access token.
* **Logout tidak diaudit.** Tidak ada aksi audit untuk keluar; investigasi tidak bisa membedakan "sesi hilang karena pengguna keluar" dari "sesi hilang karena reuse" tanpa membaca `revoked_reason` di DB. Kolomnya menyimpan jawabannya, tetapi audit trail-nya tidak. Kandidat penambahan kecil bila kelak dibutuhkan.
* **`logout-all` belum punya UI.** Sampai PR-033, kill-switch ini hanya bisa dipanggil lewat API — berguna untuk dukungan pengguna, tetapi belum bisa ditemukan sendiri oleh pengguna.
* **Alarm reuse kini sekali per keluarga** (keputusan 7): penyerang yang terus menggedor tidak lagi terlihat di audit setelah alarm pertama. Kalau kelak dibutuhkan visibilitas itu, tempatnya adalah metrik/rate limit (PR-105), bukan baris audit tanpa batas.

### Next steps

* **PR-019** — `requireAuth`/RBAC; pertimbangkan varian `logout-all` ber-guard access token.
* **PR-024** — kebijakan retensi `refresh_tokens` kini **tidak terblokir**: `revoked_reason` sudah tersedia.
* **PR-030/PR-033** — UI keluar + E2E; Manual Verification cookie di browser.
* **PR-105** — rate limit per-IP untuk `/auth/refresh`, `/auth/logout*`, `/auth/google`.

---
## PR-019 — RBAC Middleware & Route Registry

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-019---rbac-middleware--route-registry)
> **Tanggal:** 2026-08-06
> **Status:** Selesai — seluruh AC terpenuhi
> **Branch:** `pr-019-rbac-registry` → `phase-02-authentication-account`

### Ringkasan hasil

Fondasi otorisasi: tiga penjaga (`requireAuth`/`requireRole`/`requireSelf`) dan
sebuah registrar route yang membuat **deklarasi akses menjadi syarat mount**,
bukan dokumentasi. Rute yang terpasang tanpa deklarasi membuat proses gagal
boot — API tidak menyala setengah terbuka.

Yang dilindungi bukan sekadar "guard yang salah", melainkan **guard yang lupa
dipasang**: route tanpa penjaga berjalan sempurna, test-nya hijau (ia memang
mengembalikan data), dan tidak ada satu pun sinyal bahwa sesuatu terlewat. Itu
bentuk broken access control yang paling sering benar-benar terjadi.

Gate hijau: `pnpm lint` 9/9 (termasuk lint boundaries), `pnpm typecheck` 9/9,
`pnpm test` 9/9 — `@nawasena/api` **378 test lulus** (naik dari 339; 39 test
baru), 63 skip (integrasi DB/Redis, berjalan di CI).

### Scope yang selesai

* **`core/auth/registry.ts`** — tipe `RouteAccess` (5 bentuk), konstruktor `access.*`, `createRouteRegistry({ guardsFor })`, `RouteRegistrar` per modul, `list()` untuk PR-106, dan `assertRoutesDeclared(app, registry)`.
* **`core/auth/rbac.ts`** — `createAccessGuards({ tokenService, findSessionUser, internalGuard })` → `requireAuth`, `requireRole`, `requireSelf`, `guardsFor`; `authOf(req)` + augmentasi `Express.Request.auth`.
* **Konversi router**: `auth`, `health`, `internal` lahir dari registrar. Penjaga token `/internal/*` kini datang dari deklarasi `access.internal`, bukan dirangkai manual per rute.
* **`boot.ts`** — perakitan guards + registry di composition root, lalu `assertRoutesDeclared` sebelum listen.
* **`modules/auth`** — `createSessionUserSource(prisma)`: sumber identitas untuk `requireAuth`, memakai `findActiveSessionUser` yang sama dengan penerbitan sesi.
* **Docs** — [docs/rbac-route-registry.md](../../rbac-route-registry.md): lima bentuk deklarasi, tabel perilaku penolakan, checklist review PR.
* **Test** — 19 unit guard, 11 registry/boot-validation, 9 HTTP matriks awal.

### Scope yang TIDAK selesai (dan kenapa)

* **Tidak ada endpoint yang memakai guard.** PR-019 memang tidak menambah endpoint; PR-020 (`GET/PUT /me`) yang pertama memakainya. Matriks awal karena itu diuji di atas router fixture — tetapi lewat registrar dan penjaga yang **sama persis** dengan modul nyata, bukan tiruan.
* **Matriks penuh autogenerated** — PR-106, sesuai rencana phase. `list()` adalah kontrak yang akan dikonsumsinya.
* **Varian `logout-all` ber-`requireAuth`** (follow-up PR-018c) — mengganti kredensial endpoint yang sudah ship adalah perubahan perilaku, bukan scope framework. Dicatat ulang sebagai next step.
* **Cache `token_version`** — lihat keputusan 1.

### Keputusan teknis

1. **`requireAuth` membaca `users.token_version` dari DB SETIAP permintaan.** Ini menjawab pertanyaan terbuka dari PR-018b. Klaim `ver` tidak berarti apa-apa sampai dibandingkan dengan nilai terkini — tanpa perbandingan itu, logout-semua-perangkat (PR-018c) tidak mematikan apa pun selama 15 menit ke depan. Biayanya satu lookup primary key; sebagai bonus, akun terhapus langsung kehilangan akses. Konsekuensi yang diterima sadar: access token tidak lagi sepenuhnya stateless. Cache Redis = follow-up, bukan kebutuhan pada ~500 DAU.
2. **Peran diambil dari DB, bukan dari klaim token.** Token membuktikan "siapa"; "boleh apa" dijawab baris user saat ini. Kalau tidak, penurunan hak (admin → seeker) baru berlaku setelah `ver` di-bump — dan tidak ada yang otomatis mem-bump saat peran berubah. Ada test yang menandatangani token ber-`role: admin` lalu membuktikan `req.auth.role` tetap `seeker`.
3. **Verifikasi tanda tangan DULU, baru sentuh DB.** Token karangan ditolak tanpa pernah menghasilkan query — lalu lintas tak terautentikasi tidak bisa dipakai membebani database. Diuji dengan lookup yang mencacah panggilannya (`panggilan === 0`).
4. **Prefix `/api/v1` dipegang registrar, bukan `app.use("/api/v1", router)`.** Registrar menuliskan path penuh ke Express DAN ke registry sekaligus, jadi keduanya tidak mungkin berbeda. Alternatifnya memaksa validator menebak mount path dari `layer.regexp` — rapuh, dan path yang terdeklarasi bisa diam-diam berbohong terhadap path yang benar-benar dilayani. Router registry yang dipasang dengan prefix ditolak saat boot.
5. **Validasi menyapu SELURUH app, bukan hanya `/api/v1`.** Karena itu `health` dan `internal` ikut dikonversi. Kalau hanya sebagian yang dijaga, siapa pun bisa memasang `Router()` polos di root dan lolos — kontrol preventif yang punya pintu belakang bukan kontrol preventif.
6. **Empat bentuk kelalaian ditolak, bukan satu:** (a) rute tanpa deklarasi, (b) `Router()` polos di luar registry, (c) router registry ber-prefix, (d) deklarasi yang routernya tidak pernah dipasang. Yang terakhir bukan soal keamanan langsung: ia mencegah matriks PR-106 menguji **endpoint hantu** dan melaporkan hijau atas sesuatu yang tidak ada.
7. **`access.public(alasan)` — alasan WAJIB.** Keterbukaan harus selalu jadi keputusan sadar yang bisa direview. Seluruh rute `auth` publik, dan itu benar: OTP/Google membuktikan diri dengan kredensialnya sendiri, refresh/logout dengan refresh token yang dibawa. Menjaga mereka dengan `requireAuth` berarti mensyaratkan sesi untuk membuat sesi.
8. **Admin TIDAK otomatis menembus `requireSelf`.** Bypass hanya lewat `alsoRoles` yang ditulis eksplisit per route. "Admin boleh apa saja" yang tersembunyi di dalam guard adalah kebocoran yang tidak pernah terbaca saat membaca router.
9. **Param `requireSelf` yang tidak ada di route → 403, bukan lolos.** Deklarasi yang salah tulis (`access.self("idPengguna")` untuk route `/:userId`) tidak boleh berubah menjadi endpoint terbuka. Ada test khusus.
10. **Satu kode untuk semua penolakan token** (`SESI_TIDAK_VALID`), dibedakan dari `TIDAK_TERAUTENTIKASI` (header tidak ada) dan `TIDAK_BERHAK` (403). Membedakan "kedaluwarsa" dari "tidak dikenal" kepada klien hanya berguna bagi penebak. `TIDAK_BERHAK` dipilih daripada 404 menyamar: pemanggil sudah terautentikasi dan sudah memegang id-nya, jadi menyamarkan keberadaan resource tidak menambah keamanan apa pun selain membingungkan pengguna yang salah tautan.
11. **Tanpa kunci sesi RS256 → 503, bukan 401.** Masalahnya ada di server; "silakan masuk" akan menyuruh pengguna mengulangi sesuatu yang memang belum bisa berhasil. Konsisten dengan deny-by-default per fitur di PR-018b.
12. **`core/auth` tetap BEBAS Prisma.** Barrel-nya di-import statis oleh gerbang fail-fast `index.ts`; import Prisma di sana akan memuat `.env` lebih dulu dan melangkahi seluruh gerbang (regresi yang pernah terjadi di PR-016). Sumber identitas disuntik dari `boot.ts` lewat `createSessionUserSource(prisma)`.
13. **`authOf()` melempar bila route-nya publik.** Itu bug pemrograman, dan yang benar adalah 500 yang berisik — bukan 401 yang terlihat wajar dan lolos review.

### Bukti verifikasi

* `pnpm lint` — 9/9 workspace hijau (termasuk `eslint-plugin-boundaries`).
* `pnpm typecheck` — 9/9 workspace hijau.
* `pnpm test` — 9/9 hijau. `@nawasena/api`: 378 lulus, 63 skip (DB/Redis lokal mati; CI menjalankannya).
* Ukuran: **~390 baris kode produksi** (452 baris file baru + 170 baris sisipan, dikurangi komentar; gaya komentar repo ini padat rasionale) + ~610 baris test. Di bawah target <500 LOC produksi.

### Risiko yang ditemukan

* **`requireAuth` menambah satu query per permintaan terautentikasi.** Diterima sadar (keputusan 1). Yang perlu diawasi: bila kelak ada endpoint ber-fan-out tinggi, lookup ini menjadi lantai biaya setiap request. Cache Redis ber-TTL pendek adalah jawabannya, bukan melemahkan pemeriksaan `ver`.
* **Validator membaca struktur internal Express 4** (`app._router.stack`, `layer.regexp.fast_slash`). Tidak ada di `@types`, jadi upgrade mayor Express bisa mematahkannya. Mitigasinya sudah terpasang: 11 test menguji perilaku validator secara langsung, jadi kepatahan itu akan muncul sebagai test merah, bukan sebagai gerbang yang diam-diam berhenti menjaga. **Bila kelak Express dinaikkan ke v5, file ini wajib ditinjau lebih dulu.**
* **Guard hanya sekuat deklarasinya.** Registry memaksa penulis MEMILIH, tidak memaksa memilih dengan BENAR — `access.public` pada endpoint yang seharusnya `self` akan lolos boot dengan tenang. Mitigasi: kewajiban `reason`, checklist review di dokumen konvensi, dan matriks PR-106.
* **Peran dibaca dari DB, jadi perubahan peran berlaku seketika — termasuk PENURUNAN hak di tengah sesi aktif.** Itu memang yang diinginkan, tetapi pengguna akan melihat 403 mendadak tanpa penjelasan. Saat UI admin pengubah peran lahir, ia perlu memberi tahu penggunanya.
* **`req.auth` opsional di tingkat tipe.** Controller yang membacanya langsung (bukan lewat `authOf`) akan mendapat `AuthContext | undefined` dan mungkin memilih optional chaining diam-diam. Konvensi sudah menulis `authOf()`; ini peringatan, bukan penjagaan.

### Next steps

* **PR-020** — `GET/PUT /me`: konsumen pertama `access.authenticated()`; endpoint ber-`:userId` memakai `access.self`.
* **PR-021** — hapus akun: `requireAuth` sudah menolak akun terhapus lewat `findActiveSessionUser`, jadi soft delete langsung berlaku pada seluruh route ber-sesi.
* **PR-106** — matriks authz autogenerated dari `routeRegistry.list()`.
* **PR-018c (follow-up)** — pertimbangkan varian `logout-all` ber-`requireAuth` kini guard-nya tersedia.
* **PR-105** — rate limit per-IP; sekalian tinjau ulang biaya lookup `token_version`.

---
## PR-020 — Users: GET/PUT /me

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-020---users--getput-me)
> **Tanggal:** 2026-08-06
> **Status:** Selesai — seluruh AC terpenuhi
> **Branch:** `pr-020-users-me` → `phase-02-authentication-account`

### Ringkasan hasil

Modul `users` lahir, dan guard PR-019 mendapat konsumen pertamanya. Dua endpoint
(`GET`/`PUT /api/v1/me`) dengan kontrak zod bersama, audit perubahan email tanpa
PII, dan satu migrasi yang tidak direncanakan tetapi wajib — lihat "Keputusan
teknis" nomor 1.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` **407 test lulus** (naik dari 378; 36 test baru), 71 skip
(integrasi DB, berjalan di CI). `check:openapi` sinkron.

### Scope yang selesai

* **`packages/schemas/src/users.ts`** — `fullNameSchema`, `emailSchema` (trim + lowercase), `meSchema`, `updateMeSchema`, `meResponseSchema`.
* **`modules/users`** — repository (kolom eksplisit + wasit P2002/P2025), service (pemetaan + audit), controller (`authOf`), router (`access.authenticated()`), wiring modul + `boot.ts`.
* **Migrasi 06** — `CREATE UNIQUE INDEX users_email_aktif_key ON users (email) WHERE deleted_at IS NULL`.
* **Audit** — aksi `ACCOUNT_EMAIL_CHANGED` + meta allowlist; katalog `docs/audit-action-catalog.md` diperbarui.
* **core/http** — kode `EMAIL_TIDAK_BISA_DIPAKAI` (409).
* **OpenAPI** — `components.securitySchemes.bearerAuth` (belum ada sebelumnya; seluruh endpoint lama sudah eksplisit `security: []`) + dua path `/me`; `openapi.json` di-regenerate.
* **Test** — 13 unit service, 15 HTTP, 8 PostgreSQL nyata.

### Scope yang TIDAK selesai (dan kenapa)

* **`getMe`/`updateMe` di `packages/api-client`** — preseden PR-016: klien ditambahkan bersama UI yang pertama memakainya (PR-033). Kontrak zod-nya sudah ada, jadi tidak ada duplikasi yang perlu ditebus nanti.
* **Verifikasi kepemilikan email** — tidak ada di backlog manapun; lihat Risiko.
* **Perubahan nomor HP** — nomor adalah kredensial login OTP; menggantinya adalah alur ganti-kredensial tersendiri, bukan edit profil.
* **E2E** — PR-033, sesuai rencana phase.

### Keputusan teknis

> ⚠️ **KOREKSI (PR-020a, 2026-08-06):** keputusan 1 di bawah dan deskripsi PR-020 menyatakan migrasi 06 menutup jalur penautan akun. **Itu keliru.** Index unik hanya mencegah dua baris memegang alamat yang sama — ia melindungi akun yang sudah ada, dan tidak mencegah penyerang mengklaim lebih dulu alamat yang belum terdaftar. Yang benar-benar menutup lubang adalah migrasi 07 + penyaring `emailVerified: true`; lihat [PR-020a](#pr-020a--email_verified-koreksi-lubang-penautan-akun).

1. **Migrasi 06 (unique parsial email) — koreksi atas "Database Changes: Tidak ada", disetujui owner.** `PUT /me` membuat email bisa diubah pengguna, sementara `findOrCreateByGoogle` (PR-017) menautkan identitas Google ke akun yang emailnya cocok. Yang diverifikasi di sana adalah `email_verified` **dari Google**, bukan email yang tersimpan di sisi kita — jadi penyerang yang menyetel email korban di akunnya sendiri akan menerima identitas Google korban saat korban login pertama kali, dan korban masuk ke akun orang lain. **Pemeriksaan di lapisan aplikasi saja ditolak:** ia baca-lalu-tulis, dan balapan dua permintaan bersamaan adalah persis bentuk eksploitnya, bukan kasus tepi teoretis. Index-nya PARSIAL mengikuti pola migrasi 01: email akun terhapus boleh dipakai ulang — hak hapus UU PDP tidak boleh berubah menjadi hukuman seumur hidup atas alamat sendiri.
2. **`access.authenticated()`, BUKAN `access.self()`** meski Technical Notes menyebut requireSelf. `/me` tidak punya param `:userId` untuk dibandingkan, dan `requireSelf` menolak semua permintaan pada route tanpa param (perilaku yang sengaja dipilih di PR-019). Yang dijaga requireSelf dijamin di sini oleh bentuk endpoint-nya: identitas datang dari sesi dan **tidak ada saluran input** untuk menyebut pengguna lain — service-nya bahkan tidak punya parameternya. `access.self` menunggu endpoint ber-param pertama.
3. **`email` di-`toLowerCase()` di kontrak, bukan di service.** Menyimpan dua bentuk kapitalisasi berbeda akan membuat unique index menganggapnya dua alamat berlainan — persis celah yang index itu tutup.
4. **Semantik PUT: `email` tidak dikirim = tidak diubah; `email: null` = dikosongkan.** PUT murni memperlakukan field yang hilang sebagai penghapusan; pada endpoint yang kelak bertambah field, itu berarti klien lama diam-diam menghapus data yang tidak ia ketahui. Kemurnian ditukar dengan keselamatan, dan pilihannya ditulis di skema supaya tidak jadi kejutan.
5. **409, bukan 400, untuk email bentrok** — bentuk inputnya sah; yang bentrok adalah keadaan dunia. Pesannya sengaja TIDAK memastikan bahwa akun lain itu ada ("Email ini tidak bisa dipakai", bukan "sudah terdaftar"): kalimat yang memastikan akan menjadikan endpoint ini alat memeriksa siapa saja yang punya akun di Nawasena. Ada test khusus atas bunyi pesannya.
6. **Audit hanya saat email BENAR-BENAR berubah.** Menyimpan formulir pengaturan (nama saja), atau mengirim ulang email yang sama, tidak menulis audit. Tanpa itu, jejak keamanan yang seharusnya jarang akan tenggelam di antara penyimpanan rutin.
7. **Alamat email tidak pernah masuk `meta` audit.** `audit_logs` bertahan 2 tahun (SDD §6.4) — jauh melewati baris yang memilikinya, dan pada akun yang dihapus PDP baris users-nya sudah lenyap sementara auditnya tinggal. Meta `{ hadPreviousEmail, cleared }` menjawab pertanyaan investigasi tanpa menyimpan PII.
8. **Dua lapis penjagaan "tanpa field internal".** Repository memilih kolom secara eksplisit (bukan `select: *`), dan service memetakan baris→kontrak. Lapis kedua itu yang menahan kolom baru yang kelak ikut terbawa repository. Ada test yang menyuntikkan `tokenVersion`/`googleId`/`deletedAt` ke baris dan membuktikan keduanya tidak lolos.
9. **`modules/users` punya repository sendiri di atas tabel `users`, terpisah dari `modules/auth`.** Yang dibagi adalah tabelnya, bukan kemampuannya: query login (find-or-create by phone/google, bump token version) tidak boleh terjangkau dari jalur profil. Boundaries tetap terjaga — tidak ada import repository lintas modul.
10. **`emailSebelum` disalin sebagai NILAI sebelum update.** Ditemukan oleh test, bukan review: bila baris yang dikembalikan repository ternyata objek yang sama dengan yang diperbarui, perbandingan "berubah atau tidak" akan selalu berkata "tidak" dan **audit email hilang tanpa gejala apa pun**. Prisma sungguhan tidak meng-alias, tetapi kode yang benar hanya karena kebetulan implementasi ORM bukan kode yang benar.
11. **Fake Prisma di test HTTP melempar `Prisma.PrismaClientKnownRequestError` yang SUNGGUHAN.** Repository membedakan P2002 dari P2025 lewat `instanceof`; error tiruan berbentuk `Error & { code }` akan lolos ke 500 dan membuat test lulus atas jalur yang tidak pernah dijalankan. Ini juga ditemukan oleh test yang gagal, bukan oleh review.

### Bukti verifikasi

* `pnpm lint` — 9/9 workspace hijau (termasuk `eslint-plugin-boundaries`).
* `pnpm typecheck` — 9/9 workspace hijau. Peta `META_AMAN` di `audit.test.ts` bertipe `Record<AuditAction, …>`, jadi aksi audit baru **wajib** punya fixture — typecheck yang mengingatkan, bukan reviewer.
* `pnpm test` — 9/9 hijau. `@nawasena/api`: **407 lulus**, 71 skip (DB lokal mati; CI menjalankannya).
* `check:openapi` — `openapi.json` sinkron dengan skema zod.
* Snapshot katalog error diperbarui (satu entri baru) — mekanisme PR-007 bekerja: penambahan kode error selalu terlihat di diff review.

### Risiko yang ditemukan

* **Email belum diverifikasi kepemilikannya.** Pengguna bisa menyetel alamat yang bukan miliknya. Unique index menutup penautan Google ke akun yang salah, tetapi TIDAK menutup pengguna yang mengklaim alamat orang lain yang belum punya akun Nawasena — saat korban kelak mendaftar lewat Google, ia justru akan ditolak/tertaut aneh. Verifikasi email tidak ada di backlog manapun; layak jadi PR tersendiri **sebelum** email dipakai untuk notifikasi (Phase 07) atau pemulihan akun.
* **`GET /me` belum ber-rate-limit spesifik** (hanya limiter global memory-store). Endpoint ini murah, tetapi ia melakukan satu query DB di guard + satu di service. Layak ikut disebut di PR-105.
* **Dua modul menulis ke tabel `users`.** Hari ini pembagiannya bersih (auth = kredensial & sesi, users = profil), tetapi tidak ada yang MENEGAKKAN pembagian itu selain disiplin — lint boundaries hanya melarang import silang, bukan kolom yang tumpang tindih.
* **Perubahan email tidak mencabut sesi.** Itu benar untuk sekarang (email bukan kredensial masuk di Nawasena), tetapi bila kelak ada "masuk dengan tautan email", keputusan ini harus ditinjau ulang bersama `ver` bump.
* **Katalog audit di `docs/` sempat tertinggal dua aksi** (`AUTH_LOGIN_SUCCEEDED`, `AUTH_REFRESH_REUSED` dari PR-017/018 tidak pernah didokumentasikan di sana). Ikut ditambal di PR ini karena barisnya bersebelahan; menandakan dokumen itu tidak punya penjaga otomatis seperti `openapi.json` punya `check:openapi`.

### Next steps

* **PR-021** — hapus akun: `findActiveById` sudah menyaring `deletedAt`, jadi soft delete langsung berlaku di endpoint ini. Migrasi 06 juga sudah menjamin email bebas dipakai ulang setelah akun dihapus.
* **PR-022** — ekspor PDP: `users/export` memanggil service modul lain; `getMe` adalah potongan pertamanya.
* **PR-033** — UI pengaturan + `getMe`/`updateMe` di api-client + E2E.
* **PR baru (usulan)** — verifikasi kepemilikan email, sebelum Phase 07 memakai email untuk notifikasi.
* **PR-105** — rate limit per-IP; sertakan `/me`.
* **Penjaga katalog audit (usulan kecil)** — test yang membandingkan `AUDIT_ACTION` dengan tabel di `docs/audit-action-catalog.md`, meniru apa yang `check:openapi` lakukan untuk kontrak API.

---
## PR-020a — `email_verified`: koreksi lubang penautan akun

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-020---users--getput-me)
> **Tanggal:** 2026-08-06
> **Status:** Selesai
> **Branch:** `pr-020a-email-verified` → `phase-02-authentication-account`

### Ringkasan hasil

PR perbaikan atas PR-020. Dua hal yang salah, satu di dokumen dan satu di kode:

1. **Klaim keamanan PR-020 berlebihan.** Migrasi 06 (unique parsial email)
   digambarkan "menutup jalur penautan akun". Tidak. Index unik hanya mencegah
   DUA baris memegang alamat yang sama — ia melindungi akun yang **sudah ada**,
   dan sama sekali tidak mencegah seseorang mengklaim lebih dulu alamat yang
   **belum terdaftar**. Justru itulah serangannya, dan ia masih terbuka penuh
   setelah PR-020 merged.
2. **Migrasi 06 memperkenalkan bug 500.** `findOrCreateByGoogle` menangani
   `P2002` dengan hanya mencari ulang `google_id`. Sejak email punya unique
   index, `P2002` dari email jatuh ke `throw err` → 500 `TERJADI_KESALAHAN`.

Keduanya ditutup di sini. Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9,
`pnpm test` 9/9 — `@nawasena/api` **408 lulus**, 75 skip (integrasi DB, CI).

### Serangan yang sebenarnya, dan kenapa index saja tidak cukup

```
Penyerang: PUT /me { email: "korban@gmail.com" }     → baris penyerang, email diketik sendiri
Korban   : login Google pertama kali
           langkah 1  findActiveByGoogleId  → null   (korban memang belum pernah masuk)
           langkah 2  findFirst({ email })  → BARIS PENYERANG
           → google_id korban ditulis ke akun penyerang; korban masuk ke akun orang lain
```

Index unik tidak pernah ikut campur di alur ini: hanya ADA SATU baris dengan
alamat itu, dan index puas. Yang keliru bukan jumlah barisnya — melainkan bahwa
kita memperlakukan alamat yang **diketik sendiri** setara dengan alamat yang
**terbukti**.

### Scope yang selesai

* **Migrasi 07** — kolom `users.email_verified` (`NOT NULL DEFAULT false`), backfill `true` untuk baris ber-email yang masih memegang `google_id`.
* **`schema.prisma`** — field `emailVerified` + dokumentasi aturannya.
* **`modules/auth`** — langkah 2 `findOrCreateByGoogle` menyaring `emailVerified: true`; pembuatan akun via Google menulis `emailVerified: true`; `P2002` non-`google_id` → `EmailDiklaimAkunLainError` (bukan 500).
* **`modules/users`** — `updateProfile` menulis `emailVerified: false` setiap kali email disentuh, termasuk saat dikosongkan.
* **`core/http`** — kode `EMAIL_GOOGLE_DIKLAIM_AKUN_LAIN` (409) dengan hint yang mengarahkan ke OTP.
* **`packages/schemas`** — alasan audit `googleEmailClaimed` (penambahan anggota enum = aditif).
* **Koreksi dokumen** — phase doc, entry log PR-020 (banner koreksi di atas keputusan 1), komentar migrasi 07.
* **Test** — 1 HTTP baru (409 + audit + `google_id` tidak berpindah), 4 DB baru, 3 test lama disesuaikan.

### Keputusan teknis

1. **DITOLAK, bukan ditautkan, dan juga bukan "buat akun tanpa email".** Tiga pilihan saat alamat dari Google dipegang baris yang belum terbukti: tautkan (= serangan itu sendiri), buat akun baru tanpa email (pengguna masuk, tetapi akunnya terbelah diam-diam dan datanya berserak), atau tolak dengan arahan. Dipilih yang ketiga. Alasannya bukan kemurnian: **jalur OTP tetap terbuka penuh**, jadi pengguna tidak pernah terkunci dari platform — sementara akun kembar tanpa email adalah kerusakan data yang tidak pernah memberi sinyal.
2. **Hint mengarahkan ke OTP, bukan sekadar menolak.** Bagi pengguna yang memang pemilik kedua-duanya (daftar lewat OTP, lalu mengetik emailnya), itu memang langkah yang benar. Bagi korban serangan, kalimat "hubungi kami bila Anda tidak mengenali akun itu" adalah satu-satunya cara insiden ini sampai ke kami.
3. **Diaudit sebagai `AUTH_LOGIN_FAILED` dengan `reason: googleEmailClaimed`.** Satu kejadian bisa saja tidak sengaja; pola berulang atas banyak alamat berarti ada yang memanen email lewat `PUT /me` untuk memanen identitas Google. Tanpa baris audit, pola itu tidak punya tempat untuk terlihat.
4. **Backfill dipersempit ke baris yang masih memegang `google_id`.** Sebelum PR-020 tidak ada cara mengisi email selain lewat Google, jadi backfill "semua email" pun secara historis benar. Tetapi `google_id` adalah bukti yang **melekat pada barisnya sendiri**, bukan kesimpulan dari sejarah — dan baris ber-email tanpa `google_id` hanya mungkin lahir dari `PUT /me` setelah PR-020, yang justru tidak boleh dipercaya.
5. **`emailVerified` ditulis ulang menjadi `false` SETIAP kali email disentuh**, termasuk saat dikosongkan. Alamat terverifikasi dari Google yang diganti manual kehilangan statusnya — itu memang yang benar, dan menuliskannya tanpa syarat menghilangkan satu cabang yang bisa salah.
6. **File migrasi 06 TIDAK disunting.** Prisma menyimpan checksum tiap migrasi yang sudah di-apply; menyunting isinya — bahkan hanya komentarnya — membuat `migrate deploy` menolak berjalan. Koreksinya hidup di migrasi 07, phase doc, dan log ini.
7. **Fake Prisma di `auth-google-http` diajari menghormati `emailVerified` DAN unique email.** Fake yang mengabaikan penyaring baru akan menautkan baris yang produksi tolak — yaitu meluluskan test atas lubang yang justru sedang ditutup. Ini pola yang sama dengan temuan `PrismaClientKnownRequestError` di PR-020: tiruan yang lebih longgar daripada aslinya adalah cara paling rapi untuk lulus tanpa jaminan.

### Bukti verifikasi

* `pnpm lint` — 9/9 hijau. `pnpm typecheck` — 9/9 hijau.
* `pnpm test` — 9/9 hijau. `@nawasena/api`: **408 lulus**, 75 skip (DB lokal mati; CI menjalankannya).
* `check:openapi` — sinkron (tidak ada perubahan kontrak HTTP selain kode error baru).
* Snapshot katalog error diperbarui (satu entri baru).
* Tiga test lama yang ikut berubah, dan alasannya: dua test DB PR-017a kini menyeed `emailVerified: true` (skenarionya memang akun terverifikasi), dan guard kolom tersimpan di `auth-google-http` bertambah satu kunci — `emailVerified` adalah jawaban ya/tidak, bukan kredensial.

### Risiko yang ditemukan

* **Pengguna OTP kehilangan penautan otomatis.** Daftar lewat OTP → ketik email → login Google kini ditolak 409. Ini konsekuensi langsung dari menutup lubangnya, bukan efek samping yang bisa dihindari: kita tidak punya cara membedakan pemilik sah dari pengklaim tanpa verifikasi. Penautan otomatis kembali begitu verifikasi email ada. **Sampai saat itu, ini gesekan UX nyata yang akan terlihat di dukungan pengguna.**
* **Verifikasi kepemilikan email masih belum ada** — kini menjadi prasyarat untuk memulihkan UX di atas, bukan sekadar higiene keamanan. Naik prioritas.
* **Penyerang masih bisa "memesan" alamat orang lain** di barisnya sendiri. Ia tidak lagi mendapat apa pun darinya, tetapi ia MENGHALANGI pemilik sah mendaftar lewat Google (jalur OTP tetap terbuka). Verifikasi email menutup ini juga; sampai saat itu, baris audit `googleEmailClaimed` adalah satu-satunya cara melihatnya.
* **Balapan `update` di langkah 2 masih belum ditangani** (P2002 pada `google_id` saat dua login bersamaan menaut baris yang sama). Pra-ada sejak PR-017, tidak disentuh di sini — cakupannya alur penautan, bukan alur klaim email.

### Next steps

* **PR baru (naik prioritas)** — verifikasi kepemilikan email. Kini bukan hanya menutup sisa lubang, tetapi juga memulihkan penautan otomatis bagi pengguna OTP.
* **PR-021** — hapus akun: `email_verified` ikut hilang bersama barisnya; tidak ada tindakan tambahan.
* **PR-033** — UI pengaturan perlu menjelaskan bahwa email yang baru diketik belum terverifikasi, supaya pengguna tidak mengira dirinya sudah bisa memakai login Google.
* **PR-106** — matriks authz; tidak terpengaruh.

## PR-021 — Hapus Akun (Soft Delete + Revoke)

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-021---hapus-akun-soft-delete--revoke)
> **Tanggal:** 2026-08-07
> **Status:** Selesai — seluruh AC terpenuhi
> **Branch:** `pr-021-hapus-akun` → `phase-02-authentication-account`

### Ringkasan hasil

Hak hapus UU PDP (PRD FR-1.4) punya endpointnya: `DELETE /api/v1/auth/account`.
Tiga hal lahir bersamanya — penjaga soft delete global di `core/db`, konfirmasi
ulang identitas dua jalur (OTP dan Google), dan penghapusan yang berlangsung
dalam satu transaksi lintas dua tabel.

Sebagian besar fondasinya sudah disiapkan PR sebelumnya tanpa pernah dipakai:
`RefreshRevokedReason.account_deleted` ada sejak migrasi 01, `ACCOUNT_DELETED`
ada di katalog audit sejak PR-014, dan `deleted_at` sudah disaring semua query
login sejak PR-016. Yang belum ada adalah yang menyalakannya.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` **529 test lulus** (naik dari 485; 44 test baru), 1 skip.
`check:openapi` sinkron.

### Scope yang selesai

* **`core/db/soft-delete.ts`** (baru) — fungsi murni `terapkanFilterAktif`: menyisipkan `deletedAt: null` ke `where` untuk 11 operasi model `user`, melewatkan `create`/`delete`/`deleteMany` dengan sengaja.
* **`core/db/index.ts`** — ekstensi dipasang di `createPrismaClient()`; tipe baru `AppPrisma`.
* **`modules/auth/repositories/user.repository.ts`** — `findDeleteContext()` (kredensial apa yang dimiliki akun) dan `deleteAccount()` (transaksi: `deleted_at` + `token_version` + pencabutan seluruh sesi).
* **`modules/auth/repositories/refresh-token.repository.ts`** — `argumenCabutSemuaSesi()` diekspor supaya jalur hapus akun dan `logout-all` memakai satu definisi "dicabut".
* **`modules/auth/services/account.service.ts`** (baru) — pemilihan jalur konfirmasi, pembuktian, audit tiga tahap.
* **`modules/auth/services/otp.service.ts`** — `konfirmasiKode()` diekstrak dari `verify()`; login tidak berubah perilakunya sama sekali.
* **`modules/auth/controllers/account.controller.ts`** (baru) + route `DELETE /auth/account` dengan `access.authenticated()`.
* **`packages/schemas`** — `googleReauthSchema`, `deleteAccountSchema` (tepat satu cara pembuktian), `redirectUriSchema` dipakai bersama alur masuk, meta `ACCOUNT_DELETED` diperluas, OpenAPI + `openapi.json`.
* **`core/http/errors.ts`** — tiga kode baru: `CARA_KONFIRMASI_TIDAK_COCOK` (400), `KONFIRMASI_GOOGLE_BEDA_AKUN` (403), `KONFIRMASI_TIDAK_TERSEDIA` (503).
* **Test** — 44 baru: `soft-delete.test.ts` (9), `auth-account.test.ts` (12), `auth-account-http.test.ts` (15), `auth-account-db.test.ts` (8).

### Scope yang TIDAK selesai (dan kenapa)

* **Purge permanen** — PR-023. PR ini justru membuka jalannya: `delete`/`deleteMany` sengaja tidak disaring penjaga.
* **UI konfirmasi** — PR-033. Endpointnya sudah punya kontrak zod bersama, jadi tidak ada duplikasi yang perlu ditebus nanti.
* **Rate limit endpoint ini** — PR-105. Jalur OTP sudah terlindung tangga lockout bersama login; jalur Google belum.
* **Undelete lewat aplikasi** — sengaja tidak ada. Pemulihan sebelum purge lewat dukungan pelanggan; membuatnya self-service berarti "hapus akun" hanya menyembunyikan, dan janji PDP-nya jadi kabur.

### Keputusan teknis

1. **`$extends`, bukan `$use` — menyimpang dari kata "middleware" di dokumen phase.** `$use` deprecated di Prisma 5 dan dihapus di Prisma 6. Ini kontrol keamanan; ia tidak boleh mati diam-diam saat upgrade. Biayanya `AppPrisma = Omit<PrismaClient, "$on" | "$use">` dan delapan anotasi tipe di `src` — **nol** perubahan di test, karena `PrismaClient` tetap assignable ke tipe yang lebih sempit itu. Hilangnya `$use` dari tipe adalah bagian dari tujuannya, bukan efek samping: pintu bagi middleware baru yang akan mati saat upgrade sekarang tertutup.

2. **Satu cast disengaja, dan hanya satu.** Klien ber-ekstensi tidak assignable ke `AppPrisma` karena TypeScript tidak bisa menyamakan dua overload `$transaction` (bentuk array vs callback). Yang berbeda urutan overload-nya, bukan perilakunya — klien di dalam callback justru superset (ekstensi ikut berlaku, yang memang diinginkan `deleteAccount`). Alasannya ditulis di tempat cast-nya, bukan di sini saja.

3. **Opt-out penjaga berbentuk "sebutkan `deletedAt` sendiri", bukan flag konteks async atau klien kedua.** Dua alternatif itu sama-sama bekerja, tetapi tak satu pun terbaca di tempat panggilan — pembaca query harus tahu ada tidaknya pembungkus di kejauhan. Dengan bentuk ini, `grep "deletedAt"` adalah daftar lengkap tempat yang perlu ditinjau, dan tidak ada cara diam-diam untuk keluar.

4. **Re-auth dua jalur, atas keputusan owner.** Platform ini tidak punya password; kredensialnya OTP-nomor dan Google. Menyediakan satu jalur saja berarti sebagian pengguna tidak akan pernah bisa memakai hak hapus PDP lewat aplikasi. **Nomor dan `sub` yang diuji diambil dari BARIS AKUN, tidak pernah dari body** — inilah bentuk "A tidak bisa menghapus B" yang tidak bisa lupa dipasang, sebab tidak ada salurannya.

5. **Satu transaksi lintas dua tabel, atas permintaan owner.** `deleted_at` + `token_version` sudah atomik sejak awal (satu `UPDATE` = transaksi implisit), tetapi pencabutan refresh token semula terpisah. Invariannya — "akun terhapus tidak punya sesi hidup" — melintasi dua tabel, jadi yang menegakkannya juga harus. Preseden ada: `rotate()` menaruh transaksinya di repository yang memiliki invariannya.

6. **`argumenCabutSemuaSesi` diekspor alih-alih menyalin klausanya.** Dua tempat yang memutuskan apa arti "dicabut" bebas menyimpang: satu lupa `revokedAt: null` di where (mencabut ulang baris mati dan merusak jejak sebabnya), satu lupa `revokedReason` (membuat retensi PR-024 salah). Bentuk data yang salah pada tabel ini tidak menimbulkan gejala apa pun sampai ada yang menyelidiki insiden.

7. **`konfirmasiKode` diekstrak dari `verify()`, bukan disalin.** Menyalinnya akan melahirkan tangga lockout kedua yang bebas menyimpang — pencacah anti-brute-force yang tidak sinkron adalah kelemahan tanpa gejala. Kegagalannya tetap diaudit sebagai `AUTH_LOGIN_FAILED` apa pun pemanggilnya: yang terjadi memang percobaan kredensial gagal atas nomor itu, dan memisahkan sinyalnya per-pemanggil justru memecah pola yang ingin dilihat.

8. **Audit tiga tahap, bukan dua.** `rejected` ditambahkan karena pembuktian yang gagal adalah sinyal tersendiri: berulang atas satu akun berarti seseorang memegang access token-nya tanpa memegang kredensialnya. Ketiganya berguna justru saat salah satu **tidak** muncul — `requested` tanpa `completed` berarti transaksi penghapusan gagal dan akun itu perlu diperiksa tangan sebelum purge.

9. **Kegagalan selalu menutup, tidak pernah membuka.** Fitur OTP mati di server → 503, bukan melewatkan pembuktian. Kredensial Google kosong → 503. Keduanya punya test tersendiri, sebab gagal-terbuka adalah mode kegagalan paling berbahaya untuk kontrol semacam ini dan tidak akan pernah terlihat dari test jalur bahagia.

10. **Controller tidak menghapus cookie saat gagal.** Sesinya masih sah; membuang cookie akan mengeluarkan pengguna dari akun yang justru batal dihapus.

### Bukti verifikasi

* `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api` **529 lulus**, 1 skip.
* `check:openapi` sinkron; `openapi.json` bertambah 129 baris (path `/auth/account` + komponen `DeleteAccount`/`GoogleReauth`).
* **Test DB kini benar-benar berjalan lokal.** Migrasi 06 & 07 belum pernah di-apply ke DB dev di mesin ini; `prisma migrate deploy` menjalankannya (aditif, non-destruktif). Sebelum ini 75 test DB selalu skip lokal dan hanya terbukti di CI — jadi baseline verifikasi PR ini lebih kuat daripada PR mana pun sebelumnya di phase ini.
* Empat test lama ikut berubah, semuanya karena perilaku yang memang berubah: fixture meta `ACCOUNT_DELETED` (skema diperluas), snapshot katalog error (tiga kode baru), daftar route auth di `rbac-http` (kini ada satu route ber-sesi), dan stub repository di `auth-otp` (dua metode baru dibuat meledak supaya pemakaian tak sengaja terlihat).
* Test daftar route sengaja **tidak** mengecualikan `/auth/account` dari perulangan "semua publik", melainkan memeriksanya terpisah — supaya route baru yang diam-diam ikut menuntut sesi tetap terlihat.

### Risiko yang ditemukan

* **Batas penjaga lebih luas dari yang tertulis di dokumen phase.** Risiko semula hanya menyebut raw SQL. Yang sebenarnya lolos ada dua: raw SQL **dan relasi bersarang** (`include: { user: true }` dijalankan sebagai operasi model lain, jadi penjaganya tidak pernah dipanggil). Tidak ada API Prisma yang menjangkau itu. Ditulis di kepala `core/db/soft-delete.ts` supaya terbaca oleh orang yang sedang menulis query, bukan hanya oleh yang membaca dokumen phase.
* **Kode OTP untuk hapus akun diminta lewat `/auth/otp/request` yang publik.** Pemegang access token curian bisa memicu pengiriman OTP ke nomor korban — gangguan, bukan pengambilalihan, karena ia tetap tidak bisa membacanya. Kuota kirim 3/jam membatasinya.
* **Jalur Google belum punya rate limit sendiri** (PR-105).
* **Belum ada notifikasi "akun Anda dihapus"** ke email/WhatsApp. Bila penghapusan tak sah pernah terjadi, korban baru tahu saat mencoba masuk — dan jendela pemulihan 30 hari mungkin sudah berjalan jauh. Butuh Phase 07 (notifikasi).
* **`prisma:error` muncul di keluaran test** pada skenario penghapusan kedua (P2025 yang memang diharapkan). Berisik, tidak salah — klien dikonfigurasi `log: ["warn","error"]`.

### Next steps

* **PR-022** (ekspor data PDP) — dependensinya sekarang terpenuhi. Perhatikan: ekspor harus memakai klien ber-penjaga, sehingga akun terhapus tidak bisa mengekspor apa pun.
* **PR-023** (purge) — jalan masuknya sudah disiapkan: `delete`/`deleteMany` tidak disaring, dan query kandidat cukup menyebut `deletedAt` sendiri. Jendela 30 hari ditegakkan di sana, bukan di sini.
* **PR-024** (retensi) — baris `refresh_tokens` ber-`account_deleted` kini benar-benar ada; kebijakan retensinya perlu menyebutkannya.
* **PR-033** (UI) — layar konfirmasi harus bercabang berdasarkan kredensial yang dimiliki akun (`GET /me` memberi `phone`); tulis dengan jelas bahwa penghapusan bisa dibatalkan lewat dukungan pelanggan sebelum 30 hari.
* **PR-105** — rate limit `DELETE /auth/account`, terutama jalur Google.
* **PR-106** — matriks authz: `/auth/account` adalah endpoint auth pertama yang ber-sesi; matriksnya akan menunjukkannya sebagai satu-satunya non-publik di modul itu.

## PR-021a — Penjaga jangkauan soft delete

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-021---hapus-akun-soft-delete--revoke)
> **Tanggal:** 2026-08-07
> **Status:** Selesai
> **Branch:** `pr-021a-penjaga-jangkauan` → `phase-02-authentication-account`

### Ringkasan hasil

PR-021 memasang penjaga soft delete, lalu menulis batasnya dengan jujur:
ekstensi Prisma hanya menjangkau operasi top-level model `user`. PR ini
memindahkan batas itu dari catatan menjadi kegagalan CI.

Tiga hal yang sekarang membuat build merah:

1. `new PrismaClient()` di luar `core/db/index.ts` — klien tanpa ekstensi sama sekali.
2. `include:`/`select:` yang membaca relasi `user`.
3. `$queryRaw`/`$executeRaw` menyentuh `users` tanpa menyebut `deleted_at`.

Satu berkas test, tanpa dependensi baru, tanpa perubahan kode produksi.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` **538 lulus** (naik dari 529; 9 test baru), 1 skip.

### Kenapa sekarang, bukan nanti

Saat PR ini ditulis, jumlah pelanggaran di seluruh `apps/api/src` adalah **nol**,
jadi daftar `RELASI_DIIZINKAN` lahir kosong.

PR-022 (ekspor data PDP) adalah agregator lintas modul — pemakai `include`
pertama yang sesungguhnya. Memasang penjaga setelahnya berarti memulai dengan
daftar pengecualian yang sudah terisi, dan daftar warisan tidak pernah ditinjau
siapa pun: ia hanya diwarisi. Bersih hari ini adalah aset yang punya tanggal
kedaluwarsa.

### Keputusan teknis

1. **Bypass nomor 1 ditambahkan sendiri, tidak ada di daftar risiko manapun.**
   Saat memeriksa keadaan awal, `new PrismaClient()` ternyata muncul di
   `prisma/seed.ts` — dan tidak ada yang menghalangi kemunculan berikutnya di
   `src`. Ini bypass yang lebih total daripada dua lainnya: bukan celah sempit,
   melainkan penjaga yang tidak dipasang sama sekali. Justru karena tidak
   tercatat sebagai risiko, ia yang paling layak dijaga otomatis.

2. **Komentar dibuang sebelum dipindai, dan itu bukan detail.**
   `core/db/soft-delete.ts` memuat `include: { user: true }` di dalam komentar
   yang menerangkan bahaya bentuk itu. Penjaga tanpa pembuang komentar akan
   menuduh dokumentasinya sendiri — dan yang terjadi berikutnya bukan penjaga
   diperbaiki, melainkan penjaga dimatikan. Pembuang komentar mempertahankan
   string dan baris baru supaya nomor baris laporan tetap jujur.

3. **`user:` dibedakan dari `userId:`.** Hampir setiap `select` di repo ini
   memuat `userId`. Tanpa pembedaan ini penjaganya berisik pada belasan tempat
   yang benar, dan penjaga berisik akan dimatikan orang.

4. **Pemindai diuji terhadap contoh SEBELUM dilepas ke repo.** Repo hari ini
   bersih, jadi pemeriksaan terhadapnya tidak membuktikan apa pun — pemindai
   yang rusak akan sama hijaunya. Empat test contoh (melanggar vs aman) yang
   membuat penjaga ini tidak lulus secara hampa, ditambah pemeriksaan bahwa
   penelusuran direktori benar-benar membuka >30 berkas.

5. **Diverifikasi dengan mutasi, bukan hanya dengan contoh inline.** Satu berkas
   berisi ketiga pelanggaran ditanam sementara di `apps/api/src`; ketiga
   pemeriksaan repo merah, empat self-test pemindai tetap hijau, lalu berkasnya
   dihapus. Contoh inline membuktikan regexnya benar; mutasi membuktikan
   penelusuran berkas dan jalur allowlist-nya benar-benar tersambung.

6. **Daftar pengecualian punya pemeriksaan kebalikan.** Entri yang
   pelanggarannya sudah dibereskan WAJIB dihapus, kalau tidak test merah. Pola
   yang sama dengan `BELUM_ADA` di `docs-links.test.ts` (PR docs #44): tanpa itu
   daftar pengecualian hanya bertambah dan pelan-pelan menjadi izin permanen
   bagi hal yang sudah lama tidak ada.

### Batas penjaga ini — ditulis supaya tidak disalahartikan

* **Pemindai teks, bukan pemeriksa tipe.** `include` yang dirakit lewat variabel
  (`const inc = { user: true }; findMany({ include: inc })`) lolos. Menutupnya
  butuh analisis tipe — biayanya jauh di atas nilainya untuk saat ini.
* **Cakupan `apps/api/src` saja.** `prisma/seed.ts` sengaja di luar: ia tidak
  pernah melayani permintaan, hanya mengisi database dev/CI. `packages/` dan
  `apps/worker` belum menyentuh Prisma sama sekali; begitu salah satunya mulai,
  cakupan ini harus ditinjau ulang.
* **Tidak menjamin query di dalam allowlist benar.** Ia hanya memaksa
  pengecualian menjadi keputusan sadar yang tertulis alasannya.

### Bukti verifikasi

* `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api` **538 lulus**, 1 skip.
* Mutasi: ketiga pemeriksaan repo merah pada pelanggaran yang ditanam di `src`, self-test pemindai tetap hijau, mutasi dihapus.
* Tidak ada perubahan kode produksi — nol risiko regresi runtime.

### Next steps

* **PR-022** — boleh mulai. Bila agregator ekspor benar-benar butuh relasi `user`, penjaga akan memintanya didaftarkan beserta alasan, dan pemanggilnya wajib menyaring `deletedAt` sendiri.
* **Tinjau cakupan** begitu `apps/worker` atau `packages/` mulai menyentuh Prisma.
* Sisa masalah pasca-PR-021 yang belum punya pemilik: verifikasi kepemilikan email (akar dari tiga masalah lain) dan notifikasi "akun Anda dihapus".

## PR-021b — Pemberitahuan pasca-hapus akun

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-021---hapus-akun-soft-delete--revoke)
> **Tanggal:** 2026-08-07
> **Status:** Selesai
> **Branch:** `pr-021b-pemberitahuan-hapus` → `phase-02-authentication-account`

### Ringkasan hasil

Penghapusan bersifat soft selama 30 hari justru supaya yang keliru bisa
dibatalkan. Jendela itu tidak ada gunanya kalau pemiliknya baru tahu di hari
ke-29 — dan orang yang akunnya dihapus tidak punya alasan untuk mencoba masuk
lagi dalam waktu dekat. PR ini mengirimkan satu pesan WhatsApp/SMS ke nomor
terdaftar setelah penghapusan berhasil.

Kanalnya sudah ada sejak PR-016b (Fonnte → Twilio). Yang belum ada adalah cara
memakainya untuk pesan selain OTP.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` **545 lulus** (naik dari 538; 7 test baru), 1 skip.

### Scope yang selesai

* **`OtpMessage` digeneralkan** dari `{ phone, code }` menjadi `{ phone, text }`; `buildOtpMessage` pindah ke pemanggil (`otp.service`).
* **`buildAccountDeletedMessage()`** + konstanta `HARI_SEBELUM_PURGE`.
* **`account.service`** mengirim pemberitahuan setelah `catat("completed")`, fire-and-forget.
* **Test**: 6 unit (isi pesan, terkirim, tidak terkirim saat konfirmasi gagal, provider mati tidak menggagalkan, akun tanpa nomor, tanpa provider) + 1 HTTP (perakitan modul tersambung).

### Keputusan teknis

1. **Transport tidak boleh tahu makna pesan.** Sebelum ini setiap adapter memanggil `buildOtpMessage` sendiri dari field `code`. Artinya menambah satu jenis pesan berarti menyunting SETIAP adapter — dan adapter yang terlewat akan mengirim teks yang salah ke pengguna, diam-diam. Ini sisi kedua dari aturan yang sudah tertulis di kepala `otp-sender.ts` ("service tidak boleh tahu nama provider"); PR ini melengkapinya, bukan menambahkan yang baru.

2. **Nama `OtpSender`/`OtpMessage` sengaja TIDAK diganti.** Rename yang akurat menyentuh 78 rujukan di 9 berkas untuk PR yang isinya ~60 baris. Utang ini dicatat di sini alih-alih dibayar dengan diff yang mengubur perubahan sesungguhnya. Namanya kini kurang tepat — kanal itu generik, bukan khusus OTP.

3. **Fire-and-forget, bukan ditunggu.** Akun sudah terhapus saat pengiriman dicoba; melempar di titik itu akan membuat pengguna mengira penghapusannya gagal lalu mencobanya lagi. Menunggu juga bukan pilihan: satu panggilan provider bisa memakan sampai 10 detik, dan itu 10 detik menatap layar menggantung setelah menekan tombol paling final di seluruh aplikasi. Pola yang sama dengan `auditLog`.

4. **Tidak ada tautan di dalam pesan.** Pesan yang meminta orang mengeklik sesuatu tepat setelah kejadian mencurigakan punya bentuk yang persis sama dengan phishing — dan pesan ini justru dibaca oleh orang yang sedang panik. Isinya tiga hal saja: apa yang terjadi, sampai kapan bisa dibatalkan, dan hubungi kami lewat kanal resmi.

5. **Nomor tujuan tidak ikut ke log kegagalan.** Yang berguna saat menyelidiki adalah provider mana yang gagal, bukan siapa yang tidak menerimanya. Diuji.

6. **Test membaca kode OTP dari ISI pesan, bukan dari field terpisah.** Konsekuensi wajar dari perubahan bentuk, tetapi juga peningkatan: test kini memakai pintu yang sama dengan pengguna, sehingga pesan yang salah bentuk menggagalkan test alih-alih lolos karena kodenya masih tersedia lewat pintu belakang.

7. **Satu test HTTP untuk hal yang tidak bisa dibuktikan unit test:** bahwa `sender` benar-benar sampai dari deps modul ke service. Unit test memasangnya langsung, jadi kabel yang putus di `createAuthModule` akan tetap hijau di sana dan diam di produksi.

### Risiko yang ditemukan

* **Pengguna Google-only tetap tanpa kanal apa pun.** Mereka tidak punya nomor, dan kanal email belum ada. Celah ini TIDAK tertutup PR ini — dan justru diuji secara eksplisit (`akun tanpa nomor: penghapusan tetap berjalan, tidak ada yang dikirim`) supaya ia tetap terlihat sebagai keputusan, bukan hilang menjadi asumsi.
* **Pengiriman tidak punya retry.** Provider yang sedang mati berarti pemberitahuan hilang selamanya — tidak ada antrean, tidak ada percobaan ulang. Memindahkannya ke BullMQ (kanal yang sudah ada sejak PR-008) akan menutup ini; belum dikerjakan karena antreannya belum punya processor notifikasi apa pun (Phase 07).
* **Nama `OtpSender` kini kurang tepat** — lihat keputusan 2.

### Next steps

* **Phase 07 (notifikasi)** — pindahkan pengiriman ke antrean supaya punya retry, dan tambahkan kanal email yang menutup celah pengguna Google-only.
* **Rename `OtpSender` → pengirim pesan generik**, sebagai PR terpisah yang isinya memang hanya rename.
* Sisa masalah pasca-PR-021 yang belum punya pemilik tinggal satu: **penautan akun OTP↔Google**, dan analisisnya berubah — lihat catatan koreksi di entri ini.

### Koreksi atas solusi yang diusulkan sebelumnya (2026-08-07)

Analisis sebelumnya menempatkan **verifikasi kepemilikan email** sebagai akar
dari tiga masalah: penautan Google otomatis yang hilang, pemesanan alamat orang
lain, dan ketiadaan kanal notifikasi. Untuk dua yang pertama, itu **menyesatkan**.

Email dipakai sebagai kunci penautan hanya karena tidak ada cara lain saat
PR-017 ditulis. Sekarang ada: pengguna yang SUDAH masuk bisa menautkan akun
Google-nya secara eksplisit — mesinnya (`exchange` + `verifier`) sudah dirakit
di modul auth sejak PR-021 dan hanya menganggur di luar jalur konfirmasi hapus.
Penautan eksplisit menyelesaikan masalahnya tanpa provider email, tanpa
kredensial baru, dan tanpa biaya.

Verifikasi email tetap berguna — untuk notifikasi dan pemulihan akun — tetapi
ia BUKAN prasyarat penautan, dan menempatkannya sebagai akar membuat pekerjaan
yang seharusnya murah terlihat mahal.

## PR-022 — Ekspor Data Pribadi (PDP)

> **Phase:** [02 - Authentication & Account](../phase-02-authentication-account.md#pr-022---ekspor-data-pribadi-pdp)
> **Tanggal:** 2026-08-07
> **Status:** Selesai — 4 dari 5 AC terpenuhi; AC-1 sebagian, sisanya terlacak di kode
> **Branch:** `pr-022-ekspor-pdp` → `phase-02-authentication-account`

### Ringkasan hasil

`GET /api/v1/me/export` — hak portabilitas UU PDP (§8.7). Berkas JSON ber-versi,
dibatasi 3 kali per 24 jam per pengguna, dan setiap ekspor tercatat di audit
tanpa satu pun data pribadi ikut masuk.

Bentuknya bukan agregator yang merakit semuanya sendiri, melainkan **registry
kontributor**: tiap modul menyerahkan bagiannya, dan kelengkapannya dijaga
mesin lewat pembacaan `schema.prisma`.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` **579 lulus** (naik dari 545; 34 test baru), 1 skip.
`check:openapi` sinkron.

### Temuan yang menentukan bentuk PR ini

AC-1 menuntut ekspor memuat **akun, preferensi, profil, CV, lamaran,
notifikasi**. Lima dari enam itu tidak punya modul — `modules/` hari ini hanya
`auth`, `health`, `internal`, `users`.

Tabelnya memang ada sejak migrasi 02–03. Tetapi **tidak ada satu pun endpoint
yang bisa mengisinya**: pengguna hari ini tidak bisa membuat profil karier, CV,
lamaran, atau notifikasi. Jadi berkas berisi `account` saja bukan ekspor
setengah jadi — ia **lengkap terhadap data yang benar-benar bisa dimiliki
pengguna**. Yang belum ada adalah jaminan bahwa bagian berikutnya benar-benar
ikut ditambahkan saat modulnya lahir.

### Scope yang selesai

* **`packages/schemas/src/export.ts`** (baru) — `EXPORT_FORMAT_VERSION`, `exportAccountSchema`, `dataExportSchema` (`.strict()`), `dataExportResponseSchema`.
* **`modules/users/services/export.service.ts`** (baru) — `ExportContributor`, `createAccountContributor`, `createExportService`, `EXPORT_POLICY`.
* **`modules/users/repositories/export-quota.repository.ts`** (baru) — pencacah harian di Redis.
* **`user.repository.ts`** — `findAccountForExport()`; **`users/index.ts`** — titik masuk `contributors` untuk modul lain.
* **Route** `GET /me/export` dengan `access.authenticated()`, OpenAPI + `openapi.json`, meta audit `DATA_EXPORTED` diperluas, katalog audit diperbarui.
* **Test** — 34 baru: `users-export.test.ts` (17), `users-export-http.test.ts` (9), `export-kelengkapan.test.ts` (8).

### Scope yang TIDAK selesai (dan kenapa)

* **Lima bagian ekspor lainnya** — modulnya belum ada. Dipindahkan ke daftar `DITUNDA` di penjaga, masing-masing menyebut PR pengambilnya.
* **`Content-Disposition: attachment`** — tombol unduh milik PR-033. Endpoint yang kadang response API kadang berkas lebih sulit dipakai keduanya.
* **Streaming JSON** — belum perlu; berkas hari ini satu objek.
* **Dekripsi field sensitif (ADR-007)** — miliknya `seeker_profiles`, yang modulnya belum lahir. Kontributor PR-037 yang akan melakukannya, di modulnya sendiri.

### Keputusan teknis

1. **Registry kontributor, bukan repository lintas modul.** Alternatifnya — modul `users` membaca langsung `seeker_profiles`, `resumes`, dan seterusnya — akan mencentang AC-1 hari ini, tetapi melanggar Technical Notes yang eksplisit dan menciptakan pembacaan kedua yang harus dibongkar saat PR-037 dan seterusnya lahir. Dan isinya akan kosong untuk setiap pengguna nyata, karena tidak ada cara mengisinya.

2. **Kelengkapan dijaga mesin, bukan checklist.** `export-kelengkapan.test.ts` membaca `schema.prisma`, mengumpulkan setiap model berelasi ke `User`, dan menuntut tiap model **terdaftar**, **ditunda** (menyebut PR-nya), atau **dikecualikan** (dengan alasan). Tabel baru = build merah sampai diputuskan. Daftar `DITUNDA` **adalah AC-1**, dipindahkan dari dokumen ke tempat yang tidak bisa dilewati. Diverifikasi dengan menanam model sementara di `schema.prisma` — pesan gagalnya menyebut ketiga pilihan yang tersedia.

3. **`dataExportSchema` memakai `.strict()`.** Ini bukan kehati-hatian umum, melainkan pasangan dari keputusan 1: karena bagian dirakit dari registry, objek zod yang longgar akan MEMBUANG bagian yang belum punya tempat di kontrak — modul baru mendaftar, tidak ada yang error, dan pengguna menerima ekspor yang kekurangan tanpa satu pun sinyal. Dengan `.strict()`, kontributor tanpa tempat membuat permintaan gagal, dan yang menambahkannya dipaksa menuliskannya di kontrak juga.

4. **`google_id` tidak pernah diekspor mentah.** Ia pengenal opaque milik Google: tidak berarti apa pun bagi pengguna, sekaligus tautan kredensial. Diturunkan menjadi `authMethods: ["otp", "google"]`, yang menjawab pertanyaan sesungguhnya — "bagaimana saya masuk ke akun ini".

5. **Kuota di Redis, bukan di memory store limiter global.** Limiter global (`core/http`) memakai memory store: ia mereset tiap deploy dan tidak dibagi antar replika. Untuk kuota yang diukur dalam HARI keduanya fatal — restart mengembalikan jatah, dua replika berarti jatah ganda. Mekanismenya sengaja sama persis dengan limiter kirim OTP (INCR + EXPIRE saat pertama, TTL tidak pernah diperpanjang) supaya ada satu pola di codebase, bukan dua.

6. **Kunci Redis memuat `userId` apa adanya**, tanpa sidik HMAC seperti nomor HP di repo OTP. Alasannya: userId adalah UUID acak, bukan PII yang bisa dikenali orang, dan ia sudah muncul di `audit_logs` sebagai `actor_id`. Menyamarkannya tidak menambah perlindungan apa pun, hanya membuat operasi (mis. menyetel ulang kuota satu pengguna) mustahil.

7. **Kuota diperiksa SEBELUM satu pun query berjalan.** Endpoint ini menyentuh banyak tabel; menolak setelah bekerja berarti biaya penyalahgunaan tetap dibayar server. Diuji dengan spy pada kontributor.

8. **Kontributor dijalankan berurutan, bukan `Promise.all`.** Urutan key di berkas jadi stabil (`account` selalu di atas, sehingga pembaca menemukan identitas pemiliknya lebih dulu), dan kegagalan pertama menghentikan sisanya alih-alih menyisakan query yang berjalan tanpa ada yang menunggunya.

9. **Fake Prisma di test HTTP MENGHORMATI `select`.** Fake yang mengembalikan baris penuh akan meluluskan test atas kebocoran yang produksi tidak punya — atau menyembunyikan yang punya. Ini pelajaran PR-020 yang diterapkan sejak awal, bukan setelah gagal.

### Risiko yang ditemukan

* **Payload akan membesar tanpa batas atas saat `applications`/`notifications` bergabung.** Keduanya tumbuh seiring pemakaian. Kontributornya wajib membawa batas atau paginasinya sendiri — agregator tidak punya cara mengetahui ukuran yang wajar untuk bagian milik modul lain. Risiko asli di dokumen phase menyebut "streaming JSON bila perlu"; yang lebih tepat adalah batas di sisi kontributor.
* **Kuota memakai Redis cache (`allkeys-lru`) yang boleh di-evict.** Di bawah tekanan memori, pencacah bisa hilang dan jatah kembali penuh sebelum 24 jam. Diterima sadar: kehilangannya melonggarkan batas, tidak merusak data, dan memindahkannya ke Redis queue (`noeviction`) akan mencampur kuota dengan antrean pekerjaan.
* **Pencacah naik pada percobaan, bukan pada keberhasilan.** Kegagalan server memakan satu dari tiga jatah harian. Mengikuti preseden limiter OTP; lebih ketat dan konsisten, tetapi terasa keras pada kuota sekecil ini.
* **Satu test sempat lulus secara hampa** dan tertangkap saat menulis: spy `kumpulkan` dibuat tetapi tidak pernah tersambung ke kontributor yang dipakai, sehingga `expect(kumpulkan).not.toHaveBeenCalled()` benar tanpa memeriksa apa pun. Diperbaiki dengan menyambungkannya DAN menambahkan pemeriksaan bahwa spy-nya memang terpanggil pada jalur normal.

### Next steps

* **PR-023** (purge) — dependensinya terpenuhi sejak PR-021. Perhatikan: akun terhapus tidak bisa mengekspor apa pun (klien ber-penjaga), jadi tidak ada interaksi baru.
* **PR-033** (UI) — tombol unduh; ia yang memasang nama berkas dan menangani 429 dengan menampilkan sisa waktu dari `Retry-After`.
* **PR-037 dan seterusnya** — tiap modul yang menyimpan data pengguna WAJIB mendaftarkan kontributornya lewat `UsersModuleDeps.contributors` dan menambahkan field-nya di `dataExportSchema`. Penjaga kelengkapan akan menolak build sampai itu dilakukan; daftar `DITUNDA` menyebut PR-nya masing-masing.
* **PR-105** — rate limit umum; kuota ekspor sudah punya batasnya sendiri dan tidak perlu diulang.
