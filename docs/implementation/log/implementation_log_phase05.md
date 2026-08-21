# Implementation Log — Phase 05 (User Profile)

> Catatan per PR yang selesai di Phase 05. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-037 — Profiles BE: Data Sensitif Terenkripsi + Consent

> **Phase:** [05 - User Profile](../phase-05-user-profile.md#pr-037---profiles-be--data-sensitif-terenkripsi--consent)
> **Tanggal:** 2026-08-21
> **Status:** Selesai

### Ringkasan hasil

Data disabilitas dan kebutuhan akomodasi akhirnya punya tempat tinggal yang sah:
modul `profiles` lahir di `apps/api` dengan dua endpoint (`GET`/`PUT
/api/v1/me/profile`), dan **tidak satu byte pun** dari kedua field itu mendarat
di database dalam bentuk yang bisa dibaca. Enkripsi AES-256-GCM berversi (ADR-007)
dilakukan di service layer lewat `core/crypto`; kolom `disability_types` dan
`accommodation_needs` berisi `bytea` yang diawali byte versi kunci.

Yang membuat PR ini bukan sekadar "CRUD dengan enkripsi" adalah **gerbang
consent**-nya. Menulis field sensitif tanpa `consent_sensitive_at` menghasilkan
403, bukan 400 — permintaannya sah, izinnya yang belum ada. Mencabut consent
tidak menyembunyikan data, melainkan **menghapusnya**: kedua kolom di-`NULL`-kan
dalam transaksi yang sama, dan penghapusan itu meninggalkan jejak audit.

Tidak ada migrasi database (tabel `seeker_profiles` berdiri sejak PR-010) dan
tidak ada perubahan frontend (PR-040).

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api`
61 berkas / **770 lulus** (14 skip tak terkait), `@nawasena/schemas` 23/23,
`@nawasena/web` 523/523. Drift OpenAPI dan budget bundle web juga diperiksa dan
hijau.

### Scope selesai

* **`packages/schemas/src/profiles.ts`** (dari kerangka kosong → 274 baris) —
  kontrak bersama FE/BE/mobile:
  * `disabilityTypeSchema` (5 nilai, FR-2.1 PRD) dan `accommodationNeedSchema`
    (6 nilai) + konstanta `DISABILITY_TYPES` / `ACCOMMODATION_NEEDS`.
  * `accommodationNeedsSchema` — `{ tags (maks 6, di-dedup), notes (maks 500,
    kosong→null) }`.
  * `safeProfileSchema` / `sensitiveProfileSchema` / `seekerProfileSchema` —
    pemisahan aman-vs-sensitif sebagai **tipe**, bukan konvensi.
  * `updateSeekerProfileSchema` — `.partial().strict()` + `superRefine` yang
    menolak "cabut consent sambil menulis data sensitif".
* **`apps/api/src/modules/profiles/`** — modul baru, `routers → controllers →
  services → repositories`:
  * `repositories/profile.repository.ts` (130) — **tidak pernah melihat
    plaintext**; field sensitif masuk-keluar sebagai `Buffer`. `upsertByUserId`
    memeriksa ulang consent **di dalam `$transaction`**.
  * `services/profiles.service.ts` (219) — satu-satunya tempat plaintext ada.
    Enkripsi, logika consent, dan pemanggilan audit.
  * `controllers/profiles.controller.ts` (38), `routers/index.ts` (35),
    `index.ts` (60) — factory modul.
* **`apps/api/src/boot.ts`** — modul dipasang dengan `fieldKeys` yang **sama**
  dengan yang sudah lolos gerbang fail-fast di `index.ts`; placeholder
  `void fieldKeys` dihapus.
* **`apps/api/src/core/http/errors.ts`** — `CONSENT_SENSITIF_DIPERLUKAN` (403).
* **`packages/schemas/src/audit.ts`** — meta `PROFILE_SENSITIVE_UPDATED` kini
  `{ operation, fields }`.
* **`docs/audit-action-catalog.md`** — baris tabel + paragraf penjelas.
* **`apps/api/prisma/seed-data.ts`** — taksonomi seed diikat ke tipe schema lewat
  `satisfies`.
* **Test (50 baru)** — `profiles-http.test.ts` (698 baris, 42 test) dan
  `profiles-db.test.ts` (248 baris, 8 test terhadap PostgreSQL sungguhan), plus
  6 test kontrak baru di `packages/schemas/__tests__/schemas.test.ts`.

### Keputusan teknis

* **D1 — `safeProfileSchema` adalah objek berdiri sendiri, BUKAN `.omit()` dari
  profil lengkap.** Ini mitigasi risiko yang disebut ticket ("kebocoran via
  serialisasi tak sengaja") dalam bentuk yang tidak bisa lolos tanpa disadari.
  Dengan `.omit()`, field sensitif baru otomatis masuk ke bentuk aman dan harus
  *diingat* untuk dikecualikan — kelalaian yang tidak bergejala. Dengan objek
  terpisah, field baru tidak punya tempat di sana kecuali seseorang mengetiknya
  sendiri. Dijaga dua test: satu runtime atas `shape`, satu compile-time
  (`expectTypeOf<SafeProfile>().not.toHaveProperty(...)`).

* **D2 — Gerbang consent diperiksa ULANG di dalam transaksi repository, bukan
  hanya di service.** Pemeriksaan tingkat aplikasi (baca → putuskan → tulis)
  meninggalkan jendela di mana pencabutan consent dari perangkat lain mendarat
  di antara keduanya — hasilnya data sensitif tersimpan tanpa consent yang sah,
  keadaan yang justru paling ingin dicegah UU PDP. Karena itu `upsertByUserId`
  menerima `{ butuhConsent }` dan membaca ulang `consent_sensitive_at` di dalam
  `$transaction` sebelum menulis.
  * **Batas yang TERSISA dan sengaja tidak disembunyikan:** pada isolasi READ
    COMMITTED, `SELECT` di dalam transaksi tidak mengunci baris, jadi pencabutan
    yang commit tepat di antara `SELECT` dan `UPDATE` masih bisa terlewat.
    Menutupnya sepenuhnya butuh `SELECT … FOR UPDATE` lewat raw SQL. **Ditunda
    ke PR-039**, yang memang menyentuh lapisan akses profil. Ditulis di komentar
    kodenya, bukan hanya di sini.

* **D3 — Consent MENANG atas isi kolom saat membaca.** `keProfil()` memeriksa
  `consentSensitiveAt` lebih dulu; bila `null`, ia mengembalikan `sensitive: null`
  **tanpa menyentuh ciphertext sama sekali**. Konsekuensinya: seandainya
  penghapusan pernah gagal separuh jalan dan menyisakan ciphertext yatim, data
  itu tetap tidak akan pernah keluar lewat API. Urutan pemeriksaan ini adalah
  perbedaan antara "tidak ditampilkan" dan "tidak bisa ditampilkan".

* **D4 — 403, bukan 400.** Permintaannya tidak cacat; izinnya yang belum ada.
  Pesannya sengaja tidak menyalahkan pengguna — *"Kami belum boleh menyimpan data
  disabilitas Anda"* dengan hint yang menyebut tindakan berikutnya. Orang yang
  baru saja mengetikkan data disabilitasnya lalu ditolak layak mendengar kalimat
  yang menempatkan kewajiban pada sistem, bukan pada dirinya.

* **D5 — `AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED` mendapat field `operation`.**
  Sebelumnya penyimpanan dan **pencabutan** menghasilkan baris audit yang identik
  — padahal AC-3 menuntut pencabutan bisa dibuktikan. Kini metanya
  `{ operation: "consentGranted" | "consentRevoked" | "fieldsUpdated", fields }`.
  Aman dilakukan karena belum ada satu pun penulis action ini sebelum PR-037.
  `.min(1)` pada `fields` dilepas supaya pemberian consent murni (belum ada data)
  bisa membawa array kosong.

* **D6 — Stempel consent tidak pernah ditimpa setelah tersimpan.**
  `consent_sensitive_at` adalah bukti **kapan** consent mulai berlaku; menimpanya
  setiap kali profil disimpan akan menghapus satu-satunya jawaban atas pertanyaan
  itu. Menyimpan lagi dengan `consentSensitive: true` tidak menggeser nilainya.

* **D7 — Menghapus data sensitif TIDAK butuh consent.** Mengirim `null` pada
  field sensitif selalu boleh, bahkan tanpa consent aktif. Hanya penulisan nilai
  **non-null** yang dihitung sebagai "tulis" dan memicu gerbang. Aturan yang
  mengharuskan consent untuk menghapus akan mengunci data pada pengguna yang baru
  saja mencabut izinnya — kebalikan dari yang seharusnya.

* **D8 — `access.authenticated()`, bukan `access.self()`.** Alasannya sama persis
  dengan `modules/users` dan `modules/accessibility`: tidak ada param `:userId`
  untuk dibandingkan, dan `requireSelf` menolak SEMUA permintaan pada route tanpa
  param. Isolasi antar pengguna di sini **struktural** — identitas hanya datang
  dari token, dan `.strict()` membuat penyelundupan `userId` di body menjadi 400.

* **D9 — Tidak menyentuh `openapi.ts`.** Endpoint aksesibilitas (PR-034) juga
  tidak ada di sana; PR-037 mengikuti presedennya alih-alih mengubah kebijakan
  dokumentasi API secara diam-diam di dalam PR fitur.

### Utang yang SENGAJA ditinggalkan

* **Bagian ekspor PDP untuk `seeker_profiles` DITUNDA ke PR-038 — ini keputusan,
  bukan kelupaan.** `export-kelengkapan.test.ts` sebelumnya mencatat PR-037
  sebagai pengambilnya; label itu dipindahkan ke PR-038 di PR ini.
  * **Alasannya:** domain profil belum utuh sampai sub-entitas karier
    (`experiences`, `educations`, `skills`) lahir di PR-038. Berkas ekspor yang
    memuat bagian "profil" tanpa riwayat kerja, pendidikan, dan keahlian akan
    **tampak lengkap padahal bukan** — dan justru kegagalan seperti itu yang
    paling sulit dilaporkan pengguna: tidak ada pesan error, tidak ada bagian
    yang jelas hilang, hanya berkas yang diam-diam kurang. Keempat tabel masuk
    sekaligus di PR-038.
  * Label `DITUNDA` tetap membuat build merah bila seseorang lupa — utangnya
    terlacak, bukan menguap bersama dokumen phase.
* **`SELECT … FOR UPDATE` pada gerbang consent** — lihat D2, ditunda ke PR-039.

### Verifikasi

* **AC-1 (ciphertext) diuji lewat pembacaan MENTAH,** bukan lewat API:
  `$queryRaw` langsung ke kolom `bytea`, lalu memastikan tidak satu pun token
  bermakna (`"tuli"`, `"daksa"`, `"juru_bahasa_isyarat"`, `"notes"`) muncul di
  dalamnya. Byte pertama diperiksa sama dengan versi kunci — inilah yang membuat
  rotasi kunci (`docs/runbook-keys.md`) mungkin; blob tanpa penanda versi hanya
  terbaca oleh kunci yang kebetulan sedang aktif.
* **AC-2 (403) diuji sampai ke isi tabel:** bukan hanya status kodenya, tetapi
  juga bahwa **tidak ada baris `seeker_profiles` yang lahir** dan tidak ada baris
  audit yang tertulis. Ditambah kasus yang lebih halus: baris aman yang sudah ada
  tidak ikut rusak saat penulisan sensitif ditolak.
* **AC-3 (pencabutan) diuji sebagai NULL sungguhan di kedua kolom `bytea`,**
  bukan sekadar "tidak terbaca lewat API" — perbedaan antara data yang hilang
  dan data yang disembunyikan.
* **Audit diuji tidak memuat PII:** tidak ada nilai disabilitas maupun isi
  `notes` yang bocor ke `audit_logs`, dan setiap meta yang diterbitkan
  divalidasi ulang terhadap `auditMetaSchemas`.
* **AC-5 (taksonomi)** diuji dua arah: 8 penolakan berparameter untuk nilai liar,
  dan pemeriksaan bahwa **seluruh** nilai yang didokumentasikan benar-benar
  diterima — supaya taksonomi tidak diam-diam menyempit.
* **Registry route diuji** mendeklarasikan tepat dua route sebagai
  `authenticated`.

### Risiko yang ditemukan

* **`profiles-db.test.ts` sempat merah secara ACAK.** Penjaga kebocoran mula-mula
  memeriksa token satu karakter (`"["`, kurung siku pembuka JSON); ciphertext
  32 byte memuat byte apa pun dengan peluang yang tidak kecil, jadi test-nya
  gagal sesekali tanpa ada yang salah. Diperbaiki dengan membatasi daftar pada
  token multi-karakter yang bermakna. Dicatat karena pelajarannya lebih umum
  daripada kasusnya: **penjaga yang merah secara acak akan dimatikan orang
  sebelum ia sempat berguna.**
* **Snapshot `ERROR_CATALOG` ikut berubah** (`http-errors.test.ts`). Ini justru
  penjaga yang bekerja seperti maksudnya — kode error baru tidak bisa masuk tanpa
  terlihat di review. Diperbarui, dan diff-nya diperiksa hanya memuat satu entri.
* **Taksonomi akomodasi punya DUA sisi** — kebutuhan pencari kerja
  (`seeker_profiles`) dan fasilitas yang disediakan (`jobs.accommodations`,
  `companies.accommodations_available`). Bila keduanya menyimpang, matching tidak
  error: ia hanya **tidak pernah cocok**, tanpa gejala. Ditutup dengan mengikat
  `seed-data.ts` ke tipe schema lewat `satisfies`, sehingga penyimpangan menjadi
  kegagalan `typecheck`, bukan lowongan yang sunyi.
* **`profiles-db.test.ts` dilewati diam-diam bila DB tidak terjangkau** (pola
  sama dengan `db-seeker.test.ts`, PR-010). Di lokal tanpa Docker, AC-1 sampai
  AC-3 **tidak benar-benar diperiksa** meski `pnpm test` hijau. CI selalu punya
  service Postgres, jadi gerbang sungguhannya ada di sana — tetapi siapa pun yang
  memverifikasi PR ini di lokal wajib menyalakan `docker compose -f
  docker-compose.dev.yml up -d postgres` lebih dulu. Sudah dijalankan dan lulus
  8/8 terhadap PostgreSQL sungguhan sebelum PR ini dikirim.
* **Manual verification (`psql` inspeksi `bytea`) pada Testing Checklist belum
  dijalankan seseorang.** Yang setara sudah otomatis (`bacaMentah()` di
  `profiles-db.test.ts` membaca kolom mentah lewat `$queryRaw`), dan itu lebih
  kuat karena berulang setiap CI — tetapi kolomnya tetap ditandai jujur sebagai
  belum ada inspeksi manual.

### Next steps

* **PR-038** — sub-entitas karier (`experiences`, `educations`, `skills`) **dan**
  pendaftaran bagian ekspor PDP untuk keempat tabel sekaligus (lihat "Utang yang
  SENGAJA ditinggalkan").
* **PR-039** — pemisahan akses safe/sensitive ber-audit; sekaligus tempat yang
  tepat untuk `SELECT … FOR UPDATE` pada gerbang consent (D2).
* **PR-040** — form profil multi-bagian di web; consent muncul sebagai pilihan
  eksplisit yang bisa dicabut, bukan checkbox yang tercentang lebih dulu.

---

## PR-038 — Profiles BE: Experiences/Educations/Skills

> **Phase:** [05 - User Profile](../phase-05-user-profile.md#pr-038---profiles-be--experienceseducationsskills)
> **Tanggal:** 2026-08-21
> **Status:** Selesai

### Ringkasan hasil

Profil karier akhirnya punya isi. Tiga sub-entitas — riwayat kerja, pendidikan,
dan keahlian — masuk sebagai **dua belas endpoint** di bawah `/api/v1/me/*`,
masing-masing dengan CRUD penuh. Berbeda dengan PR-037, tidak ada satu pun data
sensitif di sini: ketiganya data karier biasa, tanpa enkripsi dan tanpa consent.

Yang menggantikan gerbang consent sebagai perhatian utama adalah **kepemilikan**.
Setiap query di `career.repository.ts` menyebut `userId` bersama `id`, termasuk
yang sudah punya `id`. Itu bukan pengulangan yang bisa dihemat: tanpa `userId` di
klausa yang sama, satu-satunya penghalang seseorang mengubah riwayat kerja orang
lain adalah pemeriksaan di lapisan atas — dan pemeriksaan yang terpisah dari
query-nya cepat atau lambat lupa dipasang pada satu jalur baru. Di sini jalur yang
lupa memeriksa **tidak bisa ditulis**: tidak ada fungsi repository yang menerima
`id` tanpa `userId`. Akibatnya baris milik orang lain berperilaku persis seperti
baris yang tidak ada — **404, bukan 403**, sebab 403 atas UUID milik orang lain
memberi tahu penebak bahwa id itu ADA.

Event domain `profile.updated` terbit pada **setiap** mutasi profil maupun
sub-entitasnya. Pelanggannya belum lahir (perhitungan ulang embedding = PR-069);
yang ada sekarang adalah kontraknya, dan penerbitnya yang sudah benar.

**Utang PDP yang ditinggalkan PR-037 dibayar di PR ini.** Bagian `profile` berkas
ekspor kini memuat profil beserta ketiga sub-entitasnya sekaligus — keempat tabel
pindah dari `DITUNDA` ke `TERDAFTAR` di `export-kelengkapan.test.ts`.

Tidak ada migrasi database (ketiga tabel berdiri sejak PR-010) dan tidak ada
perubahan frontend (PR-040).

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` 64 berkas / **819 lulus** (1 skip tak terkait),
`@nawasena/schemas` 32/32, `@nawasena/api-client` 53/53, `@nawasena/web`
523/523. Drift OpenAPI hijau, build web + budget bundle hijau (112,3 KB /
200 KB).

> **Temuan di luar scope PR ini, dicatat di sini karena ditemukan di sini:**
> gerbang `boundaries/element-types` **tidak pernah benar-benar memeriksa kode
> repo ini**. Lihat "Risiko yang ditemukan" — layak menjadi PR tersendiri.

### Scope selesai

* **`packages/schemas/src/profiles.ts`** (274 → 516 baris) — kontrak bersama:
  * `dateOnlySchema` — `YYYY-MM-DD`, divalidasi ulang lewat *round-trip* (lihat D3).
  * `experienceSchema` / `educationSchema` / `skillSchema` + pasangan
    `create*`/`update*`-nya. Semua `.strict()`; `update*` juga `.partial()`.
  * `EDUCATION_YEAR_MIN` / `EDUCATION_YEAR_MAX` — batas tahun pendidikan.
  * `careerItemParamsSchema` — param `:id` (id **item**, bukan id pengguna).
  * `profileSectionSchema` + `profileUpdatedEventSchema` — kontrak event domain.
* **`packages/schemas/src/export.ts`** — `exportProfileSchema`, dan field
  `profile` **wajib** di `dataExportSchema`. `EXPORT_FORMAT_VERSION` tetap 1:
  menambah bagian adalah perubahan aditif.
* **`apps/api/src/core/events/index.ts`** — `"profile.updated"` masuk peta
  `DomainEvents`, berikut catatan bahwa konsumen PR-069 harus berupa job antrean
  yang dipicu event ini, bukan pekerjaan di dalam handler-nya.
* **`apps/api/src/modules/profiles/`** — modul PR-037 tumbuh:
  * `repositories/career.repository.ts` (204) — tiga repository dengan kontrak
    seragam `CareerRepository<Row, Data>`; urutan bawaan sebagai konstanta.
  * `services/career.service.ts` (296) — satu alur untuk tiga entitas
    (`createBagianKarier`) + tiga perakit konkret yang menyuntikkan pemetaan
    kontrak↔baris dan pemeriksaan tanggal.
  * `services/profile-export.service.ts` (75) — kontributor bagian `profile`.
  * `controllers/career.controller.ts` (72), `routers/index.ts` (35 → 105).
  * `index.ts` (60 → 147) — `createProfilesModule` kini mengembalikan
    `{ router, exportContributor }`.
  * `services/profiles.service.ts` — `snapshotFor(userId)` + penerbitan
    `profile.updated` pada `PUT /me/profile`.
* **`apps/api/src/boot.ts`** — modul profiles dirakit **sebelum** modul users,
  supaya kontributor ekspornya bisa diserahkan lewat parameter.
* **Test:** `career-http.test.ts` (475, 22 test), `career-db.test.ts` (255,
  7 test), `career-export.test.ts` (174, 7 test), + 9 test kontrak di
  `packages/schemas`. Total **45 test baru**.

### Keputusan teknis

**D1 — Satu alur untuk tiga entitas, bukan tiga salinan.**
`createBagianKarier` menampung alur yang identik (pastikan milik pemanggil →
ubah → terbitkan event); yang berbeda per entitas hanya pemetaan kontrak↔baris
dan pemeriksaan tambahan, dan ketiganya disuntikkan. Alasannya bukan hemat baris:
salinan ketiga adalah tempat pemeriksaan kepemilikan atau penerbitan event
pertama kali terlewat, tanpa satu pun gejala.

**D2 — `access.authenticated()`, bukan `access.self("id")`.**
`:id` adalah id **item**, bukan id pengguna. `requireSelf("id")` akan
membandingkannya dengan userId pemilik sesi dan menolak **setiap** permintaan
yang sah. Kepemilikan dijaga di tempat yang tidak bisa dilewati — klausa `where`
repository. Dijaga test registry route yang menuntut keempat belas route
berdeklarasi `authenticated`.

**D3 — Validasi tanggal lewat round-trip, bukan sekadar `new Date`.**
Pengurai string ISO hanya menuntut hari berada di 01–31 tanpa memeriksa panjang
bulannya: `2026-02-31` **bukan** menjadi Invalid Date melainkan diam-diam
bergeser menjadi 3 Maret. Riwayat kerja yang tanggalnya bergeser sendiri adalah
kesalahan yang tidak akan pernah dilaporkan siapa pun — pemiliknya mengira ia
salah ingat. Karena itu hasil uraiannya dibaca kembali dan harus sama persis.
Ditemukan oleh test, bukan oleh review.

**D4 — Urutan tanggal diperiksa DUA kali, di skema dan di service.**
Yang di skema hanya melihat badan permintaan; permintaan ubah yang hanya
mengirim `endDate` baru bisa dinilai setelah digabung dengan baris tersimpan.
Tanpa pemeriksaan gabungan, dua permintaan yang masing-masing sah menghasilkan
baris yang selesainya mendahului mulainya. Keduanya diuji terpisah.

**D5 — `NULLS LAST` pada urutan bawaan.**
Riwayat tanpa tanggal bukan riwayat paling baru — ia riwayat yang belum lengkap,
dan menaruhnya di puncak berarti CV seseorang dibuka oleh baris yang paling
sedikit ia isi. `id desc` menengahi seri, dan untuk `skills` (tanpa kolom
tanggal) `id desc` **adalah** urutan terbaru dulu: UUID v7 memuat waktu pembuatan
di 48 bit pertama (SDD §14). Ada test yang akan merah bila id kelak berganti v4.

**D6 — id dibuat server, `id` di badan permintaan ditolak sebagai field asing.**
id pilihan klien adalah id yang bisa ditebak, dan baris yang idnya bisa ditebak
adalah baris yang bisa ditabrak dengan sengaja. `.strict()` juga menolak `userId`
— percobaan menitipkan kepemilikan lewat badan permintaan berakhir 400, bukan
diabaikan diam-diam.

**D7 — `updateOwned` memakai dua statement tanpa transaksi.**
`updateMany` (yang menyaring `userId`) lalu `findFirst`. Satu-satunya yang bisa
menghapus baris itu di antaranya adalah **pemiliknya sendiri** dari permintaan
lain, dan 404 pada kasus itu justru jawaban yang benar — barisnya memang sudah
tidak ada saat jawabannya disusun. Berbeda dengan gerbang consent PR-037, tidak
ada keadaan berbahaya yang bisa lolos di celah ini.

**D8 — Bagian ekspor: SATU `profile`, bukan empat bagian sejajar.**
Riwayat kerja, pendidikan, dan keahlian tidak berarti apa-apa lepas dari profil
yang memilikinya; memecahnya menjadi empat key membuat pembaca berkas merakit
ulang hubungan yang sudah jelas. Peta di `export-kelengkapan.test.ts` adalah
tabel→bagian, jadi empat tabel boleh menunjuk bagian yang sama.

**D9 — Bagian sensitif IKUT diekspor, terdekripsi.**
Itu inti hak portabilitas: data yang paling dilindungi adalah data yang paling
berhak dibawa pemiliknya. Yang menjaganya tetap milik pemilik adalah
endpoint-nya (`/me/export`, sesi sendiri) dan gerbang consent yang sudah ada di
`snapshotFor` — consent dicabut berarti `sensitive: null` tanpa ciphertext-nya
pernah disentuh.

**D10 — `field profile` WAJIB di `dataExportSchema`, bukan opsional.**
Setiap akun punya profil; barisnya mungkin belum pernah ditulis, tetapi bentuk
kosongnya tetap ada. Field opsional berarti ekspor tanpa profil tetap lolos
validasi — persis kegagalan senyap yang `.strict()` ada untuk cegah. Konsekuensi
yang dibayar: `users-export*.test.ts` dan fixture `api-client` harus menyediakan
bagian itu. Itu memang gunanya field wajib.

**D11 — `snapshotFor(userId)` / `listFor(userId)` ditambahkan, bukan mengarang
`requestId`.** Kontributor ekspor hanya menerima `userId`, sedangkan service
menerima `ProfilesActor`. Id permintaan karangan akan tampak sah di jejak mana
pun ia muncul, dan jejak yang menunjuk permintaan yang tidak pernah ada lebih
buruk daripada jejak yang tidak ada.

**D12 — `effectType: "same"` pada transform zod, DAN urutan `.nullable()` diubah
supaya pernyataan itu benar.** Skema akomodasi ikut terbawa ke dokumen OpenAPI
begitu `/me/export` memuat profil, dan zod-openapi tidak bisa menentukan tipe
`ZodEffects` — pembuatan dokumen **gagal**, bukan sekadar kurang rapi. Alih-alih
menempelkan `effectType` sebagai mantra, `.nullable()` dipindah ke **sebelum**
`.transform()`: perilakunya identik (null tetap null, string kosong tetap menjadi
null) tetapi tipe masuk dan keluar menjadi sama-sama `string | null`, sehingga
`"same"` menjadi pernyataan yang benar. Ditangkap `typecheck`, bukan review.

**D13 — `openapi.ts` tetap tidak memuat path `/me/*` profil.**
Mengikuti preseden PR-034 dan PR-037. Yang berubah: bagian `profile` kini muncul
di dokumen **lewat** response `/me/export`, jadi seluruh skema karier sudah
terdokumentasi sebagai komponen meski endpoint-nya belum. Utangnya menyusut,
tetapi belum lunas — lihat "Utang yang SENGAJA ditinggalkan".

### Utang yang SENGAJA ditinggalkan

* **Path `/me/experiences`, `/me/educations`, `/me/skills` belum masuk
  `openapi.ts`.** Ini utang yang **bertambah** dua PR berturut-turut (PR-037
  menundanya, PR-038 mengikutinya), dan layak disebut sebagai utang alih-alih
  konvensi: dua belas endpoint yang tidak terdokumentasi adalah dua belas
  endpoint yang klien mobile (Phase 15) tidak bisa hasilkan client-nya secara
  otomatis. Waktu yang tepat membayarnya adalah saat konsumen pertamanya lahir
  (PR-040), supaya dokumennya ditulis terhadap pemakaian yang nyata.
* **`SELECT … FOR UPDATE` pada gerbang consent PR-037** — masih ditunda ke
  PR-039, tidak tersentuh PR ini.
* **Batas panjang daftar belum ada.** Tidak ada batas jumlah riwayat kerja,
  pendidikan, atau keahlian per pengguna, dan `GET` mengembalikan seluruhnya
  tanpa pagination. Untuk MVP (< 5.000 pengguna, daftar yang diisi tangan) itu
  memadai; yang akan menjadikannya masalah adalah klien otomatis, dan
  penjagaannya adalah rate limit — Phase 17.

### Verifikasi

* **AC-1 (CRUD + otorisasi)** diuji berparameter untuk **ketiga** entitas
  sekaligus: siklus penuh buat→baca→ubah→hapus, ditambah kasus kepemilikan yang
  memeriksa dua hal terpisah — permintaannya ditolak 404, **dan** barisnya
  benar-benar tidak tersentuh. Diuji lagi terhadap PostgreSQL sungguhan di
  `career-db.test.ts`.
* **Tabel palsu di `career-http.test.ts` sengaja MENGABAIKAN `select`,** sehingga
  baris yang kembali membawa `userId` — kolom yang tidak boleh muncul di
  response. Fake yang menghormati `select` akan menyembunyikannya dan membuat
  pemetaan eksplisit di service tampak tidak perlu diuji. Ada assertion khusus
  bahwa `userId` tidak bocor.
* **AC-2 (`profile.updated`)** diuji lewat **pelanggan bus sungguhan**, bukan
  mata-mata atas `emit`: yang ingin dibuktikan adalah pelanggan menerima payload
  yang benar. Diuji tiga arah — terbit pada create/update/delete, membawa
  `section` yang sesuai entitasnya, dan **tidak** terbit saat mutasinya gagal.
* **AC-3 (validasi)** — 7 test: urutan tanggal dalam satu permintaan dan
  terpisah, tanggal yang tidak ada di kalender, panjang teks, field asing, batas
  tahun pendidikan, teks wajib yang hanya berisi spasi.
* **AC-4 (urutan)** diuji **hanya** terhadap PostgreSQL sungguhan — yang
  menjalankannya `ORDER BY … NULLS LAST`, yang tidak punya padanan di fake.
* **AC-5 (cascade delete)** diuji dengan menghapus akun lalu menghitung baris
  ketiga tabel. Yang menjalankannya FK `ON DELETE CASCADE` di migrasi 02, bukan
  satu baris kode pun — tanpa test ini, penghapusan akun akan meninggalkan
  riwayat kerja seseorang di database setelah ia meminta datanya hilang, tanpa
  satu pun error.
* **Kontributor ekspor** diuji sampai ke bentuk berkas penuh: bagiannya lolos
  `dataExportSchema.parse`, data sensitif ikut terdekripsi, consent yang dicabut
  menghasilkan `sensitive: null` (bukan key yang hilang), dan keempat sumbernya
  menerima `userId` yang sama.
* **Registry route** diuji mendeklarasikan tepat empat belas route, seluruhnya
  `authenticated`.

### Risiko yang ditemukan

* **GERBANG `boundaries/element-types` SELAMA INI TIDAK MEMERIKSA APA PUN.**
  Ini temuan paling penting dari PR ini, dan ia **tidak disebabkan PR ini** —
  ia pre-existing sejak PR-002.

  Ditemukan tidak sengaja: Windows Defender menandai
  `eslint-plugin-boundaries/index.js` sebagai malware (false positive) dan
  menghapusnya, sehingga `pnpm lint` untuk `apps/api` gagal memuat plugin. Saat
  memulihkannya (berkas entry-nya hanya `module.exports = require("./src/index")`
  — 41 byte, ditulis ulang tangan), pemeriksaan "apakah gerbangnya benar-benar
  bekerja" dilakukan dengan menaruh pelanggaran sengaja: satu service modul
  `profiles` yang mengimpor repository modul `users`. **Lint tetap hijau.**

  Sebabnya resolusi impor. Seluruh kode repo ini memakai penentu ESM
  ber-ekstensi (`from "../../users/repositories/user.repository.js"`), sedangkan
  `import/resolver` di preset hanya `node` dengan daftar ekstensi — resolver itu
  mencari berkas `user.repository.js` yang memang tidak ada (aslinya `.ts`),
  gagal, lalu boundaries **melewati** dependensi yang tidak bisa ia klasifikasi.
  `boundaries/no-unknown` dimatikan di preset, jadi tidak ada satu pun sinyal.
  Pelanggaran yang sama TANPA `.js` langsung terdeteksi — itulah yang
  membuktikan lubangnya.

  Fixture penjaga presetnya (`packages/config/fixtures/`) semuanya memakai impor
  **tanpa ekstensi**, jadi keempat test preset lulus sempurna sambil menjaga
  konfigurasi yang tidak berlaku bagi kode sungguhan. Ini pelajarannya:
  **penjaga yang diuji terhadap fixture yang tidak menyerupai kode yang
  dijaganya tidak menjaga apa pun.**

  PR ini **tidak** memperbaikinya: menyalakan resolver yang benar (mis.
  `eslint-import-resolver-typescript`) akan membuat seluruh `modules/*/index.ts`
  merah sekaligus — preset tidak mengizinkan `module-shared` merakit lapisannya
  sendiri, pola yang dipakai SETIAP modul di repo ini. Itu perubahan preset +
  audit menyeluruh, bukan tumpangan di PR profil.

  **Yang sudah diperiksa untuk PR ini:** modul `profiles` di-lint dengan
  ekstensi `.js` dilepas sementara, sehingga aturan boundaries benar-benar
  berjalan. Hasilnya 8 pelanggaran, **seluruhnya** pola `module-shared` →
  lapisan sendiri di `index.ts` yang sama dengan modul lain; impor lintas modul
  satu-satunya milik PR ini —
  `profile-export.service.ts` → `users/services/export.service.js` — **bersih**,
  sesuai aturan service→service. Setelah pemeriksaan, berkasnya dikembalikan.

  Risiko yang tersisa dicatat apa adanya: T1 "Erosi arsitektur" di CLAUDE.md §11
  bersandar pada gerbang ini, dan gerbang itu sedang tidak menjaga apa-apa.
* **`career-db.test.ts` dilewati diam-diam bila DB tidak terjangkau** (pola sama
  dengan PR-037). Di lokal tanpa Docker, AC-4 dan AC-5 **tidak benar-benar
  diperiksa** meski `pnpm test` hijau. Sudah dijalankan dan lulus 7/7 terhadap
  PostgreSQL sungguhan sebelum PR ini dikirim.
* **`2026-02-31` sempat lolos validasi** dan akan tersimpan sebagai 3 Maret.
  Ditemukan test, bukan review. Dicatat karena pelajarannya umum: `new Date`
  atas string ISO **bukan** validator tanggal.
* **Gerbang `a11y` di CI merah pada percobaan pertama, dan itu benar.** Tiga
  test e2e `apps/web/e2e/ekspor-data.spec.ts` gagal karena berkas ekspor tiruan
  di `palsukan-api.ts` belum memuat bagian `profile` yang kini wajib; klien
  memarse jawabannya terhadap `dataExportSchema`, jadi tombol "Unduh data saya"
  ditekan dan **tidak terjadi apa-apa** — persis kegagalan senyap yang berkas
  test itu ada untuk menangkap. Diperbaiki dengan melengkapi berkas tiruannya.
  Yang layak dicatat: `pnpm test` **tidak** menjalankan Playwright, jadi
  regresi ini tidak mungkin terlihat dari gerbang lokal mana pun — satu-satunya
  cara menemukannya lebih awal adalah menjalankan `test:a11y` sendiri, dan itu
  kini dilakukan (43/43 lulus di lokal sebelum push kedua).
* **Perubahan kontrak ekspor merembet ke tiga berkas test di luar modul ini**
  (`users-export.test.ts`, `users-export-http.test.ts`,
  `packages/api-client/__tests__/users.test.ts`). Itu bukan gangguan melainkan
  penjaga yang bekerja: bagian ekspor yang wajib memang harus membuat setiap
  perakit berkas gagal sampai ia menyediakannya. Yang perlu diperhatikan justru
  arah sebaliknya — kontributor stub di berkas-berkas itu memenuhi kontrak tanpa
  membuktikan isinya, jadi isi sungguhannya diuji terpisah di
  `career-export.test.ts`.
* **Manual verification (`curl`) pada Testing Checklist belum dijalankan
  seseorang.** Yang setara sudah otomatis dan lebih kuat (22 test HTTP terhadap
  server Express sungguhan dengan token RS256 nyata), tetapi kolomnya tetap
  ditandai jujur sebagai belum ada pemeriksaan tangan.

### Next steps

* **PR-039** — pemisahan akses safe/sensitive ber-audit; sekaligus tempat yang
  tepat untuk `SELECT … FOR UPDATE` pada gerbang consent (PR-037 D2).
* **PR-040** — form profil multi-bagian di web; konsumen pertama kedua belas
  endpoint ini, dan waktu yang tepat mendaftarkannya di `openapi.ts`.
* **PR baru (belum ada nomornya)** — memperbaiki resolusi impor
  `eslint-plugin-boundaries` supaya gerbang arsitektur benar-benar berjalan,
  berikut amandemen preset untuk pola `module-shared` → lapisan sendiri, dan
  audit atas pelanggaran yang selama ini tak terlihat. Fixture presetnya wajib
  ikut memakai penentu ber-ekstensi `.js`.
* **PR-069** — pelanggan `profile.updated`: perhitungan ulang embedding profil.
  Harus berupa job antrean yang dipicu event, bukan pekerjaan di dalam
  handler-nya — bus ini in-process dan tanpa persistensi.

---

## PR-039 — Kontrol Akses Data Sensitif Terpusat

> **Phase:** [05 - User Profile](../phase-05-user-profile.md#pr-039---findprofilesafe-vs-findprofilesensitive)
> **Tanggal:** 2026-08-21
> **Status:** Selesai

### Ringkasan hasil

Yang dipecahkan PR ini bukan "siapa boleh membaca data disabilitas" — itu urusan
RBAC dan sudah dijawab PR-019. Yang dipecahkan adalah masalah yang **tidak
terlihat oleh RBAC**: pembacaan yang sah tetapi tidak pernah
dipertanggungjawabkan. Admin yang memang berhak membuka profil siapa pun tetap
harus bisa ditanya *"kenapa kamu membuka profil orang ini pada 3 Agustus?"*, dan
jawabannya harus sudah ada sebelum pertanyaannya muncul.

Karena itu jalur non-pemilik dibuat **tidak punya bentuk tanpa alasan**.
`bacaSensitif` menuntut `reason`, menolak yang kosong **sebelum satu byte pun
dibaca**, dan menulis jejaknya sendiri. Tidak ada pemanggil yang bisa "lupa"
mengaudit — bukan karena ada yang mengingatkan, melainkan karena mengaudit bukan
langkah terpisah yang bisa dilewati.

Repository kini punya **dua jalur baca dengan `select` yang benar-benar
berbeda**. Ini perbedaan yang menentukan, dan bukan kosmetik: pada
`findSafeByUserId` kolom sensitifnya **tidak pernah meninggalkan PostgreSQL**,
jadi kebocoran lewat serialisasi tak sengaja, pesan galat, atau heap dump bukan
sekadar tidak boleh terjadi — ia tidak mungkin, sebab datanya memang tidak ada di
memori proses. Itu jaminan yang berbeda kelas dari "membaca semuanya lalu
membuang sebagian".

**Utang `SELECT … FOR UPDATE` yang ditinggalkan PR-037 (D2) dibayar di sini.**
Gerbang consent kini mengunci barisnya, jadi pencabutan yang commit tepat di
antara pemeriksaan dan penulisan tidak lagi bisa terlewat.

Tidak ada endpoint baru (dokumen phase: *"API Changes: tidak ada (internal)"*),
tidak ada migrasi, tidak ada perubahan frontend. Yang lahir adalah **kontrak dan
penjaganya**, sengaja lebih dulu daripada ketiga konsumennya — admin/support
(Phase 13), matching (PR-069), disclosure per lamaran (PR-075).

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` 67 berkas / **850 lulus** (1 skip tak terkait, DB nyata aktif),
`@nawasena/schemas` 32/32, `@nawasena/api-client` 53/53, `@nawasena/web`
523/523. Drift OpenAPI hijau (tidak ada endpoint baru), build web + budget bundle
hijau (112,4 KB / 200 KB), Playwright a11y **43/43**.

### Scope selesai

* **`packages/schemas/src/audit.ts`** — kontrak meta `PROFILE_SENSITIVE_READ`
  diperluas:
  * `sensitiveAccessPurposeSchema` — enum tertutup empat nilai (`selfService`,
    `support`, `matching`, `disclosure`).
  * `sensitiveAccessReasonSchema` — teks 1–200 karakter, di-`trim`.
  * meta kini `{ purpose, fields, reason, count? }`; `reason` **wajib**.
* **`apps/api/src/modules/profiles/repositories/profile.repository.ts`** —
  * `SafeProfileRow` (6 kolom) dan `SeekerProfileRow extends SafeProfileRow`.
  * `KOLOM_AMAN` / `KOLOM_SENSITIF` sebagai dua `select` terpisah.
  * `findByUserId` dipecah menjadi `findSafeByUserId` dan
    `findSensitiveByUserId`.
  * gerbang consent memakai `SELECT … FOR UPDATE` lewat `Prisma.sql`.
* **`apps/api/src/modules/profiles/services/sensitive-access.service.ts`**
  (baru, 245 baris) — `bacaAman`, `bacaSensitif`, `flushAudit`, `tertahan`,
  berikut tabel `KEBIJAKAN_AUDIT` dan ember agregat harian.
* **`apps/api/src/core/http/errors.ts`** — `ALASAN_AKSES_DIPERLUKAN` (403,
  *"Akses data disabilitas harus menyertakan alasan"*).
* **`apps/api/src/modules/profiles/index.ts`** — `ProfilesModule.sensitiveAccess`;
  repository dan crypto dirakit **sekali** lalu dibagi.
* **`apps/api/src/boot.ts`** — perakitan modul profil dinaikkan keluar dari
  callback `routes`; hook shutdown menuliskan hitungan agregat yang tertahan.
* **`docs/akses-data-sensitif.md`** (baru) — AC-5: jalur mana untuk keperluan
  apa, tabel kebijakan, bentuk baris agregat, dan peringatan `reason`.
* **`docs/audit-action-catalog.md`** — baris meta diperbarui + dua paragraf
  penjelas (`purpose` menentukan **bagaimana** baris ditulis; `reason` adalah
  satu-satunya teks bebas di seluruh katalog).
* **`apps/api/__tests__/pemindai-kode.ts`** (baru) — `tanpaKomentar` dipindahkan
  keluar dari berkas test (lihat D6).

### Keputusan teknis

**D1 — `selfService` dikeluarkan oleh TIPE, bukan oleh pemeriksaan.**
`TujuanAksesLain = Exclude<SensitiveAccessPurpose, "selfService">` membuat
tujuan itu **tidak bisa disebut** lewat `bacaSensitif`. Kalau ia boleh disebut,
siapa pun bisa membaca profil orang lain sambil mengaku sedang melayani dirinya
sendiri — dan kebijakan "self service tidak dicatat" berubah dari keringanan yang
masuk akal menjadi lubang. Pemilik membaca datanya sendiri lewat
`profiles.service.snapshotFor`, yang **tidak pernah menerima id dari input**;
identitasnya selalu dari sesi, jadi tidak ada pembacaan pihak lain yang bisa
disembunyikan di baliknya. Penjaga tipenya diuji dengan `@ts-expect-error`.

**D2 — kebijakan audit ditulis sebagai DATA, bukan cabang `if`.**
`KEBIJAKAN_AUDIT` bertipe `Record<SensitiveAccessPurpose, …>`, jadi tujuan baru
**tidak bisa lahir tanpa seseorang memilih jawabannya** — typecheck yang
menagihnya. Cabang `if` yang tersebar akan membuat tujuan kelima diam-diam jatuh
ke perilaku bawaan yang kebetulan berlaku, dan "kebetulan" adalah kata yang tidak
boleh muncul dalam kalimat tentang audit.

**D3 — `selfService` tidak dicatat, dan itu keputusan, bukan kelalaian.**
Membaca profil sendiri terjadi setiap kali halaman profil dibuka. Satu baris per
pembukaan halaman akan menenggelamkan pembacaan oleh pihak lain — satu-satunya
yang benar-benar perlu ditemukan saat menyelidiki — di bawah ribuan baris yang
tidak pernah menarik siapa pun. Audit yang penuh kebisingan berhenti berguna
sebagai audit. Dan secara hukum tidak ada pengungkapan ketika subjek dan
pembacanya orang yang sama.

**D4 — baris agregat memakai `entityId: null`, bukan salah satu subjek.**
AC-4 menuntut audit matching teragregasi harian. Barisnya berbicara tentang **satu
job**, bukan satu orang; menunjuk salah satu subjek secara sembarang akan terbaca
sebagai *"profil inilah yang dibaca"* oleh siapa pun yang menyelidikinya nanti —
tuduhan yang salah, tertulis oleh sistem sendiri. `meta.count` memikul jumlahnya.
`reason` dan `requestId` diambil dari panggilan **pertama** di ember: keduanya
menjawab "apa yang memulai pembacaan massal ini", dan jawaban itu tidak berubah
karena batch-nya panjang.

**D5 — audit ditulis MESKI barisnya tidak ada.**
Percobaan membuka profil yang ternyata kosong tetap percobaan membuka profil
seseorang. Kalau hanya pembacaan yang berhasil yang tercatat, menyisir **siapa
yang punya** data disabilitas menjadi gratis — dan justru keberadaan datanya yang
paling sensitif di sini, bukan isinya.

**D6 — `tanpaKomentar` dipindahkan keluar dari berkas test.**
Penjaga jangkauan baru membutuhkan pemindai yang sama dengan
`soft-delete-jangkauan.test.ts` (PR-021a). Meng-import berkas `.test.ts` membuat
vitest **menjalankan ulang seluruh test di dalamnya** di bawah konteks berkas
pengimpor: sembilan test yang sama muncul dua kali di laporan, dan kegagalannya
menunjuk berkas yang tidak menulisnya. Fungsinya kini tinggal di
`__tests__/pemindai-kode.ts`, yang tidak berakhiran `.test.ts` sehingga pola
`include` di `vitest.config.ts` tidak mengumpulkannya.

**D7 — `consentSensitiveAt` TIDAK ikut ke `SafeProfileRow`,** meski ia bukan data
disabilitas. Tanggal consent menyatakan bahwa orang ini pernah menyetujui
penyimpanan data disabilitasnya — kesimpulan yang sama dengan datanya sendiri.
Metadata yang membocorkan kesimpulan yang sama dengan datanya bukan metadata yang
aman.

**D8 — `reason` adalah teks bebas, dan itu melanggar aturan katalog dengan
sengaja.** Seluruh meta audit lain memakai enum atau angka justru supaya PII
tidak punya jalan masuk. Pengecualiannya dibuat karena pertanyaan yang diajukan
orang saat menyelidiki pembacaan data disabilitas bukan "kapan" melainkan
**"kenapa"**, dan enum tertutup atas alasan hanya akan menghasilkan satu nilai
`lainnya` yang dipakai untuk segalanya. Harganya nyata dan ditanggung operator —
lihat "Risiko yang ditemukan".

### Utang yang SENGAJA ditinggalkan

* **Ember agregat hidup DI MEMORI.** Proses yang dibunuh paksa (`SIGKILL`, OOM)
  kehilangan hitungan yang belum tertulis. Yang hilang adalah **angka**, bukan
  kejadian: profilnya tetap terbaca dan job matching yang menyebabkannya
  meninggalkan jejaknya sendiri di log job. Menjadikannya tahan-mati menuntut
  tabel penampung tersendiri — biaya yang tidak sebanding untuk mengamankan
  sebuah hitungan. Shutdown yang tertib sudah ditutup lewat hook di `boot.ts`.
* **`bacaSensitif` tidak memeriksa otorisasi,** dan itu memang bukan tugasnya:
  ia menjamin pembacaan meninggalkan jejak, bukan bahwa pemanggilnya berhak.
  Pemanggil wajib berada di balik `access.role("admin")` atau setara. Konsumen
  pertamanya (Phase 13) yang akan memasang gerbang itu; hari ini belum ada
  pemanggil sama sekali, jadi tidak ada yang tidak terjaga.
* **Agregasi harian per-proses, bukan per-kluster.** Dua replika API akan
  menghasilkan dua baris agregat per hari untuk pelaku yang sama. Terbaca benar
  (jumlahnya tetap benar bila dijumlahkan), dan penyatuannya menuntut penyimpanan
  bersama — yaitu utang yang sama dengan poin pertama.

### Verifikasi

* **AC-1 (setiap panggilan sensitif → baris audit ber-alasan)** diuji di dua
  lapis: unit terhadap `auditLog` tiruan, dan **integrasi terhadap PostgreSQL
  sungguhan** (`akses-sensitif-db.test.ts`) yang memeriksa `action`, `entityId`,
  dan isi `meta` pada baris yang benar-benar tertulis.
* **AC-2 (tipe)** diuji **compile-time** dengan `expectTypeOf<SafeProfile>()
  .not.toHaveProperty(...)` untuk ketiga kolom, ditambah bukti **runtime** di DB
  nyata: hasil `bacaAman` dibandingkan penuh dengan `toEqual`, lalu diperiksa
  tidak punya ketiga kunci itu. Test pendamping membuktikan barisnya memang
  **berisi** — tanpa itu, penjaga di atas bisa lulus hanya karena datanya kosong.
* **AC-3 (tanpa alasan → error)** diuji sampai ke urutannya: `AppError` terlempar
  **dan** `jejak` audit tetap kosong — yaitu penolakannya terjadi sebelum
  pembacaan, bukan sesudahnya.
* **AC-4 (agregasi harian)** diuji dengan **1000 pembacaan berturut-turut** yang
  menghasilkan **nol** baris audit sampai `flushAudit()`, lalu tepat satu baris
  ber-`count: 1000` dan `entityId: null`. Pergantian hari diuji lewat `clock`
  yang disuntik: ember kemarin ditulis saat pembacaan pertama hari ini tiba.
* **AC-5 (dokumentasi)** dijaga otomatis — satu test membaca
  `docs/akses-data-sensitif.md` dan menuntut setiap `purpose` di `KEBIJAKAN_AUDIT`
  benar-benar disebut di sana, jadi tujuan baru tidak bisa masuk tanpa
  dokumennya. Katalog audit dijaga penjaga yang sudah ada
  (`audit-catalog.test.ts`) — dan penjaga itu **memang merah** saat meta baru
  ditambahkan tanpa dokumennya, yang berarti ia bekerja.
* **Utang PR-037 (`FOR UPDATE`) dibuktikan tertutup, bukan diklaim.** Testnya
  memegang transaksi penahan di klien Prisma **kedua**, memberi aba-aba lewat
  promise `terkunci` supaya urutannya deterministik (bukan lomba), lalu
  memastikan penulisan sensitif **ditolak** dan ciphertext yang tersimpan masih
  isi lama. **Repository sempat dikembalikan ke `SELECT` biasa milik PR-037 untuk
  memastikan test ini MERAH tanpa perbaikannya** — dan memang merah.
* **Penjaga jangkauan dibuktikan tidak hampa** dengan cara yang sama: pemanggilan
  `findSensitiveByUserId` ditanam sementara di berkas yang tidak terdaftar, dan
  penjaganya menangkapnya. Penjaganya juga memeriksa dirinya sendiri — daftar
  pemanggil yang kosong (mis. karena fungsinya berganti nama) membuat test
  pertama merah.

### Risiko yang ditemukan

* **`reason` bisa memuat PII, dan tidak ada validasi yang bisa mencegahnya.**
  Ini risiko yang **dibuat dengan sengaja** (D8), bukan yang terlewat. Batas 200
  karakter menahan panjangnya; sisanya adalah pelatihan operator. Yang
  memperberatnya: `audit_logs` bertahan **2 tahun** (SDD §6.4), jadi PII yang
  masuk ke sini hidup jauh melewati baris yang memilikinya. Mitigasi yang
  dipasang hari ini adalah **menuliskannya di dua dokumen** yang memang dibaca
  orang saat menulis kode (`akses-data-sensitif.md`, `audit-action-catalog.md`)
  berikut contoh benar/salah yang eksplisit. Mitigasi yang layak dipertimbangkan
  kelak: pemindai PII sederhana (pola nomor HP/email) yang **menolak**, bukan
  yang menyunting diam-diam.
* **Penjaga jangkauan adalah pemindai teks, bukan analisis tipe.** Ia menangkap
  `repo.findSensitiveByUserId(...)` tetapi tidak menangkap pemanggilan lewat
  alias atau destructuring yang menghilangkan namanya. Itu batas yang diketahui:
  penjaga ini menaikkan biaya melanggar dari "tidak sengaja" menjadi "harus
  berusaha", dan itulah yang bisa dicapai tanpa infrastruktur analisis tipe.
* **`upsertByUserId` kini memakai raw SQL dengan nama kolom fisik**
  (`user_id`, `consent_sensitive_at`). Perubahan nama kolom di `schema.prisma`
  tidak akan membuat typecheck merah di sini — ia akan gagal saat runtime. Diuji
  oleh `akses-sensitif-db.test.ts` terhadap DB nyata, jadi CI menangkapnya; tetapi
  perlu diingat saat migrasi menyentuh tabel ini.
* **Manual verification (inspeksi `audit_logs` dengan tangan)** pada Testing
  Checklist belum dijalankan seseorang. Yang setara sudah otomatis dan lebih kuat
  (baris audit diperiksa isinya di DB nyata), tetapi kolomnya ditandai jujur
  sebagai belum ada pemeriksaan tangan.

### Next steps

* **PR-040** — form profil multi-bagian di web; konsumen pertama endpoint
  PR-038, dan waktu yang tepat mendaftarkan keduanya di `openapi.ts`.
* **Phase 13 (admin/support)** — konsumen **pertama** `bacaSensitif`. Wajib
  memasang `access.role("admin")` di depannya dan meminta alasan dari operator
  lewat UI, bukan mengarang alasan tetap di kode — alasan yang selalu sama tidak
  menjawab pertanyaan apa pun.
* **PR-069 (matching)** — pemakai jalur `agregat`. Perlu memanggil `flushAudit()`
  di akhir setiap batch, jangan bergantung pada hook shutdown saja.
* **PR-075 (disclosure per lamaran)** — pemakai `purpose: "disclosure"`. Satu
  peristiwa, satu subjek, satu baris.
* **PR baru (belum ada nomornya)** — pemindai PII untuk `reason` yang menolak
  di depan, bila insiden pertama membuktikan pelatihan operator saja tidak cukup.
