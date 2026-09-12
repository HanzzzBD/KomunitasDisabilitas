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
