---
phase: 1
name: "Foundation"
prs: PR-001..PR-015 (15 PR)
sprint: "1"
depends_on: []
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 01 - Foundation

## Overview

Fondasi monorepo, tooling, database, dan modul core (crypto/audit/queue) yang menjadi prasyarat seluruh phase berikutnya. Tidak ada fitur pengguna di phase ini.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* None (phase pertama)

## Deliverables

* **PR-001** - Monorepo ber-workspace lengkap; Preset config terpusat
* **PR-002** - Preset eslint boundaries + fixtures
* **PR-003** - Pipeline CI aktif + branch protection
* **PR-004** - Paket schemas + OpenAPI pipeline
* **PR-005** - `@nawasena/api-client` siap dipakai web/mobile
* **PR-006** - API bootable dengan fondasi config/logging
* **PR-007** - Middleware core/http lengkap + katalog kode error awal
* **PR-008** - Compose dev lengkap + health endpoints
* **PR-009** - Migrasi 01 + seed admin
* **PR-010** - Migrasi 02
* **PR-011** - Migrasi 03 — skema MVP komplet
* **PR-012** - Seed + fixture terdokumentasi
* **PR-013** - Util crypto teruji + runbook kunci
* **PR-014** - Helper audit + katalog action
* **PR-015** - Queue infra + worker + DLQ observability

## Pull Requests

### PR-001 - Turborepo Workspace & Shared Config

#### Objective

**Inisialisasi monorepo Turborepo + packages/config.**

Bisnis: fondasi agar tim 3–5 engineer bekerja paralel di satu repo. Teknis: workspace pnpm + Turborepo dengan tsconfig/eslint/prettier terpusat (SDD §3).

#### Scope

* `turbo.json`, root `package.json` workspaces
* `packages/config` (tsconfig base, eslint base, prettier)
* Folder kosong `apps/{api,worker,web,mobile}`, `packages/{schemas,api-client,ui,a11y}`
* README struktur repo & cara menjalankan

#### Technical Notes

**Backend Changes:**

* Tidak ada (struktur saja).

**Frontend Changes:**

* Tidak ada (struktur saja).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* `.gitignore` mencakup `.env*` sejak commit pertama (ADR-015).

**Testing Checklist:**

* [x] Unit Test (smoke: typecheck)
* [x] Integration Test (N/A — dicatat)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (clone bersih → install → typecheck)

**Deliverables:**

* Monorepo ber-workspace lengkap
* Preset config terpusat

**Out of Scope:**

* Aturan lint boundaries (PR-002); CI (PR-003); kode aplikasi apa pun.

**Rollback Strategy:**

RB-Std (tanpa migrasi; revert commit cukup).

#### Acceptance Criteria

* [x] `pnpm install && pnpm turbo typecheck` hijau dari clone bersih.
* [x] Semua workspace ter-resolve tanpa error.
* [x] tsconfig strict mode aktif untuk seluruh workspace.
* [x] README menjelaskan struktur & perintah dasar.
* [x] Tidak ada file env/secret ter-commit (cek `.gitignore`).

#### Dependencies

* None

#### Risks

* Salah desain struktur workspace → refactor mahal. Mitigasi: ikuti persis layout SDD §3.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#log-implementasi--pr-001-turborepo-workspace--shared-config).


### PR-002 - Lint Boundaries — Arsitektur sebagai Kode

#### Objective

**Aturan eslint-plugin-boundaries + fixture pelanggaran.**

Bisnis: mencegah erosi arsitektur (risiko T1 SDD §20) tanpa mengandalkan disiplin manual. Teknis: menegakkan `router→controller→service→repo`, larangan import repo lintas modul & SDK AI di luar `core/ai` (SDD §5.1, ADR-002/012).

#### Scope

* Preset boundaries di `packages/config`
* Fixture pelanggaran tiap aturan (bukti gate bekerja)
* Dokumentasi aturan di README config

#### Technical Notes

**Backend Changes:**

* Konvensi folder modul ditetapkan (belum ada modul nyata).

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Aturan "no direct AI SDK import" adalah kontrol keamanan data (mencegah bypass gateway/kuota/privasi).

**Testing Checklist:**

* [x] Unit Test (fixture lint — `__tests__/boundaries.test.ts`, 4 test via ESLint Node API)
* [x] Integration Test (N/A — dicatat)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (eslint dijalankan langsung pada `fixtures/violations/**` → 3 error sesuai ekspektasi)

**Deliverables:**

* Preset eslint boundaries + fixtures

**Out of Scope:**

* CI enforcement (PR-003).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Import repo lintas modul → lint error (fixture `violations/cross-module-repo`, rule `boundaries/element-types`).
* [x] Import SDK AI di luar `core/ai` → lint error (fixture `violations/ai-sdk-outside-core`, rule `boundaries/external`).
* [x] Loncat lapisan (router→repo) → lint error (fixture `violations/layer-jump`, rule `boundaries/element-types`).
* [x] Preset dipakai `apps/api` via extends tunggal (`apps/api/.eslintrc.cjs` = satu baris `require("@nawasena/config/eslint/boundaries")`).
* [x] Dokumentasi aturan tersedia (`packages/config/README.md`: klasifikasi elemen, 3 aturan, escape hatch, cara menjalankan test fixture).

#### Dependencies

* PR-001

#### Risks

* Aturan terlalu ketat menghambat dev. Mitigasi: escape hatch via komentar ber-review + dicatat.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-002--lint-boundaries-arsitektur-sebagai-kode).


### PR-003 - CI Pipeline Dasar (PR Checks)

#### Objective

**GitHub Actions: lint + typecheck + test wajib per PR.**

Bisnis: kualitas tidak bergantung ingatan reviewer. Teknis: workflow PR dengan cache Turborepo; slot job e2e/a11y disiapkan (diaktifkan PR-031) (ADR-016).

#### Scope

* `.github/workflows/pr.yml` (lint, typecheck, unit)
* Branch protection: check wajib
* Cache pnpm + turbo

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Workflow tanpa secrets produksi; permission `contents: read` minimal.

**Testing Checklist:**

* [x] Unit Test (pipeline menjalankan unit suite penuh — termasuk 8 test `@nawasena/config`, bukti fixture boundaries)
* [x] Integration Test (N/A — dicatat)
* [x] E2E Test (slot job `e2e` disiapkan di pr.yml, non-blocking `if: false` — aktif PR-031)
* [x] Accessibility Test (slot job `a11y` disiapkan di pr.yml, non-blocking `if: false` — aktif PR-031)
* [x] Manual Verification (PR uji #1 dibuka → check `lint-typecheck-test` tampil & hijau; slot e2e/a11y tampil skipped; merge terblokir sampai check hijau)

**Deliverables:**

* Pipeline CI aktif + branch protection

**Out of Scope:**

* Build image (PR-099); a11y gate aktif (PR-031); secrets scan (PR-108).

**Rollback Strategy:**

Nonaktifkan required check sementara via settings; revert workflow.

#### Acceptance Criteria

* [x] PR tidak dapat merge tanpa semua check hijau — branch protection aktif di `main`: required check `lint-typecheck-test` (strict), require PR before merge, `enforce_admins: true`.
* [x] Pelanggaran boundaries menggagalkan CI (bukti fixture) — job `lint-typecheck-test` menjalankan `pnpm lint` (boundaries) + `pnpm test` (8 test fixture `@nawasena/config`); keduanya `--max-warnings=0`, pelanggaran = exit ≠ 0 = check merah.
* [x] Cache mempercepat run kedua (< 50% durasi run pertama) — terverifikasi di PR uji #1: step terdampak cache 12s → 3s (25%); job total 26s → 14s (sisa = overhead tetap runner). Turbo cache hit penuh ("replaying logs").
* [x] Workflow permission least-privilege (`permissions: contents: read`; tanpa secrets).
* [x] Status check terdokumentasi di README (tabel check, cara baca kegagalan, langkah branch protection).

#### Dependencies

* PR-001
* PR-002

#### Risks

* Durasi pipeline membengkak seiring repo tumbuh. Mitigasi: turbo cache + sharding disiapkan.

#### Log Implementasi

* 2026-07-18 — Selesai; seluruh AC terverifikasi (termasuk cache & merge-block via PR uji #1). Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-003--ci-pipeline-dasar-pr-checks).


### PR-004 - packages/schemas + OpenAPI Generator

#### Objective

**Kontrak zod tunggal + generate openapi.json dari zod.**

Bisnis: FE/BE/mobile paralel tanpa saling tunggu (kontrak dulu). Teknis: `packages/schemas` per domain + `zod-openapi`; drift kontrak = CI merah (SDD §11, G6).

#### Scope

* Skeleton schemas per domain (auth, profiles, jobs, dst. — kosong berisi contoh)
* Generator `scripts/gen-openapi.ts` + check diff di CI
* Konvensi penamaan skema

#### Technical Notes

**Backend Changes:**

* Tidak ada (paket bersama).

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (fondasi kontrak).

**Security Considerations:**

* Input Validation: skema zod adalah lapisan validasi tunggal FE+BE — mencegah drift validasi.

**Testing Checklist:**

* [x] Unit Test (skema contoh valid/invalid — 9 test: parse valid, pesan error Indonesia, type-level via expectTypeOf)
* [x] Integration Test (guard: openapi.json ter-commit dibandingkan byte-per-byte dengan hasil generate di unit test)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (validasi `redocly lint`: 0 error; struktur paths/components diinspeksi — setara buka di Swagger viewer)

**Deliverables:**

* Paket schemas + OpenAPI pipeline

**Out of Scope:**

* Skema domain lengkap (diisi per PR fitur).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] 1 skema contoh dipakai end-to-end (type + runtime) — `requestOtpSchema`: runtime `parse` + tipe `RequestOtp` via `z.infer` (diuji `expectTypeOf`), tampil di openapi.json sebagai component `RequestOtp` + path `/auth/otp/request`.
* [x] `openapi.json` ter-generate deterministik di CI — tanpa timestamp, `CONTRACT_VERSION` di-pin; test determinisme (2× generate byte identik); step CI `check:openapi`.
* [x] Perubahan skema tanpa regenerate → CI merah (diff check) — mode `--check` exit 1 (dibuktikan lokal dengan openapi.json dimodifikasi); step "OpenAPI drift check" di pr.yml.
* [x] Konvensi penamaan terdokumentasi — `packages/schemas/README.md` (tabel konvensi + aturan tambahan + alur tambah skema).
* [x] Paket ter-typecheck strict — `tsc --noEmit` hijau (preset node strict, termasuk scripts & tests).

#### Dependencies

* PR-001

#### Risks

* Skema jadi bottleneck kepemilikan. Mitigasi: PR skema kecil terpisah per kebutuhan.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-004--packagesschemas--openapi-generator).


### PR-005 - packages/api-client

#### Objective

**Typed API client (fetch + TanStack helpers) dari kontrak zod.**

Bisnis: konsistensi perilaku web & mobile. Teknis: client dengan auth header, parse envelope, hook point refresh 401 (ADR-014).

#### Scope

* Base client + interceptor 401→refresh (stub sampai PR-018)
* Helper `queryKey [domain, params]`
* 1 endpoint contoh terhubung skema PR-004

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada (paket bersama).

**Mobile Changes:**

* Paket ini dipakai mobile tanpa perubahan (dipastikan tanpa dependensi DOM).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Token tidak pernah di-log; penyimpanan token di luar paket (web cookie / mobile SecureStore).

**Testing Checklist:**

* [x] Unit Test (parse, retry, error mapping — 16 test: envelope→ApiError, 401→refresh→retry tanpa loop, JARINGAN_GAGAL/RESPONS_TIDAK_DIKENAL, queryKey deterministik)
* [x] Integration Test (mock server via fetch injection — jsonResponse stub; tanpa DOM/msw)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (contoh `requestOtp` dipanggil dari script tsx dengan fetch stub — sukses + validasi klien menolak input buruk)

**Deliverables:**

* `@nawasena/api-client` siap dipakai web/mobile

**Out of Scope:**

* Implementasi refresh nyata (PR-018).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Envelope error terpetakan ke tipe TS `{code,message,hint}` — class `ApiError` membawa `ErrorEnvelope` + `status`; body tak dikenal → `RESPONS_TIDAK_DIKENAL` (teks mentah server tidak diteruskan).
* [x] 401 → satu kali refresh → retry (mock) — hook `refresh()` dipanggil sekali, retry sekali dengan token terbaru dari `getAccessToken()`; 401 kedua tidak loop; default stub menolak (implementasi nyata PR-018).
* [x] Tidak ada dependensi DOM (jalan di RN) — fetch injectable (default `globalThis.fetch`); bundle test assert tidak ada `document/window/localStorage/XMLHttpRequest`; suite jalan di environment node polos.
* [x] Query key convention terdokumentasi — `[domain, params]` (params dinormalisasi deterministik) + factory `authKeys`; README paket.
* [x] Tree-shakeable (bundle test) — `sideEffects: false`; test esbuild: impor `queryKey` saja → bundle tanpa client/endpoint/zod.

#### Dependencies

* PR-004

#### Risks

* Abstraksi berlebih. Mitigasi: hanya wrap fetch + envelope, tanpa magic.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-005--packagesapi-client).


### PR-006 - API Bootstrap — core/config + core/logger

#### Objective

**Express boot: env zod fail-fast + pino JSON + redaction.**

Bisnis: kegagalan konfigurasi ketahuan saat deploy, bukan saat user memakai. Teknis: `core/config` (parse env zod), `core/logger` (pino, requestId, redaction list awal) (SDD §5.1, ADR-002).

#### Scope

* `apps/api/src/server.ts` start/stop bersih
* `core/config`: skema env + fail-fast
* `core/logger`: pino + redaction + requestId binding

#### Technical Notes

**Backend Changes:**

* Bootstrap Express + dua modul core pertama.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Redaction: daftar kunci sensitif (authorization, otp, field_key, dsb.) tidak pernah ter-log.
* Fail-fast mencegah boot dengan kunci enkripsi kosong.

**Testing Checklist:**

* [x] Unit Test (config parse, redaction — 21 test: fail-fast per variabel, default, coerce PORT, 10 field redaction + nested + non-sensitif tak ter-redact)
* [x] Integration Test (boot + shutdown — 5 test: HTTP nyata port ephemeral, requestId per baris, redaction end-to-end header nyata, SIGTERM/SIGINT via emit, stop idempotent)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (boot env kosong → exit 1 + pesan menyebut DATABASE_URL/REDIS_URL; boot env valid → "API siap menerima koneksi" bootMs=8)

**Deliverables:**

* API bootable dengan fondasi config/logging

**Out of Scope:**

* Error envelope & middleware HTTP (PR-007).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Env wajib kosong → exit code ≠ 0 dengan pesan variabel mana yang hilang — `EnvError` mendaftar `[variabel, alasan]`; entry point cetak + exit 1 (diverifikasi manual: exit 1, pesan menyebut DATABASE_URL & REDIS_URL + rujukan .env.example).
* [x] Log JSON memuat requestId di setiap baris request-scoped — pino-http `genReqId` uuid v4; test integration: 2 request → 2 requestId berbeda, semua baris request-scoped ber-requestId.
* [x] Redaction test: nilai secret tidak muncul di output — deny list 10 kunci (authorization, cookie, otp, password, token, accessToken, refreshToken, fieldKey, apiKey, secret) level atas + bersarang + header req; diuji unit & end-to-end (header Authorization request nyata tidak menyentuh log).
* [x] Graceful shutdown (SIGTERM) menutup server bersih — `registerShutdownHooks` (SIGTERM/SIGINT, anti-double-stop, exit 0/1); diuji via `process.emit`. Catatan: kill di Windows dev = hard-terminate (sinyal POSIX tidak sampai — keterbatasan OS, bukan kode); efektif di Linux/Docker target deploy.
* [x] Boot < 3 detik di dev — diukur di test integration (< 3000ms); boot manual nyata: bootMs=8.

#### Dependencies

* PR-001
* PR-002

#### Risks

* Redaction list tidak lengkap. Mitigasi: deny-by-default untuk kunci baru bermuatan credential + review PR-013/014.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-006--api-bootstrap--coreconfig--corelogger).


### PR-007 - core/http — Envelope, asyncHandler, Helmet, Rate Limit Global

#### Objective

**Fondasi HTTP aman & respons konsisten.**

Bisnis: pesan error ramah pengguna disabilitas (dibaca screen reader). Teknis: error handler global `{code,message,hint}`, `asyncHandler`, helmet dasar, CORS, rate limit global per IP (SDD §5.3, §8.4).

#### Scope

* Error handler global + mapping error → envelope
* `asyncHandler` + notFound handler
* helmet + CORS whitelist + express-rate-limit (Redis store menyusul PR-008)

#### Technical Notes

**Backend Changes:**

* Middleware stack baku untuk seluruh modul.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konvensi respons).

**Security Considerations:**

* Input Validation: helper `validate(schema)` untuk body/query/params.
* Rate Limiting global; stack error tidak pernah bocor ke response.

**Testing Checklist:**

* [x] Unit Test (mapper error — katalog lolos errorCodeSchema, status/message/hint terisi, inline snapshot, AppError override, asyncHandler → next)
* [x] Integration Test (throw async → envelope 500 tanpa bocor + proses hidup; 429 + Retry-After; validate body/query; JSON rusak → 400; 404; helmet snapshot; CORS whitelist vs asing; requestId di baris error)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — pesan diuji di FE)
* [x] Manual Verification (curl: 404, JSON rusak, 429 ber-Retry-After, headers helmet — semua envelope katalog)

**Deliverables:**

* Middleware core/http lengkap + katalog kode error awal

**Out of Scope:**

* CSP final & limit per endpoint (PR-105); rate limit OTP khusus (PR-016).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Error async tertangkap → envelope (tidak crash proses) — `asyncHandler` → error handler global; test: setelah 500, request berikutnya tetap dilayani.
* [x] `message` semua error teruji berbahasa Indonesia sederhana (katalog kode error) — `ERROR_CATALOG` terpusat 7 kode (+`TIDAK_TERAUTENTIKASI` 401, `TIDAK_BERHAK` 403 sesuai review); test: format kode via `errorCodeSchema`, message+hint wajib terisi, inline snapshot agar perubahan pesan selalu ke-review.
* [x] 429 dikembalikan dengan `Retry-After` — handler kustom express-rate-limit → envelope + header; diuji integration & curl.
* [x] Stack trace hanya ke logger, tidak ke klien — test: response 500 tidak memuat pesan internal, baris log error memuatnya + ber-requestId.
* [x] Security headers dasar terpasang (helmet snapshot) — inline snapshot: nosniff, frame DENY, referrer-policy, CORP, tanpa x-powered-by. CSP ketat & HSTS sengaja off (PR-105 / urusan edge).

#### Dependencies

* PR-006

#### Risks

* Katalog kode error tidak disiplin. Mitigasi: enum kode terpusat, lint penggunaan string literal.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-007--corehttp--envelope-asynchandler-helmet-rate-limit-global).


### PR-008 - Docker Compose Dev + Health Endpoints

#### Objective

**Lingkungan dev satu perintah: Postgres18+pgvector, Redis 2-DB, API.**

Bisnis: onboarding engineer < 1 jam. Teknis: compose dev + init pgvector + dua koneksi Redis (cache LRU vs queue non-evict) + `/healthz` `/readyz` (ADR-004/006).

#### Scope

* `docker-compose.dev.yml` + `apps/api/Dockerfile` (dev target)
* `infra/pg-init.sql` (CREATE EXTENSION vector)
* Redis config dua DB index; klien terpisah
* Endpoint health (liveness) & ready (ping DB+Redis)

#### Technical Notes

**Backend Changes:**

* Koneksi Prisma placeholder + Redis clients; health router.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Ekstensi `vector` aktif di container dev.

**API Changes:**

* GET /healthz
* GET /readyz

**Security Considerations:**

* Kredensial dev-only di compose; `.env.example` tanpa nilai rahasia.

**Testing Checklist:**

* [x] Unit Test (health handler — liveness tanpa dependensi; readiness siap hanya bila semua ok; detail per dependensi; ping menggantung → timeout 2s)
* [x] Integration Test (readyz vs dependensi mati — endpoint nyata dengan DB/Redis menunjuk port mati → 503 `BELUM_SIAP`; /healthz tetap 200)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (compose up dari nol: `down -v` → `up --build` → 4 container healthy; readyz 503 saat redis-cache di-stop lalu pulih 200; hot-reload; `docker stop` graceful)

**Deliverables:**

* Compose dev lengkap + health endpoints

**Out of Scope:**

* Compose prod/staging (PR-097).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] `docker compose up` → API sehat dalam satu perintah di mesin bersih — diverifikasi dari nol (`down -v`): postgres+redis-cache+redis-queue+api semua healthy; API menunggu dependensi via `depends_on: service_healthy`.
* [x] `/readyz` gagal bila Redis/DB mati (diuji) — integration test (dependensi port mati → 503 `BELUM_SIAP`) + manual (`docker stop redis-cache` → 503; start lagi → 200).
* [x] DB cache Redis ber-`maxmemory allkeys-lru`; DB queue tanpa eviction (assert config) — `config get` di kedua container: cache `allkeys-lru` + maxmemory 200mb; queue `noeviction` + AOF. **Catatan: dua service Redis, bukan dua DB index — ADR-004 direvisi atas persetujuan owner (kebijakan eviction Redis per instance, BullMQ wajib noeviction).**
* [x] Hot-reload API bekerja di dev — `CHOKIDAR_USEPOLLING` (bind mount NTFS tidak meneruskan inotify); edit file → restart otomatis terverifikasi di log.
* [x] pgvector tersedia — `SELECT '[1,2,3]'::vector` sukses; ekstensi `vector` + `pg_trgm` terpasang via pg-init.sql. (Catatan: `'[]'::vector` literal AC ditolak pgvector by design — vektor minimal 1 dimensi; penolakan ini justru bukti ekstensi aktif.)

#### Dependencies

* PR-006
* PR-007

#### Risks

* Perbedaan versi image dev vs prod. Mitigasi: pin versi image sama dengan target prod.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-008--docker-compose-dev--health-endpoints).


### PR-009 - Migrasi Inti Identitas

#### Objective

**Tabel users, refresh_tokens, accessibility_profiles, audit_logs.**

Bisnis: fondasi akun & jejak audit sejak hari pertama (UU PDP). Teknis: Prisma init + migrasi pertama (uuid v7, timestamptz, enum role, BRIN audit) (SDD §6, §14).

#### Scope

* `schema.prisma` awal + migrasi 01
* Seed admin pertama
* Konvensi migrasi (raw SQL untuk fitur non-Prisma)

#### Technical Notes

**Backend Changes:**

* Prisma client ter-generate; helper uuid v7.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tabel: `users` (role enum, soft-delete `deleted_at`, unique phone/google_id), `refresh_tokens` (hash, family), `accessibility_profiles`, `audit_logs` (append-only).
* Indeks: BRIN `audit_logs.created_at`; unique parsial users aktif.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Audit table append-only (tanpa UPDATE grant di role aplikasi — dicatat untuk PR-097).
* Soft delete sebagai fondasi hak hapus PDP.

**Testing Checklist:**

* [x] Unit Test (helper uuid v7 — format RFC 9562, 1000 unik, sortable antar-ms, encoding timestamp)
* [x] Integration Test (migrate up/down, constraint — unique parsial aktif+reuse setelah soft-delete, enum menolak nilai liar, timestamptz via information_schema, indeks BRIN/parsial ada, FK CASCADE refresh_tokens, seed idempotent; skip otomatis bila DB tidak terjangkau)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (psql `\d users`: unique parsial + FK CASCADE + timestamptz terlihat; enum_range Role = seeker,admin,employer; down.sql diuji up→down→up nyata)

**Deliverables:**

* Migrasi 01 + seed admin

**Out of Scope:**

* Tabel domain seeker (PR-010) & marketplace (PR-011).

**Rollback Strategy:**

Migrasi down teruji; RB-Std untuk kode.

#### Acceptance Criteria

* [x] `prisma migrate reset` + seed hijau di CI (Postgres service) — pr.yml + service `pgvector/pgvector:pg18` (image sama compose dev) + step `migrate reset --force` (menjalankan migrasi dari nol + seed) sebelum unit test.
* [x] Enum role = `seeker|admin|employer` (employer reserved) — enum native; test menolak nilai di luar enum; psql `enum_range` terverifikasi.
* [x] Semua timestamp `timestamptz`; PK uuid v7 (sortable) — `@db.Timestamptz(6)` seluruh kolom `*_at` (diuji via information_schema); uuid v7 di-generate aplikasi (`core/ids`, RFC 9562, sortable teruji).
* [x] Constraint unique diuji (duplikat ditolak) — duplikat phone aktif → P2002; phone sama setelah soft-delete → boleh (unique parsial, dikonfirmasi owner).
* [x] Migrasi memiliki down yang teruji — `down.sql` manual per folder migrasi (konvensi didokumentasikan di prisma/README.md); diuji nyata up→down (4 tabel hilang)→up (pulih).

#### Dependencies

* PR-008

#### Risks

* Salah desain enum/kolom awal → migrasi berantai. Mitigasi: ikuti SDD §6 verbatim.

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-009--migrasi-inti-identitas).


### PR-010 - Migrasi Domain Seeker

#### Objective

**seeker_profiles (sensitif bytea + vector) + experiences/educations/skills + resumes.**

Bisnis: menampung profil pencari kerja termasuk data disabilitas secara aman. Teknis: kolom sensitif `bytea` (ciphertext), `profile_embedding vector(768)` + HNSW (SDD §6.2).

#### Scope

* Migrasi 02: 5 tabel + FK CASCADE dari users
* Raw SQL kolom vector + indeks HNSW

#### Technical Notes

**Backend Changes:**

* Model Prisma + tipe `Unsupported("vector")` terdokumentasi.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* `seeker_profiles` (disability_types/accommodation_needs `bytea` NULL, disclosure_default enum, consent_sensitive_at, profile_embedding vector(768)), `experiences`, `educations`, `skills`, `resumes` (content jsonb, created_via enum).
* Indeks HNSW `profile_embedding`.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Sensitive Data: tidak ada kolom sensitif bertipe text/jsonb plaintext (assert di test).

**Testing Checklist:**

* [x] Unit Test (N/A — logika murni DB, diuji integration)
* [x] Integration Test (migrate, bytea introspeksi, vector roundtrip 768-dim, EXPLAIN HNSW via $transaction, FK CASCADE 5 tabel, enum DisclosureDefault; skip anggun tanpa DB)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (psql: `\d seeker_profiles` — tipe bytea, vector(768), index HNSW terlihat)

**Deliverables:**

* Migrasi 02

**Out of Scope:**

* Logika enkripsi (PR-013/037).

**Rollback Strategy:**

Migrasi down; RB-Std.

#### Acceptance Criteria

* [x] Kolom sensitif bertipe bytea (introspeksi otomatis di test) — `disability_types`/`accommodation_needs` = `bytea` diuji via information_schema; assert negatif: tidak ada kolom nama-sensitif bertipe text/jsonb.
* [x] Insert/select vector via raw SQL ber-parameter sukses — embedding 768-dim (0.1 semua), cosine self-distance < 1e-6.
* [x] EXPLAIN query cosine memakai HNSW — `SET LOCAL enable_seqscan=off` + EXPLAIN dalam `$transaction` (single statement per prepared statement); plan memuat "hnsw|index".
* [x] FK CASCADE dari users terverifikasi — delete user → seeker_profile + experience + skill + resume hilang semua.
* [x] Migrasi down teruji — up→down (5 tabel + 2 enum hilang)→up (pulih), nyata terhadap Postgres compose.

#### Dependencies

* PR-009

#### Risks

* Prisma vs vector friction. Mitigasi: seluruh akses vector via repo matching (raw SQL terkurung).

#### Log Implementasi

* 2026-07-18 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-010--migrasi-domain-seeker).


### PR-011 - Migrasi Domain Marketplace

#### Objective

**companies, jobs, applications, match_scores, ai_usage, notifications, sign_videos + indeks penuh.**

Bisnis: menampung katalog lowongan, lamaran, dan kamus BISINDO. Teknis: sisa skema MVP + seluruh indeks SDD §6.3 (FTS indonesian, pg_trgm, GIN jsonb, HNSW job, partial unread).

#### Scope

* Migrasi 03: 7 tabel + raw SQL indeks
* FK applications→jobs RESTRICT (riwayat tak hilang)

#### Technical Notes

**Backend Changes:**

* Model Prisma lengkap MVP (kecuali devices & ai_chat_sessions — inkremental, G7).

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* `companies` (inclusivity_status enum, accommodations jsonb), `jobs` (work_mode enum, accommodations jsonb, welcomed_disability_types[], status enum, job_embedding vector(768), expires_at), `applications` (unique user+job, disclose_disability bool, status enum, status_history jsonb, hired_confirmed_at), `match_scores` (PK komposit), `ai_usage`, `notifications`, `sign_videos`.
* Indeks: GIN FTS jobs(title+description), GIN pg_trgm title, GIN accommodations jsonb_path_ops, HNSW job_embedding, partial notifications unread, btree per SDD §6.3.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Unique (user_id, job_id) = fondasi idempotensi apply (mencegah duplikasi via race).

**Testing Checklist:**

* [x] Unit Test (N/A — murni DB, diuji integration)
* [x] Integration Test (EXPLAIN 3 indeks, race unique paralel, RESTRICT vs Cascade kontras, enum snapshot, partial index unread)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (psql: FK applications RESTRICT/CASCADE/NO ACTION terlihat; 6 indeks jobs)

**Deliverables:**

* Migrasi 03 — skema MVP komplet

**Out of Scope:**

* Tabel devices (PR-048), ai_chat_sessions (PR-065), suspended_at (PR-083).

**Rollback Strategy:**

Migrasi down; RB-Std.

#### Acceptance Criteria

* [x] EXPLAIN FTS & trigram & vector memakai indeks masing-masing (bukti di PR) — `jobs_fts_gin` (plainto_tsquery indonesian), `jobs_title_trgm` (operator `%`), `jobs_embedding_hnsw` (`<=>` LIMIT) — ketiganya via `$transaction` + seqscan off.
* [x] Unique apply ditegakkan pada insert paralel (test race) — 2× create `Promise.allSettled` → tepat 1 sukses + 1 P2002.
* [x] Delete jobs dengan lamaran → ditolak (RESTRICT) — diuji + kontras: delete USER → application ikut Cascade (hak hapus PDP). Catatan: pelanggaran RESTRICT = SQLSTATE 23001 (Prisma tidak memetakan ke P2003 — assert perilaku ditolak & baris utuh).
* [x] Seluruh enum sesuai SDD (snapshot skema) — 8 enum via pg_enum → inline snapshot.
* [x] Migrasi down teruji — up→down (7 tabel + 8 enum hilang)→up (pulih) + full `migrate reset` 01→02→03+seed hijau.

#### Dependencies

* PR-010

#### Risks

* Konfigurasi FTS bahasa Indonesia terbatas. Mitigasi: config 'indonesian' + trigram sebagai penyelamat typo (ADR-018). (Verifikasi PR-011: config `indonesian` TERSEDIA di image pgvector/pg18 — risiko tidak terwujud.)

#### Log Implementasi

* 2026-07-19 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-011--migrasi-domain-marketplace).


### PR-012 - Seed Data Dev & Fixture E2E

#### Objective

**Seed deterministik: 3 persona, 5 companies, 20 jobs, lamaran contoh.**

Bisnis: demo & E2E memakai data yang mencerminkan persona PRD §4. Teknis: seed idempotent (faker seeded) untuk dev/CI.

#### Scope

* `seed.ts` idempotent
* Fixture ID stabil untuk E2E

#### Technical Notes

**Backend Changes:**

* Skrip seed.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Data seed (bukan skema).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Data sensitif seed = dummy jelas (bukan data riil); tidak dipakai di produksi (guard env).

**Testing Checklist:**

* [x] Unit Test (N/A — guard produksi diuji tanpa DB di suite integration)
* [x] Integration Test (idempotensi — seed 2× jumlah identik; variasi jobs; persona; kolom sensitif NULL; North Star)
* [x] E2E Test (fixture siap dipakai smoke — E2E sendiri aktif PR-031; ID stabil terdokumentasi FIXTURES.md)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (db:reset penuh + inspeksi psql: 5 users, 20 jobs variasi, lamaran hired ber-hired_confirmed_at)

**Deliverables:**

* Seed + fixture terdokumentasi

**Out of Scope:**

* Data pilot produksi (kurasi admin nyata).

**Rollback Strategy:**

RB-Std (data dev saja).

#### Acceptance Criteria

* [x] Seed 2× tidak menghasilkan duplikat — upsert by fixture ID; test: jumlah baris identik setelah run kedua.
* [x] 20 jobs mencakup variasi akomodasi/work_mode untuk test matching — 3 work_mode, 6 jenis akomodasi, draft+closed+published, welcomed_disability_types sebagian terisi; relevansi per persona (FIXTURES.md).
* [x] Persona selaras PRD §4 (Tuli/Netra/Daksa/Autisme) — 4 persona (Rina/Bayu/Sari/Dimas) + accessibility_profile sesuai kebutuhan masing-masing (diuji). Catatan: Objective menulis "3 persona", AC menulis 4 — AC yang diikuti.
* [x] Seed gagal di env production (guard) — `SeedProductionError` dilempar SEBELUM query DB apa pun (diuji dengan client palsu).
* [x] ID fixture stabil terdokumentasi — `prisma/fixtures.ts` (konstanta) + `prisma/FIXTURES.md` (blok ID, aturan jangan-ubah, tabel persona/jobs/applications).

#### Dependencies

* PR-011

#### Risks

* Seed drift dari skema. Mitigasi: seed dijalankan di CI setiap PR migrasi. (Aktif sejak PR-009: `migrate reset` CI menjalankan seed setiap run.)

#### Log Implementasi

* 2026-07-19 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-012--seed-data-dev--fixture-e2e).


### PR-013 - core/crypto — AES-256-GCM Berversi

#### Objective

**encryptField/decryptField + rotasi kunci berversi.**

Bisnis: data disabilitas (data spesifik UU PDP) aman meski DB/backup bocor (PRD §12, R4). Teknis: AES-256-GCM `versi‖iv‖tag‖data`, kunci env `FIELD_KEY_Vn`, dekripsi multi-versi (ADR-007).

#### Scope

* Util crypto + tipe `EncryptedField`
* Validasi kunci saat boot (panjang, format)
* `docs/runbook-keys.md` (rotasi)

#### Technical Notes

**Backend Changes:**

* `core/crypto` dipakai modul profiles nanti.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Encryption: GCM authenticated; kunci tidak pernah menyentuh DB/log (redaction PR-006).
* Rotasi: multi-versi tanpa downtime.

**Testing Checklist:**

* [x] Unit Test (vectors, tamper, multi-versi — `__tests__/crypto.test.ts`: test vector format biner beku, round-trip UTF-8/JSON, IV unik, rotasi V1→V2, tamper per segmen + truncation di semua panjang + append → selalu `DekripsiError`, `parseFieldKeys` validasi panjang/base64/versi)
* [x] Integration Test (boot validation — `__tests__/crypto-boot.test.ts`: entry point nyata via child process; kunci hilang/salah panjang → exit ≠ 0 SEBELUM "API siap"; kunci valid → server listen; material kunci tak muncul di stdout/stderr; redaction `fieldKey`)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — dicatat)
* [x] Manual Verification (rotasi kunci di dev via tsx: encrypt V1 → tambah V2 aktif → data V1 tetap terbaca, enkripsi baru = V2, retire V1 → `DekripsiError` terkontrol)

**Deliverables:**

* Util crypto teruji + runbook kunci

**Out of Scope:**

* Pemakaian di profiles (PR-037); enkripsi backup (PR-104).

**Rollback Strategy:**

RB-Std; data terenkripsi versi lama tetap terbaca (multi-versi by design).

#### Acceptance Criteria

* [x] Round-trip lintas versi kunci lulus test vector — grup "rotasi multi-versi": data V1 tetap terbaca setelah V2 aktif; enkripsi baru pakai V2; format biner `[versi][iv][tag][data]` dikunci test (byte versi, panjang segmen).
* [x] Ciphertext dimodifikasi → error autentikasi (bukan data korup) — tamper 1 bit per segmen (iv/tag/data), versi tak dikenal, **truncation di SEMUA panjang 0..len-1**, dan append byte → semuanya `DekripsiError`; tidak pernah mengembalikan plaintext korup.
* [x] Boot gagal bila kunci salah panjang/format — `parseFieldKeys` fail-fast di `apps/api/src/index.ts` SEBELUM logger/DB/Redis/listener; diuji unit + integration child-process (exit ≠ 0, server tak start).
* [x] Kunci tidak muncul di log (test redaction) — `core/crypto` tidak menyentuh logger (lapisan pertama); deny list `fieldKey` (PR-006) me-redaksi bila material kunci masuk objek log (diuji); boot test asсерt material kunci absen dari stdout/stderr.
* [x] Runbook rotasi tersedia & direview — `docs/runbook-keys.md` (konsep, generate, rotasi, retire, kompromi, verifikasi, DR/ADR-015, troubleshooting).

#### Dependencies

* PR-006

#### Risks

* Kunci bocor via env (T8). Mitigasi: ADR-015 (chmod 600, password manager, redaction).

#### Log Implementasi

* 2026-07-21 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-013--corecrypto--aes-256-gcm-berversi).


### PR-014 - core/audit — Audit Logging Helper

#### Objective

**auditLog() append-only + strip PII by schema.**

Bisnis: setiap akses data sensitif dapat dipertanggungjawabkan (SDD §8.3, PDP). Teknis: helper terpusat + enum action + writer async non-blocking.

#### Scope

* `auditLog(actor, action, entity, entityId, meta)`
* Skema meta per action (PII di-strip)
* Enum action terpusat

#### Technical Notes

**Backend Changes:**

* `core/audit` siap dipakai semua modul.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (tabel di PR-009).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Audit Logging: wajib untuk akses sensitif, perubahan status, aksi admin (dipetakan per modul di PR terkait).
* Meta tidak pernah memuat nilai field sensitif (schema-enforced).

**Testing Checklist:**

* [x] Unit Test (strip meta per action + writer failure + latency)
* [x] Integration Test (baris tertulis ke PostgreSQL nyata)
* [x] E2E Test (N/A — tidak ada endpoint/flow pengguna)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [x] Manual Verification (inspeksi baris via integration test)

**Deliverables:**

* Helper audit + katalog action

**Out of Scope:**

* Pemetaan audit per modul (di PR modul); arsip 2 tahun (PR-024 hook).

> Status: seluruh acceptance criteria PR-014 terpenuhi. Verifikasi stripping PII dilakukan per action pada unit test dan dicatat di log implementasi.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Meta dengan PII → di-strip (test per skema action).
* [x] Penulisan async tidak memblokir request (latency test).
* [x] Kegagalan tulis audit ter-log + metrik (tidak senyap).
* [x] Enum action terdokumentasi.
* [x] Baris audit memuat actor, entity, entityId, requestId.

#### Dependencies

* PR-009

#### Risks

* Audit terlalu bising. Mitigasi: katalog action ditinjau; baca massal via job bukan per-row.

#### Log Implementasi

* 2026-07-24 — Selesai. Lihat [log/implementation_log_phase01.md](log/implementation_log_phase01.md#pr-014--coreaudit--audit-logging-helper).


### PR-015 - core/queue + Worker Bootstrap + DLQ

#### Objective

**BullMQ registry, apps/worker, retry/timeout/DLQ per SDD §16.**

Bisnis: semua kerja berat (AI, PDF, notif) tidak mengganggu responsivitas API. Teknis: registry queue config-driven, job-id deterministik, DLQ + endpoint internal (ADR-004).

#### Scope

* `core/queue` (definisi + enqueue helper)
* `apps/worker` bootstrap + graceful shutdown (drain)
* DLQ handler + `GET /internal/queues`

#### Technical Notes

**Backend Changes:**

* Infrastruktur queue lengkap; worker service di compose dev.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /internal/queues (auth internal)

**Security Considerations:**

* Endpoint internal dilindungi (network internal + token internal); payload job tanpa PII bila memungkinkan (ID reference, bukan data).

**Testing Checklist:**

* [x] Unit Test (enqueue helper — 25 test `queue.test.ts` PR-015a; 17 test worker/DLQ `queue-worker.test.ts` + 11 test endpoint `internal-queues.test.ts` PR-015b)
* [x] Integration Test (retry, backoff, DLQ, drain — Redis nyata di CI; `queue-redis.test.ts`, 5 test, service `redis-queue` ditambahkan ke `pr.yml`)
* [x] E2E Test (N/A — dicatat)
* [x] Accessibility Test (N/A — tidak ada perubahan frontend)
* [ ] Manual Verification (kill worker saat job jalan) — **belum**: Docker Desktop tidak berjalan di mesin dev saat PR-015b dikerjakan. Perilaku drain terbukti lewat integration test (job aktif diselesaikan sebelum `drain()` resolve), tetapi `docker stop` pada worker nyata belum dicoba.

**Deliverables:**

* Queue infra + worker + DLQ observability

**Out of Scope:**

* Processor fitur (PR terkait); alert DLQ (PR-103).
* Redis store `express-rate-limit` — utang PR-008 yang catatannya menunjuk "PR-010" (penomoran basi; wiring BullMQ sebenarnya PR-015). Tidak ada di Scope PR-015, jadi tetap ditunda dan dicatat sebagai follow-up.

**Rollback Strategy:**

RB-Std; antrean in-flight aman karena idempotensi.

> **Dipecah jadi dua PR (persetujuan owner 2026-07-27):** scope utuh ~800–900 LOC, jauh di atas target <500.
> **PR-015a** — `core/queue` (definisi + config env + enqueue helper) — *selesai*.
> **PR-015b** — `apps/worker` bootstrap + drain, DLQ handler, `GET /internal/queues`, Redis di CI, integration test — *selesai*.

#### Acceptance Criteria

* [x] Job dengan job-id sama tidak diproses dua kali — `buildJobId()` deterministik + `jobId` sebagai kunci anti-duplikat BullMQ. Dibuktikan integration test dengan Redis & worker nyata: 3× enqueue jobId sama → processor hanya menerima job pertama.
* [x] Job gagal-final masuk DLQ & terlihat di endpoint — `createDlqHandler` hanya menulis saat `attemptsMade >= attempts` (job yang masih punya sisa retry diabaikan); catatan masuk `<queue>:dlq` dan muncul sebagai `dlqDepth`/`dlqTotal` di `GET /internal/queues`. Diuji unit + integration (retry berjalan 2×, DLQ menerima tepat 1 catatan).
* [x] removeOnComplete/Fail sesuai SDD §16 — `QUEUE_RETENTION` (100/1000) melekat pada seluruh 8 queue via `jobOptionsFor()`; diuji per queue (unit) dan diverifikasi terpasang nyata di Redis (integration).
* [x] Shutdown drain job aktif (tidak terpotong) — `runtime.drain()` memanggil `worker.close()` tanpa argumen (graceful; `close(true)` yang memotong paksa sengaja tidak dipakai). Integration test: job 1,5 detik masih berjalan saat drain dimulai, dan sudah selesai setelah `drain()` resolve.
* [x] Config queue (concurrency/retry/timeout) dari env/config, bukan hardcode — default = tabel SDD §16, setiap field bisa ditimpa `QUEUE_<NAMA>_<FIELD>`; override tidak valid → `EnvError` fail-fast (diuji: default, override parsial, non-angka, di luar rentang, multi-error). Worker mengambil concurrency & timeout dari config yang sama (diverifikasi dengan BullMQ nyata).

#### Dependencies

* PR-008

#### Risks

* Kehilangan job saat Redis crash. Mitigasi: semua job idempotent + re-enqueue dari state DB (SDD §16).


## Exit Criteria

Phase 01 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 15 PR (PR-001..PR-015) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration.
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 02 - Authentication & Account](phase-02-authentication-account.md)
