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
* [x] Integration Test (alur penuh + lockout, sender mock) — 9 test HTTP `auth-otp-http.test.ts` (server Express nyata), 4 test Redis nyata `auth-otp-redis.test.ts`, 4 test PostgreSQL nyata `auth-user-db.test.ts` (PR-016a). Fallback dua provider menyusul di PR-016b.
* [ ] E2E Test (di PR-030)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [ ] Manual Verification (kirim OTP nyata ke nomor uji di staging) — menunggu adapter nyata (PR-016b).

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
> **PR-016b** — adapter Fonnte + Twilio di balik `OtpSender`, fallback otomatis, env kredensial provider, manual verification staging — *belum*.

#### Acceptance Criteria

* [x] OTP tidak pernah tersimpan/ter-log plaintext (test). — Redis hanya menyimpan HMAC-SHA256 ber-pepper (`OTP_HASH_SECRET`), dan kunci Redis memakai sidik HMAC nomor sehingga daftar key bukan daftar nomor. Diuji: seluruh isi Redis diperiksa tidak memuat kode/nomor; log server nyata diperiksa tidak memuat kode/nomor.
* [x] Kirim ke-4 dalam 1 jam → 429 dengan Retry-After. — Pencacah kirim per nomor (3/jam, SDD §8.1); `AppError` kini membawa `retryAfterSeconds` dan error handler global menuliskannya sebagai header. Diuji unit + HTTP (header `Retry-After: 3600`).
* [x] Percobaan ke-6 → OTP hangus + audit. — Percobaan ke-6 menghapus kode, menaikkan strike, dan mengunci progresif (5m → 15m → 60m); audit `AUTH_LOGIN_FAILED` dengan `reason: accountLocked`. Diuji: kode BENAR pun ditolak setelahnya.
* [ ] Fonnte gagal → fallback Twilio otomatis (mock). — **PR-016b.** Fondasinya ada: interface `OtpSender` + `OtpSenderError`; sender "belum dikonfigurasi" (deny-by-default) menghasilkan 503 dan menghanguskan kode yang tidak terkirim.
* [x] Verify sukses membuat user baru bila belum ada (find-or-create). — `findOrCreateByPhone` menghormati unique index PARSIAL PR-009 (`deleted_at IS NULL`) dan menangani balapan lewat P2002. Diuji terhadap PostgreSQL nyata: buat-lalu-pakai-ulang, akun soft-delete diabaikan, dua verifikasi bersamaan → satu akun.

#### Dependencies

* PR-009
* PR-013

#### Risks

* Ketergantungan Fonnte (layanan kecil). Mitigasi: interface sender + fallback teruji.

#### Log Implementasi

* 2026-08-03 — PR-016a selesai (store OTP Redis, limiter & lockout, endpoint request/verify, find-or-create). Lihat [log/implementation_log_phase02.md](log/implementation_log_phase02.md#pr-016a--otp-core-store-redis-limiter-lockout-endpoint-requestverify).


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

* [ ] Unit Test (validator klaim)
* [ ] Integration Test (mock JWKS)
* [ ] E2E Test (di PR-030)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (akun Google uji di staging)

**Deliverables:**

* Endpoint Google login

**Out of Scope:**

* JWT session (PR-018).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] id_token audience salah → 401.
* [ ] User baru dibuat dengan google_id; login ulang me-link user sama.
* [ ] PKCE verifier salah → ditolak.
* [ ] Tidak ada token Google tersimpan permanen.
* [ ] Audit login sukses/gagal tercatat.

#### Dependencies

* PR-016

#### Risks

* Perubahan perilaku Google OAuth. Mitigasi: library resmi + contract test JWKS.


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

**Security Considerations:**

* Refresh rotation + reuse detection; cookie flags (HttpOnly/Secure/SameSite=Strict); private key RS256 di env (ADR-015); audit reuse terdeteksi.

**Testing Checklist:**

* [ ] Unit Test (rotasi, klaim)
* [ ] Integration Test (reuse family revoke)
* [ ] E2E Test (login→refresh di PR-030)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (inspeksi cookie di browser)

**Deliverables:**

* Sesi JWT lengkap untuk kedua metode login

**Out of Scope:**

* RBAC guards (PR-019).

**Rollback Strategy:**

RB-Std; `ver` bump global tersedia sebagai kill-switch sesi.

#### Acceptance Criteria

* [ ] Reuse refresh token lama → seluruh family dicabut + audit (test).
* [ ] Access kedaluwarsa 15 menit; refresh 30 hari (assert klaim).
* [ ] `ver` bump menolak semua access lama.
* [ ] Cookie web ber-flag lengkap (snapshot header).
* [ ] api-client 401→refresh→retry bekerja end-to-end (mock).

#### Dependencies

* PR-016
* PR-017

#### Risks

* Kesalahan implementasi rotation = lubang keamanan. Mitigasi: test reuse eksplisit + review keamanan khusus.


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

* [ ] Unit Test (guards)
* [ ] Integration Test (boot validation, matrix awal)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (tambah route tanpa deklarasi → gagal)

**Deliverables:**

* RBAC framework + registry

**Out of Scope:**

* Matrix penuh autogenerated (PR-106).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Route tanpa deklarasi akses → boot error (test).
* [ ] Seeker akses resource user lain → 403 (matrix awal).
* [ ] Role admin-only ditolak untuk seeker (test).
* [ ] Registry meng-ekspor daftar endpoint+akses (dipakai PR-106).
* [ ] Dokumentasi konvensi guard tersedia.

#### Dependencies

* PR-018

#### Risks

* Deklarasi salah (terlalu longgar). Mitigasi: review wajib + matrix test di PR-106.


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

* Tidak ada.

**API Changes:**

* GET /api/v1/me
* PUT /api/v1/me

**Security Considerations:**

* requireSelf; Input Validation nama/email.

**Testing Checklist:**

* [ ] Unit Test (service)
* [ ] Integration Test (authz)
* [ ] E2E Test (via settings PR-033)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (curl)

**Deliverables:**

* Endpoint profil akun

**Out of Scope:**

* Seeker profile karier (PR-037).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] User A tidak bisa baca/ubah user B (test).
* [ ] Validasi email/nama dengan pesan sederhana.
* [ ] Response tanpa field internal (role ver dsb. selektif).
* [ ] Skema zod dipakai FE tanpa duplikasi.
* [ ] Audit perubahan email.

#### Dependencies

* PR-019

#### Risks

* Minim.


### PR-021 - Hapus Akun (Soft Delete + Revoke)

#### Objective

**DELETE /auth/account + Prisma soft-delete middleware.**

Bisnis: hak hapus UU PDP (PRD FR-1.4). Teknis: `deleted_at` + `ver` bump + middleware Prisma menyembunyikan user terhapus dari SEMUA query.

#### Scope

* Endpoint final + middleware global
* Audit penghapusan

#### Technical Notes

**Backend Changes:**

* Prisma middleware soft-delete; users service.

**Frontend Changes:**

* Tidak ada (UI di PR-033).

**Database Changes:**

* Tidak ada.

**API Changes:**

* DELETE /api/v1/auth/account

**Security Considerations:**

* PDP Compliance: hak hapus; revoke semua sesi; audit dengan alasan opsional (tanpa paksaan).

**Testing Checklist:**

* [ ] Unit Test (middleware)
* [ ] Integration Test (lintas modul)
* [ ] E2E Test (di PR-033)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (hapus akun uji)

**Deliverables:**

* Soft delete menyeluruh

**Out of Scope:**

* Hard purge (PR-023); UI (PR-033).

**Rollback Strategy:**

RB-Std; soft delete reversible via support sebelum purge.

#### Acceptance Criteria

* [ ] Pasca-hapus: login ditolak, refresh ditolak.
* [ ] Tidak ada query modul mana pun mengembalikan user terhapus (middleware test lintas modul).
* [ ] Konfirmasi memerlukan re-auth ringan (OTP/relogin) — anti hapus tak sengaja.
* [ ] Audit tercatat.
* [ ] Data menunggu purge ≤ 30 hari (ditandai untuk PR-023).

#### Dependencies

* PR-020

#### Risks

* Query lolos middleware (raw SQL). Mitigasi: konvensi repo + review raw SQL wajib filter deleted.


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

* [ ] Unit Test (agregator)
* [ ] Integration Test (kelengkapan + isolasi)
* [ ] E2E Test (unduh dari settings PR-033)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (inspeksi payload)

**Deliverables:**

* Endpoint ekspor PDP

**Out of Scope:**

* Format arsip ZIP/PDF.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Ekspor memuat: akun, preferensi, profil (termasuk sensitif milik sendiri), CV, lamaran, notifikasi.
* [ ] Tidak ada data pihak lain di payload (test).
* [ ] Ekspor ter-audit.
* [ ] Rate limit bekerja.
* [ ] Format JSON stabil (versioned).

#### Dependencies

* PR-021

#### Risks

* Payload membesar. Mitigasi: streaming JSON bila perlu.


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

* [ ] Unit Test (selector kandidat purge)
* [ ] Integration Test (purge + agregat)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (dry-run di staging)

**Deliverables:**

* Job purge terjadwal

**Out of Scope:**

* Retensi data lain (PR-024).

**Rollback Strategy:**

Restore dari backup harian (PR-104); job dapat di-pause via config.

#### Acceptance Criteria

* [ ] Akun terhapus > 30 hari → data pribadi hilang/dianonimkan (fast-forward test).
* [ ] hired count agregat tidak berubah pasca-purge.
* [ ] Dry-run mode menghasilkan laporan tanpa menghapus.
* [ ] Run ter-audit (jumlah entitas).
* [ ] Gagal purge → alert (hook PR-103).

#### Dependencies

* PR-015
* PR-021

#### Risks

* Purge keliru menghapus data aktif. Mitigasi: dry-run + test agregat + backup harian (PR-104).


### PR-024 - Retention Jobs (match_scores/ai_usage/transkrip/job-expiry)

#### Objective

**Kebijakan retensi SDD §6.4 otomatis (Gap G3).**

Bisnis: minimisasi data (PDP) + kebersihan operasional. Teknis: `maintenance:retention` harian — match_scores 7d, ai_usage 90d (agregat bulanan dipertahankan), transkrip chat 30d pasca-finalize, jobs melewati `expires_at` → auto-close + event.

#### Scope

* Processor retention config-driven
* Agregasi bulanan ai_usage sebelum hapus

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

* [ ] Unit Test (selector per kebijakan)
* [ ] Integration Test (fast-forward)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (dry-run staging)

**Deliverables:**

* Retention otomatis + agregat AI bulanan

**Out of Scope:**

* Arsip audit_logs 2 tahun ke R2 (pasca-MVP, dicatat).

**Rollback Strategy:**

Restore backup; pause via config.

#### Acceptance Criteria

* [ ] Tiap kebijakan teruji dengan clock fast-forward.
* [ ] Job kedaluwarsa → status closed + event `job.closed`.
* [ ] Agregat bulanan ai_usage terbentuk sebelum purge.
* [ ] Config durasi via env (bukan hardcode).
* [ ] Run ter-audit.

#### Dependencies

* PR-015
* PR-011

#### Risks

* Salah durasi menghapus data dibutuhkan. Mitigasi: dry-run default on di staging + backup.


## Exit Criteria

Phase 02 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 9 PR (PR-016..PR-024) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration.
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 03 - Web Platform Base](phase-03-web-platform-base.md)
