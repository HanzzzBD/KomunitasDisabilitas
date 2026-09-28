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

* [x] Unit Test (resumeSchema valid/invalid) — `packages/schemas/__tests__/resumes.test.ts` (24 test), `resumes.test.ts` (17 test)
* [x] Integration Test (CRUD + limit) — `resumes-http.test.ts` (18 test), `resumes-db.test.ts` (10 test, DB nyata)
* [x] E2E Test (via PR-061) — `e2e/cv-editor.spec.ts`
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (curl)

**Deliverables:**

* API CV + kontrak resumeSchema

**Out of Scope:**

* PDF (PR-063); AI chat (PR-066).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] CRUD lengkap + authz. — `resumes-http.test.ts` — 401 di semua route, CV milik B tak terjangkau A
* [x] Struktur invalid ditolak dengan pesan per-field sederhana. — `resumes-http.test.ts` — isi berstruktur salah ditolak 400 sebelum DB
* [x] Limit 5 CV ditegakkan (config). — `RESUME_MAX_PER_USER`; 409 + delapan POST serentak tetap tepat 5 (`resumes-db.test.ts`)
* [x] resumeSchema tidak memiliki field disabilitas (review skema). — `resumes-http.test.ts` — field disabilitas ditolak (AC-4)
* [x] created_via terisi benar. — `resumes-http.test.ts` — klien tak bisa mengaku `createdVia`, endpoint selalu `manual`

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

* [x] Unit Test (mapper prefill) — `resume-prefill.test.ts`
* [ ] Integration Test (N/A)
* [x] E2E Test (buat CV manual penuh) — `e2e/cv-editor.spec.ts` — isi, reorder, simpan per bagian
* [ ] Accessibility Test (axe + reorder NVDA)
* [x] Manual Verification (teks panjang/overflow) — otomatis: `e2e/cv-editor.spec.ts` (320 px tanpa gulir mendatar)

**Deliverables:**

* Editor CV produksi-ready

**Out of Scope:**

* Chat AI (PR-068); unduh PDF (PR-064).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] CV lengkap dibuat tanpa menyentuh fitur AI. — `e2e/cv-editor.spec.ts` — tanpa satu pun jalur AI
* [x] Reorder pengalaman via tombol; perubahan diumumkan SR. — `resume-editor.test.tsx` — tombol + live region (NVDA nyata: lihat butir keyboard/NVDA)
* [x] Simpan-per-bagian (gagal parsial tidak menghanguskan). — `resume-editor.test.tsx` + e2e — draf bagian lain tidak ikut terkirim
* [ ] Keyboard-only penuh + NVDA checklist.
* [x] Prefill dari profil akurat & dapat diubah. — `resume-prefill.test.ts` + editor dapat disunting; data disabilitas tak pernah disalin

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

* [x] Unit Test (path builder) — `storage.test.ts`
* [x] Integration Test (MinIO roundtrip + expiry) — `storage-minio.test.ts` — **berjalan di CI sejak PR-064c** (sebelumnya selalu skip)
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

* [x] Upload + presign + expiry teruji (MinIO). — `storage-minio.test.ts` di CI (sejak PR-064c)
* [x] Objek tanpa presign → 403. — `storage-minio.test.ts` — unsigned → 403
* [x] Bucket per env terpisah (konvensi). — `buildStorageBucketName` + validasi `STORAGE_BUCKET_ENV` (`storage.test.ts`)
* [x] Path konvensi terdokumentasi. — `apps/api/src/core/storage/README.md`
* [x] Ukuran maks upload ditegakkan. — `storage.test.ts` — batas global & per-domain sebelum provider disentuh

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

* [x] Unit Test (template snapshot) — `resume-pdf.test.ts` — snapshot heading & urutan baca
* [x] Integration Test (job penuh + MinIO) — `pdf-render.test.ts` — Chromium + MinIO, **berjalan di CI sejak PR-064c**
* [x] E2E Test (via PR-064) — `e2e/cv-editor.spec.ts` (API dipalsukan)
* [ ] Accessibility Test (checklist urutan baca PDF)
* [ ] Manual Verification (buka PDF di reader)

**Deliverables:**

* Pipeline render PDF

**Out of Scope:**

* Multi-template pilihan (pasca-MVP).

**Rollback Strategy:**

RB-Std; PDF lama tetap tersedia (immutable by hash).

#### Acceptance Criteria

* [x] Render < 90 dtk CV wajar; retry saat crash. — CI: 12 dtk; queue `attempts: 3`; crash renderer diteruskan untuk retry
* [x] Konten sama → satu render (idempoten hash). — `resume-pdf.test.ts` — isi sama dirender & diunggah sekali
* [ ] Heading & urutan baca PDF logis (checklist manual dilampirkan).
* [x] Worker OOM-safe (limit RAM + concurrency 1 di config). — `definitions.ts` concurrency 1 + timeout 90 dtk; compose `mem_limit: 768m`
* [x] Karakter non-latin/emoji aman. — `resume-pdf.test.ts` + `resumes-db.test.ts` — UTF-8 non-latin & emoji

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

* [x] Unit Test (status mapper) — `resume-pdf-api.test.ts`
* [x] Integration Test (endpoint + idempoten) — `resumes-http.test.ts` — POST 202 + GET status; 503 tanpa storage
* [x] E2E Test (unduh dari UI) — `e2e/cv-editor.spec.ts` — minta, progres, unduh dari URL baru
* [x] Accessibility Test (axe + aria-live) — `resume-pdf-control.test.tsx` — axe + `aria-live` (diam sampai ditekan, PR-064a)
* [ ] Manual Verification (file terbuka benar)

**Deliverables:**

* Fitur unduh PDF lengkap

**Out of Scope:**

* Tidak ada.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Minta→proses→notifikasi→unduh end-to-end.
* [x] Status progres diumumkan `aria-live` (antre/proses/siap/gagal). — `resume-pdf-control.test.tsx` + e2e
* [x] Gagal render → pesan sederhana + coba lagi. — `resume-pdf-control.test.tsx` — pesan sederhana + tombol coba lagi
* [x] URL kedaluwarsa → minta ulang mulus. — `resume-pdf-control.test.tsx` — URL diambil ulang tepat sebelum unduh
* [x] Idempoten: klik ganda tidak antre ganda. — `resume-pdf-api.test.ts` — klik ganda tidak memanggil enqueue kedua

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

> **⚠️ Override owner — Phase 09 ditutup ke `main` pada 2026-09-28 dengan 3 dari 25 AC belum
> terpenuhi.** CLAUDE.md §5.8 butir 8 menuntut Exit Criteria terpenuhi **dan** perintah eksplisit
> owner. Yang kedua ada, yang pertama tidak sepenuhnya. Selisihnya ditutup dengan catatan ini, bukan
> dengan diam (precedent: PR-033j, Phase 03).
>
> | AC | Mengapa belum | Yang sudah terbukti |
> |---|---|---|
> | PR-061 — Keyboard-only penuh + **NVDA checklist** | Tidak ada screen reader sungguhan di lingkungan pengerjaan; [checklist NVDA](log/pr-061-nvda-checklist.md) belum ditandatangani | Keyboard penuh lewat `e2e/cv-editor.spec.ts`; struktur ARIA + axe |
> | PR-063 — Heading & urutan baca PDF logis | [Checklist urutan baca](log/pr-063-pdf-reading-order-checklist.md) sudah dilampirkan, tetapi kotak manual Adobe Reader + NVDA belum diisi | Snapshot heading/urutan DOM, `tagged` + `outline` PDF |
> | PR-064 — Minta → proses → notifikasi → unduh **end-to-end** | Belum pernah ditempuh dalam SATU jalur nyata (API + worker + MinIO + browser sekaligus) | Setiap mata rantai teruji: API (`resumes-http`), render Chromium + MinIO di CI (`pdf-render`, sejak PR-064c), notifikasi idempoten, UI unduh (e2e) |
>
> Tiga kriteria lain terpenuhi: seluruh PR (PR-060..PR-064 + 064a/b/c) merged lewat PR ke branch
> phase, CI hijau di setiap PR, dan tidak ada regresi E2E. Override **tidak** mengubah status
> verifikasi — hanya memindahkan keputusan merge. Ketiga AC di atas tetap terbuka dan tercatat
> sebagai U-24 di [`docs/utang-teknis.md`](../utang-teknis.md).
>
> Kotak Testing Checklist yang kosong selain itu: `N/A` (4), Manual curl PR-060 (tidak ada jejak
> curl — digantikan test HTTP + DB nyata), R2 staging PR-062 (belum ada lingkungan staging, lahir
> di Phase 16), dan pembukaan PDF di reader (PR-063/064, bagian dari U-24).

## Next Phase

[Phase 10 - AI CV Builder](phase-10-ai-cv-builder.md)
