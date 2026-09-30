# Implementation Log — Phase 11 (Matching Engine)

> Catatan per PR yang selesai di Phase 11. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-069 — Embedding Pipeline (ai:embed)

> **Phase:** [11 - Matching Engine](../phase-11-matching-engine.md#pr-069---embedding-pipeline-aiembed)
> **Tanggal:** 2026-09-30
> **Status:** Selesai
> **Branch:** `pr-069-embedding-pipeline` → `phase-11-matching-engine`

### Ringkasan hasil

Modul `matching` lahir dengan satu pekerjaan: menjaga vektor profil dan lowongan tetap segar.
Pelanggan event di proses API (`profile.updated`, `job.published`, dan `job.updated` yang baru)
HANYA meng-enqueue job `ai-embed`; processor worker membaca ulang keadaan terkini lewat jalur
aman, menyusun teks tanpa data sensitif, memanggil `AiClient.embed` (kuota → Gemini → jejak
biaya), lalu menulis vektor dan membuang `match_scores` terkait dalam satu transaksi.

Utang **U-27** (syarat masuk PR ini) lunas: model embedding kini `gemini-embedding-001` diminta
768 dimensi.

Gate hijau: `lint` dan `typecheck` (schemas, api, worker) bersih; `turbo run test
--concurrency=1` **9/9 task** — `@nawasena/api` **130 berkas / 1902 lulus, 2 skip** (MinIO
tidak dinyalakan; urutan boot `.env`), dengan **PostgreSQL + Redis hidup** sehingga seluruh
`*-db.test.ts` benar-benar berjalan. Workspace lain semuanya lulus.

### Keputusan owner (AskUserQuestion, 2026-09-30)

1. **Model: `gemini-embedding-001`** (U-27) — GA, 768 adalah dimensi MRL yang direkomendasikan.
2. **Atribusi kuota embed lowongan: kurator pembuat (`createdBy`).** `ai_usage.user_id` NOT NULL
   dan kuota `embed` per pengguna; tanpa migrasi. Lowongan tanpa `createdBy` dilewati + log
   `error`. Risiko yang diterima: kurator yang menerbitkan >50 lowongan/hari kena kuota — tuasnya
   `AI_QUOTA_EMBED_PER_DAY`.
3. **"Batch" = coalescing per entitas**, bukan `batchEmbedContents`. Kontrak `core/ai` tidak
   berubah; 50 event beruntun = satu job = satu panggilan embed.
4. **`job.updated` ditambahkan** — tanpa event ini vektor lowongan membeku pada isi saat publish.
5. **Backfill data lama → PR-069b terpisah** (lihat "Utang baru").

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`queue.ts`** — `aiEmbedJobSchema`: union `profil{userId}` | `lowongan{jobId}`, `.strict()`,
  hanya referensi (worker membaca ulang; syarat coalescing).
* **`jobs.ts`** — `jobUpdatedEventSchema` (`jobId`, `companyId`, `updatedAt`), bentuk sama dengan
  `job.published`.

**Core**

* **`core/ai/providers/gemini.ts`** — `embedContent` mengirim `outputDimensionality: 768` dan
  `taskType: SEMANTIC_SIMILARITY`; hasil dinormalisasi L2 (`normalisasiL2`, diekspor); vektor nol
  / tak hingga = `AI_INVALID_OUTPUT`.
* **`core/config/env.ts`** — default `GEMINI_EMBED_MODEL` = `gemini-embedding-001`.
* **`core/queue`** — `EnqueueOptions.coalesceId` → deduplikasi BullMQ `{ id, keepLastIfActive }`.
  Sengaja BUKAN `jobId`: `jobId` menolak penambahan selama job lama masih tersimpan di retensi
  `removeOnComplete`, sehingga suntingan kedua akan diam-diam diabaikan.
* **`core/events`** — `job.updated` di `DomainEvents`; komentar `profile.updated`/`job.published`
  diperbarui (pelanggannya kini ada).

**Modul `jobs`**

* `update()` menerbitkan `job.updated` HANYA bila lowongan `published`.
* `bacaUntukEmbedding(id)` — judul/deskripsi/persyaratan + `createdBy`; `null` untuk draft,
  closed, atau lewat tenggat (tidak akan dicocokkan, jangan bakar kuota).

**Modul `matching` (baru)**

* `services/teks-embedding.ts` — penyusun teks murni. Profil: judul, keahlian, ringkasan,
  pengalaman, pendidikan. Lowongan: posisi, persyaratan, deskripsi. Batas 8.000 karakter.
  **Tidak ikut dengan sengaja:** data disabilitas (tentu), dan juga lokasi, mode kerja,
  kesediaan remote, jenis kontrak, akomodasi — semuanya dinilai terstruktur di PR-070/071;
  menanamnya ke vektor berarti menghitungnya dua kali.
* `repositories/embeddings.repository.ts` — satu-satunya penulis kolom `vector(768)`; raw SQL
  ber-parameter, vektor + `DELETE match_scores` dalam satu `$transaction`. Memvalidasi panjang
  768 & keterhinggaan sendiri (`DIMENSI_KOLOM_VEKTOR`; kesamaannya dengan `AI_EMBED_DIMENSIONS`
  dijaga test — repository tidak boleh mengimpor `core/ai`).
* `services/embedding.service.ts` — urutan: buang skor → baca ulang → embed → simpan+buang skor.
  Gagal AI = lempar (retry BullMQ); vektor lama tidak disentuh. Teks kosong = vektor dikosongkan
  tanpa AI.
* `services/pemicu-embedding.ts` — tiga langganan event → `enqueue(ai-embed, …, { delayMs: 5000,
  coalesceId })`.
* `index.ts` — `createMatchingModule({ events, queues })` + ekspor untuk worker.

**Composition root**

* `apps/api/src/boot.ts` — `createMatchingModule` dirakit setelah modul profiles.
* `apps/worker/src/index.ts` — pembaca profil (`findSafeByUserId` + `listFor` keahlian/
  pengalaman/pendidikan) dan lowongan (`jobsService.bacaUntukEmbedding`) disuntik sebagai port;
  processor `ai-embed` terdaftar.
* `apps/worker/src/processors/ai-embed.ts` — adapter tipis; log memuat `jenis`, `status`, dan
  `jobId` lowongan, **tanpa `userId`**.
* `apps/api/package.json` — ekspor `./modules/profiles` & `./modules/matching`.

### Bukti AC

| AC | Bukti |
|---|---|
| `job.published` → `job_embedding` terisi | `matching-embedding-db.test.ts`: publish lewat `jobsService` nyata → BullMQ nyata → vektor di PostgreSQL; embed atas nama kurator |
| `profile.updated` → vektor + `match_scores` terhapus | test DB: tambah keahlian lewat service nyata; baris `match_scores` hilang; jarak kosinus vektor tersimpan vs vektor teksnya < 1e-6 |
| Teks embed bebas data sensitif | unit: objek "kotor" berisi `disabilityTypes`/`accommodationNeeds`/akomodasi/kota — tidak satu pun sampai ke teks; sumber profil `findSafeByUserId` |
| Gemini down → retry, tanpa fallback keliru | unit: `AI_PROVIDER_UNAVAILABLE`/`AI_RATE_LIMIT` dilempar, vektor tidak ditulis; queue `ai-embed` 4× backoff eksponensial 10 dtk; `ai-router.test.ts` (sudah ada) — `embed` tak pernah beralih provider |
| Batch saat 50 event beruntun | test Redis nyata: 50 `profile.updated` → 1 job tertunda → 1 panggilan embed |

Plus satu jaminan yang tidak diminta AC tetapi menjadi alasan memilih `keepLastIfActive`: event
yang tiba saat job SEDANG berjalan melahirkan tepat satu job susulan. **Diverifikasi mutasi:**
menghapus `keepLastIfActive` membuat test itu merah (job kedua tidak pernah lahir).

### Verifikasi manual (lingkungan nyata, 2026-09-30)

* **Adapter + Gemini nyata:** `gemini-embedding-001` → 768 dimensi, panjang 1,000000, ±1,4 dtk
  untuk tiga panggilan. Kewarasan semantik: profil "admin gudang, Excel, inventaris" berkosinus
  **0,94** dengan lowongan admin gudang dan **0,77** dengan lowongan koki.
* **Proses worker sungguhan** (`tsx src/index.ts`, `.env` dev, model di-override env): job
  `ai-embed` profil → `status: tersimpan`, `vector_dims = 768`, baris `ai_usage` `embed/gemini`
  lahir lewat `ai-usage-record`. Log worker diperiksa: **0 kemunculan userId**.
* Belum ada staging (Phase 16), jadi butir "staging embed nyata" dibuktikan di lokal.

### Risiko & catatan

* **`.env` lokal yang menyebut `GEMINI_EMBED_MODEL=text-embedding-004` menimpa default baru** —
  embedding akan 404. Hapus barisnya (juga ditulis di `.env.example`).
* **Jendela `emit`→`enqueue` (U-02).** Proses API yang mati di antara keduanya = vektor basi
  sampai suntingan berikutnya. Handler sengaja hanya satu panggilan Redis untuk mempersempitnya.
* **Kuota habis / Gemini tumbang 4×** → job ke DLQ, skor sudah dibuang (feed dihitung ulang dari
  vektor lama), vektor lama dipertahankan. Pemulihan massal = U-29.
* **Kuota kurator.** Default `embed` 50/hari per pengguna; kurator yang menerbitkan banyak
  lowongan sehari perlu `AI_QUOTA_EMBED_PER_DAY` dinaikkan.
* Invalidasi `match_scores` saat lowongan BARU tayang tidak dilakukan untuk semua pengguna
  (akan membuang seluruh cache tiap publish); kebijakan penyegaran feed milik PR-072.
* PR ini ±670 baris non-test, di atas pedoman <500 LOC — mayoritas komentar alasan (gaya repo);
  backfill sengaja dipisah ke PR-069b agar tidak bertambah.

### Utang baru

* **U-29** — vektor untuk data yang lahir sebelum pipeline (17 lowongan seed tayang + 5 profil
  di dev = 0 vektor; lowongan seed tanpa `createdBy`). Pemilik **PR-069b**, syarat masuk PR-070.
  Ditempel juga sebagai "Gate masuk" di dokumen phase (PR-070 → Dependencies).

### Next steps

1. **PR-069b** — alat re-embed massal (menghormati pagu global) + `createdBy` lowongan seed.
2. **PR-070** — query kandidat pgvector; baru boleh dimulai setelah U-29 lunas.

---

## PR-069b — Re-embed massal + kurator lowongan seed (utang U-29)

> **Phase:** [11 - Matching Engine](../phase-11-matching-engine.md#pr-070---candidate-query-pgvector--hard-filter-sql) (gate masuk PR-070)
> **Tanggal:** 2026-09-30
> **Status:** Selesai
> **Branch:** `pr-069b-reembed-massal` → `phase-11-matching-engine`

### Ringkasan hasil

Pipeline PR-069 hanya bereaksi pada event baru, sehingga semua yang lahir sebelumnya — 17
lowongan seed tayang dan profil lama — tidak pernah punya vektor, dan lowongan seed tanpa
`createdBy` bahkan tidak bisa di-embed. PR ini menambah alat operator yang mengisi celah itu
lewat pipeline yang SAMA (tidak ada jalur embedding kedua), dan membuat seed menulis kurator.

Gate hijau: `lint` + `typecheck` (api, worker) bersih; `turbo run test --concurrency=1` **9/9
task** — `@nawasena/api` **132 berkas / 1920 lulus, 2 skip** (MinIO; urutan boot `.env`) dengan
PostgreSQL + Redis hidup; workspace lain semuanya lulus.

### Keputusan owner (AskUserQuestion, 2026-09-30)

1. **Bentuk: skrip CLI** (`embed:ulang`) — tanpa endpoint baru (tanpa permukaan serangan dan
   kontrak OpenAPI tambahan), tanpa cron.
2. **Batas per jalan: 25% pagu global AI** (bawaan 300 dari 1.200), bisa ditimpa `--maks`.
   Pagu itu dibagi dengan chat CV; backfill tidak boleh menghabiskannya dalam sekali jalan.
3. **Atribusi: seed diisi admin seed saja.** Aturan runtime tetap: lowongan tanpa kurator
   dilewati; alat menghitung dan memperingatkannya ke operator.

### Scope selesai

* **`modules/matching/repositories/embeddings.repository.ts`** — tiga kueri raw SQL ber-parameter:
  * `cariProfilTanpaVektor(batas)` — hanya profil BERISI (judul/ringkasan tidak kosong, atau ada
    keahlian/pengalaman/pendidikan) dan akun **tidak ber-soft-delete** (raw SQL tidak melewati
    penjaga PR-021 — diverifikasi mutasi: menghapus filter itu membuat test merah). Profil
    kosong tidak ikut karena vektornya memang NULL dengan benar; menyertakannya membuat mereka
    memakan jatah `maks` setiap jalan.
  * `cariLowonganTanpaVektor(batas)` — published, belum lewat tenggat, **berkurator**.
  * `hitungLowonganTanpaKurator()` — untuk peringatan operator, tidak memakan jatah `maks`.
* **`services/embed-ulang.service.ts`** — lowongan DULU (satu vektor melayani semua pencari
  kerja), profil dari sisa batas; enqueue berurutan dengan jarak `jarakMs` (bawaan 1 dtk ≈ 60/menit,
  di bawah batas per-menit tier gratis); mode `kering` hanya melapor.
* **`services/pemicu-embedding.ts`** — `antrekanEmbedding()` diekstrak: pemicu event dan alat
  massal WAJIB berbagi kunci coalescing, supaya job massal yang bertemu suntingan pengguna
  diringkas menjadi satu panggilan.
* **`services/embedding.service.ts`** — tipe `repo` dipersempit ke empat metode yang dipakainya.
* **`scripts/embed-ulang.ts` + `scripts/embed-ulang-argumen.ts`** — CLI; konfigurasi lewat
  gerbang yang sama dengan api/worker (`loadEnv`, `loadQueueConfigs`, `loadAiQuotaConfig`), jadi
  jalan apa adanya di kontainer. Argumen tak dikenal / angka tak sah → keluar 1 + bantuan, bukan
  diam-diam memakai bawaan.
* **`package.json`** — skrip `embed:ulang`.
* **`prisma/seed-data.ts`** — `createdBy = admin seed` untuk 20 lowongan.

### Verifikasi

* Unit (`matching-embed-ulang.test.ts`): pembagian batas, jarak, kunci coalescing sama dengan
  pemicu, mode kering, `--jenis`, `maks 0`, parser argumen.
* DB (`matching-embed-ulang-db.test.ts`): keanggotaan hasil kueri — profil kosong, akun terhapus,
  lowongan draft/lewat tenggat/tanpa kurator/bervektor TIDAK ikut.
* `db-seed.test.ts`: setiap lowongan seed berkurator admin seed.
* **Manual NYATA (DB dev, Gemini nyata, proses worker sungguhan):** `--kering` → 17 lowongan + 4
  profil; jalan sungguhan → **17/17 lowongan tayang & 5/5 profil bervektor**, 21 baris
  `ai_usage` embed; jalan ulang → 0 (idempoten). Argumen salah (`--maks=x`) ditolak.

### Risiko & catatan

* **`.env` lokal owner kini berisi `GEMINI_EMBED_MODEL=` (kosong)** — skema env menolaknya
  ("tidak boleh kosong bila diisi"), jadi api/worker/skrip lokal gagal boot. Hapus BARIS-nya,
  bukan hanya nilainya. Verifikasi di atas memakai override env var.
* Alat hanya mengisi vektor yang KOSONG. Vektor basi (model berganti) harus dikosongkan dulu —
  ditulis di U-29.
* Alat tidak menunggu worker; ia hanya meng-enqueue. Tanpa worker menyala, job menunggu di Redis.

### Next steps

1. **PR-070** — query kandidat pgvector. Gate U-29 sudah lunas; setelah `db:seed`, jalankan
   `embed:ulang` agar data dev punya vektor.

---

## PR-070 — Candidate Query (pgvector + Hard Filter SQL)

> **Phase:** [11 - Matching Engine](../phase-11-matching-engine.md#pr-070---candidate-query-pgvector--hard-filter-sql)
> **Tanggal:** 2026-09-30
> **Status:** Selesai
> **Branch:** `pr-070-candidate-query` → `phase-11-matching-engine`

### Ringkasan hasil

Langkah 1–2 SDD §7.2: top-50 lowongan aktif terdekat (kosinus pgvector) yang lolos hard filter
mode kerja/lokasi, seluruhnya di SQL ber-parameter di repo matching. Belum ada endpoint — service
`createKandidatService` dirakit bersama `GET /me/matches` di PR-073.

Gate hijau: `lint` + `typecheck` (api, worker) bersih; `turbo run test --concurrency=1` **9/9
task** — `@nawasena/api` **134 berkas / 1937 lulus, 2 skip** (MinIO; urutan boot `.env`) dengan
PostgreSQL + Redis hidup (p95 kandidat di dalam suite penuh: 54,8 ms).

### Keputusan owner (AskUserQuestion, 2026-09-30)

1. **Semantik filter = SDD §7.2 harfiah.** Lolos = `remote` ATAU provinsi sama (onsite/hybrid);
   pengguna tanpa provinsi → tanpa filter lokasi. Profil belum punya preferensi "remote-only";
   `openToRemote` (bawaan `false`, jarang dicentang) SENGAJA tidak menyaring — ia komponen
   `location_fit` PR-071. SQL menerima daftar mode kerja sebagai parameter, jadi preferensi
   eksplisit kelak cukup mengubah `susunFilterKandidat`.
2. **Lowongan onsite/hybrid tanpa provinsi LOLOS** + seed diberi lokasi.
3. **HNSW: planner bebas + bukti terkendali** (lihat "Temuan planner").

### Scope selesai

* **`repositories/kandidat.repository.ts`** — `cariKandidat(userId, filter, {batas, efSearch})`
  dalam satu transaksi: cek vektor profil (akun hidup) → `set_config` LOCAL `hnsw.ef_search` +
  `hnsw.iterative_scan = relaxed_order` → CTE `MATERIALIZED` top-N lalu urut ulang (pola anjuran
  pgvector untuk `relaxed_order`). Mengembalikan `jobId`, `kemiripan`, mode kerja, kota/provinsi,
  akomodasi, `publishedAt` (bahan skor PR-071). `null` = pengguna tanpa vektor.
  * `sqlKandidat()` — SATU sumber SQL untuk repo DAN test EXPLAIN.
  * `vektorProfil()` — vektor profil sebagai SUBQUERY, bukan literal dari aplikasi.
  * `kondisiKandidat()` — mode kerja divalidasi ulang dengan `workModeSchema` lalu di-cast enum
    sebagai parameter; provinsi dibandingkan `lower(btrim(...))` ber-parameter.
* **`services/kandidat.service.ts`** — `susunFilterKandidat(profil)` (murni) + service dengan port
  `bacaProfil` (jalur aman, dirakit PR-073).
* **`core/config/env.ts`** — `MATCHING_HNSW_EF_SEARCH` (bawaan 100, **minimal 50**: HNSW
  mengembalikan paling banyak `ef_search` baris, dan bawaan pgvector 40 diam-diam memotong top-50).
  Mitigasi risiko "recall vs speed" dokumen phase.
* **Seed** — kota/provinsi untuk lowongan onsite/hybrid (DKI, Jabar, DIY, Jatim); **j17** (onsite,
  tayang) sengaja tanpa lokasi agar kasus "tanpa provinsi tetap lolos" terlihat di data dev.

### Temuan planner (bukti AC EXPLAIN)

* Vektor profil sebagai **literal** → planner memilih Seq Scan + Sort pada ±1.000 baris. Sebagai
  **subquery** → biayanya ditaksir berbeda; di eksperimen psql 1k baris HNSW dipakai (2 ms).
* Di test (1.059 lowongan, 315 baris lolos filter) planner tetap memilih Seq Scan + Sort — eksak
  dan murah (p95 ±12 ms). Di **10.000 baris** (eksperimen psql, transaksi di-ROLLBACK) planner
  memilih `Index Scan using jobs_embedding_hnsw` sendiri: 9,5 ms hangat (139 ms pada eksekusi
  dingin pertama).
* Test `EXPLAIN` memakai `enable_sort=off` di transaksinya SAJA: satu-satunya jalan lain untuk
  urutan jarak adalah HNSW, jadi yang dibuktikan adalah "indeks dapat dipakai query ini". Mematikan
  seq scan saja tidak cukup — planner beralih ke indeks `jobs_status_published_at` + Sort.
  **Diverifikasi mutasi:** mengganti `<=>` dengan `<->` di repo membuat test merah.

### Bukti AC

| AC | Bukti |
|---|---|
| EXPLAIN memakai HNSW | test EXPLAIN atas `sqlKandidat` (lihat di atas) + eksperimen 10k |
| Hanya published & belum expired | test DB: draft, closed, lewat tenggat — semuanya sangat dekat, tidak ada yang lolos |
| Filter mode kerja/lokasi | test DB: remote provinsi lain, onsite provinsi sama, hybrid "  jawa BARAT " (beda huruf/spasi), onsite tanpa provinsi LOLOS; onsite Jatim & hybrid Bali tersaring; filter hanya-remote ber-parameter |
| Top-50 penuh walau tersaring | 200 penghalang paling dekat di provinsi lain → hasil tetap 50 (iterative scan), terurut kemiripan |
| p95 < 100 ms / 1.000 jobs | 1.059 lowongan, 40 panggilan service sesudah pemanasan: p95 **12–64 ms** di beberapa jalan lokal |
| Injeksi gagal | `x' OR '1'='1`, `Jawa Barat') OR TRUE --`, `'; DROP TABLE jobs; --` → filter tidak melonggar, jumlah baris tabel utuh; mode kerja di luar enum ditolak sebelum SQL |

### Verifikasi manual (data dev, vektor Gemini nyata dari PR-069b)

Setiap persona mendapat 11 kandidat: 8 remote + onsite/hybrid di provinsinya + j17 (onsite tanpa
provinsi). Lowongan Jawa Timur tidak pernah muncul bagi persona mana pun. Kemiripan teratas
0,81–0,87.

### Risiko & catatan

* **Test p95 bergantung pada mesin.** Lulus dengan jarak lebar hari ini; bila CI kelak lambat,
  penyebabnya lingkungan, bukan query — jangan "perbaiki" dengan menaikkan ambang tanpa mengukur.
* `relaxed_order` + CTE `MATERIALIZED`: urutan final benar, tetapi pemilihan top-50 pada katalog
  besar adalah APROKSIMASI (sifat HNSW). `MATCHING_HNSW_EF_SEARCH` adalah tuasnya.
* Hari ini tidak ada preferensi mode kerja eksplisit; bila produk memintanya, ia dimulai di profil
  (migrasi + form), lalu `susunFilterKandidat`.

### Next steps

1. **PR-071** — skor berbobot + hard filter akomodasi in-memory atas kandidat ini.
