---
phase: 3
name: "Web Platform Base"
prs: PR-025..PR-033 (9 PR)
sprint: "2-4"
depends_on: [1, 2]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 03 - Web Platform Base

## Overview

Fondasi web SPA: bootstrap Vite, paket a11y (global state preferensi), design system aksesibel, i18n dua varian, halaman login, gate a11y CI, landing, dan settings.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-025** - App shell web berjalan terhadap API dev
* **PR-026** - Paket a11y fondasi global state produk
* **PR-027** - 4 komponen form siap pakai
* **PR-028** - Set komponen UI MVP lengkap
* **PR-029** - Infrastruktur i18n dua varian
* **PR-030** - Halaman login produksi-ready
* **PR-031** - Gate a11y aktif untuk semua PR FE berikutnya
* **PR-032** - Landing + 404 + pola empty state
* **PR-033** - Settings + Data Saya

## Pull Requests

### PR-025 - apps/web Bootstrap

#### Objective

**Vite SPA: router, QueryClient, error boundary, banner offline.**

Bisnis: fondasi pengalaman online-only yang jujur (ADR-009). Teknis: React Router lazy per route, TanStack Query `networkMode:'online'`, error boundary aksesibel, skeleton `aria-busy` (SDD §4.1, ADR-014).

#### Scope

* Shell app + provider stack + routing lazy
* Banner offline `role="alert"` + tombol coba lagi
* Struktur folder features/routes/shared

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Shell aplikasi web lengkap.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak menyimpan token di localStorage (refresh via cookie; access di memori).

**Testing Checklist:**

* [ ] Unit Test (error boundary, offline store) — dua yang disebut namanya lahir di PR-025c. **34 test sudah ada**: penjaga budget & code-splitting (14), penjaga struktur folder (7), query client (6), router (5), app shell (2).
* [x] Integration Test (N/A)
* [ ] E2E Test (shell render + offline sim) — harness E2E baru lahir di PR-031b
* [ ] Accessibility Test (axe shell) — gerbangnya baru menyala di PR-031a
* [ ] Manual Verification (matikan network di devtools) — butuh banner offline (PR-025c)

**Deliverables:**

* App shell web berjalan terhadap API dev

**Out of Scope:**

* Komponen UI (PR-027/028); halaman fitur.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Offline → banner alert; mutasi tertahan, tidak gagal senyap. — PR-025c
* [x] Route ter-code-split (bukti bundle analyzer). — **PR-025b.** React Router v7, tiap route `lazy`. Build nyata: `index` 75,9 KB + chunk `beranda` dan `masuk` **terpisah**. "Bukti bundle analyzer" diganti pemeriksaan mesin (`chunkLazy()` di `cek-budget.ts`) karena tangkapan layar analyzer tidak bisa membuat CI merah — ia membuktikan satu momen lalu tidak pernah memeriksa lagi. Diverifikasi mutasi: `lazy` → impor statis membuat CI merah di **dua** lapis (penjaga build + test unit).
* [ ] Error boundary menampilkan pesan sederhana + tombol muat ulang. — PR-025c
* [x] Budget JS awal < 200 KB gzip (CI check). — **PR-025a.** `scripts/cek-budget.ts` dipanggil `pr.yml` setelah `vite build`; build nyata melaporkan **44,8 KB / 200 KB**. Menghitung dari `dist/index.html` (script modul + `modulepreload`), BUKAN menyapu `dist/assets/*.js` — sapuan folder ikut menghitung chunk lazy dan akan membuat budget merah justru karena code-splitting berhasil. Diverifikasi mutasi: ambang diturunkan ke 10 KB → keluar dengan status 1.
* [x] Struktur folder sesuai SDD §4.1. — **PR-025a.** `app/ routes/ features/ shared/`, masing-masing ber-README yang menuliskan apa yang boleh dan tidak boleh masuk. Dijaga `struktur-folder.test.ts`: folder yang hilang **dan** folder kelima yang lahir diam-diam (`utils/`, `components/`, `lib/`) sama-sama membuat build merah.

> **Dipecah jadi tiga PR (persetujuan owner 2026-08-08):** scope utuh terukur ≈ 965 LOC, hampir dua kali batas <500 — pola yang sama dengan PR-016/017/018 di Phase 02. Batas pemecahan ditaruh pada **makna**, bukan jumlah baris, sehingga tiap potongan menutup AC yang utuh.
> **PR-025a** — bootstrap Vite + React 18, preset ESLint React (`base.cjs` murni Node, jadi `.tsx` sebelumnya tidak bisa di-lint sama sekali), harness Vitest jsdom, struktur folder, budget bundle di CI — *selesai* (AC 4–5).
> **PR-025b** — React Router v7 lazy per route + provider stack (`networkMode: 'online'`, staleTime 60 s, retry 2 backoff) — *selesai* (AC 2).
> **PR-025c** — error boundary aksesibel, banner offline `role="alert"`, skeleton `aria-busy` — *belum* (AC 1, 3).

#### Dependencies

* PR-001
* PR-005

#### Risks

* Budget JS terlampaui sejak awal. Mitigasi: CI size-check sejak PR ini. — **ditutup di PR-025a**, dipasang selagi bundelnya masih 44,8 KB. Penjaga yang lahir setelah bundelnya gemuk hanya mengesahkan keadaan yang sudah terlanjur.
* **Fondasi PWA tidak dikerjakan, dan itu menyimpang dari SDD §4.4.** SDD menuntut manifest + service worker aset statis dipasang sejak MVP *"agar upgrade ke offline dasar di Fase 2 tidak merombak arsitektur"*, tetapi Scope PR-025 di dokumen ini tidak menyebutnya — dan file phase yang jadi acuan. Dicatat sebagai keputusan tertunda, bukan kelalaian: memasangnya jauh lebih murah sekarang daripada setelah puluhan halaman lahir.

#### Log Implementasi

* 2026-08-08 — PR-025a selesai (bootstrap Vite + React, preset ESLint React, harness Vitest jsdom, struktur folder SDD §4.1 berpenjaga, budget bundle di CI). AC 4–5 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-025a--bootstrap-appsweb-vite--react-preset-eslint-react-harness-test-budget-bundle).
* 2026-08-08 — PR-025b selesai (React Router v7 lazy per route, provider stack TanStack Query, penjaga code-splitting di CI). AC 2 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-025b--routing-lazy--provider-stack).


### PR-026 - packages/a11y — Store Preferensi + CSS Custom Properties

#### Objective

**useA11yStore persisted + token aksesibilitas global.**

Bisnis: fitur pembeda Accessibility Profile — UI menyesuaikan pengguna, bukan sebaliknya (ADR-008). Teknis: Zustand persisted (migrasi versi) menulis `--font-scale`, `--touch-target-min`, `data-contrast/motion/lang-mode` ke `<html>`; rekonsiliasi setting OS (eksplisit user > OS > default).

#### Scope

* Store + apply-to-DOM + listener `prefers-*`
* Kontrak sinkron server (dipakai PR-034/036)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Paket a11y dipakai seluruh web (mobile di PR-091).

**Mobile Changes:**

* API paket dirancang platform-agnostic (tanpa DOM di core logic).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Preferensi UI bukan data sensitif (dipisah dari ragam disabilitas — SDD §6.2).

**Testing Checklist:**

* [ ] Unit Test (rekonsiliasi, migrasi persist)
* [ ] Integration Test (N/A)
* [ ] E2E Test (toggle preferensi → DOM berubah)
* [ ] Accessibility Test (axe pada kombinasi dasar)
* [ ] Manual Verification (OS setting vs user setting)

**Deliverables:**

* Paket a11y fondasi global state produk

**Out of Scope:**

* Wizard onboarding (PR-035); sinkron server (PR-036).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] `prefers-reduced-motion` OS dihormati bila user belum set eksplisit.
* [ ] Perubahan store langsung mengubah token DOM (live).
* [ ] Persist selamat dari refresh + migrasi versi teruji.
* [ ] Semua token terdokumentasi untuk pemakaian Tailwind preset.
* [ ] Tidak ada flash-of-wrong-theme saat load (init sebelum paint).

#### Dependencies

* PR-025

#### Risks

* Kombinasi preferensi merusak layout. Mitigasi: matrix test di PR-036.


### PR-027 - packages/ui Batch 1 — Form Primitives

#### Objective

**Button, Input, FormField, Select (Radix + token-aware).**

Bisnis: semua form Nawasena aksesibel by-construction. Teknis: primitives Radix + Tailwind membaca token a11y; jest-axe per komponen (SDD §4.3).

#### Scope

* 4 komponen + dokumentasi pemakaian
* Target sentuh mengikuti `--touch-target-min`

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Komponen form inti.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus (komponen presentasional).

**Testing Checklist:**

* [ ] Unit Test (perilaku + jest-axe)
* [ ] Integration Test (N/A)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (axe + keyboard per komponen)
* [ ] Manual Verification (NVDA sampling)

**Deliverables:**

* 4 komponen form siap pakai

**Out of Scope:**

* Overlay/feedback (PR-028); varian RN (PR-089).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Fokus ring selalu terlihat di semua varian.
* [ ] Label terasosiasi programatik (axe pass per komponen).
* [ ] Error field diumumkan (`aria-describedby` + `aria-invalid`).
* [ ] Target sentuh ≥ 44px (≥ 56px saat large_touch_targets).
* [ ] Keyboard interaksi Select sesuai pola WAI-ARIA.

#### Dependencies

* PR-026

#### Risks

* Kustomisasi berlebihan merusak perilaku ARIA Radix. Mitigasi: styling-only di atas primitive.


### PR-028 - packages/ui Batch 2 — Overlay & Feedback

#### Objective

**Dialog, Toast, Skeleton, Tabs, Card + manajemen fokus.**

Bisnis: pola interaksi kompleks (dialog disclosure, notifikasi) aksesibel sejak komponen. Teknis: focus trap/restore, `aria-live` toast, skeleton `aria-busy`.

#### Scope

* 5 komponen + pola fokus terdokumentasi

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Komponen overlay/feedback.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (fokus trap/restore + jest-axe)
* [ ] Integration Test (N/A)
* [ ] E2E Test (N/A)
* [ ] Accessibility Test (keyboard + NVDA sampling)
* [ ] Manual Verification (skenario dialog bertumpuk)

**Deliverables:**

* Set komponen UI MVP lengkap

**Out of Scope:**

* Komponen domain (kartu lowongan dsb. — di PR fitur).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Dialog: fokus masuk saat buka, kembali ke pemicu saat tutup.
* [ ] Toast diumumkan `aria-live="polite"` tanpa mencuri fokus.
* [ ] Tabs keyboard sesuai pola WAI-ARIA.
* [ ] Skeleton menandai wilayah `aria-busy`.
* [ ] Semua komponen lolos jest-axe.

#### Dependencies

* PR-027

#### Risks

* Focus management edge cases. Mitigasi: test eksplisit dialog-dalam-dialog dilarang by-convention.


### PR-029 - i18n Catalog id / id-simple

#### Objective

**Dua varian bahasa + switch data-lang-mode.**

Bisnis: mode teks sederhana untuk pengguna autisme/kognitif (PRD Daksa/Autisme support; SDD §4.3). Teknis: katalog dua varian per string + lint key hilang.

#### Scope

* Setup i18n + katalog shell/auth
* Lint: string tanpa varian simple terdeteksi

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Provider i18n + katalog awal.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (fallback, interpolasi)
* [ ] Integration Test (N/A)
* [ ] E2E Test (toggle mode)
* [ ] Accessibility Test (N/A langsung)
* [ ] Manual Verification (review bahasa sederhana oleh non-engineer)

**Deliverables:**

* Infrastruktur i18n dua varian

**Out of Scope:**

* Simplify konten dinamis via AI (PR-087).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Toggle mode mengubah seluruh string shell tanpa reload.
* [ ] Key tanpa varian simple → lint warning terdaftar.
* [ ] Fallback key hilang → tampil key + error log (bukan blank).
* [ ] Katalog terstruktur per fitur.
* [ ] Interpolasi aman (tanpa injeksi HTML).

#### Dependencies

* PR-025

#### Risks

* Varian simple ditulis asal. Mitigasi: panduan menulis bahasa sederhana di docs + review konten.


### PR-030 - Web Auth Pages

#### Objective

**Halaman login OTP + Google + guarded routes.**

Bisnis: pintu masuk produk yang bisa dipakai semua ragam disabilitas. Teknis: form OTP aksesibel (input kode), tombol Google, session store, redirect pasca-login.

#### Scope

* Halaman login + verifikasi OTP
* Session store + route guard
* Integrasi refresh api-client

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature auth lengkap.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak menyimpan access token persisten; anti-enumeration (pesan generik nomor tidak terdaftar).

**Testing Checklist:**

* [ ] Unit Test (session store)
* [ ] Integration Test (N/A)
* [ ] E2E Test (Playwright OTP happy+sad path)
* [ ] Accessibility Test (axe + keyboard + NVDA checklist)
* [ ] Manual Verification (browser nyata)

**Deliverables:**

* Halaman login produksi-ready

**Out of Scope:**

* Onboarding (PR-035); settings (PR-033).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Login OTP end-to-end terhadap API dev (sender mock).
* [ ] Login Google end-to-end (akun uji).
* [ ] Seluruh alur selesai keyboard-only.
* [ ] Error (OTP salah/kedaluwarsa) diumumkan screen reader.
* [ ] Route terlindungi redirect ke login dengan kembali ke tujuan awal.

#### Dependencies

* PR-018
* PR-027
* PR-029

#### Risks

* Input OTP tidak aksesibel (pola 6 kotak). Mitigasi: satu input dengan autocomplete="one-time-code".


### PR-031 - A11y Gate CI (axe + Lighthouse)

#### Objective

**Aktivasi gate merah aksesibilitas di pipeline.**

Bisnis: WCAG 2.2 AA tidak bisa "dilewati sementara" (ADR-016, R3). Teknis: axe-core via Playwright pada halaman terdaftar + Lighthouse CI (a11y=100, perf≥80).

#### Scope

* Harness axe + registry halaman
* Lighthouse CI konfigurasi + budget

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Tidak ada (infrastruktur test).

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (harness)
* [ ] E2E Test (menjalankan axe)
* [ ] Accessibility Test (inilah gate-nya)
* [ ] Manual Verification (PR uji dengan pelanggaran)

**Deliverables:**

* Gate a11y aktif untuk semua PR FE berikutnya

**Out of Scope:**

* Audit manusia (PR-110).

**Rollback Strategy:**

Gate dapat diturunkan ke warning via config darurat (dengan approval EM) — dicatat sebagai insiden proses.

#### Acceptance Criteria

* [ ] Pelanggaran axe fixture → CI merah (bukti).
* [ ] Lighthouse a11y < 100 → CI merah.
* [ ] Registry halaman mudah ditambah per PR fitur.
* [ ] Laporan kegagalan menyebut elemen + aturan.
* [ ] Durasi tambahan pipeline < 5 menit.

#### Dependencies

* PR-030
* PR-003

#### Risks

* False sense of security (axe ≠ WCAG penuh). Mitigasi: audit manual tetap gate rilis (PR-110).


### PR-032 - Landing Page + Empty States (Gap G4)

#### Objective

**Halaman publik pertama + pola empty state.**

Bisnis: pintu masuk akuisisi (community-driven & medsos — PRD §Business). Teknis: landing ringan (<200 KB), 404, empty state generik, landmark/skip-link final.

#### Scope

* Landing (nilai produk + CTA daftar), 404, empty states
* SEO dasar + meta

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Halaman publik.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada.

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (N/A)
* [ ] E2E Test (smoke landing→login)
* [ ] Accessibility Test (axe + keyboard)
* [ ] Manual Verification (mobile viewport)

**Deliverables:**

* Landing + 404 + pola empty state

**Out of Scope:**

* Konten marketing lengkap (tim non-eng).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Lighthouse perf ≥ 80 pada 3G throttling.
* [ ] Struktur heading & landmark benar (axe + manual).
* [ ] CTA daftar → login/onboarding.
* [ ] 404 memberi jalan pulang yang jelas.
* [ ] Konten tersedia dalam id + id-simple.

#### Dependencies

* PR-030

#### Risks

* Minim.


### PR-033 - Web Settings Shell (Akun & Data Saya)

#### Objective

**Halaman pengaturan: ekspor data, hapus akun, slot panel a11y.**

Bisnis: hak PDP terlihat dan mudah dipakai (bukan terkubur). Teknis: konsumsi PR-021/022 dengan konfirmasi dua langkah aksesibel.

#### Scope

* Settings layout + navigasi
* "Data Saya": ekspor + hapus akun (2-step confirm)
* Slot panel aksesibilitas (diisi PR-036)

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature settings.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Konfirmasi destruktif eksplisit; re-auth ringan sebelum hapus.

**Testing Checklist:**

* [ ] Unit Test (N/A)
* [ ] Integration Test (N/A)
* [ ] E2E Test (ekspor + hapus akun)
* [ ] Accessibility Test (axe + NVDA dialog)
* [ ] Manual Verification (akun uji dihapus benar-benar)

**Deliverables:**

* Settings + Data Saya

**Out of Scope:**

* Panel preferensi a11y (PR-036).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Ekspor mengunduh JSON milik user.
* [ ] Hapus akun butuh dua langkah + re-auth; tidak bisa via satu klik.
* [ ] Dialog konfirmasi lolos NVDA checklist.
* [ ] Seluruh halaman keyboard-only.
* [ ] Copy dalam id + id-simple.

#### Dependencies

* PR-022
* PR-028

#### Risks

* User menghapus tanpa paham konsekuensi. Mitigasi: penjelasan bahasa sederhana + masa tunggu purge 30 hari disebutkan.


## Exit Criteria

Phase 03 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 9 PR (PR-025..PR-033) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 04 - Accessibility Experience](phase-04-accessibility-experience.md)
