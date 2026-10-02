# Implementation Log — Phase 12 (Applications)

> Catatan per PR yang selesai di Phase 12. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-075 — Apply BE — Idempotent + Disclosure Snapshot

> **Phase:** [12 - Applications](../phase-12-applications.md#pr-075---apply-be--idempotent--disclosure-snapshot)
> **Tanggal:** 2026-10-01
> **Status:** Selesai
> **Branch:** `pr-075-apply-disclosure` → `phase-12-applications` (branch phase dibuat dari `main` sesudah `phase-11 → main`)

### Ringkasan hasil

Modul `applications` lahir dengan satu endpoint: `POST /api/v1/jobs/:id/apply` (role `seeker`).
Lamaran idempoten dua lapis — header `Idempotency-Key` wajib (Redis `SET NX`, 24 jam) + unique
`(user_id, job_id)` PostgreSQL — dan Disclosure Control per lamaran: `discloseDisability` wajib
dinyatakan eksplisit; `true` menyimpan **salinan terenkripsi** ragam disabilitas + akomodasi saat
itu, `false` tidak menyimpan apa pun yang sensitif (dibuktikan SQL mentah + CHECK DB). Event
`application.submitted` kini punya penerbit: pelamar menerima bukti terima (pelanggan PR-047 yang
sudah ada) dan **setiap admin aktif** menerima kabar `admin.lamaran_baru`.

### Keputusan owner (AskUserQuestion, 2026-10-01)

1. **Snapshot = kolom bytea terenkripsi** `applications.disclosure_snapshot` (migrasi 20), bukan
   tabel terpisah. Dokumen PR menyebut "Database Changes: Tidak ada", tetapi tabel PR-011 tidak
   punya tempat untuk snapshot — migrasi aditif tak terhindarkan.
2. **Isi snapshot = ragam disabilitas + akomodasi** (PRD US-11/FR-5.2), bukan akomodasi saja.
3. **Notifikasi admin = fan-out in-app ke semua admin** (tipe baru `admin.lamaran_baru`), bukan
   ditunda ke PR-077.
4. **`Idempotency-Key` WAJIB** — tanpa header → 400.
5. **Ekspor PDP lamaran dibayar di PR ini** (pemicunya menyala di sini; pelajaran U-03/U-04/U-25),
   dan **salinan pengungkapan ikut terdekripsi** di berkas ekspor milik pelamar.

### Scope selesai

**DB**

* **Migrasi 20** `20261001090000_20_application_disclosure_snapshot` — kolom `disclosure_snapshot
  BYTEA NULL` + CHECK `applications_snapshot_hanya_bila_disclose` (`disclose_disability OR
  disclosure_snapshot IS NULL`). Aditif, ditulis tangan, `down.sql` ada (membuang data salinan —
  dicatat di berkasnya).

**Kontrak (`packages/schemas`)**

* `applications.ts` — `idempotencyKeySchema` (8–128 aman-URL), `applyJobSchema` (`.strict()`,
  `discloseDisability` tanpa default), `applicationSchema`/`applicationResponseSchema` (tanpa
  snapshot), `disclosureSnapshotSchema` (bentuk bersama penulis PR-075 & pembaca PR-077),
  `exportApplicationSchema`.
* `audit.ts` — `APPLICATION_SUBMITTED` meta `{ jobId, disclosed }` (fakta, bukan isi).
* `notifications.ts` — `admin.lamaran_baru` `{ applicationId, jobId }`.
* `export.ts` — bagian `applications` (aditif, `formatVersion` tetap 1).
* `openapi.ts` / `openapi.json` — `POST /jobs/{id}/apply`.

**API**

* `modules/applications/` — repository (`create` → P2002 ⇒ `SudahMelamarError`, `adaUntuk`,
  `findOwned`, `listForExport`; select eksplisit, snapshot hanya keluar lewat jalur ekspor),
  `idempotensi.repository.ts` (klaim/baca/selesaikan/lepas + batas laju 30/jam), `apply.service.ts`,
  controller (header `Idempotent-Replayed: true` saat putar ulang), router, ekspor kontributor.
* Urutan service: laju → klaim → lowongan aktif (`jobs.getPublic`) → CV milik (`resumes.get`) →
  belum pernah melamar → **baru** baca sensitif (`bacaSensitif` tujuan `disclosure`, alasan
  konstanta) → enkripsi → insert → audit → event → selesaikan klaim. Gagal → klaim dilepas.
* **Redis fail-open**: lamaran (North Star) tidak ditolak karena cache sakit; unique DB tetap wasit.
* `core/http/errors.ts` — `IDEMPOTENCY_KEY_DIPERLUKAN` 400, `IDEMPOTENCY_KEY_BENTROK` 422,
  `LAMARAN_SEDANG_DIPROSES` 409, `SUDAH_MELAMAR` 409, `DATA_DISABILITAS_KOSONG` 422.
* `modules/users` — `listActiveAdminIds` + `createAdminDirectory`; `modules/notifications` —
  pelanggan kedua `application.submitted` (terpisah dari bukti terima pelamar, supaya kegagalan
  direktori admin tidak menelannya); template `admin.lamaran_baru` id + id-simple.
* `boot.ts` — modul dipasang sesudah `jobs`/`resumes`; `redis.cache`; kontributor ekspor
  `createApplicationsExport` di agregator.

**Web**

* `features/notifikasi/tautan.ts` — `ADMIN_LAMARAN_BARU` → `null` (halaman admin lamaran = PR-077).

**Dokumen**

* `docs/akses-data-sensitif.md` — bagian "Pemanggil `disclosure` pertama".
* `docs/audit-action-catalog.md` — baris `APPLICATION_SUBMITTED`.
* `export-kelengkapan.test.ts` — `applications` pindah DITUNDA → TERDAFTAR; DITUNDA kini kosong.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Retry ganda (key sama) → satu lamaran | `applications-db.test.ts`: berurutan (201 + 201 `Idempotent-Replayed`, id sama) dan 5 serentak kunci sama → 1 baris |
| Race paralel → satu lamaran (unique) | 5 paralel kunci berbeda → `[201,409×4]`, semua `SUDAH_MELAMAR`, 1 baris |
| disclose=false → nol jejak sensitif | SQL mentah: `disclosure_snapshot IS NULL`; tidak ada `PROFILE_SENSITIVE_READ` untuk pelamar; CHECK menolak update liar; unit: profil sensitif tidak pernah dibaca |
| disclose=true → snapshot salinan | Profil disunting sesudah melamar → snapshot tetap `netra`/`ramah_screen_reader`; respons tidak membawanya; audit `disclosure` + `APPLICATION_SUBMITTED{disclosed:true}` tanpa isi |
| Event submitted → notifikasi admin | Modul notifications nyata di bus yang sama: `lamaran.terkirim` (pelamar) + `admin.lamaran_baru` (admin) tertulis |

### Verifikasi

* Unit `applications-apply.test.ts` 15 lulus; integration `applications-db.test.ts` 11 lulus
  (PostgreSQL + Redis hidup, HTTP + token RS256 nyata).
* Suite `turbo run lint typecheck test --concurrency=1`: **26/27 task** pada lari pertama — api
  2057 lulus / 2 skip, 1 gagal: `db-seed.test.ts` **timeout 5 dtk** di bawah beban mesin (bukan
  assertion). Diulang terisolasi bersama `applications-db.test.ts`: lulus (376 ms). Seluruh
  workspace lain hijau (web 61 berkas, api-client 13, ui 14, a11y 9).

### Risiko & catatan

* Diff kode non-test ±1.000 baris (banyak komentar + kontrak + ekspor yang ditarik masuk atas
  keputusan owner) — di atas pedoman 500 LOC. Tidak dipecah: ekspor PDP sengaja ditulis bersama
  penulis pertamanya.
* `admin.lamaran_baru` belum bertautan (halaman admin = PR-077) — pola seam yang sama dengan dua
  tipe lamaran lain.
* Pembacaan sensitif tujuan `disclosure` ditulis SEBELUM insert; balapan sempit (dua permintaan
  lolos `adaUntuk` bersamaan, satu kalah unique) menghasilkan satu baris audit pembacaan tanpa
  lamaran. Diterima: jejak berlebih, bukan jejak yang hilang.
* Batas laju 30/jam/pengguna di Redis cache — evict hanya mengembalikan jatah.

### Next steps

1. PR-076 — status pipeline + `GET /me/applications` (penerbit `application.status_changed`).
2. PR-077 — pembaca snapshot oleh admin lewat jalur ter-audit (`disclosureSnapshotSchema`).

---

## PR-076 — Status Pipeline + Confirm-Hired (North Star)

> **Phase:** [12 - Applications](../phase-12-applications.md#pr-076---status-pipeline--confirm-hired-north-star)
> **Tanggal:** 2026-10-02
> **Status:** Selesai
> **Branch:** `pr-076-status-pipeline` → `phase-12-applications`

### Ringkasan hasil

"Lamaran Saya" sisi API: daftar ber-cursor, detail + riwayat, withdraw, dan konfirmasi diterima
kerja (North Star). Mesin status murni (`status-machine.ts`) menjadi satu-satunya penentu
transisi dan siap dipakai jalur admin PR-077. Setiap transisi ditulis compare-and-set atas
`(status, updatedAt)` sehingga klik ganda / tindakan admin yang bersamaan tidak saling menimpa
riwayat. Event `application.status_changed` (kini membawa `changedBy`) dan event baru
`application.hired_confirmed` punya penerbit.

### Keputusan owner (AskUserQuestion, 2026-10-02)

1. **Transisi:** maju boleh loncat sepanjang `submitted → viewed → in_review → interview → offered
   → hired`; mundur dilarang; `hired`/`rejected`/`withdrawn` akhir. Pelamar hanya withdraw (dari
   status aktif); admin semua langkah maju + `rejected`, tetapi tidak `withdrawn`.
2. **confirm-hired saat `offered` ATAU `hired`.** Dari `offered` status ikut pindah ke `hired`;
   dari `hired` hanya mengisi `hired_confirmed_at`. Idempoten.
3. **Aksi pelamar sendiri tidak dikabarkan kembali kepadanya** (`changedBy: "seeker"` dilewati);
   admin dikabari saat withdraw (`admin.lamaran_dibatalkan`) dan saat konfirmasi
   (`admin.penempatan_terkonfirmasi`, untuk verifikasi silang R10).
4. **List ber-cursor + endpoint detail** `GET /me/applications/:id` (di luar dokumen PR —
   dibutuhkan timeline & tautan notifikasi PR-079).

### Scope selesai

**Kontrak (`packages/schemas`)**

* `applications.ts` — `changedBy` pada `applicationStatusChangedEventSchema`;
  `applicationHiredConfirmedEventSchema`; `applicationStatusHistoryEntrySchema` (`by` = PERAN,
  bukan id — id pelaku ada di `audit_logs`); `applicationIdParamsSchema`,
  `applicationJobSummarySchema` (`aktif`), `myApplication(Detail)Schema` + response; ekspor PDP
  kini memuat `statusHistory` + `hiredConfirmedAt`.
* `audit.ts` — `APPLICATION_HIRED_CONFIRMED { from: offered|hired }`.
* `notifications.ts` — `admin.lamaran_dibatalkan`, `admin.penempatan_terkonfirmasi`.
* `openapi.ts`/`openapi.json` — 4 path `/me/applications…`.

**API**

* `modules/applications` — `status-machine.ts` (`bolehPindah`, `ALUR_STATUS`, `STATUS_AKHIR`),
  `status.service.ts`, `status.controller.ts`; repository `listMine` (indeks
  `applications_user_updated`), `findOwnedDetail`, `perbarui` (CAS). Semua route `role("seeker")`.
* `modules/jobs` — `ringkasanUntukLamaran(ids)` (apa pun statusnya, `aktif` dihitung) +
  repo `listByIdsWithCompany`.
* `modules/notifications` — pelanggan `status_changed` melewati `changedBy: seeker`; helper
  `kabariAdmin` dipakai tiga kabar admin; pelanggan `application.hired_confirmed`; dua template
  baru (id + id-simple).
* `core/events` — `application.hired_confirmed`; `core/http/errors.ts` —
  `LAMARAN_TIDAK_DITEMUKAN` 404, `STATUS_LAMARAN_TIDAK_VALID` 409.

**Web** — `tautan.ts`: dua tipe admin baru → `null` (halaman admin = PR-077).

### Perbaikan atas PR-075

`applications-db.test.ts` memakai `REDIS_URL ?? 6379`, padahal CI hanya menyediakan
`REDIS_QUEUE_URL` (6380): **seluruh 11 test integration apply terlewat di CI tanpa tanda**
(lokalnya kebetulan mengenai Redis proyek lain di 6379). Kini memakai rantai yang sama dengan
`auth-otp-redis.test.ts` (`REDIS_URL ?? REDIS_QUEUE_URL ?? 6380`) dan lulus 11/11 terhadap
Redis dev.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Transisi ilegal ditolak — test state machine penuh | `applications-status-machine.test.ts`: 8×8×2 kombinasi vs tabel tulis-tangan + contoh `rejected→hired` |
| Setiap transisi menulis history {from,to,by,at} | `applications-status-db.test.ts`: withdraw & confirm dari offered → entri JSONB; dua withdraw serentak → `[200,409]`, satu entri |
| confirm-hired → `hired_confirmed_at` + event North Star | offered→hired + timestamp + audit `APPLICATION_HIRED_CONFIRMED`; dua tekan serentak → satu audit, satu kabar admin |
| Withdraw hanya pada status aktif | rejected/hired/withdrawn → 409 `STATUS_LAMARAN_TIDAK_VALID` |
| Event → notifikasi (integrasi) | modul notifications nyata: admin menerima kabar; pelamar tidak dikabari atas aksinya sendiri |

### Verifikasi

* `turbo run lint typecheck test --concurrency=1` dengan PostgreSQL + Redis hidup: 26/27 task;
  satu-satunya kegagalan snapshot katalog error (dua kode baru) — diperbarui, lalu lulus.
  api 149 berkas (1 skip berkas), web 61, api-client 13, ui 14, a11y 9.

### Risiko & catatan

* `updatedAt` adalah kunci CAS. Prisma mengisinya di sisi aplikasi (presisi milidetik), jadi
  pembandingan persis aman; penulis yang memakai SQL mentah `now()` (mikrodetik) di masa depan
  harus ikut memakai guard yang sama atau membaca ulang barisnya.
* Kabar `lamaran.status_berubah` untuk pelamar kini hanya lahir dari perubahan oleh admin — yang
  baru ada di PR-077.
* Ajakan konfirmasi saat `offered` (mitigasi R10) belum mengubah teks template; layaknya ditulis
  bersama tombolnya di PR-079.

### Next steps

1. PR-077 — admin memindahkan status lewat `bolehPindah(…, "admin")` + pembaca snapshot ter-audit.
2. PR-079 — timeline memakai `GET /me/applications/:id`; `tautanNotifikasi` mengarah ke `/lamaran/:id`.

---

## PR-077a — Admin Applications Management (API)

> **Phase:** [12 - Applications](../phase-12-applications.md#pr-077---admin-applications-management)
> **Tanggal:** 2026-10-02
> **Status:** Selesai (bagian API; halaman admin = PR-077b)
> **Branch:** `pr-077a-admin-applications-api` → `phase-12-applications`

### Ringkasan hasil

Empat endpoint `role("admin")` untuk operasional lamaran pilot: daftar ber-filter + cursor,
detail (kontak + CV + riwayat), ubah status atas nama perusahaan partner (alasan wajib), dan
membuka salinan data yang diungkap (alasan wajib, audit sebelum baca). Aturan transisi memakai
mesin status PR-076 (`bolehPindah(…, "admin")`); penulisan compare-and-set yang sama.

PR-077 dipecah dua (CLAUDE.md §9 "< 500 LOC — split", preseden PR-049a/b): **077a** API (ini),
**077b** halaman admin web.

### Keputusan owner (AskUserQuestion, 2026-10-02)

1. **Data diungkap: tersembunyi bawaan; tombol "Tampilkan" + alasan wajib**, setiap pembukaan diaudit.
2. **Alasan ubah status: teks bebas wajib 1–200**, masuk `audit_logs`, tidak terlihat pelamar.
3. **Paginasi cursor + "Muat lebih banyak"**, 50 per halaman, filter `job_id`/`status` di server.
4. **Admin melihat nama + kontak + CV pelamar** (tanpa itu lamaran tidak bisa diteruskan).

### Scope selesai

**Kontrak** — `adminReasonSchema`, `adminApplicationListQuerySchema`, `adminApplicant(Contact)Schema`,
`adminApplication(Detail)Schema` + response, `updateApplicationStatusSchema`,
`revealDisclosureSchema`, `disclosureSnapshotResponseSchema` (+ ref OpenAPI `DisclosureSnapshot`);
audit `APPLICATION_STATUS_CHANGED.reason` (opsional — pelamar tidak membawanya) dan aksi baru
`APPLICATION_DISCLOSURE_READ { reason }`; OpenAPI 4 path.

**API** — `admin-applications.service.ts`, controller, 4 route; repository `listAdmin`,
`findForAdmin`, `perbaruiOlehAdmin` (CAS), `bacaSnapshot` (satu-satunya bacaan ciphertext jalur
admin); `pemeta-lamaran.ts` diekstrak dari `status.service.ts` supaya pelamar & admin membaca
bentuk yang sama; modul users `listIdentityByIds` + `createApplicantDirectory` (akun aktif saja);
error `DATA_TIDAK_DIUNGKAP` 404. CV dibaca lewat `resumesService.get({ userId: pelamar })`.

**Lokasi:** `modules/applications`, bukan `modules/admin/applications` seperti dokumen — endpoint
admin lain (companies, jobs) juga hidup di modul domainnya, dan modul admin terpisah akan membutuhkan
repository lintas modul yang dilarang lint boundaries.

**Dokumen** — katalog audit (tiga `reason` bebas kini, aturan PII sama), `akses-data-sensitif.md`
(bagian "Admin membuka salinan pengungkapan").

### Acceptance Criteria (bagian API)

| AC | Bukti (`applications-admin-db.test.ts`) |
|---|---|
| Lamaran disclose=false → admin tidak melihat data akomodasi | daftar & detail tidak memuat isi meski lamaran diungkap; pembukaan disclose=false → 404 `DATA_TIDAK_DIUNGKAP` (tetap tercatat) |
| Audit memuat actor + alasan | `APPLICATION_STATUS_CHANGED {from,to,reason}` & `APPLICATION_DISCLOSURE_READ {reason}` ber-actor admin |
| Filter per lowongan/status | `job_id` + `status`, cursor menelusuri seluruh hasil |
| Update status → user dikabari | integrasi modul notifications: `lamaran.status_berubah` ke pelamar (E2E web menyusul 077b) |
| Pagination | cursor keyset `updated_at DESC, id DESC`, 50 bawaan, maks 100 |

### Verifikasi

* `turbo run lint typecheck test --concurrency=1` (PostgreSQL + Redis hidup): 26/27 task. Dua
  kegagalan: snapshot katalog error (kode baru, diperbarui) dan timeout 5 dtk pada tes pagination
  admin yang menyiapkan ±15 baris berurutan — batas waktu tes itu (dan satu tes sejenis) dinaikkan
  ke 20 dtk; `applications-admin-db.test.ts` 7/7 lulus.

### Perbaikan CI: Lighthouse 3G landing 0,74 (ambang 0,75)

PR ini tidak menyentuh web, tetapi CI `a11y` merah: skor performa 3G beranda turun ke 0,74.
Penyebabnya bundel awal naik 1,7 KB gzip (110,2 → 111,9 KB). `notifications.ts` (notification
center, bundel AWAL) mengimpor `applications.ts`, dan `sideEffects: false` hanya memangkas MODUL
tak terpakai — panggilan `z.object(...).openapi(...)` tingkat-atas di modul yang terpakai tetap
ikut. Seluruh kontrak HTTP lamaran (PR-075/076/077a, termasuk impor `resumeSchema`) karena itu
terunduh di beranda.

Perbaikan: kontrak HTTP dipindah ke `packages/schemas/src/applications-api.ts`; `applications.ts`
tinggal status, event, dan entri riwayat (yang dibaca pelanggan event). Bundel awal kini
**108,2 KB** — di bawah baseline sebelum PR. `openapi.json` identik (`check:openapi` sinkron).

### Risiko & catatan

* Alasan bebas adalah tempat PII bisa masuk ke audit (retensi 2 tahun). Dijaga pelatihan operator +
  teks peringatan di UI 077b, bukan validasi — sama dengan `PROFILE_SENSITIVE_READ.reason`.
* CV yang ditampilkan adalah ISI TERKINI, bukan salinan saat melamar (resume bisa disunting).
  Dicatat sebagai batas yang diketahui; salinan CV per lamaran bukan scope MVP.

### Next steps

1. PR-077b — halaman `/admin/lamaran` (tabel + filter + "Muat lebih banyak"), detail dengan aksi
   status (alasan) dan dialog "Tampilkan data yang diungkap"; E2E admin ubah → notif pelamar.
