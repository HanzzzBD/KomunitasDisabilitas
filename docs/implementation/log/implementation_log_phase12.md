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

---

## PR-077b — Admin Applications Management (halaman web)

> **Phase:** [12 - Applications](../phase-12-applications.md#pr-077---admin-applications-management)
> **Tanggal:** 2026-10-02
> **Status:** Selesai — PR-077 lengkap (077a API + 077b web)
> **Branch:** `pr-077b-admin-applications-web` → `phase-12-applications`

### Ringkasan hasil

Bagian "Lamaran" di area admin: daftar ber-saringan (status + lowongan, di server) dengan tombol
"Muat lebih banyak", dan detail berisi ringkasan, kontak, CV terlampir, riwayat status (ordered
list), formulir ubah status beralasan, serta data yang diungkap — tersembunyi sampai dibuka lewat
dialog beralasan. Seluruh keputusan owner PR-077 (2026-10-02) diterapkan di layar.

### Scope selesai

* **`@nawasena/schemas`** — mesin status dipindah dari API ke `applications-api.ts`
  (`bolehPindahStatus`, `tujuanStatusSah`, `ALUR_STATUS_LAMARAN`, `STATUS_LAMARAN_AKHIR`).
  Web menawarkan HANYA tujuan yang sah; server tetap menegakkan. `status-machine.ts` di API kini
  re-export bernama lama (test PR-076 tidak berubah).
* **`@nawasena/api-client`** — `listApplicationsAdmin` (query `job_id`/`status`/cursor),
  `getApplicationAdmin`, `updateApplicationStatusAdmin`, `revealDisclosureAdmin`, `applicationsKeys`.
  Pembukaan data **tanpa query key**: salinan tidak pernah masuk cache TanStack.
* **Web** — `features/admin/lamaran-{daftar,detail,status-badge,pesan-galat}`,
  `routes/admin-lamaran{,-detail}.tsx`, route `/admin/lamaran` + `/admin/lamaran/:id`
  (detail memuat katalog `profil` + `onboarding` untuk label akomodasi/ragam), entri navigasi +
  kartu ringkasan admin, ±100 entri katalog `admin.lamaran.*` (id + id-simple; 13 entri identik
  didaftarkan beserta alasannya).
* Data yang dibuka disimpan di state komponen saja; "Sembunyikan lagi" membuangnya; membuka lagi
  = jejak audit baru. Fokus pindah ke judul data yang tampil (dialog menutup).
* Konflik CAS (409) diterjemahkan menjadi ajakan memuat ulang; daftar di-invalidasi sesudah ubah.

### Acceptance Criteria (PR-077 utuh)

| AC | Bukti |
|---|---|
| Update status → user menerima notifikasi (E2E) | web: `admin-lamaran.spec.ts` — PUT berangkat dengan alasan, status & riwayat diperbarui; notifikasinya: `applications-admin-db.test.ts` (077a) |
| disclose=false → admin tidak melihat data akomodasi | 077a (kontrak) + web: tanpa tombol "Tampilkan", pesan menghormati pilihan pelamar |
| Audit memuat actor + alasan | 077a; web: alasan wajib sebelum PUT/POST berangkat (jsdom + e2e) |
| Filter per lowongan/status | saringan dikirim ke server sebagai query (jsdom) |
| Bulk view (pagination) | "Muat lebih banyak" + cursor, jumlah diumumkan `role="status"` |
| Accessibility (tabel + aksi keyboard) | axe 0 pelanggaran: daftar, detail, dialog terbuka, data terbuka, sesudah ubah status — alur e2e KEYBOARD-ONLY |

### Verifikasi

* jsdom `admin-lamaran.test.tsx` 7/7; api-client `applications.test.ts`; katalog + registry hijau.
* Playwright (sesudah `build`): `admin-lamaran.spec.ts` 2/2 + registry a11y daftar & detail.
* `cek:budget`: JS awal 108,4 KB (halaman lamaran lazy).
* Suite penuh `--concurrency=1`: 26/27 → satu tes lama menghitung navigasi admin tiga entri
  (kini empat: + Lamaran), diperbarui lalu lulus. Docker mati saat dijalankan lokal, jadi test DB
  API terlewat di mesin ini; perubahan API PR ini hanya re-export mesin status — CI menjalankannya.

### Risiko & catatan

* Persona testing NVDA untuk dialog/riwayat belum dijalankan manual (harness NVDA butuh desktop
  bebas — memori U-30); axe + keyboard-only sudah.
* Tiga kabar admin (`admin.lamaran_baru`, `…_dibatalkan`, `…penempatan_terkonfirmasi`) kini
  bertautan ke `/admin/lamaran/:id` (`tautan.ts`). Tautan tipe PELAMAR tetap `null` sampai PR-079.

### Next steps

1. PR-078 — dialog disclosure + apply di web.
2. PR-079 — tracking pelamar + aktifkan tautan notifikasi pelamar.

---

## PR-078 — Apply FE — Disclosure Dialog + One-Tap

> **Phase:** [12 - Applications](../phase-12-applications.md#pr-078---apply-fe--disclosure-dialog--one-tap)
> **Tanggal:** 2026-10-02
> **Status:** Selesai
> **Branch:** `pr-078-apply-disclosure-dialog` → `phase-12-applications`

### Ringkasan hasil

Slot "Cara melamar" di detail lowongan (kosong sejak PR-059) kini hidup: tombol "Lamar lowongan
ini" membuka dialog modal berisi pilihan CV dan keputusan pengungkapan data disabilitas, lalu
`POST /jobs/:id/apply` (PR-075) dengan `Idempotency-Key`. Pengunjung yang belum masuk mendapat
tautan masuk yang kembali ke dialog; pengguna tanpa CV mendapat dua pintu pembuatan CV yang
membawa jalan pulang ke dialog yang sama.

### Keputusan owner (AskUserQuestion, 2026-10-02)

1. **Dialog modal** di halaman lowongan (bukan halaman `/lowongan/:id/lamar`).
2. **Pilihan pengungkapan mulai kosong** — dua radio setara, tidak ada yang terpilih; kirim
   tanpa memilih = galat. Memenuhi "default TIDAK diungkap" tanpa pilihan yang dibuatkan sistem:
   ketiadaan pilihan tidak pernah berangkat sebagai `false`.
3. **Pratinjau + "Ya" nonaktif bila kosong** — dialog membaca profil pemilik (`GET /me/profile`)
   dan menampilkan persis yang akan disalin; tanpa consent/data, "Ya" nonaktif BESERTA alasannya
   dan tautan ke Profil.
4. **Tanpa CV → kembali otomatis** — `/cv/chat?tujuan=…` dan "Buat CV dari profil saya" (langsung
   dari dialog) membawa `/lowongan/:id?lamar=1`; editor CV menampilkan "Kembali melamar lowongan".
5. **NVDA dijalankan sekarang** (bukan dicatat sebagai utang) — lihat Verifikasi.

### Scope selesai

**`@nawasena/api-client`** — `applyJob(client, jobId, input, idempotencyKey)` (badan divalidasi
`applyJobSchema` sebelum berangkat; kunci disediakan PEMANGGIL supaya percobaan ulang memakai
kunci yang sama); `RequestOptions.headers` (aditif; tidak bisa menimpa `authorization`/`accept`).

**`@nawasena/ui`** — `Dialog.fokusSaatTutup?: () => boolean`, diteruskan ke `onCloseAutoFocus`
Radix. Dibutuhkan karena pemicu dialog lamar LENYAP sesudah melamar; memindah fokus lewat
`requestAnimationFrame` dari luar berlomba dengan pengembalian fokus Radix dan sesekali kalah
(e2e sempat gagal sekali di suite penuh sebelum perbaikan; `--repeat-each=8` 24/24 sesudahnya).

**Web**

* `features/applications/` (folder yang direncanakan SDD §4.1):
  * `keadaan-lamar.ts` — fungsi murni: `ISIAN_AWAL` (pengungkapan `null`), `periksaIsian`,
    `dataUntukDiungkap` (aturan sama dengan `buatSnapshot` server), `cvBawaan` (paling baru
    disunting), `kunciIdempotensiBaru` (`crypto.randomUUID`, satu per pembukaan dialog).
  * `dialog-lamar.tsx` — dialog; kedua pilihan dirender komponen `OpsiUngkap` yang SAMA (jaminan
    struktural "setara secara visual"); nama radio = label, konsekuensi = deskripsi; klik ganda
    ditahan `aria-disabled` + kunci idempotensi yang sama; `SUDAH_MELAMAR` dibaca sebagai hasil.
  * `bagian-lamar.tsx` — empat keadaan (memulihkan sesi / belum masuk / masuk / sesudah melamar);
    `?lamar=1` membuka dialog lalu DIBUANG (`replace`) supaya muat ulang tidak membukanya lagi.
  * `pesan-galat.ts` — `DATA_DISABILITAS_KOSONG`, `LOWONGAN_TIDAK_DITEMUKAN`,
    `CV_TIDAK_DITEMUKAN`, `LAMARAN_SEDANG_DIPROSES` (id-simple).
* `shared/rute/tujuan.ts` — `bacaTujuanOpsional` + `denganTujuan` (lewat `bersihkanTujuan`; tujuan
  ke luar situs tetap ditolak).
* `routes/cv-chat.tsx`, `routes/cv-editor.tsx` — meneruskan/menampilkan jalan pulang.
* `features/job-feed/detail-lowongan.tsx` — slot diganti `BagianLamar`;
  `companies-publik/akomodasi-daftar.tsx` mengekspor `KUNCI_AKOMODASI` (label pratinjau).
* Katalog: 50 entri `lowongan.lamar.*` + `resume.kembaliMelamar`, semuanya id ≠ id-simple;
  `lowongan.detail.melamar.penjelasan` (teks "segera tersedia") dihapus.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Default = TIDAK diungkap; tidak ada pre-checked | unit `lamar-keadaan.test.ts` (`ISIAN_AWAL`, `periksaIsian` tanpa pilihan → galat); jsdom: kedua radio `not.toBeChecked`, kirim → galat + 0 permintaan; e2e + NVDA: "not checked" |
| Konsekuensi Ya/Tidak dijelaskan id + id-simple | katalog (kelengkapan hijau); jsdom `toHaveAccessibleDescription`; NVDA membacakan sebagai deskripsi |
| Tanpa CV → buat CV lalu kembali | e2e: dialog tanpa CV → "Buat CV dari profil saya" → `/cv/:id?tujuan=` → "Kembali melamar lowongan" → dialog terbuka lagi dengan CV baru terpilih; jsdom: href `/cv/chat?tujuan=…` |
| Klik ganda tidak melamar dua kali | jsdom: klik + dblclick saat mengirim → 1 permintaan; percobaan ulang sesudah galat jaringan memakai `Idempotency-Key` yang SAMA; server menjamin sisanya (PR-075) |
| Dialog lolos NVDA checklist + keyboard-only | e2e seluruhnya keyboard; axe 0 pelanggaran di 5 keadaan; NVDA: [checklist](pr-078-nvda-checklist.md) |

### Verifikasi

* jsdom `lamar.test.tsx` 10/10, unit `lamar-keadaan.test.ts` 14/14, `tujuan.test.ts` 20/20,
  `ui/dialog.test.tsx` 21/21, api-client `applications.test.ts` (+3).
* Playwright sesudah `build`: `lamar.spec.ts` 3/3, diulang `--repeat-each=8` → 24/24; suite a11y
  penuh 130 lulus + 1 gagal yang ternyata balapan fokus di atas (diperbaiki, lalu stabil).
* `cek:budget`: JS awal 108,4 KB — tidak berubah (fitur lamar ada di chunk lowongan).
* Suite `turbo run lint typecheck test --concurrency=1`: **27/27 task**. Docker mati di mesin ini,
  jadi test DB API terlewat; PR ini tidak menyentuh API.
* **NVDA** (`verifikasi/lamar-nvda.verifikasi.ts`, 3 run sah — semua langkah jendela uji di
  depan). Run 1 menemukan konsekuensi dibacakan DUA kali (masuk nama dan deskripsi) → diperbaiki
  dengan `aria-labelledby`, dijaga `toHaveAccessibleName`. Temuan minor diterima: NVDA sempat
  membacakan tautan navigasi sebelum judul hasil; fokus akhir benar dan `flushSync` tidak
  mengubahnya (kursor mode jelajah NVDA, bukan celah fokus).

### Risiko & catatan

* "Sudah melamar" baru diketahui SAAT mencoba (409 → layar hasil "Anda sudah melamar"), belum
  ditampilkan sebelum dialog dibuka. Butuh daftar lamaran pelamar di halaman lowongan — wajar
  dibawa PR-079 ("Lamaran Saya") bila diinginkan.
* Layar hasil menautkan ke Notifikasi, bukan "Lamaran Saya" — halamannya belum ada (PR-079).
* Data profil sensitif (milik pengguna sendiri) masuk cache TanStack lewat `profilesKeys.me` —
  sama dengan halaman Profil sejak PR-040; tidak ada pembacaan pihak lain.
* Risks PR-078 ("user tidak paham konsekuensi") tetap butuh uji copy dengan penguji disabilitas.
* Diff kode non-test ±900 baris (±210 di antaranya katalog teks id + id-simple, sisanya banyak
  komentar) — di atas pedoman 500 LOC. Tidak dipecah: dialog, bagian lamar, dan jalan pulang CV
  baru bermakna bersama (AC "tanpa CV → kembali" menuntut ketiganya).

### Next steps

1. PR-079 — "Lamaran Saya" (timeline, withdraw, confirm-hired) + aktifkan tautan notifikasi
   pelamar; pertimbangkan menandai lowongan yang sudah dilamar di detail lowongan.
