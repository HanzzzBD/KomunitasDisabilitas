# Implementation Log — Phase 07 (Notifications)

> Catatan per PR yang selesai di Phase 07. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-047 — Notifications BE + In-App

> **Phase:** [07 - Notifications](../phase-07-notifications.md#pr-047---notifications-be--in-app)
> **Tanggal:** 2026-09-05
> **Status:** Selesai

### Ringkasan hasil

Modul `notifications` lahir utuh dari router sampai repository, berlangganan tiga event
domain, dan menyajikan dua endpoint milik-sendiri: `GET /api/v1/me/notifications`
(cursor, terbaru dulu) dan `POST /api/v1/me/notifications/:id/read`. Tidak ada migrasi:
tabel `notifications` beserta indeks parsial `notifications_unread` sudah ada sejak
migrasi 03 (PR-011), dan PR ini memang tugasnya memakainya.

Tiga keputusan yang membentuk seluruh sisanya:

**1. Kalimat dirakit saat DIBACA, bukan saat ditulis.** Baris DB hanya menyimpan `type`
+ `payload` (referensi id/enum); judul dan isinya dirender `renderNotifikasi()` setiap
kali daftar diminta. Konsekuensinya perbaikan kalimat berlaku **surut** bagi seluruh
notifikasi yang sudah tersimpan — termasuk yang lahir tahun lalu. Menyimpan teks jadi
akan membuat riwayat pengguna terus membacakan kalimat lama yang sudah diketahui buruk
oleh screen reader-nya, dan tidak ada yang akan memperbaikinya.

**2. Kedua varian bahasa dikirim SEKALIGUS**, bukan dipilih server dari header. Mode
teks sederhana adalah state global klien (ADR-008) yang bisa dinyalakan kapan saja;
pengguna yang menyalakannya harus melihat daftar yang **sudah terbuka** ikut berubah
seketika, bukan setelah memuat ulang. Bentuknya `{ id, "id-simple" }` — cerminan
`EntriTeks` di katalog i18n web, tetapi katalognya tinggal di `apps/api` sebab kalimat
ini dirakit dari data yang hanya server punya dan kelak ikut ke push (PR-048) dan email
(PR-049) yang tidak pernah menyentuh React.

**3. Idempotensi diturunkan ke KUNCI PRIMER, bukan ke pemeriksaan aplikasi.** `id` baris
= `uuidV5("<type>:<userId>:<kunciPeristiwa>")`, lalu penulisannya
`createMany({ skipDuplicates })` = `ON CONFLICT DO NOTHING`. "Cek dulu, lalu tulis"
kalah balapan dengan salinan dirinya sendiri di replika kedua; kunci primer tidak pernah
kalah. Dibuktikan di DB nyata dengan dua penulisan paralel atas peristiwa yang sama →
tepat satu baris.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api`
**96 berkas / 1363 lulus** (1 skip tak terkait), `@nawasena/web` 564/564,
`@nawasena/schemas` 40/40, plus 4 workspace lain hijau. Test DB berjalan sungguhan
terhadap PostgreSQL dev (bukan skip): 9/9 di `notifications-db.test.ts`, termasuk
`EXPLAIN` yang membuktikan indeks parsialnya benar-benar terpakai.

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/notifications.ts`** — katalog tipe terpusat `notificationTypeSchema` (tiga tipe:
  `auth.selamat_datang`, `lamaran.terkirim`, `lamaran.status_berubah`),
  `NOTIFICATION_PARAM_SCHEMAS` (skema payload per tipe, `.strict()`),
  `notificationTextSchema` (dua varian), `notificationSchema`,
  `notificationListQuerySchema` (`cursor`/`limit`/`unreadOnly`),
  `notificationListMetaSchema` (`nextCursor` + `unreadCount`), response tandai-dibaca,
  dan `notificationIdParamsSchema`. Ini mitigasi risiko yang ditulis dokumen phase
  ("ledakan tipe notifikasi"): tipe baru harus muncul di tiga tempat sekaligus — enum,
  skema parameter, katalog template — dan ketiganya diikat tipe.
* **`src/applications.ts`** — `applicationStatusSchema` (cerminan enum Prisma) plus dua
  event domain: `applicationSubmittedEventSchema`, `applicationStatusChangedEventSchema`.
  Ditulis **sekarang meski modul `applications` baru lahir di Phase 12**, dengan alasan
  yang sama seperti `jobClosedEventSchema`: penerbit dan pelanggan harus membaca bentuk
  yang sama, dan bentuk itu kontrak lintas modul.
* **`src/openapi.ts` + `openapi.json`** — kedua endpoint didokumentasikan (parameter query
  ikut ter-generate). Penjaga `openapi-parity.test.ts` diperluas ke modul baru, jadi
  endpoint yang lupa didokumentasikan akan membuat CI merah — bukan diam-diam hilang dari
  klien mobile yang meng-generate diri dari dokumen itu (Phase 15).

**Core**

* **`core/events/index.ts`** — dua entri baru di `DomainEvents`: `application.submitted`,
  `application.status_changed`. Keduanya **punya pelanggan tetapi belum punya penerbit** —
  kebalikan dari keadaan `core/events` saat lahir, dan sama-sama tidak berbahaya: `emit`
  yang tidak pernah dipanggil tidak melahirkan apa pun.
* **`core/ids/index.ts`** — `uuidV5(nama, namespace?)` + `NAMESPACE_NAWASENA`. Diuji
  terhadap **vektor uji RFC 9562 §A.4**, bukan hanya terhadap dirinya sendiri: tanpa
  vektor eksternal, implementasi yang salah tetap konsisten dan test yang membandingkan
  dua panggilannya akan hijau.

**Modul (`apps/api/src/modules/notifications/`)**

* **`services/template.service.ts`** — katalog `TEMPLATE` (tiga tipe × judul & isi × dua
  varian) + `LABEL_STATUS` (delapan status lamaran × dua varian) + `renderNotifikasi()`
  yang murni. `Record<ApplicationStatus, …>` membuat status baru di Prisma menjadi
  typecheck merah, bukan label yang diam-diam hilang.
* **`services/notifications.service.ts`** — `terbitkan()` (dipanggil pelanggan event saja,
  tanpa endpoint), `list()` (ambil `limit+1` untuk tahu ada-tidaknya halaman berikut tanpa
  query hitung kedua), `markRead()` (idempoten; tidak menggeser `readAt` yang sudah ada).
* **`services/kursor.ts`** — sandi cursor base64url `(createdAt|id)` + `decodeKursor` yang
  **melempar** untuk bentuk yang tidak dikenali.
* **`repositories/notifications.repository.ts`** — satu-satunya lapisan yang menyentuh
  Prisma; **setiap** query menyebut `userId`, termasuk yang sudah menyebut `id` primer.
* **`controllers/` + `routers/`** — `access.authenticated()`, `validate({ query })` /
  `validate({ params })`, penerjemahan `KursorTidakValidError` → 400 dan
  `NotifikasiTidakDitemukanError` → 404.
* **`index.ts`** — tiga langganan event beserta `kunciPeristiwa`-nya.
* **`boot.ts`** — modul dipasang di composition root, memakai instance bus yang SAMA
  dengan modul auth (bus in-process: dua instance tidak saling mendengar).

**Test (5 berkas baru, 1 diperluas)**

* `notifications.test.ts` (15) — unit service dengan fake repository yang menegakkan
  aturan DB yang sama (id = kunci primer, setiap baca menyaring `userId`).
* `notifications-http.test.ts` (14) — server Express nyata + token RS256 nyata: event →
  row → terbaca di daftar, idempotensi lewat dua `emit`, cursor, 401/400/404.
* `notifications-db.test.ts` (9) — PostgreSQL nyata: `ON CONFLICT DO NOTHING`, dua tulis
  paralel, `EXPLAIN` indeks parsial, keyset tahan sisipan, dan tiga baris ber-`created_at`
  identik (`now()` beku dalam satu transaksi).
* `notifications-template.test.ts` (7) — snapshot **ditulis tangan**, bukan
  `toMatchSnapshot()`, plus penjaga "varian `id-simple` bukan salinan mentah `id`" bergaya
  `SAMA_DENGAN_SENGAJA` milik katalog web.
* `notifications-kontrak.test.ts` (4) — kesepadanan `applicationStatusSchema` ↔ enum
  Prisma dibaca dari `schema.prisma` di disk.
* `uuid-v7.test.ts` (+5) — `uuidV5`, termasuk vektor RFC.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| Payload hanya id + enum, tanpa judul lowongan | `notifications.payload` **tidak** terenkripsi (ADR-007 hanya menjangkau kolom bertanda), dan salinan judul akan basi setelah lowongannya diperbaiki | Menyalin judul lowongan agar kalimatnya lebih spesifik — ditolak; PR-050 membacanya lewat `applicationId` |
| `kunciPeristiwa` ditentukan di `index.ts`, bukan di service | Ia pernyataan tentang **peristiwanya** ("satu sambutan per akun"), dan hanya pembaca event yang bisa membuatnya | Service mengarang kuncinya sendiri — tebakan yang salah = pengguna menerima kabar sama dua kali |
| `userId` ikut dihitung ke dalam turunan id | Satu peristiwa yang kelak memberitahu dua orang (pelamar + perekrut, Phase 08) akan bertabrakan id | Hanya `type:peristiwa` — penerima kedua ditolak sebagai "duplikat" lalu tidak pernah dikirim |
| Keyset `(createdAt, id)`, bukan OFFSET | Notifikasi baru masuk di puncak daftar; OFFSET menggeser seluruh halaman berikutnya → item terulang & terlewat | OFFSET/limit — diuji langsung di `notifications-db.test.ts` sebagai skenario yang kebal |
| `kursor.ts` tinggal di modul, belum di `core/` | Konsumen pertama; yang kedua (PR-058) & ketiga (PR-076) sudah bernama. Pindah ke core **apa adanya** saat salah satunya lahir | Menaruhnya di core sekarang — abstraksi tanpa konsumen kedua; yang penting formatnya tidak bercabang, dan itu dijaga catatan di kepala berkas |
| 404 (bukan 403) untuk notifikasi orang lain | Jawaban berbeda = menjawab "apakah notifikasi ini ada?" kepada yang tidak berhak bertanya | 403 — membenarkan keberadaannya |
| `unreadCount` selalu total, bukan per halaman | Ia lencana; lencana yang berubah angka saat pengguna menggulir adalah lencana yang salah | Menghitung dari halaman yang sedang dibuka |
| Katalog kalimat di `apps/api`, bukan `apps/web/src/shared/i18n` | Dirakit dari data yang hanya server punya, dan ikut ke push/email yang tidak menyentuh React; backend meng-import paket frontend akan ditolak `eslint-plugin-boundaries` | Menaruhnya di katalog web |

### Risiko & batas yang diketahui

* **Notifikasi bisa HILANG bila proses mati saat event terbit.** Ini batas 2 `core/events`
  yang berlaku penuh: bus in-process tanpa persistensi. Hari ini yang menahannya adalah
  statusnya sendiri tetap benar di DB dan tetap terbaca di layar lamaran, jadi notifikasi
  bukan satu-satunya kabar. **Bila kelak ia menjadi satu-satunya kabar (sesudah email
  PR-049), kabar itu harus lahir dari job antrean yang DIPICU event ini** — bukan dari
  handler-nya. Dicatat di komentar `core/events`, bukan hanya di sini.
* **Transisi status mundur tidak melahirkan kabar kedua.** `kunciPeristiwa` =
  `applicationId:status_tujuan`, jadi `interview → in_review → interview` hanya
  menghasilkan satu notifikasi `interview`. Pilihan sadar: transisi mundur belum ada di
  Phase 12, dan memasukkan `changedAt` ke dalam kunci akan menghapus seluruh perlindungan
  terhadap event yang terbit ulang — yang jauh lebih sering terjadi. Bila transisi mundur
  lahir, yang ditambahkan ke kunci adalah **nomor urut riwayat status**, bukan waktu.
* **Dua event lamaran belum punya penerbit.** `application.submitted` dan
  `application.status_changed` menunggu Phase 12. Sampai saat itu, satu-satunya notifikasi
  yang benar-benar lahir di produksi adalah sambutan akun baru. Jalur keduanya tetap diuji
  penuh lewat `emit` langsung di test HTTP.
* **Penerbitnya wajib hidup di proses API.** Bila pengiriman lamaran kelak dipindah ke
  worker, notifikasinya diam-diam berhenti — bus-nya in-process.
* **Tidak ada penghapusan/retensi notifikasi.** Baris menumpuk selamanya sampai akunnya
  dihapus (cascade). Belum menjadi masalah pada skala MVP (<5.000 pengguna), tetapi
  belum ada pula yang menjadwalkannya.

### Next steps

* **PR-048** — devices + FCM push. Konsumen kedua `renderNotifikasi()`; template tidak
  perlu ditulis ulang.
* **PR-049** — email transaksional + preferensi kanal. Di sinilah keputusan "job antrean
  vs handler event" pada risiko pertama di atas harus diambil, bukan ditunda.
* **PR-050** — notification center web. Konsumen `params` (tautan "lihat lamaran"),
  `meta.unreadCount` (lencana), dan pemilih varian bahasa dari state a11y global.
* **Phase 12 (PR-076/PR-078)** — menerbitkan kedua event lamaran. Bentuk payload-nya
  **sudah terkunci** oleh kontrak di `packages/schemas/src/applications.ts`.

---

## PR-048a — Devices + Registrasi Perangkat

> **Phase:** [07 - Notifications](../phase-07-notifications.md#pr-048---devices--fcm-push)
> **Tanggal:** 2026-09-05
> **Status:** Selesai

### Ringkasan hasil

Separuh pertama PR-048. Tabel `devices` (migrasi 14), `POST /api/v1/me/devices`, service
dan repository perangkat, keputusan nasib tabel di dua penjaga PDP, dan satu penjaga baru
yang lahir dari kecelakaan nyata di PR ini (lihat "Kejadian" di bawah).

**PR-048 dipecah menjadi 048a/048b** mengikuti preseden PR-033a..i dan PR-043a/b. Alasannya
bukan ukuran semata: registrasi perangkat dan pengiriman push punya bentuk kegagalan yang
sama sekali berbeda — yang pertama soal kepemilikan baris dan balapan upsert, yang kedua
soal kredensial pihak ketiga, klasifikasi galat provider, dan retry. Digabung, `devices`
yang salah bentuk baru ketahuan saat push pertama dicoba.

Keputusan yang membentuk sisanya: **`fcm_token` unik GLOBAL, bukan unik per pengguna.**
Itu keputusan keamanan, bukan normalisasi. Satu perangkat fisik yang berpindah akun
(pemiliknya keluar, orang lain masuk) mengirimkan token yang sama; dengan unik global,
pendaftaran berikutnya **memindahkan** kepemilikan barisnya. Tanpa itu kedua baris hidup
berdampingan, dan pemilik lama terus menerima notifikasi pemilik baru di layar kunci
perangkat yang bukan lagi miliknya — kebocoran yang tidak meninggalkan gejala apa pun di
sisi kita. Diuji di PostgreSQL sungguhan, bukan hanya di fake.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9 — `@nawasena/api` **98 berkas / 1384
lulus** (1 skip tak terkait), `@nawasena/schemas` 40/40, `docs-links` hijau. Test DB
berjalan sungguhan terhadap PostgreSQL dev: `devices-db.test.ts` 6/6.

### KEJADIAN — migrasi generate-an hampir menghapus tujuh indeks produksi

`prisma migrate dev` untuk perubahan yang isinya hanya "tambah satu tabel" menghasilkan
**tujuh pernyataan `DROP INDEX`** yang tidak diminta siapa pun, dan **menjalankannya di DB
dev** sebelum ketahuan:

```
applications_job_status, applications_user_updated, jobs_accommodations_gin,
jobs_embedding_hnsw, jobs_status_published_at, jobs_title_trgm,
seeker_profiles_embedding_hnsw
```

**Sebabnya:** ketujuhnya dibuat lewat raw SQL di migrasi 03 dan tidak terwakili di
`schema.prisma`, sehingga Prisma membacanya sebagai drift dan "merapikannya".

**Kenapa ini serius.** Bila lolos ke produksi, pencarian lowongan (trigram + GIN) dan job
matching (HNSW pgvector) berubah menjadi seq scan — **tanpa satu pun error, tanpa satu pun
test merah.** Hanya lambat, dan hanya setelah data cukup banyak untuk membuatnya terasa.
Itu bentuk kegagalan paling mahal yang ada di repo ini: yang tidak punya gejala.

**Yang dilakukan:**

1. Migrasi generate-an dibuang; migrasi 14 **ditulis tangan** berisi pernyataan aditif saja,
   dengan sebab dan perangkapnya ditulis di kepala berkasnya.
2. DB dev dipulihkan lewat `migrate reset` — dipilih di atas "buat ulang tujuh indeksnya"
   karena reset sekaligus membuktikan migrasi 14 menerapkan bersih dari nol, persis yang
   akan dilakukan CI dan produksi. Diverifikasi: 12 indeks ada (10 pulih + 2 baru).
3. **Penjaga dipasang** di `migrasi-skema.test.ts`: setiap `DROP INDEX` di migrasi mana pun
   harus terdaftar di `DROP_INDEX_DISENGAJA` beserta alasannya. Ditambah pemeriksaan arah
   sebaliknya — sembilan indeks raw-SQL wajib tetap muncul di SQL migrasi, agar yang hilang
   karena migrasinya **diedit** (bukan di-drop) juga tertangkap.
4. Dicatat sebagai **U-15** di `docs/utang-teknis.md`. Penjaganya menutup akibat; sebabnya
   masih terbuka.

**Satu detail yang layak dicatat:** penjaga versi pertama menuduh migrasi 06 secara keliru —
ia memindai teks mentah dan menemukan `DROP INDEX` di dalam sebuah **komentar**
(*"Rollback = DROP INDEX ..."*). Diperbaiki dengan membuang komentar `--` sebelum memindai.
Penjaga yang menuduh secara keliru adalah penjaga yang pertama kali dilonggarkan orang saat
ia menghalangi — jadi false positive-nya bukan gangguan kecil, ia ancaman terhadap
penjaganya sendiri.

### Scope selesai

* **Migrasi 14 + model `Device` & enum `DevicePlatform`** — `fcm_token` unik global,
  `@@index([userId])`, FK `onDelete: Cascade`. `web` masuk enum sejak awal meski web push di
  luar scope MVP: menambah nilai enum belakangan menuntut migrasi tersendiri, nilai yang tak
  terpakai tidak menuntut apa pun.
* **`packages/schemas`** — `devicePlatformSchema`, `registerDeviceSchema` (`.strict()`, token
  1–4096 karakter), `deviceSchema`, `deviceResponseSchema`. `fcmToken` **tidak** ikut di
  response: klien sudah memilikinya, dan setiap tempat baru yang memuatnya adalah tempat
  baru ia bisa bocor.
* **`repositories/devices.repository.ts`** — `daftarkan` (upsert satu statement),
  `byUserId`, `hapusByToken`. `hapusByToken` sengaja **tanpa** `userId`, ditandai eksplisit:
  pemanggilnya processor push yang bekerja atas nama sistem, dan menuntut `userId` akan
  membuat token yang sudah berpindah pemilik luput dari pembersihan.
* **`services/devices.service.ts`** — `register` (idempoten) + `milik` (untuk PR-048b,
  dikembalikan sebagai service supaya jalur push tidak meng-import repository lintas modul).
* **`controllers/` + `routers/devices.ts`** — `access.authenticated()`, validasi di gerbang.
* **`modules/notifications/index.ts`** — kini mengembalikan `{ router, devices }`; kedua
  router menulis ke registrar yang sama, jadi `boot.ts` tetap satu `app.use()`.
* **`purge.service.ts`** — `"device"` masuk `TABEL_DIHAPUS`. **Wajib**, dan bukan
  kebersihan: jalur anonimisasi (akun `hired`) tidak memicu cascade, jadi tanpa ini sistem
  tetap sanggup mengirim push ke perangkat milik orang yang akunnya sudah dihapus.
* **`export-kelengkapan.test.ts`** — `devices` masuk `DIKECUALIKAN` dengan alasan yang sama
  persis dengan `refresh_tokens`: kredensial pengiriman, bukan data pribadi.
* **OpenAPI** — `POST /me/devices` terdokumentasi; parity test hijau.
* **Test:** `devices-http.test.ts` (12), `devices-db.test.ts` (6), `notifications-kontrak`
  (+1 paritas enum `DevicePlatform`), `migrasi-skema` (+3 penjaga `DROP INDEX`).

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| `fcm_token` unik GLOBAL | Perangkat berpindah akun harus berpindah kepemilikan | Unik per (userId, token) — pemilik lama terus menerima notifikasi pemilik baru |
| `upsert` satu statement | Dua peluncuran hampir bersamaan sama-sama lolos "cari lalu tulis" | Cek-lalu-tulis di aplikasi |
| 200, bukan 201 | Endpoint idempoten; sebagian besar panggilan tidak melahirkan apa pun, dan 201 akan berbohong | Membedakan 200/201 — menuntut repository melaporkan "lahir atau tidak", informasi yang tak dipakai siapa pun |
| `fcmToken` tidak ikut di response | Setiap tempat baru yang memuatnya adalah tempat baru ia bocor | Mengembalikan baris apa adanya |
| `devices` DIKECUALIKAN dari ekspor PDP | Kredensial pengiriman — sama dengan `refresh_tokens`; mengekspornya memindahkan kemampuan push ke berkas yang beredar | Mengekspornya sebagai "data perangkat" |
| Tidak ada endpoint hapus perangkat | Token mati dibersihkan jalur pengiriman (048b); hapus akun lewat cascade. "Logout satu perangkat" butuh klien yang memanggilnya (PR-088/094) | Menambahkannya sekarang — permukaan API tanpa pemanggil, tak pernah diuji terhadap pemakaian nyata |

### Risiko & batas yang diketahui

* **Belum ada satu pun push yang terkirim.** Seluruh PR ini adalah persiapan; pengirimannya
  PR-048b. Tabel `devices` yang terisi tanpa jalur pengiriman tidak berbahaya, hanya belum
  berguna.
* **Tidak ada pembersihan perangkat yang lama tidak menyapa.** `lastSeenAt` sudah ada dan
  sudah diperbarui setiap pendaftaran, tetapi belum ada job yang memakainya. Sampai PR-048b
  memasang penghapusan token `UNREGISTERED`, satu-satunya yang mengurangi baris `devices`
  adalah penghapusan akun.
* **Tidak ada batas jumlah perangkat per pengguna.** Pengguna dengan sesi valid bisa
  mendaftarkan token sebanyak yang ia mau. Urutan `lastSeenAt desc` di repository sudah
  disiapkan sebagai dasar pemotongan bila kelak diperlukan.
* **Verifikasi manual "push nyata ke device uji staging" belum ditempuh** — menunggu
  kredensial FCM dan perangkat uji. Sejenis dengan utang AC PR-030 #1 (login OTP e2e).

### Next steps

* **PR-048b** — adapter FCM HTTP v1 (OAuth2 service account lewat `jose`, tanpa SDK vendor,
  mengikuti pola `google-token.ts`), processor `notify:push`, produser dari `terbitkan()`
  yang hanya mengantre saat notifikasinya BENAR-BENAR lahir (kembalian `true` PR-047 —
  idempotensi push mewarisi idempotensi notifikasi), dan penghapusan token pada
  `UNREGISTERED`.
* **U-15** — sebab perangkap migrasi masih terbuka; butuh pemilik.

---

## PR-048b — FCM Push + Cleanup Token

> **Phase:** [07 - Notifications](../phase-07-notifications.md#pr-048---devices--fcm-push)
> **Tanggal:** 2026-09-05
> **Status:** Selesai — **PR-048 tuntas** (AC 5/5)

### Ringkasan hasil

Separuh kedua PR-048: adapter FCM HTTP v1, service pengiriman, produser job dari jalur
notifikasi, processor `notify:push` di worker, dan penghapusan token mati. Dengan ini
**seluruh AC PR-048 terpenuhi**.

Tiga keputusan yang membentuk sisanya:

**1. `fetch` mentah + `jose`, bukan `firebase-admin`.** Pola yang sama dengan
`google-token.ts` dan `fonnte.sender.ts`, dan alasannya sama: repo ini tidak punya
infrastruktur mock HTTP (tidak ada msw/nock), sedangkan DI `FetchLike` membuat **setiap**
cabang galat provider bisa diuji tanpa dependensi baru. SDK vendor juga membawa transitive
dependency yang jauh lebih besar daripada satu panggilan REST yang bentuknya sudah stabil
bertahun-tahun. HTTP v1, bukan API legacy — legacy sudah dimatikan Google.

**2. `token-mati` adalah NILAI BALIK, bukan exception.** FCM yang menjawab `UNREGISTERED`
bukan sedang gagal; ia sedang memberi tahu bahwa barisnya harus dihapus. Menjadikannya
exception akan memaksa pemanggil membedakan "gagal yang perlu diulang" dari "gagal yang
perlu dibersihkan" lewat pemeriksaan tipe error — perbedaan sepenting itu pantas ada di
tipe nilai balik. Akibatnya pembersihan token (AC-2) berjalan di **jalur pengiriman
normal**, bukan lewat job pembersihan terpisah yang harus dijadwalkan dan bisa lupa
dijalankan.

**3. Idempotensi push MEWARISI idempotensi notifikasi.** Produser hanya mengantre bila
`terbitkan()` mengembalikan `true`, yaitu bila barisnya benar-benar lahir (PR-047). Satu
penjaga di satu tempat, bukan dua yang bisa menyimpang. `jobId` deterministik
`push:<notificationId>` menjadi lapisan keduanya.

Gate hijau, dan kali ini **kedua gerbang CI dijalankan lokal lebih dulu** (pelajaran dari
PR ekspor PDP di hari yang sama): `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 —
`@nawasena/api` **102 berkas / 1432 lulus** (1 skip tak terkait) — dan
`pnpm --filter @nawasena/web test:a11y` 52/52.

### Satu keputusan aksesibilitas yang TIDAK diminta dokumen phase

Dokumen phase menulis *"Accessibility Test (N/A)"* untuk PR ini. Itu keliru, dan checklist-
nya sudah dikoreksi.

**Varian bahasa push mengikuti preferensi `simpleLanguage` pemiliknya (ADR-008).** Push
adalah permukaan UI seperti yang lain: pengguna yang menyalakan teks sederhana karena ia
memang lebih mudah ia pahami tidak boleh menerima kalimat formal hanya karena kalimat itu
datang lewat layar kunci. Preferensinya dibaca lewat service `accessibility` yang SAMA
dengan yang melayani `/me/accessibility` — bukan pembacaan kedua.

Kegagalan membaca preferensi **tidak** menggagalkan push: kabar dalam varian baku jauh
lebih baik daripada tidak ada kabar sama sekali.

### Scope selesai

* **`core/config/env.ts`** — `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`,
  opsional **sebagai grup** (pola Twilio/Google OAuth): nol variabel = push mati, sebagian
  terisi = boot GAGAL. `.env.example` ikut.
* **`services/fcm.sender.ts`** — penukaran OAuth2 service account (JWT RS256 lewat `jose`)
  dengan **cache access token per proses**, POST `messages:send`, dan klasifikasi galat:
  404/`UNREGISTERED`/`INVALID_ARGUMENT`/`NOT_FOUND` → `token-mati`; 401/403 →
  `FCM_KREDENSIAL_TIDAK_VALID` (cache dibuang); 429 → `FCM_RATE_LIMIT`; 5xx →
  `FCM_TIDAK_TERSEDIA`; abort → `FCM_TIMEOUT`; sisanya `FCM_JARINGAN`.
  `createUnavailableFcmSender` untuk kredensial kosong — boot tidak pernah gagal karenanya.
* **`services/push.service.ts`** — pengiriman per perangkat, pembersihan token mati,
  pemilihan varian bahasa, dan agregasi hasil. **Satu perangkat gagal tidak menjatuhkan
  sisanya**: kegagalan dikumpulkan, keputusan "ulangi" diambil setelah semuanya dicoba.
* **`modules/notifications/index.ts`** — produser `antrekanPush`, dipanggil ketiga
  langganan event. **Tidak pernah menolak**: notifikasinya sudah tertulis dan sudah terbaca
  di layar; kegagalan mengantre adalah kepentingan kita, bukan alasan menjatuhkan pelanggan
  event yang pekerjaan utamanya sudah selesai (pola `ai-usage.service.ts`).
* **`packages/schemas/src/queue.ts`** — `notifyPushJobSchema` (`notificationId` + `userId`,
  `.strict()`). Hanya referensi, bukan salinan kalimat: job yang mengendap di antrean
  melewati perbaikan teks akan mengirim kalimat lama, dan tidak ada yang menyadarinya.
  `userId` ikut supaya pembacaan di worker menyebut `where { id, userId }` — job yang
  payload-nya dirusak tidak bisa membuat processor membaca notifikasi orang lain.
* **`apps/worker/src/processors/push.ts`** + wiring — adapter tipis; **tanpa try/catch**,
  sebab melempar kembali ke BullMQ adalah satu-satunya cara retry benar-benar terjadi.
* **`apps/api/package.json`** — dua entri `exports` baru (`modules/notifications`,
  `modules/accessibility`) supaya worker bisa merakit jalur push dari potongan modul.
* **Test:** `fcm-sender.test.ts` (18), `push.test.ts` (13), `notifications-http.test.ts`
  (+3 produser), `queue.test.ts` (+2 paritas SDD §16).

### AC PR-048 — seluruhnya terpenuhi

| AC | Bukti |
|---|---|
| Push terkirim saat event status (mock FCM) | `push.test.ts` + `fcm-sender.test.ts` |
| Token invalid → dihapus otomatis | `fcm-sender.test.ts` (klasifikasi) + `push.test.ts` (hanya yang mati yang dihapus) |
| Idempotent per notification id | `notifications-http.test.ts` — event terbit ulang tidak mengantre push kedua |
| Retry/backoff sesuai SDD §16 | `queue.test.ts` — `notify-push` **dan** `notify-email` utuh, termasuk sampai ke `jobOptionsFor` |
| Satu user multi-device | PR-048a + `push.test.ts` (satu gagal tidak menjatuhkan sisanya) |

### Risiko & batas yang diketahui

* **Verifikasi manual "push nyata ke device uji staging" BELUM ditempuh** — menunggu
  kredensial FCM dan perangkat uji. Seluruh bukti berasal dari FCM yang ditiru. Yang hanya
  bisa dijawab FCM sungguhan: apakah bentuk payload `notification` + `data` benar-benar
  memunculkan notifikasi saat aplikasi tertutup, dan apakah kode galatnya persis seperti
  yang diklasifikasikan di sini. Sejenis dengan utang AC PR-030 #1 (login OTP e2e).
* **Retry mengirim ULANG ke perangkat yang sudah berhasil.** Bila satu dari tiga perangkat
  gagal, job diulang dan ketiganya dikirimi lagi — FCM tidak punya dedup, dan menyimpan
  "sudah terkirim ke perangkat mana" berarti tabel status per (notifikasi × perangkat).
  Akibatnya notifikasi ganda di sebagian perangkat pada kasus kegagalan parsial. Dinilai
  sepadan: kabar ganda jauh lebih ringan daripada kabar yang tidak sampai.
* **Access token di-cache PER PROSES, bukan di Redis.** Sengaja: token itu kredensial, dan
  menaruhnya di instans cache yang berjalan `allkeys-lru` (ADR-004) berarti menaruh
  kredensial di tempat yang bisa dibaca proses lain sekaligus bisa hilang kapan saja.
  Biayanya satu penukaran tambahan per proses per jam.
* **Push dilewati diam-diam bila kredensial kosong** — tetapi berisik di log boot worker
  dan sekali per job. Itu keadaan dev yang normal, bukan kegagalan.
* **`apps/worker` tetap tanpa test.** Processor sengaja dibuat setipis mungkin karena itu;
  seluruh keputusan hidup di `modules/notifications` yang teruji.

### Next steps

* **PR-049 — email transaksional.** **Gate masuk U-02 berlaku di sana** (durabilitas kabar):
  PR ini TIDAK mengubah keadaannya — push tetap lahir dari bus event in-process, dan
  notifikasi masih bukan satu-satunya kabar. Email berpotensi mengubahnya.
* **PR-050 — notification center web.**
* **U-09** — rename `OtpSender`/`OtpMessage` masih kandidat kuat untuk dibayar di PR-049,
  yang memang akan menyentuh kanal pengiriman.
