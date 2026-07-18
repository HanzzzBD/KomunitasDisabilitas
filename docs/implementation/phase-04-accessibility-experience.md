---
phase: 4
name: "Accessibility Experience"
prs: PR-034..PR-036 (3 PR)
sprint: "3-4"
depends_on: [2, 3]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 04 - Accessibility Experience

## Overview

Fitur pembeda Accessibility Profile: API preferensi, onboarding wizard dengan preview live, panel preferensi permanen + sinkron lintas perangkat.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 03 - Web Platform Base](phase-03-web-platform-base.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-034** - API preferensi aksesibilitas
* **PR-035** - Onboarding aksesibilitas produksi-ready
* **PR-036** - Panel preferensi + jaminan sinkron

## Pull Requests

### PR-034 - Accessibility Module (Backend)

#### Objective

**GET/PUT /me/accessibility + default row saat registrasi.**

Bisnis: Accessibility Preferences Sync — preferensi mengikuti akun, bukan perangkat (PRD FR-2.2). Teknis: upsert preferensi UI non-sensitif; row default via event `auth.user_registered` (SDD §6.2).

#### Scope

* Modul accessibility (CRUD upsert)
* Subscriber event registrasi

#### Technical Notes

**Backend Changes:**

* Modul `accessibility` lahir.

**Frontend Changes:**

* Tidak ada.

**Database Changes:**

* Tidak ada (tabel dari PR-009).

**API Changes:**

* GET /api/v1/me/accessibility
* PUT /api/v1/me/accessibility

**Security Considerations:**

* requireSelf; data ini BUKAN data sensitif (dipisah dari disabilitas — by design).

**Testing Checklist:**

* [ ] Unit Test (service)
* [ ] Integration Test (event → default row; authz)
* [ ] E2E Test (via PR-035/036)
* [ ] Accessibility Test (N/A backend)
* [ ] Manual Verification (curl)

**Deliverables:**

* API preferensi aksesibilitas

**Out of Scope:**

* Ragam disabilitas (data sensitif → PR-037).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Registrasi otomatis membuat row default.
* [ ] Upsert idempotent.
* [ ] Skema field = kontrak `packages/a11y` (satu sumber).
* [ ] User lain tidak bisa membaca preferensi (authz test).
* [ ] Nilai di luar rentang ditolak dengan pesan jelas.

#### Dependencies

* PR-019

#### Risks

* Minim.


### PR-035 - Onboarding Wizard Aksesibilitas (FE)

#### Objective

**Wizard multi-step dengan preview live + consent terpisah.**

Bisnis: momen pertama produk membuktikan janji "100% aksesibel" (PRD FR-2.1, US-02). Teknis: steps skippable; pilihan ragam disabilitas (opsional, consent eksplisit — data ke PR-037); preferensi UI berubah live.

#### Scope

* Wizard (ragam → consent → preferensi → ringkasan)
* Preview live tiap perubahan
* Simpan → store + server (034/037)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature onboarding lengkap.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi; PUT profil sensitif aktif penuh setelah PR-037 — feature-flag).

**Security Considerations:**

* Consent ragam disabilitas: layar terpisah, bahasa sederhana, tidak pre-checked, bisa dilewati (PDP).

**Testing Checklist:**

* [ ] Unit Test (state wizard)
* [ ] Integration Test (N/A)
* [ ] E2E Test (selesai + skip path)
* [ ] Accessibility Test (axe per step + NVDA manual)
* [ ] Manual Verification (semua kombinasi preview)

**Deliverables:**

* Onboarding aksesibilitas produksi-ready

**Out of Scope:**

* Penyimpanan ragam disabilitas backend (PR-037).

**Rollback Strategy:**

RB-Std; wizard dapat di-bypass via flag (fallback ke defaults).

#### Acceptance Criteria

* [ ] Wizard dapat diselesaikan DAN dilewati seluruhnya.
* [ ] Setiap perubahan preferensi terlihat live sebelum simpan.
* [ ] Selesai keyboard-only (terdokumentasi tab-order).
* [ ] Selesai dengan NVDA (checklist manual).
* [ ] Melewati consent = tidak ada data disabilitas tersimpan (verifikasi network).

#### Dependencies

* PR-034
* PR-028
* PR-029

#### Risks

* Wizard terlalu panjang → drop-off. Mitigasi: maksimal 4 langkah, skippable, progress jelas.


### PR-036 - Preferences Panel + Sinkron Lintas Perangkat

#### Objective

**Panel permanen di settings + rekonsiliasi + matrix kombinasi.**

Bisnis: US-03 — ubah preferensi kapan saja dari satu tempat. Teknis: panel di settings; rekonsiliasi login perangkat lain (server = kebenaran); matrix axe 8 kombinasi preferensi utama.

#### Scope

* Panel preferensi (semua toggle + slider teks)
* Sinkron: local render pertama → server override
* Test matrix kombinasi

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Panel settings + logika rekonsiliasi final.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (rekonsiliasi)
* [ ] Integration Test (N/A)
* [ ] E2E Test (dua sesi sinkron)
* [ ] Accessibility Test (matrix axe + zoom 200%)
* [ ] Manual Verification (NVDA + low vision mode)

**Deliverables:**

* Panel preferensi + jaminan sinkron

**Out of Scope:**

* Mobile mapping (PR-091).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Ubah di perangkat A → tampak di B setelah login (E2E dua sesi).
* [ ] 8 kombinasi utama lolos axe (matrix).
* [ ] Kontras tinggi + teks 200% tidak memecah layout halaman inti.
* [ ] Reset ke default tersedia dan berfungsi.
* [ ] Panel dapat dicapai ≤ 2 interaksi dari mana pun (menu tetap).

#### Dependencies

* PR-035
* PR-033

#### Risks

* Konflik nilai local vs server. Mitigasi: aturan tunggal — server menang, local hanya untuk first paint.


## Exit Criteria

Phase 04 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 3 PR (PR-034..PR-036) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 05 - User Profile](phase-05-user-profile.md)
