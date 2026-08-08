# Implementation Log — Phase 03 (Web Platform Base)

> Catatan per PR yang selesai di Phase 03. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---
## PR-025a — Bootstrap apps/web: Vite + React, preset ESLint React, harness test, budget bundle

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-025---appsweb-bootstrap)
> **Tanggal:** 2026-08-08
> **Status:** Selesai (bagian pertama dari PR-025; routing & provider = PR-025b, error boundary/offline/skeleton = PR-025c)

### Ringkasan hasil

`apps/web` berhenti menjadi placeholder. Vite + React 18 berjalan, berkas `.tsx` bisa di-lint untuk pertama kalinya, harness test jsdom hidup, struktur folder SDD §4.1 berdiri dan dijaga mesin, dan budget JS awal ditegakkan CI selagi bundelnya masih **44,8 KB dari 200 KB**.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 (`@nawasena/web` 19 test baru; total workspace 751), `check:openapi` sinkron, `vite build` + `cek:budget` lolos.

### Pemecahan PR (persetujuan owner 2026-08-08)

PR-025 utuh terukur ≈ 965 LOC, hampir dua kali batas <500. Dipecah tiga menurut **makna**, dan tiap potongan menutup AC yang utuh:

* **PR-025a** (ini) — bootstrap, preset ESLint React, harness Vitest jsdom, struktur folder, budget bundle CI. Menutup AC *"Struktur folder sesuai SDD §4.1"* dan *"Budget JS awal < 200 KB gzip"*.
* **PR-025b** — React Router v7 lazy + provider stack. Menutup AC *"Route ter-code-split"*.
* **PR-025c** — error boundary, banner offline, skeleton. Menutup dua AC sisanya.

### Scope selesai

* **`packages/config/eslint/react.cjs`** — preset React baru. Sebelum ini `base.cjs` murni Node, sehingga berkas `.tsx` **tidak bisa di-lint sama sekali**. Menumpuk di atas base, bukan menggantikannya.
* **`apps/web`** — `index.html`, `vite.config.ts` (Vite + Vitest satu berkas), entry `main.tsx`, `App.tsx`, struktur `app/ routes/ features/ shared/` masing-masing ber-README.
* **`scripts/cek-budget.ts`** — penjaga budget JS awal, dipanggil dari `pr.yml` setelah `vite build`.
* **Test (19)** — `app.test.tsx` (harness hidup), `cek-budget.test.ts` (11), `struktur-folder.test.ts` (7).

### Keputusan teknis

* **`jsx-a11y` SENGAJA belum dipasang.** Ia lahir bersama gerbang aksesibilitas (PR-031a) supaya penyalaannya menjadi satu keputusan yang terlihat. Menyelipkannya di PR bootstrap berarti gerbang a11y "menyala sebagian" tanpa ada yang memutuskan ambangnya — dan setengah gerbang lebih menyesatkan daripada tidak ada.
* **`react-hooks/exhaustive-deps` disetel `error`, bukan `warn` bawaannya.** Dependensi efek yang tertinggal adalah sumber bug stale-state yang tidak bergejala sampai timing-nya kebetulan berubah.
* **Vite dikunci 5.4.21, bukan 6.** Vitest 2.1.8 membawa Vite 5 sebagai dependensinya; memakai Vite 6 membuat DUA salinan hidup berdampingan, dan `defineConfig` dari `vitest/config` (bertipe Vite 5) menolak plugin bertipe Vite 6. Menaikkan vitest adalah perubahan lintas workspace — di luar scope PR ini.
* **Port dev dikunci `strictPort: 5173`.** Itu port default Vite dan **sudah terdaftar** sebagai Authorized redirect URI di Google Cloud Console (`http://localhost:5173/masuk/google`). Port yang bergeser diam-diam akan mematikan login Google di PR-030.
* **Budget menghitung dari `dist/index.html`, bukan menyapu `dist/assets/*.js`.** Sapuan folder ikut menghitung chunk lazy dan melaporkan angka jauh di atas yang benar-benar diunduh — penjaga yang berbohong ke arah salah, sebab ia akan merah untuk hal yang justru kita inginkan (code-splitting).
* **KB biner (1024).** Vite melaporkan 45,89 kB basis-1000 untuk berkas yang sama; keduanya benar, satuannya berbeda. Ditulis di kode supaya tidak ditafsir dua kali.
* **`viewport` tanpa `maximum-scale`/`user-scalable=no`.** Keduanya memblokir zoom dan melanggar WCAG 2.2 §1.4.4. Ini kesalahan paling lazim di template HTML mana pun, jadi alasannya ditulis di `index.html` agar tidak "dirapikan" kelak.

### Verifikasi

* **Uji mutasi penjaga budget:** ambang diturunkan 200 KB → 10 KB, `cek:budget` keluar dengan **status 1** dan pesan "GAGAL — kelebihan 34,8 KB". Jalur merahnya benar-benar dieksekusi, bukan diasumsikan — di CI ia diharapkan selalu hijau, jadi ini satu-satunya kesempatan mengujinya.
* **Build produksi nyata:** `vite build` → 30 modul, `cek:budget` melaporkan 44,8 KB / 200 KB.
* Penjaga struktur folder menuntut keempat folder SDD §4.1 **ada**, ber-README, dan **tidak ada folder kelima** — menangkap `utils/`/`components/`/`lib/` yang lahir diam-diam.

### Risiko yang ditemukan

* **Fondasi PWA tidak dikerjakan.** SDD §4.4 menuntutnya ("agar upgrade ke offline dasar di Fase 2 tidak merombak arsitektur"), tetapi scope PR-025 di file phase tidak menyebutnya, dan file phase yang jadi acuan. Jenis pekerjaan yang jauh lebih murah sekarang daripada setelah ada puluhan halaman — patut diangkat sebagai PR tersendiri sebelum Phase 04.
* **Test `apps/web` menambah ~50 detik ke pipeline** (penyiapan jsdom). Belum masalah; patut diawasi saat jumlah test FE tumbuh, sebab AC PR-031 menuntut tambahan pipeline < 5 menit.
* **`App.tsx` belum punya skip-link.** Sengaja: PR-032 memegang "landmark/skip-link final". Yang sudah ditegakkan sejak sekarang hanya `<main>` dan tepat satu `<h1>`.

### Next steps

* **PR-025b** — React Router v7 lazy per route + provider stack (QueryClient `networkMode: 'online'`, staleTime 60 s, retry 2 backoff).
* **PR-025c** — error boundary aksesibel, banner offline `role="alert"`, skeleton `aria-busy`.
* **PR-031a** — gerbang a11y: `jsx-a11y` + `jest-axe` ditegakkan CI, sebelum pustaka komponen lahir di PR-027.
* Angkat keputusan **fondasi PWA** ke owner.

---
## PR-025b — Routing lazy & provider stack

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-025---appsweb-bootstrap)
> **Tanggal:** 2026-08-08
> **Status:** Selesai (bagian kedua dari PR-025; error boundary/offline/skeleton = PR-025c)

### Ringkasan hasil

React Router v7 dengan pemuatan lazy per route, dan tumpukan provider TanStack Query dengan angka-angka SDD §4.1. Build nyata menghasilkan **dua chunk lazy** terpisah; bundel awal 75,9 KB dari 200 KB.

Menutup AC *"Route ter-code-split (bukti bundle analyzer)"*.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 (`@nawasena/web` 34 test; total workspace 766), `vite build` + `cek:budget` lolos.

### Scope selesai

* **`app/query-client.ts`** — `createQueryClient()` dengan `staleTime` 60 s, `retry` 2, backoff eksponensial berbatas, `networkMode: "online"`.
* **`app/providers.tsx`** — `QueryClientProvider`, klien bisa disuntik untuk test.
* **`app/routes.ts`** — daftar route sebagai DATA, tiap route `lazy`.
* **`app/App.tsx`** — perakitan: provider + router.
* **`routes/beranda.tsx`, `routes/masuk.tsx`** — kerangka halaman; isinya lahir di PR-032 dan PR-030.
* **`scripts/cek-budget.ts`** — bertambah `daftarJsDi()` dan `chunkLazy()`; nol chunk lazy membuat CI merah.
* **15 test baru** — router (5), query client (6), chunkLazy (3), plus app shell yang kini menguji pemuatan lazy.

### Keputusan teknis

* **`RouterProvider` diambil dari `react-router`, BUKAN `react-router/dom`.** Subpath `/dom` mengekspor `RouterProvider`-nya sendiri dengan salinan konteks yang terpisah, sehingga `<Link>` (yang membaca konteks dari entry utama) melempar `Cannot destructure property 'basename' ... as it is null`. **Ditemukan lewat test, bukan lewat membaca dokumentasi** — dugaan awal "subpath /dom adalah varian browser yang benar" keliru pada versi ini.
* **Daftar route dipisah dari perakitan router** (`routes.ts` vs `App.tsx`) supaya test memakai `createMemoryRouter` atas daftar yang SAMA PERSIS dengan produksi. Daftar kedua yang dirakit test bebas menyimpang tanpa ada yang tahu.
* **`useState` initializer malas untuk QueryClient**, bukan `?? createQueryClient()` di JSX: bentuk kedua membuat klien baru pada setiap render, dan tiap klien baru membawa cache kosong. Gejalanya menyesatkan — data seolah tidak pernah ter-cache.
* **`refetchOnWindowFocus: false`** (bawaan TanStack adalah `true`). Pengguna screen reader dan keyboard sering berpindah jendela; konten yang berubah sendiri saat kembali menghilangkan konteks yang sedang dibaca.
* **Mutasi `retry: 0`.** Melamar dan menghapus akun tidak idempoten; mengulanginya diam-diam bisa menciptakan aksi ganda yang tidak pernah diminta.
* **Route `/masuk` sudah ada sejak sekarang** meski isinya PR-030: `http://localhost:5173/masuk/google` adalah redirect URI yang SUDAH terdaftar di Google Cloud Console — jalur URL-nya bagian dari kontrak dengan pihak luar, bukan pilihan bebas belakangan. Dikunci test.

### Verifikasi

* **Uji mutasi:** `lazy` diganti impor statis untuk kedua route → `cek:budget` keluar **status 1** ("Tidak ada chunk lazy"), DAN test `setiap route dimuat lazy` merah. Dua lapis, keduanya benar-benar dieksekusi.
* **Build produksi nyata:** 87 modul, `index` 75,9 KB gzip + chunk `beranda` dan `masuk` terpisah.
* Test `app.test.tsx` memakai `findBy*`, bukan `getBy*` — kegagalan `getBy` di sana justru bukti pemuatannya asinkron.

### Risiko yang ditemukan

* **Bundel awal naik 44,8 → 75,9 KB** hanya karena react-router + TanStack Query. Masih 124 KB tersisa, tetapi pustaka komponen (PR-027/028) belum masuk sama sekali. Angka ini perlu dilihat tiap PR FE, bukan diperiksa sekali di akhir.
* **Belum ada `errorElement`.** Kegagalan route saat ini jatuh ke layar bawaan React Router yang berbahasa Inggris dan menampilkan jejak tumpukan. Ditutup PR-025c.
* **Belum ada route 404.** URL asing kini menghasilkan layar error bawaan yang sama. Milik PR-032.

### Next steps

* **PR-025c** — error boundary aksesibel (menggantikan layar bawaan React Router), banner offline `role="alert"`, skeleton `aria-busy`.
* **PR-031a** — gerbang a11y sebelum pustaka komponen lahir.
