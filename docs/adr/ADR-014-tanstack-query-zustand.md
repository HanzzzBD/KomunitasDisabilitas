# ADR-014 — TanStack Query + Zustand untuk State Management Klien

Status: Accepted

Tanggal: 2026-07-15

## Context

Web (React + Vite) dan mobile (React Native + Expo) Incasif berbagi logika melalui monorepo. Dibutuhkan pola state yang sama di kedua platform untuk: data server (feed matching, lamaran, notifikasi — dengan cache/retry/loading state) dan state global klien (Accessibility Profile, sesi, UI).

Constraint: tim kecil — boilerplate harus minimal; Accessibility Profile adalah global state produk (ADR-008) yang wajib persisted.

Alternatif yang dipertimbangkan:
1. **Redux Toolkit + RTK Query** — devtools kuat, tetapi boilerplate lebih besar dan dua konsep (slice + api) untuk kebutuhan yang sama.
2. **React Context murni** — tanpa dependensi, tetapi cache/retry/invalidations data server harus ditulis manual.
3. **TanStack Query + Zustand** — pemisahan tegas server-state vs client-state, minim boilerplate.

## Decision

Klien Incasif menggunakan **TanStack Query** untuk seluruh data server (konvensi key `[domain, params]`, staleTime 60 s, retry 2 dengan backoff, `networkMode: 'online'`) dan **Zustand** untuk state global klien (`useA11yStore`, `useSessionStore`, `useUiStore`) dengan persist + migrasi versi. Pola ini identik di web dan mobile. Mutasi kritis (apply) tidak memakai optimistic update; hanya aksi ringan (tandai notifikasi terbaca) yang optimistic.

## Consequences

### Positif

* Pola identik web/mobile → hooks fitur dapat dibagikan lintas platform.
* Cache + invalidation data server tertangani library yang teruji, bukan kode manual.
* Zustand persisted menjadikan preferensi aksesibilitas tersedia sejak render pertama.

### Negatif

* Dua library state (kurva pemahaman kapan memakai yang mana).
* Cache TanStack Query yang salah di-invalidate dapat menampilkan data basi (mis. status lamaran).

### Mitigasi

* Aturan tertulis di SDD: server-state = TanStack Query, client-state = Zustand — tidak ada data server di Zustand.
* Konvensi invalidation per event mutasi didokumentasikan per modul; status lamaran memakai refetch on focus.

## Referensi

SDD §4.1–4.3. Terkait: ADR-008, ADR-009, ADR-011.
