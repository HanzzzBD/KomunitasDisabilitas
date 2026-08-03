---
phase: 16
name: "Infrastructure & Observability"
prs: PR-096..PR-104 (9 PR)
sprint: "2-5"
depends_on: [1, 9]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 16 - Infrastructure & Observability

## Overview

Infrastruktur produksi: provisioning VPS, compose prod/staging terisolasi, edge nginx/CF, CI/CD GHCR ke staging/prod dengan rollback, Sentry, Uptime Kuma+metrics+alerts, backup+restore drill.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 09 - Resume Builder & PDF](phase-09-resume-builder-pdf.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-096** - Skrip provision + runbook
* **PR-097** - Topologi runtime dua environment
* **PR-098** - Edge produksi-ready
* **PR-099** - Pipeline artefak rilis
* **PR-100** - CD staging otomatis
* **PR-101** - Jalur rilis produksi
* **PR-102** - Observability error end-to-end
* **PR-103** - Monitoring + alerting hidup
* **PR-104** - Backup teruji + runbook DR (RTO ≤ 4 jam)

## Pull Requests

### PR-096 - provision.sh + Hardening VPS

#### Objective

**Provisioning idempotent + hardening (ufw, fail2ban, SSH key-only).**

Bisnis: DR RTO ≤ 4 jam & VPS reproducible (SDD §9.1, T3). Teknis: skrip idempotent (Docker, ufw 80/443/SSH, fail2ban, unattended-upgrades, deploy user non-root).

#### Scope

* `infra/provision.sh` + `docs/runbook-vps.md`

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

* SSH key-only + port non-standar; ufw default-deny; non-root; auto security updates.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (dry-run VM)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (drill VPS staging)

**Deliverables:**

* Skrip provision + runbook

**Out of Scope:**

* Compose env (PR-097).

**Rollback Strategy:**

Re-provision dari skrip (idempotent).

#### Acceptance Criteria

* [ ] VPS baru → siap deploy < 30 menit (drill dicatat).
* [ ] Jalankan 2× idempotent (tanpa efek samping).
* [ ] Password SSH login ditolak (verifikasi).
* [ ] ufw hanya 80/443/SSH.
* [ ] Runbook direview tim.

#### Dependencies

* PR-008

#### Risks

* Drift konfigurasi manual pasca-provision. Mitigasi: semua perubahan lewat skrip di git.


### PR-097 - Compose Prod/Staging + Env & Secrets (Gap G6)

#### Objective

**nawasena-prod & nawasena-stg terisolasi + resource limits + .env per env.**

Bisnis: staging yang menyerupai produksi tanpa biaya host tambahan (ADR-006). Teknis: dua compose project (DB, kredensial, kuota AI terpisah), resource limit SDD §9.2, staging basic-auth, `.env` chmod 600 + template (ADR-015).

#### Scope

* `infra/compose/{prod,staging,shared}.yml`
* `.env.example` per env + dokumentasi secrets
* Postgres role aplikasi tanpa UPDATE pada audit_logs
* **Satukan klien database: ganti `pg` di `core/db` dengan `prisma.$queryRaw`** — utang dari PR-008 yang tidak pernah lunas. Komentar di `apps/api/src/core/db/index.ts` sejak PR-008 menjanjikan "PR-010 mengganti isi `pingDatabase()`", tetapi PR-010 merged sebagai migrasi domain seeker tanpa menyentuhnya. Akibatnya API membawa **dua klien DB**: `pg` (pool max 2, hanya untuk readiness ping `/readyz`) + Prisma untuk selebihnya — dependensi dan permukaan konfigurasi ekstra di image produksi. Ditempatkan di sini atas keputusan owner 2026-08-01 karena PR ini menggarap compose prod/staging beserta healthcheck dan role database. Pemakainya (`modules/health`) tidak perlu berubah — hanya isi `pingDatabase()`. Jangan lupa buang dependensi `pg` + `@types/pg` dan perbarui komentar yang menyesatkan itu.

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Grant role aplikasi (audit append-only ditegakkan DB-level).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Secrets: .env 600 owner deploy-user, di luar git, cadangan di password manager; staging basic-auth; isolasi kredensial antar env.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (compose config + limits)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (kedua env hidup di VPS)

**Deliverables:**

* Topologi runtime dua environment

**Out of Scope:**

* Deploy otomatis (PR-100/101).

**Rollback Strategy:**

Compose down per project; env lain tak terpengaruh.

#### Acceptance Criteria

* [ ] Prod & staging berjalan bersama dalam limit RAM SDD §9.2 (bukti `docker stats`).
* [ ] Staging terlindungi basic-auth.
* [ ] Kuota AI & DB terpisah per env (kredensial berbeda).
* [ ] Role DB aplikasi tidak bisa UPDATE audit_logs (test).
* [ ] `compose config` valid di CI.

#### Dependencies

* PR-096

#### Risks

* Limit terlalu ketat → OOM. Mitigasi: headroom 1 GB + alert disk/RAM (PR-103).


### PR-098 - Nginx + Certbot + Cloudflare

#### Objective

**Edge: TLS Full(strict), static immutable, SSE pass-through, limit_req.**

Bisnis: cepat & aman di 3G (CDN) + perlindungan DDoS gratis. Teknis: nginx serve web-dist + proxy API; `proxy_buffering off` + timeout 120 dtk utk SSE; limit_req auth/otp; certbot + CF Full(strict) (SDD §9.4).

#### Scope

* Konfigurasi nginx + certbot + dokumentasi DNS/CF

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

* TLS 1.2+; rate limit L7 kasar; header dasar di edge (final di PR-105).

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (config test `nginx -t` di CI)
* [ ] E2E Test (smoke SSE via edge)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (SSL Labs + curl header)

**Deliverables:**

* Edge produksi-ready

**Out of Scope:**

* CSP final (PR-105).

**Rollback Strategy:**

Konfigurasi nginx versioned di git; reload konfigurasi sebelumnya.

#### Acceptance Criteria

* [ ] SSL Labs grade A (staging).
* [ ] SSE stream melewati nginx tanpa buffering (smoke).
* [ ] Aset ber-hash immutable cache 1 tahun.
* [ ] limit_req auth/otp aktif (429 saat abuse).
* [ ] HTTP→HTTPS redirect.

#### Dependencies

* PR-097

#### Risks

* CF cache menyimpan respons privat. Mitigasi: cache rules hanya /assets + Cache-Control eksplisit API `no-store`.


### PR-099 - Build Workflow → GHCR (Digest-Pinned)

#### Objective

**Build & push image api/worker + artifact web di merge ke main.**

Bisnis: artefak rilis deterministik (rollback pasti). Teknis: workflow build multi-stage (distroless, non-root), push GHCR by digest, web dist artifact (SDD §9.3).

#### Scope

* `.github/workflows/build.yml` + Dockerfile final api/worker

#### Technical Notes

**Backend Changes:**

* Dockerfile produksi (non-root, distroless/slim).
* **Entry worker produksi WAJIB non-watch** (`tsx src/index.ts` atau JS ter-compile), **JANGAN `tsx watch`.** Alasan konkret, bukan preferensi: `tsx watch` membunuh paksa proses anaknya 5 detik setelah SIGTERM (`Process didn't exit in 5s. Force killing...`), sehingga graceful drain BullMQ terpotong dan job aktif tertinggal di state `active`. Terbukti pada Manual Verification PR-015 (2026-08-01): job 20 detik terputus di detik 10 dengan `tsx watch`, selesai utuh dengan entry non-watch. `stop_grace_period` di compose tidak menolong — pembungkus proses membunuh lebih dulu. Compose dev sudah diperbaiki; target prod di PR ini tidak boleh mengulanginya. Rujukan: log implementasi Phase 01, bagian "Manual Verification container".

**Frontend Changes:**

* Build produksi web (artifact).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Container non-root; image scan dasar (grype/trivy) non-blocking awal; GITHUB_TOKEN scoped.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (container boot smoke di CI)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (pull & run image)

**Deliverables:**

* Pipeline artefak rilis

**Out of Scope:**

* Deploy (PR-100/101).

**Rollback Strategy:**

Digest lama selalu tersedia di GHCR.

#### Acceptance Criteria

* [ ] Merge ke main → image di GHCR ber-digest.
* [ ] Container berjalan non-root (assert di CI).
* [ ] Ukuran image api < 300 MB.
* [ ] Web dist ber-hash immutable.
* [ ] Scan menghasilkan laporan (baseline).

#### Dependencies

* PR-003
* PR-008

#### Risks

* Minim.


### PR-100 - Deploy Staging Otomatis + Smoke Test

#### Objective

**Merge main → SSH deploy staging + smoke (health, login, feed).**

Bisnis: staging selalu = main; bug ketahuan sebelum produksi. Teknis: `deploy.sh` (pull digest → migrate deploy → up urutan SDD §10 → smoke); gagal smoke → tandai gagal + alert.

#### Scope

* `infra/deploy.sh` + workflow staging + smoke suite

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* `prisma migrate deploy` menjadi bagian urutan deploy.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* SSH deploy key terbatas (command restriction); secrets di GH Environments.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (dry-run deploy)
* [ ] E2E Test (smoke suite)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (deploy nyata staging)

**Deliverables:**

* CD staging otomatis

**Out of Scope:**

* Prod (PR-101).

**Rollback Strategy:**

`deploy.sh --rollback` (digest sebelumnya); migrasi backward-compatible by rule.

#### Acceptance Criteria

* [ ] Merge → staging terbarui otomatis end-to-end.
* [ ] Urutan deploy sesuai SDD §10 (migrate → api-1 → healthcheck → api-2 → worker → web).
* [ ] Smoke gagal → workflow merah + alert.
* [ ] Log deploy tersimpan (artifact).
* [ ] Deploy ulang idempotent.

#### Dependencies

* PR-099
* PR-097

#### Risks

* Migrasi gagal separuh. Mitigasi: backup pre-deploy hook (aktif penuh setelah PR-104) + migrate transactional.


### PR-101 - Deploy Produksi (Approval) + Rollback

#### Objective

**Tag v* → prod dengan manual approval + rollback teruji.**

Bisnis: rilis terkendali manusia, pulih cepat saat salah. Teknis: GitHub Environment approval; `--rollback` ke digest sebelumnya; template PR migrasi backward-compatible (SDD §9.3).

#### Scope

* Workflow prod + PR template migrasi + drill rollback

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Aturan tim: migrasi kompatibel satu versi (template checklist).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Approval gate; secrets prod hanya di environment prod.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (workflow dry-run)
* [ ] E2E Test (smoke prod pasca-deploy)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (drill rollback)

**Deliverables:**

* Jalur rilis produksi

**Out of Scope:**

* Rilis v1.0.0 itu sendiri (PR-112).

**Rollback Strategy:**

Inilah PR-nya — `--rollback` + backup restore sebagai lapis kedua.

#### Acceptance Criteria

* [ ] Tag v* tanpa approval → tidak deploy.
* [ ] Rollback < 5 menit (drill di staging, dicatat).
* [ ] Template PR migrasi berisi checklist kompatibilitas.
* [ ] Backup pre-deploy berjalan (hook, penuh di PR-104).
* [ ] Notifikasi deploy sukses/gagal ke kanal tim.

#### Dependencies

* PR-100

#### Risks

* Rollback dengan migrasi baru. Mitigasi: aturan kompatibel satu versi ditegakkan template + review.


### PR-102 - Sentry Semua App

#### Objective

**Error tracking web/mobile/api/worker + release tagging + scrubbing.**

Bisnis: bug produksi ketahuan sebelum dilaporkan pengguna (yang mungkin kesulitan melapor). Teknis: SDK 4 app, release = git SHA, `beforeSend` strip PII/sensitif, sampling transaksi (ADR-017).

#### Scope

* Integrasi SDK + konfigurasi + error boundary wiring

#### Technical Notes

**Backend Changes:**

* Sentry init api/worker + requestId korelasi.

**Frontend Changes:**

* Sentry web + error boundary.

**Mobile Changes:**

* Sentry Expo.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* PII scrubbing wajib (beforeSend test); DSN via env; sampling menjaga kuota free tier.

**Testing Checklist:**

* [ ] Unit Test (beforeSend)
* [ ] Integration Test (event capture mock)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (error uji staging)

**Deliverables:**

* Observability error end-to-end

**Out of Scope:**

* Alerting infra (PR-103).

**Rollback Strategy:**

RB-Std; DSN kosong = disabled aman.

#### Acceptance Criteria

* [ ] Error uji dari 4 app muncul dengan release benar.
* [ ] Payload bebas PII/field sensitif (assert beforeSend).
* [ ] Korelasi requestId API↔log.
* [ ] Sampling terkonfigurasi (error 100%, txn ≤10%).
* [ ] Sourcemap web ter-upload (stack terbaca).

#### Dependencies

* PR-099

#### Risks

* Kuota free tier habis. Mitigasi: sampling + filter noise.


### PR-103 - Uptime Kuma + Dozzle + /internal/metrics + Alerts

#### Objective

**Probe & alert: down, readyz, disk, DLQ, kuota AI, backup.**

Bisnis: tim tahu lebih dulu daripada pengguna. Teknis: Kuma probe health/web/staging; Dozzle log viewer (basic-auth); endpoint metrics JSON (p95 ring-buffer, queue depth, kuota AI, error rate) + keyword monitor ambang (SDD §17).

#### Scope

* Compose shared (kuma, dozzle) + endpoint metrics + konfigurasi alert Telegram

#### Technical Notes

**Backend Changes:**

* `core/metrics` ring-buffer + endpoint internal.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /internal/metrics (auth internal)

**Security Considerations:**

* Endpoint internal tidak terekspos publik (nginx deny + token); Dozzle basic-auth.

**Testing Checklist:**

* [ ] Unit Test (ring-buffer)
* [ ] Integration Test (endpoint + guard)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (matikan api → alert)

**Deliverables:**

* Monitoring + alerting hidup

**Out of Scope:**

* Prometheus/Grafana (pemicu SDD §19).

**Rollback Strategy:**

RB-Std; monitoring mati tidak memengaruhi produk.

#### Acceptance Criteria

* [ ] Semua ambang SDD §17 terpasang: down>1m, readyz, disk>80%, DLQ>0, kuota AI>90%, backup gagal.
* [ ] Setiap alert terbukti terkirim (kondisi buatan, dicatat).
* [ ] /internal/metrics tidak dapat diakses publik (test).
* [ ] p95 ring-buffer akurat vs beban uji.
* [ ] Status page publik sederhana aktif.

#### Dependencies

* PR-100
* PR-015

#### Risks

* Alert fatigue. Mitigasi: hanya ambang actionable; review bulanan.


### PR-104 - Backup Harian + Restore Drill

#### Objective

**pg_dump → age → R2 (retensi 30h + bulanan×6) + restore.sh + drill.**

Bisnis: RPO ≤ 24 jam & janji "backup yang tidak diuji = tidak ada" (SDD §18). Teknis: processor `maintenance:backup` 02:07, enkripsi age (kunci terpisah), lifecycle R2, `restore.sh`, drill bulanan terdokumentasi.

#### Scope

* Processor backup + skrip restore + runbook DR + drill pertama

#### Technical Notes

**Backend Changes:**

* Processor worker backup.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (operasi dump).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Backup terenkripsi age (kunci ≠ FIELD_KEY, di password manager); bucket backup terpisah + lifecycle; audit run.

**Testing Checklist:**

* [ ] Unit Test (namer/rotasi)
* [ ] Integration Test (dump→encrypt→upload→restore di CI/staging)
* [ ] E2E Test (smoke pasca-restore)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (drill penuh dicatat di runbook)

**Deliverables:**

* Backup teruji + runbook DR (RTO ≤ 4 jam)

**Out of Scope:**

* PITR/WAL streaming (pasca-MVP bila perlu).

**Rollback Strategy:**

Inilah jaring pengaman rollback data; skrip pause via config.

#### Acceptance Criteria

* [ ] Backup harian terbentuk di R2 & tidak terbaca tanpa kunci (verifikasi).
* [ ] `restore.sh` di staging → DB fungsional + smoke hijau (drill dicatat).
* [ ] Retensi lifecycle bekerja (30 hari + bulanan).
* [ ] Backup gagal → alert (PR-103).
* [ ] Pre-deploy backup hook aktif di deploy.sh.

#### Dependencies

* PR-103
* PR-062

#### Risks

* Restore tidak pernah dilatih → gagal saat krisis. Mitigasi: drill bulanan wajib (kalender tim).


## Exit Criteria

Phase 16 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 9 PR (PR-096..PR-104) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 17 - Security Hardening & PDP Compliance](phase-17-security-pdp-hardening.md)
