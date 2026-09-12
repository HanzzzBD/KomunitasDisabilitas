# Implementation Log — Phase 08 (Companies & Jobs)

> Catatan per PR yang selesai di Phase 08. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-051 — Companies BE

> **Phase:** [08 - Companies & Jobs](../phase-08-companies-jobs.md#pr-051---companies-be)
> **Tanggal:** 2026-09-11
> **Status:** Selesai

### Ringkasan hasil

Modul `companies` lahir utuh dari router sampai repository: CRUD admin, endpoint
verifikasi inklusivitas, dan GET publik tanpa field internal. Tidak ada migrasi — tabel
`companies` (kolom `inclusivity_status`, `accommodations_available jsonb`, `verified_by`,
`verified_at`) sudah ada sejak migrasi 03 (PR-011), dan PR ini memang tugasnya memakainya.

Empat route `/admin/companies*` adalah endpoint `role("admin")` **pertama** di seluruh
repo — `/companies/:id` di dalamnya tetap publik dengan sengaja (US-09: kandidat menilai
perusahaan sebelum melamar, sering tanpa sesi).

Dua keputusan yang membentuk seluruh sisanya:

**1. "Verified" HANYA bisa dicapai lewat `POST .../verify`, tidak lewat `PUT`.**
`updateCompanySchema.inclusivityStatus` membatasi nilainya sendiri ke
`unverified`/`self_claimed` (`editableInclusivityStatusSchema`,
`packages/schemas/src/companies.ts`). Tanpa batas itu, `PUT` bisa menghasilkan status
publik "verified" tanpa audit `COMPANY_VERIFIED` maupun event `company.verified` — dan
endpoint verifikasi kehilangan alasan untuk ada. Koreksi **turun** (un-verify) tetap
dimungkinkan lewat `PUT` (AC eksplisit di dokumen phase).

**2. Nilai enum status di API TIDAK diseragamkan dengan `auditMetaSchemas[COMPANY_VERIFIED]`.**
Audit.ts (PR-014) sudah mengontrak `from: z.enum(["unverified","selfClaimed","verified"])`
— camelCase — sebelum modul ini pernah ada. `inclusivityStatusSchema` di `companies.ts`
tetap snake_case (`self_claimed`), sama persis dengan enum Prisma, supaya data yang
mengalir apa adanya dari kolom DB tidak butuh pemetaan tanpa alasan selain kosmetik.
Satu-satunya tempat kedua bentuk bertemu adalah `keStatusAudit()` di
`companies.service.ts`, dipakai HANYA saat menulis baris audit `COMPANY_VERIFIED`.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9 — `@nawasena/api` **109 berkas / 1586
lulus** (1 skip tak terkait, urutan boot `.env`), `@nawasena/schemas` **3 berkas / 84
lulus**. `pnpm --filter @nawasena/schemas check:openapi` sinkron.

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/companies.ts`** — diisi dari skeleton kosong (PR-004). `inclusivityStatusSchema`
  (cerminan enum Prisma) + `editableInclusivityStatusSchema` (subset yang boleh ditulis
  `PUT`, lihat keputusan #1), `companyPublicSchema`/`companyAdminSchema` (admin menambah
  `verifiedBy`+timestamp), `createCompanySchema`, `updateCompanySchema` (`.partial().strict()`),
  `companyIdParamsSchema`, tiga response envelope, dan event domain
  `companyVerifiedEventSchema`. Taksonomi akomodasi **diimpor** dari `profiles.ts`
  (`accommodationNeedSchema`) — satu daftar untuk kebutuhan pencari kerja dan fasilitas
  perusahaan, seperti sudah dicatat komentar di sana sejak PR-037.
* **`src/audit.ts`** — TIDAK diubah. `AUDIT_ACTION.COMPANY_VERIFIED` dan
  `ADMIN_RESOURCE_CHANGED` sudah dikontrak sejak PR-014; PR ini konsumen pertamanya.
* **`src/openapi.ts` + `openapi.json`** — lima endpoint didokumentasikan (`responsAdmin`
  helper baru: 401/403/503). Penjaga `openapi-parity.test.ts` diperluas ke modul baru.

**Core**

* **`core/events/index.ts`** — satu entri baru di `DomainEvents`: `company.verified`.
  Belum ada pelanggan — sama seperti `job.closed` saat lahir di PR-024b.
* **`core/http/errors.ts`** — kode baru `PERUSAHAAN_TIDAK_DITEMUKAN` (404).

**Modul (`apps/api/src/modules/companies/`, baru)**

* **`repositories/companies.repository.ts`** — TANPA penjaga kepemilikan (beda dari
  `career.repository.ts`): perusahaan dikurasi admin, bukan milik satu pengguna. `verify()`
  terpisah dari `update()` — satu-satunya jalur menulis `verifiedBy`+`verifiedAt`.
* **`services/companies.service.ts`** — `keStatusAudit()` (pemetaan status → meta audit,
  keputusan #2), `verify()` (audit `COMPANY_VERIFIED` + event, idempoten pada perusahaan
  yang sudah verified — re-verifikasi menggantikan `verifiedBy`/`verifiedAt`), `create()`/
  `update()` (audit `ADMIN_RESOURCE_CHANGED`).
* **`controllers/` + `routers/`** — `access.public(...)` untuk GET publik,
  `access.role("admin")` untuk keempat route admin, `validate({params, body})` di semua.
* **`index.ts`** — factory + re-export; dipasang di `boot.ts` sebagai modul terakhir.

**Test (3 berkas baru, 1 diperluas di `packages/schemas`)**

* `companies.test.ts` (11) — unit service dengan fake repository: audit `from`/`to`
  (termasuk pemetaan `self_claimed`→`selfClaimed`), sanitizer katalog audit, idempotensi
  re-verifikasi, event `company.verified`, 404 tanpa audit/event.
* `companies-http.test.ts` (19) — server Express nyata: matriks akses (401 tanpa token,
  403 seeker di seluruh route admin), CRUD admin, un-verify via `PUT`, penolakan
  `inclusivityStatus: "verified"` di `PUT`, taksonomi akomodasi liar/valid, deklarasi
  route (PR-019).
* `openapi-parity.test.ts` (+1 modul dirakit) — companies ikut diperiksa kesepadanannya.
* `schemas.test.ts` (+7) — `createCompanySchema`/`updateCompanySchema` valid & invalid,
  bentuk `companyVerifiedEventSchema`.

### Keputusan teknis

| Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|
| `verified` hanya lewat `POST .../verify` | `PUT` yang bisa menaikkan status akan membuat status publik lahir tanpa audit/event — endpoint verify jadi tidak perlu | Mengizinkan `inclusivityStatus: "verified"` di `PUT` — ditolak; menghapus satu-satunya jaminan bahwa "verified" selalu tercatat |
| Status API tetap snake_case, dipetakan HANYA saat audit | `auditMetaSchemas[COMPANY_VERIFIED]` (PR-014) sudah camelCase sebelum modul ada; menyeragamkan berarti mengubah kontrak audit yang sudah berlaku demi kosmetik | Mengubah `audit.ts` ke snake_case — ditolak; berisiko menyentuh kontrak bersama di luar scope PR-051 |
| `GET /admin/companies` tanpa pagination | Skala pilot MVP (puluhan perusahaan); `kursor.ts` (PR-047) sudah mencatat PR-058 sebagai konsumen cursor kedua — companies bukan salah satunya | Cursor pagination seragam di semua list admin — ditolak; kompleksitas tanpa kebutuhan nyata |
| `GET /companies/:id` tidak dibatasi status verifikasi | PR-054 (halaman publik) butuh perusahaan `unverified` tetap terlihat — transparansi status ITU SENDIRI adalah fitur (badge verified vs self-claimed) | Menyembunyikan perusahaan `unverified` dari publik — ditolak; bertentangan dengan tujuan Company Accessibility Profile |
| `verify()` idempoten pada perusahaan yang sudah verified | Re-verifikasi setelah koreksi data adalah alur admin yang sah; menolaknya dengan error hanya memaksa jalan memutar lewat `PUT` un-verify dulu | Menolak verify kedua dengan 409 — ditolak; tidak ada AC yang memintanya, dan menambah friksi kurasi |

### Risiko & batas yang diketahui

* **Tidak ada rubrik verifikasi tertulis.** Endpoint mencatat SIAPA dan KAPAN, bukan
  MENGAPA — risiko yang sudah dicatat di dokumen phase (celah PRD §17). Admin bisa
  menandai "verified" tanpa kriteria terdokumentasi di luar kode ini.
* **`GET /admin/companies` tanpa pagination** akan perlu direvisi bila jumlah perusahaan
  melampaui skala pilot (puluhan) — belum ada indikasi itu terjadi sebelum Phase 19.
* **Belum ada pelanggan `company.verified`.** Sama seperti `job.closed` di PR-024b: nilainya
  ada di momen penerbit pertama lahir, bukan di pesan yang dikirim hari ini.

### Next steps

* **PR-052** — Admin shell FE + `AdminTable` — konsumen pertama endpoint admin di sini.
* **PR-053** — UI kurasi perusahaan (form + verify flow), langsung memakai kontrak
  `companyAdminSchema`/`createCompanySchema`/`updateCompanySchema`.
* **PR-054** — Halaman publik perusahaan, konsumen `GET /companies/:id` +
  `GET /companies/:id/jobs` (endpoint baru, ditambahkan di PR-054 itu sendiri).
* **PR-055** — Jobs BE, memakai taksonomi akomodasi yang sama (`accommodationNeedSchema`).

---
