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
