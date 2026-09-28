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
benar-benar berjalan. `@nawasena/schemas` 100 lulus, `@nawasena/worker` 3 lulus.

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
jadi berkas tanpa bagian ini memang harus merah).

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
