# Implementation Log — Phase 08 (Companies & Jobs)

> Catatan per PR yang selesai di Phase 08. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-051 — Companies BE

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-051---companies-be)
> **Tanggal:** 2026-09-11
> **Status:** Selesai

### Ringkasan hasil

Modul `companies` lahir utuh dari router sampai repository: CRUD admin, endpoint
verifikasi inklusivitas, dan GET publik tanpa field internal. Tidak ada migrasi — tabel
`companies` (kolom `inclusivity_status`, `accommodations_available jsonb`, `verified_by`,
`verified_at`) sudah ada sejak migrasi 03 (PR-011), dan PR ini memang tugasnya memakainya.

Empat route `/admin/companies*` adalah endpoint `role("admin")` **pertama** di seluruh
repo — `/companies/:id` di dalamnya tetap publik dengan sengaja (US-09: kandidat menilai
perusahaan sebelum melamar, sering tanpa sesi).

Dua keputusan yang membentuk seluruh sisanya:

**1. "Verified" HANYA bisa dicapai lewat `POST .../verify`, tidak lewat `PUT`.**
`updateCompanySchema.inclusivityStatus` membatasi nilainya sendiri ke
`unverified`/`self_claimed` (`editableInclusivityStatusSchema`,
`packages/schemas/src/companies.ts`). Tanpa batas itu, `PUT` bisa menghasilkan status
publik "verified" tanpa audit `COMPANY_VERIFIED` maupun event `company.verified` — dan
endpoint verifikasi kehilangan alasan untuk ada. Koreksi **turun** (un-verify) tetap
dimungkinkan lewat `PUT` (AC eksplisit di dokumen phase).

**2. Nilai enum status di API TIDAK diseragamkan dengan `auditMetaSchemas[COMPANY_VERIFIED]`.**
Audit.ts (PR-014) sudah mengontrak `from: z.enum(["unverified","selfClaimed","verified"])`
— camelCase — sebelum modul ini pernah ada. `inclusivityStatusSchema` di `companies.ts`
tetap snake_case (`self_claimed`), sama persis dengan enum Prisma, supaya data yang
mengalir apa adanya dari kolom DB tidak butuh pemetaan tanpa alasan selain kosmetik.
Satu-satunya tempat kedua bentuk bertemu adalah `keStatusAudit()` di
`companies.service.ts`, dipakai HANYA saat menulis baris audit `COMPANY_VERIFIED`.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9 — `@nawasena/api` **109 berkas / 1586
lulus** (1 skip tak terkait, urutan boot `.env`), `@nawasena/schemas` **3 berkas / 84
lulus**. `pnpm --filter @nawasena/schemas check:openapi` sinkron.

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/companies.ts`** — diisi dari skeleton kosong (PR-004). `inclusivityStatusSchema`
  (cerminan enum Prisma) + `editableInclusivityStatusSchema` (subset yang boleh ditulis
  `PUT`, lihat keputusan #1), `companyPublicSchema`/`companyAdminSchema` (admin menambah
  `verifiedBy`+timestamp), `createCompanySchema`, `updateCompanySchema` (`.partial().strict()`),
  `companyIdParamsSchema`, tiga response envelope, dan event domain
  `companyVerifiedEventSchema`. Taksonomi akomodasi **diimpor** dari `profiles.ts`
  (`accommodationNeedSchema`) — satu daftar untuk kebutuhan pencari kerja dan fasilitas
  perusahaan, seperti sudah dicatat komentar di sana sejak PR-037.
* **`src/audit.ts`** — TIDAK diubah. `AUDIT_ACTION.COMPANY_VERIFIED` dan
  `ADMIN_RESOURCE_CHANGED` sudah dikontrak sejak PR-014; PR ini konsumen pertamanya.
* **`src/openapi.ts` + `openapi.json`** — lima endpoint didokumentasikan (`responsAdmin`
  helper baru: 401/403/503). Penjaga `openapi-parity.test.ts` diperluas ke modul baru.

**Core**

* **`core/events/index.ts`** — satu entri baru di `DomainEvents`: `company.verified`.
  Belum ada pelanggan — sama seperti `job.closed` saat lahir di PR-024b.
* **`core/http/errors.ts`** — kode baru `PERUSAHAAN_TIDAK_DITEMUKAN` (404).

**Modul (`apps/api/src/modules/companies/`, baru)**

* **`repositories/companies.repository.ts`** — TANPA penjaga kepemilikan (beda dari
  `career.repository.ts`): perusahaan dikurasi admin, bukan milik satu pengguna. `verify()`
  terpisah dari `update()` — satu-satunya jalur menulis `verifiedBy`+`verifiedAt`.
* **`services/companies.service.ts`** — `keStatusAudit()` (pemetaan status → meta audit,
  keputusan #2), `verify()` (audit `COMPANY_VERIFIED` + event, idempoten pada perusahaan
  yang sudah verified — re-verifikasi menggantikan `verifiedBy`/`verifiedAt`), `create()`/
  `update()` (audit `ADMIN_RESOURCE_CHANGED`).
* **`controllers/` + `routers/`** — `access.public(...)` untuk GET publik,
  `access.role("admin")` untuk keempat route admin, `validate({params, body})` di semua.
* **`index.ts`** — factory + re-export; dipasang di `boot.ts` sebagai modul terakhir.

**Test (3 berkas baru, 1 diperluas di `packages/schemas`)**

* `companies.test.ts` (11) — unit service dengan fake repository: audit `from`/`to`
  (termasuk pemetaan `self_claimed`→`selfClaimed`), sanitizer katalog audit, idempotensi
  re-verifikasi, event `company.verified`, 404 tanpa audit/event.
* `companies-http.test.ts` (19) — server Express nyata: matriks akses (401 tanpa token,
  403 seeker di seluruh route admin), CRUD admin, un-verify via `PUT`, penolakan
  `inclusivityStatus: "verified"` di `PUT`, taksonomi akomodasi liar/valid, deklarasi
  route (PR-019).
* `openapi-parity.test.ts` (+1 modul dirakit) — companies ikut diperiksa kesepadanannya.
* `schemas.test.ts` (+7) — `createCompanySchema`/`updateCompanySchema` valid & invalid,
  bentuk `companyVerifiedEventSchema`.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| `verified` hanya lewat `POST .../verify` | `PUT` yang bisa menaikkan status akan membuat status publik lahir tanpa audit/event — endpoint verify jadi tidak perlu | Mengizinkan `inclusivityStatus: "verified"` di `PUT` — ditolak; menghapus satu-satunya jaminan bahwa "verified" selalu tercatat |
| Status API tetap snake_case, dipetakan HANYA saat audit | `auditMetaSchemas[COMPANY_VERIFIED]` (PR-014) sudah camelCase sebelum modul ada; menyeragamkan berarti mengubah kontrak audit yang sudah berlaku demi kosmetik | Mengubah `audit.ts` ke snake_case — ditolak; berisiko menyentuh kontrak bersama di luar scope PR-051 |
| `GET /admin/companies` tanpa pagination | Skala pilot MVP (puluhan perusahaan); `kursor.ts` (PR-047) sudah mencatat PR-058 sebagai konsumen cursor kedua — companies bukan salah satunya | Cursor pagination seragam di semua list admin — ditolak; kompleksitas tanpa kebutuhan nyata |
| `GET /companies/:id` tidak dibatasi status verifikasi | PR-054 (halaman publik) butuh perusahaan `unverified` tetap terlihat — transparansi status ITU SENDIRI adalah fitur (badge verified vs self-claimed) | Menyembunyikan perusahaan `unverified` dari publik — ditolak; bertentangan dengan tujuan Company Accessibility Profile |
| `verify()` idempoten pada perusahaan yang sudah verified | Re-verifikasi setelah koreksi data adalah alur admin yang sah; menolaknya dengan error hanya memaksa jalan memutar lewat `PUT` un-verify dulu | Menolak verify kedua dengan 409 — ditolak; tidak ada AC yang memintanya, dan menambah friksi kurasi |

### Risiko & batas yang diketahui

* **Tidak ada rubrik verifikasi tertulis.** Endpoint mencatat SIAPA dan KAPAN, bukan
  MENGAPA — risiko yang sudah dicatat di dokumen phase (celah PRD §17). Admin bisa
  menandai "verified" tanpa kriteria terdokumentasi di luar kode ini.
* **`GET /admin/companies` tanpa pagination** akan perlu direvisi bila jumlah perusahaan
  melampaui skala pilot (puluhan) — belum ada indikasi itu terjadi sebelum Phase 19.
* **Belum ada pelanggan `company.verified`.** Sama seperti `job.closed` di PR-024b: nilainya
  ada di momen penerbit pertama lahir, bukan di pesan yang dikirim hari ini.

### Next steps

* **PR-052** — Admin shell FE + `AdminTable` — konsumen pertama endpoint admin di sini.
* **PR-053** — UI kurasi perusahaan (form + verify flow), langsung memakai kontrak
  `companyAdminSchema`/`createCompanySchema`/`updateCompanySchema`.
* **PR-054** — Halaman publik perusahaan, konsumen `GET /companies/:id` +
  `GET /companies/:id/jobs` (endpoint baru, ditambahkan di PR-054 itu sendiri).
* **PR-055** — Jobs BE, memakai taksonomi akomodasi yang sama (`accommodationNeedSchema`).

---

## PR-052 — Admin Shell FE

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-052---admin-shell-fe)
> **Tanggal:** 2026-09-12
> **Status:** Selesai

### Ringkasan hasil

Route `/admin` lazy pertama beserta guard perannya, dan komponen `Tabel`
aksesibel di `@nawasena/ui` — reusable lintas fitur admin yang menyusul
(PR-053, PR-057, PR-077, PR-081, PR-083, PR-085). Tidak ada backend/database:
seluruh scope PR ini murni frontend.

Dua keputusan yang membentuk seluruh sisanya:

**1. Dua guard terpisah, ditumpuk — bukan satu guard gabungan.** `Terlindungi`
(PR-030a, menjaga SESI) dipasang DI LUAR, `PenjagaAdmin` (baru, menjaga PERAN)
DI DALAM. Memeriksa peran sebelum ada sesi sama sekali tidak berarti apa pun —
`/me` akan gagal 401 sebelum sempat menjawab peran. Pemisahan ini juga yang
membuat "guard role FE adalah UX, bukan keamanan" (Security Considerations)
bisa dinyatakan TEPAT: `PenjagaAdmin` murni percantik pengalaman, sedangkan
`Terlindungi` yang sudah ada tetap menjaga sesi seperti biasa. RBAC
sesungguhnya (`access.role("admin")`, PR-019) ada di server; guard FE ini
gagal-tertutup (galat `/me` diperlakukan sama dengan "bukan admin") tetapi
tetap bisa dilewati siapa pun yang mengubah kode klien — dan itu tidak
masalah, sebab server tidak pernah mempercayainya.

**2. Pesan penolakan adalah flash message lewat `location.state`, bukan query
string atau toast.** AC menuntut "redirect + pesan", dan `PenyediaToast` yang
ada di `@nawasena/ui` belum pernah dipasang di `apps/web` (belum ada
pemakainya) — memasangnya sekarang demi satu pesan akan menambah satu sistem
notifikasi baru untuk PR yang scope-nya "shell + guard + tabel". Query string
bertahan setelah refresh dan tersalin ke tautan yang dibagikan; state React
Router hanya menempel pada SATU entri riwayat (dari `<Navigate replace
state={...}>`), sehingga pesan "Anda ditolak" otomatis hilang begitu pengguna
berpindah ke alamat lain. Dibaca dan diumumkan (`role="alert"`) di
`TataLetak`, satu-satunya komponen yang dilewati SETIAP halaman — pola yang
sama dengan `BannerLuring`.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9 — `@nawasena/ui` **14
berkas / 188 lulus**, `@nawasena/web` **47 berkas / 611 lulus**. Build
produksi + `pnpm cek:budget`: bundel awal 110,0 KB gzip (LOLOS, sisa 90 KB),
kedua chunk `admin-*.js` terkonfirmasi ada di daftar "chunk lazy" — TIDAK di
payload awal. `playwright test -g admin` (axe + skip-link, atas hasil build,
browser Chromium nyata) — 2/2 lulus.

### Scope selesai

**`packages/ui` (baru: `Tabel`)**

* **`src/tabel.tsx`** — komponen tabel generik `Tabel<T>`. Header sortable
  adalah `<button>` NATIF di dalam `<th scope="col">` — itulah seluruh
  jawaban "sortable via keyboard": fokusabel via Tab, aktif via Enter/Spasi,
  tanpa satu baris penanganan tombol pun ditulis tangan. `aria-sort` ditaruh
  di `<th>` (bukan di tombolnya) sesuai WAI-ARIA APG. Pengurutan TERKENDALI
  PEMANGGIL (`urutan`/`onUrutkan`) — komponen ini tidak tahu bagaimana
  membandingkan nilai bertipe apa pun, hanya tahu cara menampilkan keadaan
  urut yang diberi tahu. `judul` (wajib) → `<caption>`; `kosong` (wajib) →
  baris pengganti saat `data` kosong, pola yang sama dengan `children` wajib
  di `KeadaanKosong`.
* **`__tests__/tabel.test.tsx`** (15 test) — scope=col tiap header, caption
  menamai tabel, aktivasi Enter/Spasi lewat `userEvent.keyboard` (bukan
  panggilan handler langsung), `aria-sort` mengikuti prop bukan state
  internal, kolom tanpa `urut` tidak pernah dapat `aria-sort`, keadaan kosong
  + `colSpan`, isi sel bawaan vs `render` kustom, axe (terisi & kosong).
* **`src/index.ts`** — `Tabel` diekspor bersama `KolomTabel`/`UrutanTabel`.

**`apps/web` (route `/admin` + guard)**

* **`src/shared/rute/penjaga-admin.tsx`** (baru) — `PenjagaAdmin`: `useQuery`
  `GET /me`, `WilayahMemuat` selama menunggu, `<Navigate to="/" replace
  state={{pesanAkses}}>` bila bukan admin (termasuk saat query gagal —
  fail-closed).
* **`src/app/tata-letak.tsx`** — `PesanAksesDitolak` baru: membaca
  `location.state.pesanAkses`, merender `role="alert"` bila ada. Diletakkan
  di bawah tautan lompat (yang harus tetap elemen fokusabel pertama).
* **`src/routes/admin.tsx`** (baru) — `Admin` (shell: `Terlindungi` →
  `PenjagaAdmin` → `<h1>` + `<nav>` + `<Outlet/>`) dan `AdminRingkasan`
  (panel indeks: `KeadaanKosong` — belum ada modul admin lain). Array
  `SEKSI` (satu entri hari ini) mengikuti pola `PANEL` di `pengaturan.tsx`,
  siap ditambah PR-053 dst. tanpa menulis ulang navigasinya.
* **`src/app/routes.ts`** — route `admin` lazy + anak indeks lazy,
  `muatKatalog("admin")` di keduanya.
* **`src/shared/i18n/katalog/admin.ts`** (baru) + wiring
  (`katalog/index.ts`, `registri.ts` — `FITUR_MALAS`+`PEMUAT`,
  `katalog/semua.ts`, `__tests__/setup.ts`).
* **`e2e/halaman.ts`** — flag baru `butuhAdmin` di `HalamanDijaga`; satu
  entri terdaftar (`admin — ringkasan`).
* **`e2e/palsukan-api.ts`** — `GET /me` menjawab `role: "admin"` bila
  `halaman.butuhAdmin === true`, else `"seeker"` (bawaan sebelumnya).

**Test (2 berkas baru, 1 diperluas selain yang di atas)**

* `apps/web/__tests__/admin.test.tsx` (11 test) — dijalankan lewat `ruteApp`
  PRODUKSI (bukan router karangan test), pola yang sama dengan
  `pengaturan.test.tsx`: penjagaan sesi (keluar→/masuk, tujuan terbawa),
  AC penolakan peran (seeker→"/", pesan `role="alert"`, admin tidak
  dialihkan), navigasi keyboard-only (Tab+Enter, `aria-current`), axe.
* `apps/web/__tests__/katalog-kelengkapan.test.ts` — empat entri baru di
  `SAMA_DENGAN_SENGAJA` (label pendek yang `id`/`id-simple`-nya memang sama).

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| `Tabel` di `@nawasena/ui`, bukan di fitur admin | Tidak tahu apa pun tentang domain (companies/jobs/users) — sama kategorinya dengan `Tab`/`Dialog`; enam PR admin berikutnya memakainya | Menaruhnya di fitur `admin` lalu mengimpornya lintas fitur — dilarang `eslint-plugin-boundaries` |
| Pengurutan terkendali pemanggil, `Tabel` tidak mengurutkan `data` | Perbandingan yang benar (tanggal, angka, string berlokal) hanya diketahui pemanggil; `Tabel` hanya tahu `kunci`+`render` | `Tabel` mengurutkan sendiri via `Array.sort` generik — akan salah untuk kolom non-string tanpa cara memberi tahu komparatornya |
| Pesan penolakan via `location.state`, bukan toast/query string | Toast belum pernah dipasang di `apps/web`; query string bertahan lewat refresh & tautan yang dibagikan, sedangkan state menempel satu entri riwayat lalu otomatis hilang | Memasang `PenyediaToast` sekarang — scope creep untuk PR "shell+guard+tabel"; query string — pesan "Anda ditolak" ikut tersalin ke tautan |
| Guard peran fail-closed saat `/me` gagal | Pengguna yang perannya tidak bisa dipastikan tidak boleh melihat isi admin hanya karena jaringan bermasalah — sejalan dengan "guard adalah UX", bukan alasan melonggarkannya | Menampilkan retry/isi admin saat galat — kebocoran UX yang tidak perlu, RBAC BE tetap jadi jaring pengaman tetapi pengalamannya buruk |
| Nav admin: array `SEKSI` (satu entri) sejak sekarang | PR-053 dst. menambah BARIS, bukan menulis ulang pola navigasi — sama seperti `PANEL` di `pengaturan.tsx` | Tautan tunggal ditulis tangan tanpa array — akan ditulis ulang total begitu entri kedua datang |

### Risiko & batas yang diketahui

* **NVDA sungguhan TIDAK dijalankan** — lingkungan pengembangan ini tidak
  punya screen reader terpasang. Yang menggantikannya: axe (jsdom DAN
  browser Chromium nyata via Playwright) plus pengujian peran/nama/state
  ARIA eksplisit (`scope=col`, `aria-sort`, `role="alert"`, `aria-current`).
  Utang ini sejalur dengan gerbang Lighthouse a11y=100 yang berjalan di CI
  (job `a11y`) tetapi belum pernah dijalankan LOKAL untuk halaman ini di
  sesi ini — CI akan menjadi pemeriksaan sungguhan pertama.
* **Belum ada penemuan `/admin` dari navigasi utama.** Tidak ada tautan di
  `TataLetak` menuju `/admin` bagi admin yang sedang masuk — sesuai scope
  (`session store` tidak menyimpan `role`, hanya `status`; menambahkannya
  butuh mengubah kontrak store yang di luar scope "shell+guard+tabel").
  Admin membuka `/admin` lewat alamat langsung. Dicatat, bukan tersembunyi,
  supaya PR yang menambah pintasan navigasi tahu titik mulainya.
* **`Tabel` belum punya pemakai sungguhan.** PR-053 adalah konsumen pertama
  dengan data nyata (daftar perusahaan); sampai saat itu kebenarannya hanya
  dibuktikan test terisolasi, bukan di halaman produksi.

### Next steps

* **PR-053** — Admin Companies FE: konsumen pertama `Tabel` dengan data
  sungguhan (daftar perusahaan dari PR-051), form, dan alur verifikasi.
  Menambah entri kedua ke array `SEKSI` di `routes/admin.tsx`.
* **PR-057/077/081/083/085** — pemakai `Tabel` berikutnya (jobs, users,
  admin lain) sesuai backlog.

---

## PR-053 — Admin Companies FE

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-053---admin-companies-fe)
> **Tanggal:** 2026-09-12
> **Status:** Selesai

### Ringkasan hasil

Konsumen PERTAMA `Tabel` (PR-052) dengan data sungguhan: `/admin/companies`
(daftar + sortir), `/admin/companies/baru` (tambah), `/admin/companies/:id`
(ubah + verifikasi). Tidak ada backend/database — murni frontend di atas
kontrak PR-051 yang sudah ada.

Tiga keputusan yang membentuk seluruh sisanya:

**1. Halaman terpisah untuk tambah/ubah, bukan dialog atau baris tabel yang
berubah jadi form di tempat** (dikonfirmasi via `AskUserQuestion` sebelum
implementasi). Form perusahaan cukup panjang (nama, deskripsi, situs, kota,
enam kotak centang akomodasi) untuk membuatnya sulit dijaga aksesibel di
dalam modal atau di dalam satu `<tr>` — halaman sendiri berarti URL yang bisa
ditandai, tombol kembali yang bekerja alami, dan fokus yang tidak perlu
dijerat.

**2. Status verifikasi TIDAK ADA di formulir sebagai field biasa.**
`updateCompanySchema.inclusivityStatus` (PR-051) hanya menerima
`unverified`/`self_claimed` — menaruhnya sebagai dropdown di form utama
berisiko admin yang memperbaiki satu salah ketik nama TIDAK SENGAJA
menurunkan status "verified" bila nilai dropdown itu tidak sengaja tersentuh
saat form dibangun ulang dari data server. Satu-satunya jalan mengubah status
adalah tombol **Verifikasi** — aksi terpisah, dengan dialog konfirmasinya
sendiri (Security Considerations: "dampak label publik"). Un-verify TIDAK
diekspos di UI ini — AC PR-053 tidak memintanya, dan jalur PUT admin (PR-051)
tetap tersedia di server bila kelak dibutuhkan.

**3. GET /admin/companies/:id TIDAK ADA di server (dengan sengaja, PR-051) —
halaman Ubah mencari barisnya dari `listCompaniesAdmin()`.** Cache TanStack
yang sudah terisi dari halaman daftar membuat perpindahan ke halaman Ubah
terasa seketika; navigasi LANGSUNG ke alamatnya (tautan disalin, dibuka tab
baru) tetap bekerja lewat satu permintaan daftar segar. Konsekuensinya:
navigasi LANGSUNG ke `/admin/companies/:id` dengan id yang tidak ada di
daftar menampilkan "tidak ditemukan" — keadaan yang sah dan diuji, bukan
kegagalan.

**KEJADIAN: `noValidate` yang terlupa, ditemukan test, bukan dugaan.** Draf
pertama `FormulirPerusahaan` tidak menulis `noValidate` pada `<form>`.
Kolom nama menulis atribut `required` (lewat `KolomForm`, untuk pengumuman
screen reader) — dan `required` juga membuat PERAMBAN memblokir submit
serta menampilkan gelembung validasi bawaannya sendiri, dalam bahasa
peramban, tidak tersambung ke kolom manapun. Akibatnya `onSubmit` — dan
seluruh pesan galat Bahasa Indonesia yang tersambung `aria-describedby` —
TIDAK PERNAH terpanggil sama sekali pada form kosong. Bug produksi
sungguhan, ditangkap `admin-companies.test.tsx` (bukan e2e — jsdom cukup
displin untuk menegakkan constraint validation API yang sama seperti
peramban), sebelum sempat terkirim. Pola yang sama PERSIS sudah didokumentasikan
di `profil/daftar-karier.ts` (PR-040) dengan catatan "terbukti, bukan diduga"
— dan sekarang terbukti dua kali.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9 — `@nawasena/api-client`
**9 berkas / 80 lulus**, `@nawasena/web` **48 berkas / 625 lulus**. Build
produksi + `cek:budget`: 110,2/200 KB gzip (LOLOS). `playwright test`
(browser Chromium nyata, atas hasil build): 11/11 lulus, termasuk alur penuh
klik "Ubah" dari daftar → form terisi data nyata → buka dialog verifikasi →
konfirmasi → badge berubah jadi "Terverifikasi" → tombol Verifikasi hilang.

### Scope selesai

**`packages/api-client` (baru: endpoint companies)**

* **`src/endpoints/companies.ts`** — `listCompaniesAdmin`, `createCompanyAdmin`,
  `updateCompanyAdmin`, `verifyCompanyAdmin`, `companiesKeys.adminList()`
  (TANPA params — daftar penuh sama untuk semua admin, beda dengan
  `profilesKeys` yang dilingkupi `sub`). TIDAK ADA `getCompanyAdmin`: server
  memang tidak menyediakannya (lihat keputusan #3).
* **`__tests__/companies.test.ts`** (11 test) — amplop `{data}` dibuka, body
  divalidasi SEBELUM berangkat (`inclusivityStatus: "verified"` ditolak DI
  KLIEN, taksonomi liar ditolak di klien), `verify` tanpa badan.

**`apps/web` (fitur `features/admin/companies-*`, route `admin-companies*`)**

* **`features/admin/companies-badan.ts`** — `NilaiPerusahaan` (form value,
  TANPA status — keputusan #2), `keNilai`/`keBadanBuat`/`keBadanUbah`.
* **`features/admin/companies-status-badge.tsx`** — `StatusBadge`: teks
  ("Terverifikasi"/"Klaim mandiri"/"Belum diverifikasi") sebagai sumber
  kebenaran, warna sebagai penguat (WCAG 1.4.1).
* **`features/admin/companies-formulir.tsx`** — `FormulirPerusahaan`:
  nama/deskripsi/website/kota + fieldset taksonomi akomodasi (checkbox dari
  `ACCOMMODATION_NEEDS`, label DIPINJAM dari katalog `profil` — taksonomi yang
  sama harus terbaca sama oleh admin dan pencari kerja). `noValidate` (lihat
  kejadian di atas).
* **`features/admin/companies-daftar.tsx`** — `DaftarPerusahaan`: `Tabel`
  dengan tiga kolom sortable (nama/kota/status) + kolom aksi ("Ubah" ber-
  `aria-label` menyebut nama perusahaan), sortir CLIENT-SIDE (daftar admin
  tanpa pagination, PR-051).
* **`features/admin/companies-pesan-galat.ts`** — `periksa`/`pesanGalatSimpan`
  (pola sama `profil/pesan-galat.ts`, diduplikasi bukan diimpor lintas fitur).
* **`routes/admin-companies.tsx`** — halaman daftar, delegasi tipis ke
  `DaftarPerusahaan`. Impor LANGSUNG ke berkas fitur (bukan barrel
  `features/admin/index.js`) — barrel itu juga mengekspor `FormulirPerusahaan`
  yang memakai katalog `profil`, dan mengimpornya lewat barrel akan membuat
  `i18n-lazy.test.ts` mengira halaman daftar butuh katalog yang tidak pernah
  ia pakai (ditangkap test, diperbaiki sebelum commit).
* **`routes/admin-companies-formulir.tsx`** — satu komponen untuk BUAT dan
  UBAH (`useParams().id` menentukan mode), mutasi `simpan`+`verifikasi`
  memakai `queryClient.setQueryData` (bukan `invalidateQueries`) untuk
  memperbarui cache daftar SEKETIKA tanpa permintaan tambahan.
* **`app/routes.ts`** — tiga route baru sebagai SAUDARA (bukan anak
  "companies") di bawah `admin`: "companies/baru" dan "companies/:id"
  masing-masing halaman PENUH, tidak berbagi kerangka navigasi tambahan.
* **`routes/admin.tsx`** — `SEKSI` bertambah entri "Perusahaan"; panel
  `AdminRingkasan` diperbarui dari placeholder "belum ada modul" (PR-052)
  menjadi kartu tautan sungguhan ke `/admin/companies` — placeholder lama
  sudah tidak jujur begitu modul companies ada.
* **`shared/i18n/katalog/admin.ts`** — ~40 kunci baru `admin.companies.*` +
  `admin.nav.companies` + `admin.ringkasan.companies.*`.

**Test (3 berkas baru)**

* `apps/web/__tests__/admin-companies.test.tsx` (13 test, jsdom/testing-library)
  — daftar (render, kosong, sortir, aria-label aksi), formulir tambah
  (validasi kosong SEBELUM terkirim, submit sukses + redirect, taksonomi),
  formulir ubah (terisi, tidak ditemukan, submit), verifikasi (dialog, batal,
  konfirmasi + badge berubah).
* `e2e/admin-companies.spec.ts` (3 test, Playwright/Chromium) — alur SUNGGUHAN
  lewat klik (bukan navigasi langsung dengan id palsu): daftar→Ubah→form
  terisi (axe), dialog verifikasi terbuka (axe) + konfirmasi, alur
  Buat→redirect ke Ubah.
* `e2e/halaman.ts` + `e2e/palsukan-api.ts` — 3 entri baru di registry axe
  generik (daftar, tambah, ubah-tidak-ditemukan) + mock
  `/admin/companies*`.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Halaman terpisah untuk buat/ubah | Form panjang (7 kolom + taksonomi) lebih aksesibel di halaman sendiri; URL bisa ditandai/dibagikan | Dialog (fokus-trap pada form sepanjang ini merepotkan) atau baris tabel yang berubah jadi form (`Tabel` berbasis `<table>` asli, bukan `<ul>`) — ditanyakan ke user, dijawab eksplisit |
| Status verifikasi bukan field form biasa | `PUT` yang bisa mengubah status berisiko menurunkannya tanpa sengaja saat admin hanya memperbaiki field lain | Dropdown status di form utama — ditolak; mengulang risiko yang sudah dihindari di PR-051 (`editableInclusivityStatusSchema`) |
| Cache list diperbarui via `setQueryData`, bukan `invalidateQueries` | Respons mutasi (create/update/verify) SUDAH berisi baris lengkap — memvalidasi ulang berarti permintaan GET tambahan yang jawabannya sudah kita punya | `invalidateQueries` saja — ditolak; menambah latensi terlihat tanpa manfaat |
| Route dinamis diuji lewat alur klik sungguhan (`admin-companies.spec.ts`), bukan `HALAMAN` generik | `registry-halaman.test.ts` menavigasi literal `/admin/companies/:id` — `useParams().id` karena itu SELALU literal `":id"`, tidak pernah cocok UUID sungguhan manapun | Memaksakan fixture ber-id `":id"` — ditolak; gagal validasi `idSchema` (UUID) di `companyAdminListResponseSchema`, menghasilkan galat SALAH ("respons tidak dikenal", bukan "tidak ditemukan") |

### Risiko & batas yang diketahui

* **Un-verify tidak ada di UI.** PUT admin tetap menerimanya (PR-051), tetapi
  admin harus memakai jalur lain (curl/Prisma Studio) untuk mengoreksi status
  "verified" yang keliru sampai UI-nya dibangun (tidak diminta AC PR-053).
* **Sortir daftar sepenuhnya client-side.** Aman untuk skala pilot
  (puluhan perusahaan, PR-051 sengaja tanpa pagination); perlu direvisi
  bersamaan bila/ketika daftar admin lain mendapat pagination.
* **Manual verification terhadap data seed TIDAK diulang di sesi ini** —
  kontrak respons yang dikonsumsi FE ini sudah diverifikasi manual (curl)
  terhadap 5 perusahaan seed sungguhan di sesi PR-051; sesi ini bersandar
  pada kesamaan kontrak itu, bukan menjalankan ulang verifikasi live.

### Next steps

* **PR-054** — Halaman publik perusahaan, konsumen `GET /companies/:id`.
* **PR-055/057** — Jobs BE + Admin Jobs FE — pemakai `Tabel` berikutnya;
  polanya (halaman terpisah, cache via `setQueryData`) bisa dipinjam langsung.
* **Un-verify UI** — bila kelak dibutuhkan, tambahkan sebagai aksi terpisah
  (dialog sendiri) di `admin-companies-formulir.tsx`, BUKAN sebagai field
  dropdown di form utama — alasannya di keputusan #2 tetap berlaku.

---

## PR-054 — Company Public Profile Page (Gap G5)

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-054---company-public-profile-page-gap-g5)
> **Tanggal:** 2026-09-13
> **Status:** Selesai

### Ringkasan hasil

Halaman publik `/companies/:id` (US-09): profil inklusivitas perusahaan
(akomodasi, badge verifikasi) plus lowongan aktifnya, dilihat kandidat
SEBELUM melamar — sering tanpa sesi. Satu endpoint backend baru,
`GET /api/v1/companies/:id/jobs`, ditambahkan di modul `companies` yang sudah
ada (bukan modul `jobs`, yang belum lahir sampai PR-055).

Tiga keputusan yang membentuk seluruh sisanya:

**1. Tautan lowongan menunjuk ke `/lowongan/:id` SEKARANG, meski halaman
tujuannya sendiri baru lahir di PR-059** (dikonfirmasi via `AskUserQuestion`
sebelum implementasi). AC "daftar lowongan aktif tertaut ke detail" dibaca
sebagai tuntutan struktural — `<a href>` sungguhan, bukan kartu tak
interaktif yang harus ditulis ulang nanti. Sampai PR-059 mendaftarkan rute
itu, tautannya 404 lewat catch-all `routes.ts`, sama seperti tautan mana pun
ke rute yang belum lahir — bukan cacat, melainkan urutan backlog yang sudah
diketahui.

**2. Query lowongan aktif hidup di `modules/companies`, bukan `modules/jobs`.**
Tabel `jobs` sendiri sudah ada sejak migrasi 03 (PR-011), tetapi modul
`jobs` belum ada sebagai modul (hanya stub `expiry.service.ts` dari PR-024b)
— tidak ada batas modul untuk dilanggar, dan dokumen phase sendiri menyebut
endpoint ini sebagai tambahan pada modul yang sudah ada. `repositories/
active-jobs.repository.ts` sengaja berkas TERPISAH dari
`companies.repository.ts` (satu model `Company`, satu model `Job`) supaya
query ini bisa pindah APA ADANYA begitu `modules/jobs` sungguhan lahir.
"Aktif" = `status: "published"` DAN (`expiresAt` null ATAU belum lewat) —
definisi yang SAMA dengan kriteria auto-close `jobs/expiry.service.ts`
(PR-024b), diverifikasi silang supaya kedua penulis code tidak diam-diam
menyimpang.

**3. Status verifikasi publik memakai PIL pendek + SATU kalimat penjelasan,
bukan kalimat panjang sebagai satu-satunya bentuk.** Draf pertama menulis
kalimat penuh langsung di dalam badge ("Perusahaan ini sudah
diverifikasi tim kami..."); direvisi menjadi pola yang sama dengan badge
admin (PR-053) — pil pendek ("Terverifikasi"/"Klaim mandiri"/"Belum
diverifikasi") sebagai penanda utama, plus satu kalimat di bawahnya yang
menjelaskan ARTINYA bagi kandidat. AC "dibedakan tekstual, bukan warna saja"
sudah terpenuhi oleh pil itu sendiri; kalimat tambahan murni untuk audiens
yang berbeda dari versi admin.

**KEJADIAN: retry bawaan TanStack Query (`MAKS_RETRY=2`, backoff berjenjang)
membuat keadaan "perusahaan tidak ditemukan" tertahan ~3 detik di layar
kerangka sebelum pesannya tampil — ditemukan test (`company-public.test.tsx`,
timeout `findByText`), bukan dugaan.** `PERUSAHAAN_TIDAK_DITEMUKAN` adalah
kegagalan PERMANEN, bukan sementara: mengulanginya tidak pernah berhasil.
Query profil publik diberi `retry` kustom yang menyerah SEGERA khusus untuk
kode ini, sementara kegagalan lain (jaringan, 5xx) tetap memakai bawaan.
Satu-satunya query di `apps/web` yang menimpa `retry` bawaan — dicatat
sebagai preseden, bukan pola yang harus ditiru tanpa alasan setara.

Gate hijau: `pnpm lint` 10/10, `pnpm typecheck` 10/10 — `@nawasena/api`
**110 berkas / 1610 lulus**, `@nawasena/schemas` **3 berkas / 84 lulus**,
`@nawasena/api-client` **9 berkas / 86 lulus**, `@nawasena/web` **50 berkas /
641 lulus**. Build produksi + `cek:budget`: 110,4/200 KB gzip (LOLOS),
`company-public-*.js` terkonfirmasi di daftar chunk lazy — TIDAK di payload
awal. `playwright test:a11y` (browser Chromium nyata, atas hasil build):
74/74 lulus, termasuk keadaan "tidak ditemukan" (navigasi literal `:id`,
`e2e/aksesibilitas.spec.ts`) DAN keadaan terisi dengan data nyata
(`e2e/companies-public.spec.ts`, axe pass).

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/jobs.ts`** — `employmentTypeSchema`, `workModeSchema`,
  `jobPublicSummarySchema` (ringkasan tanpa field internal — `id`, `title`,
  `employmentType`, `workMode`, `city`, `province`, `publishedAt`),
  `companyActiveJobsResponseSchema`.
* **`src/openapi.ts` + `openapi.json`** — `GET /companies/{id}/jobs`
  didokumentasikan (publik, `security: []`, sama sifatnya dengan
  `GET /companies/{id}`).

**Backend (`apps/api/src/modules/companies/`)**

* **`repositories/active-jobs.repository.ts`** (baru) — `listActiveByCompany`,
  lihat keputusan #2.
* **`services/companies.service.ts`** — `getActiveJobs(id)`: 404
  `PERUSAHAAN_TIDAK_DITEMUKAN` bila perusahaannya sendiri tidak ada (mencegah
  `[]` yang ambigu antara "tidak ada lowongan" dan "tidak ada perusahaan"),
  lalu memetakan baris repository ke `JobPublicSummary`.
* **`controllers/` + `routers/`** — `GET /companies/:id/jobs`,
  `access.public(...)`, `validate({params: companyIdParamsSchema})`.
* **`index.ts`** — `activeJobsRepository` disuntik ke `createCompaniesService`.

**Frontend (`apps/web`, feature publik baru `features/companies-publik/`)**

* **`shared/i18n/katalog/companies.ts`** (baru) — katalog TERPISAH dari
  `admin` (halaman ini dibuka tanpa sesi; memuat katalog admin untuknya akan
  mengunduh teks kurasi yang tidak pernah terlihat) + wiring
  (`registri.ts`, `katalog/index.ts`, `katalog/semua.ts`, `__tests__/setup.ts`).
* **`features/companies-publik/status-badge.tsx`** — `StatusBadgePublik`,
  lihat keputusan #3.
* **`features/companies-publik/akomodasi-daftar.tsx`** — `DaftarAkomodasi`:
  satu bentuk ikon (centang, dekoratif, `aria-hidden`) + LABEL TEKS PENUH per
  akomodasi, label dipinjam dari katalog `profil` (taksonomi sama dengan
  admin dan panel profil pencari kerja).
* **`features/companies-publik/lowongan-daftar.tsx`** — `DaftarLowongan`:
  query `getCompanyActiveJobs`, kartu per lowongan dengan tautan
  `/lowongan/:id` (keputusan #1), keadaan kosong/galat sendiri.
* **`features/companies-publik/pesan-galat.ts`** — pola sama
  `features/admin/companies-pesan-galat.ts`.
* **`routes/company-public.tsx`** — `ProfilPerusahaanPublik`: h1 nama →
  h2 Akomodasi → h2 Lowongan aktif, TANPA `<Terlindungi>` (publik dengan
  sengaja), `retry` kustom pada query profil (lihat kejadian di atas).
* **`app/routes.ts`** — route `companies/:id` sebagai SAUDARA `admin`, lazy,
  `muatKatalog("companies", "profil")`.
* **`packages/api-client/src/endpoints/companies.ts`** — `getCompanyPublic`,
  `getCompanyActiveJobs`, `companiesKeys.public(id)`/`activeJobs(id)`
  (dilingkupi `id`, beda dari `adminList()` yang tanpa params).

**Test (4 berkas baru, 3 diperluas)**

* `apps/api/__tests__/companies.test.ts` (+3) — `getActiveJobs`: lowongan
  aktif kembali, perusahaan tanpa lowongan → `[]`, perusahaan tidak ada →
  404 (bukan `[]` senyap).
* `apps/api/__tests__/companies-http.test.ts` (+4, AC-6 baru) — publik tanpa
  token, filter status(`published`)+`expiresAt` (draft/closed/kedaluwarsa
  dikecualikan, tanpa-tenggat tetap aktif), tidak bocor ke perusahaan lain,
  404 perusahaan tidak ada; registry akses (PR-019) diperbarui: dua route
  publik.
* `packages/api-client/__tests__/companies.test.ts` (+7) — amplop dibuka
  (hanya field publik), id via `encodeURIComponent`, kontrak ditolak jika
  menyimpang, bentuk `companiesKeys.public`/`activeJobs`.
* `apps/web/__tests__/company-public.test.tsx` (baru, 8 test, jsdom) — h1 +
  badge tekstual verified/self-claimed, struktur heading (h1→h2→h2), label
  akomodasi (bukan ikon saja), tautan lowongan ke `/lowongan/:id`, keadaan
  kosong (akomodasi & lowongan), keadaan "tidak ditemukan".
* `e2e/companies-public.spec.ts` (baru) — navigasi LANGSUNG ke UUID
  sungguhan (berbeda dari `admin-companies.spec.ts`: halaman ini publik,
  tidak perlu alur klik untuk mendapat id nyata), axe pass atas data terisi.
* `e2e/halaman.ts` + `e2e/palsukan-api.ts` — entri registry baru (keadaan
  "tidak ditemukan", literal `:id`) + fixture `PERUSAHAAN_PUBLIK_UJI_ID`
  terpisah dari `PERUSAHAAN_UJI_ID` admin, mock `GET /companies/:id` +
  `GET /companies/:id/jobs` diberi jangkar `^/api/v1/companies/` supaya
  tidak menelan permintaan `/admin/companies/:id`.
* `apps/web/__tests__/katalog-kelengkapan.test.ts` — empat entri baru di
  `SAMA_DENGAN_SENGAJA` (label pendek yang `id`/`id-simple`-nya memang sama).

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Tautan lowongan ke `/lowongan/:id` sekarang, walau halamannya lahir PR-059 | AC dibaca struktural; tidak perlu ditulis ulang begitu PR-059 mendaftarkan rutenya | Kartu tak-interaktif sampai PR-059 — ditanyakan ke user, dijawab eksplisit: ditolak, butuh revisi kelak tanpa manfaat hari ini |
| Query lowongan aktif di `modules/companies`, bukan `modules/jobs` | `modules/jobs` belum ada sebagai modul; tabel `Job` sudah ada sejak PR-011; dokumen phase menyebutnya tambahan pada modul yang ada | Membuat kerangka `modules/jobs` minimal hanya untuk satu query — scope creep di luar PR-054 |
| Badge publik: pil pendek + satu kalimat penjelasan | AC "dibedakan tekstual" sudah terpenuhi pil pendek (pola sama admin); kalimat tambahan menjawab "artinya apa" bagi audiens kandidat | Kalimat panjang sebagai satu-satunya bentuk — draf awal, direvisi: sulit dipindai, tidak konsisten dengan pola badge admin |
| Retry kustom (menyerah segera) pada `PERUSAHAAN_TIDAK_DITEMUKAN` | Kegagalan permanen; retry bawaan menahan pengguna di kerangka pemuatan ~3 detik sebelum pesan yang sudah pasti sejak percobaan pertama | Membiarkan retry bawaan — ditemukan gagal test dengan timeout; pengalaman pengguna nyata sama buruknya |

### Risiko & batas yang diketahui

* **NVDA sungguhan TIDAK dijalankan** — sama seperti PR-052/053; axe (jsdom
  dan Chromium nyata) menggantikannya, bukan menirunya sepenuhnya.
* **Manual verification terhadap data seed TIDAK diulang di sesi ini** —
  bersandar pada kesamaan kontrak `companyPublicResponseSchema`/
  `companyActiveJobsResponseSchema` dengan mock (`palsukanApi`), pola yang
  sama dengan catatan PR-053.
* **Tautan `/lowongan/:id` 404 sampai PR-059.** Dicatat dengan sengaja
  (keputusan #1) — bukan cacat yang terlewat, tetapi urutan backlog yang
  sudah diketahui sejak sebelum PR-054 dimulai.
* **Retry kustom adalah SATU-SATUNYA query di `apps/web` yang menimpa
  bawaan `query-client.ts`.** Bila pola ini terbukti berguna di endpoint 404
  lain (mis. lowongan itu sendiri di PR-059), pertimbangkan mengangkatnya
  jadi helper bersama alih-alih menyalin logikanya lagi.

### Next steps

* **PR-055** — Jobs BE (CRUD + lifecycle) — modul `jobs` sungguhan lahir;
  `active-jobs.repository.ts` di `modules/companies` bisa dipindah ke sana
  APA ADANYA (lihat keputusan #2).
* **PR-059** — Halaman detail lowongan di `/lowongan/:id` — mengisi rute
  yang sudah ditautkan PR-054 (keputusan #1); begitu terdaftar, tautan dari
  halaman ini berhenti 404 tanpa perlu menyentuh kode PR-054 sama sekali.
* **PR-058** — Halaman browse publik lowongan — kemungkinan pemakai kedua
  `KUNCI_TIPE`/`KUNCI_MODE` (`features/companies-publik/lowongan-daftar.tsx`);
  pertimbangkan mengangkatnya ke katalog bersama bila polanya berulang.

---

## PR-055 — Jobs BE — CRUD + Lifecycle

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-055---jobs-be--crud--lifecycle)
> **Tanggal:** 2026-09-13
> **Status:** Selesai

### Ringkasan hasil

Modul `jobs` lahir UTUH dari router sampai repository — sebelumnya hanya ada
lapisan service parsial (`expiry.service.ts`, PR-024b, penutupan otomatis).
CRUD admin penuh, state machine `draft → published → closed` yang KETAT
(tanpa jalan mundur), validasi akomodasi wajib sebelum publish, dan endpoint
publik `GET /jobs/:id` yang hanya pernah menjawab lowongan aktif. Tidak ada
migrasi — tabel `jobs` sudah ada sejak migrasi 03 (PR-011).

`active-jobs.repository.ts` yang lahir sementara di `modules/companies`
(PR-054, untuk melayani `GET /companies/:id/jobs` sebelum modul `jobs`
sungguhan ada) DIPINDAHKAN ke sini apa adanya — persis rencana yang dicatat
di "Next steps" PR-054 — dan `companies.service.ts` sekarang memanggil
`JobsService.listActiveByCompany()` (komunikasi antar-modul lewat lapisan
service, CLAUDE.md §3.2) alih-alih menyentuh `prisma.job` sendiri.

Empat keputusan yang membentuk seluruh sisanya:

**1. DELETE /admin/jobs/:id ditambahkan, di luar API Changes yang tertulis
di dokumen phase** (dikonfirmasi via `AskUserQuestion` sebelum implementasi).
Dokumen PR-055 mendaftar GET/POST/PUT/publish/close saja, tetapi AC eksplisit
"Delete lowongan berlamaran → ditolak; close = jalur resmi" mengasumsikan ada
jalur delete sungguhan untuk diuji. Lowongan TANPA lamaran (draft yang salah
dibuat) bisa dihapus (204); yang BERLAMARAN ditolak 409 — FK Restrict Prisma
(`P2003`) ditangkap repository dan dipetakan ke error rapi, bukan exception
mentah yang bocor ke klien.

**2. State machine TANPA idempotensi, beda dari `verify()` companies.**
`publish()` hanya menerima dari `draft`; `close()` hanya menerima dari
`published`. Memanggil ulang aksi yang sama (publish yang sudah published,
close yang sudah closed) DITOLAK 409 `TRANSISI_STATUS_TIDAK_VALID` — bukan
dibiarkan lolos begitu saja seperti `company.verify()` yang sengaja idempoten
(PR-051). AC PR-055 eksplisit "Transisi status ilegal ditolak" tanpa
pengecualian apa pun, jadi tidak ada alasan meniru pola company di sini.

**3. Audit publish/close/create/update/delete SEMUANYA memakai
`ADMIN_RESOURCE_CHANGED` yang sudah ada — TANPA aksi audit baru.** Meta
schema `auditMetaSchemas[ADMIN_RESOURCE_CHANGED]` (PR-014) SUDAH mengontrak
`operation: z.enum(["create","update","publish","close","moderate"])`
sebelum modul `jobs` pernah ada — komentar `JOB_AUTO_CLOSED` di `audit.ts`
bahkan secara eksplisit menyebut alasannya TIDAK memakai kode ini ("namanya
berkata ADMIN, sementara pelakunya sistem"), yang berarti sebaliknya berlaku:
tindakan ADMIN (publish/close/delete manual) MEMANG dimaksudkan memakai kode
ini. Satu-satunya perubahan kontrak: menambah `"delete"` ke enum
`operation` (aditif, tidak mengubah data lama).

**4. `job.closed` (event domain) dipakai ULANG untuk penutupan manual,
dibedakan lewat `reason: "closed_by_admin"` — bukan event baru.**
Komentar `jobCloseReasonSchema` sejak PR-024b sudah eksplisit mengantisipasi
ini: "saat penutupan manual lahir (Phase 08), pelanggan yang sudah
mendengarkan event ini perlu bisa membedakan keduanya". Menambah nilai enum
itu sekarang menepati janji itu, tanpa memaksa pelanggan lama (belum ada)
menangani nama event kedua.

Gate hijau: `pnpm lint` 10/10, `pnpm typecheck` 10/10 — `@nawasena/api`
**113 berkas / 1655 lulus** (1 skip tak terkait), `@nawasena/schemas`
**3 berkas / 60 lulus**. `pnpm --filter @nawasena/schemas check:openapi`
sinkron.

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/jobs.ts`** — `jobStatusSchema`, `jobSourceSchema`, `jobPublicSchema`
  (tanpa `status`/`source`/`createdBy`/`salaryVisible` — field internal),
  `jobAdminSchema` (lengkap), `jobIdParamsSchema`, `createJobSchema`
  (`.strict()`, `companyId` wajib, `status`/`source` TIDAK ada — server yang
  menentukan), `updateJobSchema` (`.partial().strict()`, TIDAK memuat
  `companyId` maupun `status`), keduanya `.superRefine` menolak
  `salaryMin > salaryMax`. `jobPublishedEventSchema` baru. `jobCloseReasonSchema`
  diperluas: `["expired", "closed_by_admin"]` (lihat keputusan #4).
* **`src/audit.ts`** — `operation` di `auditMetaSchemas[ADMIN_RESOURCE_CHANGED]`
  diperluas: `+ "delete"` (lihat keputusan #3). Tidak ada aksi audit baru.
* **`src/openapi.ts` + `openapi.json`** — enam endpoint jobs didokumentasikan
  (`/jobs/{id}` publik, lima `/admin/jobs*`).

**Core**

* **`core/events/index.ts`** — satu entri baru di `DomainEvents`:
  `job.published`. Belum ada pelanggan — sama seperti `company.verified` saat
  lahir di PR-051.
* **`core/http/errors.ts`** — tiga kode baru: `LOWONGAN_TIDAK_DITEMUKAN` (404),
  `TRANSISI_STATUS_TIDAK_VALID` (409), `AKOMODASI_LOWONGAN_KOSONG` (422),
  `LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS` (409).

**Modul (`apps/api/src/modules/jobs/`, dilengkapi dari parsial PR-024b)**

* **`repositories/jobs.repository.ts`** (baru) — `listAdmin`, `findById`,
  `listActiveByCompany` (dipindah dari `modules/companies`, keputusan
  pemindahan di atas), `create` (menangkap `P2003` → sentinel
  `"perusahaan-tidak-ada"`, pola sama `ai-usage.repository.ts`), `update`,
  `publish`/`close` (TERPISAH dari `update`, murni mekanis — kelegalan
  transisi diputuskan SERVICE, bukan di sini), `delete` (menangkap
  `P2025`/`P2003` → sentinel `"tidak-ditemukan"`/`"berlamaran"`).
* **`services/jobs.service.ts`** — state machine (keputusan #2), validasi
  akomodasi sebelum publish, redaksi `salaryMin`/`salaryMax` berdasar
  `salaryVisible` di `getPublic` (satu-satunya jalur publik), `listActiveByCompany`
  untuk konsumen antar-modul (`companies.service.ts`).
* **`controllers/` + `routers/`** — `access.public(...)` untuk
  `GET /jobs/:id`, `access.role("admin")` untuk lima route admin
  (termasuk `DELETE`, keputusan #1).
* **`index.ts`** — factory `createJobsModule()` PERTAMA di modul ini
  (sebelumnya hanya re-export `expiry.service.ts`); keduanya kini
  berdampingan di `index.ts` yang sama.

**Modul (`apps/api/src/modules/companies/`, disesuaikan)**

* **`repositories/active-jobs.repository.ts`** — DIHAPUS, dipindah ke
  `modules/jobs` apa adanya.
* **`services/companies.service.ts`** — `CompaniesServiceDeps.jobsService:
  JobsService` menggantikan `activeJobsRepository`; `getActiveJobs()`
  mendelegasikan ke `jobsService.listActiveByCompany()`. `JobsService`
  diekspor ulang dari sini (bukan diimpor langsung dari `../../index.ts`) —
  `eslint-plugin-boundaries` melarang elemen `module-shared` (`index.ts`)
  menyentuh modul lain sama sekali, bahkan untuk tipe; hanya elemen
  `service` yang dilonggarkan lintas modul.
* **`index.ts`** — `CompaniesModuleDeps.jobsService: JobsService` (tipe
  diimpor dari `./services/companies.service.js`, alasan di atas).

**`apps/api/src/boot.ts`** — `createJobsModule()` dirakit SEBELUM
`createCompaniesModule()`, hasilnya (`jobs.service`) disuntikkan ke deps
companies.

**Test (2 berkas baru, 3 diperluas)**

* `jobs.test.ts` (28 test) — unit service dengan fake repository: state
  machine kedua arah (publish/close, termasuk penolakan idempotensi),
  akomodasi kosong ditolak, redaksi gaji, event publish/close, delete
  (dihapus/berlamaran/tidak-ditemukan), create (companyId valid/tidak valid).
* `jobs-http.test.ts` (34 test) — server Express nyata: matriks akses
  (401/403 di enam route admin), CRUD, validasi taksonomi & rentang gaji,
  publish/close/delete via HTTP (FK Restrict `P2003` → 409 sungguhan lewat
  Prisma palsu), deklarasi route (PR-019).
* `companies.test.ts`/`companies-http.test.ts` — `fakeJobsService`/fake
  `JobsService` menggantikan `fakeActiveJobsRepo`/fake `job` Prisma table
  (komunikasi antar-modul kini lewat service, bukan `prisma.job` langsung).
* `openapi-parity.test.ts` — `createJobsModule` ikut dirakit; `jobsService`
  disuntikkan ke `createCompaniesModule`.
* `schemas.test.ts` (+12) — `createJobSchema`/`updateJobSchema` valid &
  invalid (taksonomi, rentang gaji, `status`/`companyId` tidak bisa diubah
  lewat update), bentuk `jobPublishedEventSchema`, `jobCloseReasonSchema`.
* `http-errors.test.ts` — snapshot katalog error diperbarui (4 kode baru).

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Tambah `DELETE /admin/jobs/:id` (di luar API Changes tertulis) | AC eksplisit menguji penolakan delete-berlamaran, yang menuntut jalur delete sungguhan untuk diuji lewat HTTP | Tanpa endpoint DELETE, AC diuji hanya di level DB/repository — ditanyakan ke user, dijawab eksplisit: ditolak, AC harus teruji lewat permukaan HTTP sungguhan seperti PR lain |
| State machine TANPA idempotensi (beda dari `company.verify()`) | AC "transisi ilegal ditolak" eksplisit tanpa pengecualian; tidak ada AC yang meminta re-publish/re-close diperbolehkan | Meniru idempotensi `verify()` — ditolak; itu keputusan PR-051 yang punya AC-nya sendiri ("re-verifikasi setelah koreksi"), tidak berlaku otomatis di sini |
| Audit lewat `ADMIN_RESOURCE_CHANGED` yang sudah ada, bukan aksi baru | `operation` sudah pra-mengontrak `"publish"`/`"close"` sejak PR-014, sebelum modul `jobs` ada — komentar `JOB_AUTO_CLOSED` mengonfirmasi niat ini secara eksplisit | Aksi audit baru `JOB_PUBLISHED`/`JOB_CLOSED` (meniru `COMPANY_VERIFIED`) — ditolak; mengabaikan kontrak yang sudah disiapkan tepat untuk kasus ini |
| `job.closed` dipakai ulang dengan `reason` baru, bukan event baru | `jobCloseReasonSchema` sejak PR-024b sudah menulis niat ini secara eksplisit di komentarnya | Event `job.closed_by_admin` terpisah — ditolak; memecah satu transisi status menjadi dua nama event yang harus didengarkan terpisah |
| `active-jobs.repository.ts` dipindah APA ADANYA ke `modules/jobs` | Rencana eksplisit sejak PR-054 ("Next steps"); satu model (`Job`), satu lokasi kepemilikan query | Membiarkannya di `modules/companies` — ditolak; `modules/jobs` sekarang ada, dan companies tidak lagi punya alasan menyentuh `prisma.job` |

### Risiko & batas yang diketahui

* **Tidak ada E2E di PR ini** — sesuai rencana dokumen phase ("E2E Test via
  PR-057"): PR-055 murni backend, tidak ada permukaan yang bisa diuji
  Playwright sampai Admin Jobs FE (PR-057) lahir.
* **Manual verification terhadap data seed TIDAK diulang di sesi ini** —
  bersandar pada kesepadanan kontrak (`openapi-parity.test.ts`), pola yang
  sama dengan catatan PR-053/054.
* **Taksonomi akomodasi kurang lengkap** (risiko yang sudah dicatat dokumen
  phase) — mitigasinya sama: taksonomi versioned di `packages/schemas`,
  mudah ditambah tanpa migrasi.
* **Tidak ada rubrik "kapan akomodasi dianggap cukup"** — publish hanya
  menuntut MINIMAL SATU akomodasi terisi (AC eksplisit), bukan kelengkapan
  taksonomi tertentu. Sama filosofinya dengan tidak adanya rubrik verifikasi
  tertulis di PR-051.

### Next steps

* **PR-056** — Jobs BE Search FTS + Filter Faceted — konsumen tabel `jobs`
  berikutnya, di luar scope CRUD/lifecycle PR ini.
* **PR-057** — Admin Jobs FE — konsumen pertama endpoint admin di sini,
  E2E yang ditunda dari PR-055 dijalankan di sana.
* **PR-058/PR-059** — Halaman browse & detail lowongan publik — konsumen
  `GET /jobs/:id`; PR-059 juga tempat tautan `/lowongan/:id` dari halaman
  publik perusahaan (PR-054) berhenti 404.

---

## PR-056 — Jobs BE — Search FTS + Filter Faceted

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-056---jobs-be--search-fts--filter-faceted)
> **Tanggal:** 2026-09-14
> **Status:** Selesai

### Ringkasan hasil

`GET /api/v1/jobs` — pencarian publik lowongan: FTS bahasa Indonesia
(`title`+`description`) ATAU kemiripan kata trigram (toleransi typo ringan)
pada judul, filter kota/provinsi/mode kerja/akomodasi (⊇ — job harus punya
SEMUA akomodasi yang diminta), dan cursor pagination. Satu-satunya query raw
SQL modul `jobs` (Prisma tidak punya API untuk FTS/trigram/containment jsonb);
tidak ada migrasi — ketiga indeks GIN dan indeks komposit `(status,
published_at DESC)` sudah ada sejak migrasi 03 (PR-011), PR ini murni
memakainya.

Empat keputusan yang membentuk seluruh sisanya:

**1. Trigram pakai operator `<%` (kemiripan KATA), BUKAN `%` (kemiripan
string-penuh) — koreksi terhadap rencana awal implementasi sendiri.**
Percobaan pertama memakai `title % query` gagal lolos test DB: query pendek
("pelangan") dibandingkan trigram SELURUH judul multi-kata ("Staf Layanan
Pelanggan") nyaris selalu jatuh di bawah ambang batas similarity, sebab
proporsi trigram yang beririsan terhadap total trigram judul kecil. `<%`
(`word_similarity`) mencari kecocokan SEBAGIAN — apakah `query` mirip SALAH
SATU kata di dalam `title` — bentuk yang sebenarnya dimaksud AC "typo ringan
tetap menemukan". Keduanya didukung indeks GIN `gin_trgm_ops` yang sama
(`jobs_title_trgm`); bukti EXPLAIN di bawah memakai `<%`.

**2. Cursor pagination DIPINDAHKAN dari `modules/notifications/services/kursor.ts`
ke `core/pagination/index.ts` — menepati janji komentar aslinya.** Komentar
`kursor.ts` sejak PR-047 sudah eksplisit menyatakan "begitu konsumen KEDUA
lahir, kode ini pindah ke core apa adanya". PR-056 adalah konsumen kedua itu.
Field posisi digeneralisasi dari `createdAt` (nama kolom domain notifikasi)
menjadi `sortAt` (generik) — modul `core/pagination` sengaja tidak tahu kolom
apa yang dipakai pemanggilnya untuk mengurutkan (`createdAt` di notifikasi,
`publishedAt` di lowongan); pemanggil memetakan sendiri di titik pemakaian.
Format cursor (base64url dari `ISO8601|id`) TIDAK berubah — kompatibel dengan
cursor lama yang mungkin masih beredar di klien.

**3. `JobSearchResult` skema BARU (bukan reuse `jobPublicSummarySchema`
PR-054) — lebih kaya, sesuai kebutuhan PR-058 yang TIDAK PUNYA Backend
Changes sendiri.** Dokumen PR-058 (Web Jobs Browse) mendaftar "Tidak ada"
untuk Backend Changes — artinya seluruh field yang dibutuhkan kartu daftar
publik (AC PR-058 "Kartu = satu kesatuan bagi SR: nama, perusahaan, akomodasi,
lokasi") HARUS sudah tersedia dari PR-056. `jobPublicSummarySchema` (dipakai
`GET /companies/:id/jobs`) sengaja minimal dan tidak menyebut nama perusahaan
(ia sudah tahu perusahaannya sendiri) maupun akomodasi — tidak cukup untuk
kartu pencarian lintas-perusahaan. `JobSearchResult` menambah `companyName`
(JOIN `companies`) dan `accommodations`.

**4. Query param `workMode` (camelCase), BUKAN `work_mode` seperti tertulis
literal di dokumen phase.** Prosa PR-056 di `phase-08-companies-jobs.md`
menulis `work_mode`, tetapi SELURUH field lain di kontrak (`packages/schemas`)
memakai camelCase tanpa kecuali (`jobPublicSchema.workMode`,
`jobAdminSchema.workMode`, dst. — SDD §11 "camelCase+Schema") dan seluruh
query param yang sudah ada (`unreadOnly` di notifikasi) juga camelCase.
`work_mode` diperlakukan sebagai penulisan prosa informal, bukan kontrak
literal yang harus diikuti persis.

Gate hijau: `pnpm typecheck`/`pnpm lint` bersih di `@nawasena/api` DAN
`@nawasena/schemas`. `@nawasena/api` **113 berkas / 1683 lulus** (1 skip tak
terkait). `@nawasena/schemas` **3 berkas / 69 lulus**.
`pnpm --filter @nawasena/schemas check:openapi` sinkron.

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/jobs.ts`** — `jobSearchQuerySchema` (`paginationQuerySchema.extend`:
  `query`/`city`/`province` opsional dengan batas panjang, `workMode` enum,
  `accommodations` via `z.preprocess` yang menyatukan bentuk array berulang
  qs (`?accommodations=a&accommodations=b`) MAUPUN satu string dipisah koma
  (`?accommodations=a,b`) sebelum divalidasi taksonomi — pola BARU, belum ada
  presedennya di repo ini untuk filter array via query string), `JobSearchResult`
  (keputusan #3), `jobSearchResponseSchema` (`data`+`meta: paginationMetaSchema`,
  reuse langsung — tidak perlu meta khusus, beda dari notifikasi yang punya
  `unreadCount`).
* **`src/openapi.ts` + `openapi.json`** — `GET /jobs` didokumentasikan,
  didaftar SEBELUM `/jobs/{id}` (daftar sebelum detail; tidak bentrok di
  Express karena jumlah segmen path beda).

**Core**

* **`core/pagination/index.ts`** (baru) — `encodeKursor`/`decodeKursor`/
  `KursorTidakValidError`/`PosisiKursor` (keputusan #2). Dipakai `jobs` DAN
  `notifications` (disesuaikan, lihat di bawah).

**Modul (`apps/api/src/modules/jobs/`)**

* **`repositories/jobs.repository.ts`** — `search()` (baru): raw SQL
  `$queryRaw`+`Prisma.sql`/`Prisma.join`, kondisi `WHERE` dirakit BERTAHAP
  (hanya kondisi yang filternya diminta), FTS (`jobs_fts_gin`) ATAU trigram
  `<%` (`jobs_title_trgm`, keputusan #1) di-OR, containment akomodasi `@>`
  (`jobs_accommodations_gin`), keyset `(published_at, id) < (cursor)` dengan
  `::uuid` eksplisit pada sisi `id` (lihat "Risiko & batas" — bug yang
  ditangkap test DB), `JOIN companies` untuk `companyName`. Urutan SELALU
  `published_at DESC, id DESC` — TIDAK diberi peringkat relevansi (rank FTS)
  meski AC tidak melarangnya; tidak ada AC yang memintanya, dan mengurutkan
  berdasar skor relevansi akan memaksa cursor menyimpan skor ter-cache (skor
  FTS bukan nilai stabil yang bisa dibandingkan lintas halaman tanpa
  menyimpan ulang query-nya di cursor) — kompleksitas yang tidak dibeli AC
  mana pun.
* **`services/jobs.service.ts`** — `search()` (baru): decode cursor (melempar
  `KursorTidakValidError` ke controller bila rusak — TIDAK ditangkap di sini,
  pola sama `notifications.service.ts`), `limit+1`/`hasMore`/`nextCursor`
  (pola sama persis `notifications.service.ts`), pemetaan `JobSearchRow` →
  `JobSearchResult`.
* **`controllers/` + `routers/`** — `GET /jobs` → `access.public(...)` (sama
  alasannya dengan `GET /jobs/:id`: kandidat mencari lowongan sering tanpa
  sesi), cursor rusak → `VALIDATION_ERROR` (pola sama
  `notifications.controller.ts`, kode error TIDAK baru).

**Modul (`apps/api/src/modules/notifications/`, disesuaikan — keputusan #2)**

* **`services/kursor.ts`** — DIHAPUS, dipindah ke `core/pagination/index.ts`
  apa adanya (field `createdAt`→`sortAt`).
* **`services/notifications.service.ts`** — impor dari `core/pagination`;
  `keKursorHalaman()` (baru, privat) memetakan `PosisiKursor.sortAt` ↔
  `KursorHalaman.createdAt` di titik pemakaian.
* **`controllers/notifications.controller.ts`**, **`index.ts`** — impor
  `KursorTidakValidError` dari `core/pagination`; re-export lokal
  (`decodeKursor`/`encodeKursor`/`KursorTidakValidError` dari `index.ts`)
  DIHAPUS — tidak ada pemakai di luar modul ini (diverifikasi via grep
  sebelum dihapus), dan modul lain kini mengimpor `core/pagination` langsung.

**Test (2 berkas baru, 3 diperluas)**

* `jobs-search.test.ts` (9 test, unit, repository palsu) — pagination
  (limit+1/hasMore/nextCursor termasuk daftar kosong), filter diteruskan apa
  adanya (termasuk yang tidak disebut → `undefined`, bukan nilai kosong),
  cursor valid/rusak, pemetaan `JobSearchResult`. FTS/trigram/containment
  SENGAJA TIDAK diuji di sini — repository palsu tidak menjalankan SQL
  sungguhan.
* `jobs-search-db.test.ts` (19 test, PostgreSQL nyata, skip otomatis bila DB
  tak terjangkau) — FTS (judul+deskripsi), trigram typo (termasuk kata yang
  "sama sekali tidak mirip" TIDAK ditemukan — bukan typo, memang beda),
  containment ⊇ (tiga arah: lebih banyak tetap cocok, sebagian tidak cocok,
  kosong tidak cocok apa pun), filter kota+workMode (AND), status
  published-only + belum expired, `companyName` dari JOIN, cursor stabil
  (penyusuran penuh tanpa lompat/ulang, baris baru lahir di tengah,
  `publishedAt` identik), cursor rusak → error, EXPLAIN empat bentuk predikat
  (bukti index, lihat di bawah), performa 1.000 seed (bukti p95, lihat di
  bawah).
* `jobs-http.test.ts` — assertion registry route diperbarui: "satu route
  publik" → "dua route publik" (`/jobs` + `/jobs/:id`), keduanya
  `access.public`.
* `jobs.test.ts` — `fakeRepo.search` stub (melempar, "tidak dipakai" — berkas
  ini menguji state machine PR-055, bukan pencarian).
* `schemas.test.ts` (+9) — `jobSearchQuerySchema`: bawaan kosong sah, batas
  `limit` (warisan `paginationQuerySchema`), `workMode` taksonomi,
  `accommodations` KETIGA bentuk input (array, string dipisah koma, nilai di
  luar taksonomi ditolak di kedua bentuk, string kosong → `undefined`),
  batas panjang `query`/`city`/`province`.

### Bukti EXPLAIN (AC)

Diambil `psql EXPLAIN` langsung terhadap dev DB lokal (Docker, `nawasena-dev-postgres-1`,
20 baris `jobs` dari data seed — bukan tabel kosong):

```
-- FTS
Bitmap Heap Scan on jobs j  (cost=153.44..208.70 rows=72 width=16)
  Recheck Cond: (to_tsvector('indonesian'::regconfig, ...) @@ '''langgan'''::tsquery)
  ->  Bitmap Index Scan on jobs_fts_gin  (cost=0.00..153.42 rows=72 width=0)

-- Trigram (<%)
Bitmap Heap Scan on jobs j  (cost=562.55..579.27 rows=6 width=16)
  Filter: ('pelangan'::text <% title)
  ->  Bitmap Index Scan on jobs_title_trgm  (cost=0.00..562.55 rows=6 width=0)
        Index Cond: (title %> 'pelangan'::text)

-- Containment akomodasi
Bitmap Heap Scan on jobs j  (cost=21.28..30.72 rows=3 width=16)
  Recheck Cond: (accommodations @> '["akses_kursi_roda"]'::jsonb)
  ->  Bitmap Index Scan on jobs_accommodations_gin  (cost=0.00..21.28 rows=3 width=0)

-- Daftar tanpa filter query (status + urut published_at)
Sort  (cost=113.00..114.53 rows=612 width=24)
  Sort Key: published_at DESC
  ->  Bitmap Heap Scan on jobs j  (cost=41.02..84.67 rows=612 width=24)
        Recheck Cond: (status = 'published'::"JobStatus")
        ->  Bitmap Index Scan on jobs_status_published_at (cost=0.00..40.87 rows=612 width=0)
```

Keempatnya dipilih planner TANPA `enable_seqscan = off` sekalipun (baris seed
saja sudah cukup membuat GIN lebih murah dari seqscan). Test otomatis
(`jobs-search-db.test.ts`, describe "EXPLAIN memakai indeks") menguji tiap
predikat SENDIRI-SENDIRI (tanpa `status = 'published'` yang repository
sesungguhnya selalu sertakan) DENGAN `enable_seqscan = off` — pada tabel test
sekecil itu, planner yang melihat `status='published'` DAN salah satu
predikat GIN akan memilih `jobs_status_published_at` (btree satu-kolom, lebih
murah di baris sedikit) dan menjadikan predikat GIN sekadar `Filter:`, BUKAN
karena indeks GIN-nya tidak terpakai — melainkan karena pada titik data test
ada indeks lain yang planner anggap lebih murah. Yang AC minta adalah bukti
BISA-tidaknya bentuk predikat ini memakai indeksnya sendiri, jadi test
mengisolasi predikatnya (pola sama `notifications-db.test.ts` mengisolasi
`notifications_unread`).

### Bukti performa (AC p95 < 200ms)

`jobs-search-db.test.ts` men-seed 1.000 lowongan `published` (kota/provinsi/
workMode/akomodasi bervariasi round-robin) lalu mengukur 20 pemanggilan
`service.search()` atas tujuh skenario (tanpa filter, FTS, trigram typo,
filter kota, filter workMode, filter akomodasi, kombinasi). **p95 terukur:
2,1 ms** — jauh di bawah ambang 200 ms.

**Batas representativitas, dicatat eksplisit:** ini dev DB lokal (Docker
Desktop, WSL2, laptop pengembang), BUKAN VPS produksi target (4 vCPU/8GB,
CLAUDE.md §1). Angkanya bukti bahwa BENTUK query memakai indeks dengan benar
(rencana eksekusi Bitmap Index Scan, bukan Seq Scan — lihat EXPLAIN di atas),
bukan jaminan angka p95 yang sama persis di produksi. Pada skala 1.000 baris
dengan indeks GIN/btree yang tepat, margin 2,1ms vs 200ms (≈95×) memberi
ruang toleransi besar terhadap perbedaan spek mesin.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Trigram `<%` (kemiripan kata), bukan `%` (kemiripan string-penuh) | `%` gagal pada query pendek vs judul multi-kata (trigram overlap kecil terhadap total) — ditemukan lewat kegagalan test DB sungguhan, bukan dugaan | `%` sesuai draf awal — ditolak, tidak lolos test "typo ringan tetap menemukan" dengan judul realistis |
| Cursor pagination pindah ke `core/pagination` | Komentar `kursor.ts` sejak PR-047 sudah menjanjikan ini persis untuk momen "konsumen kedua lahir" | Duplikasi logika cursor di `modules/jobs` — ditolak; dua format cursor berbeda tidak akan pernah terlihat salah sampai seseorang menukarnya antar-endpoint |
| `JobSearchResult` skema baru (bukan reuse `jobPublicSummarySchema`) | PR-058 tidak punya Backend Changes sendiri — field kartu (nama perusahaan, akomodasi) harus sudah lengkap dari sini | Reuse `jobPublicSummarySchema` — ditolak; kurang `companyName`/`accommodations`, akan memaksa PR-058 menambah Backend Changes yang dokumennya sendiri bilang "Tidak ada" |
| Urutan SELALU `published_at DESC, id DESC`, tanpa ranking relevansi FTS | Tidak ada AC yang meminta ranking relevansi; ranking butuh menyimpan skor di cursor (query yang sama harus diulang tiap halaman) — kompleksitas tak terbeli | Order by `ts_rank(...)  DESC` — ditolak; cursor jadi harus membawa `query` string itu sendiri supaya skornya bisa dihitung ulang tiap halaman, dan tidak ada AC yang memintanya |
| `workMode` camelCase (bukan `work_mode` sesuai prosa dokumen phase) | Konsisten dengan SELURUH field kontrak lain (`jobPublicSchema.workMode`, dst.) dan query param yang sudah ada (`unreadOnly`) | Ikuti literal `work_mode` — ditolak; akan jadi satu-satunya query param snake_case di seluruh API |

### Risiko & batas yang diketahui

* **Bug `uuid < text` ditangkap test DB, bukan review kode.** Perbandingan
  tuple keyset `(published_at, id) < (cursor)` awalnya tidak mem-cast `id`
  cursor ke `::uuid` — Prisma mengirim parameter sebagai `text`/`unknown`,
  dan Postgres tidak punya operator `uuid < text` bawaan untuk desugar
  perbandingan baris. Lolos `tsc`/lint (valid secara TypeScript), baru
  gagal saat `jobs-search-db.test.ts` benar-benar memanggil halaman kedua.
  Dicatat di sini karena pola yang sama (parameter Prisma tanpa cast tipe DB
  eksplisit di dalam perbandingan majemuk) berisiko terulang di modul lain
  yang memakai raw SQL keyset.
* **Test data harus diisolasi dari data seed dev DB (20 jobs sejak PR-001) —
  ditemukan lewat kegagalan test, bukan diantisipasi dari awal.** Draf
  pertama `jobs-search-db.test.ts` mengasumsikan tabel `jobs` kosong di luar
  baris yang dibuat test itu sendiri; nyatanya dev DB berbagi baris seed
  yang sama di seluruh test file. Setiap `service.search()` di berkas ini
  sekarang diberi filter `city: ISOLASI` (nilai kota fiktif yang tidak
  mungkin ada di seed manapun) SELAIN kelompok yang sengaja menguji filter
  kota itu sendiri.
* **Tidak ada E2E di PR ini** — sesuai rencana dokumen phase ("E2E Test via
  PR-058"): PR-056 murni backend.
* **Tidak ada ranking relevansi FTS** (lihat tabel keputusan) — hasil
  terurut kronologis (`publishedAt` terbaru dulu), BUKAN diurutkan seberapa
  relevan cocoknya dengan `query`. Untuk skala pilot (ratusan lowongan)
  dampaknya kecil; dicatat sebagai batas desain, bukan bug.
* **Angka p95 dari dev DB lokal, bukan VPS produksi** (lihat "Bukti
  performa" di atas) — margin besar (≈95×) dijadikan mitigasi, bukan
  pengukuran ulang di lingkungan produksi (belum ada, Phase 16).

### Next steps

* **PR-057** — Admin Jobs FE — tidak bergantung pada PR-056 (mengonsumsi
  `/admin/jobs*` dari PR-055).
* **PR-058** — Web Jobs Browse — konsumen `GET /jobs` PERTAMA; `JobSearchResult`
  dirancang supaya PR-058 tidak butuh Backend Changes sendiri (keputusan #3).
* **PR-059** — Job Detail Page — tidak langsung bergantung pada PR-056
  (mengonsumsi `GET /jobs/:id` dari PR-055), tetapi biasanya dicapai lewat
  klik dari hasil PR-058.

---

## PR-057 — Admin Jobs FE

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-057---admin-jobs-fe)
> **Tanggal:** 2026-09-15
> **Status:** Selesai

### Ringkasan hasil

`/admin/jobs` (daftar + filter status + duplikasi), `/admin/jobs/baru`, dan
`/admin/jobs/:id` (form + Terbitkan + Tutup) — UI kurasi lowongan penuh,
konsumen PERTAMA endpoint `/admin/jobs*` (PR-055). Pola strukturalnya SAMA
PERSIS dengan kurasi perusahaan (PR-053): halaman daftar terpisah dari
halaman form (bukan state lokal), form Buat/Ubah satu komponen, aksi status
(Terbitkan/Tutup) terpisah dari "Simpan" — perbedaannya hanya di detail
domain (lebih banyak field, dua aksi status alih-alih satu "verify", dan satu
aksi baru yang tidak dipunyai companies: duplikasi).

Tiga keputusan yang membentuk seluruh sisanya:

**1. Duplikasi LANGSUNG memanggil API dari daftar, TANPA jeda konfirmasi
maupun form terisi dulu — dikonfirmasi via `AskUserQuestion` sebelum
implementasi.** Dua pilihan yang diajukan: (a) klik "Duplikat" langsung
membuat draft baru lalu membuka halaman Ubah-nya, atau (b) membuka halaman
Tambah dengan field sudah terisi salinan, menunggu admin menekan Simpan.
Dipilih (a) — AC sendiri menyebut alasannya "efisiensi kurasi", dan opsi (b)
menambah satu langkah tanpa AC yang memintanya. Biaya kesalahan rendah:
hasilnya draft baru yang belum terbit dan belum terlihat siapa pun, jadi
tidak butuh dialog konfirmasi seperti "Tutup" (yang berdampak pelamar
sungguhan).

**2. Validasi akomodasi wajib sebelum publish diperiksa atas DATA TERSIMPAN
(`lowongan.accommodations` dari `listJobsAdmin`), BUKAN isian form yang
belum disimpan.** Tombol Terbitkan operasinya tanpa badan (`POST .../publish`
tidak mengirim apa pun, PR-055) — yang benar-benar diterbitkan server adalah
baris yang SUDAH tersimpan, bukan apa yang sedang diketik admin. Memeriksa
`nilai.accommodations` (state form) akan membuat tombol tampak siap padahal
perubahannya belum ditekan Simpan — cacat "yang terlihat siap bukan yang
sungguh siap" yang sama jenisnya dengan yang dihindari `companies-formulir.tsx`
soal status verifikasi.

**3. Pemilih Perusahaan SELALU dirender (kedua mode), NONAKTIF di mode
UBAH — bukan disembunyikan.** `updateJobSchema` menolak `companyId` sama
sekali (lowongan tidak berpindah pemilik, PR-055), tetapi menyembunyikan
field itu total di mode ubah akan membuat admin kehilangan konteks
"lowongan ini milik perusahaan mana" saat menyunting. Pemilih yang sama,
dinonaktifkan + kalimat penjelas ("Perusahaan tidak bisa diubah setelah
lowongan dibuat"), memberi konteks tanpa membuka jalur ubah yang tidak ada
di server.

Utang teknis DUA hal ditemukan dan diselesaikan LANGSUNG dalam sesi ini,
dicatat di sini karena keduanya berpotensi menjebak pekerjaan berikutnya yang
memakai `Pilihan` (Radix Select, @nawasena/ui) dalam test jsdom:

* **jsdom tidak mengimplementasikan Pointer Events API** (`hasPointerCapture`
  dkk.) yang dipakai Radix Select untuk membuka/menutup listbox-nya. Tanpa
  stub, `userEvent.click` pada pemicu `Pilihan` melempar `TypeError` SEBELUM
  listbox-nya sempat terbuka — dan itulah kenapa test yang sudah ada
  (`profil.test.tsx`) sengaja hanya mem-fokus kombobox-nya, tidak pernah
  membukanya lewat klik. `admin-jobs.test.tsx` adalah test PERTAMA yang
  benar-benar membuka `Pilihan` lewat klik (AC "buat→publish→close" menuntut
  `companyId` benar-benar terpilih sebelum submit diuji) — stub `hasPointerCapture`/
  `setPointerCapture`/`releasePointerCapture`/`scrollIntoView` ditambahkan
  LOKAL di berkas itu (bukan `__tests__/setup.ts` global), supaya jejaknya
  jelas bagi siapa pun yang membaca berkas ini kelak butuh pola yang sama.
* **Gerbang a11y (Playwright) menyajikan `dist/` HASIL BUILD, bukan server
  dev** ([[gerbang-a11y-butuh-build]], sudah tercatat di memori lintas-sesi
  sebelum PR ini, dikonfirmasi ulang di sini) — `pnpm build` WAJIB dijalankan
  sebelum `playwright test` setiap kali route/komponen baru ditambahkan,
  kalau tidak seluruh halaman baru gagal "waitForSelector" karena `dist/`
  lama tidak mengenal rute itu sama sekali.

Gate hijau: `pnpm typecheck`/`pnpm lint` bersih di `@nawasena/web`,
`@nawasena/api-client`, `@nawasena/schemas` (tidak disentuh isinya, hanya
dikonsumsi). `@nawasena/web` **50 berkas / 651 test lulus** (vitest) + **83
test Playwright lulus** (a11y generik + `admin-jobs.spec.ts` + regresi
`admin-companies.spec.ts`). `@nawasena/api-client` **10 berkas / 100 test
lulus**. `cek:budget`: chunk `admin-jobs`/`admin-jobs-formulir` lazy
terpisah, budget JS awal 111,3 KB/200 KB (tidak berubah — seeker tidak
mengunduh apa pun dari PR ini).

### Scope selesai

**`packages/api-client`**

* **`endpoints/jobs.ts`** (baru) — `listJobsAdmin`, `createJobAdmin`,
  `updateJobAdmin`, `publishJobAdmin`, `closeJobAdmin`, `jobsKeys.adminList()`.
  TIDAK ADA `getJobAdmin` (server tidak menyediakan GET satu lowongan admin,
  pola sama `companies.ts`) dan TIDAK ADA `deleteJobAdmin` (server punya
  `DELETE /admin/jobs/:id`, PR-055, tetapi PR-057 tidak punya AC yang
  memintanya di UI — "Tutup" adalah satu-satunya jalur resmi menyingkirkan
  lowongan dari sini).
* **`__tests__/jobs.test.ts`** (baru, 14 test) — amplop `{ data }`, validasi
  client SEBELUM berangkat (judul kosong, `companyId` bukan UUID, taksonomi
  liar, `salaryMin > salaryMax`, `status`/`companyId` ditolak di
  `updateJobAdmin`), `publish`/`close` tanpa badan.

**`apps/web/src/features/admin/`**

* **`jobs-badan.ts`** (baru) — `NilaiLowongan` (`salaryMin`/`salaryMax`
  sebagai STRING, pola sama field teks lain), `keNilai`/`keBadanBuat`/
  `keBadanUbah` (`keBadanUbah` MEMBUANG `companyId` — TIDAK sama dengan
  `keBadanBuat` seperti pola companies, karena `companyId` memang hilang dari
  kontrak update), `keBadanDuplikat` (keputusan #1).
* **`jobs-formulir.tsx`** (baru) — `FormulirLowongan`: lima bagian
  (`<h3>`/`fieldset+legend`), pemilih Perusahaan (keputusan #3), taksonomi
  akomodasi (`KUNCI_AKOMODASI`, disalin dari `companies-formulir.tsx` — pola
  duplikasi mapping-kecil yang sudah mapan di modul ini) dan ragam disabilitas
  (`RAGAM` DIPINJAM dari `features/onboarding/langkah-ragam-disabilitas.tsx`,
  `KUNCI_RAGAM` dirakit persis seperti `bagian-sensitif.tsx`).
* **`jobs-status-badge.tsx`**, **`jobs-pesan-galat.ts`** (baru) — pola sama
  persis `companies-status-badge.tsx`/`companies-pesan-galat.ts`.
* **`jobs-daftar.tsx`** (baru) — `DaftarLowongan`: JOIN client-side dengan
  `listCompaniesAdmin` untuk kolom "Perusahaan" (`JobAdmin` hanya menyimpan
  `companyId`), filter status (`Pilihan` dibungkus `KolomForm` — bukan
  komponen `Tab`, sebab `Tab` Radix MELEPAS panel tak-aktif dari DOM, cocok
  untuk konten berbeda per tab, bukan untuk memfilter SATU tabel bersama),
  aksi Duplikat (keputusan #1).
* **`index.ts`** — diperluas, ekspor jobs di-alias (`NILAI_LOWONGAN_KOSONG`,
  dst.) supaya tidak bentrok nama dengan ekspor companies yang sudah ada di
  barrel yang sama.

**`apps/web/src/routes/`**

* **`admin-jobs.tsx`** (baru) — delegasi murni ke `DaftarLowongan`, pola sama
  `admin-companies.tsx`.
* **`admin-jobs-formulir.tsx`** (baru) — `AdminJobsFormulir`: mode buat/ubah
  satu komponen, `perbaruiBaris` (cache TanStack), tiga `useMutation`
  (simpan/terbitkan/tutup), validasi akomodasi client (keputusan #2), dialog
  Tutup (Security Considerations "Konfirmasi close, berdampak pelamar") —
  Terbitkan SENGAJA tanpa dialog (dokumen phase hanya minta konfirmasi untuk
  close).
* **`admin.tsx`** — `SEKSI` +1 entri ("Lowongan"), `AdminRingkasan` +1 kartu.
* **`app/routes.ts`** — tiga route baru di bawah `admin` (`jobs`,
  `jobs/baru`, `jobs/:id`), `muatKatalog("admin")` untuk daftar,
  `muatKatalog("admin", "profil", "onboarding")` untuk form (label akomodasi
  + ragam disabilitas dipinjam dari kedua katalog itu).

**`apps/web/src/shared/i18n/katalog/admin.ts`**

* ~70 kunci baru di bawah `admin.jobs.*` + `admin.nav.jobs` +
  `admin.ringkasan.jobs.*`. `id-simple` ditulis genuine untuk kalimat
  bermakna (pesan hasil aksi, keterangan validasi); label pendek yang
  memang sudah sehari-hari (nama kolom, "Simpan"/"Batal", dst.) didaftarkan
  di `SAMA_DENGAN_SENGAJA` (`katalog-kelengkapan.test.ts`) mengikuti pola
  persis yang sudah ada untuk `admin.companies.*`.

**Test (3 berkas baru)**

* `admin-jobs.test.tsx` (17 test, jsdom) — daftar (baris+badge+nama
  perusahaan, kosong, filter status, aria-label Ubah, duplikasi), form buat
  (validasi judul/companyId, submit sukses+redirect), form ubah (terisi,
  tidak-ditemukan, pemilih perusahaan nonaktif, PUT tanpa companyId),
  terbitkan (tombol nonaktif+keterangan saat akomodasi kosong, sukses),
  tutup (dialog wajib, konfirmasi, batal). Butuh stub Pointer Events API
  (utang #1 di atas).
* `e2e/admin-jobs.spec.ts` (3 test, Playwright) — Ubah→form terisi+axe,
  validasi akomodasi kosong (tombol nonaktif, browser nyata), AC penuh
  Buat→Terbitkan→Tutup dengan axe di SETIAP keadaan (terbit, dialog tutup).
* `e2e/palsukan-api.ts` — `LOWONGAN_UJI`/`LOWONGAN_UJI_ID` + rute
  `/admin/jobs*` (list/create/publish/close/update), pola sama persis blok
  `PERUSAHAAN_UJI`.
* `e2e/halaman.ts` — tiga entri baru (daftar, tambah, ubah-tidak-ditemukan),
  pola sama persis blok companies.
* `admin.test.tsx` — assertion jumlah entri nav diperbarui (2→3) + satu test
  baru untuk kartu ringkasan Lowongan.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Duplikasi langsung panggil API, tanpa form/dialog | AC sendiri menyebut "efisiensi kurasi"; biaya kesalahan rendah (hasilnya draft, belum terlihat siapa pun) | Buka form Tambah terisi salinan, tunggu admin menyimpan — ditanyakan ke user via `AskUserQuestion`, dijawab eksplisit: langsung |
| Validasi publish atas data TERSIMPAN, bukan state form | Yang benar-benar diterbitkan server adalah baris tersimpan (`POST .../publish` tanpa badan) — memeriksa state form berisiko tombol tampak siap padahal belum disimpan | Memeriksa `nilai.accommodations` (state form) — ditolak; false positive saat admin sedang mengetik tapi belum menyimpan |
| Pemilih Perusahaan selalu tampil, nonaktif di mode ubah | Admin butuh konteks kepemilikan lowongan saat menyunting, meski tidak bisa diubah | Sembunyikan field sepenuhnya di mode ubah (pola sama status verifikasi companies) — ditolak; companyId BEDA dari status verifikasi: yang satu identitas kepemilikan (perlu selalu terlihat), yang lain state kurasi (memang seharusnya tersembunyi dari form biasa) |
| Filter status pakai `Pilihan` dibungkus `KolomForm`, bukan `Tab` | `Tab` Radix melepas panel tak-aktif dari DOM — cocok konten BERBEDA per tab, bukan memfilter SATU tabel yang sama | Komponen `Tab` (PR-028) untuk filter status — ditolak; salah abstraksi, akan melepas-pasang tabel yang sama setiap ganti filter |

### Risiko & batas yang diketahui

* **Stub Pointer Events API lokal, bukan `__tests__/setup.ts` global** —
  hanya `admin-jobs.test.tsx` yang membutuhkannya hari ini. Bila test
  berikutnya perlu membuka `Pilihan` lewat klik, pertimbangkan memindahkan
  stub ini ke `setup.ts` supaya tidak diduplikasi berkas demi berkas —
  belum dilakukan sesi ini karena baru SATU pemakai.
* **Manual verification (10 lowongan riil) TIDAK diulang sesi ini** — pola
  sama PR-053/054/055; disandari kesepadanan kontrak + cakupan otomatis
  lebih luas dari biasanya (jsdom DAN Playwright atas build produksi).
* **Tidak ada bulk import CSV** — di luar scope PRD/SDD (dicatat dokumen
  phase sebagai usulan, bukan utang).
* **Peringatan React "duplicate key" muncul di satu test jsdom** (aksi
  duplikasi) akibat fake client test meniru array by-reference sekaligus
  `setQueryData` manual di komponen — pola yang SAMA dengan
  `admin-companies-formulir.tsx` (`perbaruiBaris` tanpa dedup check), bukan
  regresi baru; tidak mempengaruhi hasil test (React warning, bukan error).

### Next steps

* **PR-058** — Web Jobs Browse — TIDAK bergantung pada PR-057 (mengonsumsi
  `GET /jobs` publik dari PR-056, bukan `/admin/jobs*`).
* **PR-077/081/083/085** — Fitur admin berikutnya (disebut komentar
  `admin.tsx` sejak PR-052) akan menambah entri `SEKSI` + kartu ringkasan,
  pola yang sama persis dengan yang PR-053 dan PR-057 sudah tunjukkan dua
  kali berturut-turut.

---

## PR-058 — Web Jobs Browse

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-058---web-jobs-browse)
> **Tanggal:** 2026-09-15
> **Status:** Selesai

### Ringkasan hasil

`/lowongan` — halaman publik pencarian lowongan: kata kunci + kota + provinsi
+ mode kerja + akomodasi, kartu hasil aksesibel, cursor pagination ("Muat
lebih banyak"), dan pengumuman jumlah hasil lewat live region. Konsumen
PERTAMA `GET /jobs` (PR-056) — tidak ada perubahan backend sama sekali,
persis seperti direncanakan PR-056 saat merancang `JobSearchResult`.

Tiga keputusan yang membentuk seluruh sisanya:

**1. Filter DITERAPKAN HANYA SAAT SUBMIT ("Cari"), bukan sambil mengetik/
mencentang.** State `rancangan` (isian form) dipisah dari `diterapkan`
(filter yang benar-benar dipakai query) — pola BARU di modul ini, beda dari
`admin/jobs-daftar.tsx` (PR-057) yang memfilter client-side atas data yang
SUDAH ADA di memori. Di sini setiap perubahan filter berarti permintaan
jaringan baru, dan hasil yang berubah sendiri di belakang pengguna yang masih
menjelajahi kotak centang adalah perubahan konteks tak terduga (WCAG 3.2.2).
Alasannya aksesibilitas dulu, efisiensi jaringan kedua.

**2. Pengumuman jumlah hasil (`aria-live`) dipicu oleh KUNCI FILTER yang
berubah, bukan oleh jumlah item yang tampil.** `useInfiniteQuery` menyimpan
tiap halaman dalam `pages[]`; "Muat lebih banyak" menambah `pages[1]`,
`pages[2]`, dst., tetapi `pages[0]` (halaman pertama) TIDAK PERNAH berubah
nilainya setelah filter yang sama. Karena itu jumlah yang diumumkan diambil
dari `pages[0].data.length` — nilai yang secara alami TIDAK bereaksi
terhadap "muat lebih banyak", hanya terhadap filter baru yang memulai
`pages[]` dari nol lagi. Pola pembandingnya `PengumumanNotifikasiBaru`
(`app/lencana-notifikasi.tsx`, PR-050): `useRef` menyimpan kunci TERAKHIR
yang sudah diumumkan, diinisialisasi ke kunci AWAL supaya pemuatan pertama
tetap diam.

**3. Keadaan KOSONG karena filter TIDAK diumumkan dua kali.** `KeadaanKosong`
(`@nawasena/ui`, PR-032) sudah `role="status"` sendiri dan mengumumkan
dirinya saat dipasang secara dinamis (dicatat eksplisit di komentar
komponennya sejak lahir: "keadaan kosong yang muncul karena pencarian tidak
menemukan apa pun terdengar"). `PengumumanHasil` (live region baru PR ini)
sengaja TIDAK mengumumkan kasus jumlah=0, supaya SR tidak mendengar
pengumuman yang sama persis dua kali untuk satu peristiwa.

Taksonomi jenis/mode kerja **dipinjam dari katalog `companies`**
(`companies.lowongan.tipe.*`/`mode.*`, lahir PR-054), BUKAN diulang di
katalog `lowongan` baru — kandidat melihat kartu lowongan di DUA tempat
(di sini dan di profil publik perusahaan) dan harus membaca istilah yang
SAMA PERSIS. Begitu pula label akomodasi: `KartuLowongan` memakai ULANG
`DaftarAkomodasi` (`features/companies-publik/akomodasi-daftar.tsx`) APA
ADANYA, lintas-fitur — pola yang sama dengan `admin/jobs-formulir.tsx`
(PR-057) meminjam `RAGAM` dari `features/onboarding`.

Gate hijau: `pnpm typecheck`/`pnpm lint` bersih di `@nawasena/web` dan
`@nawasena/api-client`. `@nawasena/web` **52 berkas / 665 test vitest lulus**
+ **92 test Playwright lulus** (a11y generik + `lowongan-browse.spec.ts` +
regresi seluruh spec lain, atas build produksi sungguhan).
`@nawasena/api-client` **10 berkas / 107 test lulus**. `cek:budget`: chunk
`lowongan`/`lowongan-browse` lazy terpisah, budget JS awal 111,5 KB/200 KB
(naik 0,2 KB dari PR-057 — bukan dari fitur ini, seeker masih tidak
mengunduh apa pun darinya).

### Scope selesai

**`packages/api-client`**

* **`endpoints/jobs.ts`** — `searchJobs` (baru): `GET /jobs`, `accommodations`
  dikirim sebagai parameter BERULANG (bukan digabung koma — `qs` server
  mem-parse-nya langsung jadi array, lihat `jobSearchAccommodationsSchema`).
  `jobsKeys.search(filter)` (baru): melingkupi filter TANPA `cursor` (pola
  sama `notificationsKeys.daftar`), `accommodations` DIURUTKAN sebelum masuk
  kunci supaya urutan centang tidak dianggap pencarian berbeda oleh cache.
* **`__tests__/jobs.test.ts`** (+7 test) — GET tanpa query string bila tanpa
  filter, parameter benar (termasuk `accommodations` berulang), string kosong
  TIDAK dikirim, `jobsKeys.search` mengabaikan urutan `accommodations`.

**`apps/web/src/features/job-feed/`** (baru)

* **`filter-panel.tsx`** — `FilterPanel`: SATU `<form>`, filter hanya
  berlaku saat submit (keputusan #1). `MODE_KERJA_SEMUA = "semua"` sebagai
  sentinel (Radix `Select.Item` MENOLAK nilai `""`).
* **`kartu-lowongan.tsx`** — `KartuLowongan`: judul (h3) → metadata ringkas
  (`perusahaan • jenis • mode • lokasi`, satu `<p>`) → `DaftarAkomodasi`
  (dipinjam) → tautan "Lihat detail" — satu kesatuan tanpa elemen fokusable
  di antaranya (AC).
* **`browse-daftar.tsx`** — `DaftarBrowseLowongan`: orkestrasi
  `useInfiniteQuery` + `PengumumanHasil` (keputusan #2, #3) + empty/error
  states + "Muat lebih banyak" (pola sama `notifikasi/daftar.tsx`, PR-050).
* **`pesan-galat.ts`**, **`index.ts`** — pola sama fitur publik lain.

**`apps/web/src/routes/lowongan-browse.tsx`** (baru) — `LowonganBrowse`:
h1 → filter → h2 tersembunyi "Hasil" (`sr-only`, murni untuk
`aria-labelledby`) → kartu. PUBLIK, tanpa `<Terlindungi>`.

**`apps/web/src/app/routes.ts`** — route `lowongan` baru, SAUDARA
`companies/:id` (bukan anak `admin`). `muatKatalog("lowongan", "companies",
"profil")` — dua terakhir untuk taksonomi/label yang dipinjam.

**`apps/web/src/shared/i18n/`**

* **`katalog/lowongan.ts`** (baru) — katalog FITUR baru (bukan sub-key
  `companies`/`admin`): halaman `/lowongan` berdiri sendiri, dan memuat
  katalog `admin`/`companies` PENUH untuknya akan mengunduh teks yang tidak
  pernah ia lihat. ~25 kunci baru; beberapa (label kolom pendek, tombol)
  identik `id`/`id-simple` dan didaftarkan `SAMA_DENGAN_SENGAJA`.
* **`registri.ts`**, **`katalog/index.ts`**, **`katalog/semua.ts`** —
  `lowongan` didaftarkan sebagai fitur malas kedelapan.
* **`__tests__/setup.ts`** — seed test ikut menambahkan `katalogLowongan`
  (tanpa ini, SETIAP test yang me-render `PenyediaI18n` gagal typecheck —
  `seedKatalogUntukTest` menuntut kelengkapan `NamaFitur`).

**Test (4 berkas baru)**

* `kartu-lowongan.test.tsx` (8 test, jsdom, TERISOLASI — bukan lewat router
  penuh, hanya `PenyediaI18n`+`MemoryRouter` minimal karena `KartuLowongan`
  murni presentasional) — AC "Unit Test (kartu)".
* `filter-panel.test.tsx` (6 test, jsdom) — filter TIDAK terapkan saat
  mengetik/mencentang, HANYA saat submit (Enter atau klik "Cari"); reset
  mengosongkan tanpa memicu pencarian; nama aksesibel form.
* `e2e/lowongan-browse.spec.ts` (7 test, Playwright) — tanpa filter + "muat
  lebih banyak", kata kunci menyaring + pengumuman hasil + axe, empty state +
  reset + axe, filter kota, keyboard-only, DAN mode teks sederhana+kontras
  tinggi (AC "Manual Verification" — dijalankan sebagai test browser nyata,
  bukan hanya diklaim, lihat keputusan uji di bawah).
* `e2e/palsukan-api.ts` — `LOWONGAN_PENCARIAN_UJI` (tiga fixture, form
  `JobSearchResult`) + rute `GET /api/v1/jobs` yang BENAR-BENAR menerapkan
  filter (kata kunci/kota/mode kerja/akomodasi) dan cursor (ukuran halaman
  palsu 2, sengaja beda dari `limit` klien) — bukan jawaban tetap, supaya
  `lowongan-browse.spec.ts` bisa menguji perilaku filter sungguhan.
* `e2e/halaman.ts` — satu entri baru ("lowongan — cari, tanpa filter"),
  ikut tersapu `aksesibilitas.spec.ts` dan `lompat-ke-konten.spec.ts`.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Filter berlaku HANYA saat submit, bukan langsung saat diubah | Hasil yang berubah sendiri saat pengguna masih menjelajahi kotak centang adalah perubahan konteks tak terduga (WCAG 3.2.2); form yang jelas kapan "berlaku" juga lebih mudah dipahami | Terapkan langsung per perubahan (mis. debounce per ketikan) — ditolak; UX yang lazim di web umum tetapi bermasalah bagi navigasi linear screen reader |
| Pengumuman hasil dipicu KUNCI FILTER (via `pages[0].length`), bukan `items.length` total | `items.length` naik setiap "muat lebih banyak" — memakainya sebagai trigger akan membuat live region berbunyi pada aksi yang bukan "filter berubah" | Memicu dari `items.length` — ditolak; AC eksplisit menyebut "saat filter berubah", bukan "saat daftar berubah" |
| Keadaan kosong TIDAK diumumkan `PengumumanHasil` (dibiarkan milik `KeadaanKosong`) | `KeadaanKosong` sudah `role="status"` sejak lahir (PR-032) dan sudah menjawab kasus ini secara eksplisit di komentarnya sendiri | Mengumumkan jumlah=0 juga di `PengumumanHasil` — ditolak; pengguna SR mendengar pengumuman yang sama dua kali |
| Taksonomi jenis/mode kerja dipinjam dari katalog `companies`, bukan diulang | Kandidat melihat kartu lowongan yang SAMA di dua halaman (di sini dan profil perusahaan) dan harus membaca istilah identik | Kunci baru di katalog `lowongan` — ditolak; dua salinan teks untuk satu taksonomi cepat atau lambat berbeda bunyinya |
| Manual Verification (mode sederhana+kontras) ditulis sebagai test Playwright sungguhan | Checklist phase document meminta verifikasi manual — menjalankannya sebagai test otomatis (bukan klaim tanpa bukti) memberi bukti yang bisa diperiksa ulang, dan mencegahnya membusuk diam-diam saat kode berubah | Mencatat "sudah diverifikasi manual" tanpa artefak — ditolak; pola yang SUDAH ditinggalkan sejak `admin-companies.spec.ts` (PR-053) mendemonstrasikan cara yang lebih baik |

### Risiko & batas yang diketahui

* **Filter TIDAK disinkronkan ke URL (`useSearchParams`)** — pencarian tidak
  bisa dibagikan lewat tautan atau dipulihkan lewat tombol kembali peramban.
  Bukan diabaikan tanpa sadar: tidak ada AC yang memintanya, dan menambahnya
  berarti sinkronisasi dua arah (state ↔ URL) yang tidak dibeli scope PR ini.
  Dicatat di sini sebagai kandidat *nice-to-have*, bukan utang wajib.
* **Server tidak mengirim TOTAL hasil**, hanya `nextCursor` (PR-056, desain
  cursor pagination) — pengumuman `aria-live` karena itu menyebut jumlah
  HALAMAN PERTAMA ("N lowongan ditemukan"), bukan total sesungguhnya bila
  hasilnya lebih dari satu halaman. Tidak ada AC yang menuntut "menampilkan
  X dari Y total", jadi ini keputusan desain yang disengaja, bukan
  kekurangan yang terlewat.
* **NVDA manual tidak ditempuh sesi ini** — pola sama seluruh PR FE
  sebelumnya di phase ini (lingkungan tidak punya screen reader sungguhan).
* **Pemalsuan ukuran halaman (`UKURAN_HALAMAN = 2` di `palsukan-api.ts`)
  SENGAJA beda dari `limit` yang dikirim klien (20)** — cukup untuk memicu
  "Muat lebih banyak" dengan tiga fixture tanpa perlu puluhan baris palsu;
  dicatat eksplisit di komentarnya supaya tidak disangka bug pemalsuan.

### Next steps

* **PR-059** — Job Detail Page — konsumen `GET /jobs/:id` (PR-055) DAN
  tujuan tautan "Lihat detail" yang sudah terpasang di sini
  (`/lowongan/:id`, sejauh ini 404 lewat catch-all `routes.ts`, sama seperti
  tautan company-public ke `/lowongan/:id` sejak PR-054).

---
