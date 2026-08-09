# ADR-019 — Tailwind CSS v4 sebagai styling framework web

Status: Accepted

Tanggal: 2026-08-09

## Context

CLAUDE.md §2 menyebut **Tailwind CSS** sebagai styling web, dan SDD menyebutnya tiga kali — semuanya **di dalam diagram ASCII**, bukan di bagian keputusan:

* SDD:103 — `packages/ui  Design system aksesibel (Radix + Tailwind; RN counterpart)`
* SDD:107 — `packages/config  eslint, tsconfig, tailwind preset`
* SDD:189 — `→ seluruh Tailwind preset membaca token ini`

**Tidak ada satu pun ADR yang menyebut Tailwind**, apalagi mengunci versinya. Tidak ada ADR tentang styling sama sekali.

Tailwind masuk repo pertama kali pada **PR-027a (commit `a96f34d`, 2026-08-09)** dengan pin `3.4.17`. Pin itu **asumsi implementasi agent**, bukan keputusan yang pernah diambil siapa pun. Alasan yang ditulis saat itu — *"repo menahan versi secara sadar (React 18, Vite 5)"* — tidak tahan diperiksa:

* **Vite 5** dipaksa oleh vitest 2.1.8 yang membawa Vite 5 sebagai dependensinya (kendala teknis, tercatat di log PR-025a);
* **React 18** memang ditulis SDD:99 dan CLAUDE.md §2 (keputusan terdokumentasi).

Keduanya punya sebab spesifik; tidak satu pun menetapkan kebijakan "tahan versi".

Sementara itu **ADR-008** — satu-satunya pernyataan normatif tentang token — menetapkan:

> *"Di web, preferensi dirender sebagai **CSS custom properties dan atribut data** pada `<html>` (…) yang dikonsumsi seluruh design system"*

ADR-008 sengaja **tidak menyebut framework CSS apa pun**. Mekanismenya netral terhadap versi.

Keputusan ini diambil **sebelum satu komponen pun memakai preset**: saat ditinjau, pemakainya hanya tiga berkas (`tailwind.config.cjs`, test preset, `gabung-kelas.ts`) dan nol komponen.

Alternatif yang dipertimbangkan:

1. **Tetap v3.4.17** — sudah terbukti hijau di repo saat itu; tetapi mempertahankan pilihan yang tidak pernah diputuskan, dan v3 berada dalam mode pemeliharaan.
2. **Naik ke v4** — sejalan dengan mekanisme ADR-008, dengan biaya migrasi terendah pada momen ini.
3. **Menunda sampai setelah PR-027b/c** — biayanya naik seiring tiap komponen yang lahir, tanpa manfaat yang menyertainya.

## Decision

Web Nawasena memakai **Tailwind CSS v4** (di-pin `4.3.3`).

Tema bersama hidup sebagai **berkas CSS** di `packages/config/tailwind/tema.css` (`@theme` + `@custom-variant`), diekspor sebagai `@nawasena/config/tailwind`, dan diimpor aplikasi lewat `@import`. Integrasi build memakai plugin Vite `@tailwindcss/vite`; **tidak ada `tailwind.config.js` maupun `postcss.config.js`**.

Alasan pokoknya: **v4 menjadikan CSS custom property sebagai tema itu sendiri**, sehingga mekanisme token ADR-008 terwakili langsung. Pada v3, mekanisme yang sama ditempuh lewat objek JS yang MENGHASILKAN CSS yang membaca custom property — satu lapisan yang tidak menambah apa pun.

**Kontrak token ADR-008 tidak berubah** dan tidak boleh berubah karena migrasi versi: `--font-scale`, `--touch-target-min`, `data-contrast`, `data-motion`, `data-lang-mode` — beserta nilai cadangannya — tetap persis sama. Kesetaraannya diuji dengan mengompilasi CSS sungguhan, bukan memeriksa struktur konfigurasi.

## Consequences

### Positif

* Mekanisme token ADR-008 terwakili langsung; satu lapisan tidak perlu hilang.
* Berkurang tiga berkas konfigurasi (`tailwind.config.cjs`, `postcss.config.cjs`, `preset.d.cts`) dan dua dependensi (`postcss`, `autoprefixer` di `apps/web` — autoprefixing sudah bawaan v4).
* Berada di jalur yang menerima perbaikan dan fitur; v3 dalam mode pemeliharaan.
* Migrasi terjadi saat pemakainya tiga berkas dan **nol komponen**.

### Negatif

* SDD:107 memakai kata "preset", yang di v4 tidak lagi berupa objek JS. Kata itu perlu disesuaikan saat SDD berikutnya disunting; maksudnya (tema bersama di `packages/config`) tidak berubah.
* `tailwind-merge` harus naik ke 3.x (menargetkan v4). Sudah dilakukan; konfigurasi grup kelas kustom berjalan tanpa perubahan.
* Dokumentasi dan contoh Tailwind di internet masih banyak yang v3; penulis komponen perlu memastikan rujukannya.

### Mitigasi

* Tema diuji dengan **mengompilasi CSS nyata** (`packages/config/__tests__/tailwind-tema.test.ts`), sehingga perilaku token — bukan bentuk konfigurasinya — yang dijaga. Diverifikasi uji mutasi dua arah.
* Nilai bawaan token di `:root` dijaga tetap setuju dengan `ACCESSIBILITY_DEFAULTS` (`apps/web/__tests__/token-bawaan.test.ts`).
* Integrasi dengan Vite 5.4.21 dan Vitest 2.1.8 diverifikasi lewat build produksi nyata dan seluruh suite test, bukan lewat asumsi.

## Referensi

CLAUDE.md §2; SDD §103, §107, §189, §4.3, §4.5. Terkait: **ADR-008** (mekanisme token — tidak berubah), ADR-011 (mobile memakai RN, di luar cakupan ADR ini).
