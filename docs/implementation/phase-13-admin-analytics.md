---
phase: 13
name: "Admin Dashboard & Analytics"
prs: PR-080..PR-083 (4 PR)
sprint: "7-8"
depends_on: [2, 6, 8, 12, 16]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 13 - Admin Dashboard & Analytics

## Overview

Operasional & pengukuran: metrik funnel admin, dashboard, analytics Umami privacy-first (KPI PRD Bab 15), dan moderasi suspend.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 06 - AI Gateway](phase-06-ai-gateway.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 08 - Companies & Jobs](phase-08-companies-jobs.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 12 - Applications](phase-12-applications.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 16 - Infrastructure & Observability](phase-16-infrastructure-observability.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-080** - API metrik admin
* **PR-081** - Dashboard admin
* **PR-082** - Analytics privacy-first + funnel KPI
* **PR-083** - Alat moderasi dasar

## Pull Requests

### PR-080 - Admin Metrics BE

#### Objective

**GET /admin/metrics: funnel, North Star, AI usage, DLQ.**

Bisnis: keputusan pilot berbasis data (KPI PRD §15). Teknis: agregasi SQL read-only (tanpa kolom terenkripsi), cache 5 menit, subscriber counter harian.

#### Scope

* Agregator funnel (daftar→profil→lamar→wawancara→hired)
* AI usage per fitur + DLQ count

#### Technical Notes

**Backend Changes:**

* `modules/admin/metrics`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /api/v1/admin/metrics

**Security Considerations:**

* RBAC admin; metrik agregat saja — tidak pernah mengekspos individu atau data sensitif.

**Testing Checklist:**

* [ ] Unit Test (agregator)
* [ ] Integration Test (fixture)
* [ ] E2E Test (via PR-081)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (bandingkan manual count)

**Deliverables:**

* API metrik admin

**Out of Scope:**

* Analytics event produk (PR-082).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Angka funnel cocok dengan fixture deterministik.
* [ ] Query tidak menyentuh kolom terenkripsi (review + test).
* [ ] Cache 5 menit bekerja (hit kedua tanpa query berat).
* [ ] North Star = count hired_confirmed_at.
* [ ] Respons < 500 ms (cache hangat).

#### Dependencies

* PR-076
* PR-043

#### Risks

* Query agregasi berat saat data tumbuh. Mitigasi: counter harian materialized + cache.


### PR-081 - Admin Dashboard FE

#### Objective

**Stat tiles + tabel ringkas metrik.**

Bisnis: admin melihat kesehatan pilot dalam satu layar. Teknis: tiles aksesibel (angka+label+tren tekstual), bukan grafik warna-saja.

#### Scope

* Halaman dashboard + auto-refresh sopan

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature admin/dashboard.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (tile)
* [ ] Integration Test (N/A)
* [ ] E2E Test (render + angka)
* [ ] Accessibility Test (axe + NVDA)
* [ ] Manual Verification (data staging)

**Deliverables:**

* Dashboard admin

**Out of Scope:**

* Grafik time-series (pasca-MVP).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Semua metrik terbaca SR dengan konteks (label+nilai+periode).
* [ ] Tren naik/turun tekstual (bukan panah warna saja).
* [ ] Auto-refresh tidak mencuri fokus.
* [ ] axe pass.
* [ ] Angka cocok fixture E2E.

#### Dependencies

* PR-080
* PR-052

#### Risks

* Minim.


### PR-082 - Analytics Instrumentation — Umami + Funnel (Gap G2)

#### Objective

**Umami self-host + event funnel KPI PRD §15.**

Bisnis: KPI PRD terukur (aktivasi ≥60%, lamaran/bulan, retensi) tanpa tracker pihak ketiga (privasi). Teknis: container Umami di compose shared; util track FE dengan kebijakan no-PII (schema payload).

#### Scope

* Umami di infra + util `track()` web (hook mobile menyusul di PR-094 pakai util sama)
* Event funnel: daftar, profil_lengkap, cv_dibuat, lamar, wawancara, hired_confirmed

#### Technical Notes

**Backend Changes:**

* Tidak ada (event FE; hired via halaman confirm).

**Frontend Changes:**

* `shared/analytics.ts` + panggilan di titik funnel.

**Mobile Changes:**

* Kontrak util disiapkan platform-agnostic (dipakai PR-094).

**Database Changes:**

* Tidak ada (DB Umami internal container).

**API Changes:**

* Tidak ada.

**Security Considerations:**

* PDP: payload tanpa PII/ID mentah (hash user anon per Umami); respect DNT; domain analytics first-party.

**Testing Checklist:**

* [ ] Unit Test (schema payload)
* [ ] Integration Test (N/A)
* [ ] E2E Test (event terkirim — mock endpoint)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (dashboard Umami)

**Deliverables:**

* Analytics privacy-first + funnel KPI

**Out of Scope:**

* A/B testing.

**Rollback Strategy:**

RB-Std; container Umami bisa dimatikan tanpa efek produk.

#### Acceptance Criteria

* [ ] Funnel lengkap terlihat di Umami staging.
* [ ] Payload event lolos schema no-PII (test).
* [ ] Analytics gagal → aplikasi tidak terganggu (fire-and-forget).
* [ ] Event terdokumentasi (katalog).
* [ ] Opt-out tersedia di settings (toggle).

#### Dependencies

* PR-079
* PR-097

#### Risks

* Event drift dari KPI. Mitigasi: katalog event = lampiran definisi KPI PRD §15.


### PR-083 - Moderasi — Suspend User

#### Objective

**Suspend/unsuspend + konfirmasi dua langkah + audit.**

Bisnis: perlindungan komunitas dari penyalahgunaan (FR-6.2). Teknis: `suspended_at` + `ver` bump (semua sesi mati) + blok login; alasan wajib.

#### Scope

* Migrasi kolom + endpoints + aksi di admin FE

#### Technical Notes

**Backend Changes:**

* `modules/admin/moderation`.

**Frontend Changes:**

* Aksi suspend di tabel user admin.

**Database Changes:**

* Kolom `suspended_at`, `suspend_reason` di users (additive).

**API Changes:**

* POST /api/v1/admin/users/:id/suspend
* POST /api/v1/admin/users/:id/unsuspend

**Security Considerations:**

* RBAC admin; audit alasan wajib; suspended ≠ deleted (data utuh, akses diblok).

**Testing Checklist:**

* [ ] Unit Test (guard login)
* [ ] Integration Test (siklus suspend)
* [ ] E2E Test (admin flow)
* [ ] Accessibility Test (dialog)
* [ ] Manual Verification (akun uji)

**Deliverables:**

* Alat moderasi dasar

**Out of Scope:**

* Laporan konten oleh user (Fase 2 produk bila perlu).

**Rollback Strategy:**

Migrasi additive; RB-Std.

#### Acceptance Criteria

* [ ] Suspended tidak bisa login/refresh (test).
* [ ] Alasan wajib; audit tercatat.
* [ ] Unsuspend memulihkan akses.
* [ ] Konfirmasi dua langkah di FE.
* [ ] Suspended tidak muncul di feed employer/admin listing normal (flag).

#### Dependencies

* PR-052
* PR-021

#### Risks

* Minim.


## Exit Criteria

Phase 13 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 4 PR (PR-080..PR-083) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 14 - SignBridge v1 & Simplify](phase-14-signbridge-simplify.md)
