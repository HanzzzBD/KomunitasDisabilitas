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

---
## Insiden CI — flake "Worker exited unexpectedly" (2026-08-08)

> **Status:** sebab TIDAK ditemukan. Yang diperbaiki adalah kemampuan mendiagnosis kejadian berikutnya, bukan gejalanya.

### Yang terjadi

CI PR #59 (PR-025b) gagal pada langkah `Unit test`. Satu worker vitest mati:

```
Error: Worker exited unexpectedly
  at ChildProcess.onUnexpectedExit (tinypool/dist/index.js:118:30)
```

56 dari 57 berkas test `apps/api` lulus; 674 dari 684 test sempat berjalan. Berkas yang gugur: **`users-purge-db.test.ts`** (10 test) — persis selisihnya. Tidak ada satu pun galat JavaScript sebelum worker lenyap.

Jalan ulang **tanpa perubahan apa pun**: hijau (2m7s). Flake, bukan regresi.

### Hipotesis yang diuji dan DIBANTAH

**"Memori menumpuk lintas berkas karena `fileParallelism: false`."** Masuk akal di atas kertas: 57 berkas berjalan berurutan, jadi berkas berat di akhir antrean akan kena lebih dulu.

Diukur dengan `vitest run --logHeapUsage`: heap per berkas **12–35 MB, tanpa tren naik** — berkas terakhir seringan yang pertama (13, 14, 15 MB). `users-purge-db.test.ts` sendiri hanya **22 MB**. Vitest mengisolasi dengan benar; tidak ada akumulasi.

Hipotesis gugur. Kalau tidak diukur, ia akan menjadi dasar tambalan yang salah.

### Koreksi penalaran yang perlu diingat

Pemeriksaan pertama mencari kata "out of memory"/"killed" di log job dan tidak menemukannya. **Itu bukan bukti bukan-OOM**: pesan OOM killer ditulis ke log kernel, bukan ke stdout job. Absennya bukti di tempat yang salah bukan bukti absennya sebab.

### Kenapa tidak ditambal

Dua sumber bukti yang paling menentukan tidak pernah masuk log job:

1. jejak OOM killer kernel;
2. keluaran runtime kontainer service (GitHub hanya menampilkan langkah penyiapannya).

Tanpa keduanya, tambalan apa pun — membatasi konkurensi Turbo, menaikkan heap, menambah retry — adalah tebakan. Tebakan yang kebetulan menghilangkan gejala justru **menghabiskan satu-satunya kesempatan belajar**, dan flake-nya akan kembali di tempat lain.

### Yang dikerjakan

Langkah `Diagnostik kegagalan test` di `pr.yml`, berjalan **hanya saat test merah** (`if: failure()`): memori & disk, jejak OOM killer dari `dmesg`, dan `docker logs` seluruh kontainer service. Tiap perintah ber-`|| true` agar diagnostik tidak mengubah sebab kegagalan yang sedang dilaporkan.

### Yang harus diperhatikan berikutnya

* **Kejadian kedua = pola, bukan kebetulan.** Bila muncul lagi, log diagnostik akan menyebut apakah OOM terlibat dan apa yang dilakukan Postgres saat itu.
* **Kebiasaan mengulang sampai hijau adalah risiko sesungguhnya.** Satu flake yang dibiarkan mengajarkan bahwa merah boleh diabaikan — dan setelah itu CI berhenti berarti.
* Kandidat mitigasi bila sebabnya kelak terbukti tekanan sumber daya: `turbo run test --concurrency=2` di CI.

---
## PR-025c — Kegagalan yang jujur: error boundary, banner luring, penanda memuat

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-025---appsweb-bootstrap)
> **Tanggal:** 2026-08-08
> **Status:** Selesai. **PR-025 tuntas** — seluruh 5 AC terpenuhi.

### Ringkasan hasil

Tiga jalur kegagalan yang sebelumnya bisu kini punya suara: kesalahan route, kehilangan koneksi, dan perpindahan halaman yang lambat. Menutup AC *"Offline → banner alert; mutasi tertahan, tidak gagal senyap"* dan *"Error boundary menampilkan pesan sederhana + tombol muat ulang"*.

Bundel awal 76,6 KB dari 200 KB; dua chunk lazy tetap terpisah.

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/web` **55 test**. Test DB `apps/api` terlewat lokal (Docker Desktop mati saat run terakhir) — nol perubahan di `apps/api`, dan CI menjalankannya terhadap Postgres nyata.

### Scope selesai

* **`app/kesalahan.tsx`** — `LayarKesalahan`, dipasang sebagai `ErrorBoundary` route induk.
* **`app/banner-luring.tsx`** — banner `role="alert"` + tombol "Coba lagi".
* **`app/tata-letak.tsx`** — route induk: banner + `aria-busy` saat berpindah halaman + `<Outlet />`.
* **`shared/status-jaringan.ts`** — `useStatusJaringan()`.
* **`app/routes.ts`** — direstrukturisasi jadi bersarang di bawah route induk, plus catch-all 404.
* **28 test baru** — banner (7), layar kesalahan (6), status jaringan (4), router yang diperluas.

### Keputusan teknis

* **`ErrorBoundary` di route INDUK, bukan per halaman.** Dipasang per halaman, ia akan terlewat pada halaman yang ditambahkan belakangan — dan di sanalah layar bawaan React Router muncul: berbahasa Inggris, menampilkan jejak tumpukan, dan menyapa pengembang ("💿 Hey developer 👋"). Bagi pengguna yang dituju produk ini, layar itu bukan sekadar jelek — ia tidak bisa dibaca dan membocorkan jalur berkas internal.
* **Catch-all `path: "*"` MELEMPAR `Response(404)`, bukan merender `LayarKesalahan` langsung.** Dirender sebagai halaman biasa, `useRouteError()` kosong dan pesannya jatuh ke "ada yang tidak berjalan semestinya" — padahal yang terjadi jelas "halaman tidak ditemukan". Dilempar sebagai error, ia sampai ke ErrorBoundary dengan status yang benar.
* **`ErrorBoundary` (komponen), bukan `errorElement` (elemen JSX)** — `routes.ts` tetap `.ts` murni data, tanpa satu pun markup.
* **Banner dirender bersyarat, BUKAN disembunyikan CSS.** `role="alert"` hanya diumumkan saat elemennya MASUK ke DOM; elemen yang selalu ada lalu di-`display:none` tidak pernah memicu pengumuman, dan pengguna screen reader tidak akan pernah tahu koneksinya putus.
* **`role="alert"` (asertif) dipilih sadar** meski menyela: kehilangan koneksi mengubah apa yang bisa dilakukan pengguna SEKARANG, jadi menundanya sampai jeda bicara berikutnya berarti mereka terus mencoba hal yang tidak akan berhasil.
* **"Coba lagi" melepas mutasi lebih dulu, baru menyegarkan.** Mutasi adalah niat pengguna yang sudah dinyatakan (mis. menekan "Lamar"); itu lebih penting daripada memperbarui tampilan. Urutannya dikunci test.
* **Layar kesalahan tidak menampilkan detail teknis apa pun** — tanpa jejak tumpukan, tanpa pesan asli. Tidak berguna bagi pengguna, dan bisa memuat jalur berkas atau potongan data. Pengirimannya ke observability = PR-103.
* **`window.location.reload()`, bukan navigasi router:** keadaan aplikasi sudah terbukti rusak, dan router bisa gagal lagi dengan cara yang sama.
* **Penanda memuat berupa TEKS, bukan animasi berputar** — pengguna `prefers-reduced-motion` tetap terlayani, dan teksnya terbaca screen reader apa adanya. Skeleton visual adalah komponen `packages/ui` (PR-028); yang wajib ada sekarang penandanya, sebab tanpa itu setiap halaman berikutnya lahir dengan transisi yang bisu.

### Konvensi baru yang berlaku ke seluruh proyek

**Hook kustom WAJIB berawalan `use`** — `useStatusJaringan`, bukan `gunakanStatusJaringan`. Ditemukan saat `react-hooks/rules-of-hooks` menolak nama Indonesia. Bukan karena bahasa Inggris lebih baik: `use` di sini **bukan kata, melainkan penanda protokol** yang dibaca React dan aturan lint untuk mengenali bahwa sebuah fungsi boleh memanggil hook lain. Kata domainnya tetap Indonesia. Dicatat di `packages/config/eslint/react.cjs` — tempat orang akan menabraknya.

### Verifikasi

* **Uji mutasi:** `ErrorBoundary` dilepas dari route induk → **dua test merah**, termasuk yang perilaku (layar bawaan React Router muncul kembali untuk URL asing).
* Layar kesalahan diuji lewat router NYATA yang benar-benar melempar, bukan dengan merender komponennya langsung — merendernya di luar konteks error akan menguji jalur yang tidak pernah dipakai pengguna.
* Test kebocoran eksplisit: pesan `Error` berisi jalur berkas internal dipastikan **tidak** muncul di DOM.
* Build nyata: 76,6 KB / 200 KB, dua chunk lazy utuh.

### Risiko yang ditemukan

* **`navigator.onLine` hanya melaporkan sambungan perangkat, bukan keterjangkauan server kita.** Wi-Fi hotel yang meminta login, atau API kita yang mati, tetap menghasilkan `true`. Banner ini petunjuk, bukan vonis — kegagalan permintaan tetap butuh pesannya sendiri di PR fitur. Batas ini ditulis di kepala `status-jaringan.ts`.
* **Halaman 404 masih memakai layar kesalahan umum.** Ia tidak memberi "jalan pulang yang jelas" seperti dituntut AC PR-032 — itu milik PR-032.
* **Belum ada error boundary React di LUAR router** (mis. kegagalan di dalam `Providers`). Layar putih masih mungkin di jalur itu.

### Next steps

* **PR-031a** — gerbang a11y (`jsx-a11y` + `jest-axe` ditegakkan CI) SEBELUM pustaka komponen lahir di PR-027.
* **PR-029** — i18n dua varian; seluruh string di PR ini masih hardcoded satu varian.
* **PR-032** — halaman 404 sesungguhnya + landmark/skip-link final.
* Angkat keputusan **fondasi PWA** (SDD §4.4) ke owner.

---
## PR-029a — Mesin i18n dua varian + katalog shell

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-029---i18n-catalog-id--id-simple)
> **Tanggal:** 2026-08-08
> **Status:** Selesai (bagian pertama dari PR-029; penjaga kelengkapan & panduan bahasa sederhana = PR-029b)

### Ringkasan hasil

Seluruh 16 string kerangka aplikasi berpindah dari hardcoded ke katalog dua varian (`id`, `id-simple`), dan mode bisa ditukar tanpa memuat ulang. Menutup AC **1** (toggle tanpa reload), **3** (fallback tampil kunci, bukan blank), **5** (interpolasi aman).

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/web` **74 test** (dari 55), `apps/api` 683 lulus, total workspace **806**. Bundel awal 77,4 KB dari 200 KB.

### Keputusan teknis

* **Kelengkapan varian ditegakkan TIPE, bukan aturan lint.** AC menulis *"key tanpa varian simple → lint warning terdaftar"*; `EntriTeks = { [M in ModeBahasa]: string }` membuatnya **lebih keras**: varian yang hilang adalah `typecheck` MERAH, bukan peringatan yang bisa diabaikan. Aturan ESLint kustom (~200 LOC) untuk sesuatu yang bisa dijamin tipe hanya menambah kode yang harus dirawat. Diverifikasi mutasi: menghapus satu `id-simple` → `TS2741`.
* **Kunci diturunkan dari katalog** (`KunciTeks = keyof typeof katalog`), sehingga salah ketik kunci = typecheck merah, bukan teks aneh yang baru ketahuan di layar pengguna.
* **`useTeks` GAGAL KERAS di luar provider.** Fallback diam-diam ke bahasa bawaan akan membuat komponen yang lupa dibungkus tetap "bekerja" — sampai seseorang mengubah mode dan menemukan satu sudut layar yang tidak ikut berubah. Terbukti berguna seketika: penjaga ini menangkap dua berkas test yang belum dibungkus saat i18n dipasang.
* **Placeholder tanpa nilai DIBIARKAN terlihat** (`{nama}`), bukan dikosongkan. Kalimat yang kehilangan satu kata diam-diam terbaca wajar tetapi salah; `{nama}` di layar langsung memberi tahu ada yang lupa dikirim.
* **`Object.hasOwn`, bukan `params[nama] !== undefined`** — yang kedua ikut membaca rantai prototipe, sehingga `{constructor}` mencetak teks fungsi ke layar pengguna. Diuji.
* **Interpolasi mengembalikan STRING BIASA dan tidak pernah menyentuh HTML.** Tidak ada varian "rich text" — begitu ada, seseorang akan memakainya untuk teks yang berasal dari pengguna. Nilai di dalam hasil juga tidak diproses ulang, menutup penggantian berantai.
* **Sintaks interpolasi sengaja minimal** (`{nama}` saja). Pluralisasi dan format tanggal menggoda, tetapi setiap kemampuan tambahan harus ditulis DUA KALI oleh penerjemah, dan yang salah tulis menjadi teks rusak di layar.
* **Satu berkas katalog per fitur.** Katalog terpusat adalah tempat setiap PR fitur bertabrakan saat merge, dan tempat kunci mati menumpuk tanpa ada yang berani menghapusnya.
* **`PenyediaI18n` di DALAM `QueryClientProvider`**: pesan kesalahan dari lapisan data kelak perlu diterjemahkan. Kebalikannya tidak pernah dibutuhkan — teks tidak butuh cache query.

### Batas yang diketahui

**Mode belum tersambung ke preferensi pengguna.** Objective PR-029 menyebut *"switch `data-lang-mode`"*, tetapi atribut itu ditulis store aksesibilitas milik **PR-026**, yang belum lahir karena urutannya ditukar. Mode karena itu dibuat bisa dikendalikan dari luar (`modeAwal` + `useModeBahasa`), sehingga PR-026 tinggal menyambungkannya tanpa membongkar apa pun. Tidak ada kerja yang terbuang.

### Konvensi yang menegaskan diri sendiri

Aturan "hook kustom wajib berawalan `use`" (ditetapkan PR-025c) langsung menangkap helper internal PR ini: `gunakanKonteks` → `useKonteks`. Fungsi yang memanggil hook **adalah** hook menurut definisi React, termasuk yang tidak diekspor.

Juga tercatat: `// eslint-disable-next-line` hanya berlaku untuk SATU baris berikutnya. Komentar dua baris membuat targetnya lolos dari cakupan — perlu `/* ... */`.

### Verifikasi

* **Uji mutasi tipe:** `id-simple` dihapus dari satu kunci → `TS2741: Property '"id-simple"' is missing`. Typecheck merah, bukan peringatan.
* Test toggle memeriksa **dua string berbeda** ikut berubah — kalau hanya satu, konteksnya tidak benar-benar merender ulang pohonnya.
* Test keamanan: `<img src=x onerror="alert(1)">` sebagai nilai parameter tetap menjadi karakter biasa; `{constructor}` dan `{toString}` tidak tersentuh.

### Catatan alat

`turbo run test` bisa **memutar ulang hasil cache** dari run saat Docker mati, sehingga melaporkan 122 test DB "skipped" padahal kontainer sedang hidup. Ketersediaan DB bukan bagian dari kunci cache Turbo. Di CI tidak berdampak (selalu fresh), tetapi lokal: jalankan `pnpm --filter @nawasena/api test` langsung bila angka skip terlihat janggal.

### Next steps

* **PR-029b** — penjaga kelengkapan katalog per fitur + **panduan menulis `id-simple`** (mitigasi yang diminta Risks: *"Varian simple ditulis asal"*).
* **PR-026** — sambungkan mode ke store preferensi + `data-lang-mode`.
* **PR-031a** — gerbang a11y sebelum pustaka komponen lahir di PR-027.

---
## PR-029b — Penjaga katalog & panduan bahasa sederhana

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-029---i18n-catalog-id--id-simple)
> **Tanggal:** 2026-08-08
> **Status:** Selesai. **PR-029 tuntas** — seluruh 5 AC terpenuhi.

### Ringkasan hasil

Menutup dua AC yang tersisa dengan menyerang hal yang **tidak bisa dijamin tipe**: varian `id-simple` yang disalin mentah dari `id`, dan struktur katalog per fitur. Ditambah [panduan menulis bahasa sederhana](../../panduan-bahasa-sederhana.md) — mitigasi yang diminta bagian Risks.

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/web` **83 test** (dari 74).

### Pembagian tugas yang perlu dipahami

| Lapis | Menjamin | Sejak |
|---|---|---|
| **Tipe** (`EntriTeks`) | kedua varian **ADA** | PR-029a |
| **Penjaga CI** | varian simple bukan **salinan mentah**; struktur per fitur | PR-029b |
| **Review manusia** | kalimatnya benar-benar lebih mudah | panduan |

Batas ketiga ditulis eksplisit di panduannya: mesin tidak bisa menilai keterbacaan, dan penjaga yang berpura-pura bisa akan membuat orang berhenti berpikir.

### Keputusan teknis

* **Daftar `SAMA_DENGAN_SENGAJA` dengan pemeriksaan DUA ARAH.** Entri identik yang tidak terdaftar → merah. Entri terdaftar yang **tidak lagi identik** → juga merah. Tanpa arah kedua, daftar pengecualian akan menyimpan alasan yang sudah tidak benar — dan daftar yang memuat kebohongan berhenti bisa dipercaya. Pola yang sama dengan `RELASI_DIIZINKAN` (PR-021a) dan `export-kelengkapan` (PR-022).
* **Kunci kembar antar fitur = merah.** Katalog dirakit dengan spread; kunci kembar menimpa **diam-diam**, dan fitur yang kalah kehilangan teksnya tanpa satu pun galat.
* **`fiturKatalog` berdampingan dengan `katalog`, dan duplikasinya dijaga.** `katalog` harus memakai spread literal agar `KunciTeks` tetap union kunci yang tepat (`Object.assign` melunturkannya jadi `string`). Penjaga menuntut kedua daftar memuat kunci yang sama, sehingga fitur yang ditambahkan ke salah satu saja langsung merah.
* **Penjaga "tidak lulus secara hampa"**: katalog harus punya >5 entri, dan entri identik harus <½ total. Kalau semua entri identik, katalog `id-simple` sesungguhnya tidak pernah ditulis.
* **Spasi menggantung ditolak.** Tidak terlihat saat review; terbaca screen reader sebagai jeda dan menggeser tata letak.

### Temuan saat menulis panduan

**Aturan "varian simple harus lebih pendek" TIDAK dipasang — karena salah.** Kandidatnya terlihat masuk akal sampai diuji ke katalog nyata:

```
id         : "Memuat halaman…"              (16)
id-simple  : "Sebentar, halaman sedang dibuka…"  (33) ← lebih PANJANG
```

"Memuat" adalah kata formal yang jarang dipakai sehari-hari; "sedang dibuka" lebih panjang tetapi langsung dimengerti. Memaksakan aturan panjang akan mendorong singkatan dan kalimat menggantung — kebalikan dari tujuannya. Yang dikejar **beban berpikir yang lebih ringan, bukan jumlah karakter**. Ditulis di panduan sebagai kesalahpahaman yang paling mahal.

### Verifikasi

* **Uji mutasi dua arah:**
  * varian simple disalin mentah (`shell.memuat`) → merah, dengan pesan yang menunjuk panduannya;
  * entri pengecualian dibuat basi → merah lewat pemeriksaan arah balik.
* Panduan didaftarkan di CLAUDE.md §7 supaya ditemukan sebelum orang menulis teks UI, bukan sesudah.

### Next steps

* **PR-026** — store preferensi a11y; sambungkan mode bahasa ke `data-lang-mode`.
* **PR-031a** — gerbang a11y sebelum pustaka komponen lahir di PR-027.
* **Manual Verification PR-029** (*review bahasa sederhana oleh non-engineer*) kini punya rujukan yang bisa dipakai peninjau.

---
## PR-025d — Fondasi PWA (manifest + service worker aset statis)

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-025---appsweb-bootstrap)
> **Tanggal:** 2026-08-09
> **Status:** Selesai. Menutup celah antara ADR-009 dan backlog.

### Kenapa PR ini ada

**ADR-009 menuntutnya, dan backlog tidak memilikinya.** Pencarian `pwa|manifest|service worker` di **seluruh 19 dokumen phase** menghasilkan nol hasil relevan, sementara ADR-009 menulisnya di bagian **Decision**:

> *"Fondasi PWA (manifest + service worker untuk cache aset statis saja) tetap dipasang sejak MVP agar peningkatan ke offline dasar pada Fase 2 tidak merombak arsitektur."*

dan mengulanginya sebagai salah satu dari **tiga Mitigasi** untuk konsekuensi negatif online-only. Alternatif yang dipilih pun bernama *"Online-only **dengan fondasi PWA**"*.

Tidak mengerjakannya sama dengan mencabut satu mitigasi tanpa merevisi ADR-nya. Diangkat ke owner; owner memilih mengerjakan sekarang (2026-08-09).

### Ringkasan hasil

Manifest, ikon, service worker yang **hanya** menyimpan aset build ber-hash, dan pendaftaran yang hanya aktif di produksi. Bundel awal 77,5 KB dari 200 KB; `sw.js` 0,97 KB (dibangun terpisah, di luar hitungan bundel halaman).

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/web` **107 test** (dari 83), `apps/api` 683 lulus. 576 baris — sedikit di atas target 500, lihat catatan ukuran.

### Keputusan teknis

* **Logika cache dipisah sebagai fungsi MURNI** (`strategi-cache.ts`), terpisah dari service worker-nya. Service worker yang keliru menyimpan sesuatu akan menyajikannya berulang kali kepada pengguna yang sama, tanpa batas waktu, dan tanpa cara mudah membatalkannya dari server. Aturan seperti itu harus bisa diuji tanpa browser.
* **Bawaan MENOLAK.** Jalur yang belum terpikirkan tidak ikut tersimpan; aturan baru harus ditambahkan sadar.
* **HTML tidak pernah disimpan.** `index.html` satu-satunya berkas yang namanya tidak ber-hash — menyimpannya berarti pengguna bisa terkunci pada rujukan bundel lama tanpa cara memaksa pembaruan. Ini kegagalan service worker yang paling sering terjadi.
* **`skipWaiting()` TIDAK dipanggil.** Ia membuat service worker baru mengambil alih tab yang sedang terbuka, sehingga aset lama dan baru bercampur di satu halaman berjalan — sumber galat "chunk gagal dimuat" tepat setelah deploy.
* **"lewati" berarti tidak memanggil `respondWith` sama sekali**, bukan "teruskan ke `fetch()`". Yang kedua tetap melewati kita dan bisa mengubah perilaku streaming, kredensial, serta pelaporan galat jaringan.
* **Pendaftaran hanya di produksi.** Di dev, service worker menyimpan aset lalu menyajikannya kembali — perubahan kode tampak "tidak berpengaruh" dan pengembang menelusuri bug yang tidak ada.
* **Kegagalan pendaftaran tidak menjatuhkan aplikasi.** Service worker peningkatan, bukan prasyarat.
* **Tipe konteks SW dideklarasikan seperlunya**, bukan `/// <reference lib="webworker" />` — lib itu menabrakkan `self`/`location`/`fetch` dengan lib DOM yang dipakai seluruh `apps/web`, dan jalan keluarnya tsconfig terpisah: mesin baru demi satu berkas. Yang dipakai hanya lima anggota.
* **Build kedua terpisah** (`vite.sw.config.ts`): `format: "iife"` (modul SW belum merata didukung Safari), nama tetap `sw.js` tanpa hash (cakupan SW ditentukan jalurnya), `emptyOutDir: false` (menumpang `dist` yang sama).
* **`sw.js` dikecualikan dari hitungan chunk lazy** di `cek-budget.ts`. Tanpa itu, penjaga code-splitting tetap hijau meski seluruh route ter-inline — satu berkas asing sudah cukup memenuhi syarat "> 0".

### Temuan uji mutasi yang mengubah test

**Mencabut penolakan `/api/` membuat NOL test merah.** `/api/v1/me` tetap jatuh ke `return "lewati"` bawaan, jadi test perilaku memeriksa hasil yang kebetulan sama — bukan aturannya.

Dengan aturan hari ini tidak ada URL yang bisa sekaligus berawalan `/api/` dan `/assets/`, sehingga penolakan itu memang belum menanggung beban. Ia ada untuk perubahan yang belum terjadi: begitu seseorang melonggarkan langkah terakhir (mis. *"cache semua GET asal sendiri"*), baris itulah satu-satunya yang menahan respons ber-sesi ikut tersimpan.

Perilaku tidak bisa membedakannya hari ini; **keberadaannya bisa**. Ditambahkan penjaga sumber, lalu mutasi diulang → merah. Tanpa uji mutasi, test itu akan hidup sebagai jaminan palsu.

Penjaga sumber juga sempat menangkap **komentar sendiri** (`skipWaiting()` dalam kalimat yang menjelaskan mengapa ia tidak dipakai) — komentar dibuang dulu sebelum dipindai, pola yang sama dengan `soft-delete-jangkauan.test.ts` (PR-021a). Pemindai yang menghukum dokumentasi mengajari orang berhenti mendokumentasikan.

### Penjaga struktur menangkap penulisnya sendiri

Berkas PWA semula ditaruh di `src/pwa/` — folder **kelima**, yang ditolak `struktur-folder.test.ts` (PR-025a). Dipindahkan ke `src/shared/pwa/`, dan itu memang tempatnya: logika ini bebas domain, sesuai aturan yang tertulis di `shared/README.md`. Tidak perlu mengubah SDD §4.1.

### Utang yang dicatat

* **Ikon masih sementara.** SVG netral (huruf awal di latar solid), sengaja bukan identitas visual. Ikon sesungguhnya perlu **desainer**, dan perlu varian **PNG 192/512** — iOS belum menerima SVG di manifest. Ini aset desain, bukan rekayasa.
* **Tidak ada fallback luring.** Disengaja: MVP online-only (ADR-009). Menambahkannya sekarang berarti mengirim fitur yang belum diputuskan bentuknya. Fondasi ini membuat penambahannya di Fase 2 menjadi penambahan aturan, bukan penulisan ulang — persis yang dijanjikan ADR-009.
* **Belum diuji di browser sungguhan.** Perilaku SW (pendaftaran, cakupan, siklus update) hanya terverifikasi lewat unit test dan pemindaian sumber.

### Catatan ukuran

576 baris, sedikit di atas target <500. Tidak dipecah dengan sengaja: memecah fondasi PWA menjadi dua PR akan meninggalkan service worker setengah terkonfigurasi ter-merge di antaranya — dan service worker setengah jadi lebih berbahaya daripada 76 baris tambahan.

### Next steps

* **PR-026** — store preferensi a11y; sambungkan mode bahasa ke `data-lang-mode`.
* **PR-031a** — gerbang a11y sebelum pustaka komponen lahir di PR-027.
* **Ikon produk** — perlu desainer; PNG 192/512 untuk iOS.
* **Verifikasi browser** untuk siklus update SW, layak digabung ke Manual Verification PR-032 (viewport mobile).

---
## PR-026a — Kontrak preferensi & store bebas-DOM

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-026---packagesa11y--store-preferensi--css-custom-properties)
> **Tanggal:** 2026-08-09
> **Status:** Selesai (bagian pertama dari tiga; token DOM & OS = PR-026b, anti-flash & dokumentasi = PR-026c)

### Ringkasan hasil

`packages/a11y` berhenti menjadi placeholder: kontrak zod tujuh preferensi, rekonsiliasi murni (pengguna > OS > bawaan), dan store Zustand ber-persist dengan migrasi versi — **seluruhnya bebas DOM**.

Menutup AC **3** (*"Persist selamat dari refresh + migrasi versi teruji"*).

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/a11y` **20 test** (paket ini sebelumnya nol), `check:openapi` sinkron. 569 baris.

### Pemecahan PR (persetujuan owner 2026-08-09)

PR-026 utuh terukur ≈ 1100 LOC — lebih dari dua kali batas, PR terbesar sejauh ini.

* **PR-026a** (ini) — kontrak, rekonsiliasi, store + persist/migrasi. AC 3.
* **PR-026b** — token ke `<html>`, listener `prefers-*`, integrasi web, sambungan mode bahasa. AC 1 & 2.
* **PR-026c** — anti-flash pra-paint + dokumentasi token. AC 4 & 5.

### Keputusan teknis

* **Pilihan pengguna disimpan sebagai objek SEBAGIAN (`Partial`), bukan profil utuh.** Ini keputusan paling menentukan di PR ini: hanya bentuk itu yang bisa membedakan *"pengguna memilih tidak"* dari *"pengguna belum memilih"*. Profil utuh memaksa setiap field punya nilai, dan begitu itu terjadi, aturan ADR-008 "OS menang bila belum diset" tidak bisa ditegakkan lagi — tidak ada lagi yang tahu mana yang benar-benar dipilih.
* **`undefined` dari OS berbeda dari `false` dari OS.** Browser lama tidak melaporkan `prefers-contrast` sama sekali; memperlakukan ketiadaannya sebagai "tidak mau" akan menimpa keinginan yang tidak pernah dinyatakan siapa pun.
* **`hapusPilihan` MENGHAPUS kunci, tidak menyetelnya `false`.** Menyetel `false` berarti "pengguna memilih tidak", yang memblokir sinyal OS selamanya — persis kebalikan dari maksud tombol "ikuti perangkat".
* **Penyimpanan disuntikkan, bukan `localStorage` langsung.** Paket ini dipakai mobile (SDD §4.2), tempat `localStorage` tidak ada. Test memakai penyimpanan memori.
* **Sinyal OS tidak ikut disimpan.** Ia keadaan perangkat, bukan pilihan pengguna: menyimpannya berarti membawa setelan laptop kantor ke ponsel pribadi lewat sinkronisasi profil browser.
* **State tersimpan divalidasi skema pada `migrate` DAN `merge`.** `migrate` hanya berjalan saat versi berbeda; tanpa `merge`, state yang disunting tangan pada versi terkini masuk tanpa diperiksa sama sekali.
* **Nilai rusak dibuang per-field, sisanya selamat.** Membuang SEMUA preferensi karena satu field rusak berarti menghukum pengguna atas kesalahan yang bukan miliknya.
* **Versi tersimpan yang LEBIH BARU dibuang, bukan ditebak** (pengguna membuka versi lama aplikasi setelah memakai yang baru). Menebak bentuk masa depan adalah cara paling andal merusak preferensi seseorang.
* **`textScale` dibatasi 100–200.** Batas atas bukan selera: WCAG 2.2 §1.4.4 menuntut teks dapat diperbesar sampai 200%. Tidak ada nilai di bawah 100 — mengecilkan teks tidak melayani satu pun kebutuhan aksesibilitas.

### Selisih dokumen yang dicatat

**SDD §4.3 menyebut ENAM preferensi; tabel `accessibility_profiles` punya TUJUH.** Yang tidak disebut SDD: `screenReaderHint`. CLAUDE.md §12 menetapkan Prisma sebagai sumber kebenaran skema, jadi ketujuhnya masuk kontrak. Ditulis di kepala `accessibility.ts` agar selisihnya terlihat, bukan didiamkan.

Catatan desain yang menyertainya: `screenReaderHint` adalah **petunjuk, bukan deteksi**. Browser tidak menyediakan cara mendeteksi screen reader, dan setiap upaya menebaknya (mengukur perilaku fokus, waktu baca) adalah sidik jari pengguna yang tidak boleh dikumpulkan.

### Verifikasi

* **Uji mutasi 1:** `if (eksplisit !== undefined)` → `if (eksplisit)` — bug klasik yang menelan `false` eksplisit. **Dua test merah.**
* **Uji mutasi 2:** pembuangan versi tersimpan yang lebih baru dicabut. **Satu test merah.**
* Test state rusak mencakup JSON tak sah, `null`, string, array, field asing, dan nilai di luar rentang — semuanya tidak menjatuhkan aplikasi.
* `check:openapi` tetap sinkron: skema baru belum dirujuk path mana pun, jadi memang belum masuk dokumen. Ia bergabung saat endpointnya lahir di PR-034.

### Next steps

* **PR-026b** — tulis `--font-scale`, `--touch-target-min`, `data-contrast/motion/lang-mode` ke `<html>`; listener `prefers-*`; sambungkan mode bahasa i18n (jalur masuknya sudah disiapkan PR-029a).
* **PR-026c** — anti-flash pra-paint + dokumentasi token.
* **PR-034** — endpoint sinkron server; di sanalah bawaan klien dan `@default` Prisma perlu dijaga agar tidak menyimpang.

---
## PR-026b — Token DOM & setelan OS

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-026---packagesa11y--store-preferensi--css-custom-properties)
> **Tanggal:** 2026-08-09
> **Status:** Selesai (bagian kedua dari tiga; anti-flash & dokumentasi token = PR-026c)

### Ringkasan hasil

Adapter web `@nawasena/a11y/web`: menulis lima token SDD §4.3 ke elemen akar, membaca & memantau setelan OS lewat `matchMedia`, dan menyambungkan store ke DOM.

Menutup AC **1** (OS dihormati bila pengguna belum set eksplisit) dan **2** (perubahan store langsung mengubah token DOM).

**Batas yang harus dibaca bersama itu:** mekanismenya lengkap dan teruji di `packages/a11y`, tetapi **`apps/web` belum memanggilnya** — itu PR-026c. Aplikasi hari ini masih belum menerapkan preferensi apa pun ke layar.

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/a11y` **49 test** (dari 20).

### Penyesuaian batas internal

Glue store→DOM ditaruh **di dalam paket**, bukan di `apps/web` seperti rencana awal. `subscribe` milik Zustand bukan API React, jadi menaruhnya di paket membuat AC 2 bisa diuji **tanpa merender satu komponen pun** — dan integrasi web di 026c menjadi satu panggilan fungsi. Pemetaan AC tidak berubah.

### Keputusan teknis

* **Token di elemen akar, bukan prop yang diturunkan.** Preferensi aksesibilitas harus berlaku pada semua yang tampil, termasuk yang dirender di luar pohon React (portal, dialog native, konten pihak ketiga). Satu komponen yang lupa meneruskan prop adalah satu sudut layar yang mengabaikan pengguna.
* **Atribut DIHAPUS saat tidak aktif, bukan disetel `"normal"`/`"false"`.** Selektor `[data-contrast="high"]` lebih mudah dibaca daripada `:not([data-contrast="normal"])`, dan atribut yang selalu ada mengundang orang menulis aturan untuk nilai "mati" yang seharusnya cukup jadi gaya bawaan.
* **`tokenDari()` dipisah dari penulisannya**, supaya PR-026c bisa memakai fungsi yang SAMA untuk skrip anti-flash pra-paint yang berjalan sebelum React ada. Dua tempat yang menghitung token sendiri-sendiri akan menyimpang, dan gejalanya adalah kedipan yang hanya muncul di sebagian perangkat.
* **Elemen adalah argumen, bukan diambil dari `document` global** — itu yang membuat fungsi ini bisa diuji terhadap elemen lepas, dan yang membuatnya tidak pernah diam-diam mengubah halaman saat dipanggil dari tempat yang salah.
* **`prefers-contrast: more`, bukan `high`.** `high` nilai lama yang tidak pernah masuk standar.
* **Kueri yang tidak dikenal browser → `undefined`, bukan `false`.** Browser menormalkan `media` menjadi `"not all"` untuk sintaks yang tak dikenal; tanpa pemeriksaan itu, browser lama akan melaporkan "pengguna tidak mau kontras tinggi" padahal ia sama sekali tidak tahu — dan rekonsiliasi memperlakukannya sebagai jawaban.
* **Perubahan OS masuk lewat store, tidak ditulis langsung ke DOM.** Dua jalur penulisan bisa menghasilkan keadaan berbeda.
* **`addListener` usang tetap disediakan sebagai cadangan** (Safari lama). Pengguna perangkat lama bagian dari audiens produk ini, bukan pengecualian.
* **Dua preferensi sengaja tanpa token.** `prefersSignLanguage` dan `screenReaderHint` tidak mengubah tampilan — yang pertama memilih ada/tidaknya konten BISINDO, yang kedua mengubah teks bantuan. Ditulis di `TANPA_TOKEN` beserta alasannya, di tempat orang mencarinya.

### Penjaga baru: inti bebas DOM

`web-terpisah.test.ts` memindai setiap berkas `src/*.ts` tingkat atas dan menolak `document`, `window`, `localStorage`, `navigator`, `matchMedia`, `HTMLElement`.

Alasannya spesifik: **seluruh test paket ini berjalan di jsdom**, jadi `document` selalu tersedia saat diuji. Pelanggaran tidak akan pernah terlihat di sini — ia baru muncul sebagai crash di perangkat mobile berbulan-bulan kemudian. Penjaga ini juga memeriksa arah sebaliknya (adapter `web/` memang menyentuh DOM), supaya pemisahannya tidak berubah menjadi folder kosong yang menciptakan ilusi arsitektur.

Komentar dibuang sebelum dipindai — berkas inti MENYEBUT `localStorage` dan `document` dalam penjelasan tentang mengapa keduanya tidak dipakai.

### Verifikasi

* **Uji mutasi 1:** `typeof document` disisipkan ke berkas inti → penjaga bebas-DOM **merah**.
* **Uji mutasi 2:** atribut disetel `"normal"` alih-alih dihapus → **lima test merah** di dua berkas.
* 49 test mencakup: nilai token, penulisan & penghapusan atribut, pembacaan OS termasuk kueri tak dikenal, pemantauan perubahan di tengah sesi, dan pembatalan langganan.

### Next steps

* **PR-026c** — panggil `hubungkanKeDom()` dari `apps/web`, sambungkan `simpleLanguage` ke mode i18n (jalur masuk sudah ada sejak PR-029a), skrip anti-flash pra-paint, dan dokumentasi token untuk Tailwind preset.

---
## PR-026c — Integrasi aplikasi, anti-flash & dokumentasi token

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-026---packagesa11y--store-preferensi--css-custom-properties)
> **Tanggal:** 2026-08-09
> **Status:** Selesai. **PR-026 tuntas** — seluruh 5 AC terpenuhi.

### Ringkasan hasil

`apps/web` akhirnya **memakai** preferensi: store tersambung ke `<html>`, `simpleLanguage` menggerakkan mode i18n, dan skrip pra-paint menulis token sebelum halaman tergambar.

Menutup AC **4** (dokumentasi token) dan **5** (tanpa flash), sekaligus membuat AC 1 & 2 berlaku di aplikasi — bukan hanya di paket.

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/web` **128 test** (dari 107), `@nawasena/a11y` **57** (dari 49). Bundel awal **97,9 KB / 200 KB**.

### Anti-flash: masalah dan bentuk pemecahannya

React baru berjalan setelah bundelnya diunduh, diurai, dan dieksekusi. Sampai saat itu halaman **sudah tergambar** dengan gaya bawaan. Pengguna yang memilih kontras tinggi atau teks 200% akan melihat kilasan tampilan yang justru **tidak bisa mereka baca** — tepat pada orang yang paling membutuhkan setelan itu. Kedipan ini bukan cacat kosmetik.

Pemecahannya skrip inline di `<head>`, disuntikkan lewat `transformIndexHtml` dari berkas TypeScript — bukan ditulis tangan di `index.html`. Skrip yang hidup sebagai teks di dalam HTML tidak pernah punya test, dan tidak pernah ikut berubah saat aturan tokennya berubah.

**Duplikasi logika di sini tak terhindarkan** — skrip berjalan sebelum modul apa pun dimuat, jadi tidak bisa mengimpor `rekonsiliasi()` maupun `tokenDari()`. Yang bisa dihindari adalah duplikasi yang **menyimpang**: `skrip-pra-paint.test.ts` MENJALANKAN skripnya di jsdom lalu membandingkan DOM hasilnya dengan keluaran fungsi aslinya, untuk matriks sepuluh kombinasi preferensi. Bukan perbandingan teks — perbandingan **perilaku**.

Seluruh isi skrip dibungkus `try/catch`: skrip yang melempar di `<head>` **menghentikan penguraian dokumen** — layar kosong, bukan sekadar preferensi yang gagal dimuat.

### Keputusan teknis

* **Arah sambungan bahasa SATU: preferensi → i18n.** Mode bahasa bukan sumber kebenaran kedua, ia turunan. Menyambungkannya dua arah akan melahirkan dua tempat yang sama-sama mengklaim tahu bahasa mana yang sedang dipakai. Dikunci test.
* **`SambungkanBahasa` komponen terpisah yang merender `null`** — ia harus berada di dalam `PenyediaI18n` (memakai `useModeBahasa`), sementara store-nya dibuat di luar. Memisahkannya membuat urutan provider tidak bisa salah tanpa terdeteksi typecheck.
* **Bandingkan sebelum `setMode`.** Tanpa itu, setiap perubahan preferensi apa pun — termasuk yang tidak ada hubungannya dengan bahasa — merender ulang seluruh pohon.
* **`localStorage` dibungkus `try/catch` di tiga operasinya.** Mode privat sebagian browser MELEMPAR saat `localStorage` disentuh; preferensi yang gagal disimpan tidak boleh menghalangi aplikasi terbuka.
* **`PenyimpananA11y` diekspor dari `@nawasena/a11y`.** Ditemukan lewat typecheck: `apps/web` terpaksa mengimpor `zustand/middleware` hanya untuk menyebut tipe argumen. Bahwa store-nya kebetulan Zustand adalah detail implementasi — dan detail implementasi yang bocor ke `package.json` pemakainya berhenti bisa diganti.
* **Kunci penyimpanan DISALIN ke skrip pra-paint, tidak diimpor.** Vite memuat config lewat loader Node yang tidak bisa memetakan `.js` ke `.ts` untuk paket workspace bersumber TypeScript; impornya menggagalkan seluruh build DAN seluruh test dengan `ERR_MODULE_NOT_FOUND`. Salinannya dijaga test.

### `matchMedia` tidak ada di jsdom

Bukan "ada tapi selalu false" — tidak diimplementasikan sama sekali. Ditambahkan polyfill di `setup.ts` yang melaporkan `matches: false` untuk semua kueri, dengan `media` dikembalikan apa adanya (bukan `"not all"`) supaya kueri dianggap **dikenali**. Mengembalikan `"not all"` akan membuat seluruh sinyal terbaca `undefined` dan diam-diam mematikan jalur rekonsiliasi OS di setiap test.

### Dokumentasi token (AC 4)

[docs/token-aksesibilitas.md](../../token-aksesibilitas.md) — lima token, contoh CSS beserta **nilai cadangan**, alasan atribut dihapus alih-alih disetel "mati", dan dua preferensi yang sengaja tanpa token.

Penjaganya menurunkan daftar token dari **KODE**, bukan dari daftar tulisan tangan: daftar tulisan tangan adalah sumber kebenaran kedua yang bebas menyimpang, dan penjaga yang membandingkan dua salinan usang selalu hijau. Ia juga menuntut **nilai** atributnya ikut disebut — nama saja tidak cukup bagi penulis CSS.

### Verifikasi

* **Uji mutasi 1:** token baru ditambahkan tanpa dokumentasi → penjaga dokumentasi **merah**.
* **Uji mutasi 2:** skrip pra-paint diubah 56 menjadi 60 px → **dua test kesetaraan merah**.
* Build nyata: skrip pra-paint terbukti ada di `<head>` `dist/index.html`, memuat kunci penyimpanan yang benar.
* Test integrasi: preferensi tersimpan tampak di `<html>` saat render, perubahan setelah render langsung terlihat, dan `simpleLanguage` benar-benar mengganti teks yang tampil.

### Risiko yang ditemukan

* **Bundel awal naik 77,5 ke 97,9 KB** (zustand + paket a11y). Sisa 102 KB, dan pustaka komponen (PR-027/028) belum masuk sama sekali. Angka ini perlu dilihat tiap PR FE.
* **Kesetaraan skrip pra-paint dijaga test, bukan oleh satu sumber.** Bila kelak ada token yang aturannya jauh lebih rumit, pertimbangkan membangkitkan skrip itu dari TypeScript saat build alih-alih menyalinnya.
* **Belum ada verifikasi di browser sungguhan** bahwa kedipan benar-benar hilang. jsdom tidak menggambar apa pun. Layak digabung ke Manual Verification PR-032.

### Next steps

* **PR-031a** — gerbang a11y sebelum pustaka komponen lahir di PR-027.
* **PR-027/028** — komponen membaca `--touch-target-min` dan `data-*`; dokumentasi tokennya sudah siap dipakai.
* **PR-034** — endpoint sinkron server; bawaan klien dan `@default` Prisma perlu dijaga agar tidak menyimpang.
* **PR-036** — panel preferensi; `dipilihPengguna()` sudah tersedia untuk menampilkan "mengikuti setelan perangkat".

---
## PR-031a — Gerbang aksesibilitas: jsx-a11y & axe per komponen

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-031---a11y-gate-ci-axe--lighthouse)
> **Tanggal:** 2026-08-09
> **Status:** Selesai (bagian pertama dari dua; registry halaman + Lighthouse = PR-031b)

### Kenapa PR ini didahulukan

Menurut dependensi dokumen, PR-031 mendarat **setelah** PR-030 — artinya **enam PR frontend**, termasuk seluruh pustaka komponen (PR-027/028), lahir tanpa gerbang aksesibilitas. Padahal CLAUDE.md §5.2 menyebut gerbang itu *non-negotiable*.

Konsekuensinya bukan teoretis: bila PR-031 kelak menemukan pelanggaran, yang diperbaiki adalah komponen yang sudah dianggap selesai, dan perbaikannya menyentuh **setiap pemakainya**.

Penataan ulang disetujui owner di awal phase: bagian yang bisa berjalan tanpa halaman nyata (lint + axe per komponen) dimajukan ke sini; bagian yang butuh browser (registry halaman, Lighthouse) tetap menunggu di PR-031b.

### Ringkasan hasil

Dua lapis gerbang menyala: `jsx-a11y` **strict** di lint, dan `axe` per komponen lewat `@nawasena/a11y/pengujian`. Seluruh tampilan `apps/web` yang sudah ada kini melewatinya — termasuk keadaan kegagalan dan kombinasi preferensi ekstrem.

Menutup AC **1** (pelanggaran fixture → CI merah, dengan bukti) dan **4** (laporan menyebut elemen + aturan) di tingkat komponen.

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `@nawasena/web` **134 test** (dari 128), `@nawasena/a11y` **74** (dari 57). Bundel awal tetap **97,9 KB / 200 KB**.

### Uji mutasi membuktikan kedua lapis MEMANG berbeda

Ini temuan yang paling berguna dari PR ini, dan ia empiris — bukan klaim.

| Mutasi | Lint (`jsx-a11y`) | `axe` per komponen |
|---|---|---|
| `<img>` tanpa `alt` | **tertangkap** sebelum test jalan | — |
| Tombol ikon `<span aria-hidden>x</span>` | **LOLOS** (0 error) | **tertangkap**: `[button-name] Buttons must have discernible text` + URL rujukan |

`jsx-a11y` adalah analisis **statis satu berkas**. Ia tidak bisa tahu bahwa `aria-hidden` pada satu-satunya anak membuat tombolnya kehilangan nama yang bisa dibaca. Kalau hanya lapis pertama yang dipasang, cacat itu ship — dan ia sepenuhnya tak terlihat bagi siapa pun yang melihat layar.

### Keputusan teknis

* **`plugin:jsx-a11y/strict`, bukan `recommended`.** `recommended` melonggarkan aturan yang punya pengecualian sah di aplikasi lama — dan proyek ini tidak punya kode lama. Melonggarkan sejak awal berarti memilih ambang lebih rendah tanpa satu pun pelanggaran yang menuntutnya. Terbukti: seluruh kode yang ada lolos `strict` tanpa satu perubahan.
* **Helper axe ditulis sendiri, bukan memakai `jest-axe`/`vitest-axe`.** AC menuntut laporan yang menyebut **elemen + aturan**; menulis sendiri membuat bentuk laporannya bisa dijamin, bukan diharapkan. ± 110 baris, tanpa dependensi tambahan selain `axe-core`.
* **Aturan yang butuh rendering DIMATIKAN eksplisit**, tidak dibiarkan "incomplete". Dibiarkan menyala, axe melaporkannya tidak-lulus-tidak-gagal — dan hilangnya cakupan itu tidak terlihat siapa pun. Dimatikan eksplisit, ia menjadi daftar (`TAK_BISA_DI_JSDOM`) yang bisa dibaca dan harus ditutup PR-031b.
* **Pesan galat menyebut batasnya sendiri.** Setiap kegagalan mencantumkan aturan apa saja yang TIDAK ikut diperiksa. Gerbang yang diam soal batasnya melahirkan rasa aman palsu — persis risiko yang ditulis dokumen phase (*"axe ≠ WCAG penuh"*).
* **Entry `./pengujian` terpisah dari inti dan adapter web.** `axe-core` berukuran ± 500 KB belum termampat — lebih besar daripada seluruh budget JS awal. Dijaga `pengujian-terpisah.test.ts`; penjaga budget `apps/web` jaring keduanya. Diverifikasi: bundel tetap 97,9 KB dengan **nol** rujukan axe.

### Batas yang ditulis terang-terangan

**jsdom tidak menggambar apa pun.** Tidak ada tata letak, tidak ada warna hasil kaskade, tidak ada ukuran elemen. Seluruh aturan yang bergantung pada rendering — kontras warna, ukuran target sentuh, elemen yang tertutup elemen lain — **tidak bisa** dijalankan.

Ada test yang membuktikan lubang itu apa adanya: teks putih di atas latar putih **LOLOS** pemeriksaan ini. Ditulis sebagai test, bukan sebagai catatan, supaya tidak ada yang menyimpulkan lapisan ini lengkap.

Lulus di lapisan ini berarti *"tidak melanggar aturan yang bisa diperiksa tanpa layar"* — bukan *"aksesibel"*.

### Yang diperiksa hari ini

Beranda, halaman masuk, halaman 404, **banner luring**, **layar kesalahan**, dan kombinasi preferensi ekstrem (teks 200% + kontras tinggi + bahasa sederhana + target sentuh besar).

Dua di tengah sengaja dimasukkan: keadaan kegagalan jarang terlihat saat pengembangan, dan muncul tepat ketika pengguna paling butuh bisa membacanya.

### Slot CI `a11y` sengaja belum dinyalakan

Penegakan PR ini menumpang langkah `Lint` dan `Unit test` yang sudah ada — keduanya sudah wajib hijau. Slot `a11y` di `pr.yml` (`if: false`) diperuntukkan bagi Playwright + Lighthouse di PR-031b. Menyalakannya sekarang hanya akan menambah job yang tidak memeriksa apa pun.

### Next steps

* **PR-027/028** — pustaka komponen lahir DENGAN gerbang sudah menyala. Pakai `harusLolosAksesibilitas()` di test tiap komponen.
* **PR-031b** — registry halaman + axe di browser sungguhan (menutup `TAK_BISA_DI_JSDOM`) + Lighthouse (a11y=100, perf≥80), AC 2, 3, 5.
* **PR-110** — audit manusia tetap gerbang rilis. Tidak satu pun lapisan otomatis menggantikannya.
