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

Bisnis: Accessibility Preferences Sync — preferensi mengikuti akun, bukan perangkat (PRD FR-2.2). Teknis: upsert preferensi UI non-sensitif; row default via event `auth.user_registered` (SDD §15).

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

> Legenda bukti: **[otomatis]** dijalankan test suite repo · **[CI]** dijalankan
> gerbang `pr.yml` · **[manual]** dijalankan manusia, hasilnya tercatat ·
> **[BELUM DIJALANKAN]** instrumennya ada, hasilnya belum pernah ada.
> Kotak dicentang HANYA bila buktinya bisa ditunjuk. Tidak ada yang dicentang
> surut demi membuat daftar ini terlihat penuh.

* [x] Unit Test (service) — **[otomatis]** `apps/api/__tests__/accessibility.test.ts`; mencakup `getMe` menjawab tujuh NULL tanpa menulis, PUT sebagai gabung, dan `null` sebagai perintah hapus (migrasi 09).
* [x] Integration Test (event → baris kosong; authz) — **[otomatis]** `apps/api/__tests__/accessibility-http.test.ts`, server Express + token RS256 nyata; termasuk isolasi A↔B.
* [x] E2E Test (via PR-035/036) — **[otomatis/CI]** `apps/web/e2e/pengaturan-sinkron.spec.ts` dan `onboarding.spec.ts` menembus endpoint ini lewat klien nyata.
* [x] Accessibility Test — **N/A (backend)**. Dicentang sebagai "tidak berlaku", bukan sebagai "lulus".
* [ ] Manual Verification (curl) — **[BELUM DIJALANKAN]**. Belum pernah ada seorang pun memanggil endpoint ini dengan tangan terhadap API dev. Seluruh bukti di atas memakai Prisma palsu; tidak ada satu pun yang menyentuh PostgreSQL sungguhan, jadi migrasi 09 sendiri **belum pernah dijalankan terhadap basis data nyata**.

**Deliverables:**

* API preferensi aksesibilitas

**Out of Scope:**

* Ragam disabilitas (data sensitif → PR-037).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Registrasi otomatis membuat baris — KOSONG (tujuh NULL), bukan berisi bawaan. Baris berisi bawaan tidak bisa dibedakan dari pilihan pengguna, dan itulah yang dulu memadamkan sinyal OS saat masuk (migrasi 09).
* [x] Upsert idempotent.
* [x] Skema field = kontrak `packages/a11y` (satu sumber).
* [x] User lain tidak bisa membaca preferensi (authz test).
* [x] Nilai di luar rentang ditolak dengan pesan jelas.

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

> Legenda sama dengan PR-034 di atas.

* [x] Unit Test (state wizard) — **[otomatis]** `onboarding-mesin-langkah.test.ts`, `onboarding-identitas.test.ts` (termasuk pengerasan cadangan sesi QC-1 dan isolasi lintas-pengguna).
* [x] Integration Test — **N/A** (tidak ada lapisan integrasi di sisi ini).
* [x] E2E Test (selesai + jalur lewati) — **[otomatis/CI]** `apps/web/e2e/onboarding.spec.ts`, Chromium nyata atas hasil build produksi.
* [x] Accessibility Test — axe per langkah **[otomatis/CI]**. **NVDA: [BELUM DIJALANKAN]** — instrumennya `log/pr-035-nvda-checklist.md`, kolom Hasil masih kosong seluruhnya. Kotak ini dicentang HANYA untuk bagian axe; bagian NVDA-nya tidak.
* [ ] Manual Verification (semua kombinasi pratinjau) — **[BELUM DIJALANKAN]**.

**Deliverables:**

* Onboarding aksesibilitas produksi-ready

**Out of Scope:**

* Penyimpanan ragam disabilitas backend (PR-037).

**Rollback Strategy:**

RB-Std; wizard dapat di-bypass via flag (fallback ke defaults).

#### Acceptance Criteria

* [x] Wizard dapat diselesaikan DAN dilewati seluruhnya.
* [x] Setiap perubahan preferensi terlihat live sebelum simpan.
* [x] Selesai keyboard-only (terdokumentasi tab-order — `docs/implementation/log/pr-035-tab-order.md`).
* [x] Checklist manual NVDA tersedia (`docs/implementation/log/pr-035-nvda-checklist.md`) — **belum dijalankan**, menunggu verifikasi manusia (Windows + NVDA); jangan sebut "terverifikasi NVDA" sampai checklist itu benar-benar dijalankan.
* [x] Melewati consent = tidak ada data disabilitas tersimpan (verifikasi network).

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

> Legenda sama dengan PR-034 di atas.

* [x] Unit Test (rekonsiliasi) — **[otomatis]** `packages/a11y/__tests__/*` (74 test) + `apps/web/__tests__/sambungkan-server.test.tsx`, termasuk semantik `null`, isolasi saat keluar, dan cuplikan-sekali-per-masuk.
* [x] Integration Test — **N/A** (tidak ada lapisan integrasi di sisi ini).
* [x] E2E Test (dua sesi sinkron) — **[otomatis/CI]** `apps/web/e2e/pengaturan-sinkron.spec.ts`, dua `browser.newContext()` sungguhan.
* [x] Accessibility Test (matriks axe + zoom 200%) — **[otomatis/CI]** `aksesibilitas-matriks.spec.ts` (2³) + `kontras-skala.spec.ts` (640×512 dan 320×640). Lighthouse berjalan di job CI `a11y`. **Tidak mencakup pembaca layar.**
* [ ] Manual Verification (NVDA + mode low vision) — **[BELUM DIJALANKAN]**. Instrumennya dibuat pada remediasi Phase 04: `log/pr-036-nvda-checklist.md`. Kolom Hasil kosong seluruhnya; jangan sebut panel ini "terverifikasi NVDA" sampai seseorang benar-benar menjalankannya.

**Deliverables:**

* Panel preferensi + jaminan sinkron

**Out of Scope:**

* Mobile mapping (PR-091).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Ubah di perangkat A → tampak di B setelah login (E2E dua sesi). *(Catatan: sinkron terjadi pada login/reload berikutnya, bukan mid-sesi — sesuai spesifikasi E2E-nya sendiri. Celah parsial yang dulu tercatat di sini — reset `highContrast` true→false tidak mendarat di perangkat yang OS-nya meminta kontras lebih — SUDAH DITUTUP oleh remediasi Phase 04: `false` yang benar-benar dipilih kini terkirim sebagai `false`, bukan sebagai nilai yang tak bisa dibedakan dari "belum diatur".)*
* [x] 8 kombinasi utama lolos axe (matrix). *(Catatan: diinterpretasikan sebagai 2³ atas highContrast × reduceMotion × simpleLanguage, dicakup di halaman panel — tidak dispesifikasi eksplisit di ticket.)*
* [x] Kontras tinggi + teks 200% tidak memecah layout halaman inti. *(Diuji pada 640×512 — setara 1280px pada zoom 200% — DAN pada 320×640, ambang WCAG 1.4.10. Luberan `<h1>` "Pengaturan" yang dulu tercatat di 320px sudah diperbaiki dan dijepit spec.)*
* [x] Reset ke default tersedia dan berfungsi.
* [x] Panel dapat dicapai ≤ 2 interaksi dari mana pun (menu tetap).

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
