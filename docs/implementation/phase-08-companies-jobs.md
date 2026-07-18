---
phase: 8
name: "Companies & Jobs"
prs: PR-051..PR-059 (9 PR)
sprint: "5-6"
depends_on: [2, 3]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 08 - Companies & Jobs

## Overview

Sisi pasokan marketplace: data perusahaan + profil inklusivitas + verifikasi, admin shell, kurasi lowongan, pencarian FTS non-AI, dan halaman browse/detail publik.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 03 - Web Platform Base](phase-03-web-platform-base.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-051** - API perusahaan + verifikasi
* **PR-052** - Admin shell + tabel aksesibel reusable
* **PR-053** - UI kurasi perusahaan
* **PR-054** - Halaman publik perusahaan
* **PR-055** - API lowongan lengkap
* **PR-056** - API pencarian lowongan
* **PR-057** - UI kurasi lowongan
* **PR-058** - Halaman browse publik
* **PR-059** - Halaman detail lowongan

## Pull Requests

### PR-051 - Companies BE

#### Objective

**CRUD admin + verifikasi inklusivitas + public GET.**

Bisnis: Inclusive Company Profile — transparansi akomodasi perusahaan (USP PRD). Teknis: status `unverified/self_claimed/verified`, `accommodations_available jsonb`, event `company.verified`, audit verifikasi (PRD FR-6.1).

#### Scope

* CRUD admin + endpoint verify
* Public GET tanpa field internal

#### Technical Notes

**Backend Changes:**

* Modul `companies`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (tabel dari PR-011).

**API Changes:**

* GET /api/v1/companies/:id
* GET/POST /api/v1/admin/companies ; PUT /api/v1/admin/companies/:id
* POST /api/v1/admin/companies/:id/verify

**Security Considerations:**

* RBAC admin-only untuk mutasi; Audit verifikasi (siapa, kapan); Input Validation taksonomi akomodasi.

**Testing Checklist:**

* [ ] Unit Test (service verify)
* [ ] Integration Test (RBAC + audit + event)
* [ ] E2E Test (via PR-053)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (curl)

**Deliverables:**

* API perusahaan + verifikasi

**Out of Scope:**

* Portal employer self-service (Fase 2 produk).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Seeker tidak dapat memutasi (403, matrix).
* [ ] Verify → status berubah + audit + event.
* [ ] Public GET hanya field publik (snapshot kontrak).
* [ ] Taksonomi akomodasi tervalidasi.
* [ ] Un-verify (koreksi) dimungkinkan + audit.

#### Dependencies

* PR-019

#### Risks

* Label "verified" tanpa rubrik. Mitigasi: rubrik verifikasi di docs (celah PRD §17 dicatat).


### PR-052 - Admin Shell FE

#### Objective

**Layout admin: route lazy, guard role, navigasi, tabel aksesibel.**

Bisnis: rumah semua operasi kurasi (pilot bergantung admin). Teknis: route `/admin` code-split, guard role, komponen tabel aksesibel (caption/scope/sortable).

#### Scope

* Shell + navigasi + guard
* Komponen AdminTable aksesibel (dipakai semua fitur admin)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Shell admin + AdminTable.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Guard role FE adalah UX, bukan keamanan — keamanan tetap di RBAC BE (dicatat eksplisit).

**Testing Checklist:**

* [ ] Unit Test (guard)
* [ ] Integration Test (N/A)
* [ ] E2E Test (akses role)
* [ ] Accessibility Test (axe + keyboard tabel)
* [ ] Manual Verification (NVDA tabel)

**Deliverables:**

* Admin shell + tabel aksesibel reusable

**Out of Scope:**

* Fitur admin (053/057/077/081/083/085).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Seeker membuka /admin → ditolak (redirect + pesan).
* [ ] Bundle admin tidak termuat untuk seeker (analyzer).
* [ ] AdminTable: header terasosiasi, sortable via keyboard, caption.
* [ ] Navigasi admin keyboard-only.
* [ ] axe 0 pelanggaran shell.

#### Dependencies

* PR-030
* PR-028

#### Risks

* Minim.


### PR-053 - Admin Companies FE

#### Objective

**Form perusahaan + taksonomi akomodasi + aksi verifikasi.**

Bisnis: admin memelihara data perusahaan berkualitas. Teknis: CRUD UI + editor taksonomi + badge status + konfirmasi verifikasi.

#### Scope

* List + form + verify flow

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature admin/companies.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Konfirmasi verifikasi eksplisit (dampak label publik).

**Testing Checklist:**

* [ ] Unit Test (form mapping)
* [ ] Integration Test (N/A)
* [ ] E2E Test (alur admin penuh)
* [ ] Accessibility Test (axe + keyboard)
* [ ] Manual Verification (data seed)

**Deliverables:**

* UI kurasi perusahaan

**Out of Scope:**

* Upload logo (nice-to-have pasca-MVP).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Buat→edit→verifikasi end-to-end.
* [ ] Editor taksonomi valid (nilai liar tak terkirim).
* [ ] Badge status jelas + tekstual.
* [ ] Form keyboard-only + axe pass.
* [ ] Error BE tampil per-field.

#### Dependencies

* PR-051
* PR-052

#### Risks

* Minim.


### PR-054 - Company Public Profile Page (Gap G5)

#### Objective

**Halaman publik profil inklusivitas perusahaan.**

Bisnis: US-09 — kandidat menilai perusahaan SEBELUM melamar (keamanan psikologis). Teknis: halaman publik: akomodasi, cara komunikasi, badge verifikasi, lowongan aktif.

#### Scope

* Halaman company/:id + daftar lowongan aktifnya

#### Technical Notes

**Backend Changes:**

* Tidak ada (endpoint sudah ada; tambah include jobs aktif).

**Frontend Changes:**

* Feature companies publik.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /api/v1/companies/:id/jobs

**Security Considerations:**

* Hanya data publik; tidak mengekspos kontak internal.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (endpoint jobs aktif)
* [ ] E2E Test (job detail → company page)
* [ ] Accessibility Test (axe + NVDA)
* [ ] Manual Verification (data seed)

**Deliverables:**

* Halaman publik perusahaan

**Out of Scope:**

* Review perusahaan (Fase 2 produk).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Semua ikon akomodasi berlabel teks.
* [ ] Badge verified vs self-claimed dibedakan tekstual (bukan warna saja).
* [ ] Daftar lowongan aktif tertaut ke detail.
* [ ] Struktur heading benar; axe pass.
* [ ] Tersedia id + id-simple.

#### Dependencies

* PR-051
* PR-032

#### Risks

* Minim.


### PR-055 - Jobs BE — CRUD + Lifecycle

#### Objective

**Lowongan kurasi admin: draft→published→closed + event.**

Bisnis: pasokan lowongan berkualitas dengan taksonomi akomodasi (mitigasi cold-start R1). Teknis: CRUD field terstruktur penuh (PRD FR-4.1), soft-close (FK RESTRICT), event `job.published`.

#### Scope

* CRUD + transisi status + expires_at
* Validasi akomodasi wajib sebelum publish

#### Technical Notes

**Backend Changes:**

* Modul `jobs` core.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (tabel dari PR-011).

**API Changes:**

* GET /api/v1/jobs/:id
* GET/POST /api/v1/admin/jobs ; PUT /api/v1/admin/jobs/:id
* POST /api/v1/admin/jobs/:id/publish ; POST /api/v1/admin/jobs/:id/close

**Security Considerations:**

* RBAC admin; audit publish/close; Input Validation gaji/tanggal.

**Testing Checklist:**

* [ ] Unit Test (state machine)
* [ ] Integration Test (CRUD + event + RESTRICT)
* [ ] E2E Test (via PR-057)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (curl)

**Deliverables:**

* API lowongan lengkap

**Out of Scope:**

* Search (PR-056); agregasi otomatis (Fase 3 produk).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Publish tanpa field akomodasi → 422.
* [ ] Publish → event `job.published` (assert).
* [ ] Delete lowongan berlamaran → ditolak; close = jalur resmi.
* [ ] Transisi status ilegal ditolak.
* [ ] GET publik hanya lowongan published & belum expired.

#### Dependencies

* PR-051

#### Risks

* Taksonomi akomodasi kurang lengkap. Mitigasi: taksonomi versioned di schemas, mudah ditambah.


### PR-056 - Jobs BE — Search FTS + Filter Faceted

#### Objective

**Pencarian FTS+pg_trgm + filter + cursor pagination.**

Bisnis: jalur temu-lowongan non-AI kelas satu (degradasi & SEO masa depan) (ADR-018). Teknis: FTS indonesian + trigram typo + filter (lokasi/work_mode/accommodations GIN) + cursor.

#### Scope

* Query builder search + filter
* Bukti EXPLAIN di deskripsi PR

#### Technical Notes

**Backend Changes:**

* `jobs/search` service+repo.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (indeks dari PR-011).

**API Changes:**

* GET /api/v1/jobs?query&city&province&work_mode&accommodations&cursor&limit

**Security Considerations:**

* Parameterized penuh (raw SQL FTS ber-parameter); limit maksimal pagination.

**Testing Checklist:**

* [ ] Unit Test (builder)
* [ ] Integration Test (relevansi + filter + cursor)
* [ ] E2E Test (via PR-058)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (query aneh/injeksi)

**Deliverables:**

* API pencarian lowongan

**Out of Scope:**

* Meilisearch (pemicu SDD §19).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Typo ringan tetap menemukan (trigram test).
* [ ] Filter akomodasi: hasil ⊇ akomodasi diminta (GIN test).
* [ ] Cursor stabil di data berubah.
* [ ] EXPLAIN memakai indeks (bukti).
* [ ] p95 < 200 ms pada 1.000 jobs seed.

#### Dependencies

* PR-055

#### Risks

* Stemming Indonesia terbatas. Mitigasi: trigram + sinonim tsearch bila terbukti perlu.


### PR-057 - Admin Jobs FE

#### Objective

**Form lowongan + publish/close + daftar kurasi.**

Bisnis: admin mampu memuat ≥100 lowongan pilot dengan efisien. Teknis: form field terstruktur (akomodasi, welcomed types, gaji) + validasi publish + daftar dengan filter status.

#### Scope

* List + form + publish/close flow

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature admin/jobs.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Konfirmasi close (berdampak pelamar).

**Testing Checklist:**

* [ ] Unit Test (form)
* [ ] Integration Test (N/A)
* [ ] E2E Test (alur kurasi penuh)
* [ ] Accessibility Test (axe + keyboard)
* [ ] Manual Verification (muat 10 lowongan riil uji)

**Deliverables:**

* UI kurasi lowongan

**Out of Scope:**

* Bulk import CSV (di luar PRD/SDD — dicatat sebagai usulan).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Buat→publish→close end-to-end.
* [ ] Validasi akomodasi wajib sebelum publish (server+client).
* [ ] Form panjang tetap keyboard-only nyaman (section).
* [ ] Duplikasi lowongan (copy as draft) tersedia — efisiensi kurasi.
* [ ] axe pass.

#### Dependencies

* PR-055
* PR-052

#### Risks

* Efisiensi kurasi rendah → cold-start memburuk. Mitigasi: fitur duplikasi + UX form dioptimalkan.


### PR-058 - Web Jobs Browse

#### Objective

**Daftar lowongan publik + panel filter aksesibel.**

Bisnis: menemukan lowongan tanpa AI pun mudah (US-08). Teknis: list + filter keyboard-friendly + kartu aksesibel + hasil `aria-live` count.

#### Scope

* Halaman browse + filter + pagination
* Kartu lowongan (ikon akomodasi berlabel)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature job-feed/browse.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (kartu)
* [ ] Integration Test (N/A)
* [ ] E2E Test (cari→filter→hasil)
* [ ] Accessibility Test (axe + NVDA feed)
* [ ] Manual Verification (mode teks sederhana + kontras tinggi)

**Deliverables:**

* Halaman browse publik

**Out of Scope:**

* Feed matching personal (PR-074).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Cari + filter end-to-end.
* [ ] Jumlah hasil diumumkan `aria-live` saat filter berubah.
* [ ] Kartu = satu kesatuan bagi SR (nama, perusahaan, akomodasi, lokasi).
* [ ] Filter keyboard-only + tidak ada jebakan fokus.
* [ ] Empty state ramah + saran.

#### Dependencies

* PR-056
* PR-028

#### Risks

* Minim.


### PR-059 - Job Detail Page

#### Objective

**Detail lowongan + blok inklusivitas perusahaan + slot CTA lamar.**

Bisnis: FR-4.4 — keputusan melamar berdasar informasi akomodasi lengkap. Teknis: heading benar, link company page, CTA lamar (aktif di PR-078), fokus/scroll restore saat kembali.

#### Scope

* Halaman detail + integrasi company block

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature job-feed/detail.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Konten lowongan dirender sebagai teks (tanpa HTML mentah — anti-XSS konten kurasi).

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (N/A)
* [ ] E2E Test (browse→detail→kembali)
* [ ] Accessibility Test (axe + NVDA)
* [ ] Manual Verification (konten panjang)

**Deliverables:**

* Halaman detail lowongan

**Out of Scope:**

* Tombol lamar fungsional (PR-078); simplify AI (PR-087).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Semua field terstruktur tampil (akomodasi, work_mode, gaji bila visible).
* [ ] Kembali ke list → posisi scroll & fokus pulih.
* [ ] Link ke company profile bekerja.
* [ ] Struktur heading logis (H1 jabatan…).
* [ ] axe pass + tersedia id-simple.

#### Dependencies

* PR-058
* PR-054

#### Risks

* Minim.


## Exit Criteria

Phase 08 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 9 PR (PR-051..PR-059) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 09 - Resume Builder & PDF](phase-09-resume-builder-pdf.md)
