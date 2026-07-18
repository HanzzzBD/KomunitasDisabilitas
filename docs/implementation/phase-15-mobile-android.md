---
phase: 15
name: "Mobile (Android)"
prs: PR-088..PR-095 (8 PR)
sprint: "6-8"
depends_on: [1, 2, 3, 4, 7, 9, 11, 12]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 15 - Mobile (Android)

## Overview

Aplikasi Android (Expo): bootstrap EAS, komponen native aksesibel, dan paritas seluruh alur inti seeker (auth, onboarding, profil, CV, feed, apply, tracking, notifikasi).

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 03 - Web Platform Base](phase-03-web-platform-base.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 04 - Accessibility Experience](phase-04-accessibility-experience.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 07 - Notifications](phase-07-notifications.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 09 - Resume Builder & PDF](phase-09-resume-builder-pdf.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 11 - Matching Engine](phase-11-matching-engine.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 12 - Applications](phase-12-applications.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-088** - Aplikasi Android skeleton ter-build
* **PR-089** - Fondasi UI mobile aksesibel + guard lint
* **PR-090** - Login Android produksi-ready
* **PR-091** - Onboarding + theme aksesibilitas mobile
* **PR-092** - Profil & CV mobile
* **PR-093** - Discovery mobile lengkap
* **PR-094** - Alur konversi Android lengkap
* **PR-095** - Notifikasi mobile lengkap

## Pull Requests

### PR-088 - Expo Bootstrap + EAS

#### Objective

**apps/mobile: navigation, SecureStore, deep link, EAS internal.**

Bisnis: jangkauan Android — mayoritas pengguna target (ADR-011). Teknis: Expo managed, React Navigation, SecureStore untuk refresh token, deep link scheme, EAS build profile internal.

#### Scope

* Shell app + navigasi + SecureStore
* `eas.json` internal profile + build pertama

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada (web).

**Mobile Changes:**

* Shell aplikasi mobile lengkap.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Refresh token hanya di SecureStore (bukan AsyncStorage); scheme deep link tervalidasi.

**Testing Checklist:**

* [ ] Unit Test (storage wrapper)
* [ ] Integration Test (N/A)
* [ ] E2E Test (Maestro: boot smoke)
* [ ] Accessibility Test (TalkBack smoke shell)
* [ ] Manual Verification (device fisik)

**Deliverables:**

* Aplikasi Android skeleton ter-build

**Out of Scope:**

* Layar fitur (090+); iOS (Fase 2 produk).

**Rollback Strategy:**

RB-Std (build channel internal; tidak menyentuh produksi web).

#### Acceptance Criteria

* [ ] Build EAS internal sukses & terinstal di device uji.
* [ ] SecureStore roundtrip token teruji.
* [ ] Deep link scheme membuka app.
* [ ] `packages/api-client` & `schemas` terpakai tanpa patch (bukti platform-agnostic).
* [ ] Boot < 3 dtk di device kelas menengah.

#### Dependencies

* PR-005

#### Risks

* Perbedaan perilaku Expo vs web. Mitigasi: logika bisnis di packages shared, UI native terpisah.


### PR-089 - packages/ui Native + Lint A11y Label

#### Objective

**Komponen RN inti + aturan lint accessibilityLabel wajib.**

Bisnis: janji aksesibel berlaku juga di Android (TalkBack). Teknis: Button, Input, Card, Dialog RN dengan `accessibilityLabel/Role` wajib; lint rule custom: komponen interaktif tanpa label → error (SDD §4.2).

#### Scope

* 4 komponen native token-aware
* Lint rule + fixture

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* `packages/ui/native` + lint.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (render + props)
* [ ] Integration Test (N/A)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (TalkBack checklist)
* [ ] Manual Verification (device fisik + TalkBack)

**Deliverables:**

* Fondasi UI mobile aksesibel + guard lint

**Out of Scope:**

* Komponen domain.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Komponen interaktif tanpa label → lint error (fixture).
* [ ] Target sentuh mengikuti token (44→56dp).
* [ ] TalkBack membaca role+label benar (checklist per komponen).
* [ ] Token a11y (font scale dsb.) diterapkan.
* [ ] Dialog: fokus aksesibilitas pindah masuk/keluar benar.

#### Dependencies

* PR-088

#### Risks

* Perilaku TalkBack antar-versi Android. Mitigasi: uji di 2 versi Android target.


### PR-090 - Mobile Auth

#### Objective

**Login OTP + Google (PKCE) + sesi.**

Bisnis: pintu masuk Android setara web. Teknis: layar login OTP (autofill kode), Google via PKCE, guarded stack, refresh via api-client.

#### Scope

* Layar login/verify + session store

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* Feature auth mobile.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* PKCE wajib; token di SecureStore; tidak log token.

**Testing Checklist:**

* [ ] Unit Test (session store)
* [ ] Integration Test (N/A)
* [ ] E2E Test (Maestro OTP mock)
* [ ] Accessibility Test (TalkBack alur login)
* [ ] Manual Verification (device fisik)

**Deliverables:**

* Login Android produksi-ready

**Out of Scope:**

* Biometrik (pasca-MVP, PRD opsi tak dipilih).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] OTP end-to-end di build internal (sender uji).
* [ ] Google login end-to-end.
* [ ] SMS/OTP autofill bekerja (Android SMS Retriever bila tersedia).
* [ ] Alur selesai dengan TalkBack (checklist).
* [ ] Sesi bertahan restart app (refresh valid).

#### Dependencies

* PR-089
* PR-018

#### Risks

* Fragmentasi OEM Android. Mitigasi: uji 2 vendor umum.


### PR-091 - Mobile Onboarding + ThemeProvider A11y

#### Objective

**Wizard aksesibilitas paritas + mapping setting OS Android.**

Bisnis: Accessibility Profile konsisten lintas platform (ADR-008). Teknis: wizard paritas PR-035; ThemeProvider memetakan preferensi + `AccessibilityInfo` OS (font scale, reduce motion); sinkron store shared.

#### Scope

* Wizard + theme mapping + sinkron server

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* Feature onboarding + theme.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Consent ragam disabilitas paritas web (terpisah, tidak pre-checked).

**Testing Checklist:**

* [ ] Unit Test (mapping)
* [ ] Integration Test (sinkron)
* [ ] E2E Test (Maestro wizard)
* [ ] Accessibility Test (TalkBack + font scale)
* [ ] Manual Verification (ubah setting OS live)

**Deliverables:**

* Onboarding + theme aksesibilitas mobile

**Out of Scope:**

* Panel settings lengkap mobile (ikut layar profil PR-092 secukupnya).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Preferensi web tercermin di mobile pasca-login (dan sebaliknya).
* [ ] Setting OS dihormati bila user belum eksplisit.
* [ ] Preview live paritas web.
* [ ] Wizard selesai dengan TalkBack.
* [ ] Font scale OS ekstrem (200%) tidak memecah layar inti.

#### Dependencies

* PR-090
* PR-026
* PR-034

#### Risks

* Konflik OS vs preferensi app. Mitigasi: aturan prioritas sama dengan web (eksplisit > OS).


### PR-092 - Mobile Profile + CV Manual

#### Objective

**Form profil + consent + editor CV manual (paritas).**

Bisnis: seeker lengkap dari Android tanpa perlu web. Teknis: paritas PR-040/061; tanpa chat AI di mobile MVP (web = jalur utama CV AI — keputusan v2.0 dipertahankan); tanpa gesture-only.

#### Scope

* Layar profil (semua bagian) + editor CV manual

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* Feature profile + resume mobile.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Paritas consent & disclosure_default; data sensitif tidak di-cache lokal tanpa perlu.

**Testing Checklist:**

* [ ] Unit Test (reuse hooks shared)
* [ ] Integration Test (N/A)
* [ ] E2E Test (Maestro profil+CV)
* [ ] Accessibility Test (TalkBack)
* [ ] Manual Verification (device fisik)

**Deliverables:**

* Profil & CV mobile

**Out of Scope:**

* Chat AI mobile (segera pasca-RC — dicatat roadmap).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Profil + CV lengkap dibuat dari mobile.
* [ ] Reorder via tombol (tanpa drag-only).
* [ ] Consent paritas (beri & cabut).
* [ ] TalkBack checklist form multi-bagian lulus.
* [ ] Unduh PDF CV bekerja (buka viewer).

#### Dependencies

* PR-091
* PR-060

#### Risks

* Form panjang di layar kecil. Mitigasi: section per layar.


### PR-093 - Mobile Feed + Job Detail

#### Objective

**Feed matching + detail lowongan (paritas).**

Bisnis: discovery utama di perangkat utama pengguna. Teknis: paritas PR-074/059 — kartu skor+alasan, degradasi banner, filter, detail + company block.

#### Scope

* Layar feed + browse/filter + detail

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* Feature feed mobile.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (reuse)
* [ ] Integration Test (N/A)
* [ ] E2E Test (Maestro feed→detail)
* [ ] Accessibility Test (TalkBack feed)
* [ ] Manual Verification (3G throttling)

**Deliverables:**

* Discovery mobile lengkap

**Out of Scope:**

* Apply (PR-094).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Feed + filter + detail end-to-end.
* [ ] Kartu satu kesatuan bagi TalkBack.
* [ ] Degraded banner paritas.
* [ ] Refresh alternatif tombol (bukan pull-to-refresh saja).
* [ ] Kembali dari detail memulihkan posisi list.

#### Dependencies

* PR-092
* PR-073

#### Risks

* Minim.


### PR-094 - Mobile Apply + Tracking + Push Deep Link

#### Objective

**Disclosure dialog + apply + timeline + push membuka lamaran.**

Bisnis: alur konversi penuh di Android (gate paritas MVP). Teknis: paritas PR-078/079 + registrasi FCM (PR-048) + notifikasi membuka layar lamaran; track funnel (util PR-082).

#### Scope

* Apply flow + tracking + push handling + analytics mobile

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* Feature applications mobile + push.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Disclosure paritas (default TIDAK, eksplisit); deep link tervalidasi (tidak membuka entitas milik user lain — requireSelf BE tetap benteng).

**Testing Checklist:**

* [ ] Unit Test (deep link parser)
* [ ] Integration Test (N/A)
* [ ] E2E Test (Maestro apply→status→push)
* [ ] Accessibility Test (TalkBack alur penuh)
* [ ] Manual Verification (push nyata staging)

**Deliverables:**

* Alur konversi Android lengkap

**Out of Scope:**

* Notification center layar penuh (PR-095).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Apply kedua mode disclose end-to-end.
* [ ] Push → tap → mendarat di lamaran tepat (cold & warm start).
* [ ] Timeline + confirm-hired paritas.
* [ ] Alur lamar→tracking selesai penuh dengan TalkBack (gate).
* [ ] Event funnel mobile terkirim (paritas web).

#### Dependencies

* PR-093
* PR-078
* PR-048

#### Risks

* Deep link edge cases (app killed). Mitigasi: test cold-start eksplisit.


### PR-095 - Mobile Notification Center

#### Objective

**Layar notifikasi + badge + foreground handling.**

Bisnis: paritas kanal visual penuh. Teknis: layar list + read, badge, dedup push vs in-app saat foreground.

#### Scope

* Layar notifikasi + badge + dedup

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada.

**Mobile Changes:**

* Feature notifications mobile.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (dedup)
* [ ] Integration Test (N/A)
* [ ] E2E Test (Maestro read flow)
* [ ] Accessibility Test (TalkBack)
* [ ] Manual Verification (foreground/background)

**Deliverables:**

* Notifikasi mobile lengkap

**Out of Scope:**

* Tidak ada.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Foreground: in-app banner, TANPA push dobel.
* [ ] Badge akurat.
* [ ] Read flow paritas web.
* [ ] TalkBack membaca item utuh.
* [ ] Navigasi ke entitas terkait bekerja.

#### Dependencies

* PR-094

#### Risks

* Minim.


## Exit Criteria

Phase 15 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 8 PR (PR-088..PR-095) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 16 - Infrastructure & Observability](phase-16-infrastructure-observability.md)
