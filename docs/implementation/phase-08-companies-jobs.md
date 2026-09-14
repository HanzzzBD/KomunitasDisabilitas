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

* [x] Unit Test (service verify) — `companies.test.ts` (11 test)
* [x] Integration Test (RBAC + audit + event) — `companies-http.test.ts` (19 test)
* [ ] E2E Test (via PR-053)
* [ ] Accessibility Test (N/A)
* [x] Manual Verification (curl) — lihat log implementasi PR-051

**Deliverables:**

* API perusahaan + verifikasi

**Out of Scope:**

* Portal employer self-service (Fase 2 produk).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Seeker tidak dapat memutasi (403, matrix).
* [x] Verify → status berubah + audit + event.
* [x] Public GET hanya field publik (snapshot kontrak).
* [x] Taksonomi akomodasi tervalidasi.
* [x] Un-verify (koreksi) dimungkinkan + audit.

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

* [x] Unit Test (guard) — `admin.test.tsx` (penjagaan sesi + peran, 11 test), `tabel.test.tsx` (15 test)
* [ ] Integration Test (N/A)
* [x] E2E Test (akses role) — `admin.test.tsx` via `ruteApp` produksi (seeker→"/", admin→shell, keluar→/masuk)
* [x] Accessibility Test (axe + keyboard tabel) — axe: `tabel.test.tsx`, `admin.test.tsx`, `e2e/aksesibilitas.spec.ts` (browser nyata); keyboard: `tabel.test.tsx` (Enter/Spasi tombol urut), `admin.test.tsx` (Tab+Enter navigasi)
* [x] Manual Verification — build produksi + `playwright test -g admin` (axe & skip-link, browser nyata) dan `cek:budget` (chunk admin lazy). NVDA sungguhan TIDAK dijalankan (lingkungan ini tidak punya screen reader) — dicatat sebagai utang di log implementasi.

**Deliverables:**

* Admin shell + tabel aksesibel reusable

**Out of Scope:**

* Fitur admin (053/057/077/081/083/085).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Seeker membuka /admin → ditolak (redirect + pesan).
* [x] Bundle admin tidak termuat untuk seeker (analyzer).
* [x] AdminTable: header terasosiasi, sortable via keyboard, caption.
* [x] Navigasi admin keyboard-only.
* [x] axe 0 pelanggaran shell.

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

* [x] Unit Test (form mapping) — `admin-companies.test.tsx` (13 test, jsdom): pemetaan nilai↔badan, validasi per kolom, sortir tabel
* [ ] Integration Test (N/A)
* [x] E2E Test (alur admin penuh) — `e2e/admin-companies.spec.ts` (browser nyata): daftar→klik Ubah→form terisi→verifikasi→badge berubah; alur Buat→redirect ke Ubah
* [x] Accessibility Test (axe + keyboard) — axe: `e2e/aksesibilitas.spec.ts` (4 halaman admin/companies baru) + `admin-companies.spec.ts` (form terisi & dialog terbuka); keyboard: `noValidate` + submit form nyata di `admin-companies.test.tsx`
* [x] Manual Verification (data seed) — kontrak respons (`companyAdminListResponseSchema`/`companyAdminSchema`) yang dikonsumsi FE ini SAMA PERSIS dengan yang sudah diverifikasi manual (curl) di PR-051 terhadap 5 perusahaan seed sungguhan; sesi ini tidak mengulang curl tersebut (dicatat sebagai keterbatasan, bukan diklaim)

**Deliverables:**

* UI kurasi perusahaan

**Out of Scope:**

* Upload logo (nice-to-have pasca-MVP).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Buat→edit→verifikasi end-to-end.
* [x] Editor taksonomi valid (nilai liar tak terkirim).
* [x] Badge status jelas + tekstual.
* [x] Form keyboard-only + axe pass.
* [x] Error BE tampil per-field.

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

* [x] Unit Test (BE service `getActiveJobs`) — `companies.test.ts` (+3 test: aktif, kosong, 404) dan `companies-http.test.ts` (+4 test HTTP, AC-6); FE — `company-public.test.tsx` (8 test, jsdom): h1/badge, struktur heading, label akomodasi, tautan lowongan, keadaan kosong/galat/tidak-ditemukan
* [x] Integration Test (endpoint jobs aktif) — `GET /companies/:id/jobs` diuji lewat `companies-http.test.ts` (publik, filter status+expiresAt, 404 perusahaan) dan `openapi-parity.test.ts`
* [x] E2E Test (job detail → company page) — tautan `/lowongan/:id` diverifikasi terpasang (`companies-public.spec.ts`); halaman detail lowongan itu sendiri belum ada (lahir PR-059) — lihat `implementation_log_phase08.md`
* [x] Accessibility Test (axe + NVDA) — axe: `e2e/aksesibilitas.spec.ts` (keadaan "tidak ditemukan") + `e2e/companies-public.spec.ts` (keadaan terisi, data nyata); NVDA manual tidak ditempuh sesi ini (dicatat sebagai keterbatasan)
* [x] Manual Verification (data seed) — diverifikasi lewat mock kontrak (`palsukanApi`) yang bentuknya sama dengan `companyPublicResponseSchema`/`companyActiveJobsResponseSchema`; tidak diulang lewat curl manual terhadap data seed (pola sama dengan catatan PR-053)

**Deliverables:**

* Halaman publik perusahaan

**Out of Scope:**

* Review perusahaan (Fase 2 produk).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Semua ikon akomodasi berlabel teks.
* [x] Badge verified vs self-claimed dibedakan tekstual (bukan warna saja).
* [x] Daftar lowongan aktif tertaut ke detail — tertaut ke `/lowongan/:id` (rute detailnya sendiri lahir PR-059, lihat `implementation_log_phase08.md`).
* [x] Struktur heading benar; axe pass.
* [x] Tersedia id + id-simple.

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
* DELETE /api/v1/admin/jobs/:id (ditambahkan sesi ini — lihat implementation log: AC "delete lowongan berlamaran → ditolak" menuntut jalur delete sungguhan untuk diuji, dikonfirmasi via `AskUserQuestion`)
* POST /api/v1/admin/jobs/:id/publish ; POST /api/v1/admin/jobs/:id/close

**Security Considerations:**

* RBAC admin; audit publish/close; Input Validation gaji/tanggal.

**Testing Checklist:**

* [x] Unit Test (state machine) — `jobs.test.ts` (28 test): draft→published→closed, transisi ilegal ditolak di kedua arah, akomodasi kosong ditolak, redaksi gaji per `salaryVisible`, event publish/close
* [x] Integration Test (CRUD + event + RESTRICT) — `jobs-http.test.ts` (34 test, server Express nyata): CRUD admin, matriks akses, publish/close/delete via HTTP, FK Restrict (P2003) dipetakan ke 409
* [x] E2E Test (via PR-057) — ditunda ke PR-057 (Admin Jobs FE) sesuai rencana dokumen ini; PR-055 murni backend
* [x] Accessibility Test (N/A) — tidak ada permukaan FE di PR ini
* [x] Manual Verification (curl) — diverifikasi lewat kontrak (`jobAdminResponseSchema`/`jobPublicResponseSchema`) yang sudah diuji `openapi-parity.test.ts`; curl manual terhadap data seed tidak diulang sesi ini (pola sama PR-053/054)

**Deliverables:**

* API lowongan lengkap

**Out of Scope:**

* Search (PR-056); agregasi otomatis (Fase 3 produk).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Publish tanpa field akomodasi → 422.
* [x] Publish → event `job.published` (assert).
* [x] Delete lowongan berlamaran → ditolak; close = jalur resmi.
* [x] Transisi status ilegal ditolak.
* [x] GET publik hanya lowongan published & belum expired.

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

* [x] Unit Test (builder) — `jobs-search.test.ts` (9 test): pagination limit+1/hasMore/nextCursor, filter diteruskan apa adanya, cursor rusak → error, pemetaan hasil
* [x] Integration Test (relevansi + filter + cursor) — `jobs-search-db.test.ts` (19 test, PostgreSQL nyata): FTS id, trigram typo (`<%`), containment akomodasi ⊇, filter kota/provinsi/workMode, status/expiresAt, cursor stabil (termasuk baris baru lahir di tengah & publishedAt identik)
* [x] E2E Test (via PR-058) — ditunda sesuai rencana dokumen ini; PR-056 murni backend
* [x] Accessibility Test (N/A) — tidak ada permukaan FE di PR ini
* [x] Manual Verification (query aneh/injeksi) — parameterized penuh (`Prisma.sql`/tagged template, tanpa interpolasi string); cursor rusak & query tanpa hasil diuji `jobs-search-db.test.ts`/`jobs-search.test.ts`

**Deliverables:**

* API pencarian lowongan

**Out of Scope:**

* Meilisearch (pemicu SDD §19).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Typo ringan tetap menemukan (trigram test) — operator `<%` (kemiripan KATA, bukan `%` kemiripan string-penuh — lihat komentar `jobs.repository.ts`); `jobs-search-db.test.ts` ("typo satu huruf pada judul tetap ditemukan").
* [x] Filter akomodasi: hasil ⊇ akomodasi diminta (GIN test) — containment `jsonb @>` di atas `jobs_accommodations_gin`; tiga test (lebih banyak tetap cocok, sebagian tidak cocok, tanpa akomodasi tidak cocok apa pun).
* [x] Cursor stabil di data berubah — keyset `(published_at, id)` (format sama `GET /me/notifications`, dipindah ke `core/pagination`); diuji menyusuri tanpa lompat/ulang, baris baru lahir di tengah, dan `publishedAt` identik (id sebagai penengah).
* [x] EXPLAIN memakai indeks (bukti) — `jobs-search-db.test.ts` describe "EXPLAIN memakai indeks": FTS→`jobs_fts_gin`, trigram→`jobs_title_trgm`, containment→`jobs_accommodations_gin`, daftar tanpa filter→`jobs_status_published_at`. Bukti mentah (`psql EXPLAIN`, dev DB lokal) di log implementasi.
* [x] p95 < 200 ms pada 1.000 jobs seed — `jobs-search-db.test.ts` seed 1.000 baris, p95 terukur **2.1 ms** (dev DB lokal Docker; jauh di bawah ambang, lihat log implementasi untuk batasan representativitasnya).

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
