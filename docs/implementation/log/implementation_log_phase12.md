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
