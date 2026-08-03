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
