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
