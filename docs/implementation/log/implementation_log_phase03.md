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

---
## PR-027a — Fondasi styling: preset Tailwind & paket UI

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-027---packagesui-batch-1--form-primitives)
> **Tanggal:** 2026-08-09
> **Status:** Selesai (bagian pertama dari tiga; Button & Input = PR-027b, FormField & Select = PR-027c)

### Celah dokumen yang ditutup

**Setup Tailwind tidak punya pemilik di backlog.** SDD menyebutnya tiga kali — termasuk **§107: "packages/config: eslint, tsconfig, tailwind preset"** dan **§189: "seluruh Tailwind preset membaca token ini"** — tetapi pencarian `tailwind` di seluruh 19 dokumen phase hanya menemukan **rujukan**, bukan satu pun PR yang membuatnya.

Bedanya dengan celah PWA (PR-025d): yang ini **memblokir**. PR-027 menulis *"primitives Radix + Tailwind membaca token a11y"* seolah presetnya sudah ada. Membangun komponen dengan CSS biasa bukan pilihan — itu mengubah keputusan tech stack di CLAUDE.md dan SDD.

Diangkat ke owner; owner memilih mengerjakannya di dalam PR-027a.

### Ringkasan hasil

Preset Tailwind di `packages/config` yang menjadikan token aksesibilitas **satu-satunya jalan** menulis ukuran, CSS akar `apps/web`, dan `packages/ui` yang berhenti jadi placeholder.

Tidak menutup AC PR-027 sendiri, tetapi **membuka ketiganya**.

Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9. `@nawasena/config` **23 test** (dari 11), `@nawasena/ui` **8** (dari nol), `@nawasena/web` **140** (dari 134). Bundel JS awal **tetap 97,9 KB / 200 KB**.

### Keputusan teknis

* **Token dijadikan satu-satunya jalan menulis ukuran.** `text-*` mengalikan `--font-scale` lewat `calc()`; `min-h-sentuh`/`min-w-sentuh` membaca `--touch-target-min`. Selama preferensi hanya bisa dipakai lewat kelas Tailwind biasa, **tidak ada komponen yang bisa "lupa" menghormatinya** — jauh lebih kuat daripada mengandalkan setiap penulis mengingatnya.
* **Nilai cadangan wajib** (`var(--font-scale, 1)`). Tanpa cadangan, `calc()` batal bila token belum tertulis — teksnya kehilangan ukuran sama sekali, bukan sekadar kembali normal. Itu bisa terjadi bila skrip pra-paint gagal di lingkungan yang memblokir localStorage.
* **Varian membaca ATRIBUT, bukan media query.** `kontras-tinggi:`, `gerak-minimal:`, `bahasa-sederhana:` memetakan ke `[data-*]`. Media query hanya tahu setelan OS; atribut sudah memperhitungkan pilihan eksplisit pengguna yang boleh **menimpa** OS (ADR-008). Memakai `motion-reduce:` bawaan Tailwind akan mengabaikan pilihan itu.
* **Cincin fokus dipulihkan di `@layer base`.** Preflight Tailwind **menghapus** outline bawaan browser; tanpa aturan pengganti, seluruh aplikasi kehilangan penanda fokus dan navigasi keyboard menjadi menebak-nebak. Ini kegagalan aksesibilitas paling umum yang lahir dari CSS reset. Tebal 3px, bukan 2px — 2px hilang di antara piksel pada kontras rendah dan layar kecil.
* **Durasi animasi `0.01ms`, bukan `0s`.** Durasi nol membuat sebagian browser melewatkan event `transitionend`, dan kode yang menunggunya menggantung selamanya.
* **`gabungKelas` memakai `twMerge`, bukan penyambungan string.** Tailwind menghasilkan kelas yang saling menimpa, dan pemenangnya ditentukan urutan di **lembar gaya** — bukan urutan di atribut `class`. Tanpa penggabungan yang benar, `className` dari pemakai berlaku di sebagian kasus dan diam-diam gagal di sebagian lain. Kelas kustom (`min-h-sentuh`) didaftarkan ke `twMerge`, jika tidak ia tidak dikenali sebagai anggota grup yang sama.
* **`packages/ui` dipindai `content` Tailwind `apps/web`.** Kelas yang hanya muncul di sana akan dibuang bila jalurnya tidak disebut — dan gejalanya komponen tanpa gaya sama sekali **di produksi**, tetapi normal saat dev.

### Pilihan versi Tailwind: v3, bukan v4

v4 memindahkan konfigurasi ke CSS (`@theme`) dan **meniadakan konsep "preset"** yang SDD §107 sebut namanya. Repo ini juga menahan versi secara sadar di tempat lain (React 18, Vite 5).

Ditulis di kepala preset sebagai keputusan yang bisa ditinjau ulang: bila kelak v4 dipilih, arsitektur berkas itu berubah bentuk — itu keputusan owner, bukan detail yang boleh berpindah diam-diam.

### Verifikasi

**Preset diuji dengan MENJALANKAN Tailwind**, bukan dengan memeriksa isi objek konfigurasinya. Konfigurasi yang "terlihat benar" bisa menghasilkan CSS yang salah — kunci keliru sarang, nilai tak dikenali, varian yang tidak pernah terpakai. Yang dipakai pengguna adalah CSS-nya.

* **Uji mutasi 1:** skala teks diubah menjadi angka mati → **dua test merah**.
* **Uji mutasi 2:** varian `gerak-minimal` diubah memakai `@media prefers-reduced-motion` → **dua test merah**.
* Ada test yang membuktikan penyaring `content` benar-benar bekerja — tanpa itu, seluruh test lain akan lulus atas CSS yang selalu memuat segalanya.
* Build nyata: CSS keluar dengan `--font-scale`, `--touch-target-min`, `:focus-visible`, dan tiga selektor `data-motion`.

**Penjaga baru `token-bawaan.test.ts`**: nilai `:root` di `gaya.css` wajib setuju dengan `ACCESSIBILITY_DEFAULTS`. Dua tempat menyatakan "seperti apa tampilan pengguna yang belum mengubah apa pun", dan bila keduanya berbeda, pengguna baru melihat satu tampilan sebelum React hidup dan tampilan lain sesudahnya — kedipan yang sama dengan yang dicegah PR-026c, hanya saja sumbernya kesalahan angka.

### Pemindai vs komentar — untuk ketiga kalinya

`token-bawaan.test.ts` sempat merah karena `gaya.css` **menyebut** `prefers-reduced-motion` di dalam kalimat yang menjelaskan mengapa ia tidak dipakai. Komentar dibuang sebelum dipindai.

Pola yang sama sudah muncul di `soft-delete-jangkauan` (PR-021a) dan `pwa-fondasi` (PR-025d). Cukup sering untuk pantas diingat: **pemindai teks apa pun atas kode kita sendiri harus membuang komentar lebih dulu**, sebab kode yang didokumentasikan dengan baik justru paling mungkin menyebut hal yang dilarangnya.

### Next steps

* **PR-027b** — Button & Input. AC 1 (fokus ring) & 4 (target sentuh).
* **PR-027c** — FormField & Select. AC 2, 3, 5.
* Komponen wajib melewati `harusLolosAksesibilitas()` (PR-031a) — gerbangnya sudah menyala sebelum komponen pertama lahir.
* **Pilihan Tailwind v3** layak ditinjau ulang sebelum Phase 04, selagi belum ada komponen yang bergantung padanya.

---
## PR-027a (revisi) — Migrasi ke Tailwind v4 & ADR-019

> **Phase:** [03 - Web Platform Base](../phase-03-web-platform-base.md#pr-027---packagesui-batch-1--form-primitives)
> **Tanggal:** 2026-08-09
> **Status:** Selesai. Menggantikan pilihan v3 dari PR-027a, sebelum satu komponen pun bergantung padanya.

### Kenapa direvisi

PR-027a memperkenalkan Tailwind `3.4.17` dan menyajikannya seolah keputusan yang sudah diambil. Tinjauan atas repo membuktikan sebaliknya:

* **Nol ADR menyebut Tailwind.** Tidak ada ADR tentang styling sama sekali.
* SDD menyebutnya **tiga kali, semuanya di dalam diagram ASCII** (§103, §107, §189) — inventaris deskriptif, bukan pernyataan normatif. Kata "preset" hanya muncul di §107 dan §189.
* Pin 3.4.17 masuk repo lewat commit `a96f34d` **hari itu juga**, oleh agent.
* Alasan yang ditulis saat itu — *"repo menahan versi secara sadar (React 18, Vite 5)"* — **tidak tahan diperiksa**: Vite 5 dipaksa vitest 2.1.8 (kendala teknis), React 18 memang ditulis SDD:99 dan CLAUDE.md (keputusan terdokumentasi). Keduanya punya sebab spesifik; tidak satu pun menetapkan kebijakan menahan versi.

Sementara **ADR-008** — satu-satunya pernyataan normatif tentang token — menetapkan mekanismenya sebagai *"CSS custom properties dan atribut data pada `<html>`"*, **tanpa menyebut framework CSS apa pun**.

v4 menjadikan custom property sebagai tema itu sendiri, jadi mekanisme ADR-008 terwakili **langsung**. Di v3 kita menempuhnya lewat objek JS yang menghasilkan CSS yang membaca custom property — satu lapisan yang tidak menambah apa pun.

Keputusan diambil owner, dan dituangkan sebagai **ADR-019** — sebab cacat yang sesungguhnya bukan versinya, melainkan bahwa pilihan stack ini tidak punya ADR sama sekali.

### Yang berubah

| Sebelum (v3) | Sesudah (v4) |
|---|---|
| `packages/config/tailwind/preset.cjs` + `preset.d.cts` | `packages/config/tailwind/tema.css` (`@theme` + `@custom-variant`) |
| `apps/web/tailwind.config.cjs` | *(hilang — v4 tanpa config JS)* |
| `apps/web/postcss.config.cjs` + `postcss` + `autoprefixer` | plugin `@tailwindcss/vite` (autoprefix bawaan) |
| `tailwind-merge` 2.6.0 | `tailwind-merge` 3.6.0 |
| `tailwindcss` 3.4.17 | `tailwindcss` 4.3.3 |

Berkurang **tiga berkas konfigurasi dan dua dependensi**.

### Kontrak token TIDAK berubah

Syarat yang dipegang: migrasi versi tidak boleh mengubah perilaku token. Dibuktikan lewat kompilasi CSS nyata, bukan pembacaan konfigurasi:

* `var(--font-scale, 1)` — cadangan utuh;
* `var(--touch-target-min, 44px)` — cadangan utuh, dan rantainya sampai ke token runtime, tidak berhenti di variabel tema;
* ketiga atribut (`data-contrast`, `data-motion`, `data-lang-mode`) menghasilkan selektor yang sama;
* `prefers-reduced-motion` tetap **tidak** muncul di keluaran.

Nilai bawaan `:root` sengaja **tidak** dipindah ke dalam `@theme`: itu nilai RUNTIME yang ditulis ulang JavaScript saat pengguna mengubah preferensi. `@theme` untuk nilai desain yang tetap; mencampurnya akan membuat token pengguna terlihat seperti bagian tema yang tidak boleh berubah.

### Dua jebakan yang ditemukan saat menguji

**1. Versi 4.0.0 tidak bisa dipakai.** Kompilasi gagal dengan `Missing field 'negated' on ScannerOptions.sources` — ketidakcocokan antar-paket internal. Naik ke 4.3.3 menyelesaikannya. `^4` sempat tertahan lockfile di 4.0.0; versinya harus dipin eksplisit, konsisten dengan gaya repo.

**2. Test sempat menguji hal yang salah — dua kali.**

Pertama, plugin PostCSS Tailwind meng-cache compiler & scanner berdasarkan jalur `from`; dengan jalur sama, kandidat kelas antar-pemanggilan **menumpuk**.

Kedua — dan ini yang lebih penting — v4 **memindai berkas di sekitar `from` secara otomatis**, termasuk **berkas test itu sendiri**. String `min-h-sentuh` yang ditulis di dalam assertion ikut menjadi kandidat kelas, sehingga CSS memuat utilitas yang tidak pernah diminta.

Akibatnya test *"kelas yang tidak diminta tidak ikut dihasilkan"* merah — dan assertion lain **bisa lulus karena alasan yang salah**. Ditutup dengan `@import "tailwindcss" source(none)` dan `from` unik per panggilan. Tanpa test negatif itu, kebocoran ini tidak akan pernah terlihat.

### Verifikasi

* **Uji mutasi 1:** skala teks → angka mati = **dua test merah**.
* **Uji mutasi 2:** varian → `@media prefers-reduced-motion` = **dua test merah**.
* **Integrasi Vite 5.4.21 + Vitest 2.1.8**: build produksi nyata berhasil; skrip pra-paint tetap tersuntik ke `<head>`; CSS memuat token bawaan, `:focus-visible`, dan tiga aturan `data-motion`.
* `tailwind-merge` 3.6.0 lolos **tanpa perubahan konfigurasi** — 8 test grup kelas kustom hijau apa adanya.
* Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, seluruh paket hijau (config 22, ui 8, a11y 74, web 140, schemas 14, api 683, api-client 24). **Bundel JS awal tetap 97,9 KB / 200 KB.**

### Utang yang dicatat

* **SDD:107 masih menulis "tailwind preset"**, yang di v4 bukan lagi objek JS. Maksudnya (tema bersama di `packages/config`) tidak berubah, jadi tidak disunting di PR ini — dicatat di ADR-019 §Consequences agar ikut diperbaiki saat SDD berikutnya disunting.
* Dokumentasi dan contoh Tailwind di internet masih banyak v3; penulis komponen PR-027b/c perlu memastikan rujukannya.

### Next steps

* **PR-027b** — Button & Input, kini di atas fondasi v4. AC 1 & 4.
* **PR-027c** — FormField & Select. AC 2, 3, 5.

---

## PR-027b — Tombol & Masukan

**Tanggal:** 2026-08-09
**Branch:** `pr-027b-button-input` → `phase-03-web-platform-base`
**Menutup:** PR-027 AC **1** (fokus ring selalu terlihat di semua varian) dan AC **4** (target sentuh ≥ 44px, ≥ 56px saat `largeTouchTargets`).

### Yang dibangun

* `packages/ui/src/tombol.tsx` — `Tombol`, tiga varian (`utama`, `sekunder`, `hening`) × dua ukuran (`sedang`, `kecil`).
* `packages/ui/src/masukan.tsx` — `Masukan`, dengan prop `bermasalah`.
* Keduanya diekspor dari `packages/ui/src/index.ts` berikut tipenya.

### Keputusan: TIDAK memakai primitive Radix

Dokumen phase menulis *"primitives Radix + Tailwind"*, dan itu benar — untuk Select (PR-027c), yang polanya rumit dan tidak punya padanan natif yang memadai.

Untuk Button dan Input, `<button>` dan `<input>` natif **sudah** memenuhi seluruh pola WAI-ARIA-nya: peran, aktivasi Enter/Space, keadaan disabled, partisipasi form, dan integrasi dengan teknologi bantu. Membungkusnya dengan primitive tidak menambah **satu pun** perilaku, hanya berat — sementara tiap lapisan tambahan adalah kesempatan baru merusak semantik yang sudah benar.

Itu justru menempuh mitigasi Risks PR-027 (*"kustomisasi berlebihan merusak perilaku ARIA"*) lebih jauh daripada *styling-only di atas primitive*: tidak ada perilaku yang bisa rusak kalau tidak ada yang menggantikannya. Test aktivasi keyboard tetap ditulis — bukan karena perilaku natif meragukan, melainkan sebagai penjaga bila kelak ada yang menggantinya dengan `<div role="button">`.

### Tiga cacat yang dijaga secara eksplisit

**1. `type="button"` sebagai bawaan.** Bawaan HTML adalah `"submit"`, sehingga tombol apa pun di dalam form mengirim form itu saat ditekan — termasuk tombol "Batal". Ini paling menimpa pengguna keyboard, yang menekan Enter jauh lebih sering daripada pengguna tetikus. Bisa ditimpa (`type="submit"`), tetapi harus disengaja.

**2. Tidak ada `outline-none` di mana pun.** Cara paling umum cincin fokus mati adalah seseorang mengganti outline dengan `ring-*` lalu lupa satu varian — dan kegagalannya tak terlihat oleh siapa pun yang memakai tetikus. Aturan `:focus-visible` global (PR-027a) sudah memberi outline `currentColor` 3px yang ikut berubah bersama warna teks tiap varian, jadi tidak ada yang perlu diganti. Dijaga test per varian.

**3. `bermasalah` menulis `aria-invalid` DAN warna sekaligus.** Kolom yang *terlihat* merah tetapi tidak *menyatakan* `aria-invalid` tidak terbaca sebagai galat oleh screen reader — cacat yang hanya menimpa pengguna yang paling bergantung padanya. Karena satu prop menulis keduanya, keduanya tidak bisa menyimpang. Saat normal atributnya **absen**, bukan `"false"`: sebagian screen reader lawas tetap menyebut `aria-invalid="false"`.

Ukuran `kecil` hanya merapatkan padding; tingginya tetap dikunci `min-h-sentuh`. **Target sentuh bukan gaya yang boleh dipilih** — ia batas bawah, dan itu dijaga test tersendiri.

`Masukan` sengaja **tidak mengurus label**; itu tugas FormField (PR-027c). Menaruhnya di sini akan melahirkan dua cara melabeli kolom yang sama, dan yang kedua selalu menjadi yang lupa diperbarui. Yang disediakan hanyalah kait yang dibutuhkan FormField: `id`, `aria-describedby`, `aria-invalid` — dan sebuah test yang memastikan kolom **tanpa** label tetap ditangkap axe sampai PR-027c datang.

### Verifikasi

**Uji mutasi — enam mutasi, semua tertangkap:**

| Mutasi | Hasil |
|---|---|
| `min-h-sentuh min-w-sentuh` → `h-10` di Tombol | **4 test merah** |
| `outline-none` diselundupkan ke varian `hening` | **1 test merah** |
| bawaan `type="button"` dihapus | **1 test merah** |
| `aria-invalid` dihapus dari Masukan (warna saja) | **1 test merah** |
| `aria-invalid` selalu ditulis (`"false"` saat normal) | **1 test merah** |
| `min-h-sentuh` hilang dari Masukan | **1 test merah** |

**Gerbang axe (PR-031a) tidak lulus secara hampa:** dua test negatif membuktikannya — tombol ikon tanpa `aria-label` gagal dengan `button-name`, dan `Masukan` tanpa label gagal dengan aturan label.

**Kelas benar-benar sampai ke CSS produksi.** `packages/ui` bukan tempat Tailwind memindai secara bawaan; ia masuk lewat `@source` di `gaya.css`. Diperiksa pada build nyata, bukan diasumsikan — keluaran `dist/assets/index-*.css` memuat `min-h-sentuh`, `min-w-sentuh`, `border-red-700`, varian `placeholder:`, dan `[data-motion=reduced] .gerak-minimal\:transition-none`.

**Gate:** `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 (ui 41 test, sebelumnya 8). Build produksi hijau; **bundel JS awal 325,20 kB / gzip 100,23 kB** — komponen belum dipakai halaman mana pun, jadi angkanya belum berubah oleh PR ini.

### Batas yang jujur

Yang **tidak** bisa dibuktikan test di jsdom, dan sengaja tidak diklaim:

* **Piksel target sentuh.** jsdom tidak melakukan tata letak; yang diuji adalah kelasnya ada dan rantai tokennya benar (`min-h-sentuh` → `var(--spacing-sentuh)` → `var(--touch-target-min, 44px)`, diuji di `packages/config`). Pengukuran 44px/56px yang sesungguhnya milik **PR-031b** di browser.
* **Rasio kontras.** Angka yang ditulis di komentar (17,4:1 untuk `utama`, 12,6:1 untuk `sekunder`, 4,6:1 untuk placeholder) dihitung dari nilai palet Tailwind, bukan diukur dari piksel yang dirender. Verifikasinya juga milik PR-031b.
* **Cincin fokus yang benar-benar terlihat.** Yang dijaga di sini adalah ia tidak dimatikan. Bahwa ia tampak dan kontrasnya cukup — PR-031b.

### Out of scope

FormField & Select (PR-027c); overlay/feedback (PR-028); varian React Native (PR-089); halaman yang memakai komponen ini.

### Next steps

* **PR-027c** — FormField & Select (Radix). AC 2, 3, 5.

---

## PR-027c — KolomForm & Pilihan (Select)

**Tanggal:** 2026-08-09
**Branch:** `pr-027c-formfield-select` → `phase-03-web-platform-base`
**Menutup:** PR-027 AC **2** (label terasosiasi programatik), **3** (galat diumumkan lewat `aria-describedby` + `aria-invalid`), **5** (keyboard Select sesuai pola WAI-ARIA). **PR-027 tuntas.**

### Yang dibangun

* `packages/ui/src/konteks-kolom.ts` — kait antara kolom dan kontrol di dalamnya.
* `packages/ui/src/kolom-form.tsx` — `KolomForm`: label, bantuan, galat, penanda wajib.
* `packages/ui/src/pilihan.tsx` — `Pilihan` di atas `@radix-ui/react-select` 2.3.7.
* `Masukan` (PR-027b) kini membaca konteks; prop eksplisit tetap menang.

### Keputusan: id dibagikan lewat konteks, bukan diketik pemakai

AC 2 dan 3 bisa dipenuhi dengan menuliskan `id` dan `aria-describedby` di tiap pemakaian. Itu bekerja — sampai satu kolom terlewat. Dan yang terlewat di sini bukan "kolomnya jadi kurang rapi": pengguna screen reader tidak pernah tahu ada yang salah dengan isiannya, sementara semua orang lain melihat tepi merah.

Karena itu `KolomForm` yang **membagikan** id-nya lewat konteks React, dan kontrol yang **mengambilnya**. Tidak ada yang perlu diingat siapa pun. `useId` dipakai supaya dua kolom dengan label sama di satu halaman tidak bertabrakan — `aria-describedby` yang menunjuk id ganda mengumumkan deskripsi yang salah.

Konteks yang tidak ada bernilai `null`, bukan objek kosong: memakai kontrol di luar `KolomForm` itu sah (mis. dropdown pengurut dengan `aria-label` sendiri), dan menyamarkan keduanya akan membuat kontrol yang lepas dari kolomnya tampak seolah tersambung.

### Keputusan: Select MEMANG memakai Radix

Berbeda dari PR-027b, di sini primitive-nya dipakai — dan alasannya bukan sekadar "dokumen phase menyebut Radix".

Pola listbox tidak punya elemen natif yang bisa **ditata**: `<option>` bawaan tidak menerima gaya. Sementara pola ARIA-nya menuntut belasan perilaku yang saling terkait — roving focus, typeahead, Home/End, penguncian scroll, pengembalian fokus saat tutup, penutupan saat klik di luar. Menulis ulang itu persis yang diperingatkan PRD R9 (*"pakai komponen headless teruji, bukan bangun dari nol"*).

Perilakunya datang **sepenuhnya** dari Radix; berkas kita hanya menata tampilan dan menyambungkannya ke `KolomForm`. Itu mitigasi Risks PR-027 apa adanya: *styling-only di atas primitive*. Test yang ditulis karena itu tidak menguji ulang Radix — ia menguji bahwa perilaku Radix **sampai ke pengguna setelah kita menatanya**, sebab penataan itulah satu-satunya risiko yang memang milik kita.

Dua penyimpangan sadar dari contoh Radix yang lazim beredar:

* **`position="popper"`.** Mode bawaan Radix menyelaraskan item terpilih tepat di atas pemicu; pada zoom 200% (WCAG 2.2 §1.4.4) daftarnya mudah terdorong keluar layar.
* **Sorotan membalik warna (17,4:1), bukan `bg-*-100` + `outline-none`.** Pasangan itu ada di hampir semua contoh Radix di internet. Abu muda di atas putih hanya ± 1,1:1 — jauh di bawah 3:1 yang dituntut WCAG 2.2 §1.4.11 — sehingga begitu outline-nya dimatikan, penanda fokus keyboard praktis hilang. Dijaga test.

### Tiga cacat lain yang dijaga eksplisit

1. **Penanda wajib punya teks, bukan hanya bintang.** Bintang hanya bermakna bagi yang melihatnya, dan artinya harus ditebak. Teks `(wajib diisi)` masuk ke nama kolom lewat `sr-only`; bintangnya `aria-hidden`.
2. **Bantuan dibacakan sebelum galat.** Urutan id di `aria-describedby` menentukan urutan pengumuman. *"Apa yang salah"* tanpa *"apa yang diminta"* tidak bisa ditindaklanjuti.
3. **`role="alert"` pada pesan galat.** Tanpa live region, galat yang lahir setelah submit hanya *terlihat* — pengguna screen reader tidak tahu ada yang berubah sampai ia menjelajah ulang formnya.

### Verifikasi

**Uji mutasi — sepuluh mutasi:**

| Mutasi | Hasil |
|---|---|
| `<label>` kehilangan `htmlFor` | **7 test merah** |
| urutan `aria-describedby` dibalik (galat sebelum bantuan) | **2 test merah** |
| `role="alert"` dihapus dari pesan galat | **1 test merah** |
| teks `sr-only` "wajib diisi" dihapus (bintang saja) | **1 test merah** |
| prop `id` pemakai ditimpa konteks | **1 test merah** |
| `aria-describedby` tidak diteruskan ke pemicu Select | **1 test merah** |
| `min-h-sentuh` hilang dari item opsi | **1 test merah** |
| sorotan → `bg-gray-100` + `outline-none` (pola lazim Radix) | **1 test merah** |
| `ItemIndicator` (centang) dihapus | **awalnya LOLOS** → lihat di bawah |
| `aria-hidden` dilepas dari centang | **lolos — mutan setara**, lihat di bawah |

**Mutasi kesembilan mula-mula tidak tertangkap sama sekali.** Komentar di berkas mengklaim keadaan terpilih ditandai bentuk dan bukan warna semata (WCAG 2.2 §1.4.1), tetapi tidak ada satu pun test yang menjaganya — menghapus tanda centang membuat nol test merah. Test ditambahkan (`terpilih.textContent` memuat `✓`, yang lain tidak), dan mutasinya kini tertangkap. Klaim yang hanya hidup di komentar bukan klaim yang dijaga.

**Mutasi kesepuluh lolos, dan itu benar.** Radix menamai item lewat `aria-labelledby` yang menunjuk `ItemText`, jadi teks centang tidak pernah ikut ke nama aksesibel — dengan atau tanpa `aria-hidden`. Mutan setara: tidak ada pengguna yang bisa membedakannya. Dicatat, bukan ditutup dengan test hampa.

**Gerbang axe tidak lulus hampa:** dua test negatif — kontrol di luar `KolomForm` gagal aturan label; `Pilihan` tanpa label apa pun gagal `select-name`/`button-name`.

**Tambalan jsdom.** Radix Select memakai Pointer Capture, `scrollIntoView`, dan `ResizeObserver` — ketiganya tidak ada di jsdom, dan tanpa tambalan komponennya melempar sebelum satu assertion pun berjalan. Yang ditambal seluruhnya soal tata letak dan penunjuk; tidak satu pun menyentuh peran, id, atau penanganan keyboard. Artinya test yang lolos benar-benar menguji perilaku Radix, bukan menguji tambalannya.

**Gate:** `pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (ui 68 test, dari 41). Build produksi hijau; CSS memuat `data-highlighted`, `.sr-only`, dan `--radix-select-trigger-width`. **Bundel JS awal tetap 325,20 kB / gzip 100,23 kB** — Radix tidak ikut masuk karena belum ada halaman yang mengimpor komponen ini. CSS 9,59 → 11,09 kB (gzip 2,76 → 3,17 kB).

### Ukuran PR

**708 LOC** (389 test, 319 sumber; lock file tidak dihitung) — **di atas target <500**. Dilaporkan ke owner berikut usulan pemecahan 027c (KolomForm, ≈327) / 027d (Pilihan, ≈384); owner memilih mendaratkannya utuh.

### Batas yang jujur

* **Verifikasi manual NVDA** yang diminta Testing Checklist PR-027 **belum dilakukan.** jsdom membuktikan sambungan `aria-*` benar; ia tidak membuktikan bagaimana bunyinya. Masuk daftar tindak lanjut.
* Rasio kontras (17,4:1 sorotan, 4,6:1 placeholder) dihitung dari nilai palet, bukan diukur dari piksel — PR-031b.
* Perilaku Radix di **peramban sungguhan** (typeahead, penguncian scroll, penempatan popper pada zoom 200%) tidak terjangkau jsdom — PR-031b.

### Out of scope

Overlay/feedback (PR-028); varian React Native (PR-089); halaman yang memakai komponen ini; Textarea, Checkbox, Radio (tidak disebut PR-027).

### Next steps

* **PR-028** — packages/ui Batch 2: overlay & feedback.

---

## PR-028a — Dialog

**Tanggal:** 2026-08-09
**Branch:** `pr-028a-dialog` → `phase-03-web-platform-base`
**Menutup:** PR-028 AC **1** (fokus masuk saat buka, kembali ke pemicu saat tutup); AC **5** untuk Dialog.

### Pemecahan PR-028

Scope utuh PR-028 (Dialog, Toast, Skeleton, Tabs, Card) terukur ≈ **1400 LOC** — hampir tiga kali target <500. Diusulkan ke owner **sebelum** implementasi dimulai, bukan sesudah seperti pada PR-027c. Owner memilih pemecahan tiga arah:

* **PR-028a** — Dialog (AC 1)
* **PR-028b** — Toast + Skeleton (AC 2, 4)
* **PR-028c** — Tabs + Card (AC 3)

### Yang dibangun

* `packages/ui/src/dialog.tsx` — `Dialog` di atas `@radix-ui/react-dialog` 1.1.15, plus `TutupDialog` untuk menutup dari dalam isi.

### Kenapa Radix di sini paling kuat alasannya

Dari seluruh komponen sejauh ini, inilah yang paling jelas membutuhkan pustaka. Manajemen fokus adalah satu-satunya bagian aksesibilitas yang cacatnya **menjebak** pengguna alih-alih sekadar menyulitkannya:

* fokus yang lolos ke belakang dialog membuat pengguna keyboard menjelajah halaman yang **tidak bisa ia lihat sedang tertutup**;
* fokus yang tidak kembali saat dialog ditutup membuatnya mendarat di awal dokumen tanpa tahu ke mana perginya.

Radix menangani jerat fokus, pengembalian fokus, Escape, klik di luar, dan `aria-hidden` pada sisa halaman. Berkas kita menata tampilan dan menegakkan satu hal yang tidak dijamin pustaka mana pun: bahwa dialognya punya judul.

### Keputusan: `judul` adalah prop WAJIB, bukan komponen anak

Saat dialog terbuka, screen reader mengumumkan namanya — dan nama itu datang dari judul. Dialog tanpa judul terumumkan sebagai *"dialog"* saja: pengguna tahu sesuatu terbuka, tetapi tidak tahu apa.

Radix menyediakannya sebagai komponen anak (`Dialog.Title`), yang berarti bisa lupa dipasang, dan lebih buruk lagi bisa dirender **bersyarat**. Menjadikannya prop wajib memindahkan kegagalan itu dari runtime ke waktu kompilasi.

### Keputusan: dialog bertumpuk DILARANG secara struktural

Risks PR-028 menulis larangan ini sebagai *by-convention*. Konvensi tidak menahan apa pun di sini: yang menumpuk dialog biasanya **tidak sadar** sedang melakukannya, sebab dialog kedua lahir dari komponen yang dipakai ulang di tempat lain.

Akibatnya bukan soal kerapian. Dua jerat fokus bersarang berarti pengguna keyboard terkurung **di dalam kurungan**: menutup dialog dalam mengembalikan fokus ke pemicu yang mungkin sudah tidak ada, dan `aria-hidden` yang terpasang dua kali bisa menyembunyikan dialog luar dari screen reader sementara ia masih tampak di layar.

Jadi `Dialog` di dalam `Dialog` **melempar galat**. Melempar memang keras — tetapi `apps/web` punya `ErrorBoundary` di akar rute (`LayarKesalahan`, PR-025b), jadi yang muncul adalah layar galat berbahasa Indonesia, bukan halaman putih. Gagal saat pengembangan jauh lebih murah daripada mengurung pengguna di produksi. Dua dialog **berdampingan** tetap sah; yang dilarang bersarang.

### Satu cacat zoom yang dijaga

`max-h-[90vh]` + `overflow-y-auto`. Dialog `fixed` yang tingginya tidak dibatasi akan memanjang melewati layar pada zoom 200% (WCAG 2.2 §1.4.4), dan karena ia `fixed`, isinya tidak bisa digulir sama sekali — bagian bawahnya, **termasuk tombol aksi**, jadi mustahil dijangkau. Ini cacat yang tidak pernah terlihat pada layar penuh di mesin pengembang.

Tombol tutup memakai `Tombol` (PR-027b), jadi target sentuh dan cincin fokusnya ikut aturan yang sama dengan tombol lain; `aria-label`-nya wajib sebab "×" tidak punya arti yang bisa dibacakan.

### Verifikasi

**Uji mutasi — lima mutasi, semua tertangkap:**

| Mutasi | Hasil |
|---|---|
| penjaga dialog bertumpuk dilucuti | **1 test merah** |
| `aria-label` tombol tutup dihapus | **5 test merah** |
| `RadixDialog.Title` → `<div>` (dialog kehilangan nama) | **4 test merah** |
| batas tinggi + `overflow-y-auto` dihapus | **1 test merah** |
| `gerak-minimal:transition-none` dilepas dari panel | **1 test merah** |

**Satu jebakan yang nyaris membuat gerbang axe hampa.** Isi dialog hidup di **portal pada `document.body`**, bukan di `container` milik `render()`. Memeriksa `container` akan lolos atas markup kosong — penjaga yang selalu hijau karena tidak memeriksa apa pun. Test memeriksa `document.body`, dan test negatifnya (dialog dengan `aria-labelledby` menunjuk id tidak ada) membuktikan gerbangnya benar-benar menangkap, dengan nama aturan `aria-dialog-name` ikut diperiksa agar tidak "lulus" gara-gara galat lain.

Elemen palsu pada test negatif itu dibersihkan lewat `finally`: `cleanup()` hanya menyapu kontainer milik RTL, dan dialog cacat yang bertahan di `document.body` akan membuat test axe **lain** merah — kegagalan yang menuduh berkas yang salah.

**Gate:** `pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (ui **87** test, dari 68). Build produksi hijau; CSS memuat `max-h-[90vh]`, `bg-black/50`, `overflow-y-auto`, `-translate-x-1/2`. **Bundel JS awal tetap 325,20 kB / gzip 100,23 kB** — Radix Dialog belum ikut masuk karena belum ada halaman yang mengimpornya. CSS 11,09 → 12,52 kB (gzip 3,17 → 3,50 kB).

**440 LOC** (278 test, 162 sumber; lock file tidak dihitung) — di bawah target.

### Batas yang jujur

* **Verifikasi manual "skenario dialog bertumpuk"** yang diminta Testing Checklist PR-028 kini sebagian terjawab oleh penjaga struktural, tetapi **NVDA sampling belum dilakukan** — sama seperti PR-027c.
* `aria-hidden` pada sisa halaman dan penguncian scroll body dikerjakan Radix di peramban; jsdom tidak bisa membuktikan efeknya. PR-031b.
* Perilaku pada zoom 200% dijaga lewat kelasnya, bukan diukur — PR-031b.

### Out of scope

Toast & Skeleton (PR-028b); Tabs & Card (PR-028c); komponen domain seperti kartu lowongan (PR fitur).

### Next steps

* **PR-028b** — Toast + Skeleton. AC 2, 4.

---

## PR-028b — Toast & Kerangka (Skeleton)

**Tanggal:** 2026-08-09 · **Branch:** `pr-028b-toast-skeleton` · **AC ditutup:** PR-028 nomor 2 & 4 (nomor 5 bertambah)

### Ringkasan

`PenyediaToast` + `Toast` di atas `@radix-ui/react-toast`, dan `Kerangka` + `WilayahMemuat` tanpa primitive apa pun. Keduanya tidak berbagi satu baris kode.

### AC 2 — dua tuntutan yang saling berlawanan

"Diumumkan `aria-live="polite"` **tanpa mencuri fokus**" bukan satu syarat, melainkan dua yang saling menarik. Supaya pengguna screen reader tahu sesuatu terjadi, pesannya harus masuk live region; supaya ia tidak kehilangan tempatnya, fokus tidak boleh pindah. Cara paling lazim memenuhi yang pertama — memindahkan fokus ke toast — justru melanggar yang kedua. Karena itu keduanya diuji **terpisah**, bukan lewat satu test "toast muncul".

Tiga hal yang tidak akan tertangkap tanpa membaca sumber Radix:

* **Bawaan Radix melanggar AC-nya.** `type` bercerita tentang ASAL pesan, bukan cara mengumumkannya: `"foreground"` — dan itu bawaannya — menjadi `aria-live="assertive"`. Membiarkannya berarti setiap toast menyela pembacaan yang sedang berjalan. Dipetakan lewat `mendesak` yang bawaannya `false`; test memeriksa atribut hasilnya, bukan prop masukannya.
* **Region harus ada sebelum isinya.** Live region hanya mengumumkan PERUBAHAN di dalam region yang sudah ada; region yang lahir bersama pesannya kerap tidak terdengar sama sekali. Radix menghindarinya dengan menyalin teks ke region tersembunyi terpisah, lalu membuangnya setelah satu detik agar tidak terbaca dua kali saat pengguna menjelajah halaman. Konsekuensinya untuk test: `findByRole("status")` saja **lolos atas region kosong** — helper `pengumumanBerisi()` menunggu isinya.
* **Toast beraksi tidak pernah berhitung mundur** (WCAG 2.2 §2.2.1). Menghilangkan tombol karena waktu berarti fungsinya lenyap bagi yang paling lambat menjangkaunya: pengguna keyboard yang harus menekan F8 dulu, dan pengguna screen reader yang baru mendengar tawarannya setelah kalimat sebelumnya selesai. Aturannya struktural — kehadiran `aksi` yang mematikan hitungan, jadi tidak ada pemakaian yang bisa lupa.

Durasi bawaan dinaikkan 5 → 8 detik (Radix menghentikannya saat toast disentuh atau menerima fokus, jadi itu batas bawah). `label` Provider dan Viewport di-Indonesia-kan — bawaannya "Notification"/"Notifications (F8)", dan bahasa Inggris di tengah kalimat Indonesia dilafalkan salah oleh screen reader. "(F8)" dipertahankan di nama viewport karena itu pintasan yang memindahkan fokus ke daftar toast: tanpanya, toast di ujung DOM praktis tidak terjangkau keyboard, dan tombol di dalamnya jadi hiasan bagi persona Sari. Penutup manual wajib ada — Radix memberi toast gerakan geser-untuk-menutup, dan WCAG 2.2 §2.5.7 menuntut setiap fungsi berbasis seret punya jalan lain dengan satu penunjuk.

**Tidak ada animasi sama sekali, dan itu keputusan.** Toast lazim ditulis meluncur masuk dari tepi layar; gerak di sudut penglihatan justru yang paling sering memicu mual pada gangguan vestibular. Pengumumannya datang dari live region, bukan dari geraknya — jadi tidak ada yang hilang.

### AC 4 — yang ditandai adalah WILAYAH, bukan bentuk abu-abunya

Bunyi AC-nya spesifik dan bukan kerewelan istilah. `aria-busy` berarti "isi di sini belum final"; menaruhnya pada bentuk abu-abu — yang memang tidak punya isi — tidak memberi tahu apa pun. Karena itu `Kerangka` (bentuk, selalu `aria-hidden`) dipisah dari `WilayahMemuat` (penanda, yang menjadikan bentuk itu berarti).

**Jebakan yang menentukan susunannya:** `aria-busy="true"` memerintahkan screen reader MENAHAN pembacaan perubahan di dalam wilayah itu. Live region yang diletakkan di dalamnya ikut tertahan — pengumuman "Memuat…" baru terdengar setelah pemuatannya usai, yaitu tepat saat ia sudah tidak berguna. Bug ini tidak terlihat sama sekali di layar, jadi ia bertahan lama. `role="status"` karena itu menjadi saudara **di luar** wilayah sibuk, dan test memeriksa hubungan kedua elemen (`contains`), bukan sekadar keberadaan atributnya. Region-nya juga selalu dirender, hanya kosong saat diam — alasan yang sama dengan toast.

### Uji mutasi

Sebelas mutasi ditanam, **sebelas tertangkap**:

| # | Mutasi | Test merah |
|---|--------|-----------|
| M1 | `type` selalu `"foreground"` (bawaan Radix) | 1 |
| M2 | Hapus `duration={aksi ? Infinity : …}` | 1 |
| M3 | Hapus `aria-label` tombol tutup | 4 |
| M4 | Hapus `label` Provider (jadi "Notification") | 1 |
| M5 | Hapus `label` Viewport (hilang "(F8)") | 1 |
| M6 | Pindahkan `role="status"` KE DALAM wilayah sibuk | 1 |
| M7 | Render status hanya saat memuat | 1 |
| M8 | Hapus `aria-busy` | 4 |
| M9 | Hapus `aria-hidden` dari bentuk kerangka | 5 |
| M10 | Hapus `gerak-minimal:animate-none` | 1 |
| M11 | Hapus `kontras-tinggi:bg-gray-500` | 1 |

M10 dan M11 lemah, dan disebut apa adanya: test-nya memeriksa string kelas, jadi ia menyalin baris yang dijaganya. Yang benar-benar dibuktikan hanyalah kelasnya sampai ke markup — bahwa kelas itu **punya aturan CSS** dibuktikan terpisah lewat kompilasi produksi (lihat Gate).

### Dua kesalahan sendiri yang layak dicatat

* **Test fokus pertama merah atas komponen yang benar.** `document.activeElement` jatuh ke `<body>`, bukan berpindah ke toast — tidak ada yang mencuri fokus. React membongkar-pasang ulang anaknya karena harness saya mengubah anak tunggal menjadi larik antara dua render, dan tombol yang dipasang ulang kehilangan fokus. Susunan pohonnya disamakan; hanya `terbuka` yang berpindah.
* **Gerbang negatif pertama tidak bisa dipakai.** Cacat yang paling saya khawatirkan untuk `Kerangka` — elemen fokusable di balik `aria-hidden` — dilaporkan axe sebagai **`incomplete`, bukan violation**, sebab jsdom tidak punya tata letak untuk menilai keterfokusan. Artinya gerbang lapis kedua **tidak menjaga cacat itu**; tugasnya jatuh ke PR-031b. Penjaga negatifnya diganti `aria-busy` bernilai ngawur (`aria-valid-attr-value`) — cacat yang justru pas: atributnya terlihat ada di inspector, tetapi diabaikan diam-diam.

### Gate

`pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (ui **118** test, dari 87; total repo 1.075). Build produksi hijau. Delapan kelas baru diperiksa langsung di CSS terkompilasi, termasuk kedua varian atribut ADR-008:

```
[data-motion=reduced] .gerak-minimal\:animate-none{animation:none}
[data-contrast=high]  .kontras-tinggi\:bg-gray-500{background-color:var(--color-gray-500)}
```

CSS 12,52 → 13,23 kB (gzip 3,50 → 3,72 kB). **Bundel JS awal tetap 325,20 kB / gzip 100,23 kB** — Radix Toast belum ikut masuk karena belum ada halaman yang mengimpornya; ia baru terhitung saat PR fitur mengadopsinya, dan di situlah penjaga budget bundel bekerja.

**780 LOC** (465 test, 299 sumber, 16 sambungan; lock file tidak dihitung) — di atas target <500 dan di atas perkiraan ≈480. Dilaporkan ke owner berikut usulan pemecahan Toast/Kerangka yang nol kopling; owner memilih mendaratkannya utuh (2026-08-09).

Catatan kebersihan: `@radix-ui/react-toast@1.2.23` sudah ada di `pnpm-lock.yaml` tetapi **tidak** di `packages/ui/package.json` — sisa percobaan yang tidak tuntas. Keadaan itu membuat `pnpm install --frozen-lockfile` gagal di CI. Ditutup di PR ini.

### Batas yang jujur

* **NVDA sampling masih belum dilakukan** — menumpuk sejak PR-027c, kini untuk tiga komponen. Semua klaim "diumumkan" di atas bersandar pada atribut dan struktur ARIA, bukan pada pendengaran alat sungguhan.
* Pintasan F8, penghentian hitungan saat hover/fokus, dan gerakan geser adalah perilaku peramban — jsdom tidak bisa membuktikannya. PR-031b.
* Elemen fokusable di balik `aria-hidden` **tidak terjaga** gerbang lapis kedua (lihat di atas). PR-031b.
* Durasi 8 detik adalah pertimbangan, bukan angka terukur. Tidak ada token ADR-008 untuk "perpanjang batas waktu"; bila kelak dibutuhkan, ia preferensi baru — bukan tambalan di komponen.
* Kontras `bg-gray-200`/`gray-500` dan piksel target sentuh tidak terukur di jsdom — PR-031b.

### Out of scope

* **Antrean toast imperatif (`useToast()`/`tampilkanToast()`).** Sengaja tidak dibuat: itu state aplikasi (ADR-014, Zustand), bukan komponen. Lapisan yang ada sudah cukup dipakai secara deklaratif, dan antrean yang lahir tanpa pemakai sungguhan cenderung salah bentuk. Ia lahir bersama PR fitur pertama yang membutuhkannya.
* **Adopsi di `apps/web`.** `tata-letak.tsx` masih memakai `aria-busy` buatan tangan dari PR-025; menggantinya menyentuh i18n dan halaman nyata. Sama seperti PR-028a yang tidak menyambungkan `Dialog` ke halaman mana pun.
* Tabs & Card (PR-028c); komponen domain seperti kartu lowongan (PR fitur).

### Next steps

* **PR-028c** — Tabs + Card. AC 3.

---

## PR-028c — Tab & Kartu

**Tanggal:** 2026-08-09 · **Branch:** `pr-028c-tabs-card` · **AC ditutup:** PR-028 nomor 3 & 5 — **PR-028 tuntas**

### Ringkasan

`Tab` di atas `@radix-ui/react-tabs` (baru, dipasang di PR ini), dan `Kartu` tanpa primitive apa pun. Dengan ini set komponen UI MVP lengkap.

### AC 3 — dua keputusan yang membalik bawaan pustaka

**API digerakkan DATA, bukan komponen anak.** Dua cacat paling lazim pada tab adalah tab yang `aria-controls`-nya menunjuk panel yang tidak ada, dan panel yang tidak dimiliki tab mana pun. Keduanya lahir dari menuliskan tab dan panelnya di dua tempat terpisah lalu salah satunya berubah. Dengan satu larik `daftar`, keduanya mustahil — bukan tidak dianjurkan.

**Aktivasi bawaannya `manual`, berbeda dari Radix.** Ini bukan selera. Radix melepas panel tidak aktif dari DOM — `children: present && children`, diverifikasi langsung di sumbernya, bukan dari dokumentasi. Dengan aktivasi otomatis, menekan panah dari tab 1 ke tab 3 memasang lalu membongkar panel 2 di tengah jalan, beserta seluruh permintaan data yang dijalankannya. WAI-ARIA APG memang menganjurkan aktivasi otomatis, tetapi dengan syarat eksplisit: panelnya tampil "tanpa jeda yang terasa". Di aplikasi ini isi tab datang dari jaringan, jadi syarat itu tidak terpenuhi. `aktivasi="otomatis"` tersedia untuk isi yang benar-benar statis.

Konsekuensi yang ikut terpikul: pada aktivasi manual, cincin fokus adalah **satu-satunya** yang membedakan "tab yang sedang disorot" dari "tab yang aktif". Karena itu larangan `outline-none` di sini bukan sekadar konsistensi dengan PR-027b — ia menopang pola interaksinya. Dijaga test atas ketiga tab.

Keadaan aktif ditandai garis dan ketebalan huruf, bukan warna saja (WCAG 2.2 §1.4.1); garisnya transparan sejak awal supaya tab tidak bergeser saat dipilih — pergeseran tata letak di bawah kursor adalah cara mudah membuat pengguna kehilangan tempatnya.

### AC 5 — Kartu, dan satu-satunya hal yang bisa dirusaknya

Kartu tidak punya perilaku: tidak menerima fokus, tidak punya keadaan, tidak menangkap tombol. Karena itu tanpa primitive — membungkus wadah diam hanya menambah lapisan yang bisa merusak semantik isinya.

Yang bisa dirusaknya satu: **kerangka heading halaman.** Pengguna screen reader menjelajah dengan melompat antar heading, dan urutan tingkat itulah kerangkanya. Kartu yang selalu menulis `<h3>` merusak kerangka begitu ia dipakai di dalam bagian dengan kedalaman lain. Tingkat yang benar hanya diketahui di tempat pemakaian, jadi ia diminta di sana — dan `judul` + `tingkatJudul` diikat sebagai pasangan **di tingkat tipe** (union terdiskriminasi), sehingga lupa memberinya menjadi galat kompilasi, bukan cacat diam.

Ikatan tipe itu **dijaga**, bukan sekadar ditulis: sebuah `@ts-expect-error` di test membuat `tsc --noEmit` merah bila ikatannya dilonggarkan (mutasi M10 di bawah). Ini gerbang pertama di repo ini yang dijalankan typechecker alih-alih test runner.

### Uji mutasi

Sebelas mutasi ditanam, **sebelas tertangkap**:

| # | Mutasi | Gerbang | Merah |
|---|--------|---------|-------|
| M1 | `aktivasi` jadi `"otomatis"` (bawaan Radix) | vitest | 1 |
| M2 | Hapus `aria-label` pada tablist | vitest | 1 |
| M3 | Orientasi selalu horizontal | vitest | 2 |
| M4 | Hapus penanda aktif (garis + tebal) | vitest | 1 |
| M5 | Hapus `border-transparent` (tab bergeser) | vitest | 1 |
| M6 | Tambahkan `outline-none` | vitest | 1 |
| M7 | Abaikan `nonaktif` | vitest | 1 |
| M8 | Tingkat judul jadi `<h3>` mati | vitest | 2 |
| M9 | Judul selalu dirender walau kosong | vitest | 1 |
| M10 | Longgarkan tipe: judul boleh tanpa tingkat | **tsc** | 1 |
| M11 | Hapus garis tepi kartu | vitest | 1 |

### Tiga hal yang salah dulu sebelum benar

* **Test roving tabindex saya merah atas komponen yang benar.** Saya periksa `tabindex` tiap tab dan menyimpulkan "tidak ada satu pun yang bisa difokus". Radix menaruh perhentian Tab-nya pada **wadah tablist**, yang lalu melimpahkan fokus ke tab yang sedang aktif. Perilakunya persis yang dituntut pola — satu perhentian untuk seluruh daftar — hanya letaknya bukan di tempat yang saya duga. Test-nya diganti menjadi pengujian perpindahan fokus sungguhan (Tab masuk mendarat di tab aktif, Tab berikutnya sudah meninggalkan daftar), yang lebih baik daripada versi semula karena ia menguji yang dirasakan pengguna, bukan cara pustaka mencapainya.
* **`jsx-a11y` menolak penjaga negatif saya saat lint.** `<h2 />` kosong yang sengaja saya tulis untuk membuktikan gerbang axe tidak hampa ditolak lebih dulu oleh gerbang **lapis satu** (`jsx-a11y/heading-has-content`). Elemennya dirakit lewat DOM, bukan JSX. Kebetulan yang menyenangkan — dua lapis memang saling menutup — tetapi lapis dua tetap perlu dibuktikan, sebab heading kosong juga bisa lahir dari nilai runtime yang lint tak lihat.
* **Verifikasi CSS pertama melaporkan tiga kelas hilang, padahal ada.** Skrip pemeriksa saya lupa meloloskan `=` sebagai karakter yang ikut di-escape Tailwind (`.data-\[state\=active\]\:…`). Ini kali ketiga escape CSS menjebak saya di proyek ini, setelah `\:` dan `\[`.

### Gate

`pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (ui **150** test, dari 118; total repo 1.107). Build produksi hijau. Sembilan kelas baru diperiksa di CSS terkompilasi, termasuk ketiga penanda keadaan aktif:

```
.data-\[state\=active\]\:border-gray-900[data-state=active]{border-color:var(--color-gray-900)}
.data-\[state\=active\]\:font-semibold[data-state=active]{--tw-font-weight:var(--font-weight-semibold);…}
.data-\[state\=active\]\:text-gray-900[data-state=active]{color:var(--color-gray-900)}
```

CSS 13,23 → 14,28 kB (gzip 3,72 → 3,90 kB). **Bundel JS awal tetap 325,20 kB / gzip 100,23 kB** — Radix Tabs belum ikut masuk karena belum ada halaman yang mengimpornya.

**615 LOC** (422 test, 187 sumber, 6 sambungan; lock file tidak dihitung) — di atas target <500. Pemecahan Tab/Kartu tersedia dan keduanya akan di bawah 500, tetapi tidak ditempuh: owner sudah dua kali memutuskan hal yang sama pada pertanyaan identik (PR-027c dan PR-028b), dan sumber yang harus ditinjau di sini hanya 187 baris.

### Batas yang jujur

* **NVDA sampling belum dilakukan** — kini menumpuk untuk LIMA komponen (Dialog, Toast, Kerangka, Tab, Kartu). Ini utang aksesibilitas terbesar Phase 03 yang masih terbuka, dan seluruh klaim "diumumkan" di ketiga log PR-028 bersandar pada struktur ARIA, bukan pendengaran alat sungguhan.
* Pelimpahan fokus dari wadah tablist ke tab aktif diuji di jsdom; perilakunya di peramban sungguhan — termasuk `style="outline:none"` yang Radix pasang pada wadah itu — belum dilihat. PR-031b.
* Kontras garis aktif (`gray-900` di atas putih) dan piksel target sentuh tidak terukur di jsdom — PR-031b.
* `Kartu` sengaja tidak memilihkan elemen semantik (`<article>`, `<li>`). Kartu adalah wadah visual; semantiknya datang dari tempat ia dipasang. Bila kelak kartu lowongan perlu menjadi butir daftar, pembungkusnya milik PR fitur.

### Out of scope

* Komponen domain (kartu lowongan, kartu perusahaan) — dibangun DI ATAS `Kartu` di PR fitur, bukan ditambahkan ke `packages/ui`.
* Adopsi di `apps/web` — konsisten dengan PR-028a dan PR-028b.
* Varian React Native dari seluruh set ini — PR-089.

### Next steps

* **PR-029** sudah selesai lebih dulu (029a/b). Sisa Phase 03: **PR-030** (halaman login produksi-ready), **PR-031b**, **PR-032**, **PR-033**.
* Utang yang harus dijadwalkan sebelum Exit Criteria Phase 03: **NVDA sampling** untuk lima komponen PR-027/PR-028.

---

## PR-030a — Fondasi sesi & route guard

**Tanggal:** 2026-08-09 · **Branch:** `pr-030a-fondasi-sesi` · **AC ditutup:** PR-030 nomor 5

### Ringkasan

Store sesi (Zustand), klien API terangkai dengan hook refresh, pemulihan sesi saat boot, dan guard `Terlindungi`. `apps/web` kini bergantung pada `@nawasena/api-client`, `@nawasena/ui`, dan `zustand` — ketiganya masuk di PR ini.

### Di mana token BOLEH berada

Security Considerations PR-030 menulis "tidak menyimpan access token persisten". Dua tempat ditolak, dan yang kedua tidak disebut dokumen mana pun:

* **Bukan di `localStorage`.** Berbeda dari store preferensi aksesibilitas (PR-026) yang memang harus selamat dari reload. Token di sana bisa dibaca skrip mana pun yang berhasil masuk ke halaman, dan bertahan lama setelah tab ditutup. Yang menyeberangi reload adalah refresh token di cookie HttpOnly — yang justru tidak terbaca JavaScript.
* **Bukan di state reaktif.** Token hidup di variabel modul, bukan di dalam store. Tiga alasan: ia tidak pernah dirender sehingga reaktivitasnya tidak membeli apa pun; setiap pembaca reaktif adalah tempat ia bisa bocor (React DevTools, pencatat kesalahan yang men-serialisasi state); dan refresh mengganti token tiap ~15 menit, sehingga menaruhnya di state berarti merender ulang seluruh pelanggan demi nilai yang tidak ditampilkan siapa pun.

Yang mencegah keduanya menyimpang: hanya aksi store yang boleh menulis token — tidak ada setter terpisah yang diekspor. "Status keluar tetapi token masih ada" tidak punya jalan untuk terjadi.

### Keadaan ketiga yang membuat guard benar

Guard yang hanya mengenal `masuk` dan `keluar` akan membaca `keluar` pada milidetik pertama setiap kali halaman dimuat — sebelum jawaban `/auth/refresh` tiba — lalu melempar pengguna yang SEDANG login ke halaman masuk. Cacatnya tidak muncul saat mengembangkan, sebab kita jarang me-reload setelah login; ia muncul pada setiap pengguna sungguhan.

`memulihkan` karena itu adalah nilai AWAL store, bukan keadaan tambahan yang dipasang belakangan. Selama itu guard menampilkan `WilayahMemuat` (PR-028b) — adopsi nyata pertama komponen PR-028 — sehingga menunggunya diumumkan lewat teks, bukan lewat layar diam yang terbaca sebagai halaman rusak.

### `?tujuan=` adalah open redirect sampai dibuktikan bukan

Nilai `tujuan` datang dari URL, dan URL datang dari siapa saja. Alamat kiriman orang lain (`/masuk?tujuan=https://jahat.example`) mengirim pengguna ke situs asing TEPAT setelah ia berhasil masuk — yaitu saat ia paling percaya bahwa yang dilihatnya adalah aplikasi ini; halaman tiruan di seberang tinggal meminta apa pun.

Dibersihkan di **kedua sisi** (saat menulis tautan dan saat membaca query), sebab URL-nya tidak pernah kita yang membuat. Yang ditolak melampaui "harus diawali `/`":

* `//jahat.example` — protocol-relative; browser membacanya sebagai host lain meski tanpa skema. Ini bentuk yang paling sering lolos.
* `/\jahat.example` — sebagian browser memperlakukan `\` seperti `/`.

### Temuan bundel yang tidak diduga, dan terukur

`@nawasena/ui` adalah barrel yang mengekspor ulang Radix Dialog, Select, Toast, dan Tabs. Mengimpor **satu** komponen (`WilayahMemuat`) darinya membuat chunk halaman melonjak:

| | ukuran chunk | gzip | rujukan `radix` |
|---|---|---|---|
| tanpa `sideEffects` | 118,74 kB | 40,20 kB | 31 |
| dengan `sideEffects: false` | 30,17 kB | 9,70 kB | 0 |

Selisihnya ± 30 kB gzip pada **setiap** chunk yang menyentuh design system — pada aplikasi yang menargetkan jaringan lambat. Ditutup dengan `"sideEffects": false` di `packages/ui` (aman: tidak ada satu pun modul di sana yang punya efek samping — tanpa impor CSS, tanpa registrasi global), dan **dijaga test**, sebab hilangnya baris itu tidak menampakkan gejala apa pun selain halaman yang pelan. Sisa 9,70 kB sebagian besar `tailwind-merge` yang dipakai `gabungKelas`.

Pengukurannya dilakukan dengan probe yang benar-benar MERENDER guard. Probe pertama hanya menulis `void Terlindungi;` — dan dengan `sideEffects: false` impor yang tak terpakai itu dibuang seluruhnya, sehingga angkanya membuktikan hal yang salah.

### Uji mutasi

Sepuluh mutasi ditanam, **sepuluh tertangkap** — dua di antaranya baru setelah diperbaiki:

| # | Mutasi | Merah |
|---|--------|-------|
| M1 | Loloskan `//host` dan `/\host` | 4 |
| M2 | Hapus syarat "diawali `/`" | 5 |
| M3 | `bacaTujuan` tidak membersihkan | 1 |
| M4 | Guard perlakukan `memulihkan` seperti `keluar` | 6 |
| M5 | Hapus `replace` pada `Navigate` | 1 |
| M6 | Guard abaikan tujuan (selalu `/masuk` polos) | 2 |
| M7 | Token ikut masuk ke state reaktif | 1 |
| M8 | `keluar` tidak membersihkan token | 1 |
| M9 | Status awal `keluar`, bukan `memulihkan` | 1 (setelah test diperbaiki) |
| M10 | Hapus `sideEffects` dari `packages/ui` | 1 |

### Dua kesalahan sendiri, keduanya tentang penjaga yang berbohong

* **M1 mula-mula dilaporkan LOLOS — padahal mutasinya tidak pernah terpasang.** Pola `perl` saya tidak cocok karena escape backslash, jadi berkasnya tidak berubah dan test-nya wajar saja hijau. Sesaat saya nyaris mencatat lubang keamanan yang sebenarnya tidak ada. Pelajarannya berlaku umum: **uji mutasi yang tidak memverifikasi bahwa mutasinya benar-benar terpasang adalah penjaga hampa untuk penjaga.** Sejak temuan ini, tiap mutasi memeriksa berkasnya berubah lebih dulu dan berhenti bila tidak.
* **M9 menangkap test hampa yang saya tulis sendiri.** Test "dimulai dari `memulihkan`" memanggil `setState({status: "memulihkan"})` lalu memeriksa hasilnya — yang hanya membuktikan `setState` bekerja, dan tetap hijau meski nilai awalnya diubah jadi `keluar`. Nilai awal itu justru satu-satunya hal yang membuat guard benar. Diperbaiki dengan `vi.resetModules()` + impor ulang, sehingga yang dibaca adalah store yang belum disentuh siapa pun.

### Gate

`pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (web **187** test, dari 172; total repo 1.154). Build produksi hijau.

Bundel JS awal 325,20 → **328,20 kB** (gzip 100,23 → 101,30 kB) — tambahan `@nawasena/api-client` + `zustand` + store sesi, yang kini benar-benar terjangkau dari entry lewat `Providers`. Budget: **98,9 KB dari 200 KB**, sisa 101,1 KB. `@nawasena/ui` belum ikut masuk: guard-nya belum dipakai route mana pun.

**± 860 LOC** (472 test, 311 sumber, 78 sambungan; lock file tidak dihitung) — di atas target <500 dan di atas perkiraan ≈480. Pemecahan lebih lanjut tidak ditempuh: test guard membutuhkan tumpukan provider yang dirakit klien API, sehingga memisahkan keduanya menghasilkan PR yang test-nya tidak bisa berjalan bermakna.

### Perubahan yang menyentuh test lain

`apps/web/__tests__/setup.ts` kini (a) menolak `fetch` sebagai bawaan dan (b) mengembalikan status sesi sesudah tiap test. Keduanya konsekuensi langsung dari `Providers` yang memulihkan sesi saat dipasang: tanpa (a) setiap test yang merendernya benar-benar mencoba menghubungi localhost — lambat, dan hasilnya berbeda antara laptop dan CI; tanpa (b) status yang ditulis satu test terbawa ke test berikutnya.

### Batas yang jujur

* **AC 1 & 2 tidak tersentuh di sini dan memang tidak bisa** — keduanya menuntut stack dev berjalan dan kredensial Google. Dicatat sebagai utang atas keputusan owner (2026-08-09).
* **Pemulihan sesi belum pernah dijalankan terhadap server sungguhan.** Yang diuji adalah perakitannya (`fetch` palsu): jalur cookie HttpOnly, `SameSite`, dan CORS hanya bisa dibuktikan di peramban terhadap API nyata.
* **Satu permintaan yang gagal bagi pengunjung yang belum pernah masuk.** Biaya sadar dari pemulihan saat boot. Alternatifnya menyimpan penanda "pernah masuk" di localStorage — memindahkan sebagian keadaan sesi ke tempat yang justru ingin dihindari.
* `Terlindungi` belum dipakai route mana pun: belum ada halaman yang perlu dilindungi. Konsisten dengan PR-028 yang juga tidak menyambungkan komponennya ke halaman.
* NVDA sampling masih menumpuk (lima komponen PR-027/PR-028, kini plus guard).

### Out of scope

* **Identitas pengguna (`userId`) di store — DITUNDA DENGAN SENGAJA.** `POST /auth/refresh` hanya mengembalikan token, tanpa identitas; sesi yang dipulihkan dari cookie tahu bahwa pengguna masuk, tetapi tidak tahu siapa. Menjawabnya berarti memilih antara membaca klaim `sub` dari JWT tanpa memverifikasinya, atau satu permintaan tambahan ke `/users/me` — dan pilihan itu bergantung pada apa yang halaman pertama benar-benar butuhkan. AC 5 hanya perlu `status`. Ia lahir bersama halaman pertama yang menampilkan identitas (PR-033).
* Halaman login OTP (PR-030b); Google PKCE (PR-030c); onboarding (PR-035); settings (PR-033).

### Next steps

* **PR-030b** — Login OTP. AC 1, 4.

---

## PR-030b — Login OTP

**Tanggal:** 2026-08-09 · **Branch:** `pr-030b-login-otp` · **AC ditutup:** PR-030 nomor 4 (nomor 1 & 3 terbangun, sisa verifikasi manual)

### Ringkasan

Halaman `/masuk` dua langkah (nomor → kode), katalog i18n `auth`, normalisasi nomor HP, dan pemetaan kegagalan API menjadi kalimat yang dibacakan. Adopsi nyata pertama `KolomForm`, `Masukan`, dan `Tombol` (PR-027) di halaman produksi.

### Dua langkah dalam SATU halaman

Bukan dua alamat. Pindah halaman di tengah alur berarti fokus keyboard kembali ke awal dokumen dan pengguna screen reader mendengar seluruh kerangka halaman diulang sebelum sampai ke kotak isian. Di sini yang berganti hanya isi form-nya, dan fokus dipindahkan tepat ke kotak yang harus diisi berikutnya — sebab tombol "Kirim kode" yang dilepas dari DOM membawa fokus bersamanya.

### Nomor yang ditulis manusia bukan E.164

`phoneNumberSchema` menuntut `+62` diikuti 8–13 angka. Yang ditulis orang Indonesia hampir selalu `0812…`, kadang berspasi atau bertanda hubung, kadang `62812…` karena disalin dari kontak WhatsApp.

Menolak semua bentuk itu secara teknis benar dan secara produk salah. Pengguna yang ditolak di kotak PERTAMA tidak menyalahkan formatnya — ia menyimpulkan aplikasinya tidak bisa dipakai, lalu pergi. Dan yang paling dirugikan justru yang paling sulit mengetik ulang: persona Sari (motorik terbatas) dan pengguna yang mengetik lewat suara.

Normalisasinya memvalidasi dengan **skema yang sama** dengan server, bukan regex kedua. Aturan panjang yang ditulis dua kali adalah aturan yang akan berbeda — dan bedanya muncul sebagai form yang menerima isian lalu gagal tanpa penjelasan.

### Galat: server sudah berbahasa Indonesia

`ERROR_CATALOG` (SDD §11) memuat `message` + `hint` yang memang ditulis untuk dibacakan apa adanya. Jadi pemetaan di klien BUKAN penerjemah — ia hanya menambah yang tidak bisa datang dari server: varian `id-simple`.

Karena itu pemetaannya sengaja **pendek**: hanya lima kode yang paling sering ditemui pengguna. Sisanya memakai pesan server, lengkap dengan `hint`-nya — sebab di sanalah "apa yang harus saya lakukan" berada, bagian yang paling berguna dan paling sering dibuang saat hanya `message` yang ditampilkan. Memetakan semua kode berarti menyalin katalog server ke klien: dua daftar yang akan menyimpang, dan yang menyimpang di sini muncul sebagai pesan salah pada saat pengguna paling butuh pesan yang benar.

Tidak pernah mengembalikan string kosong. Kolom bermasalah tanpa pesan menampilkan garis merah tanpa keterangan — yang melihatnya tahu ada yang salah tetapi tidak tahu apa, dan pengguna screen reader tidak tahu apa pun.

### Hitung mundur yang tidak menenggelamkan

Angka detik "kirim ulang" sengaja **tidak** berada di dalam live region: region yang isinya berubah tiap detik membuat screen reader membacakan hitungan mundur tanpa henti. Angkanya hidup di label tombol (yang juga nonaktif selama hitungan), dan live region hanya menerima SATU kalimat saat hitungannya habis.

### Uji mutasi

Dua belas mutasi ditanam, **dua belas tertangkap**:

| # | Mutasi | Merah |
|---|--------|-------|
| M1 | Nomor dikirim mentah tanpa normalisasi | 22 |
| M2 | Hapus `autocomplete="one-time-code"` | 1 |
| M3 | Fokus tidak kembali ke kotak kode setelah galat | 1 |
| M4 | Fokus tidak pindah saat langkah berganti | 1 |
| M5 | `tujuan` dipakai mentah (open redirect) | 1 |
| M6 | Hitungan detik masuk ke live region | 1 |
| M7 | Normalisasi lewati validasi skema | 3 |
| M8 | Tolak bentuk `0` di depan | 6 |
| M9 | Tidak membuang spasi/tanda hubung | 4 |
| M10 | Galat tak dikenal → string kosong | 1 |
| M11 | `hint` dibuang dari pesan | 1 |
| M12 | Galat non-`ApiError` diteruskan mentah | 1 |

M8 mula-mula **gagal terpasang** (escaping backtick di template literal). Penjaga "berhenti bila berkasnya tidak berubah" — yang dipasang setelah pelajaran PR-030a — menangkapnya dan mencegah laporan "lolos" yang palsu. Diulang dengan sasaran lain, lalu merah sebagaimana mestinya.

### Satu bug yang ditemukan uji, bukan review

**Fokus tidak pernah kembali ke kotak kode setelah galat.** Versi pertama memanggil `kotakKode.current?.focus()` di dalam blok `catch` — dan di sana kotaknya masih `disabled`, sebab `sibuk` baru turun di `finally` dan pembaruan state React tidak menyentuh DOM di tengah handler. **Elemen yang sedang nonaktif menolak fokus tanpa bersuara**, jadi kodenya terlihat benar dan gagal dalam diam: pengguna keyboard tetap terdampar setelah salah memasukkan kode. Diperbaiki menjadi efek yang menunggu kotaknya hidup lagi.

Juga ditemukan saat menulis: komentar kepala berkas sempat menjanjikan "fokus dipindahkan tepat ke tempat yang harus diisi berikutnya" sementara kodenya belum melakukannya sama sekali. Klaim yang hanya hidup di komentar bukan klaim yang dijaga — sama seperti temuan PR-027c.

### Kebersihan katalog

`shell.masuk.judul` dan `shell.masuk.sedangDisiapkan` (kerangka PR-025) **dihapus**: keduanya sudah tidak dipakai siapa pun. Kunci mati yang dibiarkan menumpuk membuat katalog berhenti bisa dipercaya sebagai daftar teks yang benar-benar tampil. Penjaga "daftar pengecualian tidak menyimpan entri basi" ikut dibersihkan.

Sembilan entri `auth` yang varian `id-simple`-nya memang identik didaftarkan beserta alasannya — sebagian besar LABEL dua-tiga kata sehari-hari. Mengarang perbedaan pada label hanya membuat kedua varian tidak konsisten: pengguna yang berpindah mode akan menyangka tombolnya berubah.

### Gate

`pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (web **228** test, dari 187; total repo 1.195). Build produksi hijau.

Chunk `/masuk` **34,50 kB (11,35 kB gzip)** — lazy, tidak diunduh di awal, dan **nol rujukan Radix** berkat `sideEffects: false` dari PR-030a. Bundel JS awal 328,20 → **330,83 kB** (gzip 101,30 → 101,98 kB). Budget **99,6 dari 200 KB**, sisa 100,4 KB.

**± 920 LOC** (455 test, 430 sumber, 26 sambungan) — di atas target <500 dan di atas perkiraan ≈540.

### Batas yang jujur

* **AC 1 belum benar-benar end-to-end.** Alurnya terbangun dan teruji terhadap klien palsu; menjalankannya terhadap API dev dengan sender mock adalah utang tercatat (keputusan owner 2026-08-09).
* **Anti-enumeration belum diperiksa dari sisi klien.** Security Considerations PR-030 menuntut pesan generik untuk nomor tak terdaftar. Halaman ini menampilkan apa pun yang dikirim server, jadi jaminannya ada di API — dan belum ada test lintas-lapis yang membuktikan server memang tidak membedakan keduanya.
* **Hitung mundur belum diuji melewati waktu sungguhan.** Yang diuji keadaan awalnya (tombol mati, angka di luar live region) dan pengumuman saat habis; jalannya interval per detik tidak dipercepat dengan fake timer.
* NVDA sampling masih menumpuk — kini termasuk halaman masuk, yaitu tempat klaim "diumumkan" paling penting.

### Out of scope

* Tombol dan callback Google (PR-030c) — termasuk `googleAuth` di `@nawasena/api-client`.
* Meneruskan header `Retry-After` di `@nawasena/api-client` (lihat Risks).
* Onboarding pasca-masuk (PR-035); settings (PR-033).

### Next steps

* **PR-030c** — Login Google (PKCE). AC 2, sisa AC 3.

---

## PR-030c — Login Google (PKCE)

**Tanggal:** 2026-08-09 · **Branch:** `pr-030c-login-google` · **AC ditutup:** PR-030 nomor 3 (nomor 2 terbangun, sisa verifikasi manual)

### Ringkasan

PKCE S256, `state` anti-login-CSRF, titipan sekali pakai, halaman kembalian `/masuk/google`, tombol di halaman masuk, dan `googleAuth` di `@nawasena/api-client`. **PR-030 tuntas kecuali dua verifikasi manual.**

### Pengalihan membuang seluruh memori halaman

Itu yang membuat alur ini rumit — bukan OAuth-nya. Antara menekan tombol dan kembali dari Google, aplikasinya dimuat ulang dari nol: state React hilang, dan yang tersisa hanya URL kembalian plus apa pun yang sempat dititipkan ke penyimpanan peramban.

Ada **tiga** hal yang harus selamat menyeberang, dan melupakan salah satunya tidak menggagalkan alurnya secara mencolok — ia hanya membuatnya salah:

* `verifier` — tanpa ini penukaran ditolak;
* `state` — tanpa ini alurnya bisa dibajak;
* `tujuan` — tanpa ini pengguna mendarat di beranda alih-alih halaman yang tadi ingin ia buka. Ini yang paling mudah terlupakan: `?tujuan=` yang tadi ada di URL sudah tidak ada di mana pun setelah kembali dari Google, sebab query di alamat kembalian milik Google.

Dititipkan di `sessionStorage`, bukan `localStorage`: isinya hanya berguna selama satu perjalanan, dan `localStorage` bertahan berbulan-bulan — meninggalkan verifier menganggur di perangkat bersama.

### `state`: satu-satunya yang menahan pembajakan

Tanpa pemeriksaan `state`, penyerang bisa memancing korban membuka alamat kembalian yang membawa authorization code **milik penyerang**. Korban tidak melihat kejanggalan apa pun: ia mendarat di aplikasi yang benar dan tampak sudah masuk — tetapi ke akun penyerang. Segala yang ia tulis sesudah itu (CV, riwayat kerja, nomor HP) masuk ke akun yang bukan miliknya, dan penyerang tinggal membukanya.

Di platform ini akibatnya adalah kebocoran data pribadi yang paling sensitif — data disabilitas dan kebutuhan akomodasi. Karena itu kembalian yang `state`-nya tidak cocok **tidak pernah ditukarkan sama sekali**, bukan sekadar ditandai.

Titipannya dihapus lebih dulu, apa pun hasilnya: alamat kembalian bisa dibuka ulang (tombol kembali, riwayat, tab dipulihkan), dan verifier yang masih tersimpan berarti percobaan kedua memakai rahasia yang sama.

### Tombol yang tidak ada lebih baik daripada tombol yang pasti gagal

`VITE_GOOGLE_CLIENT_ID` kosong → tombol Google **tidak ditampilkan**. Menampilkannya berarti pengguna menekan, gagal, mengira dirinya yang salah, mencoba berulang, lalu menyerah — padahal jalur OTP di atasnya terbuka penuh. Sikap yang sama dipakai API, yang menjawab 503 berikut saran jalan masuk lain ketimbang berpura-pura endpoint-nya tidak ada.

### Bug NYATA yang ditemukan test, bukan review

**Pemulihan sesi mencabut sesi yang baru saja terbentuk.**

`pulihkanSesi` (PR-030a) berjalan sejak aplikasi dipasang. Di `/masuk/google`, penukaran code dimulai segera setelah halaman dimuat — jadi keduanya berlomba. Pemulihan itu **wajar gagal**: pengunjung yang baru mau masuk memang belum punya cookie. Dan saat gagal ia memanggil `keluar()` — sesudah penukaran berhasil.

Akibatnya: pengguna berhasil masuk lewat Google, lalu terlempar keluar sepersekian detik kemudian, tanpa satu pun pesan kesalahan. Di produksi ini akan terbaca sebagai "login Google tidak pernah berhasil", dan sebabnya ada di berkas yang sama sekali lain.

Ditutup dengan penjaga di `pulihkanSesi`: hasilnya **hanya berlaku bila status masih `memulihkan`**. Bila sesuatu yang lain sudah memutuskan, pemulihan tidak menyentuh apa pun — baik saat gagal maupun saat berhasil terlambat (token pulih yang lebih tua tidak boleh menimpa token yang lebih baru). Keduanya dijaga test regresi di `klien-api.test.ts`.

### Uji mutasi

Dua belas mutasi ditanam, **sebelas tertangkap, satu tidak bisa dibunuh di lingkungan ini**:

| # | Mutasi | Merah |
|---|--------|-------|
| M1 | `state` tidak diperiksa (login-CSRF) | 2 + 2 |
| M2 | Titipan tidak dihapus (bisa dipakai ulang) | 2 |
| M3 | `tujuan` tidak dibersihkan saat dibaca | 1 |
| M4 | `tujuan` tidak dibersihkan saat ditulis | 1 |
| M5 | Metode PKCE jadi `plain` | 1 |
| M6 | Challenge = verifier apa adanya | 2 |
| M7 | Acak diganti nilai tetap | 3 |
| M8 | Hapus penjaga efek ganda StrictMode | **0 — lihat di bawah** |
| M9 | Abaikan parameter `error` (pembatalan dianggap sukses) | 1 |
| M10 | `tujuan` diabaikan, selalu ke beranda | 1 |
| M11 | Pemulihan sesi menimpa keputusan lain (race) | 2 |
| M12 | Tombol Google muncul walau clientId kosong | 1 |

**M8 tidak bisa dibunuh, dan itu disebut apa adanya.** Penjaga `sudahJalan` menahan efek ganda React 18 StrictMode. Efek ganda itu **tidak bisa direproduksi di jsdom/vitest ini**: dibungkus `<StrictMode>` sekalipun, efeknya tetap berjalan sekali — dibuktikan lewat probe (jumlah penukaran tetap 1, tidak ada alert). Jadi penjaga itu bertahan atas dasar alasan, bukan bukti.

Versi pertama test saya menuliskan judul "meski efek berjalan dua kali" tanpa pernah membuatnya berjalan dua kali — test hampa yang tidak bisa gagal. Perkakas StrictMode-nya dibuang dan judulnya dikoreksi menjadi yang benar-benar dibuktikan; batasnya ditulis di dalam test itu sendiri.

Yang sesungguhnya menahan penukaran ganda adalah **titipan sekali pakai**, dan itu terjaga (M2).

### Gate

`pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (web **272** test, dari 228; total repo 1.239). Build produksi hijau.

Pemecahan chunk berubah bentuk: `@nawasena/ui` kini dipakai dua route lazy, jadi Rollup mengeluarkannya menjadi chunk BERSAMA (`google-*.js`, 29,99 kB) yang **tetap di luar unduhan awal** — `index.html` hanya merujuk `index-*.js`. `masuk` menyusut 34,50 → 5,13 kB, `masuk-google` 2,05 kB. Bundel awal 330,83 → **333,41 kB** (gzip 101,98 → 102,77 kB). Budget **100,4 dari 200 KB**, sisa 99,6 KB.

**± 1.040 LOC** (557 test, 298 sumber, 188 sambungan) — di atas target <500 dan di atas perkiraan ≈420.

### Batas yang jujur

* **AC 2 belum benar-benar end-to-end.** Alur PKCE-nya terbangun dan teruji — termasuk terhadap vektor resmi RFC 7636 — tetapi belum pernah berhadapan dengan Google sungguhan. Yang hanya bisa dibuktikan di sana: apakah `redirect_uri` cocok dengan yang terdaftar di Cloud Console, dan apakah scope-nya cukup.
* **Penjaga efek ganda tidak terjaga test** (M8, lihat di atas).
* **`crypto.subtle` hanya ada di konteks aman.** Di HTTP non-localhost, penyiapan PKCE gagal; ditangkap dan dijelaskan, dan jalur OTP tetap terbuka — tetapi kegagalan itu belum pernah dilihat di peramban sungguhan.
* NVDA sampling masih menumpuk — kini termasuk halaman kembalian, yang seluruh isinya adalah pengumuman.

### Out of scope

* Meneruskan header `Retry-After` di `@nawasena/api-client` (dicatat sejak PR-030b).
* `googleReauth` untuk konfirmasi hapus akun (PR-021 sisi klien).
* Onboarding pasca-masuk (PR-035); settings (PR-033).

### Next steps

* Sisa Phase 03: **PR-031b**, **PR-032**, **PR-033**.
* Utang yang harus dijadwalkan sebelum Exit Criteria: **NVDA sampling** (lima komponen PR-027/028 + tiga halaman auth), **verifikasi OTP terhadap API dev**, dan **verifikasi Google dengan akun uji**.

---

## PR-031b — Gerbang a11y di peramban (axe + Lighthouse)

**Tanggal:** 2026-08-09 · **Branch:** `pr-031b-gate-a11y` · **AC ditutup:** PR-031 nomor 2, 3, 5 — **PR-031 tuntas**

### Ringkasan

Registry halaman, axe atas hasil build di Chromium sungguhan, Lighthouse CI (a11y = 100, perf ≥ 80), dan job `a11y` di CI yang akhirnya menyala. Lapis ketiga dari tiga.

### Utang `TAK_BISA_DI_JSDOM` DIBAYAR, bukan dipindahkan

Sejak PR-031a, tiga aturan tercatat sebagai tidak bisa diperiksa tanpa peramban: `color-contrast`, `target-size`, `scrollable-region-focusable`. Keduanya yang pertama kini **LULUS** di halaman nyata — dan test-nya menuntut `passes`, bukan sekadar "dijalankan".

Bedanya penting: aturan yang berakhir `incomplete` (axe tidak bisa memutuskan) tidak menjaga apa pun, dan menghitungnya sebagai keberhasilan persis mengulang kesalahan yang dihindari lapis kedua. Inilah yang akhirnya mengukur klaim PR-027 — kontras 17,4:1 dan target sentuh ≥ 44 px — dalam warna dan piksel, bukan dalam nama kelas.

`scrollable-region-focusable` berstatus `inapplicable`: belum ada wilayah yang menggulir di halaman mana pun. Ia berjalan tanpa pernah benar-benar diuji — itu keadaan, bukan cakupan, dan disebut apa adanya.

### Tiga keputusan yang menentukan bentuk gerbang ini

**Menguji HASIL BUILD, bukan server dev.** Server dev menyajikan CSS lewat injeksi JavaScript dan tidak menjalankan pemangkasan kelas Tailwind. Kelas yang hilang dari produksi karena tidak ikut terpindai (`@source`) justru tampak baik-baik saja di sana — dan itu persis jenis cacat yang gerbang ini harus tangkap. Kekhawatiran itu bukan hipotetis: seluruh `packages/ui` bergantung pada satu baris `@source` di `gaya.css`.

**Jaringan dipalsukan.** Gerbang ini memeriksa tampilan, bukan integrasi. Menggantungkannya pada API yang berjalan berarti pipeline butuh Postgres + Redis + worker hanya untuk memeriksa kontras warna; kegagalan jaringan terbaca sebagai pelanggaran aksesibilitas; dan keadaan halaman ikut berubah mengikuti isi basis data. **Gerbang yang kadang merah karena sebab lain akan diabaikan orang, dan gerbang yang diabaikan tidak menjaga apa pun.**

Ini ditemukan saat menjalankannya: halaman "masuk — langkah kode" gagal karena `vite preview` tidak punya `/api/v1`. Jawaban yang benar bukan membuang halaman itu dari registry — melainkan memalsukan jaringannya, sehingga keadaan yang paling banyak memuat pengumuman galat justru ikut dijaga.

**Job terpisah yang berjalan paralel.** Bukan langkah tambahan di `checks`: peramban tidak ada gunanya bagi lint/typecheck/unit, dan job paralel membuat tambahan durasi pipeline mendekati nol.

### Registry: yang mudah ditambah juga mudah ditambah SALAH

Satu daftar dipakai axe DAN Lighthouse — dua daftar akan menyimpang, dan yang menyimpang berarti sebuah halaman dijaga separuh gerbang tanpa ada yang tahu separuh mana.

`registry-halaman.test.ts` berjalan di vitest (murah, tanpa peramban) dan menuntut: nama unik, jalur diawali `/`, jalur menunjuk route yang benar-benar ada, dan alasan tertulis untuk tiap pengecualian aturan. Yang paling menahan erosi adalah arah sebaliknya: **setiap route produksi wajib punya entri**, sehingga halaman baru tidak bisa lahir tanpa penjagaan. Dua test lagi memeriksa `pr.yml` — bahwa job `a11y` tidak lagi `if: false`, dan bahwa ia benar-benar menjalankan keduanya.

Yang terakhir itu menjaga bentuk kegagalan yang paling mahal: gerbang yang ditulis, disebut di dokumen, dan tidak pernah berjalan.

### Bukti bahwa gerbangnya bisa MERAH

Dua-duanya diverifikasi, bukan diasumsikan:

* **axe** — test permanen menanam teks `#eeeeee` di atas `#ffffff` lalu menuntut `color-contrast` muncul sebagai pelanggaran. Cacat itu sengaja jenis yang lolos lint DAN lolos lapis jsdom.
* **Lighthouse** — `<img>` tanpa `alt` ditanam ke `dist/index.html`, `lhci` keluar status 1: `categories.accessibility failure for minScore assertion, expected: >=1`. Verifikasi sekali jalan, tidak dijadikan test permanen — menjalankan Lighthouse dua kali menggandakan bagian termahal pipeline demi bukti yang tidak berubah.

Skor sekarang: **a11y 100, performance 100**, best-practices 96, SEO 100.

### Uji mutasi

Tujuh mutasi ditanam, **tujuh tertangkap**:

| # | Mutasi | Merah |
|---|--------|-------|
| M1 | Seluruh entri `/masuk` dibuang dari registry | 1 |
| M2 | Dua entri bernama sama | 1 |
| M3 | Jalur tidak diawali `/` | 2 |
| M4 | Registry dikosongkan | 2 |
| M5 | Pengecualian aturan tanpa alasan | 1 |
| M6 | Job `a11y` dimatikan lagi (`if: false`) | 1 |
| M7 | Job `a11y` tidak menjalankan Lighthouse | 1 |

M1 mula-mula tampak lolos — tetapi mutasi pertamanya hanya membuang SATU dari dua entri yang menunjuk `/masuk`, sehingga route-nya masih tercakup. Penjaganya benar; mutasinya yang tidak bermakna. Diulang dengan membuang keduanya, lalu merah sebagaimana mestinya.

### Gate

`pnpm lint` 9/9 · `pnpm typecheck` 9/9 · `pnpm test` 9/9 (web **280** test, dari 272; total repo 1.247). Gerbang lapis ketiga: **7 test Playwright hijau** atas 5 halaman terdaftar.

Durasi terukur lokal: build 3 s + axe 10 s + Lighthouse 41 s = **54 s**. Di CI ditambah `pnpm install` dan unduhan chromium, tetapi job-nya paralel dengan `lint-typecheck-test` (± 2 m 10 s) — tambahan durasi pipeline mendekati nol.

**476 LOC** (386 berkas baru, 90 sambungan; lock file tidak dihitung) — **di bawah target <500**, pertama kali sejak PR-028a.

### Koreksi atribusi utang

Log PR-027/PR-028 menunda beberapa hal ke "PR-031b" yang sebenarnya **bukan** pekerjaan gerbang ini, dan tetap terbuka sesudahnya:

* perilaku pada zoom 200 % (`max-h` Dialog, penempatan popper Pilihan);
* typeahead, penguncian scroll, dan `aria-hidden` pada sisa halaman saat Dialog terbuka;
* pintasan F8 Toast, jeda hitung mundur saat hover/fokus, gerakan geser.

Semuanya butuh e2e per **komponen**, bukan pemindaian aturan per halaman — dan wajarnya lahir bersama halaman fitur yang benar-benar memakai komponen itu. Menuliskannya sebagai "PR-031b" membuatnya tampak terjadwal padahal tidak.

### Batas yang jujur

* **axe ≠ WCAG penuh.** Aturan otomatis menangkap sekitar sepertiga kriteria; sisanya menuntut penilaian manusia. Audit manual tetap gerbang rilis (PR-110), dan **NVDA sampling masih menumpuk** — kini lima komponen PR-027/028 plus tiga halaman auth.
* **Satu peramban.** Hanya Chromium. Perbedaan perilaku screen reader di Firefox/Safari tidak terjaga.
* **Satu ukuran layar.** `Desktop Chrome`. Tata letak sempit dan zoom besar belum diperiksa — padahal keduanya jalur yang paling sering merusak target sentuh.
* **Lighthouse a11y 100 bukan berarti aksesibel.** Skornya tersusun dari aturan otomatis yang sama; ia menahan kemunduran, bukan membuktikan kelayakan.
* **`chromeFlags: --no-sandbox`** dipakai supaya berjalan di runner. Wajar untuk CI, tetapi disebut agar tidak tersalin ke tempat lain tanpa berpikir.

### Out of scope

* Slot `e2e` (alur pengguna end-to-end) sengaja **tetap mati**. Ia bukan bagian AC PR-031, dan menyalakannya tanpa isi hanya menambah check hijau yang tidak menguji apa pun.
* Audit manusia (PR-110).

### Next steps

* Sisa Phase 03: **PR-032** (landing + 404 + empty state), **PR-033** (settings + Data Saya).
* Setiap halaman yang lahir di keduanya WAJIB menambah entri di `e2e/halaman.ts` — kini ditegakkan test, bukan ingatan.

---

## PR-032a — Landing, landmark/skip-link final & gerbang Lighthouse 3G

**Tanggal:** 2026-08-09
**Branch:** `pr-032a-landing-skip-link` → `phase-03-web-platform-base`
**AC tertutup:** PR-032 nomor **1, 2, 3**; nomor 5 tertutup untuk landing.

### Ringkasan

Halaman publik pertama Nawasena berhenti menjadi penampung sementara. Bersamanya, dua hal yang selama ini disalin per halaman dipindahkan ke kerangka — landmark `<main>` dan tautan lompat ke konten — dan satu gerbang baru menyala: Lighthouse pada throttling 3G.

### Pemecahan PR (persetujuan owner 2026-08-09)

Scope utuh PR-032 terukur ≈ 700–750 LOC, di atas target <500. Diusulkan **sebelum** implementasi, bukan sesudah. Owner memilih pecah dua:

* **032a** (ini) — landing, landmark/skip-link, meta SEO, gerbang 3G.
* **032b** — 404 berjalan pulang, pola empty state.

Batas pemecahannya ditaruh pada **makna**: 032a menutup AC 1–3 utuh, 032b menutup AC 4 dan sisa AC 5. Tidak ada AC yang terbelah di antara keduanya.

### Landmark: dipindahkan ke kerangka, bukan diingat per halaman

Sampai PR ini, setiap halaman menulis `<main>`-nya sendiri. Itu bekerja selama halamannya tiga. Yang tidak bekerja adalah halaman keempat: `<main>` yang harus diingat setiap halaman adalah `<main>` yang suatu saat terlupakan di salah satunya — atau, lebih sering, **ditulis dua kali** ketika sebuah halaman dibungkus halaman lain.

Landmark utama kini milik `TataLetak` seorang. Halaman mengembalikan `<div>`. Penjaganya dua arah: jumlah `<main>` harus tepat satu di tiap halaman, DAN tidak boleh ada `<main>` di dalam `<main>`.

Satu akibat yang tidak terduga dan berguna: gerbang axe di jsdom langsung merah pada `masuk` dan `masuk/google`, dengan aturan `region` ("konten di luar landmark"). Halaman-halaman itu diuji **terlepas dari kerangkanya**, jadi harness-nya harus ikut menyediakan `<main>` — dan itu memaksa harness memodelkan produksi alih-alih memodelkan dirinya sendiri.

### Tautan lompat: yang diuji jsdom bukan yang penting

Seluruh guna tautan lompat ada pada satu hal yang **tidak bisa diperiksa jsdom**: menekannya benar-benar memindahkan FOKUS ke konten utama. jsdom tidak menjalankan navigasi fragmen sama sekali. Test jsdom karena itu hanya sanggup memeriksa syarat-syaratnya — tautannya ada, urutannya pertama, sasarannya ada dan `tabindex="-1"` — dan **tautan lompat yang tidak melompat lolos pemeriksaan itu dengan mulus.**

Karena itu ia diuji di peramban: `e2e/lompat-ke-konten.spec.ts`, berjalan atas SETIAP halaman berkerangka dari registry yang sama dengan gerbang axe. Tab sekali → tautannya yang terfokus; ia **terlihat** (tinggi > 20 px, sebab tautan yang tetap 1×1 piksel saat difokus tidak menolong pengguna keyboard awas); Enter → `#konten-utama` terfokus.

`tabindex="-1"` pada sasaran bukan hiasan: tanpanya sebagian peramban hanya menggulir tanpa memindahkan fokus, sehingga Tab berikutnya melanjutkan dari tautan lompat — pengguna melihat isi halaman, tetapi fokusnya masih di atas.

### Gerbang 3G: berkas kedua, bukan penyetelan yang lama

AC 1 menyebut throttling 3G secara khusus. Dua jebakan dihindari:

1. **Mengganti `lighthouserc.json`** akan menukar satu jaminan dengan jaminan lain, bukan menambah. Yang lama (desktop) yang menjaga skor a11y 100 sejak PR-031b. Jadi lahir `lighthouserc-3g.json` berdampingan.
2. **Memakai preset `mobile` bawaan Lighthouse** akan membuat CI menyebut "3G" sambil mensimulasikan *Slow 4G* (150 ms RTT, 1.638 kbps). Angkanya ditulis eksplisit: **RTT 300 ms, 700 kbps, CPU 4×** — profil *Regular 3G*.

Skor aksesibilitas TIDAK diturunkan di konfigurasi ponsel: viewport sempit justru tempat target sentuh paling mudah gagal.

Terukur lokal (3 run, konsisten): **perf 82, a11y 100** — FCP 3,0 s, LCP 3,9 s, TBT 0 ms, Speed Index 3,0 s. Desktop tetap **perf 100, a11y 100**.

### Landing tanpa gambar

Bukan kekurangan, melainkan konsekuensi AC 1 yang diambil sadar. Pada 3G, satu foto hero adalah selisih antara halaman yang terbaca di detik ketiga dan halaman yang masih kosong di detik kesepuluh — dan pengguna yang dituju produk ini justru yang paling mungkin berada di jaringan seperti itu. Ilustrasi boleh masuk kelak, tetapi harus membayar tempatnya sendiri di anggaran.

Keputusan bentuk lain:

* **`<h1>` bukan nama merek.** "Nawasena" tidak menjawab "halaman ini soal apa" bagi orang yang baru pertama mendengarnya — dan pengguna screen reader yang melompat ke `<h1>` mendarat tepat di sana.
* **CTA berupa `<Link>`, bukan tombol.** Hanya tautan yang bisa dibuka di tab baru, disalin alamatnya, dan ditelusuri perayap — ketiganya penting untuk halaman akuisisi. Dijaga test yang memeriksa PERAN-nya.
* **Nilai produk sebagai `<ul>`**, bukan tiga `<div>` bersebelahan: screen reader mengumumkan "daftar, 3 item" dan memberi nomor tiap butir.
* **Nilai produk sebagai DATA**, bukan tiga blok JSX yang disalin — salinan menyimpang, dan yang ketiga biasanya yang lupa tingkat headingnya.

### Judul dokumen: SEO yang sebenarnya soal aksesibilitas

`useJudulHalaman` menyetel `document.title` per halaman. Pada aplikasi satu-halaman, judul yang tidak ikut berubah membuat dua hal gagal sekaligus: screen reader tidak mengumumkan bahwa perpindahan berhasil (pengguna menekan tautannya lagi), dan sepuluh entri riwayat bernama "Nawasena" tidak bisa dibedakan.

Polanya `{halaman} · Nawasena` — nama halaman **di depan**, sebab tab yang menyempit menyisakan bagian depan, dan yang berguna di sana bukan merek yang sama di semua tab.

Meta Open Graph ditulis di dokumen, bukan disuntik JavaScript: pratinjau tautan WhatsApp/Telegram membaca HTML pertama apa adanya — dan jalur akuisisi produk ini justru berbagi tautan di grup komunitas. `og:url` dan `canonical` **sengaja belum ada**: keduanya menuntut domain produksi yang belum ditetapkan, dan canonical yang salah lebih merusak daripada tidak ada (ia menyuruh mesin pencari mengabaikan halaman yang sesungguhnya).

### Registry halaman

Tidak ada route baru di PR ini — landing mengisi `/` yang sudah terdaftar sebagai `beranda`, dan 404 sudah terdaftar sebagai `404`. Penjaga dua arah `registry-halaman.test.ts` tetap hijau tanpa perubahan. Yang **ditambah** di sana adalah penjaga baru: job `a11y` wajib menjalankan `test:lighthouse:3g` — skrip yang ada di `package.json` tetapi tidak pernah dipanggil CI hanya menjaga mesin pengembang yang ingat menjalankannya.

### Uji mutasi

* `<main>` dikembalikan ke `masuk.tsx` → `tata-letak.test.tsx` merah di dua test (jumlah `<main>`, dan `<main>` bersarang).
* `tabIndex={-1}` dilepas dari `<main>` → test jsdom merah **dan** e2e `lompat-ke-konten` merah (fokus tidak berpindah di peramban sungguhan).
* Tautan lompat dipindah ke bawah `<BannerLuring>` → test "elemen fokusabel PERTAMA" merah.
* `aria-labelledby` dilepas dari satu `<section>` → query `getByRole("region", { name })` gagal.
* Ambang perf 3G dinaikkan ke 0,9 → `lhci` keluar dengan status 1 (skor 82).

### Gate

| Gate | Hasil |
|---|---|
| `pnpm lint` | hijau (9 task) |
| `pnpm typecheck` | hijau (9 task) |
| `pnpm test` | hijau — **298 test**, 29 berkas (+18 test baru) |
| `playwright test` | hijau — 10 test (6 axe + 3 lompat-ke-konten + 1 penjaga negatif) |
| `lhci` desktop | perf **100**, a11y **100** |
| `lhci` 3G | perf **82**, a11y **100** |
| budget bundel | 101,3 KB / 200 KB gzip |

### Ukuran — dan koreksi atas perkiraan sendiri

Mendarat **825 LOC kode** (447 sumber + 378 test; dokumen 131 baris tidak dihitung) — **di atas target <500, dan di atas perkiraan ≈430** yang dipakai saat mengusulkan pemecahan kepada owner.

Selisihnya tidak datang dari scope yang melebar, melainkan dari dua hal yang tidak masuk perkiraan: (1) memindahkan `<main>` ke kerangka ternyata menyentuh **lima berkas test yang sudah ada**, sebab harness-nya merender halaman terlepas dari kerangkanya; (2) berkas konfigurasi 3G membawa 40 baris alasan tertulis — angka throttling tanpa penjelasan adalah angka yang akan "dirapikan" seseorang kelak.

Ini dilaporkan, bukan disembunyikan di balik pemecahan yang sudah disetujui: perkiraan yang meleset dan tidak disebut membuat pemecahan berikutnya diperkirakan dengan cara yang sama.

### Risiko yang ditemukan

* **Margin perf 3G tinggal 2 poin.** Landing-nya sendiri ringan (chunk 0,95 KB gzip); yang memakan anggaran adalah **bundel awal 101,3 KB gzip** — React Router, TanStack Query, Zustand, dan klien API ikut terunduh oleh pengunjung yang belum tentu masuk. Halaman publik pertama membayar biaya seluruh aplikasi. Gerbangnya sudah menyala, jadi penurunan berikutnya akan merah pada PR yang menyebabkannya; menaikkan marginnya menuntut memisahkan shell publik dari shell aplikasi — keputusan arsitektur, wajarnya bersama Phase 16.
* **Test route lazy rentan flake di mesin sibuk.** Ditemukan saat menjalankan gate, bukan di CI: `findByRole` bawaan menunggu 1 detik, dan pemuatan chunk pertama kali di bawah beban paralel melampauinya — gagal karena mesinnya, bukan karena kodenya. Dinaikkan ke 5 detik di dua helper baru. Helper lama (`app.test.tsx`, `aksesibilitas.test.tsx`) **belum** dinaikkan; keduanya punya kerentanan yang sama.

### Batas yang jujur

* **Verifikasi manual belum dilakukan** untuk AC 2 bagian "manual": NVDA sampling atas struktur heading/landmark, dan viewport ponsel sungguhan (Lighthouse mengemulasi, tidak menyentuh perangkat). Keduanya menumpuk bersama utang NVDA dari PR-027/028/030.
* **Tautan lompat diuji hanya di Chromium.** Perilaku fokus navigasi fragmen adalah persis area di mana peramban dulu berbeda — Firefox dan Safari tidak terjaga.
* **Konten landing ditulis engineer.** "Konten marketing lengkap" memang Out of Scope PR-032 (tim non-eng), tetapi yang mendarat sekarang adalah teks yang belum pernah dibaca satu pun calon pengguna. Manual Verification PR-029 ("review bahasa sederhana oleh non-engineer") berlaku penuh untuk katalog `beranda`.
* **Skor 3G diukur di satu mesin.** Runner CI berbeda; 82 bukan angka yang bisa dianggap stabil sampai ia berjalan beberapa kali di sana.

### Out of scope

* 404 berjalan pulang & pola empty state → **PR-032b**.
* Pemisahan shell publik dari shell aplikasi (margin perf) → Phase 16.
* `og:url` / `canonical` → menunggu domain produksi.

### Next steps

* **PR-032b** — perkuat `LayarKesalahan` dengan aksi per-keadaan (404 → beranda, 401/403 → masuk, umum → muat ulang), komponen empty state, penutup AC 5.
* **PR-033** — settings + Data Saya.

---

## PR-032b — 404 berjalan pulang & pola empty state

**Tanggal:** 2026-08-09
**Branch:** `pr-032b-404-empty-state` → `phase-03-web-platform-base`
**AC tertutup:** PR-032 nomor **4** dan **5** — **PR-032 tuntas.**

### Ringkasan

Layar kesalahan berhenti menawarkan satu saran untuk tiga keadaan yang berbeda, dan `packages/ui` mendapat pola keadaan kosong. Keduanya kecil; keduanya menutup jalan buntu yang tidak terlihat di layar.

### Aksi "Muat ulang halaman" pada 404 adalah saran yang PASTI gagal

Sampai PR ini, ketiga keadaan layar kesalahan — 404, 401/403, dan kegagalan tak terduga — menawarkan tombol yang sama: *Muat ulang halaman*. Untuk keadaan ketiga itu benar: keadaan aplikasi sudah terbukti rusak, dan pemuatan ulang penuh satu-satunya cara yang pasti membersihkannya.

Untuk dua keadaan pertama ia **tidak pernah bisa berhasil**. Memuat ulang alamat yang tidak ada menghasilkan halaman yang tidak ada, persis sama. Memuat ulang halaman terkunci menghasilkan halaman terkunci yang sama. Dan yang menuruti saran itu tidak menyimpulkan "sarannya salah" — ia menyimpulkan **aplikasinya rusak**, lalu pergi.

Aksinya karena itu diturunkan dari keadaan:

| Keadaan | Aksi | Alasan |
|---|---|---|
| 404 | tautan → `/` | satu-satunya yang mengubah keadaan: pergi ke alamat yang ada |
| 401 / 403 | tautan → `/masuk` | satu-satunya yang membuka kuncinya |
| tak terduga | tombol muat ulang | di sini ia memang benar |

**Tepat SATU aksi per keadaan**, dan itu dijaga test. Dua saran yang bersaing pada layar yang sudah membingungkan hanya menambah keputusan yang harus diambil pengguna — dan salah satunya selalu yang tidak akan berhasil.

Jalan pulangnya diperiksa dengan **ditempuh** (`userEvent.click` lalu menunggu heading beranda), bukan dengan membaca `href`-nya: tautan yang menunjuk route yang tidak ada tetap punya `href` yang tampak benar.

### Satu layar untuk semua 404 (keputusan owner 2026-08-09)

Alternatifnya — route `*` yang merender halaman 404 tersendiri — ditolak sebelum ditulis. Route `*` bukan satu-satunya sumber 404: loader fitur kelak akan melemparkannya juga ("lowongan ini sudah ditutup"). Halaman terpisah berarti **dua layar** yang menjawab keadaan yang sama, dan keduanya bebas menyimpang — yang satu diperbaiki, yang lain tidak, dan tidak ada yang tahu mana yang dilihat pengguna.

Akibat sampingannya bagus: `router.test.tsx` yang mengunci "catch-all melempar 404, bukan merender layar langsung" tetap berlaku apa adanya, tanpa satu baris pun diubah.

### `KeadaanKosong`: live region yang tidak perlu diputuskan pemakainya

Pertanyaan yang tampak butuh prop — "apakah keadaan kosong ini harus diumumkan?" — ternyata tidak butuh, dan jawabannya datang dari cara kerja live region itu sendiri: **isi yang sudah ada saat region dipasang tidak diumumkan**, hanya perubahan sesudahnya.

Jadi `role="status"` yang selalu menyala berperilaku persis seperti yang diinginkan di kedua kasus:

* keadaan kosong yang ada sejak halaman dibuka → **diam** (pengguna akan membacanya sendiri);
* keadaan kosong yang muncul karena pencarian tidak menemukan apa pun → **terdengar**.

Yang kedua itulah kasus yang paling sering terlupakan: pengguna menekan "Cari", tidak ada yang berubah di telinganya, dan ia menekan lagi. Sebuah prop `umumkan` hanya akan memindahkan kesempatan lupa itu ke setiap pemakai.

`status` (polite), bukan `alert` (assertive): layar kosong bukan keadaan darurat, dan menyela demi mengabarkan ketiadaan justru mengusir pengguna dari kalimat yang sedang ia dengarkan. Diuji terpisah dari keberadaan region-nya.

`aria-atomic` bawaan `status` membuat judul, penjelasan, dan aksinya dibacakan sebagai **satu kesatuan** — karena itu aksinya harus berada DI DALAM wilayah. Aksi yang diletakkan di luar tidak ikut terbaca, sehingga pengguna mendengar "Belum ada lamaran" tanpa pernah tahu ada tombol yang bisa mengubahnya. Dijaga test yang memeriksa hubungan elemennya (`toContainElement`), bukan sekadar keberadaannya.

### Dua kewajiban yang dinaikkan ke tingkat TIPE

* **`tingkatJudul` wajib** — alasan yang sama dengan `Kartu` (PR-028c): tingkat yang benar hanya diketahui di tempat pemakaian, dan komponen yang selalu menulis `<h3>` merusak kerangka halaman begitu ia dipakai di kedalaman lain.
* **`children` (penjelasan) wajib** — layar kosong tanpa penjelasan meninggalkan pengguna menebak apakah ia salah memakai aplikasinya, salah memfilter, atau memang belum punya apa-apa. Yang ketiga menenangkan; dua yang pertama membuat orang berhenti mencoba. Karena tidak ada nilai bawaan yang benar, ia diminta.

Keduanya dijaga `@ts-expect-error` yang membuat `tsc --noEmit` merah bila ikatannya dilonggarkan — **diverifikasi mutasi**: kedua prop dijadikan opsional → `TS2578: Unused '@ts-expect-error' directive` pada dua baris.

### Uji mutasi

* `tingkatJudul` dan `children` dijadikan opsional → `typecheck` merah di dua tempat (`TS2578`).
* Aksi 404 dikembalikan menjadi tombol muat ulang → **dua** test merah (jalan pulangnya hilang; menempuhnya gagal). Test "tepat satu aksi" **tetap hijau**, dan memang seharusnya begitu: mutasi ini menukar aksinya, bukan menggandakannya. Dicatat karena berguna — ia menunjukkan ketiga test itu menjaga hal yang berbeda, bukan hal yang sama tiga kali.
* Aksi diletakkan di luar `role="status"` → test `toContainElement` merah.

### Gate

| Gate | Hasil |
|---|---|
| `pnpm lint` | hijau (9 task) |
| `pnpm typecheck` | hijau (9 task) |
| `pnpm test` | hijau — web **302** (+4), ui **157** (+7) |
| `playwright test` | hijau — 10 test |
| `lhci` desktop | perf **100**, a11y **100** |
| `lhci` 3G | perf **82**, a11y **100** |
| budget bundel | 101,5 KB / 200 KB gzip |

### Ukuran

**375 LOC** (102 sumber + 79 sambungan/test yang diubah, ditambah dua berkas baru 194 baris) — **di bawah target <500.**

### Batas yang jujur

* **`KeadaanKosong` belum punya satu pun pemakai nyata.** Ia pola, dan pola yang belum dipakai belum terbukti pas. Pemakai pertamanya lahir di PR fitur (daftar lamaran, hasil pencarian lowongan); kalau ternyata bentuknya tidak cocok, ia harus berubah di sana — bukan dipaksakan.
* **Perilaku live region tidak diuji dengan screen reader.** Yang diuji adalah atribut dan hubungan elemennya. Bahwa NVDA benar-benar membacakannya pada saat yang tepat tetap menuntut manusia — menumpuk bersama utang NVDA dari PR-027/028/030/032a.
* **Keadaan 401/403 belum bisa dicapai pengguna sungguhan.** Tidak ada loader yang melemparnya hari ini; jalurnya diuji dengan error yang ditanam test. Ia akan benar-benar terpakai saat route terlindungi punya loader (Phase 05+).

### Out of scope

* Pemakaian `KeadaanKosong` di halaman fitur → PR fitur masing-masing.
* Pengiriman detail kesalahan ke observability → PR-103.

### Next steps

* **PR-033** — settings + Data Saya. Ia PR terakhir Phase 03; sesudahnya Exit Criteria phase bisa diperiksa.

## PR-033a — Kerangka pengaturan, panel Akun & slot aksesibilitas

**Tanggal:** 2026-08-10
**Branch:** `pr-033a-kerangka-pengaturan` → `phase-03-web-platform-base`
**Menutup:** kerangka dari AC PR-033 nomor 4 (keyboard-only) & 5 (id + id-simple). AC 1, 2, 3 milik 033b/033c.

### Ringkasan

Halaman `/pengaturan` lahir: kerangka + navigasi panel, panel **Akun & Data Saya** yang benar-benar menampilkan data pengguna, dan slot panel aksesibilitas yang mengakui dirinya belum berisi. Ia sekaligus **route terlindungi pertama** di aplikasi ini.

### Keputusan teknis

**`Terlindungi` dipasang di komponen layout, bukan di `routes.ts`.** Berkas route sengaja `.ts` murni data tanpa satu pun markup (keputusan PR-025), dan membungkus route dengan `<Terlindungi>` akan memaksanya menjadi `.tsx`. Memasangnya di induk juga berarti setiap panel yang ditambahkan kelak ikut terjaga tanpa perlu diingat — dan panel yang lupa dijaga tidak menimbulkan gejala apa pun sampai seseorang membuka alamatnya tanpa sesi. Diuji atas panel yang BUKAN indeks, sebab di sanalah kelalaian seperti itu muncul.

**Guard yang teruji tanpa pemakai belum membuktikan apa pun.** `Terlindungi` lahir lengkap dengan test-nya di PR-030a, tetapi sampai kemarin tidak satu pun route memakainya. PR ini jalur nyatanya yang pertama.

**Alamat indeks BERISI, bukan mengalihkan.** `/pengaturan` langsung menampilkan panel Akun, tanpa redirect ke `/pengaturan/akun`. Pengalihan di halaman indeks memang lazim, tetapi ia membuat satu alamat yang dibagikan orang selalu berakhir di alamat lain, dan tombol kembali sesudahnya terasa rusak. Dengan dua panel, alamat indeks lebih baik berisi daripada menunjuk.

**`end` pada tautan indeks — bukan kerapian.** Tanpa itu, tautan `/pengaturan` tampak aktif di SETIAP panel (setiap alamat panel diawali `/pengaturan`), dan `aria-current="page"` yang menempel di dua tautan sekaligus memberi pengguna screen reader dua jawaban berbeda atas "saya di mana". Dijaga test yang menghitung `aria-current`, bukan yang memeriksa kelas CSS.

**Panel aktif dibedakan warna DAN tebal huruf.** Warna sendirian melanggar WCAG 1.4.1.

**`GET /me` lahir sekarang, dan itu menjawab pertanyaan yang sengaja ditunda.** Catatan store sesi PR-030a menulis bahwa identitas pengguna belum dijawab karena belum ada halaman yang membutuhkannya, dan bahwa jawabannya lahir "bersama halaman pertama yang menampilkan identitas". Inilah halaman itu. `PUT /me` sengaja TIDAK ikut ditambahkan meski kontraknya sudah final: pemakainya baru lahir di PR-035, dan endpoint tanpa pemakai adalah kode yang tidak pernah dijalankan siapa pun.

**Halaman bernama "Data Saya" yang tidak menampilkan satu pun data mengingkari namanya.** Itu alasan panel akun berisi identitas, bukan kerangka kosong yang menunggu 033b/033c.

**`<dl>` dengan `<dt>`/`<dd>` sebagai anak LANGSUNG.** Hubungan label→nilai adalah seluruh isi bagian ini, dan hanya daftar deskripsi yang menyatakannya secara semantik — pada deret `<p>`, screen reader membacakan "Nama Rina Pratiwi Email rina@contoh.id" sebagai satu aliran tanpa batas. Versi pertama memakai `<div>` pembungkus per baris (sah menurut HTML, enak untuk tata letak); ia melunturkan peran `term`/`definition` dan test yang menanyakan peran itu gagal. Pembungkusnya dibuang, jaraknya dipindahkan ke `<dt>`/`<dd>` sendiri.

**Kosong dibedakan dari gagal.** Nilai `null` — dan `fullName` yang berisi spasi, keadaan wajar bagi akun hasil login OTP — ditulis "Belum diisi", bukan dibiarkan kosong dan bukan "—". Baris berlabel tanpa nilai tidak bisa dibedakan dari cacat: pengguna screen reader mendengar "Nama" lalu langsung "Email".

**Tanggal dalam zona WIB, ditulis eksplisit.** Tanpa `timeZone`, tanggal yang sama tampil berbeda di perangkat dengan zona berbeda — dan "bergabung sejak 15 Januari" yang berubah jadi 14 Januari membuat pengguna mempertanyakan data yang lain juga. Diuji dengan tanggal yang memang menyeberang hari (03.00 UTC = 10.00 WIB).

**Kegagalan menawarkan "Coba lagi", bukan "Muat ulang halaman".** Yang gagal hanya satu permintaan; memuat ulang seluruh halaman membuang posisi gulir dan mengunduh ulang seluruh aplikasi di jaringan yang barusan terbukti bermasalah. Diuji dengan MENGHITUNG permintaan ulang, bukan dengan memeriksa keberadaan tombolnya.

**Slot aksesibilitas memakai `KeadaanKosong` (PR-032b) — pemakai pertamanya.** Dan kalimat keduanya yang paling penting: preferensi sistem SUDAH bekerja sejak PR-026. Slot yang hanya berkata "belum tersedia" akan membuat pengguna yang sudah menyetel perangkatnya menyangka setelannya diabaikan, lalu berhenti memakainya. Dijaga test yang menuntut tidak ada satu pun kendali palsu — tombol mati lebih buruk daripada ketiadaan.

**"Cara Anda masuk" TIDAK ditampilkan.** `GET /me` mengembalikan `phone` tetapi bukan `googleId`, jadi menampilkannya sekarang berarti menebak dari ada-tidaknya nomor HP — dan tebakan itu salah untuk akun yang punya keduanya. Baris yang salah di halaman "data yang kami simpan tentang Anda" lebih merugikan daripada baris yang belum ada. Ketiadaannya ditulis sebagai komentar di katalog, bukan dibiarkan tampak seperti kelupaan.

### Tiga cacat gerbang yang ditemukan PR ini

Ketiganya sejenis: gerbang yang hijau atas hal yang salah.

1. **Halaman terlindungi diperiksa sebagai halaman masuk.** Jawaban palsu untuk `/auth/refresh` adalah 401, sehingga `/pengaturan` mengalihkan ke `/masuk` — axe berakhir hijau atas halaman yang sama sekali berbeda dari yang dilaporkannya. Ditutup dengan penanda `butuhSesi` di registry (jawaban `/auth/refresh` disesuaikan per halaman) plus penjaga `harusTidakBerpindah`, yang berlaku untuk SEMUA halaman — bukan hanya yang terlindungi. Penjaga itu sendiri sempat tidak berfungsi; lihat catatan uji mutasi.
2. **Panel bersarang lolos dari kewajiban terdaftar.** Penjaga registry PR-031 hanya membaca route tingkat pertama. Penelusurannya dibuat rekursif dan mengumpulkan DAUN saja (route induk adalah kerangka; yang punya alamat untuk dibuka pengguna adalah panelnya). Ditambah satu penjaga atas penjaganya sendiri: bila penelusurannya kembali dangkal, test lain tetap hijau — mereka hanya berhenti memeriksa sebagian halaman.
3. **Tautan lompat diuji pada dokumen yang masih kosong.** Cacat laten sejak PR-032a, muncul begitu jumlah halaman bertambah. `page.goto` selesai saat kerangka SPA terunduh, jauh sebelum React menulis apa pun; Tab yang ditekan pada dokumen kosong tidak mendarat di mana pun, dan fokusnya tidak menyusul sendiri. Kegagalannya tampak seperti tautan lompat yang hilang padahal ia ada di DOM. Halaman terlindungi paling rentan sebab ia menunggu pemulihan sesi lebih dulu. Ditutup dengan menunggu `h1` + `bringToFront()`.

Pemalsuan API juga dipindahkan dari dalam spec axe ke `e2e/palsukan-api.ts`, sebab kini DUA spec membutuhkannya dan keduanya harus melihat aplikasi dalam keadaan yang sama persis.

### Uji mutasi (dijalankan, bukan diasumsikan)

| Mutasi | Hasil |
|---|---|
| `<Terlindungi>` dilepas dari layout | **3 merah** (isi terlihat tanpa sesi; `?tujuan=` tidak terbawa; panel non-indeks ikut terbuka) |
| `end` dilepas dari tautan indeks | **1 merah** — "TEPAT SATU aria-current" menemukan dua |
| `timeZone: "Asia/Jakarta"` → `"UTC"` | **1 merah** |
| `butuhSesi` dilepas dari entri registry | **4 merah** (2 halaman × 2 spec), lewat `harusTidakBerpindah` — bukan lewat axe |
| `jalurRute()` dikembalikan dangkal | **2 merah** (penjaga rekursi + "halaman terdaftar menunjuk route yang ada"); test arah sebaliknya tetap hijau |
| Fixture `id` dikembalikan ke bentuk ULID | **2 merah** di api-client — `meResponseSchema` menuntut UUID |

**Dua catatan yang tidak boleh hilang dari tabel ini.**

*Baris ketiga tidak berjalan seperti yang saya duga.* Rencananya menghapus `timeZone` lalu menjalankan test dengan `TZ=America/New_York`. Node di mesin Windows ini tidak menghormati `TZ` — `Intl` tetap menjawab `Asia/Jakarta` — jadi mutasi itu HIJAU dan tidak membuktikan apa pun. Dua hal diubah karenanya: waktu ujinya dipindah ke 15 Januari pukul 20.00 UTC (= 16 Januari WIB) supaya tanggalnya benar-benar menyeberang hari, dan mutasinya diganti menjadi `timeZone: "UTC"` — yang mensimulasikan mesin CI secara tepat, sebab runner GitHub berjalan di UTC. Dalam bentuk itu ia merah. Penjaganya kini menggigit di tempat yang penting (CI) meski di mesin WIB ia tidak bisa dibuat merah dengan cara lain.

*Baris keempat semula HIJAU, dan itu menemukan cacat di penjaganya sendiri.* Versi pertama `harusTidakBerpindah` membaca `page.url()` segera sesudah `goto`. Aplikasi ini SPA: `goto` selesai begitu kerangka kosong terunduh, dan pengalihan `<Navigate>` milik route guard baru terjadi sesudah React berjalan. Alamat yang dibaca sedini itu karena itu SELALU sama dengan yang diminta — penjaganya tidak pernah bisa merah. Menunggu `h1` lebih dulu dilipat ke dalam fungsi yang sama (bukan dibiarkan sebagai langkah terpisah yang bisa lupa dipanggil), dan barulah mutasinya merah. Tanpa uji mutasi ini, PR ini akan mendarat membawa penjaga yang tidak menjaga apa pun sambil mengklaim sebaliknya di dokumen.

*Baris terakhir* juga bukan sekadar test yang cerewet: fixture ULID itu semula dipakai di tiga tempat, termasuk stub Playwright — dan di sana klien NYATA memparse jawabannya, jadi halaman pengaturan akan merender keadaan gagal sementara axe tetap hijau atasnya.

### Gate

| Gate | Hasil |
|---|---|
| `pnpm lint` | hijau (9 task) |
| `pnpm typecheck` | hijau (9 task) |
| `pnpm test` — web | **329** test / 30 berkas (+27) |
| `pnpm test` — api-client | **30** test / 5 berkas (+6) |
| Playwright | **14** test hijau, 3× berturut-turut (+4) |
| Lighthouse desktop | perf 84, a11y 100 |
| Lighthouse 3G | perf **84**, a11y 100 |
| Budget bundel | 104,96 KB / 200 KB gzip |

### Risiko & batas yang jujur

**Perkiraan LOC meleset besar — lagi.** Diperkirakan ≈450, mendarat **± 1.170** (490 sumber + 680 test/e2e). Bagian sumbernya masih di dalam anggaran; yang membengkak adalah test. Dua PR terakhir juga meleset ke arah yang sama (032a: ≈430 → 825). Pola yang cukup konsisten untuk dipakai: perkiraan saya di repo ini berjalan sekitar 2,5× terlalu rendah, dan angka untuk 033b/033c dinaikkan mengikuti itu.

**Bundel awal naik 101,3 → 104,96 KB gzip.** Perf 3G justru terukur 84 (naik dari 82 di PR-032a), jadi marginnya belum tergerus — tetapi angka itu bergerak antar mesin, dan kenaikan bundel-nya nyata. Sebabnya `useQuery` kini benar-benar terpakai sehingga bagian TanStack Query yang sebelumnya terpangkas ikut masuk. Jalan keluar strukturalnya tetap sama seperti dicatat PR-032a: memisahkan shell publik dari shell aplikasi (Phase 16).

**Verifikasi manual yang belum ditempuh:** NVDA atas struktur `<dl>` dan navigasi panel; viewport ponsel sungguhan; dan review teks katalog `pengaturan` oleh non-engineer. Teks di halaman ini menjelaskan hak atas data pribadi — pembacanya sedang mempertimbangkan tindakan yang tidak bisa dibatalkan — dan sampai sekarang ia ditulis engineer.

**`role` dari `/me` diambil tetapi tidak dipakai.** Ia bagian kontrak dan akan dipakai memilih navigasi kelak; hari ini ia hanya lewat.

### Out of scope

* Ekspor data (PR-033b), hapus akun + dialog re-auth (PR-033c).
* Isi panel preferensi aksesibilitas (PR-036).
* `PUT /me` dan halaman onboarding (PR-035).
* `authMethods` di kontrak `/me` — perubahan backend; PR-033 menyatakan tidak ada perubahan backend.

### Next steps

* **PR-033b** — ekspor data: `GET /me/export` di api-client, unduh JSON, keadaan kuota habis (3×/24 jam). Perkiraan direvisi: ± 700 LOC.
* **PR-033c** — hapus akun: dialog dua langkah + re-auth OTP/Google, penjelasan masa tunggu 30 hari. Perkiraan direvisi: ± 1.100 LOC. Bila terukur lebih besar lagi saat diperiksa, pemecahan lanjutan diusulkan **sebelum** implementasi.

## PR-033b — Ekspor data pribadi

**Tanggal:** 2026-08-10
**Branch:** `pr-033b-ekspor-data` → `phase-03-web-platform-base`
**Menutup:** AC PR-033 nomor 1. Menambah cakupan AC 4 & 5.

### Ringkasan

Hak portabilitas UU PDP §8.7 punya tombolnya: `GET /me/export` masuk ke `@nawasena/api-client`, dan panel Akun & Data Saya kini bisa menyerahkan seluruh data pengguna sebagai satu berkas JSON.

### Keputusan teknis

**`useMutation`, bukan `useQuery`, meski endpoint-nya `GET`.** Inilah keputusan paling penting di PR ini, dan ia menyalahi bentuk yang paling wajar ditulis. Tiap panggilan memakan satu dari tiga jatah harian dan tercatat di audit; sebagai query ia akan berjalan sendiri saat komponen dipasang dan berpotensi berjalan lagi saat datanya dianggap basi — menghabiskan jatah pengguna tanpa ia menekan apa pun. Yang menahan kesalahan itu bukan komentar melainkan bentuk API: `@nawasena/api-client` sengaja TIDAK menyediakan query key untuk endpoint ini, jadi jalan yang salah tidak tersedia. Dijaga test yang memeriksa isi `usersKeys`.

**`aria-disabled`, bukan `disabled`, pada tombol sibuk.** Peramban melepas fokus dari elemen yang baru dinonaktifkan: pengguna keyboard yang menekan Enter mendarat di awal dokumen dan harus menyusuri halaman lagi — tepat setelah aksinya berhasil. `aria-disabled` tetap mengumumkannya nonaktif tanpa mengusir fokus; yang menahan klik kedua adalah penjaga di handler, dan itu diuji terpisah supaya tidak ada yang mengira `aria-disabled` menahannya sendiri. Tombol "Coba lagi" dari PR-033a yang memakai `disabled` ikut diseragamkan — dua pola berlawanan di satu berkas lebih buruk daripada salah satunya.

**Keberhasilan DIUMUMKAN, dan itu bukan hiasan.** Unduhan tidak mengubah apa pun di halaman: pengguna screen reader menekan tombol lalu tidak mendengar apa pun sama sekali, dan tidak punya cara mengetahui bahwa berkasnya sudah ada. Live region-nya dirender sejak awal (kosong), sebab region yang lahir bersama pesannya kerap tidak terbaca — pola yang sama dengan `WilayahMemuat` (PR-028b). Isinya dikosongkan tiap kali tombol ditekan, karena unduhan kedua pada hari yang sama menghasilkan kalimat yang SAMA PERSIS, dan menulis teks identik dua kali bukan perubahan — jadi tidak diumumkan. Diuji dengan `MutationObserver` yang merekam urutan perubahan, bukan dengan menangkap keadaan sesaat.

**Batas kuota disebutkan SEBELUM ditekan.** Pengguna yang tahu jatahnya tiga tidak akan menekan berulang lalu tiba-tiba ditolak tanpa mengerti sebabnya.

**Pesan 429 khas ekspor, bukan pesan khas login.** Kode servernya sama (`TERLALU_BANYAK_PERMINTAAN`) dengan yang muncul saat terlalu sering mencoba masuk. Satu daftar pesan bersama akan membuat halaman ini berkata "terlalu banyak percobaan" kepada orang yang baru sekali menekan tombol. Karena itu inti generik `pesanGalat` (pesan server + hint, cadangan jaringan) dipindah ke `shared/galat-api.ts` dan petanya diminta per pemanggil. Pemindahan itu dilakukan SEKARANG, bukan lebih awal: sampai kemarin pemakainya cuma satu, dan memindahkan lebih dulu hanyalah tebakan tentang pemakai kedua yang belum ada. Kunci `auth.galat.jaringan` ikut pindah menjadi `shell.galat.jaringan` — kegagalan jaringan tidak punya domain auth.

**Nama berkas bertanggal WIB.** `exportedAt` datang dalam UTC; memotong sepuluh huruf pertamanya memberi TANGGAL KEMARIN bagi siapa pun yang mengunduh sesudah pukul tujuh malam. Tanggal yang meleset sehari persis menghapus satu-satunya gunanya: mengurutkan unduhan di folder Unduhan.

**Berkasnya berisi ekspor itu sendiri, bukan amplop `{ data }`.** Amplop adalah urusan API; pengguna yang membuka berkasnya tidak punya alasan melihat satu lapis pembungkus yang hanya bermakna di dalam kode. JSON-nya berindentasi — ekspor PDP dibaca manusia, dan JSON satu baris panjang memenuhi kontrak sambil mengingkari gunanya.

**Tombol ekspor dirender DI LUAR percabangan gagal-memuat identitas.** Pengguna yang `GET /me`-nya gagal tetap berhak mengambil salinan datanya; menyembunyikan tombolnya pada saat itu berarti hak PDP hilang karena kegagalan yang tidak ada hubungannya.

### Uji mutasi (dijalankan, bukan diasumsikan)

| Mutasi | jsdom | Peramban |
|---|---|---|
| `aria-disabled` → `disabled` | **1 merah** | — |
| pengosongan live region di `onMutate` dilepas | **1 merah** | — |
| berkas dibungkus amplop `{ data }` | **2 merah** | — |
| `timeZone: "Asia/Jakarta"` → `"UTC"` | **2 merah** | **2 merah** |
| 429 dipetakan ke kalimat auth | **2 merah** | — |
| tautan tidak dipasang ke dokumen | **1 merah** | **hijau** |
| pelepasan URL objek tidak ditunda | **2 merah** | **hijau** |

**Dua baris terakhir mengubah isi berkas ini, dan layak dibaca dua kali.**

Saya menulis kedua kehati-hatian itu dengan alasan "sebagian peramban mengabaikannya / membatalkan unduhannya". Uji mutasi membantahnya untuk peramban yang benar-benar kita jalankan: dengan tautan yang tidak pernah masuk dokumen, dan dengan URL objek yang dilepas seketika, **unduhan di Chromium tetap berhasil**. Klaim itu semula ditulis seolah terverifikasi; komentarnya sudah dikoreksi.

Keduanya tetap dipertahankan, tetapi kini atas alasan yang jujur: gerbang a11y kita menjalankan SATU mesin peramban, penggunanya tidak, dan yang dicegah keduanya bersifat bisu — tombol ditekan, tidak terjadi apa-apa, tanpa satu pun pesan galat. Kegagalan bisu tidak pernah sampai sebagai laporan; pengguna hanya berhenti memakai fiturnya. Bila kelak terbukti tidak ada peramban target yang membutuhkannya, keduanya boleh dibuang — atas bukti, bukan atas dugaan bahwa "Chromium saja sudah cukup".

Baris `timeZone` juga tidak bisa dibuat merah dengan menyetel `TZ`: Node di mesin Windows ini tidak menghormatinya (temuan PR-033a). Mutasinya karena itu menjadi `timeZone: "UTC"`, yang mensimulasikan runner CI secara tepat — dan di sana ia merah di KEDUA lapis.

### Gate

| Gate | Hasil |
|---|---|
| `pnpm lint` | hijau (9 task) |
| `pnpm typecheck` | hijau (9 task) |
| `pnpm test` — web | **356** test / 32 berkas (+27) |
| `pnpm test` — api-client | **34** test / 5 berkas (+4) |
| Playwright | **17** test hijau (+3) |
| Lighthouse desktop | perf 82–85, a11y 100 |
| Lighthouse 3G | perf 82–85, a11y 100 |
| Budget bundel | 105,33 KB / 200 KB gzip |

### Risiko & batas yang jujur

**Perkiraan LOC meleset lagi, arah yang sama.** Perkiraan revisi ≈700 (sudah dinaikkan setelah PR-033a), mendarat **± 1.170** (470 sumber + 700 test/e2e). Rasionya membaik (1,7× dari 2,5×) tetapi masih di atas. Yang konsisten membengkak adalah test, bukan sumber.

**Margin perf 3G tipis dan berayun.** Terukur 82–85 antar-run pada mesin yang sama, dengan ambang 80. Bundel awal naik 104,96 → 105,33 KB gzip. Gerbangnya menjaga, tetapi PR yang menambah sedikit saja bisa membuatnya merah karena kebisingan pengukuran, bukan karena regresi nyata. Jalan keluarnya tetap sama: memisahkan shell publik dari shell aplikasi (Phase 16).

**Belum diverifikasi manusia:** NVDA atas pengumuman keberhasilan unduhan (inilah bagian yang paling menuntut telinga sungguhan — seluruh gunanya ada pada apakah ia benar-benar terdengar), unduhan di peramban selain Chromium, unduhan di peramban ponsel (perilaku `download` di iOS Safari berbeda), dan review teks katalog oleh non-engineer.

**Kuota tidak ditampilkan sebagai sisa.** Halaman menyebut "sampai 3 kali dalam 24 jam" tetapi tidak bisa menyebut berapa yang tersisa: server tidak mengembalikan angka itu pada jawaban sukses, dan `Retry-After` pada 429 tidak terbaca klien (celah lama yang tercatat sejak PR-030b — `ApiError` tidak membawa header).

### Out of scope

* Hapus akun + dialog re-auth (PR-033c).
* Meneruskan header `Retry-After` di `@nawasena/api-client` — celah yang sama dengan PR-030b, dan menutupnya menyentuh seluruh pemakai klien.
* Ekspor berformat lain (CSV/PDF): kontraknya JSON, dan `formatVersion` di dalamnya adalah janji atas bentuk itu.

### Next steps

* **PR-033c** — hapus akun: dialog dua langkah + re-auth OTP/Google, penjelasan masa tunggu 30 hari. Perkiraan direvisi lagi mengikuti dua kali meleset: **± 1.400 LOC**. Bila terukur lebih besar saat diperiksa, pemecahan lanjutan diusulkan **sebelum** implementasi.
