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

* [ ] Unit Test (renderer)
* [ ] Integration Test (event→row; idempoten)
* [ ] E2E Test (via PR-050)
* [ ] Accessibility Test (N/A backend)
* [ ] Manual Verification (curl)

**Deliverables:**

* Notifikasi in-app backend

**Out of Scope:**

* Push (PR-048); email (PR-049).

**Rollback Strategy:**

RB-Std.

#### Acceptance Criteria

* [ ] Event → row notifikasi (integrasi).
* [ ] Idempoten per notification id (tidak dobel).
* [ ] Unread count memakai partial index (EXPLAIN).
* [ ] Template kedua varian bahasa ter-render benar (snapshot).
* [ ] Cursor pagination stabil.

#### Dependencies

* PR-019
* PR-015

#### Risks

* Ledakan tipe notifikasi. Mitigasi: katalog tipe terpusat + review.


### PR-048 - Devices + FCM Push

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

* [ ] Unit Test (payload builder)
* [ ] Integration Test (mock FCM + cleanup)
* [ ] E2E Test (via mobile PR-094)
* [ ] Accessibility Test (N/A)
* [ ] Manual Verification (push nyata ke device uji staging)

**Deliverables:**

* Infrastruktur push notification

**Out of Scope:**

* Deep link handling (PR-094).

**Rollback Strategy:**

Migrasi devices additive (aman); RB-Std.

#### Acceptance Criteria

* [ ] Push terkirim saat event status (mock FCM).
* [ ] Token invalid (unregistered) → dihapus otomatis.
* [ ] Idempotent per notification id.
* [ ] Retry/backoff sesuai SDD §16.
* [ ] Satu user multi-device didukung.

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
