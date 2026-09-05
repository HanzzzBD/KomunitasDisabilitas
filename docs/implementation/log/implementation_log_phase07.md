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
