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
* **PR-032** - Landing + 404 + pola empty state (dipecah: 032a landing/landmark/3G, 032b 404/empty state)
* **PR-033** - Settings + Data Saya (dipecah: 033a kerangka/panel akun/slot a11y, 033b ekspor, 033c hapus akun)

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

* [x] Unit Test (error boundary, offline store) — **55 test**: penjaga budget & code-splitting (14), router (9), banner luring (7), penjaga struktur folder (7), layar kesalahan (6), query client (6), status jaringan (4), app shell (2).
* [x] Integration Test (N/A)
* [ ] E2E Test (shell render + offline sim) — harness Playwright sudah ada sejak PR-031b dan dipakai empat spec, tetapi simulasi luring belum ditulis sebagai spec. Perilakunya diotomatiskan di `banner-luring.test.tsx` (jsdom).
* [x] Accessibility Test (axe shell) — **selesai.** `aksesibilitas.test.tsx` menjalankan axe atas kerangka aplikasi berikut dua keadaan yang paling sering luput: banner luring dan layar kesalahan. Sejak PR-031b seluruh halaman terdaftar juga diperiksa axe di peramban sungguhan, dan halaman mana pun dirender DI DALAM kerangka itu.
* [ ] Manual Verification (matikan network di devtools) — **siap diuji sejak PR-025c**; perilakunya sudah diotomatiskan di `banner-luring.test.tsx` (muncul/hilang, isi pesan, urutan aksi "Coba lagi"). Yang tersisa hanya konfirmasi di browser nyata.

**Deliverables:**

* App shell web berjalan terhadap API dev

**Out of Scope:**

* Komponen UI (PR-027/028); halaman fitur.

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Offline → banner alert; mutasi tertahan, tidak gagal senyap. — **PR-025c.** Banner `role="alert"` + tombol "Coba lagi"; **dirender bersyarat, bukan disembunyikan CSS** — `role="alert"` hanya diumumkan saat elemennya MASUK ke DOM, jadi elemen yang selalu ada lalu di-`display:none` tidak akan pernah terdengar. Bagian "mutasi tertahan" dipenuhi `networkMode: "online"` (PR-025b); banner ini yang membuatnya tidak senyap. "Coba lagi" melepas mutasi tertahan lebih dulu, baru menyegarkan — urutannya dikunci test.
* [x] Route ter-code-split (bukti bundle analyzer). — **PR-025b.** React Router v7, tiap route `lazy`. Build nyata: `index` 75,9 KB + chunk `beranda` dan `masuk` **terpisah**. "Bukti bundle analyzer" diganti pemeriksaan mesin (`chunkLazy()` di `cek-budget.ts`) karena tangkapan layar analyzer tidak bisa membuat CI merah — ia membuktikan satu momen lalu tidak pernah memeriksa lagi. Diverifikasi mutasi: `lazy` → impor statis membuat CI merah di **dua** lapis (penjaga build + test unit).
* [x] Error boundary menampilkan pesan sederhana + tombol muat ulang. — **PR-025c.** `ErrorBoundary` di route INDUK sehingga seluruh anak terlindungi; dipasang per halaman ia akan terlewat pada halaman yang ditambahkan belakangan. Menggantikan layar bawaan React Router yang berbahasa Inggris, menampilkan jejak tumpukan, dan membocorkan jalur berkas internal. Pesan per keadaan (404 / 401-403 / umum) menyebut LANGKAH BERIKUTNYA, bukan penyebab teknis. Diverifikasi mutasi: `ErrorBoundary` dilepas → dua test merah.
* [x] Budget JS awal < 200 KB gzip (CI check). — **PR-025a.** `scripts/cek-budget.ts` dipanggil `pr.yml` setelah `vite build`; build nyata melaporkan **44,8 KB / 200 KB**. Menghitung dari `dist/index.html` (script modul + `modulepreload`), BUKAN menyapu `dist/assets/*.js` — sapuan folder ikut menghitung chunk lazy dan akan membuat budget merah justru karena code-splitting berhasil. Diverifikasi mutasi: ambang diturunkan ke 10 KB → keluar dengan status 1.
* [x] Struktur folder sesuai SDD §4.1. — **PR-025a.** `app/ routes/ features/ shared/`, masing-masing ber-README yang menuliskan apa yang boleh dan tidak boleh masuk. Dijaga `struktur-folder.test.ts`: folder yang hilang **dan** folder kelima yang lahir diam-diam (`utils/`, `components/`, `lib/`) sama-sama membuat build merah.

> **Dipecah jadi tiga PR (persetujuan owner 2026-08-08):** scope utuh terukur ≈ 965 LOC, hampir dua kali batas <500 — pola yang sama dengan PR-016/017/018 di Phase 02. Batas pemecahan ditaruh pada **makna**, bukan jumlah baris, sehingga tiap potongan menutup AC yang utuh.
> **PR-025a** — bootstrap Vite + React 18, preset ESLint React (`base.cjs` murni Node, jadi `.tsx` sebelumnya tidak bisa di-lint sama sekali), harness Vitest jsdom, struktur folder, budget bundle di CI — *selesai* (AC 4–5).
> **PR-025b** — React Router v7 lazy per route + provider stack (`networkMode: 'online'`, staleTime 60 s, retry 2 backoff) — *selesai* (AC 2).
> **PR-025c** — error boundary aksesibel, banner luring `role="alert"`, penanda `aria-busy` — *selesai* (AC 1, 3). **Seluruh AC PR-025 kini terpenuhi.**
> **PR-025d** — fondasi PWA (manifest + service worker aset statis) — *selesai*. **Tambahan di luar AC**, lahir dari celah antara ADR-009 dan backlog; lihat Risks.

#### Dependencies

* PR-001
* PR-005

#### Risks

* Budget JS terlampaui sejak awal. Mitigasi: CI size-check sejak PR ini. — **ditutup di PR-025a**, dipasang selagi bundelnya masih 44,8 KB. Penjaga yang lahir setelah bundelnya gemuk hanya mengesahkan keadaan yang sudah terlanjur.
* ~~**Fondasi PWA tidak dikerjakan.**~~ **Ditutup di PR-025d (keputusan owner 2026-08-09).** Bukan sekadar prosa SDD: ADR-009 menuliskannya di bagian **Decision** dan mengulanginya sebagai salah satu dari **tiga Mitigasi** untuk konsekuensi negatif online-only; alternatif yang dipilih pun bernama *"Online-only **dengan fondasi PWA**"*. Pencarian `pwa|manifest|service worker` di **seluruh 19 dokumen phase** menghasilkan nol hasil — celah nyata antara ADR yang sudah Accepted dan rencana eksekusi, bukan sekadar scope yang tidak disebut. Membiarkannya sama dengan mencabut satu mitigasi tanpa merevisi ADR-nya.

#### Log Implementasi

* 2026-08-08 — PR-025a selesai (bootstrap Vite + React, preset ESLint React, harness Vitest jsdom, struktur folder SDD §4.1 berpenjaga, budget bundle di CI). AC 4–5 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-025a--bootstrap-appsweb-vite--react-preset-eslint-react-harness-test-budget-bundle).
* 2026-08-08 — PR-025b selesai (React Router v7 lazy per route, provider stack TanStack Query, penjaga code-splitting di CI). AC 2 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-025b--routing-lazy--provider-stack).
* 2026-08-08 — PR-025c selesai (error boundary di route induk, banner luring `role="alert"`, penanda `aria-busy`, catch-all 404). AC 1 & 3 terpenuhi — **PR-025 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-025c--kegagalan-yang-jujur-error-boundary-banner-luring-penanda-memuat).


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

* [x] Unit Test (rekonsiliasi, migrasi persist) — `packages/a11y/__tests__/`: `rekonsiliasi.test.ts`, `store.test.ts` (migrasi versi pada `migrate` DAN `merge`), `os.test.ts`, `hubungkan.test.ts`, `token.test.ts`.
* [ ] Integration Test (N/A)
* [ ] E2E Test (toggle preferensi → DOM berubah)
* [x] Accessibility Test (axe pada kombinasi dasar) — `aksesibilitas.test.tsx` › "teks 200% + kontras tinggi + bahasa sederhana". Matriks penuhnya tetap milik PR-036.
* [ ] Manual Verification (OS setting vs user setting)

**Deliverables:**

* Paket a11y fondasi global state produk

**Out of Scope:**

* Wizard onboarding (PR-035); sinkron server (PR-036).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] `prefers-reduced-motion` OS dihormati bila user belum set eksplisit. — **PR-026b.** Kueri yang TIDAK DIKENAL browser menghasilkan `undefined`, bukan `false`: browser menormalkan `media` jadi `"not all"`, dan tanpa pemeriksaan itu browser lama akan melaporkan "pengguna tidak mau kontras tinggi" padahal ia sama sekali tidak tahu. Memakai `prefers-contrast: more` (standar), bukan `high` (nilai lama yang tidak pernah masuk spesifikasi). **Mekanismenya lengkap dan teruji di `packages/a11y`; `apps/web` memanggilnya di PR-026c.**
* [x] Perubahan store langsung mengubah token DOM (live). — **PR-026b.** Glue store→DOM ditaruh di dalam paket (bukan `apps/web`) karena `subscribe` Zustand bukan API React — sehingga AC ini bisa diuji **tanpa merender satu komponen pun**. Atribut **dihapus** saat preferensi dimatikan, bukan disetel nilai "mati". Diverifikasi mutasi: menyetel `"normal"` alih-alih menghapus membuat lima test merah. **Mekanismenya lengkap dan teruji; `apps/web` memanggilnya di PR-026c.**
* [x] Persist selamat dari refresh + migrasi versi teruji. — **PR-026a.** State tersimpan divalidasi skema pada `migrate` DAN `merge` (yang pertama hanya berjalan saat versi berbeda, jadi tanpa yang kedua state hasil suntingan tangan pada versi terkini masuk tanpa diperiksa). Nilai rusak dibuang **per-field**, sisanya selamat. Versi tersimpan yang lebih BARU dibuang, bukan ditebak. Diverifikasi mutasi.
* [x] Semua token terdokumentasi untuk pemakaian Tailwind preset. — **PR-026c.** [docs/token-aksesibilitas.md](../token-aksesibilitas.md): lima token, contoh CSS beserta **nilai cadangan**, alasan atribut dihapus alih-alih disetel nilai mati, dan dua preferensi yang sengaja tanpa token. Penjaganya menurunkan daftar token dari **KODE**, bukan dari daftar tulisan tangan — daftar tulisan tangan adalah sumber kebenaran kedua yang bebas menyimpang, dan penjaga yang membandingkan dua salinan usang selalu hijau. Diverifikasi mutasi.
* [x] Tidak ada flash-of-wrong-theme saat load (init sebelum paint). — **PR-026c.** Skrip inline di `<head>`, disuntik `transformIndexHtml` dari berkas TypeScript yang bisa diuji. Duplikasi logikanya tak terhindarkan (skrip berjalan sebelum modul apa pun dimuat), jadi kesetaraannya diuji dengan **MENJALANKAN** skripnya di jsdom lalu membandingkan DOM hasilnya dengan fungsi asli — matriks sepuluh kombinasi, perbandingan perilaku bukan teks. Diverifikasi mutasi. **Belum diverifikasi di browser sungguhan** — jsdom tidak menggambar apa pun.

> **Dipecah jadi tiga PR (persetujuan owner 2026-08-09):** scope utuh terukur ≈ 1100 LOC — lebih dari dua kali batas <500, PR terbesar sejauh ini.
> **PR-026a** — kontrak zod tujuh preferensi, rekonsiliasi murni (pengguna > OS > bawaan), store Zustand ber-persist + migrasi versi, harness paket. Seluruhnya **bebas DOM** agar bisa dipakai mobile (SDD §4.2) — *selesai* (AC 3).
> **PR-026b** — adapter web `@nawasena/a11y/web`: token ke elemen akar, listener `prefers-*`, dan glue store→DOM — *selesai* (AC 1, 2). Glue dipindah ke dalam paket (bukan `apps/web`) agar AC 2 dapat diuji tanpa merender komponen; integrasi aplikasi & sambungan mode bahasa ikut PR-026c.
> **PR-026c** — integrasi `apps/web` (`hubungkanKeDom`), sambungan `simpleLanguage` → mode i18n, anti-flash pra-paint, dan dokumentasi token Tailwind — *selesai* (AC 4, 5). **Seluruh AC PR-026 kini terpenuhi**, dan AC 1 & 2 kini berlaku di aplikasi — bukan hanya di paket.
>
> **Selisih dokumen yang dicatat:** SDD §4.3 menyebut ENAM preferensi, tabel `accessibility_profiles` punya TUJUH (`screenReaderHint` tidak disebut SDD). CLAUDE.md §12 menetapkan Prisma sebagai sumber kebenaran skema, jadi ketujuhnya masuk kontrak.

#### Dependencies

* PR-025

#### Risks

* Kombinasi preferensi merusak layout. Mitigasi: matrix test di PR-036.

#### Log Implementasi

* 2026-08-09 — PR-026a selesai (kontrak zod tujuh preferensi, rekonsiliasi murni, store Zustand ber-persist + migrasi versi; `packages/a11y` berhenti jadi placeholder). AC 3 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-026a--kontrak-preferensi--store-bebas-dom).
* 2026-08-09 — PR-026b selesai (adapter web: token SDD §4.3, pembacaan & pemantauan `matchMedia`, glue store→DOM, penjaga "inti bebas DOM"). AC 1 & 2 terpenuhi di tingkat mekanisme; `apps/web` menyambungkannya di PR-026c. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-026b--token-dom--setelan-os).
* 2026-08-09 — PR-026c selesai (integrasi `apps/web`, sambungan `simpleLanguage` → i18n, skrip anti-flash pra-paint, dokumentasi token berpenjaga). AC 4 & 5 terpenuhi — **PR-026 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-026c--integrasi-aplikasi-anti-flash--dokumentasi-token).


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

* [x] Unit Test (perilaku + axe) — `packages/ui/__tests__/`: `tombol`, `masukan`, `kolom-form`, `pilihan`. Helper axe-nya ditulis sendiri, bukan `jest-axe` — lihat AC di bawah.
* [ ] Integration Test (N/A)
* [ ] E2E Test (N/A)
* [x] Accessibility Test (axe + keyboard per komponen) — tiap komponen punya gerbang axe-nya sendiri, dan interaksi keyboardnya diuji lewat penekanan tombol sungguhan (`userEvent`), bukan pemanggilan handler.
* [ ] Manual Verification (NVDA sampling)

**Deliverables:**

* 4 komponen form siap pakai

**Out of Scope:**

* Overlay/feedback (PR-028); varian RN (PR-089).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Fokus ring selalu terlihat di semua varian. *(PR-027b — tiga varian Tombol + dua keadaan Masukan dijaga tidak memakai `outline-none`/`outline-0`; outline `currentColor` datang dari `:focus-visible` global PR-027a.)*
* [x] Label terasosiasi programatik (axe pass per komponen). *(PR-027c — `KolomForm` yang MEMBAGIKAN id-nya lewat konteks; kontrol mengambilnya. Tidak ada id yang perlu diketik ulang, jadi tidak ada yang bisa tertinggal.)*
* [x] Error field diumumkan (`aria-describedby` + `aria-invalid`). *(PR-027c — satu prop `galat` menulis keduanya sekaligus plus `role="alert"`, sehingga tampilan dan pengumuman tidak bisa menyimpang.)*
* [x] Target sentuh ≥ 44px (≥ 56px saat large_touch_targets). *(PR-027b — komponen memakai `min-h-sentuh`/`min-w-sentuh`; rantai token sampai `var(--touch-target-min, 44px)` dibuktikan lewat kompilasi CSS nyata. **Piksel sesungguhnya** tidak terukur di jsdom — pengukurannya milik PR-031b.)*
* [x] Keyboard interaksi Select sesuai pola WAI-ARIA. *(PR-027c — di atas `@radix-ui/react-select` 2.3.7, styling-only. Diuji lewat jalur keyboard sungguhan: buka, sorot, pilih, Escape + kembalikan fokus.)*

> **Dipecah jadi tiga PR (persetujuan owner 2026-08-09):** scope utuh terukur ≈ 1270 LOC.
> **PR-027a** — preset Tailwind di `packages/config` + CSS akar + bootstrap `packages/ui` — *selesai*. Tidak menutup AC sendiri, tetapi membuka ketiganya.
> **PR-027b** — Button & Input — *selesai* (AC 1, 4).
> **PR-027c** — FormField & Select — *selesai* (AC 2, 3, 5). Mendarat **708 LOC**, di atas target <500; dilaporkan ke owner berikut usulan pemecahan 027c/027d, dan owner memilih mendaratkannya utuh (2026-08-09). 389 baris di antaranya test.
>
> **Celah dokumen yang ditutup PR-027a:** setup Tailwind **tidak punya pemilik** di backlog. SDD menyebutnya tiga kali — termasuk §107 (*"packages/config: eslint, tsconfig, tailwind preset"*) dan §189 (*"seluruh Tailwind preset membaca token ini"*) — tetapi tidak ada satu pun PR yang membuatnya, sementara PR-027 menulis *"Radix + Tailwind membaca token a11y"* seolah presetnya sudah ada. Berbeda dari celah PWA (PR-025d), yang ini **memblokir**: membangun komponen dengan CSS biasa berarti mengubah keputusan tech stack.

#### Dependencies

* PR-026

#### Risks

* Kustomisasi berlebihan merusak perilaku ARIA Radix. Mitigasi: styling-only di atas primitive. **PR-027b menempuh mitigasi yang lebih kuat untuk Button & Input: tidak memakai primitive sama sekali.** `<button>` dan `<input>` natif sudah memenuhi seluruh pola WAI-ARIA-nya (peran, aktivasi Enter/Space, keadaan disabled, partisipasi form), sehingga membungkusnya hanya menambah lapisan yang bisa merusak semantik yang sudah benar. Radix **dipakai** untuk Select (PR-027c), yang polanya memang tidak punya padanan natif yang bisa ditata: `<option>` bawaan tidak menerima gaya, sementara pola ARIA-nya menuntut belasan perilaku yang saling terkait. Menulis ulang itu persis yang diperingatkan PRD R9.
* **Preflight Tailwind menghapus outline fokus bawaan browser.** Ditutup PR-027a: `:focus-visible` dipulihkan di `@layer base` dengan tebal 3px. Tanpa itu, SELURUH aplikasi kehilangan penanda fokus — kegagalan aksesibilitas paling umum yang lahir dari CSS reset, dan ia tidak akan terlihat oleh siapa pun yang memakai tetikus.
* ~~**Pilihan Tailwind v3, bukan v4.**~~ **Ditinjau ulang dan DIBALIK atas keputusan owner (2026-08-09), sebelum satu komponen pun bergantung padanya.** Tinjauan membuktikan v3 tidak pernah menjadi keputusan: nol ADR menyebut Tailwind, SDD hanya menyebutnya di dalam diagram, dan pinnya masuk repo hari itu juga lewat PR-027a. ADR-008 menetapkan mekanisme token sebagai CSS custom properties — yang di v4 adalah model aslinya. Dituangkan sebagai [ADR-019](../adr/ADR-019-tailwind-v4-styling-web.md).

#### Log Implementasi

* 2026-08-09 — PR-027a selesai (preset Tailwind membaca token a11y, CSS akar + pemulihan cincin fokus, bootstrap `packages/ui`, `gabungKelas`). Menutup celah SDD §107. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-027a--fondasi-styling-preset-tailwind--paket-ui).
* 2026-08-09 — PR-027a **direvisi ke Tailwind v4** (`@theme` CSS menggantikan preset JS, `@tailwindcss/vite` menggantikan PostCSS, tailwind-merge 3.x) berikut **ADR-019**. Kontrak token ADR-008 tidak berubah — dibuktikan lewat kompilasi CSS nyata. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-027a-revisi--migrasi-ke-tailwind-v4--adr-019).
* 2026-08-09 — PR-027b selesai (`Tombol` 3 varian × 2 ukuran, `Masukan` dengan keadaan bermasalah). Menutup AC 1 & 4. Di atas elemen natif, bukan primitive Radix. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-027b--tombol--masukan).
* 2026-08-09 — PR-027c selesai (`KolomForm` + konteks kolom, `Pilihan` di atas Radix Select). Menutup AC 2, 3, 5 — **PR-027 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-027c--kolomform--pilihan-select).


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

* [x] Unit Test (fokus trap/restore + axe) — `packages/ui/__tests__/`: `dialog` (fokus masuk & kembali lewat tiga jalan tutup), `toast`, `kerangka`, `tab`, `kartu`, `keadaan-kosong`.
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

* [x] Dialog: fokus masuk saat buka, kembali ke pemicu saat tutup. *(PR-028a — diuji lewat tiga jalan tutup: Escape, tombol tutup, dan tombol aksi di dalam isi. Jerat fokus diuji dua arah, Tab dan Shift+Tab.)*
* [x] Toast diumumkan `aria-live="polite"` tanpa mencuri fokus. *(PR-028b — kedua tuntutan diuji terpisah, sebab cara termudah membuat toast "terdengar" adalah memindahkan fokus ke sana. Bawaan Radix `type="foreground"` justru `assertive`; komponen ini memetakannya ke `background` dan dijaga test.)*
* [x] Tabs keyboard sesuai pola WAI-ARIA. *(PR-028c — diuji lewat penekanan tombol sungguhan: panah, Home/End, orientasi tegak, dan Enter/Spasi. Aktivasi bawaannya **manual**, berbeda dari Radix, sebab Radix melepas panel tidak aktif dari DOM.)*
* [x] Skeleton menandai wilayah `aria-busy`. *(PR-028b — `WilayahMemuat` menandai wilayah yang SEDANG diganti, dan menaruh pengumumannya DI LUAR wilayah itu; `aria-busy` menahan pembacaan live region di dalamnya. `Kerangka` sendiri murni visual dan selalu `aria-hidden`.)*
* [x] Semua komponen lolos jest-axe. *(Dialog ✅ PR-028a; Toast & Kerangka ✅ PR-028b; Tab & Kartu ✅ PR-028c. Tiap gerbang axe berpasangan dengan penjaga negatif yang membuktikan ia tidak lulus hampa.)*

> **Dipecah jadi tiga PR (persetujuan owner 2026-08-09):** scope utuh terukur ≈ 1400 LOC, hampir tiga kali target <500. Diusulkan **sebelum** implementasi, bukan sesudah.
> **PR-028a** — Dialog — *selesai* (AC 1). Mendarat 440 LOC.
> **PR-028b** — Toast & Kerangka (Skeleton) — *selesai* (AC 2, 4). Mendarat **780 LOC**, di atas target <500 dan di atas perkiraan ≈480; dilaporkan ke owner berikut usulan pemecahan Toast/Kerangka yang nol kopling, dan owner memilih mendaratkannya utuh (2026-08-09). 465 baris di antaranya test.
> **PR-028c** — Tab & Kartu — *selesai* (AC 3). Mendarat **615 LOC**, di atas target <500; 422 baris di antaranya test, sehingga sumber yang harus ditinjau hanya 193 baris. Pemecahan Tab/Kartu tersedia dan dilaporkan, tetapi tidak ditempuh mengikuti dua keputusan owner sebelumnya pada pertanyaan yang sama.
> AC 5 (semua lolos axe) tertutup bertahap di ketiganya. **PR-028 tuntas.**

#### Dependencies

* PR-027

#### Risks

* Focus management edge cases. Mitigasi: test eksplisit dialog-dalam-dialog dilarang by-convention. **PR-028a menaikkan larangan itu dari konvensi menjadi STRUKTURAL:** `Dialog` di dalam `Dialog` melempar galat, bukan sekadar tidak dianjurkan. Konvensi tidak menahan apa pun di sini — yang menumpuk dialog biasanya tidak sadar sedang melakukannya, sebab dialog kedua lahir dari komponen yang dipakai ulang di tempat lain. Dan akibatnya bukan kerapian: dua jerat fokus bersarang mengurung pengguna keyboard **di dalam kurungan**.
* **Bawaan Radix Toast melanggar AC-nya sendiri.** Nama prop `type` bercerita tentang ASAL pesan, bukan cara mengumumkannya: `"foreground"` — dan itu bawaannya — menjadi `aria-live="assertive"`, `"background"` menjadi `polite`. Membiarkan bawaan berarti SETIAP toast menyela pembacaan yang sedang berjalan. PR-028b memetakannya lewat satu prop `mendesak` yang bawaannya `false`, dan menjaganya dengan test yang memeriksa atribut hasilnya, bukan prop masukannya.
* **Toast beraksi yang berhitung mundur menghapus fungsinya karena waktu** (WCAG 2.2 §2.2.1). Yang paling dirugikan justru yang paling lambat menjangkaunya: pengguna keyboard yang harus menekan F8 dulu, dan pengguna screen reader yang baru mendengar tawarannya setelah kalimat sebelumnya selesai. PR-028b menjadikannya struktural — kehadiran `aksi` yang mematikan hitungan, sehingga tidak ada pemakaian yang bisa lupa.
* **`aria-busy` menahan live region DI DALAMNYA.** Pengumuman "Memuat…" yang diletakkan di dalam wilayah sibuk baru terdengar setelah pemuatan usai — tepat saat ia tidak berguna lagi, dan bug ini tidak terlihat sama sekali di layar. PR-028b menaruh `role="status"` sebagai saudara di LUAR wilayah itu, dijaga test yang memeriksa hubungan kedua elemen (`contains`), bukan sekadar keberadaan atributnya.
* **Aktivasi tab otomatis memicu permintaan data pada setiap panah.** Radix melepas panel tidak aktif dari DOM (`present && children`, diverifikasi di sumbernya), jadi menyusuri tab dengan panah memasang lalu membongkar setiap panel yang dilewati. WAI-ARIA APG menganjurkan aktivasi otomatis, tetapi dengan syarat panelnya tampil "tanpa jeda yang terasa" — syarat yang tidak terpenuhi ketika isinya datang dari jaringan. PR-028c membalik bawaannya menjadi **manual**, dan menyediakan `aktivasi="otomatis"` untuk isi yang benar-benar statis.
* **Tingkat heading yang dipatok komponen merusak kerangka halaman.** Kartu yang selalu menulis `<h3>` menghasilkan urutan tingkat yang rusak begitu ia dipakai pada kedalaman lain — dan urutan itulah yang dipakai pengguna screen reader untuk menjelajah. PR-028c mengikat `judul` dan `tingkatJudul` sebagai pasangan **di tingkat tipe**, sehingga lupa memberi tingkat menjadi galat kompilasi. Dijaga `@ts-expect-error` yang membuat `tsc --noEmit` merah bila ikatan itu dilonggarkan.

#### Log Implementasi

* 2026-08-09 — PR-028a selesai (`Dialog` + `TutupDialog` di atas Radix Dialog; larangan dialog bertumpuk jadi struktural). Menutup AC 1. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-028a--dialog).
* 2026-08-09 — PR-028b selesai (`PenyediaToast` + `Toast` di atas Radix Toast; `Kerangka` + `WilayahMemuat`). Menutup AC 2 & 4. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-028b--toast--kerangka-skeleton).
* 2026-08-09 — PR-028c selesai (`Tab` di atas Radix Tabs dengan aktivasi manual; `Kartu` dengan tingkat heading terikat tipe). Menutup AC 3 & 5 — **PR-028 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-028c--tab--kartu).


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

* [x] Unit Test (fallback, interpolasi) — `apps/web/__tests__/`: `terjemah.test.ts`, `i18n-provider.test.tsx`, `katalog-kelengkapan.test.ts`.
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

* [x] Toggle mode mengubah seluruh string shell tanpa reload. — **PR-029a.** Mode disimpan sebagai state React; perubahannya merender ulang seluruh pohon. Test memeriksa **dua string berbeda** ikut berubah — kalau hanya satu yang diperiksa, konteks yang tidak benar-benar merender ulang akan lolos.
* [x] Key tanpa varian simple → lint warning terdaftar. — **dua lapis, keduanya lebih keras daripada peringatan lint.** (1) **Tipe** (PR-029a): `EntriTeks` menuntut kedua varian, jadi yang hilang adalah `typecheck` MERAH — diverifikasi mutasi (`TS2741`). (2) **Penjaga CI** (PR-029b): varian simple yang *disalin mentah* dari `id` — hal yang tidak bisa dibedakan tipe — wajib didaftarkan di `SAMA_DENGAN_SENGAJA` beserta alasannya, dengan pemeriksaan arah balik agar alasan basi ikut merah. Diverifikasi mutasi dua arah.
* [x] Fallback key hilang → tampil key + error log (bukan blank). — **PR-029a.** Fallback berlapis: varian diminta → varian `id` → kunci itu sendiri. Layar kosong tidak bisa dilaporkan pengguna; `shell.luring.judul` yang muncul di layar bisa langsung dicari di kode. Pelaporannya disuntikkan (`laporKunciHilang`), jadi PR-103 bisa mengarahkannya ke observability tanpa menyentuh berkas ini.
* [x] Katalog terstruktur per fitur. — **PR-029b.** Satu berkas per fitur, dirakit di `katalog/index.ts`. Dijaga: tiap kunci wajib berprefiks nama fiturnya, tidak boleh ada kunci kembar antar fitur (spread akan menimpanya **diam-diam** dan fitur yang kalah kehilangan teksnya tanpa satu pun galat), dan `katalog` + `fiturKatalog` wajib memuat kunci yang sama.
* [x] Interpolasi aman (tanpa injeksi HTML). — **PR-029a.** Mengembalikan STRING BIASA dan tidak pernah menyentuh HTML; **tidak ada varian "rich text"** — begitu ada, seseorang akan memakainya untuk teks yang berasal dari pengguna. Nilai di dalam hasil tidak diproses ulang (menutup penggantian berantai), dan `Object.hasOwn` menutup pembacaan rantai prototipe (`{constructor}` tidak mencetak teks fungsi). Diuji dengan `<img src=x onerror=…>` sebagai nilai parameter.

> **Dipecah jadi dua PR (persetujuan owner 2026-08-08):** scope utuh terukur ≈ 690 LOC, di atas batas <500.
> **PR-029a** — tipe & kontrak katalog, pencarian + fallback, interpolasi aman, provider + hook, katalog shell, integrasi 16 string yang sudah ada — *selesai* (AC 1, 3, 5).
> **PR-029b** — penjaga kelengkapan katalog per fitur + panduan menulis `id-simple` — *selesai* (AC 2, 4). **Seluruh AC PR-029 kini terpenuhi.**
>
> **Penyimpangan sadar pada AC-2:** "lint warning" diganti jaminan TIPE. `EntriTeks` menuntut kedua varian, sehingga yang hilang menjadi `typecheck` merah — lebih keras daripada peringatan, dan tanpa aturan ESLint kustom (~200 LOC) yang harus dirawat. Diverifikasi mutasi.
>
> **Batas yang dibawa:** mode belum tersambung ke `data-lang-mode`, sebab atribut itu ditulis store aksesibilitas milik **PR-026** yang belum lahir (urutan ditukar atas persetujuan owner). Mode dibuat bisa dikendalikan dari luar, jadi PR-026 tinggal menyambungkan — tidak ada kerja yang terbuang.

#### Dependencies

* PR-025

#### Risks

* Varian simple ditulis asal. Mitigasi: panduan menulis bahasa sederhana di docs + review konten. — **ditutup di PR-029b:** [docs/panduan-bahasa-sederhana.md](../panduan-bahasa-sederhana.md) + penjaga CI untuk salinan mentah. Yang TETAP tidak dijamin mesin: apakah kalimatnya benar-benar lebih mudah dipahami. Itu pekerjaan review, dan panduan itu rujukannya.

#### Log Implementasi

* 2026-08-08 — PR-029a selesai (mesin i18n dua varian, fallback berlapis, interpolasi aman, katalog shell, integrasi 16 string). AC 1, 3, 5 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-029a--mesin-i18n-dua-varian--katalog-shell).
* 2026-08-08 — PR-029b selesai (penjaga salinan mentah dua arah, penjaga struktur per fitur, panduan menulis bahasa sederhana). AC 2 & 4 terpenuhi — **PR-029 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-029b--penjaga-katalog--panduan-bahasa-sederhana).
* 2026-08-09 — PR-025d selesai (fondasi PWA: manifest, ikon sementara, service worker aset statis, pendaftaran khusus produksi). Menutup celah ADR-009 ↔ backlog. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-025d--fondasi-pwa-manifest--service-worker-aset-statis).


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

* [x] Unit Test (session store) — `sesi-store.test.ts`, `terlindungi.test.tsx`, `tujuan.test.ts`, `klien-api.test.tsx`, `masuk.test.tsx`, `masuk-google.test.tsx`, `pkce.test.ts`, `google-oauth.test.ts`, `nomor-hp.test.ts`.
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

* [ ] Login OTP end-to-end terhadap API dev (sender mock). *(PR-030b — alurnya **terbangun dan teruji** dari nomor sampai sesi, termasuk normalisasi `0812…` → E.164 yang benar-benar sampai ke jaringan. Yang belum: dijalankan terhadap API dev sungguhan. **Butuh stack dev berjalan** — utang tercatat, lihat catatan verifikasi di bawah.)*
* [ ] Login Google end-to-end (akun uji). *(PR-030c — alur PKCE **terbangun dan teruji**: verifier S256 diuji terhadap vektor resmi RFC 7636, `state` anti-login-CSRF diperiksa, titipan sekali pakai. Yang belum: dijalankan terhadap akun Google sungguhan. **Butuh kredensial OAuth nyata** — utang tercatat.)*
* [x] Seluruh alur selesai keyboard-only. *(PR-030b menutup jalur OTP — diuji dari mengetik nomor sampai sesi terbentuk tanpa satu pun klik. PR-030c menutup jalur Google: tombolnya `Tombol` biasa, dan halaman kembalian tidak menuntut interaksi apa pun.)*
* [x] Error (OTP salah/kedaluwarsa) diumumkan screen reader. *(PR-030b — lewat `role="alert"` milik KolomForm yang sekaligus menulis `aria-invalid` dan `aria-describedby`, jadi yang terlihat dan yang terdengar tidak bisa menyimpang. Fokus dikembalikan ke kotak kode sesudah galat.)*
* [x] Route terlindungi redirect ke login dengan kembali ke tujuan awal. *(PR-030a — guard bertiga keadaan: `memulihkan` mencegah pengguna yang SEDANG login terlempar ke halaman masuk pada milidetik pertama tiap reload. Tujuan awal dibawa lewat `?tujuan=` yang selalu dibersihkan dari open redirect, di sisi tulis MAUPUN sisi baca.)*

> **Dipecah jadi tiga PR (persetujuan owner 2026-08-09):** scope utuh terukur ≈ 1440 LOC. Diusulkan **sebelum** implementasi.
> **PR-030a** — Fondasi sesi & route guard — *selesai* (AC 5). Mendarat **± 860 LOC**, di atas target <500 dan di atas perkiraan ≈480; pemecahan lebih lanjut tidak ditempuh karena test guard membutuhkan tumpukan provider yang dirakit klien API — memisahkannya menghasilkan PR yang test-nya tidak bisa berjalan bermakna.
> **PR-030b** — Login OTP — *selesai* (AC 4; AC 1 & 3 terbangun, sisa verifikasi manual). Mendarat **± 920 LOC**, di atas target <500 dan di atas perkiraan ≈540.
> **PR-030c** — Login Google (PKCE) — *selesai* (AC 3; AC 2 terbangun, sisa verifikasi manual). Mendarat **± 1.040 LOC**, di atas target <500 dan di atas perkiraan ≈420. **PR-030 tuntas kecuali dua verifikasi manual.**
>
> **Verifikasi yang TIDAK bisa ditutup unit test (keputusan owner 2026-08-09):** AC 1 menuntut alur nyata terhadap API dev dengan sender mock, AC 2 menuntut akun Google uji. Keduanya dicatat sebagai utang eksplisit, sama seperti NVDA sampling — dibangun dan diuji unit di sini, dijalankan owner saat stack dan kredensialnya siap.

#### Dependencies

* PR-018
* PR-027
* PR-029

#### Risks

* Input OTP tidak aksesibel (pola 6 kotak). Mitigasi: satu input dengan autocomplete="one-time-code". **Ditempuh apa adanya di PR-030b** dan dijaga test: satu kotak, `autocomplete="one-time-code"`, `inputMode="numeric"`. Pola enam kotak memecah satu nilai menjadi enam label, memindahkan fokus otomatis di tengah pengetikan, dan membuat tempel-satu-kode gagal — ketiganya menyakitkan justru bagi pengguna screen reader dan pengguna dengan motorik terbatas.
* **Nomor yang ditulis manusia bukan E.164.** `phoneNumberSchema` menuntut `+62…`, sementara pengguna Indonesia menulis `0812…`, kadang berspasi, kadang `62…` hasil salinan dari kontak WhatsApp. Menolak semuanya secara teknis benar dan secara produk salah: yang ditolak di kotak PERTAMA menyimpulkan aplikasinya tidak bisa dipakai, lalu pergi — dan yang paling dirugikan adalah pengguna yang paling sulit mengetik ulang. PR-030b menormalkan bentuk-bentuk itu, lalu memvalidasi dengan skema yang SAMA dengan server (bukan regex kedua yang bebas menyimpang).
* **Hitung mundur di dalam live region menenggelamkan segalanya.** Region yang isinya berubah tiap detik membuat screen reader membacakan hitungan tanpa henti. PR-030b menaruh angkanya di label tombol (di luar region) dan hanya mengumumkan SATU kalimat saat hitungannya habis.
* **Tanpa `state`, alur Google bisa dibajak (login-CSRF).** Penyerang memancing korban membuka alamat kembalian yang membawa authorization code MILIK PENYERANG; korban mendarat di aplikasi yang benar, tampak sudah masuk, tetapi ke akun penyerang — dan segala yang ia tulis sesudahnya (CV, riwayat kerja, nomor HP) masuk ke akun yang bukan miliknya. PR-030c mengarang `state` acak-kriptografis, menitipkannya bersama verifier, dan MENOLAK kembalian yang tidak cocok — tanpa pernah menukarkan code-nya.
* **Titipan OAuth harus sekali pakai.** Alamat kembalian bisa dibuka ulang (tombol kembali, riwayat, tab dipulihkan). PR-030c menghapus titipan lebih dulu, apa pun hasilnya.
* **Pemulihan sesi bisa MENCABUT sesi yang baru terbentuk.** Ditemukan test PR-030c, bukan review: pemulihan berjalan sejak aplikasi dipasang, sementara `/masuk/google` menukarkan code segera setelah dimuat. Pemulihan yang gagal — wajar, pengunjung itu memang belum punya cookie — lalu memanggil `keluar()` sesudah penukaran berhasil. Pengguna terlempar keluar tepat setelah berhasil masuk, tanpa satu pun pesan. Ditutup dengan penjaga "hanya berlaku bila status masih `memulihkan`".
* **Angka "tunggu berapa lama" pada 429 tidak terbaca klien.** Server menaruhnya di header `Retry-After` (lihat `AppErrorOverrides`), bukan di envelope, dan `ApiError` tidak membawa header — sehingga hint bawaan `TERLALU_BANYAK_PERCOBAAN` ("Tunggu sesuai waktu yang diberitahukan") menunjuk angka yang tidak pernah sampai ke layar. Hitung mundur "kirim ulang" karena itu digerakkan `retryAfterSeconds` dari jawaban SUKSES `/auth/otp/request`. Menutup celahnya berarti mengubah `@nawasena/api-client` agar meneruskan header — **belum dikerjakan**.
* **Guard dua keadaan melempar pengguna yang sedang login ke halaman masuk.** Sesi web dipulihkan dari cookie HttpOnly lewat satu perjalanan ke `/auth/refresh`; guard yang hanya mengenal "masuk" dan "keluar" membaca "keluar" sebelum jawabannya tiba. Cacatnya tak terlihat saat mengembangkan — kita jarang me-reload setelah login — dan muncul pada setiap pengguna. PR-030a menambah keadaan ketiga (`memulihkan`) sebagai nilai AWAL store, dan menjaganya lewat test yang membaca modul yang baru dimuat, bukan store yang sudah disentuh test lain.
* **`?tujuan=` adalah open redirect bila dipakai apa adanya.** Alamat kiriman orang lain (`/masuk?tujuan=https://jahat.example`) mengirim pengguna ke situs asing TEPAT setelah ia berhasil masuk — saat ia paling percaya bahwa yang dilihatnya aplikasi ini. PR-030a membersihkannya di kedua sisi, dan menolak juga bentuk `//host` serta `/\host` yang lolos dari pemeriksaan "diawali `/`".
* **Barrel `@nawasena/ui` menarik seluruh Radix ke setiap chunk yang menyentuhnya.** Terukur di PR-030a: mengimpor SATU komponen membuat chunk halaman melonjak 0,32 → 118,74 kB (40,20 kB gzip). Ditutup dengan `"sideEffects": false` pada `packages/ui` (turun ke 30,17 kB / 9,70 kB gzip, nol rujukan Radix), dan dijaga test — sebab hilangnya baris itu tidak menampakkan gejala apa pun selain halaman yang pelan.

#### Log Implementasi

* 2026-08-09 — PR-030a selesai (store sesi tanpa persistensi, klien API + pemulihan sesi saat boot, guard `Terlindungi` bertiga keadaan, pertahanan open redirect). Menutup AC 5. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-030a--fondasi-sesi--route-guard).
* 2026-08-09 — PR-030b selesai (halaman `/masuk` dua langkah, normalisasi nomor HP, katalog i18n auth, pemetaan galat berkode). Menutup AC 4; AC 1 & 3 terbangun dan teruji, sisa verifikasi manual. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-030b--login-otp).
* 2026-08-09 — PR-030c selesai (PKCE S256, `state` anti-login-CSRF, titipan sekali pakai, halaman kembalian `/masuk/google`, `googleAuth` di api-client). Menutup AC 3; AC 2 terbangun, sisa verifikasi manual. Memperbaiki race pemulihan sesi dari PR-030a. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-030c--login-google-pkce).


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

* [x] Unit Test — checklist aslinya menulis N/A; ternyata bukan. `packages/a11y/__tests__/axe-harness.test.tsx` (8) + `pengujian-terpisah.test.ts` (2) + `apps/web/__tests__/registry-halaman.test.ts` (13, termasuk penjaga bahwa nama check `a11y` tidak berubah).
* [ ] Integration Test (harness)
* [x] E2E Test (menjalankan axe) — `apps/web/e2e/aksesibilitas.spec.ts`, berjalan atas HASIL BUILD lewat `vite preview`.
* [x] Accessibility Test (inilah gate-nya) — job `a11y` wajib di repository ruleset; nama check-nya dijaga `registry-halaman.test.ts` agar kewajibannya tidak lepas diam-diam saat job di-rename.
* [ ] Manual Verification (PR uji dengan pelanggaran)

**Deliverables:**

* Gate a11y aktif untuk semua PR FE berikutnya

**Out of Scope:**

* Audit manusia (PR-110).

**Rollback Strategy:**

Gate dapat diturunkan ke warning via config darurat (dengan approval EM) — dicatat sebagai insiden proses.

#### Acceptance Criteria

* [x] Pelanggaran axe fixture → CI merah (bukti). — **PR-031a**, di tingkat komponen. Diverifikasi mutasi, dan hasilnya membuktikan DUA lapis memang berbeda: `<img>` tanpa `alt` tertangkap `jsx-a11y` sebelum test jalan, sementara tombol ikon `<span aria-hidden>x</span>` **LOLOS lint** (0 error) dan tertangkap axe (`[button-name]`). Analisis statis satu berkas tidak bisa tahu bahwa `aria-hidden` pada satu-satunya anak menghapus nama tombolnya. Fixture halaman di browser sungguhan menyusul di PR-031b.
* [x] Lighthouse a11y < 100 → CI merah. — **PR-031b**, dibuktikan dengan bukti: `<img>` tanpa `alt` ditanam ke `dist/index.html`, dan `lhci` keluar dengan status 1 (`categories.accessibility failure for minScore assertion, expected: >=1`). Skor sekarang: a11y **100**, performance **100**, best-practices 96, SEO 100.
* [x] Registry halaman mudah ditambah per PR fitur. — **PR-031b.** SATU daftar (`apps/web/e2e/halaman.ts`) dipakai axe DAN Lighthouse; menambah halaman berarti menambah satu entri, tanpa menyentuh berkas lain. Dan karena yang mudah ditambah juga mudah ditambah SALAH, `registry-halaman.test.ts` menuntut nama unik, jalur yang menunjuk route nyata, alasan tertulis untuk tiap pengecualian aturan, dan — arah yang menahan erosi — **setiap route produksi wajib punya entri**, sehingga halaman baru tidak bisa lahir tanpa penjagaan.
* [x] Laporan kegagalan menyebut elemen + aturan. — **PR-031a.** Helper ditulis sendiri (bukan `jest-axe`) justru supaya bentuk laporannya bisa **dijamin**, bukan diharapkan: id aturan, selektor elemen, ringkasan perbaikan, dan URL rujukan. Pesan galat juga menyebut **batasnya sendiri** — aturan mana yang TIDAK ikut diperiksa — sebab gerbang yang diam soal batasnya melahirkan rasa aman palsu.
* [x] Durasi tambahan pipeline < 5 menit. — **PR-031b.** Job `a11y` berjalan PARALEL dengan `lint-typecheck-test`, jadi tambahan durasi pipeline mendekati nol selama ia selesai lebih dulu. Terukur lokal: build 3 s + axe 10 s + Lighthouse 41 s = **54 s** (di luar `pnpm install` dan unduhan chromium di CI).

> **Dipecah jadi dua PR (persetujuan owner 2026-08-08), DAN 031a didahulukan.** Menurut dependensi dokumen, PR-031 mendarat setelah PR-030 — artinya **enam PR frontend**, termasuk seluruh pustaka komponen (PR-027/028), lahir tanpa gerbang aksesibilitas, padahal CLAUDE.md §5.2 menyebutnya *non-negotiable*. Bila gerbangnya baru menyala belakangan, yang diperbaiki adalah komponen yang sudah dianggap selesai — dan perbaikannya menyentuh setiap pemakainya.
> **PR-031a** — `jsx-a11y` strict + `axe` per komponen (`@nawasena/a11y/pengujian`), berjalan tanpa browser sehingga bisa mendahului PR-027 — *selesai* (AC 1, 4).
> **PR-031b** — registry halaman + axe di browser sungguhan + Lighthouse — *selesai* (AC 2, 3, 5). Mendarat **476 LOC** — di bawah target. `TAK_BISA_DI_JSDOM` ditutup: `color-contrast` dan `target-size` kini benar-benar **LULUS** di peramban, bukan sekadar berjalan — itulah yang akhirnya mengukur klaim PR-027 (kontras 17,4:1, target sentuh ≥ 44 px) dalam warna dan piksel, bukan dalam nama kelas.
>
> **KOREKSI ATRIBUSI UTANG.** Log PR-027/PR-028 menunda beberapa hal ke "PR-031b" yang sebenarnya BUKAN pekerjaan gerbang ini, dan tetap terbuka sesudahnya: perilaku pada zoom 200 % (`max-h` Dialog, penempatan popper Pilihan), typeahead & penguncian scroll Radix, `aria-hidden` pada sisa halaman saat Dialog terbuka, pintasan F8 dan jeda hitung mundur Toast. Semuanya butuh e2e per KOMPONEN, bukan pemindaian aturan per halaman — dan wajarnya lahir bersama halaman fitur yang benar-benar memakai komponen itu. NVDA sampling tetap manual dan tidak bisa diotomatiskan gerbang mana pun.

#### Dependencies

* PR-030 — hanya untuk PR-031b (butuh halaman login nyata). PR-031a hanya bergantung pada PR-025.
* PR-003

#### Risks

* False sense of security (axe ≠ WCAG penuh). Mitigasi: audit manual tetap gate rilis (PR-110). — **diperkuat di PR-031a:** batas jsdom ditulis sebagai daftar `TAK_BISA_DI_JSDOM`, disebutkan di setiap pesan galat, dan dibuktikan oleh test yang memperlihatkan teks putih di atas latar putih **LOLOS** pemeriksaan ini. Lubangnya ditulis sebagai test, bukan sebagai catatan.

#### Log Implementasi

* 2026-08-09 — PR-031a selesai (`jsx-a11y` strict, helper axe per komponen, gerbang diterapkan ke seluruh tampilan yang ada termasuk keadaan kegagalan). AC 1 & 4 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-031a--gerbang-aksesibilitas-jsx-a11y--axe-per-komponen).
* 2026-08-09 — PR-031b selesai (registry halaman, axe di peramban sungguhan atas hasil build, Lighthouse CI, job `a11y` diaktifkan). Menutup AC 2, 3, 5 — **PR-031 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-031b--gerbang-a11y-di-peramban-axe--lighthouse).


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

* [x] Unit Test — checklist aslinya menulis N/A; ternyata bukan. `beranda.test.tsx`, `tata-letak.test.tsx`, `kesalahan.test.tsx`, plus `keadaan-kosong.test.tsx` di `packages/ui`.
* [ ] Integration Test (N/A)
* [ ] E2E Test (smoke landing→login) — belum ada spec yang menempuh landing → login sebagai SATU alur. Yang ada: `lompat-ke-konten.spec.ts` menyentuh kedua halaman secara terpisah.
* [x] Accessibility Test (axe + keyboard) — beranda & 404 lolos axe di dua lapis (jsdom + peramban), dan tautan lompat ke konten diuji sebagai perpindahan fokus sungguhan di `lompat-ke-konten.spec.ts`.
* [ ] Manual Verification (mobile viewport)

**Deliverables:**

* Landing + 404 + pola empty state

**Out of Scope:**

* Konten marketing lengkap (tim non-eng).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Lighthouse perf ≥ 80 pada 3G throttling. — **PR-032a.** Gerbang BARU (`lighthouserc-3g.json`), bukan penyetelan yang lama: yang lama memakai preset desktop, dan halaman yang sehat di sana bisa gagal total di ponsel pada jaringan lambat. Throttling ditulis EKSPLISIT (RTT 300 ms, 700 kbps, CPU 4×) alih-alih memakai preset `mobile` bawaan Lighthouse — preset itu mensimulasikan *Slow 4G* (150 ms / 1.638 kbps), lebih cepat daripada 3G, dan namanya tidak memberi tahu siapa pun bahwa angka yang dijanjikan AC ini tidak sedang diuji. Terukur: **perf 82, a11y 100** (FCP 3,0 s; LCP 3,9 s; TBT 0 ms). Marginnya tipis dan dicatat sebagai risiko.
* [x] Struktur heading & landmark benar (axe + manual). — **PR-032a.** SATU `<main>` untuk seluruh aplikasi, dipindahkan dari tiap halaman ke `TataLetak`; halaman yang menulis `<main>` sendiri kini menghasilkan landmark ganda yang ditangkap test. Tautan lompat ke konten dipasang sebagai elemen fokusabel pertama, dengan sasaran `tabindex="-1"` — tanpa itu sebagian peramban hanya menggulir tanpa memindahkan fokus. Urutan tingkat heading dijaga mesin (tidak boleh melompat), dan tiap `<section>` bernama lewat `aria-labelledby`. **Verifikasi manual NVDA tetap utang** — tidak ada gerbang yang bisa menggantikannya.
* [x] CTA daftar → login/onboarding. — **PR-032a.** Dua ajakan (hero + penutup), keduanya `<Link>` ke `/masuk`, bukan tombol: hanya tautan yang bisa dibuka di tab baru, disalin alamatnya, dan ditelusuri perayap — dan screen reader mengumumkan "tautan" dan "tombol" secara berbeda. Dijaga test yang memeriksa PERAN-nya, bukan sekadar keberadaan teksnya.
* [x] 404 memberi jalan pulang yang jelas. — **PR-032b.** Aksi layar kesalahan dibuat **per-keadaan**, dan itu koreksi bukan kerapian: "Muat ulang halaman" pada 404 adalah saran yang PASTI gagal — ia memuat ulang alamat yang memang tidak ada, dan pengguna yang menurutinya mendarat di layar yang sama lalu menyimpulkan aplikasinya rusak. 404 → tautan ke beranda; 401/403 → tautan ke masuk; umum → muat ulang (di sana ia memang benar). Tepat SATU aksi per keadaan, dijaga test. Jalan pulangnya diperiksa dengan **ditempuh**, bukan dengan membaca `href`-nya.
* [x] Konten tersedia dalam id + id-simple. — **PR-032a** menutup landing (katalog `beranda`, 16 kunci); **PR-032b** menutup teks jalan pulang. Keduanya melewati penjaga salinan mentah PR-029b — setiap entri yang varian sederhananya identik wajib terdaftar beserta alasannya. Pola empty state tidak menyumbang kunci: teksnya datang dari pemakainya, sebab komponen `packages/ui` tidak boleh tahu katalog milik aplikasi web.

> **Dipecah jadi dua PR (persetujuan owner 2026-08-09):** scope utuh terukur ≈ 700–750 LOC, di atas target <500. Diusulkan **sebelum** implementasi.
> **PR-032a** — landing + landmark/skip-link final + meta SEO + gerbang Lighthouse 3G — *selesai* (AC 1, 2, 3). Mendarat **825 LOC** (447 sumber + 378 test), di atas target <500 dan di atas perkiraan ≈430; selisihnya dilaporkan di log.
> **PR-032b** — 404 berjalan pulang + pola empty state — *selesai* (AC 4, 5). **PR-032 tuntas.**
>
> **Keputusan bentuk 404 (owner 2026-08-09):** memperkuat `LayarKesalahan` yang sudah ada, BUKAN membuat route 404 tersendiri. Tombol "Muat ulang halaman" pada 404 justru salah — ia memuat ulang halaman yang memang tidak ada — jadi aksinya dibuat per-keadaan. Route tersendiri akan melahirkan DUA layar 404 (yang ini, dan cabang `takDitemukan` untuk 404 yang dilempar loader fitur kelak), dan keduanya bebas menyimpang.

#### Dependencies

* PR-030

#### Risks

* Minim.
* **Margin perf 3G hanya 2 poin (82 dari ambang 80).** Bukan halaman landing-nya yang berat — ia tanpa gambar, tanpa webfont, dan chunk-nya 0,95 KB gzip. Yang memakan anggaran adalah **bundel awal 101,3 KB gzip**: React Router, TanStack Query, Zustand, dan klien API ikut terunduh oleh pengunjung yang belum tentu masuk. Halaman publik pertama membayar biaya seluruh aplikasi. Penjaganya sudah menyala sejak sekarang (CI merah bila turun di bawah 80), jadi penurunannya akan ketahuan pada PR yang menyebabkannya — tetapi menaikkan marginnya menuntut memisahkan shell publik dari shell aplikasi, dan itu keputusan arsitektur yang wajarnya diambil bersama Phase 16.

#### Log Implementasi

* 2026-08-09 — PR-032a selesai (landing publik tanpa gambar, `<main>` tunggal + tautan lompat ke konten di `TataLetak`, judul dokumen per halaman, meta Open Graph, gerbang Lighthouse 3G di CI, katalog i18n `beranda`). AC 1, 2, 3 terpenuhi. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-032a--landing-landmarkskip-link-final--gerbang-lighthouse-3g).
* 2026-08-09 — PR-032b selesai (aksi layar kesalahan per-keadaan sehingga 404 punya jalan pulang, `KeadaanKosong` di `packages/ui` dengan live region sopan dan tingkat heading terikat tipe). AC 4 & 5 terpenuhi — **PR-032 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-032b--404-berjalan-pulang--pola-empty-state).


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

* [x] Unit Test — checklist aslinya menulis N/A; ternyata bukan. **PR-033c-2: 16 test web** di `hapus-akun-google.test.tsx` (maksud titipan 4, kembalian tidak menghapus sendiri 4, keadaan sesi 2, kegagalan konfirmasi 2, sesudah terhapus 2, axe 2), plus 3 test jalur Google yang ditambahkan ke `hapus-akun.test.tsx`. **PR-033c-1: 20 test web** di berkas itu (berkasnya kini 23 total) + **6 test api-client**. **PR-033b: 27 test web + 4 api-client.** **PR-033a: 26 test web** (penjagaan route 3, kerangka & navigasi 5, panel akun 7, slot aksesibilitas 3, judul dokumen 1, bahasa sederhana 2, axe lapis kedua 3, penjaga anti-hampa 2) + **6 test api-client** untuk `/me` + 1 penjaga rekursi registry.
* [ ] Integration Test (N/A)
* [x] E2E Test (ekspor + hapus akun) — **keduanya selesai.** Ekspor (PR-033b): 3 test yang menangkap unduhan SUNGGUHAN, memparse ulang isinya, dan menempuh tombolnya lewat keyboard. Hapus akun: dialognya diperiksa axe di peramban pada langkah yang benar-benar memuat tombol perusaknya (PR-033c-1), dan layar kembalian Google diuji sebagai halaman yang dimuat DARI NOL — termasuk bahwa membukanya TIDAK mengirim permintaan hapus (PR-033c-2, `e2e/hapus-akun-google.spec.ts`). **PR-033a: kedua halaman pengaturan masuk registry PR-031**, diperiksa axe di peramban sungguhan dan diikutkan uji tautan lompat.
* [ ] Accessibility Test (axe + NVDA dialog) — **axe lolos di dua lapis** (jsdom + Chromium): dialog hapus akun pada langkah yang benar-benar memuat tombol perusaknya (PR-033c-1) dan layar kembalian Google (PR-033c-2). NVDA sungguhan belum dijalankan — utang yang sama bentuknya dengan NVDA sampling PR-030.
* [ ] Manual Verification (akun uji dihapus benar-benar) — belum. Alurnya teruji terhadap klien palsu; menjalankannya terhadap API dev dengan sender mock adalah utang yang sama bentuknya dengan AC 1 PR-030.

**Deliverables:**

* Settings + Data Saya

**Out of Scope:**

* Panel preferensi a11y (PR-036).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Ekspor mengunduh JSON milik user. — **PR-033b.** Dibuktikan di DUA lapis, sebab jsdom tidak pernah benar-benar mengunduh apa pun: test jsdom menyadap klik tautannya (membuktikan nama & isi yang benar diserahkan), dan test Playwright menangkap unduhan SUNGGUHAN lalu memparse ulang isinya. Selisih keduanya bukan teori — tautan yang tidak pernah masuk dokumen, atau URL objek yang dilepas terlalu cepat, lolos jsdom dengan mulus dan gagal DIAM-DIAM di peramban.
* [x] Hapus akun butuh dua langkah + re-auth; tidak bisa via satu klik. *(PR-033c-1 — alurnya **terbangun penuh dan teruji** untuk akun ber-nomor HP: tiga langkah (akibat → minta kode baru → konfirmasi), dan `DELETE /auth/account` hanya terkirim setelah kode diisi. Dijaga test yang memeriksa PERMINTAAN YANG BENAR-BENAR SAMPAI KE JARINGAN, bukan sekadar tampilan dialognya — membuka dialog mengirim nol permintaan, dan menekan tombol perusak dengan kotak kode kosong juga nol. **PR-033c-2** menutup akun yang masuk lewat Google: dialog mengantar ke Google dengan `max_age=0` — meminta autentikasi BARU, bukan sekadar code yang diterbitkan diam-diam karena peramban masih punya sesi Google — lalu halaman kembalian bertanya SEKALI LAGI dengan tombol yang menyebut akibatnya. Membuka alamat kembalian tidak menghapus apa pun; dijaga di jsdom DAN di peramban sungguhan. **AC ini kini tertutup untuk semua akun.**)*
* [ ] Dialog konfirmasi lolos NVDA checklist. *(PR-033c-1 menutup butir STRUKTURALNYA di CI: peran `dialog` + nama, sisa halaman disembunyikan dari pohon aksesibilitas, fokus masuk ke dalam dialog dan TIDAK mendarat di tombol perusak, Escape menutup dan fokus kembali ke pemicu, seluruh alur bisa ditempuh keyboard-only, dan axe lolos di tiap langkah — termasuk di peramban sungguhan. Yang TIDAK bisa dijamin mesin: apakah urutan pembacaannya masuk akal saat didengar. Itu tetap utang manual, sama seperti NVDA sampling PR-030.)*
* [ ] Seluruh halaman keyboard-only. *(Tiga dari empat alur tertutup sebagai PERBUATAN keyboard, bukan lewat pemeriksaan `href`: navigasi panel (PR-033a — Tab lalu Enter), kendali ekspor (PR-033b — di jsdom DAN di peramban), dan hapus akun jalur OTP dari membuka dialog sampai penghapusan terkirim (PR-033c-1). Seluruh tombol pada alur ini memakai `aria-disabled`, bukan `disabled`: tombol yang dinonaktifkan saat sedang MEMEGANG fokus melemparkan fokus itu ke awal dokumen, dan di dalam dialog itu berarti keluar dari jerat fokusnya. **Yang belum diuji khusus keyboard: jalur hapus akun lewat Google** — tombol "Lanjut ke Google" dan layar kembalian memakai `Tombol` biasa dan lolos axe, tetapi belum ada test yang menempuhnya tanpa satu pun klik.)*
* [x] Copy dalam id + id-simple. — Katalog `pengaturan` lengkap di keempat sub-PR: kerangka & panel akun (033a), ekspor (033b), hapus akun (033c-1), jalur Google (033c-2). **Ditegakkan tipe, bukan sekadar dipatuhi:** `EntriTeks` menuntut kedua varian, sehingga kunci yang kehilangan salah satunya adalah `typecheck` MERAH — bukan cacat yang baru ketahuan di layar pengguna. Di atasnya, `katalog-kelengkapan.test.ts` menolak varian sederhana yang disalin mentah dari `id`: yang memang identik wajib terdaftar beserta alasannya, dan daftar alasan itu sendiri dijaga agar tidak menyimpan entri basi.

> **Dipecah jadi tiga PR (persetujuan owner 2026-08-10):** scope utuh terukur ≈ 1.400 LOC. Diusulkan **sebelum** implementasi. Re-auth bukan sekadar konfirmasi: `DELETE /auth/account` menuntut kode OTP baru **atau** consent Google baru (PKCE ulang), sehingga jalur hapus akun memuat alur login kedua di dalam sebuah dialog.
> **PR-033a** — Kerangka pengaturan, panel Akun, slot aksesibilitas — *selesai*. Mendarat **± 1.170 LOC** (490 sumber + 680 test/e2e), jauh di atas target <500 dan di atas perkiraan ≈450; selisihnya dilaporkan di log.
> **PR-033b** — Ekspor data — *selesai* (AC 1). Mendarat **± 1.170 LOC** (470 sumber + 700 test/e2e), di atas target <500 dan di atas perkiraan revisi ≈700.
> **PR-033c** — Hapus akun. **Dipecah lagi jadi dua (persetujuan owner 2026-08-10)**: re-auth Google menuntut pengalihan penuh ke Google dan kembali, dan alamat kembaliannya sudah terkunci di Google Cloud Console sebagai `/masuk/google` — sehingga halaman itu harus bisa membedakan "ini login" dari "ini konfirmasi hapus akun", plus menangani keadaan sesudah akun terhapus (sesi ikut mati). Scope utuh terukur ≈ 1.800 LOC.
> **PR-033c-1** — Hapus akun lewat kode OTP — *selesai*. Mendarat **± 1.080 LOC** — di bawah perkiraan revisi ≈1.100, pertama kalinya perkiraan tidak terlampaui, tetapi tetap di atas target <500.
> **PR-033c-2** — Re-auth Google + keadaan sesudah akun terhapus — *selesai*. Mendarat ± 950 LOC. Celah bagi pengguna Google-only tertutup; **PR-033 tuntas**, dan bersamanya seluruh 9 PR Phase 03.
>
> **"Cara Anda masuk" TIDAK ditampilkan di panel akun, dan itu keputusan.** `GET /me` mengembalikan `phone` tetapi bukan `googleId` (identitas provider sengaja bukan urusan pengguna — lihat `meSchema`), jadi satu-satunya cara menampilkannya sekarang adalah menebak dari ada-tidaknya nomor HP. Tebakan itu SALAH untuk akun yang punya keduanya, dan baris yang salah di halaman "data yang kami simpan tentang Anda" lebih merugikan daripada baris yang belum ada. PR-033c menghadapi kekurangan yang sama saat memilih cara re-auth; jalan keluarnya kelak adalah menambahkan `authMethods` ke kontrak `/me` (perubahan backend, di luar scope PR-033).

#### Dependencies

* PR-022
* PR-028

#### Risks

* User menghapus tanpa paham konsekuensi. Mitigasi: penjelasan bahasa sederhana + masa tunggu purge 30 hari disebutkan.
* **Halaman terlindungi lolos gerbang a11y sambil memeriksa halaman masuk.** Ditemukan saat mendaftarkan `/pengaturan` ke registry PR-031: jawaban palsu untuk `/auth/refresh` adalah 401, sehingga halaman terlindungi mengalihkan ke `/masuk` — dan axe berakhir hijau atas halaman yang sama sekali berbeda dari yang dilaporkannya. Kegagalan yang TIDAK PERNAH merah adalah yang paling mahal. Ditutup PR-033a dengan penanda `butuhSesi` di registry (jawaban `/auth/refresh` disesuaikan per halaman) plus penjaga `harusTidakBerpindah` yang memastikan alamat yang diminta memang alamat yang terbuka.
* **Panel bersarang lolos dari kewajiban terdaftar di registry.** Penjaga PR-031 hanya membaca route tingkat pertama, jadi `/pengaturan/aksesibilitas` — dan setiap panel yang lahir di bawah route bersarang mana pun sesudahnya — tidak wajib punya entri. PR-033a membuat penelusurannya rekursif dan menambahkan penjaga atas penjaganya sendiri.
* **Tautan lompat diuji pada dokumen yang masih kosong.** Cacat laten sejak PR-032a yang baru muncul ketika jumlah halaman bertambah: `page.goto` selesai begitu kerangka SPA terunduh, jauh sebelum React menulis apa pun, dan Tab yang ditekan pada dokumen kosong tidak mendarat di mana pun — fokusnya TIDAK menyusul sendiri sesudah isinya muncul. Halaman terlindungi paling rentan sebab ia menunggu pemulihan sesi lebih dulu. Ditutup dengan menunggu `h1` dan `bringToFront()` sebelum menekan Tab.

* **Ekspor sebagai `useQuery` akan menghabiskan jatah pengguna tanpa ia menekan apa pun.** Endpoint-nya `GET`, jadi bentuk yang paling wajar ditulis (`useQuery`) justru yang salah: ia berjalan sendiri saat komponen dipasang dan berpotensi berjalan lagi saat datanya dianggap basi — padahal tiap panggilan memakan satu dari tiga jatah harian dan tercatat di audit. Ditutup PR-033b dengan TIDAK menyediakan query key untuk endpoint itu di `@nawasena/api-client`, sehingga jalan yang salah tidak tersedia; dijaga test.
* **Re-auth lewat Google bisa membuktikan NOL bila Google diminta dengan cara biasa.** Bila peramban masih memegang sesi Google yang hidup, Google mengembalikan authorization code tanpa menanyakan apa pun — dan yang terbukti hanyalah "peramban ini pernah dipakai masuk ke Google", persis kelemahan yang seharusnya ditutup langkah re-auth (sesi yang lama dan diperbarui diam-diam). PR-033c-2 menambahkan `max_age=0` + `prompt=select_account` HANYA pada alur hapus akun; alur masuk biasa sengaja tidak dipaksa. **Batasnya jujur:** yang bisa dilakukan klien hanya MEMINTA. Penegakannya terbaca dari klaim `auth_time` di id_token, dan server saat ini hanya mencocokkan `sub` (PR-021) — memverifikasi `auth_time` adalah perubahan backend yang belum ada.
* **Halaman kembalian OAuth yang menghapus otomatis berarti tombol "kembali" bisa menghapus akun.** Alamat `/masuk/google` bisa dibuka ulang lewat riwayat atau tab yang dipulihkan, dan yang terakhir ditekan pengguna sebelum sampai di sana adalah tombol milik Google yang berbunyi "Lanjutkan" — tidak menyebut penghapusan apa pun. PR-033c-2 karena itu berhenti di layar konfirmasi: code-nya disimpan, penghapusan baru terjadi setelah tombol yang menyebut akibatnya ditekan. Dijaga di jsdom dan di peramban sungguhan.
* **Gerbang kontras warna punya DUA titik buta, dan keduanya baru terlihat saat diuji mutasi (PR-033c-1).** Tombol perusak berlatar merah didaftarkan ke gerbang peramban justru karena kontrasnya tidak bisa diperiksa jsdom — lalu mutasi yang menggantinya menjadi merah muda (rasio ± 1,9:1, jelas gagal) TETAP HIJAU. Sebab pertama: selama kotak kode kosong tombolnya ber-`aria-disabled`, dan axe memang MELEWATI pemeriksaan kontras pada kendali nonaktif — jadi entri registry-nya memeriksa satu-satunya hal yang menjadi alasannya ada sambil melewatinya. Ditutup dengan mengisi kodenya di `siapkan`; sesudah itu mutasinya merah. Sebab kedua (terpisah, ditemukan lewat probe langsung): warna yang sedang bertransisi dilaporkan peramban sebagai nilai ANTARA — tombol merah terbaca abu-abu gelap bila diukur tepat setelah dialog terbuka. Ditutup dengan menunggu `document.getAnimations()` tenang, meski uji mutasi menunjukkan yang kedua ini BUKAN penyebab lolosnya (dipertahankan demi determinisme, bukan diklaim menangkap cacat).
* **Sesi yang dibuang sebelum perpindahan halaman melempar pengguna ke halaman MASUK.** Ditemukan test, bukan review: memanggil `keluar()` sementara halaman terlindungi masih terpasang membuat `Terlindungi` langsung mengalihkan ke `/masuk?tujuan=%2Fpengaturan` — pengguna yang baru saja menghapus akunnya mendarat di halaman masuk, membawa tujuan kembali ke pengaturan akun yang sudah tidak ada. Menukar urutannya saja tidak cukup dan `flushSync` tidak menolong: pada data router, `navigate` asinkron. Perpindahannya harus DITUNGGU sebelum sesi dibuang.
* **Tombol `disabled` saat sibuk mengusir fokus pengguna keyboard.** Peramban melepas fokus dari elemen yang baru dinonaktifkan; pengguna yang menekan Enter mendarat di awal dokumen dan harus menyusuri halaman lagi — tepat setelah aksinya berhasil. PR-033b memakai `aria-disabled` + penjaga di handler, dan menyeragamkan tombol "Coba lagi" PR-033a yang sebelumnya memakai `disabled`.

#### Log Implementasi

* 2026-08-10 — PR-033c-2 selesai (maksud perjalanan dititipkan bersama bekal OAuth, `max_age=0` pada alur hapus akun, cabang hapus-akun di `/masuk/google` yang BERHENTI di layar konfirmasi, keadaan sesudah akun terhapus). Menutup AC 2 untuk akun Google — **PR-033 tuntas**. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-033c-2--hapus-akun-lewat-konfirmasi-google).
* 2026-08-10 — PR-033c-1 selesai (dialog konfirmasi tiga langkah, re-auth kode OTP, `DELETE /auth/account` di api-client, `HARI_SEBELUM_PURGE` dipindah ke kontrak bersama, dialog masuk registry gerbang a11y). Menutup AC 2 & 3 untuk akun ber-nomor HP; butir NVDA struktural ditegakkan CI. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-033c-1--hapus-akun-lewat-kode-otp).
* 2026-08-10 — PR-033b selesai (endpoint `GET /me/export` di api-client tanpa query key, tombol unduh dengan live region, pesan kuota khas ekspor, pengunduh berkas di `shared/`, inti pesan galat dipindah ke `shared/galat-api.ts`). Menutup AC 1. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-033b--ekspor-data-pribadi).
* 2026-08-10 — PR-033a selesai (route `/pengaturan` terlindungi + navigasi panel, panel Akun & Data Saya di atas `GET /me` yang baru di api-client, slot aksesibilitas memakai `KeadaanKosong`, katalog i18n `pengaturan`, penanda `butuhSesi` di registry a11y, penjaga registry rekursif). Menutup kerangka dari AC 4 & 5. Lihat [log/implementation_log_phase03.md](log/implementation_log_phase03.md#pr-033a--kerangka-pengaturan-panel-akun--slot-aksesibilitas).


## Exit Criteria

Phase 03 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 9 PR (PR-025..PR-033) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 04 - Accessibility Experience](phase-04-accessibility-experience.md)
