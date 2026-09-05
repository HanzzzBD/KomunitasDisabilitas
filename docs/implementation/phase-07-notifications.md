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

#### Objective

**Processor notify:email + template aksesibel dua varian.**

Bisnis: kanal cadangan bagi pengguna tanpa push. Teknis: adapter Resend + template (id/id-simple) + preferensi kanal per user.

#### Scope

* Processor email + template (welcome, status lamaran, CV siap)
* Preferensi kanal (default in-app+push; email opt-in)
* **Pemberitahuan pasca-hapus akun untuk akun tanpa nomor HP** — dependensi keamanan yang dititipkan Phase 03, lihat di bawah.

> **DEPENDENSI KEAMANAN DARI PHASE 03 (dicatat 2026-08-10, dari verifikasi manual PR-033c-2).**
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

> **GATE MASUK — DURABILITAS KABAR (utang U-02, keputusan owner 2026-09-05).**
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

#### Technical Notes

**Backend Changes:**

* Adapter Resend; kolom preferensi kanal (jsonb kecil di users — migrasi mini).

**Frontend Changes:**

* Toggle preferensi kanal di settings (kecil).

**Database Changes:**

* Kolom `notification_prefs jsonb` di users (additive).

**API Changes:**

* PUT /api/v1/me/notification-prefs

**Security Considerations:**

* Email tidak memuat data sensitif; link ber-token pendek umur bila ada.

**Testing Checklist:**

* [ ] Unit Test (renderer)
* [ ] Integration Test (preferensi + retry)
* [ ] E2E Test (toggle prefs)
* [ ] Accessibility Test (checklist email manual)
* [ ] Manual Verification (email nyata di staging)

**Deliverables:**

* Kanal email + preferensi kanal

**Out of Scope:**

* Kampanye marketing (bukan scope produk).

**Rollback Strategy:**

Migrasi additive; RB-Std.

#### Acceptance Criteria

* [ ] Email terkirim sesuai preferensi (mock Resend).
* [ ] Template HTML aksesibel (kontras, alt, plain-text part) — checklist.
* [ ] Opt-out email dihormati.
* [ ] Retry/backoff + DLQ.
* [ ] Kedua varian bahasa ter-render (snapshot).

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
