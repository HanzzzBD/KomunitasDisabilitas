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

---

## PR-071 — Scoring Service + Accommodation Fit In-Memory

> **Phase:** [11 - Matching Engine](../phase-11-matching-engine.md#pr-071---scoring-service--accommodation-fit-in-memory)
> **Tanggal:** 2026-09-30
> **Status:** Selesai
> **Branch:** `pr-071-scoring-service` → `phase-11-matching-engine`

### Ringkasan hasil

Langkah 2 (hard filter akomodasi) dan 3 (skor berbobot) SDD §7.2 atas kandidat PR-070:
`skor = w₁·kemiripan + w₂·akomodasi + w₃·lokasi + w₄·kebaruan`, bobot dari env. Kebutuhan
akomodasi dibaca terdekripsi lewat jalur ber-audit tujuan `matching` dan hanya dipakai sebagai hard
filter. Belum ada endpoint — dirakit bersama `GET /me/matches` di PR-073.

Gate hijau: `lint` + `typecheck` bersih; `turbo run test --concurrency=1` **9/9 task** —
`@nawasena/api` **136 berkas / 1959 lulus, 2 skip** (MinIO; urutan boot `.env`) dengan
PostgreSQL + Redis hidup.

### Keputusan owner (AskUserQuestion, 2026-09-30)

SDD hanya menetapkan bobot; nilai komponennya diputuskan owner:

1. **accommodation_fit = keluasan akomodasi lowongan** (jumlah unik ÷ 6 taksonomi), sama untuk
   semua pengguna. Kebutuhan pribadi hanya menjadi hard filter — "terpenuhi" tidak lagi membedakan
   lowongan yang sudah lolos filter. Karena rumusnya tidak menyentuh data pengguna, pengguna tanpa
   data otomatis netral (AC), dan skornya **identik** dengan pengguna berkebutuhan (diuji property).
2. **location_fit = tabel `NILAI_LOKASI`**: remote 1 (openToRemote) / 0,8; kota sama 1; provinsi
   sama beda kota 0,7; lowongan tanpa provinsi 0,3; pengguna tanpa provinsi 0,5; provinsi lain 0.
3. **recency = 0,5^(umur/14 hari)**, waktu paruh lewat env; tanggal kosong 0,5; masa depan = 1.
4. **fast-check** sebagai devDependency (`4.10.2`, dipin).

### Scope selesai

* **`services/skor.ts`** — fungsi MURNI: `komponenKemiripan/Akomodasi/Lokasi/Kebaruan`,
  `memenuhiAkomodasi` (kebutuhan ⊆ akomodasi lowongan), `hitungSkor`, `nilaiKandidat` (filter →
  skor → urut skor menurun, pemecah seri `jobId`). "Sekarang" adalah argumen. Skor & komponen
  dibulatkan 4 desimal (presisi `match_scores.score` DECIMAL(5,4)) dan dijepit ke [0, 1].
* **`services/penilaian.service.ts`** —
  * `createPembacaAkomodasi`: `sensitiveAccess.bacaSensitif(actor, actor.userId, { purpose:
    "matching", reason: ALASAN_AKSES_MATCHING })`; mengambil HANYA `accommodationNeeds.tags`.
    Tanpa profil / consent dicabut / tags kosong → `null` (tidak menyaring).
  * `createPenilaianService.nilai(actor, profilNonSensitif, kandidat)` — kandidat kosong → tidak
    membaca data sensitif sama sekali.
  * `bobotDariEnv(env)`.
  * Impor lintas modul lewat BERKAS service `profiles` (bukan index-nya) — aturan boundaries.
* **`core/config/env.ts`** — `MATCHING_WEIGHT_SIMILARITY/ACCOMMODATION/LOCATION/RECENCY` (bawaan
  SDD) + `MATCHING_RECENCY_HALF_LIFE_DAYS` (14). `envSchemaLengkap` menolak boot bila jumlah bobot
  ≠ 1 (toleransi 0,001) dan menyebut keempat variabelnya.
* **`docs/akses-data-sensitif.md`** — subbagian "Pemanggil `matching` pertama".

### Bukti AC

| AC | Bukti |
|---|---|
| Tanpa akomodasi wajib TIDAK PERNAH lolos | property test 1.000 kasus + kebalikannya (yang lengkap SELALU lolos); **mutasi** `every`→`some` → fast-check menemukan contoh balik minimal (1 lowongan, 2 kebutuhan) |
| Komponen teruji terpisah | satu `it` per komponen, termasuk tepi (NaN, di luar taksonomi, masa depan, tanpa tanggal, beda huruf/spasi) |
| Bobot via env tanpa deploy | `loadEnv` → `bobotDariEnv` → skor berubah; jumlah ≠ 1 → boot gagal |
| Tanpa data → netral | property: skor user tanpa data = skor user berkebutuhan untuk setiap lowongan yang lolos |
| Deterministik | property: input sama/urutan masukan dibalik → keluaran & urutan identik |
| (keamanan) | keluaran hanya `jobId`/`skor`/`komponen` angka; test DB: ciphertext benar-benar di `bytea`, keluaran tidak memuat `daksa`/catatan; audit agregat 1 baris `entityId: null` |

### Verifikasi manual (data dev, kunci `.env`, vektor Gemini nyata)

Rantai PR-070 → PR-071 untuk setiap profil: akun ber-consent dengan 2 kebutuhan akomodasi → **2
dari 11** kandidat lolos; persona tanpa consent → 11/11 (netral). Skor teratas 0,61–0,66.
Catatan: pada data seed komponen kebaruan hampir nol dan seragam (semua `published_at`
2026-07-01) dan keluasan akomodasi seragam 0,33 (setiap lowongan seed punya 2 akomodasi) — urutan
dev karenanya didominasi kemiripan + lokasi. Itu sifat data seed, bukan rumusnya.

### Risiko & catatan

* **Audit agregat per pengguna per hari**, bukan per job: pemanggilnya permintaan feed milik
  pengguna sendiri (dicatat di `akses-data-sensitif.md`).
* `bacaSensitif` ikut mendekripsi ragam disabilitas & catatan bebas lalu dibuang — biaya jalur
  baku; menambah pembaca "tags saja" berarti jalur baca sensitif keempat, yang sengaja dihindari.
* Bobot/tabel awal belum dievaluasi dengan data pilot (risiko dokumen phase) — semuanya konstanta
  bernama atau env.

### Next steps

1. **PR-072** — re-rank LLM top-20 + penjelasan + cache `match_scores` (skor di sini dibulatkan
   sesuai presisi kolomnya).

---

## PR-072 — Re-rank LLM + Cache match_scores

> **Phase:** [11 - Matching Engine](../phase-11-matching-engine.md#pr-072---re-rank-llm--cache-match_scores)
> **Tanggal:** 2026-09-30
> **Status:** Selesai
> **Branch:** `pr-072-rerank-cache` → `phase-11-matching-engine`

### Ringkasan hasil

Langkah 4 (re-rank LLM top-20, satu panggilan batch) dan 5 (cache `match_scores` 24 jam) SDD §7.2,
plus kebijakan refresh berkuota. Sisi API (`createFeedCacheService`) memutuskan cache vs hitung
ulang, memotong jatah `rerank`, lalu mengantre `ai-rerank-feed`; sisi worker
(`createRerankService`) memanggil prompt `rerank.v1` dan menulis `rank` + `explanation`. Belum ada
endpoint — `GET /me/matches` merakit `hitung()` (kandidat PR-070 → skor PR-071) di PR-073.

Gate hijau: `lint` + `typecheck` bersih; `turbo run test --concurrency=1` 27/27 task.

### Keputusan owner (AskUserQuestion, 2026-09-30)

1. **Re-rank ASINKRON via worker** (SDD §12.2, queue `ai-rerank-feed` yang sudah ada), bukan
   sinkron di API. Muat pertama menampilkan urutan skor deterministik; hasil LLM tampil pada muat
   berikutnya. `withDegradation` tetap dipakai — di pemesanan jatah (lihat U-06).
2. **Migrasi 19: kolom `match_scores.rank SMALLINT NULL`** (+ CHECK `rank >= 1`). Urutan LLM
   disimpan terpisah; `score` tetap skor deterministik yang jujur. Menyimpang dari "Database: tidak
   ada" di dokumen phase — aditif, `down.sql` tersedia.
3. **Setiap panggilan LLM memotong 1 jatah `rerank`** (bawaan 3/hari) — re-rank otomatis (cache
   kedaluwarsa/terinvalidasi) maupun refresh manual. Biaya LLM per pengguna terbatas pasti.
4. **Isi prompt = profil terstruktur saja**: headline, nama keahlian, judul posisi, lokasi,
   kesediaan remote. Ringkasan & deskripsi pengalaman (teks bebas) tidak dikirim.

### Scope selesai

* **`core/ai/prompts/rerank.v1.ts`** — terdaftar di registry. Setiap lowongan = satu blok data
  tak tepercaya (judul, mode kerja, lokasi, fasilitas, persyaratan & ringkasan dipotong 400
  karakter); `ref` angka 1..N berada DI LUAR blok. Model tidak pernah melihat UUID. Skema keluaran
  sengaja longgar (bentuk saja) supaya satu alasan cacat tidak membuang 19 lainnya. Lingkup cache
  prompt per pengguna (bawaan).
* **`modules/matching/services/rerank.ts`** (murni) — `susunMasukanRerank` (hanya field yang
  disebut namanya; keahlian unik), `rapikanPenjelasan` (≤ 160 karakter, tepat satu kalimat, tanpa
  baris baru, tanpa istilah kondisi seperti "tuli/netra/disabilitas" — konservatif: "ramah
  disabilitas" pun ditolak → template PR-073), `uraiHasilRerank` (whitelist ref; ganda/pecahan/di
  luar daftar dibuang; kandidat yang dilewatkan model menyusul menurut skor).
* **`repositories/match-scores.repository.ts`** — satu angkatan per pengguna: `gantiAngkatan`
  (hapus + tulis ulang atomik, `computed_at` seragam = id angkatan), `angkatanTerbaru`,
  `bacaFeed` (`rank` menaik NULL terakhir → `score` menurun → `job_id`), `topAngkatan`,
  `terapkanRerank` (hanya baris angkatan yang sama — hasil basi tidak menulis apa pun).
* **`services/feed-cache.service.ts`** — `segarkan(actor, { paksa })`:
  cache < 24 jam & tidak paksa → cache; selain itu jatah DIPESAN LEBIH DULU (sebelum cache
  disentuh) → jatah habis + cache segar → cache + `kuota-habis`; lainnya hitung ulang → simpan →
  antre. Hasil membawa `sumber`, `rerank` (status), `sisaRefresh`, `computedAt`, `feed`. Jatah
  dikembalikan bila tanpa kandidat, hitung gagal, atau antrean menolak (`gagal-antre`, feed tetap
  ada). `createRerankJobs`: id job `ai-rerank:<user>:<computedAt>`.
* **`services/rerank.service.ts`** — worker: top-20 angkatan → profil aman + lowongan AKTIF →
  `ai.prompt` dengan `reservasi` dari API (tidak memotong ulang) → urai → tulis. Angkatan basi /
  profil hilang / tanpa lowongan aktif → dilewati + jatah pulang. Gagal provider: bukan percobaan
  terakhir → dilempar (retry BullMQ); terakhir → `kembalikanBila` + status `gagal` (bukan DLQ —
  feed tetap berfungsi).
* **`@nawasena/schemas`** — `aiRerankFeedJobSchema` (`.strict()`, hanya referensi + reservasi).
* **Modul jobs** — `listActiveByIds` (repo) + `bacaUntukRerank` (service), SENGAJA tanpa
  `welcomedDisabilityTypes` (lowongan "menyambut Tuli" di prompt = penjelasan yang menyebut
  kondisi pengguna).
* **Worker** — processor `ai-rerank-feed` + perakitan dengan pembaca profil jalur aman.
* **Env** — `MATCHING_RERANK_ENABLED` (bawaan `true`): tuas rollback; `false` = tanpa LLM dan
  tanpa memotong jatah.
* **Utang U-06 LUNAS** — pemanggil `withDegradation` pertama.

### Bukti AC

| AC | Bukti |
|---|---|
| Request kedua < 24 jam tanpa LLM | `matching-rerank-service.test.ts`: provider penghitung `chatJson` = 1 setelah dua muat (6 jam terpisah); `hitung` dipanggil sekali, antrean kosong |
| Penjelasan ≤ 1 kalimat, sederhana | `rapikanPenjelasan` (6 kasus tolak + fasilitas & angka desimal lolos); sampel Gemini nyata 33/33 lolos, dibaca manual |
| Refresh ke-4 → cache + info kuota | kuota ASLI (`createAiQuota`, Redis palsu): tiga refresh paksa `sisaRefresh` 2→1→0, keempat `sumber: cache, rerank: kuota-habis, sisaRefresh: 0`, baris cache identik sebelum/sesudah |
| Payload bebas field sensitif | inspeksi `rerankV1.bangun(...)` dari objek yang ditumpangi `disabilityTypes`/`summary`/`accommodationNeeds`: tidak ada yang terbawa; DB test: `welcomedDisabilityTypes` tidak sampai ke prompt |
| Whitelist ID | property fast-check 500 kasus: keluaran APA PUN → permutasi persis kandidat, rank 1..N; test ref 21/999 → tidak menambah baris (memori & PostgreSQL) |

### Verifikasi

* Gate: `pnpm turbo run lint typecheck test --concurrency=1` — **27/27 task** hijau;
  `@nawasena/api` **139 berkas / 1996 lulus, 2 skip** (MinIO; urutan boot `.env`) dengan
  PostgreSQL + Redis hidup; migrasi 19 diterapkan ke DB dev (`migrate status` bersih).
* **Manual (Gemini NYATA, data dev, 3 persona, 11 kandidat masing-masing):** 1,5–2,2 dtk per
  panggilan, ±1.600 token masuk / 200–450 keluar (20 lowongan ≈ 2.800 token masuk). 33/33
  penjelasan lolos validasi; contoh: "Cocok karena Anda menguasai Data Entry dan tersedia fasilitas
  ruang kerja tenang." Tidak ada yang menyebut kondisi pengguna — termasuk persona yang headline-nya
  "mahir TalkBack/NVDA".

### Risiko & catatan

* **Headline tetap teks bebas** dan bisa mengisyaratkan kondisi (contoh persona di atas). Model
  tidak menyebutnya pada sampel, dan filter istilah kondisi menjadi jaring kedua — tetapi ini
  tripwire kata, bukan jaminan.
* **Refresh ganda serentak** bisa memesan dua jatah; job angkatan yang kalah mendapati angkatannya
  basi dan mengembalikan jatahnya, jadi biaya bersihnya satu — kecuali bila kedua job sempat
  berjalan sebelum angkatan kedua tertulis (jendela milidetik).
* **Cache prompt (1 jam, per pengguna)** di atas `match_scores`: refresh paksa dengan top-20 &
  profil yang identik dalam satu jam memakai jawaban tersimpan — tanpa panggilan LLM, tetapi tetap
  memakai satu jatah refresh (dipesan API).
* Lowongan yang ditutup sesudah angkatan ditulis tetap berada di cache (tanpa `rank`) sampai
  invalidasi PR-069 (`job.updated`) — PR-073 sebaiknya tetap memfilter keaktifan saat membaca.

### Next steps

1. **PR-073** — `GET /me/matches`: rakit `hitung()` dari `kandidatService` + `penilaianService`,
   template penjelasan deterministik untuk `explanation: null`, `meta.degraded` dari status
   `rerank`, `sisaRefresh` di respons, dan wiring `createFeedCacheService` + `createRerankJobs` di
   `boot.ts`.

---

## PR-073 — GET /me/matches + Template Degradasi

> **Phase:** [11 - Matching Engine](../phase-11-matching-engine.md#pr-073---get-mematches--template-degradasi)
> **Tanggal:** 2026-09-30
> **Status:** Selesai
> **Branch:** `pr-073-me-matches` → `phase-11-matching-engine`

### Ringkasan hasil

Endpoint feed AI Job Matching yang merangkai seluruh Phase 11: kandidat pgvector (PR-070) →
hard filter akomodasi terenkripsi + skor (PR-071) → cache + re-rank asinkron (PR-072) → kartu
lowongan aktif + penjelasan (LLM atau template deterministik) + meta. Satu kontrak untuk mode
normal dan turun. `boot.ts` kini merakit rantai itu (`createMatchingFeedModule`).

### Keputusan owner (AskUserQuestion, 2026-09-30)

1. **Refresh = `POST /me/matches/refresh`** terpisah dari `GET /me/matches`: aksi berkuota tidak
   boleh terpicu GET yang diulang otomatis (prefetch, retry klien/proxy).
2. **`meta.degraded` dipisah dari `meta.aiMenyusun`.** `degraded` = feed ini memang tanpa AI (kuota
   habis, flag mati, antrean/LLM gagal); `aiMenyusun` = re-rank masih di antrean (muat pertama).
3. **Profil belum siap → 200 + `data: []` + `meta.alasanKosong`** (`profil-belum-siap` /
   `tanpa-kecocokan`), bukan error.
4. **Template dari data**: nama keahlian pengguna yang muncul sebagai kata utuh di teks lowongan,
   mode remote, lokasi sama, fasilitas lowongan — maks dua alasan.

### Scope selesai

* **`@nawasena/schemas` `matching.ts`** — `matchesQuerySchema` (limit 1–50), `matchesRefreshQuerySchema`,
  `matchItemSchema` (`job` = kartu `JobSearchResult` yang sama dengan pencarian, `score`,
  `explanation`, `explanationSource: ai|template`), `matchesMetaSchema` (SEMUA kunci wajib:
  `nextCursor`, `degraded`, `aiMenyusun`, `sisaRefresh`, `diperbaruiPada`, `alasanKosong`). OpenAPI
  + `openapi.json` diperbarui.
* **`services/penjelasan-template.ts`** (murni) — `templatePenjelasan`, `keahlianCocok` (kata utuh,
  Unicode, beda huruf diabaikan; keahlian ber-istilah kondisi atau pemecah kalimat dilewati).
* **`services/matches.service.ts`** — `createHitungFeed` (kandidat → skor) dan
  `createMatchesService.lihat/segarkan`: urut menurut `rank` bila angkatan sudah di-rerank, selain
  itu skor; lowongan yang sudah ditutup disaring saat membaca (menutup risiko PR-072); profil +
  keahlian hanya dibaca bila halaman butuh template. Cursor = `encodeKursor({ computedAt,
  "<basis>:<offset>" })` — mengikat angkatan DAN basis urutan halaman 1; angkatan diganti → 400.
* **`feed-cache.service.ts` (PR-072) diperluas** — status `profil-belum-siap`; `baca()` untuk
  halaman lanjutan (tanpa hitung ulang/jatah); **penanda nasib re-rank per angkatan** di
  `redis.cache` (`matching:rerank:v1:<userId>`, TTL 24 jam, gagal = "tidak diketahui" → dianggap
  turun). `BATAS_TUNGGU_RERANK_MS` = 2 menit: lewat itu tanpa `rank` → `degraded`.
* **Controller + router** — keduanya `access.authenticated()`; identitas dari sesi saja.
* **Modul jobs** — `listActiveByIds` kini membawa `companyName`; `bacaUntukFeed(ids)`.
* **`boot.ts`** — `createMatchingFeedModule` sesudah `jobs`; profil via `findSafeByUserId`, keahlian
  via service karier, `sensitiveAccess` instance modul profiles (audit agregat yang sama).
* **Test bersama** — `helpers/match-scores-memori.ts` (dipakai juga test PR-072).

### Bukti AC

| AC | Bukti |
|---|---|
| Kontrak identik (golden) | `matching-feed-http.test.ts`: bentuk struktural rekursif respons normal (sesudah worker) = respons turun (flag mati); keduanya lolos `matchesResponseSchema`; kunci `meta` sama |
| AI mati → feed valid + template | flag mati: `degraded: true`, jatah utuh, "Cocok: bisa kerja dari rumah (remote), sesuai keahlian Excel."; LLM gagal di percobaan terakhir → `aiMenyusun` sampai batas 2 menit lalu `degraded` |
| Tidak menyebut disabilitas | property 500 kasus (keahlian acak + istilah kondisi); HTTP: keahlian "Tuli" di profil & alasan LLM "untuk Anda yang Tuli" → tidak satu pun penjelasan menyebut kondisi |
| Pagination stabil | jelajah limit 7 = seluruh 25 tanpa duplikat; re-rank selesai DI ANTARA halaman → urutan halaman 1 tetap; cursor angkatan lama/rusak & limit 51 → 400 |
| p95 < 800 ms (cache hangat) | `matching-feed-db.test.ts`: **32,5 ms** p95 dari 30 permintaan HTTP, PostgreSQL lokal |

`matching-feed-db.test.ts` juga membuktikan rantai nyata: kebutuhan akomodasi terenkripsi
("juru bahasa isyarat") menyaring lowongan tanpa fasilitas itu, lowongan `closed` tidak muncul,
kartu membawa nama perusahaan.

### Verifikasi

* Gate: `pnpm turbo run lint typecheck test --concurrency=1` — **27/27 task** hijau;
  `@nawasena/api` **142 berkas / 2021 lulus, 2 skip** (MinIO; urutan boot `.env`) dengan
  PostgreSQL + Redis hidup.
* `pnpm --filter @nawasena/schemas check:openapi` — sinkron.

### Risiko & catatan

* **`aiMenyusun` berbasis waktu** (2 menit) + penanda di cache yang bisa ter-evict: antrean yang
  sangat tertunda akan tampil `degraded` walau re-rank akhirnya selesai — muat berikutnya pulih.
* **Muat halaman 1 bisa memotong jatah** bila cache kedaluwarsa (keputusan PR-072 #3) — GET tetap
  idempoten dalam 24 jam.
* Kartu membaca ≤ 50 lowongan per permintaan (satu query `IN`), diurutkan di memori — ukuran feed
  dibatasi top-50, jadi tidak tumbuh.

### Next steps

1. **PR-074** — beranda seeker: kartu (skor teks + visual, penjelasan, ikon akomodasi berlabel),
   banner `role="status"` untuk `degraded`/`aiMenyusun`, tombol refresh dengan `sisaRefresh`,
   arahan `alasanKosong`. `@nawasena/api-client` belum punya klien endpoint ini.

---

## PR-074 — Matching Feed FE + Degradasi UX

> **Phase:** [11 - Matching Engine](../phase-11-matching-engine.md#pr-074---matching-feed-fe--degradasi-ux)
> **Tanggal:** 2026-09-30
> **Status:** Selesai (NVDA nyata tercatat sebagai utang U-30)
> **Branch:** `pr-074-matching-feed-fe` → `phase-11-matching-engine`

### Ringkasan hasil

Beranda seeker: feed AI Job Matching di `/` untuk pengguna yang sudah masuk — kartu (skor
angka + label, alasan, info lowongan, akomodasi berlabel), banner status AI, refresh berkuota,
keadaan kosong yang mengarahkan, pagination "muat lebih banyak", dan fokus/gulir pulih dari
halaman detail. Tamu tetap melihat landing.

### Keputusan owner (AskUserQuestion, 2026-09-30)

1. **`/` bersyarat**: belum masuk → landing; masuk → feed; `VITE_MATCHING_FEED_ENABLED=false`
   → halaman cari lowongan (Rollback Strategy). Pengalihan sesudah login tidak berubah.
2. **Tidak ada pembaruan otomatis**: saat `aiMenyusun`, banner + tombol manual "Tampilkan urutan
   terbaru" (tanpa jatah); kartu tidak pernah berpindah sendiri.
3. **"Integrasi filter browse" = jembatan**: tautan "Cari lowongan lain" ke `/lowongan` dengan
   provinsi profil terisi. *Mode kerja tidak diisikan* — profil tidak punya preferensi mode kerja
   (hanya `openToRemote`, yang sengaja tidak menyaring sejak PR-070).
4. **NVDA nyata dicatat sebagai utang U-30** + checklist (desktop sedang dipakai).

### Scope selesai

* **`@nawasena/api-client`** — `listMatches`, `refreshMatches` (POST), `matchingKeys.feed(sub)`.
  **Kunci dilingkupi pemilik**: cache TanStack tidak dibuang saat keluar, dan feed adalah hasil
  saringan kebutuhan akomodasi — pola `profilesKeys`.
* **`features/job-feed/kartu-lowongan.tsx`** — slot `pembuka` (di dalam kartu, sebelum tautan):
  satu komponen kartu untuk pencarian dan feed.
* **`features/job-feed/kecocokan.tsx`** — "Kecocokan 73% — sangat cocok" (batas 0,70 / 0,55),
  bar SVG dekoratif (tanpa `style` inline), "Kenapa cocok: …", catatan "Alasan disusun AI".
  Mode teks sederhana menyembunyikan bar dan catatan AI (mitigasi overload).
* **`features/job-feed/feed-matching.tsx`** — `useInfiniteQuery`; banner `role="status"` yang
  selalu terpasang; refresh `aria-disabled` + `aria-describedby` saat habis (tetap bisa difokus);
  "Tampilkan urutan terbaru" memindahkan fokus ke judul daftar; keadaan kosong per
  `alasanKosong`; pemulihan fokus pola PR-059.
* **`routes/beranda.tsx`** — pemilih landing/feed/cari; saat sesi `memulihkan` tidak menebak
  (pola `Terlindungi`); feed & halaman cari dimuat `lazy()` supaya tamu tidak mengunduhnya.
  **`routes/beranda-seeker.tsx`** — h1, penjelasan, feed, tautan cari berprovinsi.
* **`features/job-feed/bendera.ts`** — `VITE_MATCHING_FEED_ENABLED`.
* **Katalog `beranda.feed.*`** (id + id-simple). Route `/` kini ikut memuat `lowongan`,
  `companies`, `profil` (taksonomi kartu).
* **Test** — `beranda-feed.test.tsx` (13), `api-client/matching.test.ts`; `onboarding.test.tsx`
  disesuaikan: bacaan feed/profil milik halaman tujuan tidak dihitung sebagai kiriman wizard
  (perlakuan sama dengan `/me/notifications`). E2E: registry "beranda — feed seeker",
  `beranda-feed.spec.ts` (5), pemalsu `/me/matches` & `/refresh` di `palsukan-api.ts`.

### Bukti AC

| AC | Bukti |
|---|---|
| Kartu satu kesatuan bagi SR | satu `<li>`/`Kartu`, satu tautan di akhir; urutan DOM skor → alasan → info → akomodasi → tautan (vitest); NVDA nyata → U-30 |
| Skor bukan warna-saja | teks angka + label diuji; bar `aria-hidden` |
| Degraded → banner, fitur lengkap | vitest + Playwright (axe 0 pelanggaran di degraded & AI menyusun) |
| Feed→detail→kembali | Playwright 390×600: fokus di tautan kartu yang dibuka, gulir ≥ posisi semula |
| Refresh + sisa kuota; habis → nonaktif beralasan | vitest (POST, pengumuman, `aria-disabled`, deskripsi, fokus bertahan) + Playwright |

### Verifikasi

* Suite `turbo run lint typecheck test --concurrency=1`: **27/27 task** hijau — web 60 berkas /
  723 lulus, api-client 130, api 2021 (2 skip).
* `build` + `test:a11y`: **122/122** (registry + `beranda-feed.spec.ts`). Lighthouse desktop lulus.
* Lighthouse **3G lokal: 0,79** (ambang 0,80) — **baseline tanpa PR ini juga 0,79** (FCP 3,3 dtk,
  LCP 4,2 dtk identik), diukur di mesin yang sama dengan stash; bukan regresi PR ini. Feed & halaman
  cari dimuat `lazy()` justru supaya landing tamu tidak bertambah berat. Keputusan akhirnya di
  job `a11y` CI.
* `cek:budget`: JS awal 115,7 / 200 KB (feed tidak masuk bundel awal).

### Risiko & catatan

* Pengguna non-seeker (admin) yang membuka `/` juga melihat feed — hasilnya keadaan
  "profil belum siap". Sesi di klien belum membawa peran (log PR-030a); menyaring per peran
  menunggu `userId`/peran di store sesi.
* Landing untuk tamu kini menunggu jawaban `/auth/refresh` sebelum tampil (tanpa tebakan).
* Batas tingkat kecocokan (0,70/0,55) dari skor data dev — evaluasi bersama bobot PR-071 saat pilot.

### Next steps

1. Phase 11 lengkap (PR-069..074) — Exit Criteria menunggu perintah owner untuk `phase-11 → main`.
2. U-30: jalankan checklist NVDA saat desktop bebas.

---

## Utang U-25 — CV ikut berkas ekspor PDP

> **Tanggal:** 2026-10-01 · **Status:** Selesai · **Branch:** `utang-u25-ekspor-cv` → `phase-11-matching-engine`
> Keputusan owner (AskUserQuestion, 2026-10-01): dibayar sekarang sebagai PR tersendiri.

Pemicu U-25 sudah menyala sejak PR-060: CV pengguna tidak ikut `GET /me/export`. Dibayar dengan
`createResumesExportContributor` (modul `resumes`, lewat service yang sama dengan editor CV) →
bagian `resumes: Resume[]` di `dataExportSchema` (aditif, versi format tetap 1), dirakit di
`boot.ts`. Penjaga `export-kelengkapan.test.ts`: `resumes` → `TERDAFTAR`. Fixture ekspor (api,
api-client, e2e web) mendapat `resumes: []`; `openapi.json` diregenerasi. Test baru
`resume-export.test.ts` (isi lengkap per CV, milik pemanggil saja). PDF tidak ikut — artefak
turunan dari isi yang sama.

## Perbaikan gerbang Lighthouse — URL audit + bundel awal (utang U-31)

> **Tanggal:** 2026-10-01 · **Status:** Selesai (sebagian U-31) · **Branch:** `perbaikan-lcp-beranda` → `phase-11-matching-engine`

### Kronologi

CI PR U-25 merah di **Lighthouse 3G 0,79** (< 0,80) padahal PR itu tidak menyentuh kode web.
Diagnosis pertama (PR-074 membuat landing menunggu `/auth/refresh`) **keliru**: petunjuk
"pernah masuk" di localStorage (dipilih owner atas diagnosis itu) tidak mengubah skor sama
sekali. Penelusuran berikutnya menemukan sebab sebenarnya: **kedua config Lighthouse menunjuk
`/index.html`, yang jatuh ke rute 404** — gerbang selama ini mengaudit halaman 404, yang skornya
naik-turun 0,79/0,80 di ambang. Landing sungguhan terukur **0,73** (dan 0,73–0,75 sebelum PR-074).

### Keputusan owner (AskUserQuestion, 2026-10-01)

1. Petunjuk localStorage **dibuang**; pemindahan katalog feed ke chunk feed **dipertahankan**.
2. URL audit diperbaiki + optimasi; karena optimasi aman hanya mencapai 0,76: **ambang 3G 0,75
   sementara** + utang **U-31** (pre-render landing, sebelum Phase 18).

### Scope selesai

* `lighthouserc.json` & `lighthouserc-3g.json` → `http://localhost/`; penjaga
  `__tests__/lighthouse-url.test.ts` (merah bila URL audit jatuh ke rute `*` — dibuktikan dengan
  URL lama).
* `@nawasena/schemas` `"sideEffects": false` — barrel `api-client` → `schemas` tidak lagi menyeret
  seluruh skema (queue, audit, export, resumes, …) ke bundel awal: **118 → 108 KB gzip**.
* Rute `/` hanya memuat katalog `beranda`; katalog kartu feed (`lowongan`/`companies`/`profil`)
  dimuat bersama chunk feed (`lazy()` di `routes/beranda.tsx`) — tamu tidak mengunduhnya.
* Ambang 3G `0.75` sementara (dicatat di config dan U-31).

### Pengukuran 3G landing `/` (lokal, simulate, 3 run)

| Varian | Skor | FCP | LCP |
|---|---|---|---|
| Sebelum PR-074 | 0,73–0,75 | 3,8 dtk | 4,6–4,9 dtk |
| Tip phase (PR-074) | 0,73 | 3,9 dtk | 4,9 dtk |
| + `sideEffects` schemas | **0,76** | 3,5 dtk | 4,6 dtk |
| + tanpa menunggu sesi (eksperimen, dibuang) | 0,75–0,76 | 3,5 dtk | 4,6 dtk |
| + landing eager (eksperimen, dibuang) | 0,76–0,78 | 3,5 dtk | 4,3–4,6 dtk (bundel awal +12 KB) |

### Next steps

* U-31: PR pre-render landing (ambang kembali 0,8) — tanpa membuat pengguna yang sudah masuk
  melihat landing sekejap.
* PR U-25 di-update dari tip phase sesudah PR ini masuk.

---

## Utang U-08 — Registry prompt dipindai rekursif

> **Tanggal:** 2026-10-01 · **Status:** Selesai · **Branch:** `utang-u08-registry-rekursif` → `phase-11-matching-engine`

`prompt-registry.test.ts` berhenti di level atas `core/ai/prompts/`, jadi template di subfolder
lolos dari kewajiban "setiap `<nama>.vN.ts` terdaftar". Kini lewat `idBerkasTemplate()`
(rekursif, `id` = basename) + dua penjaga baru: basename unik lintas subfolder, dan test atas
pemindainya (folder sementara bersubfolder). Tidak ada perubahan kode produksi.
