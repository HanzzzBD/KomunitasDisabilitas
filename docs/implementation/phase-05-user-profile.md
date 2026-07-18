---
phase: 5
name: "User Profile"
prs: PR-037..PR-040 (4 PR)
sprint: "4-5"
depends_on: [1, 2, 3]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 05 - User Profile

## Overview

Profil pencari kerja: data sensitif terenkripsi ber-consent, sub-entitas karier, pemisahan akses safe/sensitive ber-audit, dan form multi-bagian.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 03 - Web Platform Base](phase-03-web-platform-base.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-037** - API profil dengan proteksi data spesifik UU PDP
* **PR-038** - API data karier lengkap
* **PR-039** - Kontrol akses sensitif terpusat
* **PR-040** - UI profil produksi-ready

## Pull Requests

### PR-037 - Profiles BE — Data Sensitif Terenkripsi + Consent

#### Objective

**seeker_profiles CRUD dengan enkripsi field + consent gate.**

Bisnis: pengguna aman menyimpan data disabilitas & akomodasi (fondasi matching + disclosure). Teknis: enkripsi via core/crypto di service layer; tulis field sensitif tanpa `consent_sensitive_at` → 403; `disclosure_default` (SDD §6.2, ADR-007).

#### Scope

* GET/PUT /me/profile (headline, lokasi, preferensi, sensitif)
* Consent gate + pencabutan consent (hapus field sensitif)
* Taksonomi akomodasi di packages/schemas

#### Technical Notes

**Backend Changes:**

* Modul `profiles` core.

**Frontend Changes:**

* Tidak ada (PR-040).

**Database Changes:**

* Tidak ada (tabel dari PR-010).

**API Changes:**

* GET /api/v1/me/profile
* PUT /api/v1/me/profile

**Security Considerations:**

* Encryption field sensitif; Sensitive Data tidak pernah di response list/publik; PDP consent eksplisit + dapat dicabut; Audit tulis/hapus sensitif.

**Testing Checklist:**

* [ ] Unit Test (service enkripsi/consent)
* [ ] Integration Test (roundtrip + raw ciphertext + authz)
* [ ] E2E Test (via PR-040)
* [ ] Accessibility Test (N/A backend)
* [ ] Manual Verification (psql inspeksi bytea)

**Deliverables:**

* API profil dengan proteksi data spesifik UU PDP

**Out of Scope:**

* Sub-entitas karier (PR-038); akses admin (PR-039).

**Rollback Strategy:**

RB-Std; data terenkripsi tetap terbaca lintas versi kode (format berversi).

#### Acceptance Criteria

* [ ] Kolom sensitif di DB terbukti ciphertext (test baca raw).
* [ ] Tulis sensitif tanpa consent → 403 pesan sederhana.
* [ ] Cabut consent → field sensitif terhapus + audit.
* [ ] Pemilik membaca kembali data terdekripsi dengan benar.
* [ ] Taksonomi akomodasi tervalidasi zod (nilai liar ditolak).

#### Dependencies

* PR-013
* PR-019
* PR-010

#### Risks

* Kebocoran via serialisasi tak sengaja. Mitigasi: tipe response eksplisit tanpa field sensitif kecuali endpoint owner.


### PR-038 - Profiles BE — Experiences/Educations/Skills

#### Objective

**CRUD sub-entitas karier + event profile.updated.**

Bisnis: bahan CV & matching. Teknis: tiga sub-entitas + event `profile.updated` (konsumen embedding PR-069).

#### Scope

* CRUD tiga entitas
* Event pada setiap mutasi profil/sub-entitas

#### Technical Notes

**Backend Changes:**

* `profiles/{experiences,educations,skills}`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET/POST /api/v1/me/experiences ; PUT/DELETE /api/v1/me/experiences/:id
* (pola sama untuk /me/educations dan /me/skills)

**Security Considerations:**

* requireSelf semua; Input Validation tanggal (mulai ≤ selesai).

**Testing Checklist:**

* [ ] Unit Test (validasi)
* [ ] Integration Test (CRUD + event)
* [ ] E2E Test (via PR-040)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (curl)

**Deliverables:**

* API data karier lengkap

**Out of Scope:**

* Embedding (PR-069).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] CRUD ketiganya lengkap + authz.
* [ ] `profile.updated` terbit pada setiap mutasi (assert event).
* [ ] Validasi tanggal & panjang teks.
* [ ] Urutan default masuk akal (terbaru dulu).
* [ ] Cascade delete saat akun dihapus (test).

#### Dependencies

* PR-037

#### Risks

* Minim.


### PR-039 - findProfileSafe vs findProfileSensitive

#### Objective

**Pemisahan akses data sensitif ber-alasan + audit.**

Bisnis: kepercayaan — akses data disabilitas tidak pernah terjadi diam-diam. Teknis: dua fungsi repo; `findProfileSensitive(reason)` wajib alasan → audit; tipe TS mencegah field sensitif bocor ke response umum (SDD §8.2).

#### Scope

* Refactor repo profiles ke dua jalur
* Audit setiap panggilan sensitive
* Akses admin (support) melalui jalur ini

#### Technical Notes

**Backend Changes:**

* Repo profiles + tipe `SafeProfile`/`SensitiveProfile`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (internal).

**Security Considerations:**

* Audit Logging wajib jalur sensitif; RBAC admin-only untuk akses non-owner; type-level guard.

**Testing Checklist:**

* [ ] Unit Test (tipe via dtslint/expect-type)
* [ ] Integration Test (audit rows)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (inspeksi audit)

**Deliverables:**

* Kontrol akses sensitif terpusat

**Out of Scope:**

* Disclosure per lamaran (PR-075).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Setiap panggilan sensitive → baris audit dengan alasan (test).
* [ ] Response API umum secara TIPE tidak dapat memuat field sensitif (compile-time).
* [ ] Admin tanpa alasan → error.
* [ ] Matching memakai jalur sensitive dengan alasan baku "matching" (audit teragregasi harian, tidak per-request).
* [ ] Dokumentasi kapan memakai jalur mana.

#### Dependencies

* PR-037
* PR-014

#### Risks

* Audit matching terlalu bising. Mitigasi: agregasi harian by design (tercantum di AC).


### PR-040 - Profile FE — Form Multi-Bagian + Consent + Akomodasi

#### Objective

**Halaman profil: identitas karier, sensitif ber-consent, editor akomodasi.**

Bisnis: US-02/US-06 — profil lengkap termasuk kebutuhan akomodasi. Teknis: form multi-bagian simpan-per-bagian (RHF+zod), langkah consent bahasa sederhana, editor taksonomi + teks bebas.

#### Scope

* Form profil (bagian: dasar, ragam+akomodasi ber-consent, karier)
* Integrasi wizard PR-035 (bagian sensitif kini aktif penuh)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature profile lengkap.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Consent tidak pre-checked; indikator jelas data mana yang sensitif; pencabutan consent dari halaman yang sama.

**Testing Checklist:**

* [ ] Unit Test (form state)
* [ ] Integration Test (N/A)
* [ ] E2E Test (isi profil penuh + cabut consent)
* [ ] Accessibility Test (axe + NVDA form multi-bagian)
* [ ] Manual Verification (mode teks sederhana)

**Deliverables:**

* UI profil produksi-ready

**Out of Scope:**

* Editor CV (PR-061).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Profil lengkap dapat diisi & diedit end-to-end.
* [ ] Simpan-per-bagian (kegagalan satu bagian tidak menghanguskan lainnya).
* [ ] Consent dapat diberikan DAN dicabut dari UI (verifikasi network + DB).
* [ ] Form keyboard-only + NVDA checklist lulus.
* [ ] Pesan error per-field bahasa sederhana.

#### Dependencies

* PR-037
* PR-038
* PR-028

#### Risks

* Form panjang melelahkan. Mitigasi: bagian collapsible + progress + simpan-per-bagian.


## Exit Criteria

Phase 05 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 4 PR (PR-037..PR-040) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 06 - AI Gateway](phase-06-ai-gateway.md)
