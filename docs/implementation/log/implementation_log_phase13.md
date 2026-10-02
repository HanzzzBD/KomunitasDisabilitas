# Implementation Log — Phase 13 (Admin Dashboard & Analytics)

> Catatan per PR yang selesai di Phase 13. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-080 — Admin Metrics BE

> **Phase:** [13 - Admin Dashboard & Analytics](../phase-13-admin-analytics.md#pr-080---admin-metrics-be)
> **Tanggal:** 2026-10-02
> **Status:** Selesai
> **Branch:** `pr-080-admin-metrics` → `phase-13-admin-analytics` (branch phase dibuat dari `main` sesudah `phase-12 → main`, PR #189)

### Ringkasan hasil

`GET /api/v1/admin/metrics?periode=7d|30d|semua` (role `admin`): funnel kohort per pengguna
(daftar → profil siap → melamar → wawancara → diterima), North Star (`hired_confirmed_at`),
pemakaian AI per fitur, dan total DLQ. Seluruhnya agregat; tidak ada kolom terenkripsi yang
dibaca. Cache 5 menit per periode di Redis cache.

### Keputusan owner (AskUserQuestion, 2026-10-02)

1. **Funnel per pengguna** — tiap tahap = jumlah pencari kerja kohort yang PERNAH mencapainya.
2. **"Profil" = siap dicocokkan** — baris `seeker_profiles` + `profile_embedding` terisi (syarat
   feed rekomendasi).
3. **Periode `7d | 30d | semua`**, bawaan 30d; kohort = pengguna yang DAFTAR dalam periode.
4. **Tanpa tabel counter harian** — agregasi SQL + cache 5 menit; dicatat utang **U-32**
   berpemicu (query dingin > 300 ms atau > 20.000 seeker).

### Scope selesai

**Kontrak (`packages/schemas/src/admin.ts`, skeleton PR-004 diisi)** — `adminMetricsQuerySchema`,
`adminFunnelSchema`, `adminNorthStarSchema`, `adminAiUsage(Feature)Schema`, `adminMetricsSchema`
+ response; OpenAPI `GET /admin/metrics` (tag `admin`).

**API — modul resmi baru `modules/admin`** (SDD §5.1 "internal ops, analytics"):

* `repositories/metrics.repository.ts` — tiga query SQL read-only ber-jendela eksplisit
  `[dari, sampai)`: funnel (CTE kohort; "wawancara" = status sekarang ATAU riwayat mencapai
  interview/offered/hired, karena admin boleh melompat status dan lamaran yang ditolak sesudah
  wawancara tetap pernah diwawancara), North Star (dalam periode + total), AI per fitur.
  Lintas tabel dengan sengaja — preseden `matching/repositories/embeddings.repository.ts`.
* `services/metrics.service.ts` — periode → jendela; jendela AI dipotong ke retensi `ai_usage`
  (90 hari) dan dilaporkan jujur sebagai `aiUsage.since`; cache respons utuh (termasuk
  `generatedAt`) 300 detik; **fail-open** bila Redis sakit; `dlqTotal: null` bila antrean tidak
  terjangkau (bukan 500).
* Controller + router (`access.role("admin")`, `validate({ query })`).
* `boot.ts` — DLQ dibaca lewat `createQueuesService` modul `internal` (sumber yang sama dengan
  `/internal/queues`).
* Operasi admin atas entitas domain TETAP di modul domainnya (preseden PR-051/PR-077a); modul
  `admin` hanya membaca agregat.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Funnel cocok fixture deterministik | `admin-metrics-db.test.ts`: fixture bertanggal Jan 2001 + jam modul dipatok 2001-02-01 → jendela 30d hanya berisi fixture; `{5,1,3,2,1}` persis; soft-delete, admin, dan pendaftar di luar jendela tidak terhitung |
| Query tidak menyentuh kolom terenkripsi | `admin-metrics.test.ts` membaca kolom `Bytes`/CIPHERTEXT LANGSUNG dari `schema.prisma` (tidak lulus hampa: menemukan `disability_types`, `accommodation_needs`, `disclosure_snapshot`) lalu memastikan ketiga SQL tidak memuatnya — juga tanpa `phone`/`email`/`full_name` |
| Cache 5 menit (hit kedua tanpa query berat) | unit: repository dipanggil sekali untuk dua permintaan, TTL 300; DB: baris baru tidak terlihat sampai cache dikosongkan, `generatedAt` sama |
| North Star = count `hired_confirmed_at` | `confirmedInPeriod` 2 (kohort E + pendaftar lama H yang konfirmasinya jatuh di jendela) |
| Respons < 500 ms (cache hangat) | DB test mengukur permintaan kedua < 500 ms |

### Verifikasi

* Unit `admin-metrics.test.ts` 11/11; integrasi `admin-metrics-db.test.ts` 4/4 di PostgreSQL dev
  (5433, migrasi mutakhir) — dijalankan, bukan terlewat; fixture terbersihkan (0 baris tersisa).
* Manual count: periode `semua` di DB dev = hitungan psql langsung (daftar 5, melamar 4, North
  Star 1).
* `turbo run lint typecheck test --concurrency=1`: **27/27** dengan Docker hidup (API 2114 lulus). `openapi-parity` sempat merah — perakitan test belum memuat modul `admin`; penjaganya bekerja, perakitannya diperbarui. `check:openapi` sinkron.

### Risiko & catatan

* Tahap funnel tidak dijamin menurun ("profil siap" dan "melamar" diukur independen) — dicatat di
  kontrak; layar PR-081 perlu menampilkannya sebagai angka per tahap, bukan corong yang menyiratkan
  subset.
* `confirmedTotal` sepanjang waktu tidak di-cache terpisah — ikut cache periode.

### Next steps

1. PR-081 — dashboard admin (tiles aksesibel: angka + label + tren tekstual) mengonsumsi endpoint ini.
