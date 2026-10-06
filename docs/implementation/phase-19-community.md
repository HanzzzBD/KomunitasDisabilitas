---
phase: 19
name: "Community (post-MVP)"
prs: PR-113..PR-119 (7 PR)
sprint: "setelah v1.0.0 stabil"
depends_on: [18]
source_of_truth: PRD v1.2 + SDD v1.2 + ADR-013 amendment 2026-07-24
conventions: see README.md (Konvensi Global & RB-Std)
---

# Phase 19 - Community (post-MVP)

> **STATUS: tersambung dan diratifikasi — menunggu giliran, bukan menunggu dasar.**
>
> Dokumen ini diselamatkan apa adanya dari commit `e9855f8` (2026-07-26) di branch
> `wip-rename-nawasena-docs`, yang tidak pernah di-merge. Isinya utuh dan tidak diubah.
>
> **Ketiga dasarnya sudah masuk repo pada 2026-08-21:**
>
> * **PRD v1.2** — USP #5 (ruang komunitas), US-20/US-21, FR-7.5–7.7, dan blok roadmap
>   Phase 19. Dipindahkan dari `e9855f8` ke atas `PRD.md` yang berlaku, bukan menimpanya,
>   sehingga perbaikan yang sudah masuk lebih dulu tetap utuh.
> * **SDD v1.2** — §5.4 (desain modul `community`), modul `community` di tabel §5.2, entitas
>   dan relasi di §6.1, serta keputusan soft-status/anonimisasi di §6.2 butir 6.
> * **Amandemen ADR-013 (2026-07-24)** — mempromosikan Community dari reserved boundary
>   menjadi Phase 19 post-MVP, tanpa mengubah scope PR-001..PR-112.
>
> Dua peringatan lain pada versi sebelumnya sudah **usang dan dihapus**: dokumen ini kini
> terdaftar di [README.md](README.md), dan [phase-18-release.md](phase-18-release.md) sudah
> menunjuk Phase 19 sebagai kelanjutannya.
>
> **Satu prasyarat yang tetap berlaku:** Phase 19 tidak dimulai sebelum **PR-112 (v1.0.0)
> live dan stabil**. PR-001..PR-112 tidak berubah oleh phase ini.

## Overview

Ruang diskusi karier yang aman dan aksesibel untuk pengguna Nawasena. Ruang dibuat admin berdasarkan topik atau kota; pengguna yang sudah login dapat membaca diskusi tanpa bergabung. Anggota dapat membuat post teks, membalas satu tingkat, dan melaporkan konten yang melanggar aturan.

Phase ini hanya dimulai setelah PR-112 (v1.0.0) live dan stabil. PR-001..PR-112, termasuk pekerjaan yang sudah selesai sampai PR-013, tidak berubah.

> Konvensi global (lint boundaries, zod, error envelope, a11y gate, no-PII log, <500 LOC) dan definisi **RB-Std** berlaku untuk semua PR - lihat [README.md](README.md#konvensi-global).

## Scope Boundaries

Masuk scope: ruang topik/kota yang dibuat admin, membership, post teks, komentar satu tingkat, report, moderasi, audit log, notifikasi, dan uji a11y/security.

Tidak masuk scope: pesan pribadi, unggahan gambar/video/file, live chat, user-created group, nested reply, event, mentoring, webinar, atau rekomendasi AI. Data disabilitas, akomodasi, CV, dan lamaran tidak boleh dibaca atau ditampilkan oleh modul ini.

## Deliverables

* **PR-113** - Kontrak schema dan migrasi Community
* **PR-114** - API ruang komunitas dan membership
* **PR-115** - Browse dan join Community di web
* **PR-116** - Post, komentar, report, dan moderation service
* **PR-117** - UI post, komentar, dan report yang aksesibel
* **PR-118** - Admin Community dan antrean moderasi
* **PR-119** - Gate a11y, security, PDP, dan operational readiness

## Pull Requests

### PR-113 - Community Schema + Prisma Migration

**Objective:** membuat kontrak data Community yang backward-compatible.

**Scope:** Zod/OpenAPI schema dan migrasi Prisma untuk `communities`, `community_memberships`, `community_posts`, `community_comments`, dan `community_reports`; enum status; unique membership; indeks feed, laporan, dan FTS body post.

**Acceptance Criteria:**

* [x] Migrasi dapat diterapkan pada database v1.0.0 tanpa downtime yang direncanakan.
* [x] `community_memberships` unique pada `(community_id, user_id)`.
* [x] `community_posts` dan `community_comments` memakai soft status `published|hidden|removed`.
* [x] `author_id` dapat dianonimkan oleh PDP purge tanpa menghapus jejak moderasi.
* [x] Schema request/response tersedia di `packages/schemas` dan OpenAPI berhasil dibuat.

Implementasi dan bukti verifikasi: [log PR-113](log/implementation_log_phase19.md).

**Dependencies:** PR-011, PR-013, PR-112.

### PR-114 - Community API + Membership

**Objective:** pengguna dapat menemukan ruang, melihat detail, join/leave, dan membaca feed dengan otorisasi yang benar.

**Scope:** modul `community` mengikuti `router -> controller -> service -> repo`; endpoint daftar/detail ruang, join/leave idempotent, feed cursor; event `community.member_joined`; rate limit read/write yang dapat dikonfigurasi.

**Acceptance Criteria:**

* [x] Hanya admin dapat membuat, mengubah, atau mengarsipkan ruang.
* [x] Join/leave idempotent dan tidak membuat membership ganda.
* [x] Guard penulisan mensyaratkan anggota aktif dan ruang aktif; endpoint create konten menerapkannya pada PR-116.
* [x] Employer tidak memiliki akses istimewa ke Community.
* [x] Test otorisasi mencakup pengguna lain, akun diblokir, dan ruang diarsipkan.

Keputusan owner 2026-10-06: daftar/deskripsi publik; feed memerlukan login tanpa wajib join.
Ruang arsip tetap dapat dibaca, join/penulisan baru ditutup, anggota aktif boleh keluar.
Membership `blocked` tidak dihapus lewat leave sehingga join ulang tidak membatalkan blokir.
Implementasi dan verifikasi: [log PR-114](log/implementation_log_phase19.md#pr-114--community-api--membership).

**Dependencies:** PR-019, PR-113, PR-112.

### PR-115 - Community Browse + Join Web

**Objective:** pengguna dapat menelusuri ruang lalu bergabung tanpa hambatan aksesibilitas.

**Scope:** route `community/`, daftar ruang dengan filter topik/kota, halaman detail ruang, status keanggotaan, dan aksi join/leave. Gunakan state dan api-client yang sudah ada; sediakan empty, loading, error, dan offline state.

**Acceptance Criteria:**

* [x] Semua kontrol dapat dipakai keyboard dan pembaca layar.
* [x] Label ruang, jumlah anggota, dan status join tersampaikan tanpa hanya mengandalkan warna.
* [x] Filter dan pagination tidak mereset fokus secara tidak terduga.
* [x] axe dan test komponen lulus.

**Keputusan owner (2026-10-06):** menu Komunitas tersedia untuk tamu dan semua
role. Pengguna baru yang login dari Komunitas kembali ke ruang tanpa onboarding
profil karier; join tetap melalui tombol. Kebijakan admin selalu menuju dashboard
setelah login tetap berlaku. Ruang arsip masih dapat dibuka dan anggota aktif
boleh keluar; membership blocked tidak dapat dilewati lewat join/leave.

**Bukti aksesibilitas:** label, landmark, live region, keyboard, pemulihan fokus,
axe, serta reflow 320/768/1024/1440 px dengan teks 200% diperiksa otomatis.
Audit manusia NVDA/TalkBack dan readiness tetap merupakan gate PR-119.

**Dependencies:** PR-028, PR-114, PR-112.

### PR-116 - Post, Comment, Report + Moderation Service

**Objective:** Community dapat menerima diskusi dengan jalur report/moderasi yang dapat diaudit.

**Scope:** create/edit/delete post sendiri, komentar satu tingkat, report konten, service moderasi `hide|restore|remove`, reason wajib, `audit_logs`, event `community.content_reported` dan `community.content_moderated`, serta notifikasi pemilik konten.

**Acceptance Criteria:**

* [x] Body post/komentar tervalidasi Zod, plain text disanitasi, dan memiliki batas panjang konfigurabel.
* [x] Report tidak mengungkap pelapor kepada pemilik konten.
* [x] Semua tindakan admin menyimpan actor, target, action, reason, dan timestamp di audit log.
* [x] Konten hidden/removed tidak muncul pada feed publik tetapi tetap tersedia untuk admin sesuai RBAC.
* [x] Rate limit create dan report diuji.

**Keputusan owner (2026-10-06):** semua pengguna login boleh melapor, termasuk
nonanggota/blocked. Hapus sendiri mengosongkan teks; remove admin menyimpan teks
hanya untuk admin/audit dan bersifat final. Hide/remove otomatis menyelesaikan semua
laporan open target; reject adalah aksi terpisah dengan alasan wajib. PDP tetap
memutus identitas penulis, mengosongkan body, dan mempertahankan tombstone/audit.

**Kontrak tambahan:** pemilik boleh menyunting hidden tanpa menerbitkannya ulang,
serta menghapus teks setelah keluar/blokir/arsip. Notifikasi tidak membawa body,
alasan atau identitas pelapor. Ekspor PDP post/komentar/report wajib dan hanya milik
sesi (U-39 lunas). UI diskusi di PR-117 dan admin di PR-118; PR-119 memeriksa
kompatibilitas kontrak ekspor/notifikasi dengan build mobile sebelum rollout.

Implementasi dan verifikasi: [log PR-116](log/implementation_log_phase19.md#pr-116--post-comment-report--moderation-service).

**Dependencies:** PR-014, PR-083, PR-114, PR-112.

### PR-117 - Post, Comment + Report Web UI

**Objective:** anggota dapat berdiskusi dan melapor melalui UI yang sederhana serta aksesibel.

**Scope:** composer post, daftar post, halaman detail, komentar satu tingkat, edit/hapus konten sendiri, dialog report, konfirmasi hasil aksi, dan pengumuman error/sukses yang ramah screen reader.

**Acceptance Criteria:**

* [x] Composer dan report form memiliki label, validasi inline, serta fokus kembali yang benar.
* [x] Konten moderasi menampilkan status dan reason yang dapat dipahami pemilik tanpa membocorkan pelapor.
* [x] Urutan baca screen reader mengikuti urutan diskusi; tidak ada infinite scroll tanpa alternatif pagination.
* [x] Unit, integration, dan axe test alur post-comment-report lulus.

Web menyediakan feed ruang, detail post/komentar, composer plain text, edit/hapus
milik sendiri dan dialog laporan. Draf bertahan setelah reload, dilingkupi akun
serta ruang/post dan dibersihkan setelah kirim/buang/logout. Notifikasi moderasi
membuka tulisan pemilik, termasuk komentar yang induknya sudah tidak tersedia.
Verifikasi otomatis tidak menggantikan uji NVDA/TalkBack pada PR-119.

Implementasi dan verifikasi: [log PR-117](log/implementation_log_phase19.md#pr-117--post-comment--report-web-ui).

**Dependencies:** PR-115, PR-116, PR-112.

### PR-118 - Admin Community + Moderation Queue

**Objective:** admin dapat mengelola ruang dan menyelesaikan laporan dengan keputusan yang konsisten.

**Scope:** CRUD ruang Community di admin shell, daftar report berurutan, detail target, aksi moderasi dengan reason wajib, filter status, dan metrik dasar (anggota baru, post, report terbuka, waktu resolusi).

**Acceptance Criteria:**

* [ ] Queue hanya menampilkan data minimum yang diperlukan untuk moderasi.
* [ ] Aksi tidak dapat dijalankan tanpa reason dan konfirmasi yang jelas.
* [ ] Data sensitive profile, CV, dan lamaran tidak muncul pada layar admin Community.
* [ ] Metrik Community tidak menyimpan atau menampilkan PII.
* [ ] Test RBAC dan audit-log integration lulus.

**Dependencies:** PR-052, PR-116, PR-112.

### PR-119 - Community Readiness Gate

**Objective:** memastikan Community aman, sesuai PDP, siap dimoderasi, dan aksesibel sebelum dibuka lebih luas.

**Scope:** test security/authorization/rate limit, audit a11y dengan pengguna disabilitas, PDP deletion/anonymization test, SOP moderasi dan eskalasi, dashboard alert report backlog, serta gradual rollout.

**Acceptance Criteria:**

* [ ] Tidak ada broken object-level authorization pada ruang, membership, post, komentar, atau report.
* [ ] PDP purge menganonimkan penulis sesuai desain dan tidak menghapus audit trail.
* [ ] Semua route Community lulus a11y gate; audit manusia mencakup keyboard, NVDA/TalkBack, low vision, dan teks sederhana.
* [ ] Pedoman komunitas, SOP eskalasi, dan owner antrean laporan terdokumentasi sebelum rollout.
* [ ] Rollout menggunakan feature flag dan dapat dimatikan tanpa migrasi rollback.

**Dependencies:** PR-031, PR-105, PR-117, PR-118, PR-112.

## Rollout

Mulai dari beberapa ruang yang dikurasi bersama partner komunitas, dengan admin yang memiliki jadwal moderasi jelas. Pantau report backlog, waktu resolusi, rate limit, error rate, dan hasil audit aksesibilitas sebelum memperluas kota atau topik.
