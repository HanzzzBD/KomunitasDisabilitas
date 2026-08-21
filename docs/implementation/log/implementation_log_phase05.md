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
