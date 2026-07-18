---
phase: 12
name: "Applications"
prs: PR-075..PR-079 (5 PR)
sprint: "7-8"
depends_on: [5, 7, 8, 9]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 12 - Applications

## Overview

Jalur konversi inti: apply idempotent dengan Disclosure Control per lamaran, status pipeline + confirm-hired (North Star), manajemen admin, dialog disclosure, dan tracking.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 05 - User Profile](phase-05-user-profile.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 07 - Notifications](phase-07-notifications.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 08 - Companies & Jobs](phase-08-companies-jobs.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 09 - Resume Builder & PDF](phase-09-resume-builder-pdf.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-075** - Endpoint apply dengan privasi terbukti di data
* **PR-076** - Pipeline status + North Star capture
* **PR-077** - Operasional lamaran untuk pilot
* **PR-078** - Alur lamar lengkap di web
* **PR-079** - Tracking lamaran end-to-end

## Pull Requests

### PR-075 - Apply BE — Idempotent + Disclosure Snapshot

#### Objective

**POST /jobs/:id/apply dengan Disclosure Control per lamaran.**

Bisnis: USP Disclosure Control — user memutuskan per lamaran apakah data disabilitas diungkap (PRD US-11). Teknis: Idempotency-Key Redis 24 jam + unique(user,job); `disclose_disability`; snapshot akomodasi HANYA bila true (DFD SDD §13); event `application.submitted`.

#### Scope

* Endpoint apply + idempotensi dua lapis
* Snapshot disclosure + event

#### Technical Notes

**Backend Changes:**

* `modules/applications/apply`.

**Frontend Changes:**

* Tidak ada (PR-078).

**Database Changes:**

* Tidak ada (tabel dari PR-011).

**API Changes:**

* POST /api/v1/jobs/:id/apply

**Security Considerations:**

* Sensitive Data: disclose=false → NOL jejak sensitif di record (inspeksi DB test); audit apply; rate limit endpoint.

**Testing Checklist:**

* [ ] Unit Test (service)
* [ ] Integration Test (idempoten + race + snapshot)
* [ ] E2E Test (via PR-078)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (inspeksi DB dua mode disclose)

**Deliverables:**

* Endpoint apply dengan privasi terbukti di data

**Out of Scope:**

* Status pipeline (PR-076); UI (PR-078).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Retry ganda (Idempotency-Key sama) → satu lamaran.
* [ ] Race dua request paralel → satu lamaran (unique).
* [ ] disclose=false → tidak ada field sensitif tersimpan di application (test DB).
* [ ] disclose=true → snapshot akomodasi tersimpan (bukan referensi live — perubahan profil kemudian tidak mengubah lamaran lama).
* [ ] Event submitted terbit → notifikasi admin.

#### Dependencies

* PR-039
* PR-055
* PR-060

#### Risks

* Kesalahan snapshot membocorkan data. Mitigasi: test DB eksplisit + review keamanan.


### PR-076 - Status Pipeline + Confirm-Hired (North Star)

#### Objective

**State machine status + history + withdraw + confirm-hired.**

Bisnis: North Star Metric (penempatan kerja) tercatat akurat (PRD FR-5.5). Teknis: transisi valid saja; `status_history` append; `hired_confirmed_at`; events `application.status_changed`/`application.hired_confirmed`.

#### Scope

* State machine + endpoints seeker
* Events → notifikasi

#### Technical Notes

**Backend Changes:**

* `modules/applications/status`.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /api/v1/me/applications
* POST /api/v1/me/applications/:id/withdraw
* POST /api/v1/me/applications/:id/confirm-hired

**Security Considerations:**

* requireSelf; transisi hanya oleh pihak berwenang (seeker: withdraw/confirm; admin: lainnya — PR-077).

**Testing Checklist:**

* [ ] Unit Test (state machine semua sisi)
* [ ] Integration Test (history + event)
* [ ] E2E Test (via PR-079)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (alur penuh staging)

**Deliverables:**

* Pipeline status + North Star capture

**Out of Scope:**

* Admin update (PR-077).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Transisi ilegal ditolak (mis. rejected→hired) — test state machine penuh.
* [ ] Setiap transisi menulis history {from,to,by,at}.
* [ ] confirm-hired mengisi hired_confirmed_at + event North Star.
* [ ] Withdraw hanya pada status aktif.
* [ ] Event → notifikasi user (integrasi).

#### Dependencies

* PR-075
* PR-047

#### Risks

* Konfirmasi hired jarang diisi (R10 PRD). Mitigasi: notifikasi ajakan saat offered/hired + verifikasi silang admin.


### PR-077 - Admin Applications Management

#### Objective

**Admin update status a.n. perusahaan partner (BE+FE).**

Bisnis: model operasi MVP — admin menjembatani perusahaan partner. Teknis: list per lowongan + update status + audit (actor+alasan).

#### Scope

* Endpoint admin + tabel FE + aksi status

#### Technical Notes

**Backend Changes:**

* `modules/admin/applications`.

**Frontend Changes:**

* Feature admin/applications.

**Database Changes:**

* Tidak ada.

**API Changes:**

* GET /api/v1/admin/applications?job_id&status
* PUT /api/v1/admin/applications/:id/status

**Security Considerations:**

* RBAC admin; audit wajib (alasan); admin TIDAK melihat field sensitif kecuali di-disclose (test).

**Testing Checklist:**

* [ ] Unit Test (guard transisi admin)
* [ ] Integration Test (authz + audit + visibilitas disclose)
* [ ] E2E Test (admin ubah → notif user)
* [ ] Accessibility Test (tabel + aksi keyboard)
* [ ] Manual Verification (persona seed)

**Deliverables:**

* Operasional lamaran untuk pilot

**Out of Scope:**

* Portal employer (Fase 2 produk).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Update status → user menerima notifikasi (E2E).
* [ ] Lamaran disclose=false → admin tidak melihat data akomodasi (test kontrak).
* [ ] Audit memuat actor + alasan.
* [ ] Filter per lowongan/status bekerja.
* [ ] Bulk view performa wajar (pagination).

#### Dependencies

* PR-076
* PR-052

#### Risks

* Beban admin tinggi saat pilot. Mitigasi: filter + bulk pagination; employer portal di Fase 2.


### PR-078 - Apply FE — Disclosure Dialog + One-Tap

#### Objective

**Dialog disclosure bahasa sederhana + pilih CV + lamar 1 ketuk.**

Bisnis: momen paling sensitif produk — keputusan pengungkapan harus dipahami dan tidak dipaksa. Teknis: dialog (default TIDAK, tanpa pre-checked, konsekuensi dijelaskan sederhana), pilih CV, apply idempoten, aktivasi CTA di job detail.

#### Scope

* Dialog + flow apply + status sukses

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature applications/apply.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Keputusan disclosure eksplisit; tidak ada dark pattern (kedua pilihan setara secara visual).

**Testing Checklist:**

* [ ] Unit Test (state dialog)
* [ ] Integration Test (N/A)
* [ ] E2E Test (apply kedua mode disclose)
* [ ] Accessibility Test (axe + NVDA dialog manual)
* [ ] Manual Verification (persona Tuli/Netra simulasi)

**Deliverables:**

* Alur lamar lengkap di web

**Out of Scope:**

* Tracking (PR-079).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Default = TIDAK diungkap; tidak ada pre-checked.
* [ ] Konsekuensi Ya/Tidak dijelaskan id + id-simple.
* [ ] Tanpa CV → diarahkan membuat CV (manual/AI) lalu kembali.
* [ ] Klik ganda tidak melamar dua kali.
* [ ] Dialog lolos NVDA checklist + keyboard-only.

#### Dependencies

* PR-075
* PR-059
* PR-064

#### Risks

* User tidak paham konsekuensi disclose. Mitigasi: uji copy dengan penguji disabilitas (sprint reviews).


### PR-079 - Tracking FE — Timeline + Confirm Hired

#### Objective

**"Lamaran Saya": timeline status + withdraw + konfirmasi diterima.**

Bisnis: kejelasan status = pengurang kecemasan terbesar pencari kerja; plus input North Star. Teknis: list + detail timeline (list terurut semantik), withdraw, tombol "Saya diterima 🎉" saat offered/hired.

#### Scope

* Halaman list + detail + aksi

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature applications/tracking.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (mapper timeline)
* [ ] Integration Test (N/A)
* [ ] E2E Test (apply→admin ubah→notif→confirm)
* [ ] Accessibility Test (axe + NVDA timeline)
* [ ] Manual Verification (reduce-motion mode)

**Deliverables:**

* Tracking lamaran end-to-end

**Out of Scope:**

* Mobile (PR-094).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Timeline = ordered list semantik (SR membaca kronologi benar).
* [ ] Status terbaru diumumkan saat halaman dibuka.
* [ ] Withdraw dengan konfirmasi; confirm-hired satu tap + perayaan aksesibel (bukan animasi-saja).
* [ ] Navigasi dari notifikasi mendarat di lamaran tepat.
* [ ] Keyboard-only penuh.

#### Dependencies

* PR-076
* PR-078
* PR-050

#### Risks

* Minim.


## Exit Criteria

Phase 12 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 5 PR (PR-075..PR-079) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 13 - Admin Dashboard & Analytics](phase-13-admin-analytics.md)
