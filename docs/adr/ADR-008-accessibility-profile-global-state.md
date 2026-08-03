# ADR-008 — Accessibility Profile sebagai Global State Produk

Status: Accepted

Tanggal: 2026-07-15

## Context

Accessibility Profile adalah fitur pembeda utama Nawasena (PRD FR-2): pengguna — termasuk penyandang disabilitas ganda — menyusun kombinasi preferensi (skala teks, kontras tinggi, kurangi animasi, bahasa sederhana, preferensi BISINDO, target sentuh besar) dan seluruh UI harus menyesuaikan secara konsisten di web dan mobile, tersinkron antar perangkat (Accessibility Preferences Sync).

Constraint: WCAG 2.2 AA adalah gate rilis; implementasi per-halaman akan menghasilkan inkonsistensi yang tidak lolos audit.

Alternatif yang dipertimbangkan:
1. **Preferensi per halaman/komponen** — fleksibel lokal, tetapi inkonsisten dan tidak mungkin diaudit menyeluruh.
2. **Hanya menghormati setting OS** — tanpa penyimpanan sisi produk; kombinasi custom dan sinkronisasi lintas perangkat tidak terpenuhi.
3. **Global state produk yang dipersist dan disinkron** — satu sumber preferensi yang dikonsumsi seluruh UI.

## Decision

Accessibility Profile adalah **state global produk**: disimpan di tabel `accessibility_profiles` (terpisah dari data medis, tidak sensitif), dimuat saat login, dan dikelola di klien melalui store global `useA11yStore` (Zustand, persisted). Di web, preferensi dirender sebagai CSS custom properties dan atribut data pada `<html>` (`--font-scale`, `--touch-target-min`, `data-contrast`, `data-motion`, `data-lang-mode`) yang dikonsumsi seluruh design system; di mobile melalui ThemeProvider React Native. Setting aksesibilitas OS dihormati dan menang bila pengguna belum menetapkan preferensi eksplisit. Tidak ada komponen yang membaca preferensi dari sumber lain.

## Consequences

### Positif

* Konsistensi aksesibilitas total — satu perubahan preferensi mengubah seluruh aplikasi secara serempak.
* Sinkronisasi antar perangkat otomatis (server sebagai sumber kebenaran).
* Auditable: perilaku UI terhadap setiap kombinasi preferensi dapat diuji sistematis di CI.

### Negatif

* Seluruh design system harus dibangun token-aware sejak awal — biaya desain di muka.
* Preferensi yang salah dimuat (race saat login) berpotensi flash-of-wrong-theme.
* Dua varian string i18n (`id`, `id-simple`) menggandakan beban penulisan konten.

### Mitigasi

* `packages/ui` dan `packages/a11y` di monorepo menjadi satu-satunya sumber komponen dan token — komponen non-token ditolak review (SDD §4.3).
* Preferensi di-persist lokal (localStorage/SecureStore) → render pertama memakai nilai terakhir, lalu direkonsiliasi dengan server.
* Konten dinamis memakai tombol "Sederhanakan dengan AI" (berkuota) alih-alih menduplikasi semua konten (SDD §4.3).

## Referensi

PRD FR-2, US-02/03; SDD §4.3. Terkait: ADR-011, ADR-014.
