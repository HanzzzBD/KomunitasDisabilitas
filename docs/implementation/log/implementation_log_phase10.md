# Implementation Log — Phase 10 (AI CV Builder)

> Catatan per PR yang selesai di Phase 10. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-065 — Chat Sessions BE

> **Phase:** [10 - AI CV Builder](../phase-10-ai-cv-builder.md#pr-065---chat-sessions-be)
> **Tanggal:** 2026-09-28
> **Status:** Selesai
> **Branch:** `pr-065-chat-sessions` → `phase-10-ai-cv-builder`

### Ringkasan hasil

Tabel `ai_chat_sessions` (migrasi 16) beserta service sesi di modul `ai`: buat-atau-lanjutkan,
baca, dan tambah giliran. Hanya satu endpoint yang lahir — `GET /api/v1/ai/cv-chat/:session` —
sebab sesi baru dan giliran baru harus masuk lewat `POST /ai/cv-chat` (SSE, PR-066), satu-satunya
jalur yang juga memotong kuota dan menulis `ai_usage`. Jalur tulis HTTP kedua di PR ini berarti
transkrip yang bisa tumbuh tanpa satu pun panggilan AI tercatat.

Service-nya (`AiModule.chatSessions`) dikembalikan dari `createAiModule` untuk PR-066 — pola yang
sama dengan `service` di modul resumes.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `check:openapi` sinkron.
`@nawasena/api` **121 berkas / 1800 lulus, 2 skip** (keduanya tak terkait: MinIO tidak dinyalakan,
urutan boot `.env`), dijalankan dengan **PostgreSQL + Redis hidup** sehingga seluruh `*-db.test.ts`
benar-benar berjalan. Workspace lain: schemas 100, api-client 117, config 25, a11y 74, ui 188,
web 700, worker 3 — semuanya lulus.

### Keputusan owner (AskUserQuestion, 2026-09-28)

Dokumen phase dan SDD diam soal tiga hal; ketiganya ditanyakan sebelum menulis kode:

1. **Paling banyak SATU sesi aktif per pengguna.** Ditegakkan unique parsial
   `ai_chat_sessions_satu_aktif (user_id) WHERE status='active'`. "Mulai percakapan" setelah
   putus 3G mengembalikan sesi yang SAMA, bukan menumpuk sesi yatim — resume menjadi bawaan,
   bukan sesuatu yang harus diingat klien.
2. **Sesi yang ditinggal juga dihapus 30 hari setelah aktivitas terakhirnya.** SDD §6.4 hanya
   menyebut "30 hari setelah finalize"; dibaca harfiah, transkrip yang berhenti di tengah hidup
   selamanya — kebalikan dari minimisasi PDP yang menjadi alasan retensi ini ada.
3. **Transkrip didaftarkan ke ekspor PDP SEKARANG**, bukan ditunda ke PR-066 — meski tabelnya
   masih kosong sampai endpoint SSE lahir. Alasan "belum ada datanya" persis yang membuat
   U-03/U-04 basi selama lima phase.

### Scope selesai

**Kontrak (`packages/schemas`)**

* **`src/ai.ts`** — `AI_CHAT_LIMITS`, `aiChatRoleSchema` (`user`|`assistant`; `system` sengaja
  tidak ada), `aiChatTurnSchema` (`.strict()`, empat field), `aiChatSessionStatusSchema`,
  `aiChatSessionSchema`, params + response envelope.
* **`src/export.ts`** — bagian `aiChatSessions` (dipakai ulang dari `aiChatSessionSchema`).
  Aditif, `EXPORT_FORMAT_VERSION` tidak naik.
* **`src/openapi.ts` + `openapi.json`** — `GET /ai/cv-chat/{session}`.

**Database**

* **Migrasi 16** (ditulis tangan, aditif — U-15) + `down.sql`. Enum `AiChatSessionStatus`,
  tabel, unique parsial, dua CHECK: `transcript` harus larik, dan
  `(status = 'finalized') = (finalized_at IS NOT NULL)`.
* `ai_chat_sessions_satu_aktif` ditambahkan ke daftar indeks raw-SQL wajib di
  `migrasi-skema.test.ts`.

**Modul `ai`**

* `repositories/chat-sessions.repository.ts` — `findOwned`, `findActive`, `createOrGetActive`,
  `appendTurn`, `listForExport`, `countRetention`, `deleteRetentionBatch`. Setiap query menyebut
  `userId`.
* `services/chat-sessions.service.ts` — `get`, `mulaiAtauLanjutkan`, `tambahGiliran`,
  `semuaUntukEkspor`.
* `services/chat-retention.service.ts` — kebijakan `ai_chat_sessions.finalized` dan
  `ai_chat_sessions.abandoned` untuk registry PR-024a.
* `services/chat-export.service.ts` — kontributor ekspor `aiChatSessions`.
* `controllers/chat-sessions.controller.ts` + `createAiChatSessionsRouter`.
* `createAiModule` kini menerima `prisma` dan mengembalikan `{ router, chatSessions,
  exportContributor }` (sebelumnya `Router`).

**Core & wiring**

* `core/http/errors.ts` — `AI_SESI_TIDAK_DITEMUKAN` (404), `AI_SESI_SUDAH_SELESAI` (409),
  `AI_TRANSKRIP_PENUH` (409).
* `core/config/env.ts` + `.env.example` — `RETENTION_AI_CHAT_SESSIONS_DAYS` (bawaan 30, min 1).
* `boot.ts` — modul ai dirakit di luar callback `routes` supaya kontributor ekspornya bisa
  masuk ke modul users.
* `apps/worker/src/processors/retention.ts` — kebijakan chat ikut dirakit.
* `users/services/purge.service.ts` — `aiChatSession` masuk `TABEL_DIHAPUS` (jalur
  anonimisasi tidak memicu cascade).

**Test** — 28 baru: `ai-chat-sessions-db.test.ts` (15, DB nyata), `ai-chat-sessions.test.ts`
(13, unit + HTTP). Fixture ekspor lama ditambah bagian `aiChatSessions` (kontraknya `.strict()`,
jadi berkas tanpa bagian ini memang harus merah) — lima di `apps/api`, satu di
`packages/api-client` (`users.test.ts`), dan `BERKAS_UJI` e2e web (`palsukan-api.ts`, divalidasi
terhadap `dataExportSchema`; tanpanya tiga test unduh-ekspor jatuh timeout).

**Catatan proses:** push pertama merah di CI karena fixture `packages/api-client` terlewat —
suite lokal saat itu hanya dijalankan untuk `apps/api`. Pelajarannya: perubahan pada
`dataExportSchema` menyentuh SETIAP workspace yang memparse ekspor; jalankan `pnpm test` penuh
(`--concurrency=1` di mesin ini) sebelum push.

### Keputusan teknis

1. **Append adalah SATU `UPDATE`, bukan baca-ubah-tulis.** `transcript || jsonb_build_array(...)`
   dengan `seq = jsonb_array_length(transcript) + 1`, di baris yang dikunci `UPDATE`. Permintaan
   kedua menunggu, lalu (READ COMMITTED) mengevaluasi ulang `SET` dan `WHERE` terhadap versi
   baris yang sudah memuat giliran pertama. Dibuktikan: 20 append serentak → `seq` 1..20, tanpa
   ganda, tanpa lubang, isi tiap `seq` cocok dengan yang dilaporkan ke pemanggilnya.
2. **Batas ukuran di `WHERE` yang SAMA dengan append.** Pemeriksaan terpisah bisa dilewati dua
   permintaan serentak yang sama-sama melihat sisa satu tempat. Diuji: sepuluh giliran 1 KB
   serentak terhadap batas 4 KB → 1–3 lolos dan `octet_length` akhir ≤ batas. Perkiraan byte
   giliran sengaja sedikit di bawah kenyataan + kelonggaran 16 byte (lihat `perkiraanByte`).
3. **Dua batas, bukan satu.** Jumlah giliran (120) membatasi percakapan yang tak pernah selesai;
   byte (256 KiB) membatasi giliran panjang yang jumlahnya masih di bawah batas. Per giliran
   2.000 karakter.
4. **`createOrGetActive` = `INSERT … ON CONFLICT (user_id) WHERE status='active' DO NOTHING`,
   lalu baca.** Delapan "mulai" serentak → satu sesi, tepat satu pemanggil menerima `baru: true`.
5. **Predikat retensi DIULANG di `WHERE` luar DELETE.** Subquery `LIMIT` tidak dievaluasi ulang
   saat DELETE menunggu kunci baris; hanya `WHERE` luar yang dievaluasi ulang terhadap versi
   terbaru. Tanpa pengulangan, sesi yang dilanjutkan tepat pada hari ke-30 saat job berjalan
   tetap ikut terhapus. (Jendela sempit, tidak diuji dengan race sungguhan — penalaran,
   bukan bukti.)
6. **Kategori `abandoned` memakai `updated_at`, bukan `created_at`.** Sesi yang dibuat 90 hari
   lalu tetapi dipakai kemarin selamat — diuji.
7. **404, bukan 403, untuk sesi milik orang lain** — badan jawabannya identik dengan sesi yang
   tidak ada (diuji). Alasan sama dengan `CV_TIDAK_DITEMUKAN`.
8. **`access.authenticated()`, bukan `access.self()`** — `:session` adalah id sesi. Kepemilikan
   dijamin repository. Sama dengan `/me/resumes/:id`.
9. **`Cache-Control: private, no-store`** pada `GET` — transkrip adalah kata-kata pengguna
   tentang riwayat kerjanya.
10. **Guard "transkrip tanpa field sensitif" ditegakkan TIPE + skema.** `GiliranBaru` hanya
    `role` + `content`; test compile-time menuntut `Extract<keyof AiChatTurn, keyof
    SensitiveProfile>` = `never`; `.strict()` menolak field tambahan saat runtime. Service tidak
    membaca profil sama sekali, jadi tidak ada jalur bagi data terenkripsi ADR-007 untuk disalin
    ke jsonb polos. Yang diketik pengguna dengan kata-katanya sendiri memang ada di `content` —
    itu miliknya, ikut diekspor, dan terhapus retensi.
11. **Validasi giliran di SERVICE, bukan hanya di router PR-066.** Jawaban AI juga masuk lewat
    `tambahGiliran`, dan tidak melewati validator HTTP mana pun.
12. **Status hanya `active` | `finalized`.** PR-067 boleh menambah nilai (`ALTER TYPE ... ADD
    VALUE` aditif) bila butuh keadaan antara; tidak dikarang di sini.

### Verifikasi

* **Mutasi:** menghapus batas giliran dari `WHERE` append → test `maxTurns` merah. Menghapus
  `.strict()` pada skema giliran-baru di service **tidak** memerahkan apa pun — dan itu benar:
  `.pick()` dari `aiChatTurnSchema` yang sudah `.strict()` mewarisi mode strict, jadi panggilan
  itu redundan (dibiarkan sebagai dokumentasi niat). Kedua berkas dipulihkan byte-identik (md5).
* **psql:** `\d ai_chat_sessions` menampilkan unique parsial, dua CHECK, FK cascade.
* **`prisma migrate diff`** DB ↔ schema: hanya tujuh `DROP INDEX` drift U-15 yang sudah dikenal;
  tidak ada perbedaan dari migrasi 16.
* **Migrasi down** dijalankan terhadap DB nyata di dalam transaksi yang di-rollback: `down.sql`
  menghapus tabel dan tipe, `migration.sql` memulihkannya.

### Risiko yang ditemukan

* **U-25 (baru): CV tidak ikut ekspor PDP.** Saat mendaftarkan `ai_chat_sessions`, penjaga yang
  sama memperlihatkan `resumes` masih `DITUNDA` dengan alasan "belum ada endpoint yang bisa
  membuat CV" — basi sejak PR-060. Tidak dibayar di sini (di luar scope); dicatat di
  `docs/utang-teknis.md`.
* **`RetentionPolicy` diimpor dari berkas service modul users** — pola yang sama dengan modul
  auth, tetapi kini dua modul bergantung pada letak tipe itu.
* **Tidak ada indeks untuk selektor retensi.** Tabelnya kecil (≤ satu aktif per pengguna +
  sesi selesai 30 hari); `count`/`DELETE` retensi melakukan seq scan. Pantas ditinjau bila
  jumlah pengguna mendekati batas MVP.
* **Suite penuh paralel kehabisan memori di mesin dev** (tsc/vitest OOM, Docker Desktop ikut
  mati). Dijalankan dengan `--concurrency=1` / `--no-file-parallelism`. Bukan regresi kode.

### Next steps

* **PR-066** — endpoint SSE: panggil `mulaiAtauLanjutkan` + `tambahGiliran` (pesan pengguna
  sebelum stream, jawaban AI setelah utuh). Utang yang jatuh tempo di sana tetap: U-05
  (`ai_usage` di ekspor), U-06 (perakitan `aiClient`/SSE di boot), U-07 (penjaga
  `createAiGateway`). `AI_TRANSKRIP_PENUH` harus diterjemahkan UI menjadi ajakan finalize.
* **PR-067** — finalize: set `status='finalized'` + `finalized_at` dalam satu `UPDATE` (CHECK
  menolak keadaan setengah), idempoten per sesi.
* **U-25** — kontributor ekspor `resumes`.

---

## PR-066 — CV-Chat SSE Endpoint + Prompt Interviewer

> **Phase:** [10 - AI CV Builder](../phase-10-ai-cv-builder.md#pr-066---cv-chat-sse-endpoint--prompt-interviewer)
> **Tanggal:** 2026-09-28
> **Status:** Selesai
> **Branch:** `pr-066-cv-chat-sse` → `phase-10-ai-cv-builder`

### Ringkasan hasil

Endpoint AI pertama di produk ini hidup: `POST /api/v1/ai/cv-chat` mengalirkan jawaban
pewawancara `cv-interviewer.v1` lewat SSE, dengan kuota, jejak biaya, dan sambung ulang.
Bersamanya lahir `POST /ai/cv-chat/sessions` (mulai/lanjutkan + salam statis) dan
`GET /ai/cv-chat/:session/stream` (sambung ulang dengan `Last-Event-Id`).

PR ini juga membayar tiga utang yang pemiliknya memang PR-066: **U-05** (ekspor `ai_usage`),
**U-06** (perakitan `AiClient` di `boot.ts`, sebagian) dan **U-07** (penjaga jangkauan pabrik
provider).

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `check:openapi` sinkron. `@nawasena/api`
**124 berkas / 1835 lulus, 2 skip** (tak terkait: MinIO mati, urutan boot `.env`) dengan
PostgreSQL + Redis hidup; schemas 100, api-client 117, config 25, a11y 74, ui 188, web 700,
worker 3.

### Keputusan owner (AskUserQuestion, 2026-09-28)

1. **Cacah token dari usage provider**, bukan 0/0. Aliran Gemini membawa `usageMetadata`
   kumulatif; Groq baru mengirim `usage` bila diminta `stream_options.include_usage`.
2. **Salam pembuka statis** — pertanyaan pertama ditulis di template dan disimpan sebagai giliran
   asisten tanpa memanggil LLM: gratis, deterministik, tidak memotong kuota.
3. **U-05 dibayar di PR ini** — bagian ekspor `aiUsage`.
4. **Kuota habis dikirim sebagai event SSE `error`** (bukan 429 JSON) — klien PR-068 cukup
   punya satu cara membaca kegagalan chat.
5. **Model bawaan diganti** (ditanyakan SETELAH verifikasi nyata menemukan keduanya 404):
   `gemini-3.5-flash-lite` dan `qwen/qwen3.8-27b`.

### Scope selesai

**Core AI**

* `core/ai/stream.ts` — `chatStream(request, opsi?)` dengan kanal samping `saatSelesai`
  (provider yang menjawab + usage), pembaca usage Gemini/Groq, `stream_options.include_usage`,
  `createStreamBelumDikonfigurasi`. Kontrak "yield teks" PR-045 tidak berubah.
* `core/ai/gateway.ts` — `createAiStreamGateway(env)`: Gemini utama, Groq cadangan (hanya sebelum
  token pertama), menghormati `AI_ROUTER_FORCE_PROVIDER`.
* `core/ai/client.ts` — `AiClient.stream()`: kuota diperiksa saat di-await (sebelum aliran
  dibuka); refund hanya bila gagal sebelum token pertama; satu baris `ai_usage` saat aliran
  berakhir normal. Menutup utang PR-045 "streaming belum memotong kuota".
* `core/ai/prompts/percakapan.ts` — `definePercakapan`: pintu template percakapan teks. Pesan
  pengguna SELALU dibungkus `bungkusDataTakTepercaya`; instruksi anti-injeksi SELALU `system`
  pertama; peran dijamin berselang-seling; `rapikan` menormalkan keluaran.
* `core/ai/prompts/cv-interviewer.v1.ts` — persona, larangan nasihat medis DAN larangan menanyakan
  disabilitas/diagnosis, few-shot, salam pembuka, `maksRiwayat` 30, `maxOutputTokens` 300.
  Terdaftar di `PROMPT_REGISTRY`.
* `core/http/sse.ts` — event penutup (`error`/`selesai`) ikut disimpan di cincin; sambung ulang
  ke sesi yang sudah tutup memutar ulang sisanya lalu menutup; `galat(…, tambahan)` untuk
  `degraded`/`retryAfterSeconds`; `flushHeaders` (lihat keputusan teknis 5).

**Modul `ai`**

* `services/cv-chat.service.ts` — `mulai`, `siapkan` (semua penolakan pra-aliran, JSON),
  `jalankan` (tidak pernah melempar; semua kegagalan jadi event `error`), `sambungUlang`.
* `services/cv-chat-aliran.ts` — registry aliran in-memory berplafon (200 serentak, retensi 60 dtk
  setelah selesai) — syarat masuk dari log PR-045.
* `controllers/cv-chat.controller.ts` + `createAiCvChatRouter` — tiga route `authenticated`.
* `services/ai-usage-export.service.ts` + `AiUsageRepository.listForExport` — U-05.

**Kontrak, konfigurasi, wiring**

* `@nawasena/schemas`: `aiCvChatRequestSchema`, `aiCvChatErrorEventSchema`, bentuk event
  terdokumentasi, `exportAiUsageSchema` + bagian `aiUsage`; OpenAPI tiga path baru.
* Kode error: `AI_SEDANG_MENJAWAB` (409), `AI_ALIRAN_TIDAK_ADA` (404), `AI_CHAT_DIMATIKAN` (503),
  `AI_CHAT_SIBUK` (503).
* Env: `AI_CV_CHAT_ENABLED` (tuas rollback, bawaan `true`); default model chat diganti.
* `boot.ts`: `createAiClient` (gateway, stream gateway, recorder `ai_usage`, cache di
  `redis.cache`) → modul ai; kontributor ekspor `aiUsage`.

**Test** — 35 baru: `ai-cv-chat.test.ts` (23), `ai-cv-chat-http.test.ts` (9),
`ai-gateway-jangkauan.test.ts` (3). Fixture ekspor (api ×5, api-client, e2e web) ditambah `aiUsage`.

### Keputusan teknis

1. **Dua fase dengan batas di header HTTP.** `siapkan` menolak sebagai JSON selama header belum
   terkirim; `jalankan` tidak pernah melempar karena errorHandler Express tidak bisa menulis ke
   respons yang sudah mengalir.
2. **Aliran tidak ikut mati saat klien pergi.** Jawaban tetap dibuat dan disimpan; event menumpuk
   di cincin SSE. Yang dijamin AC "putus → resume" adalah GILIRANNYA, bukan koneksinya.
3. **Pesan pengguna disimpan sebelum AI dipanggil.** Kuota habis atau provider tumbang tidak
   menghilangkan apa yang ditulis pengguna — ekstraksi PR-067 tetap membacanya.
4. **Token vs giliran.** Event `token` hanya pratinjau (teks mentah); event `giliran` membawa isi
   yang SUDAH dirapikan dan tersimpan. Klien mengganti pratinjau dengan `giliran`. Itulah yang
   membuat Gemini dan Groq tersimpan dengan format yang sama.
5. **`flushHeaders` — ditemukan oleh test, bukan penalaran.** `writeHead` Node menahan header
   sampai tulisan pertama; sambung ulang tanpa event untuk diputar membuat klien menunggu header
   sampai token berikutnya (test menggantung). Diperbaiki di `sse.ts` untuk semua pemakai.
6. **Degradasi dibedakan dari kegagalan.** Sebelum token pertama (kuota, AI tak tersedia) →
   `degraded: true`, klien beralih ke formulir. Sesudah token pertama → bukan degradasi, cukup
   kirim ulang. `AI_SAFETY_BLOCK` → bukan degradasi (permintaannya yang ditolak).
7. **`POST /ai/cv-chat/sessions` adalah tulis tanpa AI yang sah** — ia hanya bisa membuat satu
   sesi aktif dan satu salam, jadi tidak bisa menumbuhkan transkrip tanpa kuota.
8. **Tidak ada circuit breaker di jalur stream** (breaker PR-042 membungkus `AiProvider`, yang
   tidak punya `chatStream`). Konsekuensinya terukur di U-26.

### Verifikasi

* **Mutasi (tiga, semua merah, dipulihkan byte-identik via md5):** refund sesudah token pertama;
  pesan pengguna tidak dibungkus; `createAiGateway` dipanggil dari `modules/ai`.
* **Suite HTTP dijalankan 3× berturut-turut** — tidak flaky (soket & waktu nyata).
* **Provider nyata (manual, 2026-09-28):** dua giliran lewat service lengkap. Giliran 1: Gemini
  melewati 15 dtk → Groq menjawab (15,5 dtk total); giliran 2: Gemini 7,3 dtk. Satu pertanyaan per
  giliran, bahasa sederhana; `ai_usage` tercatat dengan provider, token, dan versi prompt.

### Risiko & temuan

* **Semua jalur AI mati di lingkungan nyata sebelum PR ini** — model bawaan `gemini-2.0-flash` dan
  `llama-3.3-70b-versatile` sudah 404, tanpa satu test pun merah (semuanya mock). Default diganti;
  `.env` lokal yang masih menyebut model lama tetap menimpa default dan harus diedit manual.
* **U-26 (baru):** token pertama Gemini stream 7–22 dtk.
* **U-27 (baru):** model embedding `text-embedding-004` juga hilang — milik PR-069.
* **Hipotesis yang dibatalkan:** sempat diduga Gemini membiarkan koneksi menggantung setelah
  bingkai akhir, dan perbaikannya sudah ditulis; pengukuran per potongan membuktikan yang lambat
  adalah waktu SEBELUM byte pertama. Perbaikannya dicabut sebelum commit.
* **Registry aliran & cincin SSE hidup di memori satu proses** — dua replika butuh sticky routing
  (PR-098); sambung ulang yang salah proses menerima 404 dan klien membaca transkrip.
* **Pesan pengguna tanpa jawaban** (kuota habis) tetap di transkrip; pesan berikutnya digabung
  dengannya saat dikirim ke model.
* **Ukuran PR ~2.300 baris** (±40% test), jauh di atas panduan 500 LOC — tiga utang ikut dibayar.

### Next steps

* **PR-067** — finalize + ekstraksi; pemakai `withDegradation` pertama (sisa U-06).
* **PR-068** — klien: fetch-SSE (bukan `EventSource`, sebab auth lewat header), ganti pratinjau
  `token` dengan isi `giliran`, beralih ke formulir saat `degraded: true`.
* **U-26** — putuskan timeout/urutan provider untuk chat setelah ada data latensi.

---

## PR-067 — Finalize + Ekstraksi Resume (Worker)

> **Phase:** [10 - AI CV Builder](../phase-10-ai-cv-builder.md#pr-067---finalize--ekstraksi-resume-worker)
> **Tanggal:** 2026-09-28
> **Status:** Selesai
> **Branch:** `pr-067-finalize-ekstraksi` → `phase-10-ai-cv-builder`

### Ringkasan hasil

Percakapan AI CV Builder kini bisa menjadi CV nyata. `POST /api/v1/ai/cv-chat/:session/finalize`
memotong satu jatah `cv_finalize`, memindahkan sesi `active → finalizing`, dan mengantre
`ai-extract-resume`; worker menjalankan `cv-extractor.v1` (JSON), memvalidasi hasilnya dengan
kontrak yang SAMA dengan jalur manual (`resumeContentInputSchema`), mengulang sekali dengan daftar
masalah bila gagal, lalu menyimpan draft `created_via: ai_chat` — atau mengembalikan sesi ke
`active` dengan penanda gagal. Kedua hasil diberitahukan lewat notifikasi.

### Keputusan owner (AskUserQuestion, 2026-09-28)

1. **Satu jatah per finalize**, dipotong API saat enqueue (habis → 429 ber-degradasi sebelum 202).
   Panggilan LLM di worker — termasuk retry-with-feedback — tidak memotong lagi; jatah pulang bila
   percobaan terakhir gagal karena provider.
2. **Gagal 2× → sesi kembali `active` + penanda gagal** (`extractionFailedAt`, `extractionError`),
   bukan status terminal. Pengguna bisa formulir manual, atau lanjut chat lalu finalize ulang.
3. **Notifikasi sukses DAN gagal**: `resume.draft_ai_siap`, `resume.draft_ai_gagal`.

### Scope selesai

* **Migrasi 17** — nilai enum `finalizing` (berkas sendiri: nilai enum baru tidak boleh dipakai di
  transaksi yang menambahkannya). **Migrasi 18** — `resume_id` (FK `SET NULL`),
  `extraction_failed_at`, `extraction_error`; indeks `satu_aktif` DIGANTI `satu_terbuka`
  (`status IN ('active','finalizing')`). Keduanya punya `down.sql` yang teruji di DB nyata.
* **`@nawasena/schemas`** — status `finalizing`; sesi + `resumeId`/`extractionFailedAt`/
  `extractionError`; `aiExtractResumeJobSchema` (membawa reservasi kuota); respons finalize;
  dua tipe notifikasi; OpenAPI path baru.
* **`core/ai`** — `AiCallContext.reservasi` (jatah milik pemanggil: tidak dipotong, tidak
  di-refund oleh `AiClient`); `rakitAiClient` — perakit BERSAMA `boot.ts` dan worker;
  prompt `cv-extractor.v1` (terdaftar di registry).
* **Modul `ai`** — `cv-finalize.service.ts` (API), `cv-ekstraksi.service.ts` (worker), repository:
  `mulaiFinalisasi`/`batalFinalisasi`/`selesaiFinalisasi`/`gagalFinalisasi`; registry aliran
  `sedangBerjalan`; route + controller finalize; `AI_SESI_SEDANG_DIFINALISASI`, `AI_SESI_KOSONG`.
* **Modul `resumes`** — `create(…, opsi?: { id })` untuk pemanggil internal (idempotensi draft).
* **Notifikasi** — template dua varian bahasa; tautan web (`/cv/:id` untuk siap, `/cv` untuk gagal).
* **Worker** — processor `ai-extract-resume`; `AiClient` + kuota + recorder dirakit;
  `@nawasena/api/core/ai` & `core/redis` diekspor untuk worker; koneksi baru ditutup saat shutdown.
* **Test** — 31 baru: `ai-cv-ekstraksi.test.ts` (14), `ai-cv-finalize-http.test.ts` (9),
  `ai-cv-finalize-db.test.ts` (8) + web tautan (1); helper `chat-sessions-memori.ts` kini dipakai
  bersama tiga berkas test.

### Keputusan teknis

1. **Validasi kontrak CV DI SERVICE, bukan di adapter.** Skema template `cv-extractor.v1` hanya
   `z.unknown()` (JSON sah), sebab `chatJson` hanya melaporkan ringkasan jalur saat gagal —
   retry-with-feedback butuh daftar masalah lengkap. Satu-satunya jalan ke `resumes.create`
   melewati `safeParse` yang sukses (mutasi: melewatinya → 4 test merah).
2. **Keluaran bukan-JSON = keluaran rusak**, masuk jalur perbaikan — bukan provider tumbang.
3. **Kontak TIDAK diekstrak** — dibuang dari keluaran model sebelum validasi. Terbukti di
   verifikasi nyata: nomor HP yang diucapkan pengguna tidak masuk draft.
4. **Id draft = id sesi.** Retry setelah draft tersimpan tetapi sebelum sesi ditandai menemukan
   draft itu, bukan membuat yang kedua.
5. **Pemeriksaan gratis sebelum kuota** (sesi, aliran berjalan, isi, batas CV). Mutasi: memotong
   kuota lebih dulu → 5 test merah.
6. **Antrean menolak → finalize tidak pernah dimulai**: sesi `active` TANPA jejak gagal, jatah
   pulang.
7. **Percobaan terakhir menentukan nasib kegagalan provider** — sebelum itu dilempar untuk retry
   BullMQ di atas jatah yang sama; pada yang terakhir: refund + penanda gagal + notifikasi.
   Kegagalan tak terduga ditandai gagal dulu (sesi tak tersangkut `finalizing`) lalu dilempar ke DLQ.
8. **`rakitAiClient` MENGETATKAN penjaga U-07**: `boot.ts` tidak lagi memanggil pabrik provider;
   satu-satunya pemanggil sah adalah `core/ai`.
9. **Sesi `finalizing` terhitung "terbuka"** — "mulai" mengembalikannya; retensi `abandoned`
   menjangkaunya bila tersangkut.

### Verifikasi

* Lint 9/9, typecheck 9/9, `check:openapi` sinkron; suite penuh — lihat angka di PR.
* **Mutasi (tiga, semua merah, dipulihkan md5):** tanpa retry; tanpa validasi skema; kuota sebelum
  pemeriksaan gratis.
* **`down.sql` migrasi 17 salah pada tulisan pertama** — CHECK dan indeks parsial menyebut tipe
  enum lama sehingga `ALTER COLUMN … TYPE` gagal. Ditemukan test DB, diperbaiki sebelum commit.
* **Provider nyata:** transkrip 6 giliran → draft valid pada percobaan pertama (~5 dtk, Groq
  menjawab), `ai_usage` tercatat `cv-extractor.v1`. Pengguna menyebut "Saya juga Tuli, pakai
  BISINDO" dan nomor HP-nya — keduanya TIDAK muncul di draft.

### Risiko & temuan

* **Worker tidak punya test end-to-end** (`--passWithNoTests`) — processor dibuat sesempit
  mungkin; seluruh logika di service api yang teruji.
* **Latensi Gemini (U-26)** juga berlaku di sini; ekstraksi jatuh ke Groq setelah 15 dtk. Timeout
  queue 60 dtk masih cukup untuk dua percobaan.
* **Transkrip sampai ke cache prompt Redis** (lingkup per pengguna, TTL 1 jam, plafon 24 jam).
  Sama sifatnya dengan template lain; purge akun tidak menjangkau Redis (catatan PR-044b).
* **Tautan notifikasi gagal ke `/cv`** sementara — halaman chat dengan transkrip lahir di PR-068.

### Next steps

* **PR-068** — UI: tombol "Selesai dan buat draf CV", poll status, jalur manual dengan transkrip
  terlampir saat `extractionFailedAt`, ubah tautan notifikasi gagal ke halaman chat; putuskan nasib
  `withDegradation` (sisa U-06).

---

## PR-068 — Chat FE — useAiStream + Fallback UX

> **Phase:** [10 - AI CV Builder](../phase-10-ai-cv-builder.md#pr-068---chat-fe--useaistream--fallback-ux)
> **Tanggal:** 2026-09-29
> **Status:** Selesai (dua AC manual → U-28)
> **Branch:** `pr-068-chat-fe` → `phase-10-ai-cv-builder`

### Ringkasan hasil

AI CV Builder kini bisa dipakai dari web: halaman `/cv/chat` dengan jawaban yang mengalir,
diumumkan pembaca layar per kalimat tanpa memindahkan fokus, sambung ulang otomatis saat
koneksi putus, sisa kuota, finalize → draft, dan jalur formulir yang muncul DI TEMPAT saat AI
tidak bisa dipakai. `/cv` kini menawarkan dua pintu setara: "Buat dengan chat AI" dan
"Buat CV dari profil".

### Keputusan owner (AskUserQuestion, 2026-09-29)

1. **aria-live per kalimat** — token ditampung, kalimat utuh diumumkan (mitigasi risiko "SR
   berisik" di dokumen phase).
2. **Degradasi beralih di tempat** — kotak ketik hilang, pesan jujur + tombol "Isi CV lewat
   formulir", transkrip tetap terlihat; TANPA navigasi otomatis.
3. **Pintu masuk `/cv` + rute `/cv/chat`**; tautan notifikasi `resume.draft_ai_gagal` kini ke
   `/cv/chat`.

### Scope selesai

* **`@nawasena/api-client`** — `uraiSse` (pengurai SSE bebas DOM, dipakai ulang mobile);
  `ApiClient.stream?()` (auth + refresh-401 sebelum badan dibaca; non-2xx → `ApiError`); endpoint
  `getAiQuota`, `startAiChatSession`, `getAiChatSession`, `finalizeAiChatSession`, `streamAiChat`,
  `resumeAiChatStream`, `aiKeys`.
* **`features/cv-chat`** — `createPenampungKalimat` (murni), `useAiStream` (mesin keadaan
  diam/mengirim/mengetik/menyambung; sambung ulang 3× berjeda 1/2/4 dtk; 404 → muat ulang
  transkrip).
* **`features/resume/use-buat-cv.ts`** — "buat CV dari profil" diekstrak dari `/cv`, dipakai
  juga oleh mode formulir chat.
* **`routes/cv-chat.tsx`** + rute lazy; katalog `resume.chat.*` (dua varian bahasa).
* **Test** — `cv-chat-aliran.test.ts` (9), api-client `ai-stream.test.ts` (8), e2e
  `cv-chat.spec.ts` (6), tautan notifikasi; `/cv/chat` masuk registry halaman (gerbang axe).
* **Checklist manual** — [pr-068-nvda-checklist.md](pr-068-nvda-checklist.md).

### Keputusan teknis

1. **fetch-SSE, bukan `EventSource`** — token hanya boleh lewat header `Authorization`.
2. **`ApiClient.stream` OPSIONAL** — puluhan klien palsu di test hanya punya `request`; endpoint
   yang butuh aliran menolak dengan `ApiError` yang bisa dibacakan, bukan `TypeError`.
3. **Satu wilayah live, selalu ada di DOM**, `aria-atomic="false"`, dikosongkan per giliran —
   kalimat ditambahkan sebagai anak baru supaya dibaca berurutan, tidak saling menimpa.
4. **Pratinjau yang mengalir `aria-hidden`** — isinya sudah diumumkan per kalimat dan akan
   diganti giliran tersimpan (versi rapi server); tanpa itu pembaca layar membacanya dua kali.
5. **Tombol kirim/finalize memakai `aria-disabled`, bukan `disabled`** — tombol yang menjadi
   `disabled` saat difokus menjatuhkan fokus ke `<body>`. Fokus dikembalikan ke kotak ketik.
6. **Teks model dirender sebagai children React** (teks murni) — tidak ada jalur HTML.
7. **Poll hasil finalize memakai GET sesi**, bukan POST sessions — sesudah `finalized`, POST
   akan melahirkan sesi baru.
8. **Penampung kalimat mengenali penutup markdown** (`!**`) — ditemukan test pertama.

### Verifikasi

* Web 710, api-client 125, ui 188, schemas 100 — lulus; Playwright **115/115** (termasuk axe
  `/cv/chat`); anggaran bundle awal 115/200 KB; lint & typecheck hijau.
* **Mutasi (dua, merah, dipulihkan md5):** umumkan per token (2 merah); tanpa sambung ulang
  (3 merah).

### Risiko & utang

* **U-28 (baru):** NVDA nyata dan Slow 3G belum diuji manusia — checklist tersedia.
* **U-06 (sisa):** `withDegradation` bukan milik jalur CV; pemakai alami PR-072.
* **U-26:** latensi Gemini terasa langsung di UI ("sedang mengetik" bisa ~15 dtk sebelum Groq
  menjawab).

### Next steps

* **Exit Phase 10** — seluruh PR-065..068 merged; AC manual tersisa U-24/U-28. Merge
  `phase-10 → main` hanya atas perintah owner.

---

## PR-068b — Batas token-pertama jalur stream (utang U-26)

> **Phase:** [10 - AI CV Builder](../phase-10-ai-cv-builder.md)
> **Tanggal:** 2026-09-29
> **Status:** Selesai
> **Branch:** `pr-068b-batas-token-pertama` → `phase-10-ai-cv-builder`

### Ringkasan hasil

Pengguna chat tidak lagi menunggu hingga 15 detik layar diam saat Gemini sedang lambat. Router
stream membatalkan permintaan ke Gemini bila BELUM ada satu token pun dalam
`AI_STREAM_FIRST_TOKEN_MS` (bawaan 8 dtk) dan meneruskannya ke Groq. Keputusan owner 2026-09-29
(dari tiga opsi: batas token-pertama / Groq utama / biarkan).

### Data yang mendasarinya

Pengukuran 2026-09-29 (3× per model, prompt `cv-interviewer.v1` nyata): `gemini-3.5-flash-lite`
0,8–1,1 dtk; `gemini-flash-lite-latest` 0,7–0,9 dtk; `gemini-3.1-flash-lite` 1,9–2,3 dtk;
`gemini-3.5-flash` timeout 40 dtk (2 dari 3); Groq `qwen/qwen3.8-27b` 0,2–0,3 dtk. Kemarin model
default yang sama butuh 7–22 dtk — latensinya melonjak menurut waktu. Batas yang mengukur "berapa
lama layar diam" menangani lonjakan itu tanpa meninggalkan Gemini saat ia normal.

### Keputusan teknis

1. **Batas token-pertama ≠ timeout provider.** Timeout (15 dtk) mengukur seluruh permintaan;
   batas ini hanya berlaku SEBELUM token pertama dan hanya bila ada cadangan.
2. **Fetch utama DIBATALKAN, bukan diabaikan** — `OpsiStream.signal` baru diteruskan adapter ke
   `fetch` lewat `AbortSignal.any([timeout, signal])`; tanpa itu koneksinya menggantung sampai
   timeout penuh.
3. **Penjadwal disuntik** (aturan repo, tanpa fake timer).
4. **Env `AI_STREAM_FIRST_TOKEN_MS`** 1.000–60.000, bawaan 8.000 — di atas normal (~1 dtk), jauh
   di bawah lonjakan.

### Verifikasi

* `ai-stream-token-pertama.test.ts` (5): diam → batal + cadangan; cepat → tanpa cadangan &
  penjadwal dihentikan; gagal sesudah token pertama tetap galat; tanpa cadangan tanpa batas;
  adapter Gemini benar-benar membatalkan fetch-nya.
* Provider nyata: Gemini lambat (batas 1 dtk) → Groq menjawab 1,3 dtk; Gemini normal (batas 8 dtk)
  → Gemini sendiri 0,6 dtk.
* Juga di sesi ini: `.env` lokal berisi `GEMINI_CHAT_MODEL=` KOSONG yang membuat boot API gagal
  ("tidak boleh kosong bila diisi"); barisnya dihapus sehingga default baru berlaku (berkas tidak
  dilacak git).

---

## PR-068c — Verifikasi NVDA nyata & jaringan untuk U-24/U-28

> **Tanggal:** 2026-09-29
> **Status:** Selesai (utang dibayar sebagian)
> **Branch:** `pr-068c-verifikasi-manual` → `phase-10-ai-cv-builder`

### Ringkasan hasil

AC manual yang terbuka (U-24 dari Phase 09, U-28) dijalankan dengan **NVDA sungguhan** terhadap
**stack nyata**. Stack itu terdiri dari API, worker PDF, MinIO, dan Gemini/Groq asli. Harness-nya
ada di `apps/web/verifikasi/` dan tidak dijalankan CI (khusus Windows dan butuh NVDA). Hasil per
kotak ada di tiga checklist (PR-061, PR-063, PR-068). Status utang ada di U-24/U-28.

### Keputusan teknis

1. **Yang dibaca adalah log ucapan NVDA, bukan pohon aksesibilitas.** NVDA berjalan dengan folder
   konfigurasi sementara, synth `silence`, dan log level IO. Konfigurasi milik pengguna tidak
   disentuh.
2. **Putus-sambung dibuat deterministik di atas server nyata.** Respons POST asli diambil utuh,
   lalu browser hanya menerima 2 event pertama dan jaringan dimatikan 2,5 dtk. Throttling CDP
   tidak memotong aliran secara andal.
3. **Tombol tingkat OS (perintah NVDA) dijaga judul jendela.** `tekanTombolOs` menolak mengirim
   bila jendela di depan bukan jendela uji. Penjaga ini lahir dari kejadian nyata: run pertama
   tanpa penjaga mengirim Ctrl+Home dan panah bawah ke File Explorer pengguna. Tombolnya hanya
   navigasi dan tidak mengubah apa pun.
4. **Adobe diganti dua bukti** (keputusan owner): pohon struktur PDF (`struktur-pdf.py`) dan NVDA
   di penampil PDF Chrome.

### Risiko / batasan

* **NVDA membaca jendela yang sedang di depan.** Di desktop yang sedang dipakai, fokus OS bisa
  berpindah dan log ikut mencatat isi jendela lain. Log dan laporan run seperti itu **dihapus**,
  bukan disimpan. Laporan harness tidak pernah di-commit. Jalankan hanya saat desktop tidak dipakai.
* Harness menuntut token akses user uji yang ditandatangani kunci server lokal. Hanya
  `/auth/refresh` yang dipalsukan.

### Next steps

* U-24: navigasi heading PDF di Adobe; langkah editor di dalam bagian (desktop yang tidak dipakai).
* U-28: pintu masuk, kuota/degradasi, finalize, putus lama, tampilan sempit. Sisanya manual.
