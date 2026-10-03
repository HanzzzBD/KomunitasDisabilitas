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

---

## PR-081 — Admin Dashboard FE

> **Phase:** [13 - Admin Dashboard & Analytics](../phase-13-admin-analytics.md#pr-081---admin-dashboard-fe)
> **Tanggal:** 2026-10-03
> **Status:** Selesai
> **Branch:** `pr-081-admin-dashboard` → `phase-13-admin-analytics`

### Ringkasan hasil

Ringkasan `/admin` kini dibuka dengan dasbor "Kesehatan pilot": pilihan periode (7 hari / 30 hari
/ sepanjang waktu), tile funnel lima tahap, tile penempatan kerja (dalam periode + sepanjang
waktu) dan DLQ, serta tabel pemakaian AI per fitur. Tiap tile menyebut label DAN periodenya,
angkanya, dan tren dalam kalimat ("Naik 3 dibanding 30 hari sebelumnya (12)"). Diperbarui
otomatis tiap 5 menit tanpa pengumuman dan tanpa memindah fokus.

### Keputusan owner (AskUserQuestion, 2026-10-02/03)

1. **Tren dari API** — respons `GET /admin/metrics` bertambah `previous` (jendela sebelumnya yang
   sama panjang); `null` untuk `semua`. Perubahan aditif di PR ini (dokumen: "Backend: tidak ada").
2. **Lokasi: Ringkasan `/admin`**, di atas kartu tautan yang sudah ada.
3. **Refresh tiap 5 menit, diam** (ikut umur cache server; berhenti saat tab tak terlihat) +
   tombol "Perbarui sekarang".
4. **NVDA dijalankan sekarang.**

### Scope selesai

**API (aditif)** — `adminMetricsPreviousSchema`; service menghitung jendela sebelumnya
(`jendelaSebelumnya`) — kohort yang daftar di jendela itu dengan tahap yang dicapai sampai
sekarang, plus konfirmasi diterima di jendela itu. Kunci cache `v1 → v2` (bentuk berubah).
Test DB: pendaftar Des 2000 → `previous {registered:1, applied:1}`.

**`@nawasena/api-client`** — `getAdminMetrics(client, periode)`, `adminKeys.metrics(periode)`.

**Web**

* `features/admin/metrik-tren.ts` — fungsi murni `hitungTren`/`kalimatTren`: arah, selisih, DAN
  nilai pembanding disebut; `semua` tanpa tren.
* `features/admin/metrik-dasbor.tsx` — radio grup periode; tile = `<dt>` (label + periode) /
  `<dd>` (angka + tren; panah `aria-hidden`); tabel AI ber-`caption`, `th scope=col/row`; tidak
  ada live region di atas angka (dua belas angka dibacakan tiap 5 menit = gangguan); "Data per
  … WIB" dari `generatedAt`.
* `routes/admin.tsx` — `AdminRingkasan` memasang dasbor di atas kartu tautan.
* Katalog `admin.metrik.*` (±50 entri id + id-simple).
* Pemalsu e2e `metrikAdminUji` (naik/turun/sama sekaligus) → registry "admin — ringkasan" kini
  memeriksa dasbor dengan axe.

### Acceptance Criteria

| AC | Bukti |
|---|---|
| Semua metrik terbaca SR dengan konteks (label+nilai+periode) | jsdom `<dt>` "Pendaftar baru, 30 hari terakhir" / `<dd>`; NVDA membacakan label → "15. Naik 3 …" |
| Tren naik/turun tekstual | unit `metrik-tren.test.ts` (naik/turun/sama, ribuan id-ID, `semua` tanpa tren); panah `aria-hidden` |
| Auto-refresh tidak mencuri fokus | jsdom: refetch → fokus tetap, wilayah status kosong; e2e: jam palsu maju 5 menit → permintaan baru, radio tetap terfokus |
| axe pass | `admin-metrik.spec.ts` (30d, 7d) + registry; suite a11y 141/141 |
| Angka cocok fixture E2E | e2e: 15 / naik 3 (12) / turun 2 (8) / total 4 / 1.250 permintaan AI |

### Verifikasi

* jsdom `admin-metrik.test.tsx` 4/4, unit `metrik-tren.test.ts`; api-client `admin.test.ts`; API
  `admin-metrics(-db)` 20/20 (DB hidup).
* Playwright sesudah `build`: `admin-metrik.spec.ts` 2/2, suite penuh **141/141**.
* `cek:budget`: 108,6 KB (tidak berubah — dasbor di chunk admin).
* `turbo run lint typecheck test --concurrency=1`: **27/27**.
* NVDA: 3 run sah — [checklist](pr-081-nvda-checklist.md). **Cacat nyata ditemukan & diperbaiki:**
  angka dan tren terbaca menempel ("15Naik 3…") → pemisah `sr-only`, dijaga test.

### Risiko & catatan

* "Perbarui sekarang" dalam 5 menit sejak hitungan terakhir mengembalikan angka yang sama (cache
  server) — "Data per … WIB" menunjukkan umur angkanya dengan jujur.
* Manual Verification "data staging" belum — staging belum ada (Phase 16).

### Next steps

1. PR-082 — analytics Umami privacy-first + funnel KPI.
