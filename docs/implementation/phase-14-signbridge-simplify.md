---
phase: 14
name: "SignBridge v1 & Simplify"
prs: PR-084..PR-087 (4 PR)
sprint: "7-8"
depends_on: [1, 2, 6, 8, 9]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 14 - SignBridge v1 & Simplify

## Overview

BISINDO Support nyata di MVP (kamus video SignBridge v1) dan simplify-text AI untuk konten dinamis.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 06 - AI Gateway](phase-06-ai-gateway.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 08 - Companies & Jobs](phase-08-companies-jobs.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 09 - Resume Builder & PDF](phase-09-resume-builder-pdf.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-084** - API kamus BISINDO
* **PR-085** - UI pengelolaan kamus
* **PR-086** - Kamus BISINDO publik
* **PR-087** - Fitur simplify konten dinamis

## Pull Requests

### PR-084 - SignBridge BE — Kamus Video (sign_videos)

#### Objective

**CRUD admin draft→published + validasi caption/transkrip + pencarian publik.**

Bisnis: BISINDO Support nyata di MVP (ADR-010 v1) — bukan sekadar roadmap. Teknis: modul `signbridge`; publish DITOLAK tanpa caption+transkrip; FTS phrase publik.

#### Scope

* CRUD + lifecycle + validasi publish
* Endpoint pencarian publik

#### Technical Notes

**Backend Changes:**

* Modul `signbridge`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (tabel dari PR-011).

**API Changes:**

* GET /api/v1/sign-videos?query&category
* GET/POST /api/v1/admin/sign-videos ; PUT /api/v1/admin/sign-videos/:id
* POST /api/v1/admin/sign-videos/:id/publish

**Security Considerations:**

* RBAC admin untuk mutasi; validasi server (caption+transkrip) = kontrol aksesibilitas, bukan opsional.

**Testing Checklist:**

* [ ] Unit Test (validasi)
* [ ] Integration Test (lifecycle + search)
* [ ] E2E Test (via PR-086)
* [ ] Accessibility Test (N/A backend)
* [ ] Manual Verification (curl)

**Deliverables:**

* API kamus BISINDO

**Out of Scope:**

* SignBridge v2 computer vision (Fase 3, ADR-010 gate).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Publish tanpa caption/transkrip → 422 (server-enforced).
* [ ] Pencarian frasa menemukan video (FTS test).
* [ ] Hanya published tampil publik.
* [ ] Kategori tervalidasi.
* [ ] Audit publish.

#### Dependencies

* PR-019
* PR-011

#### Risks

* Konten bergantung juru bahasa (celah anggaran PRD §17). Mitigasi: modul siap; konten via program hibah/CSR.


### PR-085 - Admin Sign-Videos FE — Upload

#### Objective

**Upload presigned R2 + thumbnail + metadata + publish.**

Bisnis: tim konten (non-engineer) mampu mengelola kamus. Teknis: upload langsung ke R2 via presigned, progress aksesibel, form metadata + file caption (vtt) + transkrip.

#### Scope

* UI admin kamus + upload flow

#### Technical Notes

**Backend Changes:**

* Endpoint presign untuk video/caption/thumbnail.

**Frontend Changes:**

* Feature admin/sign-videos.

**Database Changes:**

* Tidak ada.

**API Changes:**

* POST /api/v1/admin/sign-videos/presign

**Security Considerations:**

* Presign dibatasi tipe & ukuran file; hanya admin.

**Testing Checklist:**

* [ ] Unit Test (validasi file)
* [ ] Integration Test (presign)
* [ ] E2E Test (upload→publish)
* [ ] Accessibility Test (axe + progress SR)
* [ ] Manual Verification (video nyata staging)

**Deliverables:**

* UI pengelolaan kamus

**Out of Scope:**

* Transcoding video (pakai file final dari tim konten).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Upload video+vtt+thumbnail → publish end-to-end (MinIO).
* [ ] Progress upload diumumkan `aria-live` (persen).
* [ ] Validasi tipe/ukuran di presign (server).
* [ ] Form keyboard-only + axe pass.
* [ ] Gagal upload → pesan jelas + retry.

#### Dependencies

* PR-084
* PR-062
* PR-052

#### Risks

* File besar di koneksi lambat. Mitigasi: batas ukuran + panduan format ke tim konten.


### PR-086 - Kamus BISINDO FE — Pencarian + Player

#### Objective

**Halaman kamus: cari, kategori, player caption-on + transkrip.**

Bisnis: pengguna Tuli mendapat nilai BISINDO sejak MVP. Teknis: grid hasil, player `<video>` dengan track caption default menyala, transkrip tampil, kontrol keyboard penuh.

#### Scope

* Halaman kamus publik + player

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature signbridge.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Video via presigned/CDN — tanpa listing bucket.

**Testing Checklist:**

* [ ] Unit Test (kartu)
* [ ] Integration Test (N/A)
* [ ] E2E Test (cari→tonton)
* [ ] Accessibility Test (axe + player keyboard + caption manual)
* [ ] Manual Verification (penguji Tuli — sprint review)

**Deliverables:**

* Kamus BISINDO publik

**Out of Scope:**

* Avatar/penerjemah otomatis (Fase 3).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Cari→tonton end-to-end.
* [ ] Caption default menyala; transkrip tampil di bawah.
* [ ] Player operable penuh keyboard (play/pause/seek/volume).
* [ ] Grid hasil aksesibel (kartu berlabel).
* [ ] axe pass + reduce-motion dihormati (tanpa autoplay).

#### Dependencies

* PR-084

#### Risks

* Minim.


### PR-087 - Simplify-Text AI (Gap G1)

#### Objective

**POST /ai/simplify-text + tombol "Sederhanakan" di job detail.**

Bisnis: konten dinamis (deskripsi lowongan) dapat diakses pengguna autisme/kognitif — melengkapi mode id-simple statis (SDD §4.3, §11). Teknis: prompt simplify.v1, kuota 20/hari, cache per konten, degradasi = tombol disembunyikan dengan penjelasan.

#### Scope

* Endpoint + prompt + FE tombol & tampilan hasil

#### Technical Notes

**Backend Changes:**

* `modules/ai/simplify`.

**Frontend Changes:**

* Tombol + hasil berlabel "disederhanakan oleh AI" + kembali ke asli.

**AI Changes:**

* Prompt `simplify.v1` (output teks polos, larangan mengubah fakta gaji/syarat).

**Database Changes:**

* Tidak ada.

**API Changes:**

* POST /api/v1/ai/simplify-text

**Security Considerations:**

* Injection guard (konten lowongan = data); output teks polos; kuota.

**Testing Checklist:**

* [ ] Unit Test (cache key)
* [ ] Integration Test (kuota + cache)
* [ ] E2E Test (tombol → hasil → kembali)
* [ ] Accessibility Test (axe + pengumuman SR)
* [ ] Manual Verification (kualitas hasil sampel)

**Deliverables:**

* Fitur simplify konten dinamis

**Out of Scope:**

* Simplify seluruh halaman otomatis.

**Rollback Strategy:**

RB-Std; flag mematikan fitur tanpa efek lain.

#### Acceptance Criteria

* [ ] Konten sama → cache hit (tanpa panggilan kedua).
* [ ] Hasil diumumkan SR saat menggantikan konten; toggle kembali ke asli.
* [ ] Fakta kunci (gaji, lokasi, syarat) tidak berubah (test sampling + guard prompt).
* [ ] Degraded → tombol hilang + penjelasan; konten asli tetap.
* [ ] Kuota 20/hari ditegakkan.

#### Dependencies

* PR-044
* PR-059

#### Risks

* AI mengubah makna. Mitigasi: label jelas "oleh AI" + akses satu-klik ke teks asli.


## Exit Criteria

Phase 14 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 4 PR (PR-084..PR-087) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 15 - Mobile (Android)](phase-15-mobile-android.md)
