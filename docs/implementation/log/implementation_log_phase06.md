# Implementation Log — Phase 06 (AI Gateway)

> Catatan per PR yang selesai di Phase 06. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---

## PR-041 — Gateway Core + Adapter Gemini

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md#pr-041---gateway-core--adapter-gemini)
> **Tanggal:** 2026-08-28
> **Status:** Selesai

### Ringkasan hasil

Fondasi seluruh fitur AI lahir sebagai satu modul terisolasi: `apps/api/src/core/ai/`.
Interface provider-agnostic `AiProvider` (`chat`, `chatJson<T>`, `embed`) plus adapter
Gemini untuk chat, JSON mode, dan embedding 768 dimensi (`text-embedding-004`) — semuanya
di belakang gerbang yang sudah disiapkan `boundaries.cjs` sejak PR-002 (ADR-012). Tidak
ada perubahan DB, API, atau frontend; modul ini belum punya satu pun consumer dengan
sengaja — `boot.ts`/`index.ts` tidak disentuh, supaya gerbang boot fail-fast Prisma
(§5.6) tetap utuh.

Keputusan paling menentukan PR ini: adapter dibangun dengan `fetch` mentah yang
di-inject lewat tipe `FetchLike`, **bukan** SDK `@google/generative-ai`, mengikuti pola
yang sudah ada di `fonnte.sender.ts` dan `google-token.ts`. Repo ini tidak punya
infrastruktur mock HTTP (tidak ada msw/nock) — mengikuti pola DI + `vi.fn()` yang sudah
terbukti membuat adapter bisa diuji tanpa dependensi baru dan tanpa mekanisme mocking
baru, sekaligus menghindari ketidakpastian versi SDK yang tidak pernah dipatok di repo.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api`
69 berkas / **740 lulus** (144 skip tak terkait, Docker tidak aktif di lingkungan
verifikasi), `@nawasena/web` 559/559, plus 5 workspace lain hijau. QC dua iterasi:
iterasi pertama PASS dengan satu catatan non-blocking (cabang `finishReason` yang tidak
diuji berisiko mengembalikan sukses-kosong-senyap untuk kode blokir Gemini di luar
`SAFETY`); iterasi kedua menutup catatan itu dan PASS bersih.

### Scope selesai

* **`apps/api/src/core/ai/types.ts`** — `AiProvider` interface, tipe request/response
  chat/json/embed, `FetchLike` lokal (sengaja tidak diimpor lintas modul), union
  `AiErrorCode` (`AI_RATE_LIMIT`, `AI_PROVIDER_UNAVAILABLE`, `AI_SAFETY_BLOCK`,
  `AI_TIMEOUT`, `AI_NETWORK_ERROR`, `AI_INVALID_OUTPUT`, `AI_NOT_CONFIGURED`), kelas
  `AiProviderError extends Error` (`code`, `provider`, `status?`) — pola diambil dari
  `OtpSenderError`.
* **`apps/api/src/core/ai/providers/gemini.ts`** — `createGeminiProvider(config,
  fetchImpl?)`. Panggilan REST ke `{base}/v1beta/models/{model}:generateContent`
  (chat/json) dan `:embedContent` (embed). Pemetaan status: 429→`AI_RATE_LIMIT`,
  5xx→`AI_PROVIDER_UNAVAILABLE`; klasifikasi `finishReason`/`blockReason`→
  `AI_SAFETY_BLOCK`; abort/timeout→`AI_TIMEOUT`; galat jaringan lain→`AI_NETWORK_ERROR`.
  JSON mode: `JSON.parse` lalu `schema.safeParse`; kegagalan salah satu →
  `AI_INVALID_OUTPUT` dengan detail berupa path/jumlah isu zod saja, tidak pernah teks
  mentah model.
* **`apps/api/src/core/ai/gateway.ts`** — `createAiGateway(env, logger, fetchImpl?)`;
  bila `GEMINI_API_KEY` tidak diset, mengembalikan provider "tidak tersedia" yang
  setiap panggilannya menolak `AI_NOT_CONFIGURED` (boot tidak pernah gagal karena kunci
  yang belum ada — pola sama dengan `createUnavailableOtpSender`).
* **`apps/api/src/core/ai/index.ts`** — barrel modul, mengikuti konvensi `core/config`,
  `core/audit`, `core/logger`. Sengaja **tidak** meng-ekspor ulang adapter Gemini, supaya
  tidak ada jalur untuk melewati gateway dari dalam pohon modul sendiri.
* **`apps/api/src/core/config/env.ts`** (+32 baris) — lima var baru: `GEMINI_API_KEY`
  (opsional), `GEMINI_CHAT_MODEL` (default `gemini-2.0-flash`), `GEMINI_EMBED_MODEL`
  (default `text-embedding-004`), `GEMINI_BASE_URL`, `GEMINI_TIMEOUT_MS` (1000–60000,
  default 15000). Satu secret saja, tidak perlu entri `GRUP_KREDENSIAL`.
* **`apps/api/.env.example`** (+18 baris) — blok komentar yang sama, gaya sama dengan
  blok Google/Fonnte yang sudah ada.
* **Test (36 test, dua berkas):** `apps/api/__tests__/ai-gemini-provider.test.ts` (29
  test — chat, JSON mode, taksonomi error, timeout, no-leak) dan
  `apps/api/__tests__/ai-gateway.test.ts` (4 test — jalur "tidak dikonfigurasi").

### Keputusan teknis

* **D1 — Taksonomi error `AiProviderError` (7 kode).** `AI_RATE_LIMIT` (429),
  `AI_PROVIDER_UNAVAILABLE` (5xx), `AI_SAFETY_BLOCK`, `AI_TIMEOUT`,
  `AI_NETWORK_ERROR`, `AI_INVALID_OUTPUT`, `AI_NOT_CONFIGURED` — bukan satu error
  generik. AC-4 menuntut minimal tiga kelas berbeda; tujuh kode memberi setiap
  konsumen (PR-042 router, PR-043 kuota, PR-046 degradasi) sinyal yang cukup spesifik
  untuk memutuskan retry vs fail-fast tanpa membaca pesan bebas teks.

* **D2 — Klasifikasi `finishReason` lewat dua himpunan bernama, bukan literal
  tunggal.** `SELESAI_WAJAR` = {STOP, MAX_TOKENS}; `SELESAI_DITAHAN` = {SAFETY,
  RECITATION, LANGUAGE, BLOCKLIST, PROHIBITED_CONTENT, SPII, IMAGE_SAFETY} — seluruh
  nilai blokir asli `Candidate.FinishReason` Gemini → `AI_SAFETY_BLOCK`. Alasan yang
  tidak dikenal (`OTHER`, `FINISH_REASON_UNSPECIFIED`, nilai masa depan) →
  `AI_INVALID_OUTPUT`, **bukan** sukses dengan teks kosong. Ini perbaikan atas temuan
  QC iterasi pertama: literal `=== "SAFETY"` awalnya membiarkan lima nilai blokir lain
  lolos sebagai `{text: ""}` — kegagalan senyap yang lebih buruk daripada error
  terkode, karena pemanggil tidak tahu ia harus menangani apa pun.

* **D3 — Kunci API di header `x-goog-api-key`, tidak pernah di `?key=` query param.**
  Plan tidak menentukan pola ini secara eksplisit; dipilih karena URL sampai ke log
  akses/riwayat proxy sedangkan header tidak. Diuji eksplisit (AC-8).

* **D4 — Badan galat provider tidak pernah dibaca pada respons non-OK.** Status HTTP
  saja sudah cukup untuk klasifikasi (429/5xx); membaca body berarti berisiko
  meneruskan apa pun yang ada di dalamnya ke pemanggil lewat pesan error. Alasan
  blokir yang memang perlu dibaca (`blockReason`, `finishReason`) disaring lewat
  `alasanBlokir()`, regex `^[A-Z_]{1,40}$`, jatuh ke `TIDAK_DIKETAHUI` bila tidak
  cocok — teks bebas dari provider tidak pernah menjadi bagian pesan error.

* **D5 — `GEMINI_API_KEY` opsional, empat var lain ber-default.** Boot dev/CI tanpa
  kunci tetap jalan; gateway turun anggun ke `AI_NOT_CONFIGURED` alih-alih membuat
  seluruh proses gagal start. Mengikuti pola deny-by-default kredensial opsional lain
  di `env.ts` (Fonnte, Twilio).

* **D6 — Tidak ada consumer di PR ini.** `core/ai` sengaja tidak di-wire ke
  `boot.ts`/`index.ts` — tidak ada fitur yang memanggilnya, dan menyambungkannya lebih
  awal hanya menambah permukaan tanpa manfaat. Menjaga gerbang boot Prisma (§5.6, larangan
  impor statis yang menyentuh `@prisma/client` di `index.ts`) tetap sesuai bentuknya.

### Utang yang SENGAJA ditinggalkan

* **Test lama "batas tunggu bisa ditimpa per panggilan" tetap vakum sebagian** —
  hanya memeriksa `signal instanceof AbortSignal`, bukan bahwa nilai override
  sungguhan terpakai. Bukan dihapus/ditulis ulang (test lama tetap lulus), melainkan
  ditambah saudara baru yang mem-spy `AbortSignal.timeout` dan membuktikan nilai
  1234ms benar-benar dipakai, bukan 2000ms default. Test lama dibiarkan sebagai
  duplikat tak berbahaya.
* **`createUnavailableAiGateway` dan `AI_ERROR_MESSAGES` di-ekspor dari `index.ts`
  tanpa consumer eksternal hari ini.** Disiapkan sebagai seam untuk PR-046
  (`ERROR_CATALOG`); bila PR-046 ternyata tidak memakainya, keduanya harus
  di-un-export saat itu, bukan dibiarkan sebagai ekspor mati.
* **Ukuran sumber ~520 LOC vs panduan <500 LOC (CLAUDE.md §9).** Didorong kepadatan
  komentar (~45%) yang menjelaskan keputusan (mengapa, bukan bagaimana) — baris
  eksekusi jauh di bawah batas. Ditandai, bukan dipangkas.

### Verifikasi

* **AC-1/AC-2 (chat/embed)** — diuji terhadap fixture berskema REST Gemini asli
  (`candidates[].content.parts[].text`, `usageMetadata`, `embedding.values`); embed
  diuji sampai panjang vektor `=== 768`, tanpa pad/truncate diam-diam pada panjang
  salah.
* **AC-3 (JSON mode)** — tiga kasus: gagal validasi zod, teks non-JSON, dan JSON
  berpagar ```` ```json ```` — ketiganya `AI_INVALID_OUTPUT`, tidak ada exception
  mentah yang lolos.
* **AC-4 (taksonomi ≥3 kelas)** — fixture bentuk nyata `{error:{code,status}}` untuk
  429/503, plus `promptFeedback.blockReason` dan lima nilai `finishReason` blokir
  (`it.each`) untuk kelas ketiga. **Mutation test dijalankan sungguhan** (bukan hanya
  diklaim): mematikan klasifikasi `finishReason` membuat 8 dari test yang menguji jalur
  itu merah, membuktikan cabangnya benar-benar diperiksa.
* **AC-5 (timeout)** — `AbortSignal.timeout` sungguhan (bukan fake timer, yang tidak
  dihormati API ini), plus spy yang membuktikan nilai `timeoutMs` per panggilan
  benar-benar diteruskan, bukan sekadar ada.
* **AC-6 (boundary lint)** — diverifikasi **empiris**, bukan dengan membaca kode:
  QC menanam berkas probe yang meng-impor `@google/generative-ai` di
  `modules/users/services/`, menjalankan eslint, mendapat galat
  `boundaries/external`, lalu menghapus probe-nya.
* **AC-7 (contract test vs skema realistis)** — kedua berkas test memakai fixture yang
  mengikuti struktur REST Gemini asli, bukan struktur yang disederhanakan.
* **AC-8 (tidak membocorkan payload)** — diuji dengan penanda unik yang disisipkan ke
  body error mentah *dan* ke teks kandidat; pesan error yang dilempar dipastikan tidak
  memuat penanda itu, ditambah pemeriksaan eksplisit bahwa kunci API dan teks prompt
  pengguna tidak pernah muncul di pesan error.

### Risiko yang ditemukan

* **Cabang `finishReason === "SAFETY"` awalnya tidak teruji** (temuan QC iterasi 1):
  seluruh fixture memakai `"STOP"`, sehingga lima nilai blokir lain Gemini
  (`PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION`, dan `SAFETY` sendiri di
  luar jalur `promptFeedback`) jatuh ke `bacaTeks()` dan kembali sebagai `{text: ""}`
  — sukses semu. Diperbaiki dengan dua himpunan bernama (D2) + 9 test baru; QC iterasi
  2 memverifikasi lewat mutation test bahwa perbaikannya benar-benar dipakai kode, bukan
  hanya ditambahkan di sebelah kode lama.
* **`GEMINI_BASE_URL` tidak punya allow-list host**, hanya validasi `.url()`. SSRF
  teoretis bila env operator pernah dikuasai penyerang — tidak ada input pengguna yang
  mencapai variabel ini di PR manapun sampai sekarang, konsisten dengan pola
  `FONNTE_BASE_URL`/`TWILIO_BASE_URL` yang sudah ada. Dicatat sebagai report-only oleh
  security review, bukan temuan blocking.
* **`AiProviderError` belum dipetakan ke `ERROR_CATALOG`** — tidak relevan hari ini
  karena PR ini tidak menambah route; pemetaannya adalah tugas PR-046.
* **Docker tidak aktif di lingkungan verifikasi** — 144 test skip pra-ada (integrasi
  DB/Redis) tidak terpengaruh PR ini; kedua berkas test AI baru berjalan tanpa
  DB/Redis dan tidak menambah jumlah skip.

### Next steps

* **PR-042** — Adapter Groq + router + circuit breaker; menggantikan isi
  `gateway.ts` dengan router+breaker tanpa mengubah bentuk yang sudah diekspor.
  Rekomendasi QC: tambah fixture `finishReason: "SAFETY"` eksplisit bila belum
  sepenuhnya tercakup dari sisi router.
* **PR-043** — Quota engine + `ai_usage` + `GET /ai/quota`.
* **PR-044** — Prompt registry + cache semantik + injection guard.
* **PR-045** — SSE streaming (`chatStream`).
* **PR-046** — Kontrak degradasi baku; tempat `AiProviderError` akhirnya dipetakan
  ke `ERROR_CATALOG`, dan tempat yang tepat memutuskan nasib
  `createUnavailableAiGateway`/`AI_ERROR_MESSAGES` bila tidak jadi dipakai.
