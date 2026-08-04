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
14. **`AUTH_REFRESH_REUSED` jadi aksi audit tersendiri**, bukan `AUTH_LOGIN_FAILED`. Ini bukan percobaan masuk yang salah kode, melainkan sinyal keamanan yang layak dialarmkan terpisah. Meta-nya hanya `revokedCount` — tanpa PII, tanpa potongan token.
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
