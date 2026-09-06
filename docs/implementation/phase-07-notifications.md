---
phase: 7
name: "Notifications"
prs: PR-047..PR-050 (4 PR)
sprint: "4-5"
depends_on: [1, 2, 3]
source_of_truth: PRD v1.1 + SDD v1.1 + ADR-001..018
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 07 - Notifications

## Overview

Notifikasi multi-kanal visual: in-app berbasis event domain, push FCM, email Resend, dan notification center web.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, AI via gateway, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Dependencies

* [Phase 01 - Foundation](phase-01-foundation.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 02 - Authentication & Account](phase-02-authentication-account.md) - dependensi sebagian PR (lihat Dependencies per PR)
* [Phase 03 - Web Platform Base](phase-03-web-platform-base.md) - dependensi sebagian PR (lihat Dependencies per PR)

## Deliverables

* **PR-047** - Notifikasi in-app backend
* **PR-048** - Infrastruktur push notification
* **PR-049** - Kanal email + preferensi kanal
* **PR-050** - Notification center web

## Pull Requests

### PR-047 - Notifications BE + In-App

#### Objective

**Model notifikasi + subscriber event + list/read.**

Bisnis: pengguna selalu tahu status lamarannya via kanal visual (PRD FR-5.4). Teknis: subscriber event domain → notifikasi; template per tipe (id/id-simple); idempotent per id.

#### Scope

* Modul notifications + subscriber `application.*`, `auth.user_registered`
* Endpoint list (cursor) + mark-read
* Template renderer dua varian bahasa

#### Technical Notes

**Backend Changes:**

* Modul `notifications` + event wiring.

**Frontend Changes:**

* Tidak ada (PR-050).

**Database Changes:**

* Tidak ada (tabel dari PR-011).

**API Changes:**

* GET /api/v1/me/notifications
* POST /api/v1/me/notifications/:id/read

**Security Considerations:**

* requireSelf; payload notifikasi tanpa data sensitif (referensi ID saja).

**Testing Checklist:**

* [x] Unit Test (renderer) — `notifications-template.test.ts` (snapshot kedua varian, ditulis tangan) + `notifications.test.ts`
* [x] Integration Test (event→row; idempoten) — `notifications-http.test.ts` (server nyata, `emit` → daftar) + `notifications-db.test.ts` (PostgreSQL nyata, termasuk dua tulis paralel)
* [ ] E2E Test (via PR-050)
* [x] Accessibility Test (N/A backend) — kedua varian bahasa dikirim sekaligus; dijaga penjaga "id-simple bukan salinan mentah id"
* [ ] Manual Verification (curl)

**Deliverables:**

* Notifikasi in-app backend

**Out of Scope:**

* Push (PR-048); email (PR-049).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [x] Event → row notifikasi (integrasi). — `notifications-http.test.ts` "event → row notifikasi (AC)": `auth.user_registered`, `application.submitted`, `application.status_changed`.
* [x] Idempoten per notification id (tidak dobel). — id turunan `uuidV5` + `ON CONFLICT DO NOTHING`; `notifications-db.test.ts` membuktikan termasuk untuk dua penulisan PARALEL.
* [x] Unread count memakai partial index (EXPLAIN). — `notifications-db.test.ts`: rencana query menyebut `notifications_unread`.
* [x] Template kedua varian bahasa ter-render benar (snapshot). — `notifications-template.test.ts`; snapshot ditulis tangan agar kalimatnya dibaca manusia saat review.
* [x] Cursor pagination stabil. — keyset `(created_at, id)`; diuji tanpa item terlewat/terulang, tahan sisipan baris baru di tengah penyusuran, dan tetap tertentu saat `created_at` identik.

#### Dependencies

* PR-019
* PR-015

#### Risks

* Ledakan tipe notifikasi. Mitigasi: katalog tipe terpusat + review.


### PR-048 - Devices + FCM Push

> **DIPECAH MENJADI DUA (2026-09-05), mengikuti preseden PR-033a..i dan PR-043a/b.**
>
> * **PR-048a — Devices + registrasi** *(selesai)*: migrasi `devices`, `POST /me/devices`, service/repository perangkat, keputusan ekspor & purge, penjaga `DROP INDEX`.
> * **PR-048b — FCM push + cleanup token** *(selesai)*: adapter FCM HTTP v1, processor `notify:push`, produser dari jalur notifikasi, penghapusan token `UNREGISTERED`, retry/backoff.
>
> **Alasannya bukan ukuran semata.** Registrasi perangkat dan pengiriman push punya bentuk kegagalan yang sama sekali berbeda — yang pertama soal kepemilikan baris dan balapan upsert, yang kedua soal kredensial pihak ketiga, klasifikasi galat provider, dan retry. Menggabungkannya berarti satu review yang harus memegang keduanya sekaligus, dan `devices` yang salah bentuk tidak akan ketahuan sampai push pertama dicoba.
>
> **AC dipetakan:** AC-5 (multi-device) + separuh AC-2 (baris token bisa dihapus) → PR-048a. AC-1, AC-3, AC-4, dan separuh AC-2 (FCM menyatakan token mati) → PR-048b.

#### Objective

**Registrasi device + processor notify:push + cleanup token.**

Bisnis: kabar status lamaran sampai walau app tertutup. Teknis: migrasi tabel `devices` (G7), adapter FCM HTTP v1, processor `notify:push` idempotent, cleanup token invalid.

#### Scope

* Migrasi devices + endpoint registrasi
* Processor push + retry/backoff (SDD §16)

#### Technical Notes

**Backend Changes:**

* Adapter FCM; processor worker.

**Frontend Changes:**

* Tidak ada (web push out of scope MVP; dipakai mobile PR-094).

**Mobile Changes:**

* Kontrak registrasi token dipakai PR-088/094.

**Database Changes:**

* Tabel `devices` (user_id, fcm_token unique, platform, last_seen).

**API Changes:**

* POST /api/v1/me/devices

**Security Considerations:**

* Kredensial FCM service-account via env; token device bukan PII tapi diperlakukan rahasia (tidak di-log).

**Testing Checklist:**

* [x] Unit Test (payload builder) — `push.test.ts` (13), `fcm-sender.test.ts` (18)
* [x] Integration Test (mock FCM + cleanup) — `push.test.ts` (FCM ditiru + pembersihan token) + `notifications-http.test.ts` (produser); sisi registrasi: `devices-http.test.ts` (12) + `devices-db.test.ts` (6)
* [ ] E2E Test (via mobile PR-094)
* [x] Accessibility Test — BUKAN N/A seperti dugaan dokumen ini: varian bahasa push mengikuti preferensi `simpleLanguage` pemiliknya (ADR-008), diuji di `push.test.ts`.
* [ ] Manual Verification (push nyata ke device uji staging) — menunggu kredensial FCM + perangkat uji; utang tercatat

**Deliverables:**

* Infrastruktur push notification

**Out of Scope:**

* Deep link handling (PR-094).

**Rollback Strategy:**

Migrasi devices additive (aman); RB-Std.

#### Acceptance Criteria

* [x] Push terkirim saat event status (mock FCM). — PR-048b: `push.test.ts` (judul & isi hasil render sampai ke perangkat) + `fcm-sender.test.ts` (penukaran OAuth2 lalu POST `messages:send`).
* [x] Token invalid (unregistered) → dihapus otomatis. — PR-048b: `fcm-sender.test.ts` mengklasifikasikan 404/`UNREGISTERED`/`INVALID_ARGUMENT`/`NOT_FOUND` sebagai `token-mati`; `push.test.ts` membuktikan barisnya dihapus **di jalur pengiriman normal** dan hanya yang mati yang dihapus. Sisi DB-nya sudah ada di PR-048a (`hapusByToken`, `devices-db.test.ts`).
* [x] Idempotent per notification id. — PR-048b: `notifications-http.test.ts` "produser push" — event yang terbit ulang tidak mengantre push kedua. Idempotensinya **mewarisi** idempotensi notifikasi PR-047 (`lahir === false`), dengan `jobId` deterministik `push:<notificationId>` sebagai lapisan kedua.
* [x] Retry/backoff sesuai SDD §16. — PR-048b: `queue.test.ts` menegaskan `notify-push` **dan** `notify-email` utuh terhadap tabel SDD (concurrency 8/4, attempts 4 = 3× retry, backoff eksponensial 30 dtk, timeout 15 dtk), termasuk bahwa angka itu benar-benar sampai ke `jobOptionsFor`. Service melempar hanya untuk kegagalan yang pantas diulang.
* [x] Satu user multi-device didukung. — PR-048a: `devices-http.test.ts` + `devices-db.test.ts`; PR-048b: `push.test.ts` membuktikan satu perangkat gagal TIDAK menjatuhkan sisanya.

#### Dependencies

* PR-047

#### Risks

* Kuota/perubahan FCM. Mitigasi: adapter terisolasi + DLQ.


### PR-049 - Email Transaksional (Resend)

> **DIPECAH MENJADI DUA (2026-09-06), mengikuti preseden PR-033a..i, PR-043a/b, dan PR-048a/b.**
>
> * **PR-049a — Kanal email + pemberitahuan pasca-hapus** *(selesai)*: adapter Resend, katalog email dua varian, processor `notify:email`, dan kabar pasca-hapus akun bagi pengguna tanpa nomor HP — dependensi keamanan Phase 03, lunas.
> * **PR-049b — Preferensi kanal** *(selesai)*: migrasi 15 (`notification_prefs` jsonb), `GET/PUT /me/notification-prefs`, panel `/pengaturan/notifikasi`, dan email notifikasi yang menghormatinya. **Bukan tiga template email baru** seperti dugaan dokumen ini: ketiganya sudah menjadi tipe notifikasi, jadi email merender lewat renderer YANG SAMA dengan layar dan push — satu varian job, bukan tiga katalog.
>
> **Alasannya bukan ukuran semata.** Isi PR-049 utuh adalah dua pekerjaan dengan bentuk kegagalan yang berbeda sama sekali: satu kabar keamanan yang tidak punya kanal lain dan **tidak boleh** tunduk preferensi apa pun, dan satu kelompok kabar kenyamanan yang seluruh gunanya justru diatur preferensi. Menggabungkannya berarti satu review yang harus memegang keduanya — dan, lebih buruk, satu kolom `notification_prefs` yang bentuknya diputuskan sambil lalu di PR yang sedang sibuk memikirkan phishing.
>
> **AC dipetakan:** AC-1, AC-2, AC-4, AC-5 → PR-049a. AC-3 (opt-out dihormati) → PR-049b, sebab opt-out belum punya tempat disimpan; yang dibuktikan di 049a justru kebalikannya — bahwa kabar pasca-hapus **tidak boleh** tunduk padanya.

#### Objective

**Processor notify:email + template aksesibel dua varian.**

Bisnis: kanal cadangan bagi pengguna tanpa push. Teknis: adapter Resend + template (id/id-simple) + preferensi kanal per user.

#### Scope

* Processor email + template (welcome, status lamaran, CV siap)
* Preferensi kanal (default in-app+push; email opt-in)
* **Pemberitahuan pasca-hapus akun untuk akun tanpa nomor HP** — dependensi keamanan yang dititipkan Phase 03, lihat di bawah. **LUNAS di PR-049a (2026-09-06)** — lewat antrean, bukan panggilan langsung (gerbang U-02).

> **DEPENDENSI KEAMANAN DARI PHASE 03 (dicatat 2026-08-10, dari verifikasi manual PR-033c-2). — LUNAS di PR-049a, 2026-09-06.** Blok ini dipertahankan utuh, bukan dihapus: alasan sebuah kendali keamanan ada adalah hal yang paling mudah hilang begitu kendalinya terpasang, dan yang tersisa kemudian hanyalah kode tanpa sebab.
>
> **Keadaan hari ini:** menghapus akun mengirim SMS pemberitahuan ke nomor terdaftar (PR-021, `buildAccountDeletedMessage`) — *"Akun Nawasena Anda sudah dihapus. Data Anda masih bisa dipulihkan dalam 30 hari."* Akun yang masuk lewat Google **tidak punya nomor HP**, sehingga mereka **tidak menerima apa pun**. Kode-nya sudah menyebut celah ini sejak PR-021: *"celah nyata yang tertutup begitu ada kanal email"*.
>
> **Kenapa ini bukan sekadar kesantunan.** Penghapusan bersifat *soft* selama 30 hari justru supaya yang keliru bisa dibatalkan. Jendela itu **tidak berguna sama sekali** bagi orang yang tidak tahu ia ada — dan orang yang akunnya baru dihapus tidak punya alasan membuka aplikasi ini lagi dalam waktu dekat. Tanpa pemberitahuan, soft-delete 30 hari hanyalah penundaan teknis, bukan lapisan pemulihan.
>
> **Kenapa justru akun Google yang paling membutuhkannya.** Verifikasi manual membuktikan konfirmasi ulang lewat Google **lebih lemah** daripada kode OTP baru: `auth_time` tidak pernah dikirim Google (0 dari 16 token terukur), sehingga server tidak bisa memastikan autentikasinya baru. Jadi jalur dengan pembuktian identitas terlemah justru satu-satunya yang tidak punya jaring pengaman pemberitahuan.
>
> **Yang diminta:** kirim pemberitahuan pasca-hapus ke alamat email akun bila nomor HP tidak ada. Isinya mengikuti pesan SMS yang sudah ada — apa yang terjadi, sampai kapan bisa dibatalkan, dan apa yang harus dilakukan bila ini bukan dia. **Tanpa tautan**: pesan yang meminta orang mengeklik sesuatu tepat setelah kejadian mencurigakan berbentuk sama dengan phishing (alasan yang sama sudah ditulis di PR-021).
>
> **Sengaja TIDAK dikerjakan lebih awal:** membuat placeholder kanal email di Phase 03 berarti kendali keamanan yang terbaca ada tetapi tidak mengirim apa pun.
>
> **YANG DIKERJAKAN (PR-049a).** Persis seperti diminta: isi mengikuti pesan SMS (apa yang terjadi, sampai kapan bisa dibatalkan, apa yang dilakukan bila ini bukan dia), **tanpa satu pun tautan**, dan dalam kedua varian bahasa. Dua hal yang TIDAK diminta blok ini tetapi ternyata menentukan: (1) kabarnya lahir dari **job antrean**, bukan panggilan langsung — sebab kabar yang hilang di jalur ini adalah satu-satunya bukti yang pengguna itu punya (gerbang U-02); (2) hanya alamat yang **sudah terbukti** (`email_verified` dari Google) yang dikirimi — alamat hasil ketik sendiri lewat `PUT /me` tidak, sebab mengabarkan keadaan akun seseorang ke alamat yang belum terbukti miliknya adalah bahan phishing, bukan jaring pengaman.

> **GATE MASUK — DURABILITAS KABAR (utang U-02, keputusan owner 2026-09-05).**
>
> **DIJALANKAN 2026-09-06 untuk PR-049a. Jawabannya di log PR-049a; ringkasnya di bawah pertanyaan-pertanyaan ini.** Gerbang TETAP berlaku untuk **PR-049b**: email sambutan dan email status lamaran lahir dari handler bus event, dan pertanyaan yang sama harus ditanyakan ulang di sana.
>
> **PR ini tidak boleh dimulai tanpa menjawab pertanyaan di bawah lebih dulu.** Bukan formalitas: PR-047 sengaja membangun notifikasi di atas bus event **in-process tanpa persistensi** (`core/events` batas 2), dan itu keputusan yang sah selama notifikasi bukan satu-satunya kabar. Email berpotensi mengubah keadaan itu — dan perubahannya tidak akan terlihat sebagai keputusan bila tidak ditanyakan.
>
> **Kenapa gate-nya ada di sini, bukan di registry saja.** Utang yang dijadwalkan ke "PR berikutnya" tanpa penagih akan bergeser bersama PR itu — pelajaran yang sudah dibayar mahal oleh utang OpenAPI PR-037 (dijadwalkan ke PR-040; PR-040 justru mewarisi dan menambahnya).
>
> **Yang wajib diputuskan, dengan jawabannya ditulis di log PR-049:**
>
> 1. **Apakah ada peristiwa yang kabarnya menjadi SATU-SATUNYA lewat kanal ini?** Blok dependensi Phase 03 tepat di atas adalah contoh yang sudah pasti: pengguna Google-only yang menghapus akunnya **tidak punya layar** untuk melihat notifikasi in-app. Bagi dia, email yang hilang bukan pemberitahuan yang hilang — melainkan satu-satunya bukti bahwa permintaan hapusnya diproses, dan satu-satunya cara ia tahu jendela pembatalan 30 hari itu ada.
> 2. **Untuk setiap peristiwa semacam itu, kabarnya WAJIB lahir dari job antrean (BullMQ) yang DIPICU event domain — bukan dari handler event-nya.** Handler yang mengirim langsung akan ikut mati bersama prosesnya, tanpa retry dan tanpa jejak. Syarat ini sudah tertulis di komentar `core/events` dan di log PR-047; di sini ia menjadi syarat masuk.
> 3. **Bila jawabannya "tidak ada",** tuliskan alasannya — supaya PR berikutnya tidak mengulang pertanyaan ini dari nol.
>
> **Yang TIDAK diminta:** memindahkan seluruh jalur notifikasi ke antrean. Owner secara eksplisit menolak itu untuk sekarang (lihat U-02) — notifikasi in-app biasa tetap boleh lewat bus, sebab statusnya tetap benar di DB dan tetap terbaca di layar lamaran.
>
> **JAWABAN PR-049a (2026-09-06).** (1) Ada satu peristiwa semacam itu, dan ia justru **tidak pernah melewati bus event**: kabar pasca-hapus akun adalah `void sender.send().catch()` langsung di `account.service.ts` — untuk durabilitas *lebih lemah* daripada bus, sebab ia mati bersama proses tanpa retry dan tanpa jejak. (2) Kabar itu kini lahir dari job `notify-email` yang **di-await sebelum permintaan dijawab**; U-11 lunas bersamanya. (3) Ketiga kabar notifikasi biasa tetap lewat bus — PR-049a tidak mengirim satu pun email dari ketiganya. Batas yang tersisa (jendela commit→enqueue) dicatat sebagai **U-17**; asimetri jalur SMS yang masih *fire-and-forget* sebagai **U-18**.
>
> **JAWABAN PR-049b (2026-09-06).** (1) **Tidak ada.** Ketiga sumber email biasa sudah punya baris `notifications` yang terbaca di layar dan push sejak PR-048b, dan fakta yang dikabarkan tetap benar di DB. (2) Tidak berlaku — tetapi emailnya **tetap lahir dari job antrean**, bukan dikirim di dalam handler: pengiriman di dalam handler tidak punya retry sama sekali, dan hiccup provider adalah kegagalan yang paling sering di jalur ini. (3) Yang perlu dicatat supaya tidak ditanyakan lagi dari nol: email di sini **tidak menambah satu pun kelas kegagalan baru** pada U-02 — event yang hilang berarti baris notifikasinya pun tidak pernah lahir, jadi tidak ada keadaan "ada di layar tetapi emailnya hilang".

#### Technical Notes

**Backend Changes:**

* Adapter Resend (PR-049a); kolom preferensi kanal (jsonb kecil di users — migrasi 15, PR-049b).

**Frontend Changes:**

* Panel `/pengaturan/notifikasi` (PR-049b) — panel ketiga, bukan bagian dari "Akun & Data Saya": preferensi kanal menjawab pertanyaan yang berbeda ("bagaimana saya dikabari"), dan menumpuknya di panel akun akan menaruh sakelar pengubah perilaku tepat di sebelah tombol hapus akun.

**Database Changes:**

* Kolom `notification_prefs jsonb` di users (additive).

**API Changes:**

* PUT /api/v1/me/notification-prefs

**Security Considerations:**

* Email tidak memuat data sensitif; link ber-token pendek umur bila ada.

**Testing Checklist:**

* [x] Unit Test (renderer) — PR-049a: `email-template.test.ts` (20; snapshot kedua varian ditulis tangan) + `email-sender.test.ts` (18)
* [x] Integration Test (retry) — PR-049a: `email.test.ts` (17) + `auth-account.test.ts` blok gerbang U-02 (produser antrean) + `auth-account-db.test.ts` (+2, PostgreSQL nyata: pembacaan penerima menembus penjaga soft delete). **Preferensi** menyusul di PR-049b.
* [x] E2E Test (toggle prefs) — PR-049b: `notifikasi-kanal.test.tsx` (9, dirender lewat `ruteApp` produksi + axe) dan halaman `/pengaturan/notifikasi` masuk registry gerbang a11y (`e2e/halaman.ts`)
* [x] Accessibility Test — BUKAN checklist manual seperti dugaan dokumen ini: keempat invarian (`lang="id"`, bagian teks polos, nihil gambar, kontras & ukuran huruf eksplisit) **diuji otomatis** di `email-template.test.ts`, dan varian bahasa mengikuti preferensi `simpleLanguage` penerimanya (ADR-008)
* [ ] Manual Verification (email nyata di staging) — menunggu kredensial Resend + domain ber-SPF/DKIM; dicatat sebagai verifikasi manual, BUKAN blocker (keputusan owner 2026-09-06)

**Deliverables:**

* Kanal email + preferensi kanal

**Out of Scope:**

* Kampanye marketing (bukan scope produk).

**Rollback Strategy:**

Migrasi additive; RB-Std.

#### Acceptance Criteria

* [x] Email terkirim sesuai preferensi (mock Resend). — PR-049a: `email.test.ts` + `email-sender.test.ts`; PR-049b: `email-notifikasi.test.ts` + produser di `notifications-http.test.ts`. Kabar pasca-hapus sengaja TIDAK tunduk preferensi (lihat AC berikutnya).
* [x] Template HTML aksesibel (kontras, alt, plain-text part). — PR-049a, **diuji otomatis** alih-alih checklist: `lang="id"`, bagian teks polos wajib, nihil gambar (jadi tidak ada `alt` yang bisa lupa ditulis), warna 14,9:1 & 7,0:1 dan ukuran huruf ditulis inline. Ditambah: nihil tautan — pesan yang meminta orang mengeklik tepat setelah kejadian mencurigakan berbentuk sama dengan phishing.
* [x] Opt-out email dihormati. — PR-049b: ditegakkan di KONSUMEN (`email-notifikasi.test.ts`), satu-satunya titik yang dilewati setiap produser email; produser juga memeriksanya sebagai optimasi. Termasuk bentuk jsonb rusak, yang sengaja jatuh ke "belum memilih" = email MATI. Batasnya dibuktikan PR-049a: kabar pasca-hapus **tidak boleh** tunduk padanya, sebab opt-out yang membungkam satu-satunya kanal seseorang bukan preferensi melainkan lubang — dan panel web menyebutkan pengecualian itu kepada penggunanya.
* [x] Retry/backoff + DLQ. — PR-049a: `queue.test.ts` (baris `notify:email` SDD §16 utuh, `attempts > 1` dijaga tersendiri) + `email.test.ts` (yang dilempar vs yang selesai dengan `dilewati`).
* [x] Kedua varian bahasa ter-render (snapshot). — PR-049a: `email-template.test.ts`; snapshot ditulis tangan agar kalimatnya dibaca manusia saat review. PR-049b: email notifikasi memakai renderer yang SAMA dengan layar, diuji di `email-notifikasi.test.ts`.

#### Dependencies

* PR-047

#### Risks

* Deliverability. Mitigasi: domain terverifikasi (SPF/DKIM) — dicatat di runbook.


### PR-050 - Notification Center FE

#### Objective

**Daftar notifikasi + badge unread + aria-live.**

Bisnis: US-12 sisi notifikasi — kabar tanpa ketergantungan suara. Teknis: center + badge, mark-read optimistic, `aria-live="polite"` untuk notifikasi baru.

#### Scope

* Halaman/dropdown center + badge navigasi
* Mark-read (optimistic) + mark-all

#### Technical Notes

**Backend Changes:**

* Tidak ada.

**Frontend Changes:**

* Feature notifications web.

**Database Changes:**

* Tidak ada.

**API Changes:**

* Tidak ada (konsumsi).

**Security Considerations:**

* Tidak ada khusus.

**Testing Checklist:**

* [ ] Unit Test (store unread)
* [ ] Integration Test (N/A)
* [ ] E2E Test (terima→baca→navigasi)
* [ ] Accessibility Test (axe + aria-live manual NVDA)
* [ ] Manual Verification (multi-tab)

**Deliverables:**

* Notification center web

**Out of Scope:**

* Mobile center (PR-095).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Badge unread akurat tanpa refresh (refetch on focus).
* [ ] Notifikasi baru diumumkan SR tanpa mencuri fokus.
* [ ] Mark-read optimistic + rollback saat gagal.
* [ ] Navigasi dari notifikasi ke entitas terkait (lamaran).
* [ ] Keyboard-only lengkap.

#### Dependencies

* PR-047
* PR-028

#### Risks

* aria-live spam saat burst. Mitigasi: batch pengumuman.


## Exit Criteria

Phase 07 dianggap selesai bila SEMUA kondisi berikut terpenuhi:

* Seluruh 4 PR (PR-047..PR-050) merged ke main.
* Setiap checklist Acceptance Criteria per PR terpenuhi (diverifikasi di review).
* CI hijau penuh: lint boundaries, typecheck, unit, integration, a11y gate (axe + Lighthouse).
* Tidak ada regresi pada E2E alur yang sudah ada.

## Next Phase

[Phase 08 - Companies & Jobs](phase-08-companies-jobs.md)
