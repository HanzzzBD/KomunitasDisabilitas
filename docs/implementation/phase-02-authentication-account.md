---
phase: 2
name: "Authentication & Account"
prs: PR-016..PR-024 (9 PR)
sprint: "2"
depends_on: [1]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 02 - Authentication & Account

## Overview

Autentikasi lengkap (OTP WhatsApp + Google + JWT rotating refresh), RBAC dengan route registry, serta hak PDP dasar (hapus akun, ekspor data, purge, retention).

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-016** - Endpoint OTP + adapter dua provider
* **PR-017** - Endpoint Google login
* **PR-018** - Sesi JWT lengkap untuk kedua metode login
* **PR-019** - RBAC framework + registry
* **PR-020** - Endpoint profil akun
* **PR-021** - Soft delete menyeluruh
* **PR-022** - Endpoint ekspor PDP
* **PR-023** - Job purge terjadwal
* **PR-024** - Retention otomatis + agregat AI bulanan

## Pull Requests

### PR-016 - Auth OTP WhatsApp (Fonnte + Fallback Twilio)

#### Objective

**Login OTP: request/verify + rate limit + adapter sender.**

Bisnis: login tanpa password — hambatan terbesar bagi banyak pengguna disabilitas (PRD FR-1.2). Teknis: OTP 6 digit hash di Redis, TTL 5 menit, maks 5 percobaan, kirim 3/nomor/jam; interface `OtpSender` (Fonnte primer, Twilio SMS fallback) (SDD §8.1).

#### Scope

* Endpoint request/verify (verify → find-or-create user)
* Limiter kirim & percobaan; lockout progresif
* Adapter Fonnte + Twilio di balik satu interface

#### Technical Notes

**Backend Changes:**

* Modul `auth` (router/controller/service/otp) sesuai konvensi.

**Frontend Changes:**

* Tidak ada (halaman login di PR-030).

**Database Changes:**

* Tidak ada.

**API Changes:**

* POST /api/v1/auth/otp/request
* POST /api/v1/auth/otp/verify

**Security Considerations:**

* OTP hash-only di Redis (tidak plaintext); Rate Limiting khusus; Audit login gagal beruntun; Input Validation nomor E.164.

**Testing Checklist:**

* [x] Unit Test (limiter, hashing) — 14 test `auth-otp.test.ts` (PR-016a): generator kode, hash tanpa plaintext, kuota kirim, tangga lockout, kegagalan sender.
* [x] Integration Test (alur penuh + lockout, sender mock) — 11 test HTTP `auth-otp-http.test.ts` (server Express nyata, termasuk alur penuh saat Fonnte mati dan Twilio mengambil alih), 4 test Redis nyata `auth-otp-redis.test.ts`, 4 test PostgreSQL nyata `auth-user-db.test.ts`, 18 test adapter/rantai `auth-otp-sender.test.ts` (PR-016b).
* [ ] E2E Test (di PR-030)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [x] Manual Verification — **kirim OTP nyata lewat Fonnte** (2026-08-08). Dijalankan terhadap `FONNTE_TOKEN` sungguhan, bukan staging melainkan localhost: adapter hanya memanggil HTTP **keluar**, jadi URL publik tidak pernah menjadi syarat. `POST /api/v1/auth/otp/request` → `202`, pesan WhatsApp diterima di nomor uji, `POST /api/v1/auth/otp/verify` → `200` dengan `isNewUser: true` dan pasangan token. Diperiksa langsung di Redis nyata: kunci `otp:code:f6258b7c…` memakai **sidik HMAC** (daftar key bukan daftar nomor), TTL 268 dtk dari 300, dan isinya **hash** (`fe59823212ddf103…`), bukan 6 angka — dua AC teratas terbukti di luar test. Kuota kirim menjawab `retryAfterSeconds: 1073` setelah kiriman ketiga. **Menemukan bug produksi yang lolos dari 671 test** — lihat Log Implementasi.
* [ ] Manual Verification — **fallback Twilio** (matikan token Fonnte, buktikan SMS menggantikan). **Terhalang: akun Twilio belum tersedia.** Rantai fallback-nya sendiri sudah teruji di CI terhadap provider tiruan (termasuk kekhasan Fonnte HTTP 200 ber-`{"status": false}`), jadi yang belum terbukti adalah perilaku *Twilio*, bukan logika kita. Prosedur: isi trio `TWILIO_*`, aktifkan Geo Permissions Indonesia, kosongkan `FONNTE_TOKEN`, lalu ulangi alur di atas.

**Deliverables:**

* Endpoint OTP + adapter dua provider

**Out of Scope:**

* Penerbitan JWT (PR-018); UI login (PR-030).
* Rate limit OTP per-IP di lapisan HTTP (limiter di sini per-NOMOR) — PR-105 bersama Redis store `express-rate-limit`.
* Endpoint OTP di `packages/api-client` (dipakai pertama kali oleh UI login, PR-030).

**Rollback Strategy:**

RB-Std.

> **Dipecah jadi dua PR (persetujuan owner 2026-08-03):** scope utuh ~600–700 LOC, di atas target <500.
> **PR-016a** — kontrak zod verify, kode error OTP + `Retry-After` di error handler, repository Redis (hash + limiter + lockout), service request/verify, find-or-create user, endpoint `/auth/otp/*` — *selesai*.
> **PR-016b** — adapter Fonnte + Twilio di balik `OtpSender`, fallback otomatis, env kredensial provider — *selesai* (Manual Verification staging menunggu kredensial nyata).

#### Acceptance Criteria

* [x] OTP tidak pernah tersimpan/ter-log plaintext (test). — Redis hanya menyimpan HMAC-SHA256 ber-pepper (`OTP_HASH_SECRET`), dan kunci Redis memakai sidik HMAC nomor sehingga daftar key bukan daftar nomor. Diuji: seluruh isi Redis diperiksa tidak memuat kode/nomor; log server nyata diperiksa tidak memuat kode/nomor.
* [x] Kirim ke-4 dalam 1 jam → 429 dengan Retry-After. — Pencacah kirim per nomor (3/jam, SDD §8.1); `AppError` kini membawa `retryAfterSeconds` dan error handler global menuliskannya sebagai header. Diuji unit + HTTP (header `Retry-After: 3600`).
* [x] Percobaan ke-6 → OTP hangus + audit. — Percobaan ke-6 menghapus kode, menaikkan strike, dan mengunci progresif (5m → 15m → 60m); audit `AUTH_LOGIN_FAILED` dengan `reason: accountLocked`. Diuji: kode BENAR pun ditolak setelahnya.
* [x] Fonnte gagal → fallback Twilio otomatis (mock). — `createFallbackOtpSender` mencoba provider berikutnya saat yang pertama melempar; urutan Fonnte → Twilio dirakit dari env. Diuji di dua tingkat: unit rantai (sukses lewat cadangan, semua gagal, log tanpa PII) dan alur penuh HTTP (Fonnte membalas 500 → kode yang benar-benar dikirim Twilio diterima endpoint verify). Kegagalan yang khas Fonnte — HTTP 200 dengan `{"status": false}` — diperlakukan sebagai gagal, bukan sukses.
* [x] Verify sukses membuat user baru bila belum ada (find-or-create). — `findOrCreateByPhone` menghormati unique index PARSIAL PR-009 (`deleted_at IS NULL`) dan menangani balapan lewat P2002. Diuji terhadap PostgreSQL nyata: buat-lalu-pakai-ulang, akun soft-delete diabaikan, dua verifikasi bersamaan → satu akun.

#### Dependencies

* PR-009
* PR-013

#### Risks

* Ketergantungan Fonnte (layanan kecil). Mitigasi: interface sender + fallback teruji.

#### Log Implementasi

* 2026-08-03 — PR-016a selesai (store OTP Redis, limiter & lockout, endpoint request/verify, find-or-create). Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-016a--otp-core-store-redis-limiter-lockout-endpoint-requestverify).
* 2026-08-03 — PR-016b selesai (adapter Fonnte + Twilio, rantai fallback otomatis, env provider). Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-016b--adapter-fonnte--twilio-di-balik-otpsender--fallback-otomatis).
* 2026-08-03 — Perbaikan dua kegagalan test yang lolos dari CI: gerbang fail-fast boot dilangkahi dotenv milik Prisma (regresi keamanan) + `db-seed` terkontaminasi test paralel. Lihat [Tambahan PR-016](log/implementation_log_phase02.md#tambahan-pr-016--dua-kegagalan-test-yang-lolos-dari-ci).
* 2026-08-03 — Pemuatan `.env` dev dibuat eksplisit lewat `--env-file-if-exists` pada script `dev` (keputusan owner); fail-fast `FIELD_KEY_V*` tetap berjalan, `start`/produksi tidak memuat `.env`. Lihat [Tambahan PR-016 — Pemuatan .env dev](log/implementation_log_phase02.md#tambahan-pr-016--pemuatan-env-dev-yang-eksplisit---env-file).
* 2026-08-08 — Manual Verification Fonnte dijalankan; alur OTP nyata berhasil ujung ke ujung. Prosesnya **menemukan bug produksi**: klien Redis tidak pernah tersambung sehingga `POST /auth/otp/request` menjawab 500 di lingkungan nyata sementara CI hijau. Diperbaiki di PR terpisah. Lihat [Perbaikan — klien Redis tidak pernah tersambung](log/implementation_log_phase02.md#perbaikan--klien-redis-tidak-pernah-tersambung-temuan-1--3) dan [Hasil verifikasi manual](log/implementation_log_phase02.md#hasil-verifikasi-manual-pr-016--pr-017-terhadap-provider-nyata).


### PR-017 - Auth Google OAuth (PKCE)

#### Objective

**Login Google: exchange + verifikasi id_token.**

Bisnis: login satu ketuk (PRD FR-1.1). Teknis: authorization code + PKCE (mobile-ready), verifikasi audience/issuer, linking via google_id.

#### Scope

* Endpoint exchange
* Verifikasi id_token (JWKS) + find-or-create/link

#### Technical Notes

**Backend Changes:**

* `auth/google` service.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* POST /api/v1/auth/google

**Security Considerations:**

* Validasi audience/issuer/expiry id_token; PKCE wajib untuk klien publik; anti account-takeover saat linking (email verified saja).

**Testing Checklist:**

* [x] Unit Test (validator klaim) — 21 test `auth-google-id-token.test.ts` (PR-017a): `parseGoogleIdentity` (normalisasi email, nama kosong, varian `email_verified`, klaim cacat, tanpa bocor PII di pesan error) + verifikasi penuh (audience/issuer/kedaluwarsa/kunci asing/`alg: none`/JWKS mati/cache kunci). 10 test `auth-google-exchange.test.ts` (PR-017b): kegagalan jaringan/timeout → 503, hanya `id_token` yang keluar, pemetaan audit.
* [x] Integration Test (mock JWKS) — JWKS dilayani server HTTP lokal berisi kunci RSA nyata; token ditandatangani RS256 sungguhan, jadi yang diuji adalah jalur verifikasi sebenarnya (bukan stub library). 18 test HTTP `auth-google-http.test.ts` (PR-017b): server Express nyata + token endpoint Google tiruan + JWKS tiruan, mencakup seluruh AC. 7 test PostgreSQL nyata `auth-google-db.test.ts` untuk find-or-create/link.
* [ ] E2E Test (di PR-030)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [x] Manual Verification (akun Google uji) — **selesai 2026-08-08**, terhadap OAuth client sungguhan di localhost (`redirect_uri` datang dari body permintaan, bukan env, jadi staging tidak pernah menjadi syarat). Alur consent PKCE dijalankan di browser, `code` ditukar lewat `POST /api/v1/auth/google` → `200`, `isNewUser: true`, cookie refresh ber-flag lengkap. Yang baru terbukti di sini dan tidak bisa dibuktikan Google tiruan: penukaran ke **token endpoint Google asli** dan verifikasi `id_token` lewat **JWKS Google asli**. Diverifikasi di PostgreSQL nyata bahwa baris yang lahir memegang `google_id` + `email` ber-`email_verified = true`, dan **tidak ada satu pun kolom** yang bisa menyimpan `access_token`/`refresh_token` Google.

**Deliverables:**

* Endpoint Google login

**Out of Scope:**

* JWT session (PR-018).
* Audit sukses untuk login OTP — aksi `AUTH_LOGIN_SUCCEEDED` lahir di sini, tetapi memasangnya pada alur OTP adalah perubahan pada PR-016 (dicatat sebagai follow-up).
* Nonce OAuth (anti-replay tambahan di atas PKCE) dan penyegaran email saat berubah di Google — dicatat sebagai follow-up.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] id_token audience salah → 401. — Verifikasi menegakkan `aud` = client id kita, `iss` (dua bentuk sah Google), `exp`, dan **`alg: RS256` yang dikunci**. Diuji dua tingkat: unit terhadap JWKS nyata (audience lain, issuer palsu, token kedaluwarsa, kunci penyerang, `alg: none`, string bukan JWT) dan HTTP (`401` + envelope `TOKEN_GOOGLE_TIDAK_VALID`). JWKS tak terjangkau sengaja dipisah jadi 503, bukan 401 — itu masalah kami, bukan token pengguna.
* [x] User baru dibuat dengan google_id; login ulang me-link user sama. — Urutan `google_id` → email terverifikasi → buat baru. Diuji terhadap PostgreSQL nyata (akun baru, login ulang ke akun sama, `google_id` menang saat email berganti di Google, penautan akun OTP lewat email, akun soft-delete diabaikan, balapan → satu akun lewat unique index parsial) dan lewat HTTP (login kedua `isNewUser: false` dengan `userId` sama).
* [x] PKCE verifier salah → ditolak. — `code_verifier` divalidasi bentuknya (RFC 7636, 43–128 karakter unreserved) sebelum menyentuh jaringan, lalu dikirim ke token endpoint. Google menjawab `invalid_grant` → `401 GOOGLE_EXCHANGE_GAGAL`. Diuji lewat token endpoint tiruan, termasuk bukti bahwa `grant_type`/`code`/`code_verifier`/`redirect_uri` benar-benar terkirim, dan bahwa input cacat ditolak **tanpa pernah menghubungi Google**.
* [x] Tidak ada token Google tersimpan permanen. — Fungsi penukaran mengembalikan **hanya `id_token`** (tipe `string`); `access_token`/`refresh_token` tidak punya jalan keluar dari lapisan itu. Diuji: balasan Google tiruan sengaja menyertakan keduanya, lalu dipastikan tidak muncul di response API, di baris `users` yang tersimpan (kunci kolom di-assert eksplisit), maupun di log — bersama `code`, `code_verifier`, dan `client_secret`.
* [x] Audit login sukses/gagal tercatat. — `AUTH_LOGIN_SUCCEEDED` (`{method, isNewUser}`) pada keberhasilan; `AUTH_LOGIN_FAILED` dengan `reason` `googleExchangeFailed`/`googleTokenInvalid`/`googleEmailNotVerified` pada penolakan. Gangguan infrastruktur (503) sengaja **tidak** diaudit sebagai percobaan login gagal — mencatatnya akan mengotori sinyal keamanan justru saat sedang ada insiden. Diuji unit + HTTP, termasuk bahwa audit tidak pernah memuat email/nama.

#### Dependencies

* PR-016

#### Risks

* Perubahan perilaku Google OAuth. Mitigasi: library resmi + contract test JWKS.

> **Dipecah jadi dua PR (persetujuan owner 2026-08-04):** scope utuh ~560 LOC produksi + ~590 LOC test, di atas target <500 — pola yang sama dengan PR-016.
> **PR-017a** — kontrak zod `googleAuthSchema`, aksi audit `AUTH_LOGIN_SUCCEEDED`, env `GOOGLE_*`, kode error Google, verifikasi id_token via JWKS (`jose`), `findOrCreateByGoogle` — *selesai*.
> **PR-017b** — penukaran authorization code + PKCE, service/controller/router/wiring, endpoint `POST /api/v1/auth/google`, OpenAPI — *selesai* (Manual Verification staging menunggu OAuth client nyata).
>
> **Keputusan library (menyimpang dari catatan Risks "library resmi"):** verifikasi id_token memakai **`jose`**, bukan `google-auth-library`. Alasannya justru untuk memenuhi checklist *Integration Test (mock JWKS)*: `jose` membiarkan URL JWKS disuntik sehingga test menjalankan jalur verifikasi yang SEBENARNYA terhadap token RS256 yang ditandatangani sungguhan. Men-stub library resmi akan membuat test lulus tanpa pernah menguji verifikasinya. Konsekuensinya `iss`/`aud`/`exp`/`alg` divalidasi eksplisit di kode kita — lihat log implementasi.

#### Log Implementasi

* 2026-08-04 — PR-017a selesai (verifikasi id_token JWKS, validator klaim, find-or-create/link `google_id`, kontrak audit & env). Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-017a--verifikasi-id_token-google-jwks--linking-akun).
* 2026-08-04 — PR-017b selesai (penukaran code + PKCE, endpoint `POST /api/v1/auth/google`, audit sukses/gagal, OpenAPI). Seluruh AC PR-017 terpenuhi kecuali Manual Verification staging. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-017b--endpoint-post-apiv1authgoogle-exchange--pkce).
* 2026-08-08 — Manual Verification dijalankan terhadap OAuth client Google sungguhan; berhasil. **Seluruh checklist PR-017 kini tertutup penuh** — kalimat "kecuali Manual Verification staging" di baris atas tidak lagi berlaku. Lihat [Hasil verifikasi manual](log/implementation_log_phase02.md#hasil-verifikasi-manual-pr-016--pr-017-terhadap-provider-nyata).


### PR-018 - JWT RS256 + Rotating Refresh + Reuse Detection

#### Objective

**Sesi: access 15m, refresh 30d rotating, cabut keluarga saat reuse.**

Bisnis: sesi aman tanpa mengorbankan kenyamanan (login jarang diulang). Teknis: RS256 (`sub,role,ver`), refresh hash di DB per family, reuse → revoke family; web cookie HttpOnly SameSite=Strict (mitigasi CSRF), mobile SecureStore (SDD §8.1).

#### Scope

* Token service + endpoint refresh
* Integrasi OTP/Google → JWT pair
* `ver` bump = logout semua perangkat

#### Technical Notes

**Backend Changes:**

* `core/auth/tokens.ts`; auth service final.

**Frontend Changes:**

* Tidak ada (api-client hook refresh diaktifkan).

**Database Changes:**

* Tidak ada (refresh_tokens dari PR-009).

**API Changes:**

* POST /api/v1/auth/refresh
* POST /api/v1/auth/logout *(ditambahkan 2026-08-04 — lihat catatan di bawah; selesai di PR-018c)*
* POST /api/v1/auth/logout-all *(ditambahkan 2026-08-04; selesai di PR-018c)*

> **Celah yang ditambal (keputusan owner 2026-08-04):** matriks traceability ([README §FR](README.md)) menugaskan **FR-1.3 "Sesi aman (JWT, logout semua perangkat)" kepada PR-018 dan hanya PR-018**, tetapi `API Changes` semula tidak pernah mendefinisikan endpoint logout mana pun — tidak logout-all, tidak pula logout satu perangkat. Tidak ada PR lain yang akan mengambilnya (PR-021 mem-bump `ver`, tetapi itu hapus akun). Tanpa penambahan ini FR-1.3 ship dalam keadaan tidak lengkap dan tidak ada yang menyadarinya.
>
> Keduanya diautentikasi oleh **refresh token itu sendiri**, bukan access token + `requireAuth` — middleware itu baru lahir di PR-019, dan bergantung padanya akan membuat PR-018b menunggu guard yang belum ada. Konsekuensi yang diterima sadar: refresh token curian bisa memaksa logout-all (denial of service, bukan pengambilalihan) — penyerangnya pun ikut kehilangan akses, yang memang tujuannya.

**Security Considerations:**

* Refresh rotation + reuse detection; cookie flags (HttpOnly/Secure/SameSite=Strict); private key RS256 di env (ADR-015); audit reuse terdeteksi.
* **`revoked_reason`** (`rotated | logout | logout_all | reuse | account_deleted`, migrasi aditif nullable di PR-018b). Tanpa kolom ini, logout mencabut keluarga token dan klien basi yang kemudian mencoba refresh akan menyalakan `AUTH_REFRESH_REUSED` — **alarm palsu pada sinyal keamanan**. Kolom ini juga yang membuat retensi PR-024 bisa membedakan bukti insiden dari rotasi biasa.

**Testing Checklist:**

* [x] Unit Test (rotasi, klaim) — PR-018a
* [x] Integration Test (reuse family revoke) — PR-018a (PostgreSQL nyata)
* [ ] E2E Test (login→refresh di PR-030)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (inspeksi cookie di browser) — **sebagian terbukti 2026-08-08, sengaja belum dicentang.** Dari respons nyata KEDUA jalur masuk (OTP dan Google): `Max-Age=2591999` (tepat 30 hari), `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, dan `refreshToken` **tidak ada di body** untuk klien web. Access token nyata di-decode: `alg: RS256`, `exp − iat = 900` (tepat 15 menit), klaim `sub`/`role`/`ver`/`iss`/`aud` sesuai. Yang BELUM: flag `Secure` tidak pernah terlihat karena `boot.ts` melepasnya saat `NODE_ENV=development`, dan bukti di atas berasal dari header curl, bukan dari browser. Prosedur sisanya: jalankan ulang dengan `NODE_ENV=production` (browser memperlakukan `localhost` sebagai origin terpercaya, jadi HTTPS tidak diperlukan) lalu periksa cookie di DevTools.

**Deliverables:**

* Sesi JWT lengkap untuk kedua metode login

**Out of Scope:**

* RBAC guards (PR-019).

**Rollback Strategy:**

RB-Std; `ver` bump global tersedia sebagai kill-switch sesi.

#### Acceptance Criteria

* [x] Reuse refresh token lama → seluruh family dicabut + audit (test). — PR-018a
* [x] Access kedaluwarsa 15 menit; refresh 30 hari (assert klaim). — PR-018a
* [x] `ver` bump menolak semua access lama. — PR-018a
* [x] Cookie web ber-flag lengkap (snapshot header). — PR-018b
* [x] api-client 401→refresh→retry bekerja end-to-end (mock). — PR-018b

#### Dependencies

* PR-016
* PR-017

#### Risks

* Kesalahan implementasi rotation = lubang keamanan. Mitigasi: test reuse eksplisit + review keamanan khusus.

> **Dipecah jadi dua PR (persetujuan owner 2026-08-04):** scope utuh ~880 LOC produksi + ~700 LOC test, jauh di atas target <500 — pola yang sama dengan PR-016 dan PR-017. Batas pemecahan sengaja ditaruh di **kulit HTTP**, bukan per fitur, supaya SELURUH logika keamanan (rotasi + reuse detection + `ver`) berada dalam satu PR yang bisa direview keamanan sekaligus — itu mitigasi yang diminta bagian Risks di atas.
> **PR-018a** — migrasi `token_version`, env + gerbang fail-fast kunci RS256, `core/auth/{keys,tokens}`, repository refresh token, `session.service` (issue/rotate/reuse/revokeAll) — *selesai* (AC 1–3).
> **PR-018b** — endpoint `POST /api/v1/auth/refresh`, cookie web, integrasi OTP/Google → pasangan JWT, OpenAPI, hook refresh api-client — *selesai* (AC 4–5). **Seluruh AC PR-018 kini terpenuhi.**
> **PR-018c** — `POST /auth/logout`, `POST /auth/logout-all`, kolom `revoked_reason` — *selesai*. Dipisah karena 018b utuh terukur ~665 LOC produksi (dilaporkan sebelum menulis kode, sesuai rencana cadangan); 018b tanpa logout ≈ 435 LOC. **FR-1.3 kini tertutup penuh.**
>
> **Koreksi "Database Changes: Tidak ada":** tabel `refresh_tokens` memang cukup, tetapi kolom `ver` yang diminta Objective **tidak ada** di `users` — terlewat di migrasi PR-009, padahal SDD §8.1 menempatkannya di sana. Migrasi 04 menambahkannya secara aditif (`NOT NULL DEFAULT 0`, backward-compatible satu versi). Menyimpannya di Redis ditolak: `ver` adalah kill-switch sesi yang justru dipakai saat insiden, jadi ia tidak boleh ikut hilang saat cache di-evict.

#### Log Implementasi

* 2026-08-04 — PR-018a selesai (token service RS256, rotasi + reuse detection, `ver` bump, migrasi `token_version`, gerbang boot kunci sesi). Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-018a--token-service-rs256-rotasi--reuse-detection).
* 2026-08-04 — PR-018b selesai (endpoint `POST /auth/refresh`, cookie web ber-flag lengkap, integrasi OTP/Google → pasangan JWT, hook refresh api-client single-flight). **Seluruh AC PR-018 terpenuhi.** Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-018b--endpoint-refresh-cookie-web--integrasi-login).
* 2026-08-04 — PR-018c selesai (`POST /auth/logout` + `/auth/logout-all`, migrasi `revoked_reason`, reuse detection kini membedakan logout dari rotasi). **FR-1.3 tertutup penuh.** Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-018c--logout-logout-all--revoked_reason).


### PR-019 - RBAC Middleware + Route Registry

#### Objective

**requireRole/requireSelf + deklarasi akses wajib per route.**

Bisnis: mencegah kebocoran akses lintas pengguna (broken access control). Teknis: registrar route typed — route tanpa deklarasi akses → gagal boot; fondasi authz-matrix (PR-106) (SDD §8.2).

#### Scope

* Middleware requireRole()/requireSelf()
* Route registry + boot-time validation
* Konvensi deklarasi di setiap router modul

#### Technical Notes

**Backend Changes:**

* `core/auth/{rbac,registry}`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konvensi lintas endpoint).

**Security Considerations:**

* RBAC deny-by-default; requireSelf mencegah IDOR; boot-fail = kontrol preventif sistemik.

**Testing Checklist:**

* [x] Unit Test (guards) — 19 test `rbac-guards.test.ts`: requireAuth (header cacat, token karangan tanpa menyentuh DB, kunci asing, `ver` usang, akun terhapus, peran dari DB menang atas klaim, 503 tanpa kunci), requireRole, requireSelf (termasuk param salah tulis → 403), `guardsFor`.
* [x] Integration Test (boot validation, matrix awal) — 11 test `route-registry.test.ts` (empat bentuk bypass ditolak saat boot) + 9 test HTTP `rbac-http.test.ts` (server Express nyata, token RS256 nyata, matriks seeker/admin/self).
* [x] E2E Test (N/A)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [x] Manual Verification (tambah route tanpa deklarasi → gagal) — diotomatiskan: `route-registry.test.ts` memasang rute lewat `router.get()` langsung dan membuktikan `assertRoutesDeclared` melempar `RouteAccessError`. Empat bentuk bypass (rute tanpa deklarasi, Router polos, router registry ber-prefix, deklarasi tanpa mount) diuji sekaligus, jadi tidak perlu dijalankan tangan.

**Deliverables:**

* RBAC framework + registry

**Out of Scope:**

* Matrix penuh autogenerated (PR-106).
* Endpoint apa pun yang MEMAKAI guard — PR-019 tidak menambah endpoint; PR-020 (`GET/PUT /me`) yang pertama memakainya. Matriks awal karena itu diuji di atas router fixture, lewat registrar dan penjaga yang sama persis dengan modul nyata.
* Varian `logout-all` ber-`requireAuth` (follow-up PR-018c) — mengganti kredensialnya dari refresh token ke access token adalah perubahan perilaku endpoint yang sudah ship, bukan scope framework.
* Cache `token_version` (Redis) — `requireAuth` membaca DB per permintaan; lihat Risks.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Route tanpa deklarasi akses → boot error (test). — `assertRoutesDeclared()` dipanggil di `boot.ts` sebelum listen dan menolak **empat** bentuk kelalaian, bukan satu: rute terpasang tanpa deklarasi, `Router()` polos di luar registry, router registry dipasang dengan prefix (path deklarasi jadi berbohong terhadap URL sebenarnya), dan deklarasi yang routernya tidak pernah dipasang. Yang terakhir mencegah matriks PR-106 menguji endpoint hantu.
* [x] Seeker akses resource user lain → 403 (matrix awal). — `requireSelf` membandingkan `req.params[param]` dengan pemilik sesi. Diuji lewat HTTP (server Express nyata + token RS256 nyata): resource sendiri 200, resource orang lain 403 `TIDAK_BERHAK`. Param yang salah tulis di deklarasi → 403, **bukan** lolos.
* [x] Role admin-only ditolak untuk seeker (test). — `requireRole` menolak dengan 403; admin lolos. Daftar peran kosong menolak semua orang (deny-by-default diuji eksplisit). Admin **tidak** otomatis menembus `requireSelf` — hanya bila route menuliskan `alsoRoles: ["admin"]`.
* [x] Registry meng-ekspor daftar endpoint+akses (dipakai PR-106). — `routeRegistry.list()` → `{ method, path, access }[]` terurut stabil dengan path penuh. Ada test yang merakit router auth NYATA dan mengunci daftarnya (5 endpoint, seluruhnya `public` dan wajib membawa `reason`).
* [x] Dokumentasi konvensi guard tersedia. — [docs/rbac-route-registry.md](../rbac-route-registry.md): lima bentuk deklarasi, tabel perilaku penolakan, dua keputusan yang perlu diketahui sebelum menambah endpoint, dan checklist review PR.

#### Dependencies

* PR-018

#### Risks

* Deklarasi salah (terlalu longgar). Mitigasi: review wajib + matrix test di PR-106; `access.public` wajib membawa alasan tertulis supaya keterbukaan selalu bisa direview.
* **`requireAuth` membaca `users.token_version` dari DB setiap permintaan terautentikasi.** Konsekuensi sadar: access token tidak lagi sepenuhnya stateless. Tanpa itu `ver` tidak menutup apa pun dan logout-semua-perangkat hanya berlaku setelah 15 menit. Satu lookup primary key pada skala MVP (~500 DAU) tidak terasa; cache Redis dicatat sebagai follow-up bila profil beban berubah.

> **Konversi lintas modul (bukan hanya /api/v1):** router `health` dan `internal` ikut lahir dari registrar, sebab validasi boot menyapu SELURUH app. Kalau hanya `/api/v1` yang dijaga, siapa pun bisa memasang `Router()` polos di root dan lolos — kontrol preventif yang punya pintu belakang bukan kontrol preventif. Penjaga token `/internal/*` kini datang dari deklarasi `access.internal`, bukan dirangkai manual per rute.

#### Log Implementasi

* 2026-08-06 — PR-019 selesai (`requireRole`/`requireSelf`/`requireAuth`, route registry typed, gerbang boot `assertRoutesDeclared`, konversi router auth/health/internal, konvensi guard terdokumentasi). Seluruh AC terpenuhi. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-019--rbac-middleware--route-registry).


### PR-020 - Users — GET/PUT /me

#### Objective

**Profil akun dasar.**

Bisnis: pengguna mengelola identitas dasarnya. Teknis: modul users skeleton sesuai konvensi (nama, email).

#### Scope

* GET/PUT /me + skema zod

#### Technical Notes

**Backend Changes:**

* Modul `users` lahir.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* ~~Tidak ada.~~ **Koreksi (PR-020):** migrasi 06 menambahkan unique index PARSIAL `users_email_aktif_key` — lihat catatan di bawah Acceptance Criteria.

**API Changes:**

* GET /api/v1/me
* PUT /api/v1/me

**Security Considerations:**

* requireSelf; Input Validation nama/email.

**Testing Checklist:**

* [x] Unit Test (service) — 13 test `users-me.test.ts`: pemetaan baris→kontrak, field internal tertahan meski repository membocorkannya, kapan audit email menyala/diam, dan bahwa alamat email tidak pernah masuk isi audit.
* [x] Integration Test (authz) — 15 test HTTP `users-me-http.test.ts` (server Express nyata, token RS256 nyata, guard registrar PR-019) + 8 test PostgreSQL nyata `users-me-db.test.ts` (perilaku unique parsial migrasi 06, termasuk `EXPLAIN`-style pemeriksaan `pg_indexes`).
* [ ] E2E Test (di PR-033)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [x] Manual Verification (curl) — diotomatiskan: seluruh alur curl yang dimaksud (baca profil, ubah nama, ubah email, email bentrok, tanpa token) dijalankan sebagai permintaan HTTP nyata di `users-me-http.test.ts`, jadi tidak ada langkah tangan yang tersisa.

**Deliverables:**

* Endpoint profil akun

**Out of Scope:**

* Seeker profile karier (PR-037).
* Metode `getMe`/`updateMe` di `packages/api-client` — mengikuti preseden PR-016: klien ditambahkan bersama UI yang pertama memakainya (PR-033). Kontrak zod-nya sudah tersedia, jadi tidak ada duplikasi yang perlu ditebus nanti.
* **Verifikasi kepemilikan email** (kirim tautan/kode ke alamat baru) — tidak ada di backlog manapun; dicatat sebagai risiko di bawah.
* Perubahan nomor HP lewat profil — nomor adalah kredensial login OTP; mengubahnya adalah alur ganti-kredensial tersendiri, bukan edit profil.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] User A tidak bisa baca/ubah user B (test). — Dijamin oleh BENTUK endpoint, bukan oleh pemeriksaan yang bisa lupa dipasang: `userId` diambil dari `authOf(req)` dan service-nya bahkan tidak punya parameter untuk menyebut pengguna lain. Diuji lewat HTTP: dua token → dua profil berbeda; A yang menyelundupkan `id`/`userId` milik B di body tetap hanya mengubah barisnya sendiri, dan baris B tidak tersentuh.
* [x] Validasi email/nama dengan pesan sederhana. — Pesan zod menyebut perbaikannya, bukan hanya menyatakan salah: "Nama minimal 2 huruf", "Format email belum benar, contoh: nama@contoh.com". Penting karena pesan ini dibacakan screen reader apa adanya. Diuji sampai ke isi `hint` pada envelope 400.
* [x] Response tanpa field internal (role ver dsb. selektif). — Dua lapis: repository memilih kolom secara eksplisit, dan service memetakan baris→kontrak sehingga kolom baru yang kelak terbawa tetap tidak punya jalan keluar. `role` SENGAJA disertakan (FE memakainya memilih navigasi); yang dikecualikan `tokenVersion`, `googleId`, `deletedAt`, `lastActiveAt`. Diuji dengan baris yang sengaja membocorkan ketiganya.
* [x] Skema zod dipakai FE tanpa duplikasi. — `packages/schemas/src/users.ts` (`fullNameSchema`, `emailSchema`, `meSchema`, `updateMeSchema`) adalah satu-satunya definisi; API memakainya lewat `validate({ body })` dan test HTTP memvalidasi response dengan `meSchema` yang sama. OpenAPI di-generate dari skema itu juga (`check:openapi` hijau), termasuk `securitySchemes.bearerAuth` yang baru.
* [x] Audit perubahan email. — `ACCOUNT_EMAIL_CHANGED` menyala HANYA saat email benar-benar berubah (menyimpan nama, atau mengirim ulang email yang sama, tidak menulis audit). Meta `{ hadPreviousEmail, cleared }` — **alamatnya sendiri tidak pernah dicatat**: `audit_logs` bertahan 2 tahun, jauh melewati baris yang memilikinya.

#### Dependencies

* PR-019

#### Risks

* ~~Minim.~~ **Ditemukan saat implementasi:** membuat `email` bisa diubah pengguna membuka jalur penautan akun yang sebelumnya tidak ada — ditutup di PR-020a, lihat catatan di bawah.
* **Email masih belum diverifikasi kepemilikannya.** Pengguna tetap bisa MENGETIK alamat yang bukan miliknya; yang ditutup PR-020a adalah kemampuan alamat itu menarik identitas Google. Verifikasi kepemilikan (kirim tautan/kode) tidak ada di backlog manapun — kandidat PR baru sebelum email dipakai untuk notifikasi (Phase 07) atau pemulihan akun.
* **Pengguna OTP tidak lagi tertaut otomatis ke Google.** Konsekuensi PR-020a: mendaftar lewat OTP, mengetik email, lalu login Google kini DITOLAK (409) dan diarahkan masuk lewat OTP. Penautan otomatis kembali begitu verifikasi email ada.

> **Koreksi "Database Changes: Tidak ada" (keputusan owner 2026-08-06):** `PUT /me` membuat `email` bisa diubah pengguna, dan `findOrCreateByGoogle` (PR-017) menautkan identitas Google ke akun yang emailnya cocok. Yang diverifikasi di sana adalah `email_verified` **dari Google**, bukan email yang tersimpan di sisi kita — jadi penyerang yang menyetel email korban di akunnya sendiri akan menerima identitas Google korban saat korban login pertama kali. Dua migrasi menjawabnya:
>
> * **Migrasi 06** — `CREATE UNIQUE INDEX users_email_aktif_key ON users (email) WHERE deleted_at IS NULL`. Aditif, mengikuti pola dua index parsial migrasi 01.
> * **Migrasi 07 (PR-020a)** — kolom `email_verified`; hanya baris ber-`true` yang boleh dicocokkan saat penautan Google.
>
> **KOREKSI ATAS KLAIM AWAL PR-020 (2026-08-06):** deskripsi PR-020 menyatakan migrasi 06 "menutup jalur penautan akun". Itu **terlalu jauh, dan kekeliruannya penting**. Index unik hanya mencegah DUA baris memegang alamat yang sama — ia melindungi akun yang SUDAH ADA. Ia sama sekali tidak mencegah seseorang mengklaim lebih dulu alamat yang BELUM terdaftar, dan justru itulah serangannya: korban yang belum punya akun tetap akan mendarat di baris penyerang. Yang benar-benar menutup lubang adalah **migrasi 07 + penyaring `emailVerified: true`** di PR-020a. Migrasi 06 tetap berguna (mencegah dua akun berebut satu alamat), tetapi ia bukan mitigasinya.
>
> Pemeriksaan di lapisan aplikasi saja tetap ditolak: ia baca-lalu-tulis, dan balapan dua permintaan bersamaan adalah persis bentuk eksploitnya. File migrasi 06 **tidak** disunting untuk memuat koreksi ini — Prisma menyimpan checksum tiap migrasi yang sudah di-apply, jadi menyunting isinya akan membuat `migrate deploy` menolak berjalan.

#### Log Implementasi

* 2026-08-06 — PR-020 selesai (modul `users`, `GET/PUT /api/v1/me`, kontrak zod bersama, audit perubahan email, migrasi 06 unique parsial email). Seluruh AC terpenuhi. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-020--users-getput-me).
* 2026-08-06 — PR-020a selesai (migrasi 07 `email_verified`, penyaring penautan Google, perbaikan 500 → 409, koreksi klaim keamanan PR-020). Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-020a--email_verified-koreksi-lubang-penautan-akun).


### PR-021 - Hapus Akun (Soft Delete + Revoke)

#### Objective

**DELETE /auth/account + Prisma soft-delete middleware.**

Bisnis: hak hapus UU PDP (PRD FR-1.4). Teknis: `deleted_at` + `ver` bump + middleware Prisma menyembunyikan user terhapus dari SEMUA query.

#### Scope

* Endpoint final + middleware global
* Audit penghapusan

#### Technical Notes

**Backend Changes:**

* ~~Prisma middleware soft-delete~~ → **Prisma client extension** (`$extends`) di `core/db`; endpoint hapus akun di modul `auth`. Lihat catatan penyimpangan di bawah Acceptance Criteria.

**Frontend Changes:**

* Tidak ada (UI di PR-033).

**Database Changes:**

* Tidak ada. (`RefreshRevokedReason.account_deleted` sudah disiapkan migrasi 01; PR ini yang pertama memakainya.)

**API Changes:**

* DELETE /api/v1/auth/account

**Security Considerations:**

* PDP Compliance: hak hapus; revoke semua sesi; audit dengan alasan opsional (tanpa paksaan).

**Testing Checklist:**

* [x] Unit Test (middleware) — 9 test `soft-delete.test.ts` (operasi disaring vs sengaja dilewati, opt-out eksplisit, operasi tak dikenal) + 12 test service `auth-account.test.ts`.
* [x] Integration Test (lintas modul) — 8 test PostgreSQL nyata `auth-account-db.test.ts`: dua klien Prisma berdampingan (ber-ekstensi vs mentah) membuktikan bahwa baris terhapus DISEMBUNYIKAN, bukan hilang; repository `auth` dan `users` sama-sama buta. Plus 15 test HTTP `auth-account-http.test.ts`.
* [ ] E2E Test (di PR-033)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [x] Manual Verification (hapus akun uji) — diotomatiskan: seluruh alur (kode benar, kode salah, kode hangus, cara konfirmasi salah, consent Google beda akun, tanpa token, akses pasca-hapus) dijalankan sebagai permintaan HTTP nyata.

**Deliverables:**

* Soft delete menyeluruh

**Out of Scope:**

* Hard purge (PR-023); UI (PR-033).
* Rate limit khusus endpoint ini (PR-105). Percobaan OTP sudah dibatasi tangga lockout bersama login; jalur Google belum punya batasnya sendiri.
* Penyaringan relasi bersarang (`include: { user: true }`) dan `$queryRaw` — batas yang tidak bisa ditutup ekstensi Prisma mana pun; lihat Risks.
* Pembatalan penghapusan lewat aplikasi (undelete). Sebelum purge, pemulihan dilakukan lewat dukungan pelanggan.

**Rollback Strategy:**

RB-Std; soft delete reversible via support sebelum purge.

#### Acceptance Criteria

* [x] Pasca-hapus: login ditolak, refresh ditolak. — Tiga lapis yang saling menutup: `deleted_at` membuat `findActiveByPhone`/`findActiveByGoogleId`/`findActiveSessionUser` buta, `token_version` naik sehingga access token yang beredar langsung ditolak, dan seluruh refresh token dicabut ber-`account_deleted`. Diuji lewat HTTP (permintaan kedua dengan token yang sama → 401) dan DB.
* [x] Tidak ada query modul mana pun mengembalikan user terhapus (middleware test lintas modul). — Penjaganya di `core/db`, bukan di tiap repository: query users apa pun yang TIDAK menyebut `deletedAt` otomatis tersaring. Diuji dengan `findUnique`/`findFirst`/`count` telanjang terhadap PostgreSQL nyata, dibandingkan klien mentah yang masih melihat barisnya. **Batasnya tercatat di Risks — bukan klaim menyeluruh.**
* [x] Konfirmasi memerlukan re-auth ringan (OTP/relogin) — anti hapus tak sengaja. — **Dua jalur, sebab platform ini punya dua kredensial dan tidak punya password:** kode OTP baru ke nomor terdaftar, atau consent Google baru yang klaim `sub`-nya dicocokkan dengan `google_id` akun. Menyediakan satu jalur saja berarti sebagian pengguna tidak akan pernah bisa memakai hak hapus PDP lewat aplikasi. Nomor/`sub` yang diuji diambil dari BARIS AKUN, tidak pernah dari body.
* [x] Audit tercatat. — `ACCOUNT_DELETED` dengan tiga tahap: `rejected` (pembuktian gagal), `requested` (lolos, sebelum tulis), `completed` (dengan `revokedCount`). Berguna justru saat salah satu tidak muncul — lihat [docs/audit-action-catalog.md](../audit-action-catalog.md). Nomor, googleId, dan kode OTP tidak pernah masuk meta.
* [x] Data menunggu purge ≤ 30 hari (ditandai untuk PR-023). — Baris `users` tetap ada (diuji lewat klien mentah), dan `delete`/`deleteMany` sengaja TIDAK disaring supaya job purge punya jalan masuk. Jendela 30 hari itu sendiri ditegakkan PR-023.

> **Penyimpangan dari Technical Notes (keputusan agent 2026-08-07):** dokumen menulis "Prisma **middleware**", tetapi `$use` sudah deprecated di Prisma 5 dan **dihapus di Prisma 6**. Ini kontrol keamanan — ia tidak boleh mati diam-diam saat upgrade. Yang dipakai adalah penggantinya resmi, **client extension** (`$extends`). Biayanya satu tipe baru `AppPrisma = Omit<PrismaClient, "$on" | "$use">` dan delapan anotasi tipe di `src`; nol perubahan di test. Hilangnya `$use` dari tipe itu bukan efek samping melainkan bagian dari tujuannya: pintu bagi middleware baru yang akan mati saat upgrade sekarang tertutup.
>
> **Atomisitas (permintaan owner 2026-08-07):** `deleted_at`, `token_version`, dan pencabutan seluruh refresh token berada dalam SATU `$transaction` (`userRepository.deleteAccount`). Invariannya — "akun terhapus tidak punya sesi hidup" — melintasi dua tabel, jadi yang menegakkannya juga harus. Semantik "dicabut" punya satu definisi bersama (`argumenCabutSemuaSesi`) supaya jalur hapus akun tidak menulis versi keduanya sendiri.

#### Dependencies

* PR-020

#### Risks

* ~~Query lolos middleware (raw SQL). Mitigasi: konvensi repo + review raw SQL wajib filter deleted.~~ **Terkonfirmasi saat implementasi, dan lebih luas dari yang tertulis.** Ekstensi Prisma hanya menjangkau operasi **top-level** model `user`. Dua hal lolos: (a) **relasi bersarang** — `application.findMany({ include: { user: true } })` dijalankan sebagai operasi `application`, jadi penjaganya tidak pernah dipanggil; (b) **`$queryRaw`**, by design. Keduanya ditulis di kepala `core/db/soft-delete.ts`, bukan hanya di sini — penjaga yang diam soal batasnya lebih berbahaya daripada yang tidak ada, sebab ia mengundang orang berhenti berpikir. **Mitigasi ditingkatkan di PR-021a:** keduanya — plus `new PrismaClient()` di luar `core/db`, bypass yang lebih total daripada dua lainnya — kini gagal di CI alih-alih bergantung pada review (`apps/api/__tests__/soft-delete-jangkauan.test.ts`). Penjaga itu sendiri punya batas yang tercatat: ia pemindai teks atas `apps/api/src`, jadi `include` yang dirakit lewat variabel lolos darinya.
* **Kode OTP untuk hapus akun diminta lewat `/auth/otp/request` yang publik.** Tidak ada endpoint tantangan terpisah, jadi klien harus tahu nomornya sendiri (dari `GET /me`). Konsekuensi yang diterima: pemegang access token curian bisa MEMICU pengiriman OTP ke nomor korban — gangguan, bukan pengambilalihan, karena ia tetap tidak bisa membacanya. Kuota kirim 3/jam membatasi penyalahgunaannya.
* **Jalur Google belum punya rate limit sendiri** (PR-105). Percobaan OTP dibatasi tangga lockout bersama login; percobaan consent Google tidak.
* ~~Korban penghapusan tak sah baru tahu saat mencoba masuk~~ — **ditutup sebagian di PR-021b:** pemberitahuan WhatsApp/SMS dikirim ke nomor terdaftar setelah penghapusan berhasil. **Pengguna Google-only tetap tanpa kanal apa pun** sampai ada kanal email; ini celah yang tersisa, bukan yang tertutup.

#### Log Implementasi

* 2026-08-07 — PR-021 selesai (penjaga soft delete global di `core/db`, `DELETE /api/v1/auth/account` dengan re-auth OTP + Google, penghapusan satu transaksi, audit tiga tahap). Seluruh AC terpenuhi. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-021--hapus-akun-soft-delete--revoke).
* 2026-08-07 — PR-021a selesai (penjaga jangkauan soft delete di CI: klien tak ber-ekstensi, relasi bersarang, raw SQL). Dipasang selagi jumlah pelanggaran masih nol, sebelum PR-022. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-021a--penjaga-jangkauan-soft-delete).
* 2026-08-07 — PR-021b selesai (pemberitahuan pasca-hapus lewat kanal WhatsApp/SMS yang sudah ada; transport digeneralkan agar tidak lagi tahu makna pesan). Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-021b--pemberitahuan-pasca-hapus-akun).


### PR-022 - Ekspor Data Pribadi (PDP)

#### Objective

**GET /me/export — portabilitas data JSON.**

Bisnis: hak portabilitas UU PDP (SDD §8.7). Teknis: agregator lintas modul via service layer; field sensitif didekripsi hanya untuk pemilik.

#### Scope

* Endpoint ekspor JSON lengkap
* Rate limit ketat (mis. 3/hari)

#### Technical Notes

**Backend Changes:**

* `users/export` service (memanggil service modul lain — bukan repo lintas modul).

**Frontend Changes:**

* Tidak ada (UI PR-033).

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /api/v1/me/export

**Security Considerations:**

* requireSelf ketat; audit setiap ekspor; rate limit anti-scraping; tidak menyertakan data user lain (mis. nama admin di history).

**Testing Checklist:**

* [x] Unit Test (agregator) — 17 test `users-export.test.ts`: pemetaan kontributor, `google_id` tidak pernah keluar, penolakan kontributor di luar kontrak, audit tanpa isi data, dan perilaku pencacah kuota (termasuk kunci Redis tanpa TTL).
* [x] Integration Test (kelengkapan + isolasi) — 9 test HTTP `users-export-http.test.ts` (dua pengguna, dua berkas, nol kebocoran silang; 429 + `Retry-After`) + 8 test penjaga `export-kelengkapan.test.ts`.
* [ ] E2E Test (di PR-033)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [x] Manual Verification (inspeksi payload) — diotomatiskan: response nyata di-parse ulang memakai `dataExportSchema` yang sama dengan yang dipakai FE, jadi tidak ada bentuk buatan test yang bisa berbeda dari kontrak.

**Deliverables:**

* Endpoint ekspor PDP

**Out of Scope:**

* Format arsip ZIP/PDF.
* `Content-Disposition: attachment` — tombol unduh milik PR-033. Endpoint yang kadang response API kadang berkas lebih sulit dipakai keduanya.
* Streaming JSON — belum perlu; lihat Risks.
* Bagian ekspor milik modul yang belum lahir — lihat catatan di bawah Acceptance Criteria.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [~] Ekspor memuat: akun, preferensi, profil (termasuk sensitif milik sendiri), CV, lamaran, notifikasi. — **`account` selesai; lima sisanya belum punya modul.** Tabelnya ada sejak migrasi 02–03, tetapi TIDAK ADA endpoint yang bisa mengisinya: pengguna hari ini tidak bisa membuat profil karier, CV, lamaran, atau notifikasi. Jadi berkas ini **lengkap terhadap data yang benar-benar bisa dimiliki**, bukan setengah jadi. Sisanya dipindahkan dari checklist ini ke daftar `DITUNDA` di `export-kelengkapan.test.ts`, tempat ia tidak bisa terlewat.
* [x] Tidak ada data pihak lain di payload (test). — Dijamin BENTUK endpoint: `userId` dari `authOf(req)`, dan tidak ada satu pun parameter yang bisa menyebut pengguna lain. Diuji lewat HTTP dengan dua pengguna: berkas A tidak memuat nama/email/nomor B, dan sebaliknya. `google_id` juga tidak pernah keluar — diturunkan menjadi `authMethods`.
* [x] Ekspor ter-audit. — `DATA_EXPORTED` dengan `{ format, formatVersion, sections }`. **Isi datanya tidak pernah masuk audit**: `audit_logs` bertahan 2 tahun (SDD §6.4), jauh melewati baris yang memilikinya. Ekspor yang ditolak kuota TIDAK dicatat sebagai ekspor — diuji.
* [x] Rate limit bekerja. — 3 per 24 jam per pengguna, pencacah di Redis (bukan memory store limiter global, yang mereset tiap deploy dan tidak dibagi antar replika). 429 + `Retry-After` yang jujur karena TTL tidak pernah diperpanjang. Kuota diperiksa SEBELUM query mana pun berjalan.
* [x] Format JSON stabil (versioned). — `formatVersion: 1`. Naik hanya saat perubahan TIDAK aditif; menambah bagian baru kelak tidak menaikkannya. Response nyata di-parse ulang dengan `dataExportSchema` yang sama dengan yang dipakai FE.

> **Catatan bentuk (keputusan owner 2026-08-07):** AC-1 menuntut enam kategori, lima di antaranya belum punya modul. Alih-alih membaca tabelnya langsung dari modul `users` — yang melanggar Technical Notes ("memanggil service modul lain — bukan repo lintas modul") dan menciptakan pembacaan kedua yang harus dibongkar saat PR-037 dan seterusnya lahir — ekspor dibangun sebagai **registry kontributor**: tiap modul menyerahkan bagiannya lewat `UsersModuleDeps.contributors`, dan agregator tidak pernah menyentuh tabel milik modul lain.
>
> Kelengkapannya dijaga mesin. `export-kelengkapan.test.ts` membaca `schema.prisma`, mengumpulkan setiap model berelasi ke `User`, dan menuntut tiap model berada di salah satu dari tiga keadaan: **terdaftar**, **ditunda** (menyebut PR pengambilnya), atau **dikecualikan** (dengan alasan). Tabel baru yang menyimpan data pengguna membuat build MERAH sampai seseorang memutuskan — diverifikasi dengan menanam model sementara di `schema.prisma`.
>
> `dataExportSchema` memakai `.strict()` dengan sengaja: kontributor yang belum punya tempat di kontrak membuat permintaan GAGAL, bukan datanya dibuang diam-diam. Objek zod yang longgar akan membuat modul baru mendaftar, tidak ada yang error, dan pengguna menerima ekspor yang kekurangan tanpa satu pun sinyal.

#### Dependencies

* PR-021

#### Risks

* ~~Payload membesar. Mitigasi: streaming JSON bila perlu.~~ **Belum terjadi dan tidak akan terjadi sampai bagian lain masuk** — berkas hari ini hanya satu objek `account`. Yang perlu diawasi saat `applications`/`notifications` bergabung: keduanya tumbuh tanpa batas atas. Kontributornya wajib membawa batas atau paginasinya sendiri; agregator tidak punya cara mengetahui ukuran yang wajar untuk bagian milik modul lain.
* **Kuota memakai Redis cache (`allkeys-lru`), yang boleh di-evict.** Konsekuensi jujurnya: di bawah tekanan memori, pencacah bisa hilang dan jatah pengguna kembali penuh sebelum 24 jam. Diterima sadar — kehilangannya melonggarkan batas, tidak merusak data, dan memindahkannya ke Redis queue (`noeviction`) akan mencampur kuota dengan antrean pekerjaan.
* **Pencacah naik pada percobaan, bukan pada keberhasilan** (preseden limiter OTP). Kegagalan server tetap memakan satu dari tiga jatah harian. Lebih ketat, dan konsisten dengan limiter yang sudah ada.

#### Log Implementasi

* 2026-08-07 — PR-022 selesai (`GET /api/v1/me/export`, registry kontributor, kuota 3/24 jam di Redis, audit tanpa isi data, penjaga kelengkapan dari `schema.prisma`). Empat dari lima AC terpenuhi; AC-1 sebagian dan sisanya terlacak di kode. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-022--ekspor-data-pribadi-pdp).


### PR-023 - Worker pdp-purge (Purge Akun ≤ 30 Hari)

#### Objective

**Purge/anonimisasi terjadwal akun terhapus.**

Bisnis: janji hapus ≤ 30 hari ditepati otomatis (PRD FR-1.4). Teknis: cron 03:17 WIB; anonimisasi mempertahankan agregat North Star (SDD §6.4).

#### Scope

* Processor purge + audit per run
* Anonimisasi applications hired (tanpa PII)

#### Technical Notes

**Backend Changes:**

* `apps/worker/processors/pdp-purge.ts`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada skema; operasi data destruktif ter-audit.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* PDP Compliance inti; operasi destruktif dengan dry-run mode + audit count.

**Testing Checklist:**

* [x] Unit Test (selector kandidat purge) — 15 test `users-purge.test.ts`: bentuk selector, dry-run tanpa transaksi, urutan pelepasan `resume_id`, isi audit, batas per run.
* [x] Integration Test (purge + agregat) — 10 test PostgreSQL nyata `users-purge-db.test.ts` dengan `clock` di-fast-forward: kedua jalur, hired count tidak berubah, idempotensi run kedua, dry-run tidak mengubah apa pun.
* [x] E2E Test (N/A)
* [x] Accessibility Test (N/A)
* [x] Manual Verification (dry-run di staging) — diotomatiskan sebagai test DB; dry-run tetap tersedia untuk dijalankan operator (`{ "dryRun": true }`).

**Deliverables:**

* Job purge terjadwal

**Out of Scope:**

* Retensi data lain (PR-024).
* Endpoint memicu purge manual — job bisa di-enqueue lewat BullMQ; endpoint operator menunggu PR-103/Phase 16.
* Pemulihan akun yang telanjur dipurge. Setelah run, tidak ada jalan kembali selain backup harian (PR-104) — itulah gunanya jendela 30 hari.

**Rollback Strategy:**

Restore dari backup harian (PR-104); job dapat di-pause via config.

#### Acceptance Criteria

* [x] Akun terhapus > 30 hari → data pribadi hilang/dianonimkan (fast-forward test). — **Dua jalur.** Tanpa lamaran `hired` → `DELETE FROM users`, cascade membereskan seluruh anaknya (termasuk tabel yang lahir di PR mana pun). Dengan lamaran `hired` → baris dipertahankan tanpa satu pun PII (`full_name=''`, email/phone/google_id/last_active_at NULL, `email_verified=false`) dan 10 tabel data anak dihapus eksplisit. Diuji terhadap PostgreSQL nyata dengan `clock` yang di-fast-forward 40 hari.
* [x] hired count agregat tidak berubah pasca-purge. — Diuji langsung: `COUNT(*) WHERE status='hired'` sebelum dan sesudah run identik, dan lamarannya masih ada. Inilah alasan jalur anonimisasi ada sama sekali.
* [x] Dry-run mode menghasilkan laporan tanpa menghapus. — `{ dryRun: true }` menghitung dampak **tanpa membuka transaksi**; diuji bahwa tidak ada `delete`/`update` yang terpanggil dan bahwa data di DB tetap utuh. Default `false` — cron tanpa payload harus benar-benar menghapus, dan itu diuji tersendiri di `packages/schemas`.
* [x] Run ter-audit (jumlah entitas). — `DATA_PURGED` per akun (`entityId` = id akun) **dan** satu ringkasan run (`entityId` null) dengan `{ dryRun, accounts, deleted, anonymized, records }`. Ringkasan ditulis bahkan saat nol kandidat: "job berjalan dan tidak menemukan apa-apa" harus bisa dibedakan dari "job tidak berjalan".
* [x] Gagal purge → alert (hook PR-103). — Sudah ada, tidak dibangun ulang: `attempts: 1` (SDD §16) membuat kegagalan langsung jatuh ke `createDlqHandler`, yang menaikkan metrik dan menulis log. PR-103 yang menyambungkan metrik itu ke backend alerting.

> **Catatan bentuk (keputusan owner 2026-08-08):** Technical Notes menempatkan logika di `apps/worker/processors/pdp-purge.ts`. Berkas itu ada, tetapi sebagai **adapter** — validasi payload, panggil service, tulis log. Aturannya tinggal di `modules/users/services/purge.service.ts`. Alasannya sama dengan PR-022: worker adalah entry point, dan aturan bisnis yang tinggal di entry point tidak pernah punya test, tidak pernah punya batas modul, dan tidak pernah dipakai ulang. `apps/api` juga sudah punya seluruh harness test yang diperlukan; `apps/worker` belum punya satu test pun.
>
> **Tidak ada kolom "sudah dipurge", dan itu disengaja.** Kandidat didefinisikan dari KEADAAN TUJUAN: `deleted_at < cutoff` **dan** baris masih memegang PII (`phone`/`email`/`google_id`/`full_name`). Baris yang sudah bersih tidak pernah cocok lagi, sehingga job idempoten tanpa migrasi apa pun — dan run yang gagal separuh jalan otomatis dilanjutkan run berikutnya tanpa penanganan khusus.
>
> **Cron dijadwalkan worker sendiri** (`17 3 * * *`, TZ `Asia/Jakarta`, SDD §16) lewat repeatable job BullMQ saat boot. Idempoten terhadap restart, dan jadwalnya ikut berpindah bersama kode alih-alih hidup di crontab yang tidak pernah masuk review.

#### Dependencies

* PR-015
* PR-021

#### Risks

* ~~Purge keliru menghapus data aktif.~~ **Ditutup berlapis:** selector menuntut `deleted_at` **dan** PII tersisa; `UPDATE` anonimisasi menyertakan `deleted_at IS NOT NULL` di klausanya sehingga akun aktif tidak mungkin tersentuh; seluruh pekerjaan satu akun berada dalam satu transaksi; dan dry-run tersedia sebelum run sungguhan. Diuji: akun aktif dan akun terhapus 10 hari sama-sama tidak menjadi kandidat.
* **Penjaga soft delete (PR-021) ikut menyaring `user.update`** — ditemukan saat test DB pertama kali dijalankan, bukan lewat penalaran. Tanpa menyebut `deletedAt` sendiri, anonimisasi tidak akan pernah menemukan barisnya. Perilaku penjaganya benar; yang perlu diingat adalah setiap operasi masa depan yang menyasar baris terhapus wajib menyatakannya di tempat panggilan.
* **Jalur anonimisasi tidak dilindungi cascade.** Baris `users` tidak pernah dihapus, jadi tabel baru yang menyimpan data pengguna TIDAK ikut terbersihkan sendiri. Dijaga `purge-kelengkapan.test.ts`: setiap model berelasi `User` wajib diklasifikasi `TABEL_DIHAPUS`, `DIPERTAHANKAN`, atau `KEPENGARANGAN` — tabel baru membuat build merah.
* **Batas 500 akun per run.** Backlog besar butuh beberapa hari untuk habis, dan selama itu janji 30 hari meleset untuk sebagian akun. Processor menulis `warn` saat masih ada sisa; yang perlu diawasi adalah apakah angkanya menyusut.
* **Baris hasil anonimisasi menumpuk selamanya.** Tanpa PII, tetapi tetap baris. Belum jadi masalah pada skala MVP (< 5.000 pengguna); patut ditinjau ulang bila `users` tumbuh jauh melampaui pengguna aktifnya.

#### Log Implementasi

* 2026-08-08 — PR-023 selesai (processor `maintenance-pdp-purge`, dua jalur hapus/anonimkan, dry-run, audit per akun + ringkasan run, cron 03:17 WIB, penjaga kelengkapan purge). Seluruh AC terpenuhi. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-023--worker-pdp-purge-purge-akun--30-hari).


### PR-024 - Retention Jobs (match_scores/ai_usage/transkrip/job-expiry/refresh_tokens)

#### Objective

**Kebijakan retensi SDD §6.4 otomatis (Gap G3).**

Bisnis: minimisasi data (PDP) + kebersihan operasional. Teknis: `maintenance:retention` harian — match_scores 7d, ai_usage 90d (agregat bulanan dipertahankan), transkrip chat 30d pasca-finalize, jobs melewati `expires_at` → auto-close + event, `refresh_tokens` berjenjang menurut sebab pencabutan.

#### Scope

* Processor retention config-driven
* Agregasi bulanan ai_usage sebelum hapus
* Kebijakan berjenjang `refresh_tokens` + indeks BRIN pendukung

##### Kebijakan `refresh_tokens` (keputusan owner 2026-08-04)

Ditambahkan setelah PR-018a: tabel ini tidak punya kebijakan retensi sama sekali (celah di SDD §6.4, kini ditambal). **Retensi agresif di sini ditolak secara eksplisit** — reuse detection lebih penting daripada penghematan storage.

| Kategori | Predikat | Retensi | Env |
|---|---|---|---|
| Kedaluwarsa, tak pernah dicabut | `revoked_at IS NULL AND expires_at < now() - Xd` | 90 hari | `RETENTION_REFRESH_EXPIRED_DAYS=90` |
| Dicabut: rotasi/logout/logout-all/hapus akun | `revoked_at < now() - Xd` | 180 hari | `RETENTION_REFRESH_REVOKED_DAYS=180` |
| Dicabut karena **reuse terdeteksi** | `revoked_reason = 'reuse'` | 2 tahun | `RETENTION_REFRESH_REUSE_DAYS=730` |

**Kenapa berjenjang, bukan satu angka:** baris yang dicabut adalah satu-satunya cara membedakan token curian dari token tidak dikenal. Angka 180 hari **adalah jendela deteksi reuse**, bukan setelan kebersihan. Baris ber-`reuse` disamakan dengan `audit_logs` (2 tahun) karena baris DB dan baris auditnya dua paruh bukti yang sama. Biaya 180 hari di skala MVP (~500 DAU) ≈ 900rb baris ≈ ~270 MB — murah untuk menggandakan jendela deteksi.

Syarat yang menyertainya:

* **Indeks BRIN** pada `revoked_at`/`expires_at` (migrasi kecil). Tanpa itu purge harian men-seq-scan tabel yang terus tumbuh; kolomnya append-mostly dan berkorelasi waktu — kasus pemakaian BRIN (SDD §6.2).
* **DELETE berbatch** (`LIMIT` + loop) supaya tidak mengunci lama / menggelembungkan WAL.
* **Metrik**: baris terhapus per kategori **dan baris tersisa**, supaya pertumbuhan liar terlihat.
* Bergantung pada kolom `revoked_reason` — **sudah ada sejak PR-018c** (migrasi 05). Nilai `rotated | logout | logout_all | reuse | account_deleted`; baris lama bernilai NULL dan diperlakukan sebagai `rotated`.

#### Technical Notes

**Backend Changes:**

* Processor + config durasi.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tabel agregat `ai_usage_monthly` (migrasi kecil).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* PDP minimisasi; operasi destruktif ber-audit + dry-run.

**Testing Checklist:**

* [x] Unit Test (selector per kebijakan) — 14 test `retention.test.ts`: batching, batas run, dry-run, audit, dan ambang per kategori.
* [x] Integration Test (fast-forward) — 15 test PostgreSQL nyata `retention-db.test.ts` dengan `clock` fast-forward, termasuk kedua penjaga reuse detection dan `EXPLAIN` BRIN.
* [x] E2E Test (N/A)
* [x] Accessibility Test (N/A)
* [x] Manual Verification (dry-run staging) — diotomatiskan sebagai test DB; dry-run tetap tersedia (`{ "dryRun": true }`).

**Deliverables:**

* Retention otomatis + agregat AI bulanan

**Out of Scope:**

* Arsip audit_logs 2 tahun ke R2 (pasca-MVP, dicatat).

**Rollback Strategy:**

Restore backup; pause via config.

#### Acceptance Criteria

* [x] Tiap kebijakan teruji dengan clock fast-forward. — Berlaku untuk tiga kebijakan yang substratnya ada; lihat catatan pemecahan.
* [x] Job kedaluwarsa → status closed + event `job.closed`. — **PR-024b.** Hanya `published` yang tersentuh; `draft` yang kedaluwarsa dibiarkan (belum pernah terbit — menutupnya berarti mengarang transisi status). `UPDATE … RETURNING id` membuat event hanya terbit untuk lowongan yang BENAR-BENAR berubah. Diverifikasi mutasi: menghapus penyaring `status = 'published'` membuat tiga test merah.
* [x] Agregat bulanan ai_usage terbentuk sebelum purge. — Tabel `ai_usage_monthly` (migrasi 08), difinalkan per bulan LENGKAP dan tidak pernah dihitung ulang.
* [x] Config durasi via env (bukan hardcode). — Tujuh variabel `RETENTION_*`, semuanya opsional dengan default SDD §6.4. Nilai `0` ditolak saat boot.
* [x] Run ter-audit. — `DATA_RETAINED` per kebijakan + ringkasan run, ditulis bahkan saat nol baris tersentuh.
* [x] **Penjaga reuse detection:** baris `refresh_tokens` yang dicabut, lebih tua dari ambang *expired* tetapi lebih muda dari ambang *revoked*, **tetap selamat** (test eksplisit). — Diuji terhadap PostgreSQL nyata, dan **diverifikasi dengan mutasi**: menghapus `revoked_at IS NULL` dari predikat `expired` membuat test ini merah.
* [x] Baris ber-`revoked_reason = 'reuse'` bertahan melewati ambang 180 hari. — Diuji; ikut merah pada mutasi yang sama.
* [x] Indeks BRIN terpasang; purge harian tidak men-seq-scan `refresh_tokens` (EXPLAIN di test/manual). — Kedua index diperiksa di `pg_indexes` (`USING brin`), dan `EXPLAIN` dengan `enable_seqscan = off` membuktikan planner bisa memakainya untuk predikat retensi.

> **Pemecahan scope (keputusan owner 2026-08-08).** PR-024 sebagaimana ditulis melebihi target 500 LOC dan **dua dari lima kebijakannya tidak punya substrat**:
>
> * **Transkrip cv-chat 30 hari** — tidak ada tabelnya. `cv_chat` hanya nilai enum `AiFeature`; tabel transkrip lahir bersama modul AI CV builder (Phase 10).
> * **Job expiry → event `job.closed`** — tidak ada event bus sama sekali.
>
> Yang dikerjakan **PR-024a**: `refresh_tokens` berjenjang (90/180/730), `match_scores` 7 hari, `ai_usage` 90 hari + agregat bulanan, beserta antrean `maintenance-retention`, konfigurasi env, dry-run, DELETE berbatch, metrik sisa, dan audit. **Seluruh AC keamanan masuk di sini**, sebab semuanya memang tentang `refresh_tokens`.
>
> **PR-024b** (selesai 2026-08-08) mengambil job-expiry + event bus. Transkrip menyusul di Phase 10, mendaftar lewat registry kebijakan yang sama.
>
> **Bus event in-process lahir di `core/events`** (CLAUDE.md §3.2 akhirnya punya implementasi). Nilainya bukan pelanggan hari ini — `job.closed` punya **nol pelanggan** — melainkan momennya: membangun saat penerbit pertama lahir mencegah service expiry menumpuk panggilan langsung ke notifikasi, cache, dan analitik saat ketiganya lahir satu per satu. Tiga batasnya ditulis di kepala berkas: **satu proses**, **tanpa persistensi/retry/urutan**, dan **pelanggan tidak pernah menjatuhkan penerbit**.
>
> **Modul `jobs` lahir dengan lapisan service saja.** Ia ada di daftar 13 modul resmi, jadi ini modul yang belum lengkap — bukan modul karangan. Router/controller/repository menyusul di Phase 08.
>
> **Kebijakan dimiliki modul pemilik tabelnya.** `refresh_tokens` hidup di `modules/auth`, bukan di berkas retensi umum: ambang 180 hari **adalah jendela deteksi reuse** (§8.1), dan alasan sepenting itu harus duduk di sebelah `session.service.ts` yang bergantung padanya. Di berkas maintenance, ia akan dibaca sebagai angka yang boleh dikecilkan demi menghemat disk.

#### Dependencies

* PR-015
* PR-011

#### Log Implementasi

* 2026-08-08 — PR-024a selesai (antrean `maintenance-retention`, tiga kebijakan bertabel, migrasi 08 `ai_usage_monthly` + BRIN, config env, dry-run, audit). Tujuh dari delapan AC terpenuhi; job-expiry menunggu event bus di PR-024b. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-024a--retention-jobs-refresh_tokens-match_scores-ai_usage).
* 2026-08-08 — PR-024b selesai (bus event in-process `core/events`, modul `jobs` lapisan service, penutupan otomatis lowongan kedaluwarsa + event `job.closed`). **Seluruh AC PR-024 kini terpenuhi**; transkrip cv-chat tetap menunggu tabelnya di Phase 10. Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-024b--job-expiry--bus-event-domain).
* PR-018c (kolom `revoked_reason`) — terpenuhi

#### Risks

* Salah durasi menghapus data dibutuhkan. Mitigasi: dry-run default on di staging + backup.
* **Retensi `refresh_tokens` yang terlalu agresif membutakan reuse detection tanpa gejala** — tabelnya rapi, jobnya hijau, dan token curian diam-diam terbaca sebagai "tidak dikenal" sehingga keluarganya tidak pernah dicabut. Mitigasi: kebijakan berjenjang di atas + test penjaga di AC (bukan hanya review).


## Exit Criteria

Phase 02 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 9 PR (PR-016..PR-024) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration.
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 03 - Web Platform Base](phase-03-web-platform-base.md)
