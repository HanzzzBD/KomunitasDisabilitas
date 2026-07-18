---
phase: 9
name: "Resume Builder & PDF"
prs: PR-060..PR-064 (5 PR)
sprint: "5-7"
depends_on: [1, 2, 5, 7]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 09 - Resume Builder & PDF

## Overview

CV jalur manual (fallback wajib graceful degradation): CRUD + resumeSchema, editor aksesibel, storage R2, dan pipeline render PDF Puppeteer.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 05 - User Profile](phase-05-user-profile.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 07 - Notifications](phase-07-notifications.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-060** - API CV + kontrak resumeSchema
* **PR-061** - Editor CV produksi-ready
* **PR-062** - Util storage reusable
* **PR-063** - Pipeline render PDF
* **PR-064** - Fitur unduh PDF lengkap

## Pull Requests

### PR-060 - Resumes BE — Manual CRUD + resumeSchema

#### Objective

**CRUD CV jsonb + kontrak resumeSchema tunggal + limit 5/user.**

Bisnis: jalur non-AI pembuatan CV (graceful degradation wajib). Teknis: `resumeSchema` zod = kontrak tunggal struktur CV (dipakai juga ekstraksi AI PR-067); `created_via: manual|ai_chat`.

#### Scope

* CRUD resumes + validasi penuh
* resumeSchema di packages/schemas

#### Technical Notes

**Backend Changes:**

* Modul `resumes`.

**Frontend Changes:**

* Tidak ada (PR-061).

**Database Changes:**

* Tidak ada (tabel dari PR-010).

**API Changes:**

* GET/POST /api/v1/me/resumes
* GET/PUT/DELETE /api/v1/me/resumes/:id

**Security Considerations:**

* requireSelf; Input Validation resumeSchema ketat; CV tidak memuat field disabilitas (by schema — disclosure terpisah di apply).

**Testing Checklist:**

* [ ] Unit Test (resumeSchema valid/invalid)
* [ ] Integration Test (CRUD + limit)
* [ ] E2E Test (via PR-061)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (curl)

**Deliverables:**

* API CV + kontrak resumeSchema

**Out of Scope:**

* PDF (PR-063); AI chat (PR-066).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] CRUD lengkap + authz.
* [ ] Struktur invalid ditolak dengan pesan per-field sederhana.
* [ ] Limit 5 CV ditegakkan (config).
* [ ] resumeSchema tidak memiliki field disabilitas (review skema).
* [ ] created_via terisi benar.

#### Dependencies

* PR-019
* PR-010

#### Risks

* Skema CV berubah setelah dipakai AI. Mitigasi: skema versioned.


### PR-061 - Resume Editor FE

#### Objective

**Editor CV section-based + reorder via tombol.**

Bisnis: pengguna Daksa/keyboard-only dapat menyusun CV kompetitif tanpa AI. Teknis: editor per-section (prefill profil), simpan-per-bagian, reorder tombol atas/bawah (bukan drag-only).

#### Scope

* Editor semua section resumeSchema
* Prefill dari profil (PR-038)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature resume-builder/editor.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (mapper prefill)
* [ ] Integration Test (N/A)
* [ ] E2E Test (buat CV manual penuh)
* [ ] Accessibility Test (axe + reorder NVDA)
* [ ] Manual Verification (teks panjang/overflow)

**Deliverables:**

* Editor CV produksi-ready

**Out of Scope:**

* Chat AI (PR-068); unduh PDF (PR-064).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] CV lengkap dibuat tanpa menyentuh fitur AI.
* [ ] Reorder pengalaman via tombol; perubahan diumumkan SR.
* [ ] Simpan-per-bagian (gagal parsial tidak menghanguskan).
* [ ] Keyboard-only penuh + NVDA checklist.
* [ ] Prefill dari profil akurat & dapat diubah.

#### Dependencies

* PR-060
* PR-040

#### Risks

* Editor kompleks di layar kecil. Mitigasi: section collapsible responsif.


### PR-062 - core/storage — Cloudflare R2

#### Objective

**Util S3 API: upload + presigned URL + bucket per env.**

Bisnis: penyimpanan objek murah (PDF CV, video BISINDO). Teknis: util storage dengan presigned URL kedaluwarsa; MinIO di CI.

#### Scope

* Client R2 + helper upload/presign
* Konvensi path per domain

#### Technical Notes

**Backend Changes:**

* `core/storage`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Bucket privat default; presigned pendek umur; kredensial via env; tidak ada public-list.

**Testing Checklist:**

* [ ] Unit Test (path builder)
* [ ] Integration Test (MinIO roundtrip + expiry)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (R2 nyata staging)

**Deliverables:**

* Util storage reusable

**Out of Scope:**

* Lifecycle rules backup (PR-104).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Upload + presign + expiry teruji (MinIO).
* [ ] Objek tanpa presign → 403.
* [ ] Bucket per env terpisah (konvensi).
* [ ] Path konvensi terdokumentasi.
* [ ] Ukuran maks upload ditegakkan.

#### Dependencies

* PR-006

#### Risks

* Minim.


### PR-063 - PDF Render Processor (Puppeteer)

#### Objective

**Template HTML CV → PDF; concurrency 1; idempotent by hash.**

Bisnis: US-05 — CV PDF rapi ATS-friendly. Teknis: queue `pdf:render`, template print-CSS (heading semantik, lang), job-id `pdf:{resumeId}:{hash}`, limit RAM container (T4, SDD §16).

#### Scope

* Template + processor + simpan pdf_url
* Guard resource (concurrency 1, timeout 90 dtk)

#### Technical Notes

**Backend Changes:**

* Processor worker + template.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (kolom pdf_url dari PR-010).

**API Changes:**

* Tidak ada (endpoint PR-064).

**Security Considerations:**

* Konten CV di-escape ke template (anti-injection HTML); PDF di bucket privat.

**Testing Checklist:**

* [ ] Unit Test (template snapshot)
* [ ] Integration Test (job penuh + MinIO)
* [ ] E2E Test (via PR-064)
* [ ] Accessibility Test (checklist urutan baca PDF)
* [ ] Manual Verification (buka PDF di reader)

**Deliverables:**

* Pipeline render PDF

**Out of Scope:**

* Multi-template pilihan (pasca-MVP).

**Rollback Strategy:**

RB-Std; PDF lama tetap tersedia (immutable by hash).

#### Acceptance Criteria

* [ ] Render < 90 dtk CV wajar; retry saat crash.
* [ ] Konten sama → satu render (idempoten hash).
* [ ] Heading & urutan baca PDF logis (checklist manual dilampirkan).
* [ ] Worker OOM-safe (limit RAM + concurrency 1 di config).
* [ ] Karakter non-latin/emoji aman.

#### Dependencies

* PR-062
* PR-060
* PR-015

#### Risks

* Puppeteer berat (T4). Mitigasi: concurrency 1 + antrian terpisah + limit container.


### PR-064 - PDF API + FE Download

#### Objective

**Enqueue render + status + unduh + notifikasi "CV siap".**

Bisnis: pengalaman unduh yang jelas bagi semua pengguna. Teknis: endpoint enqueue (202) + status/URL; FE tombol + progres `aria-live`; notifikasi via PR-047.

#### Scope

* Endpoint + FE unduh + integrasi notifikasi

#### Technical Notes

**Backend Changes:**

* `resumes/pdf` router/service.

**Frontend Changes:**

* Tombol unduh + status di editor/daftar CV.

**Database Changes:**

* Tidak ada.

**API Changes:**

* POST /api/v1/me/resumes/:id/pdf
* GET /api/v1/me/resumes/:id/pdf

**Security Considerations:**

* URL presigned pendek umur; requireSelf.

**Testing Checklist:**

* [ ] Unit Test (status mapper)
* [ ] Integration Test (endpoint + idempoten)
* [ ] E2E Test (unduh dari UI)
* [ ] Accessibility Test (axe + aria-live)
* [ ] Manual Verification (file terbuka benar)

**Deliverables:**

* Fitur unduh PDF lengkap

**Out of Scope:**

* Tidak ada.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Minta→proses→notifikasi→unduh end-to-end.
* [ ] Status progres diumumkan `aria-live` (antre/proses/siap/gagal).
* [ ] Gagal render → pesan sederhana + coba lagi.
* [ ] URL kedaluwarsa → minta ulang mulus.
* [ ] Idempoten: klik ganda tidak antre ganda.

#### Dependencies

* PR-063
* PR-050

#### Risks

* Minim.


## Exit Criteria

Phase 09 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 5 PR (PR-060..PR-064) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 10 - AI CV Builder](phase-10-ai-cv-builder.md)
