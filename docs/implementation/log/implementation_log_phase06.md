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
  * **LUNAS 2026-09-05, satu PR sesudah PR-046 — dan keterlambatan itu adalah
    bagian dari catatannya.** PR-046 memetakan degradasi lewat `DegradedError` +
    `ERROR_CATALOG`, jadi seam ini tidak terpakai dan syarat pencabutannya
    terpicu. PR-046 sendiri TIDAK menjalankannya: implementer, QC, maupun closer
    tidak memeriksa syarat yang ditulis PR sebelumnya. Terjaring baru saat
    audit utang phase 05–06 diminta owner. **Pelajarannya bukan "lebih teliti"
    melainkan bahwa syarat bersyarat yang hanya hidup di prosa log tidak punya
    penagih.** Yang menagihnya hari ini tetap prosa (komentar di `index.ts`);
    seam berikutnya sebaiknya lahir dengan test yang merah bila syaratnya
    terpicu, bukan dengan kalimat.
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

---

## PR-042 — Adapter Groq + Router + Circuit Breaker

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md#pr-042---adapter-groq--router--circuit-breaker)
> **Tanggal:** 2026-08-31
> **Status:** Selesai

### Ringkasan hasil

`gateway.ts` sekarang merangkai dua provider (Gemini + Groq) lewat router dan circuit
breaker per provider, tanpa mengubah bentuk publik (`createAiGateway`, `AiGatewayEnv`,
`createUnavailableAiGateway`). Adapter Groq mengikuti disiplin PR-041: `fetch` mentah +
`FetchLike` di-inject, tanpa `groq-sdk`. Kebijakan failover dipisah per kapabilitas —
chat/chatJson boleh berpindah provider, embed tidak pernah. `core/ai` tetap tanpa
consumer (`boot.ts`/`index.ts` tidak disentuh).

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api`
72 berkas / **796 lulus** (144 skip pra-ada, tak terkait, Docker tidak aktif di
lingkungan verifikasi). QC satu iterasi, PASS bersih, tanpa Required Fixes.

### Scope selesai

* **`apps/api/src/core/ai/providers/groq.ts`** — `createGroqProvider`, kontrak REST
  `POST {base}/openai/v1/chat/completions`, `Authorization: Bearer`, JSON mode via
  `response_format:{type:"json_object"}`. `embed()` melempar `AI_PROVIDER_UNAVAILABLE`
  langsung — Groq tidak punya endpoint embedding.
* **`apps/api/src/core/ai/breaker.ts`** — `createCircuitBreaker` per provider: 5 galat
  berturut-turut membuka sirkuit, jendela 60 detik, lalu satu probe half-open;
  `clock?: () => Date` di-inject (bukan fake timer, konvensi repo).
* **`apps/api/src/core/ai/router.ts`** — `AiRouterDeps` (`primary`, `fallback`,
  `forceProvider?`), mengimplementasikan `AiProvider`. Set `KODE_ALIH` membatasi kode
  yang memicu failover/breaker ke empat sinyal kesehatan saja.
* **`apps/api/src/core/ai/gateway.ts`** — membangun kedua provider (kunci kosong →
  stand-in `createBelumDikonfigurasi`), membungkusnya dalam router.
* **`apps/api/src/core/config/env.ts`** + **`.env.example`** — `GROQ_API_KEY`
  (opsional), `GROQ_BASE_URL` (default `https://api.groq.com`), `GROQ_CHAT_MODEL`
  (default `llama-3.3-70b-versatile`), `GROQ_TIMEOUT_MS`, `AI_ROUTER_FORCE_PROVIDER`
  (`z.enum(["gemini","groq"])`, opsional).
* **Test (51 test, tiga berkas baru):** `ai-groq-provider.test.ts` (22),
  `ai-router.test.ts` (19 + 1 tambahan QC = 20), `ai-breaker.test.ts` (10);
  `ai-gateway.test.ts` diperluas untuk env dua-kunci dan jalur paksa provider.

### Keputusan teknis

* **D1 — Adapter Groq `fetch` mentah + `FetchLike` di-inject, tanpa `groq-sdk`,
  mencerminkan pola `gemini.ts`.** Kontrak REST diverifikasi terhadap dokumentasi
  resmi Groq: `POST https://api.groq.com/openai/v1/chat/completions`, auth
  `Authorization: Bearer`, JSON mode lewat `response_format:{type:"json_object"}`.
  Bentuk badan galat Groq tidak terdokumentasi, sehingga ditangani defensif dan
  tidak pernah dibaca (`groq.ts:127-133`).
* **D2 — Kebijakan failover per kapabilitas: chat/chatJson jatuh ke Groq, embed
  TIDAK PERNAH.** Groq memang tidak punya endpoint embedding, dan vektor dari ruang
  berbeda akan meracuni kemiripan pgvector (ADR-003). `embed()` melempar
  `AiProviderError` terkendali agar job BullMQ pemanggil bisa retry lewat kebijakan
  antreannya sendiri, bukan diam-diam pindah provider.
* **D3 — Failover hanya pada sinyal kesehatan provider** (`AI_RATE_LIMIT`,
  `AI_PROVIDER_UNAVAILABLE`, `AI_TIMEOUT`, `AI_NETWORK_ERROR`), **tidak pernah**
  pada `AI_SAFETY_BLOCK` / `AI_INVALID_OUTPUT` / `AI_NOT_CONFIGURED` — dua yang
  pertama adalah penilaian isi, bukan sinyal kesehatan; mengalihkannya akan mencuci
  vonis keamanan lewat provider lain (model berbeda, filter berbeda).
* **D4 — Breaker per provider: 5 galat berturut-turut membuka, jendela 60 detik,
  lalu tepat satu probe half-open;** probe sukses menutup, probe gagal membuka
  ulang dengan jendela baru. State in-process per replika (**bukan Redis**) —
  konsekuensinya dicatat sebagai risiko: dengan 2 replika, tiap replika belajar
  sendiri (§11 CLAUDE.md).
* **D5 — Waktu lewat `clock?: () => Date` yang di-inject** (konvensi ~12 service di
  repo ini), bukan fake timer — `AbortSignal.timeout` tidak menghormati
  `vi.useFakeTimers()`.
* **D6 — `AI_ROUTER_FORCE_PROVIDER` (enum tertutup `gemini`/`groq`)** sebagai tuas
  rollback ke satu provider tunggal, melewati breaker dan fallback sekaligus.
* **D7 — Provider yang benar-benar melayani dilaporkan per panggilan** (`response.
  provider`) — hook yang dikonsumsi perekam `ai_usage` di PR-043.
* **D8 — Saat fallback ikut gagal, pemanggil melihat galat PRIMARY**, bukan galat
  fallback (mis. `AI_NOT_CONFIGURED` dari Groq yang belum diisi kuncinya) — sebab
  sebenarnya adalah padamnya provider utama; QC menerima aturan ini (lihat Risiko).

### Verifikasi

* AC-1 (Gemini 429/5xx → Groq): `ai-router.test.ts` (429/500/503 + AI_TIMEOUT/
  AI_NETWORK_ERROR, chat dan chatJson).
* AC-2 (breaker 5-galat/60s/satu probe): `ai-breaker.test.ts` (10 test) + level
  router; QC menjalankan probe konkurensi langsung (skrip tsx, bukan dari laporan)
  membuktikan tepat satu probe diterima.
* AC-3 (embed tidak pernah fallback): `ai-router.test.ts` — galat Gemini diteruskan
  apa adanya, Groq tidak pernah disentuh.
* AC-4 (provider yang melayani dilaporkan): blok AC-4/AC-5 (jalur fallback) + blok
  `AI_ROUTER_FORCE_PROVIDER` (jalur paksa).
* AC-5 (bentuk respons dinormalisasi): uji diff `Object.keys` — hanya
  `text|data|usage|provider|model` yang melintasi adapter, tidak ada
  `choices`/`finish_reason` bocor.
* Mutation test sungguhan (bukan hanya diklaim): threshold off-by-one pada breaker
  → 4 test merah; menambahkan `AI_SAFETY_BLOCK` ke `KODE_ALIH` → 2 test merah.
  Security review independen: kunci hanya di header `authorization`, badan galat
  tidak pernah dibaca, `AI_ROUTER_FORCE_PROVIDER` enum tertutup, fallback menerima
  request dengan identitas referensi sama (tidak ada augmentasi payload).

### Risiko yang ditemukan

* **Breaker in-process per replika** — bukan jaminan lintas-replika, hanya
  proteksi per-proses dari membombardir provider yang mati. Redis-backed breaker
  ditunda (rasionalisasi sama seperti PR-041: `redis-cache` bisa evict di tengah
  outage, `redis-queue` khusus BullMQ per ADR-004).
* **`router.ts:134` menelan galat fallback dengan `catch {}` kosong** — `GROQ_API_KEY`
  yang SALAH (bukan yang kosong) tidak terlihat operator hari ini. QC menyarankan
  melampirkan `{ cause }` (tidak membocorkan apa pun karena pesan `AiProviderError`
  sudah dipatok) dan agar perekam PR-043 mencatat kegagalan fallback secara eksplisit.
* **Galat in-flight yang datang terlambat saat breaker sudah terbuka** akan
  me-restart jendela 60 detik dari saat itu — dibuktikan (dibuka t=0, galat
  terlambat t=50s, masih terbuka di t=60s). Dibatasi oleh konkurensi in-flight dan
  sembuh sendiri; QC menilai non-blocking.
* **`AiRouterDeps.breakerOptions` belum punya pemanggil** — `gateway.ts` selalu
  memakai `breakers` langsung; opsi ini disiapkan untuk penyesuaian clock/threshold
  di kemudian hari tapi mati kode hari ini.
* **`gateway.ts:88` pesan log "chat memakai Groq" tidak akurat** ketika
  `GEMINI_API_KEY` kosong — `chat()` melempar `AI_NOT_CONFIGURED` tanpa pernah
  menghubungi Groq (`AI_NOT_CONFIGURED` sengaja di luar `KODE_ALIH`). Bukan AC,
  bukan regresi (perilaku sama sejak PR-041), belum ada consumer. **Jangan
  dokumentasikan "Groq-only" sebagai konfigurasi yang bekerja** — satu-satunya
  jalur Groq-only nyata adalah `AI_ROUTER_FORCE_PROVIDER=groq`.

### Next steps

* **PR-043** — Quota engine + `ai_usage` + `GET /ai/quota`. Wajib: catat kegagalan
  fallback yang saat ini ditelan `router.ts:134` (lampirkan `{ cause }`), dan
  konsumsi `response.provider` untuk pencatatan pemakaian per provider.
* **PR-044** — Prompt registry + cache semantik + injection guard.
* **PR-045** — SSE streaming (`chatStream`).
* **PR-046** — Kontrak degradasi baku; pemetaan `AiProviderError` ke
  `ERROR_CATALOG`; keputusan `AiRouterDeps.breakerOptions` (pakai atau lepas
  ekspornya) belum diambil di PR ini.

---

## PR-043a — Quota Engine (penegakan) + `GET /ai/quota`

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md#pr-043---quota-engine--ai_usage--get-aiquota)
> **Tanggal:** 2026-08-31
> **Status:** Selesai (separuh penegakan; pencatatan `ai_usage` = PR-043b)

### Ringkasan hasil

PR-043 dipecah atas keputusan owner: kerjanya ~600 LOC produksi, di atas batas 500 LOC
(CLAUDE.md §9). **043a memuat jalur penegakan** — kode error, konfigurasi kuota, batas
hari WIB, mesin kuota, gerbang boot, dan endpoint `GET /api/v1/ai/quota`. **043b** akan
memuat kolom `ai_usage.prompt_version`, antrean `ai-usage-record`, recorder, processor
worker, `AiClient`, dan utang `onFallbackFailure` PR-042.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api`
76 berkas / **852 lulus** (144 skip pra-ada: butuh Docker, tidak terkait). **56** test
kuota baru (ai-quota 23, ai-quota-config 15, ai-quota-wib 10, ai-quota-http 8),
**tidak satu pun** ikut kelompok skip atau butuh Docker: mesin kuota menerima
`QuotaRedisLike` yang sempit, jadi penegakannya dibuktikan dengan fake in-memory + jam
yang disuntik.

### Scope selesai

* **`core/http/errors.ts`** — entri katalog `KUOTA_AI_HABIS` (429). `AppError` sudah
  menulis `Retry-After` dari `retryAfterSeconds`, jadi tidak ada mekanisme error kedua.
* **`core/ai/quota-config.ts`** — `AI_QUOTA_DEFAULTS` (cv-chat 30, finalize 5,
  simplify-text 20, rerank 3 dari SDD §7.1; cv-check 5, interview-sim 10, embed 50
  eksplisit) + `loadAiQuotaConfig()` membaca `AI_QUOTA_<FITUR>_PER_DAY` /
  `AI_QUOTA_GLOBAL_PER_DAY`, melempar `EnvError`. Pagu global bawaan 1200 = tier gratis
  1500 − buffer 20%.
* **`core/ai/waktu-wib.ts`** — `hariWib` / `detikKeTengahMalamWib` lewat `Intl`, murni,
  tanpa library tanggal dan tanpa fake timer.
* **`core/ai/quota.ts`** — `createAiQuota`: reserve-then-refund, penghitung per pengguna
  DAN pagu global, `ringkasan()` untuk jalur baca, `isKuotaHabis` + `bolehDikembalikan`.
* **`src/index.ts`** — gerbang fail-fast keempat lewat impor SEMPIT
  `./core/ai/quota-config.js` (bukan barrel `core/ai`); `boot.ts` merakit kuota di atas
  `redis.queue` dan memasang modul `ai`.
* **`modules/ai/`** — router → controller → service (tanpa repository: yang dijawab
  seluruhnya ada di Redis). `GET /ai/quota` dengan `access.authenticated()`.
* **`core/config/env.ts` + `.env.example`** — `AI_QUOTA_FAIL_OPEN` (default `false`) dan
  blok pola `AI_QUOTA_*` (mengikuti cara `QUEUE_<NAMA>_<FIELD>` didokumentasikan).

### Keputusan teknis

* **D1 — `AppError` + kode katalog, BUKAN `DegradedError` baru.** `DegradedError` milik
  PR-046 (phase-06 L418-424) dan `AppError` adalah satu-satunya pemetaan error→HTTP yang
  ada, lengkap dengan `Retry-After`. Pemanggil WAJIB memakai predikat `isKuotaHabis()`,
  jangan perbandingan kelas — PR-046 bebas menurunkan kelas baru berkode sama. Akibatnya
  nama tipe literal `DegradedError` di AC-1 **tidak** terpenuhi secara harfiah; perilaku
  yang diminta AC-1 (respons degradasi, bukan 500, `Retry-After` terpasang) terpenuhi
  penuh lewat mekanisme yang sudah ada.
* **D2 — Penghitung di `redis-queue`, bukan `redis-cache`** (amandemen ADR-004
  2026-08-31). `allkeys-lru` akan diam-diam memulihkan jatah dan menihilkan pagu global
  saat memori tertekan. Dua penjaga: prefiks `ai:kuota:v1:` dan TTL pada setiap kunci.
* **D3 — Reset harian lewat KUNCI BERTANGGAL, bukan TTL bergulir.** TTL murni pengumpul
  sampah. TTL-sebagai-reset akan mereset pada jam berbeda per pengguna (AC-2 tak
  terbuktikan) dan mengunci pengguna selamanya bila `EXPIRE` gagal. Diverifikasi QC
  secara independen terhadap perhitungan manual UTC+7 untuk seluruh 1440 menit dalam satu
  hari (2026-08-31) — nol selisih, termasuk kedua sisi batas tengah malam WIB.
* **D4 — Gagal tertutup saat Redis tak terjangkau**, dengan tuas operator
  `AI_QUOTA_FAIL_OPEN=true` yang diperingatkan saat boot. Setiap fitur AI wajib punya
  jalur non-AI (ADR-005), jadi menolak = degradasi; gagal terbuka mencabut seluruh
  kendali biaya tepat saat tidak ada yang bisa membaca penghitungnya. Tuas ini **tidak**
  bisa mengalahkan killswitch kuota `0`: pemeriksaan `0` berjalan sebelum I/O Redis apa
  pun, tanpa syarat terhadap `failOpen` (diverifikasi: 0 perintah Redis terkirim saat
  kuota = 0).
* **D5 — Tidak ada refund untuk `AI_SAFETY_BLOCK`** (juga `AI_INVALID_OUTPUT` dan
  `AI_RATE_LIMIT`). Mengembalikan vonis penyaring keamanan membuat penjajakannya gratis.
* **D6 — Pagu global TIDAK diekspos ke pengguna** — jawabannya hanya
  `globalTersedia: boolean`; angkanya data operasional (PR-103).

### Verifikasi

* AC-1: `ai-quota.test.ts` — panggilan melewati jatah → 429 + `Retry-After` (bukan 500),
  `isKuotaHabis` true, envelope Bahasa Indonesia lengkap.
* AC-2: `ai-quota-wib.test.ts` (16:59:59Z hari N, 17:00:00Z hari N+1) + `ai-quota.test.ts`
  (melintasi tengah malam → jatah penuh lagi; TTL terpasang pada setiap kunci).
* AC-4: pagu global menolak pengguna yang jatah pribadinya masih ada, dan jatah pribadi
  itu dikembalikan; satu akun tidak bisa menguras anggaran bersama.
* AC-5: `ai-quota-config.test.ts` — default = angka SDD, override env, `0` = fitur mati,
  salah ketik → `EnvError`; daftar fitur dibandingkan dengan enum `AiFeature` Prisma.
* AC-6: `ai-quota-http.test.ts` — 401 tanpa token, 200 hanya angka pemanggil (query
  `?userId=` tidak berpengaruh), angka pagu global tidak pernah ikut keluar, Redis mati →
  503 `BELUM_SIAP`, dan `registry.list()` mencatat `GET /api/v1/ai/quota` = authenticated.

### Risiko yang ditemukan

* **AC-3 belum terpenuhi** — pencatatan `ai_usage` (fitur/provider/token/versi prompt)
  seluruhnya ada di PR-043b. Sampai PR itu mendarat, kuota ditegakkan tanpa jejak biaya
  per panggilan di DB.
* **Mesin kuota belum punya consumer produksi.** `AiClient` yang mengikat gateway →
  kuota → recorder lahir di 043b; hari ini `periksaDanPakai`/`kembalikan` hanya dipanggil
  test, dan `GET /ai/quota` hanya membaca. Jadi kuota belum benar-benar mengurangi
  panggilan LLM mana pun sampai 043b terpasang.
* **Over-count sementara saat panggilan bersamaan** — dibatasi jumlah permintaan
  in-flight dan pulih sendiri lewat DECR.
* **Kegagalan Redis parsial setelah `INCR` pengguna** — bila panggilan `EXPIRE`/TTL
  berikutnya gagal, jalur gagal-tertutup menolak tanpa mengembalikan unit yang sudah
  ter-`INCR`: konservatif (tidak pernah mencetak kuota gratis) tapi merugikan pengguna
  satu panggilan. Perbaikan (refund pada kegagalan parsial) masuk 043b.
* **Dedup pengembalian (`kembalikan`) memakai `WeakSet` in-memory** berbasis identitas
  objek reservasi — aman hari ini karena tidak ada jalur serialisasi reservasi di 043a,
  TETAPI 043b wajib menggantinya dengan penanda idempotensi yang tahan-serialisasi (mis.
  id reservasi di Redis) begitu `AiClient` melewatkan reservasi lintas antrean/proses.
  Temuan security review, LOW/teoretis, tidak memblokir 043a.
* **Utang PR-042 (`router.ts:134` `catch {}`)** belum dibayar — masuk 043b.

### Next steps

* **PR-043b** — kolom `ai_usage.prompt_version` + migrasi, antrean `ai-usage-record`,
  recorder + processor worker, `AiClient`, `onFallbackFailure`.
* **PR-044/045/046** — prompt registry + cache semantik, SSE streaming, kontrak degradasi
  (`withDegradation`, `meta.degraded`) yang akan mengkanonkan `KUOTA_AI_HABIS`.

---

## PR-043b — Recorder `ai_usage` + `AiClient` + antrean `ai-usage-record`

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md#pr-043---quota-engine--ai_usage--get-aiquota)
> **Tanggal:** 2026-09-02
> **Status:** Selesai (separuh pencatatan; melengkapi penegakan PR-043a)

### Ringkasan hasil

Separuh kedua PR-043. **043a menegakkan** jatah; **043b mencatat biayanya** dan
menyatukan keduanya di satu pintu: `AiClient` = kuota → provider → jejak biaya. Ikut
terbayar di sini dua utang yang tertulis di log 043a: refund pada kegagalan Redis
parsial, dan `catch {}` telanjang milik router PR-042.

Jalur pencatatannya utuh dari ujung ke ujung — `AiClient` → `AiUsageRecorder` (enqueue)
→ antrean `ai-usage-record` → processor worker → `AiUsageRepository.simpan` → baris
`ai_usage`. Yang lewat batas proses HANYA metadata biaya: id, pengguna, fitur, provider,
token, versi prompt, waktu panggilan. Tidak ada isi prompt, tidak ada jawaban model, dan
skemanya `.strict()` supaya percobaan menempelkannya kelak GAGAL keras alih-alih terbuang
diam-diam.

Gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 — `@nawasena/api`
**79 berkas / 904 lulus / 148 skipped**. Angka skip naik 144 → 148 justru KARENA PR ini:
**4 dari 148 skip itu milik 043b sendiri** (`ai-usage-db.test.ts`, butuh Docker), bukan
seluruhnya pra-ada. Rinciannya di "Risiko yang ditemukan".

### Scope selesai

* **Migrasi 10** `20260902090000_10_ai_usage_prompt_version` — `ALTER TABLE "ai_usage"
  ADD COLUMN "prompt_version" TEXT`. Aditif & nullable sepenuhnya; `schema.prisma`
  menyusul dengan `promptVersion String? @map("prompt_version")`. TANPA index (alasan di
  D4).
* **Antrean `ai-usage-record`** — `QUEUE_NAME`, `queueNameSchema` (z.enum eksplisit,
  ditambah manual), `QUEUE_DEFAULTS` (2 / 4 attempts / exp 10 s / 15 s), baris tabel
  SDD §16, satu baris contoh di `.env.example`.
* **`aiUsageRecordJobSchema` + `aiFeatureSchema`** (`packages/schemas/src/queue.ts`) —
  payload tertutup, `promptVersion` opsional, `createdAt` ISO dari sisi API.
* **`core/ai/client.ts`** — `AiClient`, `AiCallContext`, `AiUsagePeristiwa`, port
  `AiUsageRecorder`, `createAiClient`. Nol impor Prisma.
* **`modules/ai/services/ai-usage.service.ts`** — `createAiUsageRecorder`: peristiwa →
  zod → `queues.enqueue` dengan `jobId` deterministik; seluruh badan dibungkus try/catch
  (`logger.error` + metrik `ai_usage.enqueue_gagal`) lalu resolve normal.
* **`modules/ai/repositories/ai-usage.repository.ts`** — `simpan()` mengembalikan
  `ditulis` / `duplikat` (P2002) / `pemilik-hilang` (P2003); kode Prisma lain DILEMPAR
  supaya job retry lalu masuk DLQ.
* **`apps/worker/src/processors/ai-usage.ts`** + entri ketiga `PROCESSORS`. Tanpa
  `jadwalkan()` — queue ini event-driven, bukan cron.
* **`core/ai/quota.ts`** — refund pada kegagalan Redis PARSIAL (utang 043a).
* **`core/ai/router.ts` + `gateway.ts`** — hook `onFallbackFailure` menggantikan
  `catch {}` (utang PR-042).
* **Dokumen** — SDD §16 (baris queue baru) & §7.3 (catatan kolom), `PRD.md` blok skema
  `ai_usage`, `phase-06-ai-gateway.md` ("Database Changes: Tidak ada" dikoreksi).

### Keputusan teknis

* **D1 — `AiClient` BUKAN `AiProvider`.** `AiProvider.chat(request)` sengaja tidak
  membawa identitas maupun fitur; itulah yang membuat router boleh meneruskan permintaan
  apa adanya ke cadangan (kesetaraan payload, PR-042). Menjadikan `AiClient` sebuah
  `AiProvider` berarti menyelundupkan `userId` ke dalam `request` DAN membuat setiap
  pemanggil `AiProvider` lama diam-diam melewati kuota. Antarmuka terpisah dengan
  `AiCallContext` eksplisit.
* **D2 — Provider yang direkam adalah `response.provider`, bukan `router.name`.**
  `router.name` bernilai `"router"` (atau nama yang dipin `AI_ROUTER_FORCE_PROVIDER`);
  yang membayar tagihan adalah adapter yang benar-benar menjawab. Satu jalur kode, tanpa
  cabang khusus untuk `forceProvider`.
* **D3 — `embed` dicatat token 0/0, disengaja.** `AiEmbedResponse` tidak punya `usage`
  karena Gemini `embedContent` memang tidak mengembalikan `usageMetadata`. Yang dipilih
  bukan tri-state "unknown" atau kolom nullable (keduanya memperluas skema tanpa satu pun
  pembaca yang membutuhkannya), melainkan pengakuan bahwa **biaya embedding terlacak
  lewat CACAH BARIS, bukan token** — satu baris `ai_usage` per embedding, dihitung
  `ai_usage_monthly.requests`. Konsekuensi yang harus diketahui pembaca angka bulanan:
  kolom token untuk fitur `embed` selalu 0.
* **D4 — Kolom `prompt_version` TANPA index.** Tidak ada query hari ini yang memfilter
  atasnya: `finalkanBulanAiUsage` menyebut kolom secara eksplisit dan `GROUP BY month,
  feature, provider`; penghapusan 90 hari memakai `created_at`. `ai_usage` tulis-berat,
  jadi index tanpa pembaca hanya memperlambat setiap tulisan pada tabel yang justru
  sedang diretensi. Index lahir bersama pembacanya (PR-044/PR-103). Agregat bulanan
  SENGAJA tidak dipecah per versi prompt — memecahnya mengubah PK `ai_usage_monthly` dan
  membatalkan bulan yang sudah difinalkan.
* **D5 — `createdAt` ikut payload (superset AC).** Tanpa itu `created_at` menjadi waktu
  WORKER menulis. Backlog antrean yang melewati pergantian bulan, atau job DLQ yang
  di-replay manual, akan mendarat di bulan yang salah — dan `finalkanBulanAiUsage`
  memfinalkan satu bulan SEKALI tanpa pernah menghitung ulang, jadi kesalahannya permanen
  dan senyap. Nol migrasi tambahan.
* **D6 — P2003 ditelan bersama P2002.** `ai_usage.user_id` ber-`ON DELETE CASCADE`:
  purge PDP (PR-023) atau penghapusan akun yang jatuh di ANTARA panggilan AI dan
  penulisan barisnya menghasilkan pelanggaran foreign key, bukan duplikat. Baris untuk
  pengguna yang sudah tidak ada memang tidak boleh ada; me-retry-nya 3× lalu mengirimnya
  ke DLQ hanya derau. Kode Prisma lain tetap dilempar.
* **D7 — Advisory WeakSet 043a DITUTUP, dedup dipertahankan.** Penelusuran: reservasi
  dibuat di langkah 1 `jalankan()`, disimpan di satu `const` lokal, dipakai di langkah 2
  pada fungsi yang sama, lalu mati bersama frame-nya. Ia tidak pernah (a) masuk payload
  job — `aiUsageRecordJobSchema` `.strict()` tidak punya field reservasi dan menolak
  kunci asing; (b) dikembalikan lewat batas API — `AiClient` mengembalikan respons AI;
  (c) di-`JSON.stringify`; (d) disimpan. Tidak ada satu pun batas proses/serialisasi yang
  dilintasinya, jadi dedup berbasis identitas objek tetap tepat, sementara penanda durable
  di Redis hanya menambah satu RTT dan satu mode gagal baru pada jalur yang paling jarang
  diuji. **Syaratnya kawat pemicu, bukan janji:** begitu ada kode yang memasukkan
  reservasi ke payload job atau mengembalikannya lewat batas API, penanda idempotensi
  durable menjadi WAJIB — dan penjaganya sudah ada tanpa biaya tambahan (test `.strict()`
  + daftar field payload akan merah pada percobaan pertama menyelipkannya).
* **D8 — Logika recorder di sisi api, processor worker sebagai adapter tipis.**
  `apps/worker` berjalan `--passWithNoTests`; setiap baris keputusan yang tinggal di sana
  adalah baris tak teruji. Yang tersisa di processor: `parse` + panggil + log.
* **D9 — `boot.ts` SENGAJA belum di-wire.** Belum ada satu pun fitur yang memanggil AI
  (fitur pertama = PR-045+/PR-047+), jadi merakit `aiClient` sekarang menghasilkan
  `const` tanpa pemakai → `no-unused-vars` → lint merah, yang hanya bisa dipadamkan
  dengan konsumen palsu atau `eslint-disable`. Keduanya lebih buruk daripada seam yang
  tercatat; preseden PR-041 D6. **Konsekuensi yang harus dibaca terang: "kuota
  menggerbangi LLM" hari ini dibuktikan oleh TEST, bukan oleh wiring produksi** — sebab
  belum ada panggilan LLM produksi untuk digerbangi. Yang tetap ter-wire nyata: antrean
  terdaftar + processor worker (konsumen menganggur sampai produsernya lahir).
  Tiga baris yang ditambahkan PR fitur AI pertama (sesudah `boot.ts:100`, sebelum `:199`
  — `aiQuota` dan `queues` sudah dalam scope yang sama):

  ```ts
  const aiProvider  = createAiGateway(env, logger);
  const aiRecorder  = createAiUsageRecorder({ queues, logger, metrics: { increment: (n) => logger.warn({ metric: n }, "Metrik AI bertambah") } });
  const aiClient    = createAiClient({ provider: aiProvider, quota: aiQuota, recorder: aiRecorder, logger });
  ```

* **D10 — `onFallbackFailure` sinkron dan `void`.** Hook berjalan di jalur yang sudah
  dalam perjalanan melempar; membuatnya `async` memaksa `await` di dalam `catch` dan
  membiarkan hook lambat menahan error yang sedang ditunggu pemanggil. Satu `catch {}`
  tetap ada di `router.ts`, tetapi kini melingkupi **hook**, bukan kegagalan provider
  cadangan, dan alasannya tertulis: hook adalah observability dan tidak boleh mengubah
  diagnosis. Yang keluar ke pemanggil tetap error PRIMER, tanpa syarat.
* **D11 — Hanya kenaikan yang MENDARAT yang boleh dikembalikan.** Refund pada kegagalan
  Redis parsial (utang 043a) mula-mula ditulis tanpa syarat, dan itu keliru: `naikkan()`
  melempar dari TIGA titik. `redis.incr` gagal berarti kenaikannya **tidak pernah
  mendarat**; `redis.expire`/`redis.ttl` gagal berarti kenaikannya **sudah mendarat**.
  Refund tanpa syarat menyamakan keduanya, sehingga "INCR gagal + DECR sehat" menurunkan
  penghitung harian yang tidak pernah naik — **satu unit jatah gratis** bagi pengguna yang
  penghitungnya sudah > 0 hari itu (lantai nol di `turunkan` hanya mencegah nilai negatif,
  bukan 5 → 4). Diperberat `AI_QUOTA_FAIL_OPEN`: pada tuas itu satu peristiwa Redis sakit
  menghasilkan panggilan yang LOLOS **dan** satu unit jatah gratis.
  Perbaikannya: kelas penanda `KenaikanTerpasang` membungkus kegagalan PASCA-INCR,
  sementara `redis.incr` sendiri berada **di luar** `try` sehingga kegagalannya dilempar
  apa adanya dan tidak pernah dibungkus. Kedua call site me-refund hanya bila
  `err instanceof KenaikanTerpasang`. Call site pagu global kini juga mengembalikan pagu
  global bila INCR-nya sendiri mendarat (kelas bug yang sama, sebelumnya laten karena
  hanya jatah pribadi yang dikembalikan); jatah pribadi di call site itu dikembalikan
  tanpa syarat — sah, karena `naikkan(kunciUser)` sudah RETURN beberapa baris di atas,
  jadi kenaikannya terbukti mendarat. **+3 test regresi di `ai-quota.test.ts` (26 → 29
  kasus di berkas itu)**; mutasi yang melepas guard sisi pagu global membuatnya merah,
  jadi penjaganya bergigi, bukan dekoratif. Temuan F2 security review, ditutup di PR ini.
* **F3 (LOW, pra-ada, REPORT ONLY — tidak diperbaiki di sini).** `turunkan` bisa
  meninggalkan kunci `ai:quota:...` bernilai 0 **tanpa TTL** bila `EXPIRE` terus gagal
  (DECR → -1, INCR → 0, lalu `expire` melempar dan ditelan). Kuota berjalan di atas
  `redis-queue` yang sengaja `noeviction` (ADR-004), jadi kunci semacam itu tidak pernah
  dievict: kebocoran memori pada instans yang, bila OOM, menghentikan SELURUH antrean —
  ketersediaan, bukan kerahasiaan; efek pada penghitungan kuota netral (nilainya 0).
  Perbaikannya (`SET key 0 EX ttl` / skrip Lua, atau sapuan kunci tanpa TTL di job
  maintenance) sengaja tidak diselundupkan ke PR ini. Dicatat sebagai utang.

### Verifikasi

* `pnpm lint` → 9/9 sukses. `pnpm typecheck` → 9/9 sukses (termasuk
  `@nawasena/worker`, yang me-resolve `@nawasena/api/modules/ai` lewat entri `exports`
  baru). `pnpm test` → 9/9 sukses; `@nawasena/api` **79 berkas / 904 lulus / 148 skipped**
  — 144 skip pra-ada (butuh Docker) **+ 4 skip baru milik PR ini** (`ai-usage-db.test.ts`,
  juga butuh Docker; lihat Risiko).
* `prisma validate` → skema valid; migrasi 10 ditulis tangan mengikuti konvensi
  `<stamp>_<nn>_<slug>` (tidak dijalankan terhadap DB hidup).
* Penjaga yang tetap hijau tanpa dilonggarkan: `queue.test.ts` (mencakup seluruh queue,
  retensi umum, nama tanpa `:`), `env-example.test.ts` (dua arah), `migrasi-skema.test.ts`,
  `internal-queues.test.ts`, `crypto-boot.test.ts`, `retention.test.ts`,
  `ai-router.test.ts`, `ai-quota*.test.ts`.
* **AC-8 (kuota menggerbangi LLM) — penunjuk yang benar**, supaya tidak disalin keliru:
  penolakan 429 + `retryAfterSeconds` ada di **`ai-quota.test.ts:91-99`**, katalog 429 di
  **`http-errors.test.ts:93`**, dan header `Retry-After` ditulis generik di
  **`core/http/handlers.ts:56`**. **BUKAN `ai-quota-http.test.ts`** — berkas itu hanya
  menguji akses dan isi `GET /ai/quota`, dan tidak memuat satu pun assertion
  429/`Retry-After`. Sisi klien digerbangi `ai-client.test.ts`, yang memakai mesin kuota
  NYATA di atas Redis palsu (bukan stub kuota), dengan spy provider untuk membuktikan
  `panggil()` tidak pernah dijalankan saat jatah habis.

### Risiko yang ditemukan

* **4 assertion `ai-usage-db.test.ts` (AC-1) BELUM PERNAH DIEKSEKUSI.** Docker mati di
  mesin pengembangan, jadi keempatnya ter-`ctx.skip()` di setiap kali suite dijalankan —
  merekalah 4 dari 148 skip itu. Assertion-nya belum pernah menyala hijau satu kali pun:
  **CI adalah eksekusi pertamanya.** Konsekuensinya lugas — bila migrasi 10 salah (kolom
  meleset, atau `finalkanBulanAiUsage` ternyata ikut mengelompokkan `prompt_version`
  sehingga agregat bulanan berubah), yang menangkapnya pertama kali adalah CI, bukan
  verifikasi lokal. Yang bisa ditegakkan tanpa DB sudah ditegakkan lewat pembacaan:
  migrasinya aditif + nullable, dan agregasi retensi menyebut kolomnya EKSPLISIT dengan
  `GROUP BY 1,2,3`. Itu membuat hijau PLAUSIBEL, bukan TERBUKTI.
* **F1 (MEDIUM, security review) — kuota belum ditegakkan secara STRUKTURAL; dicatat
  sebagai utang.** `createAiGateway` masih diekspor dari barrel `core/ai`, dan tidak ada
  aturan lint maupun test penjaga yang melarang sebuah modul memanggil `provider.chat()`
  langsung. Artinya PR fitur AI pertama yang merakit `createAiGateway` sendiri — alih-alih
  `createAiClient` — akan memanggil LLM **tanpa kuota dan tanpa baris `ai_usage`**, dan
  **tidak ada satu gerbang CI pun yang berubah merah**. Persis kelas kesalahan yang
  dicegah di tingkat desain antarmuka (D1) tetapi tidak di tingkat penegakan.
  **Reachability hari ini NOL**: tidak ada satu pun pemanggil produksi `createAiGateway`
  (`boot.ts` tidak merakit AI sama sekali, D9) — itulah sebabnya ia tidak memblokir PR
  ini. Remediasi **WAJIB menyertai PR fitur AI pertama**, bersama tiga baris wiring
  `boot.ts` di D9: (a) test penjaga bergaya `route-registry.test.ts` yang menegakkan
  `createAiGateway` hanya dipanggil di `core/ai/client.ts` dan `boot.ts`, ATAU (b) aturan
  `no-restricted-imports` / `eslint-plugin-boundaries` yang melarang `modules/*`
  mengimpor `createAiGateway`/`AiProvider` dari barrel `core/ai`. Biayanya satu berkas;
  imbalannya "kuota menggerbangi LLM" berhenti bergantung pada ingatan penulis PR
  berikutnya.
* **`AiClient` belum punya pemanggil produksi (D9).** Jaminan "kuota menggerbangi LLM"
  hari ini hanya sekuat test-nya. Pemulihan: tiga baris `boot.ts` di atas, ditambahkan
  oleh PR fitur AI pertama.
* **Panggilan gagal-tanpa-refund membakar token tanpa baris `ai_usage`.**
  `AI_SAFETY_BLOCK` dan `AI_INVALID_OUTPUT` tidak layak refund (kebijakan 043a D5) dan
  juga tidak menghasilkan baris — error provider tidak membawa `usage`. Akibatnya
  `ai_usage_monthly` akan selalu sedikit LEBIH RENDAH daripada tagihan provider.
  Terdeteksi lewat selisih dengan dashboard provider; bila perlu, PR-046 menambah
  `outcome` pada payload bersama kontrak degradasi.
* **"0 token" tidak terbedakan dari "provider diam"** — `angka()` di adapter memetakan
  field usage yang hilang menjadi 0 (pra-ada sejak PR-041, tidak diperlebar di sini;
  ditandai di komentar `client.ts`).
* **AC "processor menulis tepat satu baris" tidak diuji di worker.** Konsekuensi langsung
  D8: `apps/worker` berjalan `--passWithNoTests`. Yang benar-benar terbukti adalah
  `AiUsageRepository.simpan` di sisi api dengan prisma palsu; adapter worker dijamin
  review, bukan test. Ditulis di sini supaya tidak diasumsikan.
* **Metrik `ai_usage.enqueue_gagal` belum punya sink produksi** — backend metrik belum ada
  (ADR-017) dan `metrics` baru terpasang saat `boot.ts` di-wire (D9). Sampai saat itu
  kegagalan enqueue terlihat lewat `logger.error` saja.

### Next steps

* **PR fitur AI pertama** — tambahkan tiga baris wiring `boot.ts` (D9) sekaligus
  pemanggil `AiClient` yang sesungguhnya, **dan** penjaga F1 (test bergaya
  `route-registry.test.ts` atau aturan `no-restricted-imports`) dalam PR yang sama.
  Kedua-duanya, bukan salah satu: wiring tanpa penjaga hanya memindahkan lubangnya.
* **PR-044** — registry prompt berversi; ia yang pertama kali mengisi
  `ai_usage.prompt_version` (hari ini selalu NULL).
* **Out of scope, dicatat:** (1) `SDD.md` §16 juga belum memuat `maintenance:retention`
  (utang PR-024a, drift sejenis); (2) konsolidasi tiga salinan daftar fitur AI (enum
  Prisma / `AI_FEATURES` / `aiFeatureSchema`) menjadi satu sumber — menyentuh jalur
  sempit gerbang boot 043a, jadi PR tersendiri; (3) F3 — kunci kuota bernilai 0 tanpa TTL
  pada Redis `noeviction` (lihat blok F3 di Keputusan teknis), report-only.

---

## PR-044a — Prompt Registry + Injection Guard

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md)
> **Tanggal:** 2026-09-02
> **Status:** Selesai (separuh pertama PR-044; cache = PR-044b)

### Ringkasan hasil

PR-044 dipecah dua. **044a membangun mekanisme prompt**: registry template
berversi + guard injeksi. **044b membangun cache** dan hanya ia yang menyentuh
`client.ts`, kuota, `ai_usage`, dan Redis. Alasan pemecahan bukan hanya ukuran
(~1300 LOC vs pagu 500) melainkan sifat risiko: guard adalah permukaan KEAMANAN
dan pantas dibaca sendirian, cache adalah keputusan kuota/privasi yang belum
diputuskan. Preseden 043a/043b.

Yang lahir di sini murni aditif dan PURE — tanpa I/O, tanpa Redis, tanpa Prisma,
tanpa wiring `boot.ts`, tanpa env, tanpa migrasi, tanpa endpoint. `client.ts`
TIDAK disentuh satu baris pun, jadi jahitan ke 044b tetap bersih. Sekaligus
`AiCallContext.promptVersion` akhirnya punya PRODUSEN: `template.id`
(`"spesimen.v1"`) yang memetakan ke tepat satu berkas.

### Scope selesai

* **`core/ai/guard.ts`** — sanitizer PERTAMA di repo (nol utilitas sanitasi/
  escaping sebelumnya di `apps/**` + `packages/**`), jadi bentuknya menjadi
  preseden dan diperlakukan begitu.
  * Sisi masukan: `INSTRUKSI_ANTI_INJEKSI` (selalu `role: "system"`),
    `bungkusDataTakTepercaya()` dengan penanda ber-NONCE + penggosokan penanda
    palsu di dalam data, pembuang kontrol C0/C1 & zero-width, pemotongan
    `maksKarakter` per code point.
  * Sisi keluaran: `bersihkanTeksModel()` (strip + daftar `dibuang`),
    `bersihkanTeksModelKetat()` (melempar `AI_INVALID_OUTPUT`),
    `bersihkanKeluaran<T>()` untuk struktur bersarang.
* **`core/ai/prompts/`** — `tipe.ts` (`TanpaDisabilitas`,
  `PeriksaTanpaDisabilitas`, `PromptMeta`, `PromptTemplate`), `definisi.ts`
  (`definePrompt`), `index.ts` (`PROMPT_REGISTRY` + re-ekspor), `spesimen.v1.ts`.
* **Barrel `core/ai/index.ts`** — satu blok ekspor baru, berikut peringatan
  gerbang boot yang sama seperti blok kuota/client.
* **Penjaga baru** `__tests__/prompt-sensitif-jangkauan.test.ts` +
  `__tests__/prompt-registry.test.ts` (assertion tipe AC-4 + kelengkapan
  registry).
* **Dokumen** — amandemen AC-4 & catatan pemecahan di `phase-06-ai-gateway.md`,
  bagian "Data disabilitas dan prompt AI" di `docs/akses-data-sensitif.md`.

### Keputusan teknis

* **D1 — Guard ditegakkan di TEMPLATE, bukan di `AiClient`.** Saat sebuah
  `AiChatRequest` sampai di `client.ts`, informasi "bagian mana yang tak
  tepercaya" sudah hilang; yang tersisa hanya array pesan. Template adalah
  satu-satunya tempat data tak tepercaya masih bisa dikenali.
* **D2 — Default aman TERBALIK.** `definePrompt` yang merakit pesan, bukan
  penulis template: setiap daun string di `Input` dibungkus KECUALI kuncinya
  didaftarkan di `tepercaya`. Menulis nol baris menghasilkan perilaku paling
  aman; satu-satunya kesalahan yang tersisa (mempercayai field yang salah)
  muncul sebagai SATU baris di berkas template, tepat tempat review menangkapnya.
* **D3 — Dua lapis penanda, dan keduanya perlu.** Nonce per panggilan membuat
  penutup blok tidak bisa DITEBAK; penggosokan prefiks penanda di dalam data
  menutup kasus nonce yang sudah BOCOR lewat pantulan prompt (pesan error, log
  debug, keluaran stream). Nonce saja mati oleh refleksi; gosok saja adalah
  batas ber-token yang diketahui umum.
* **D4 — Keluaran DI-STRIP, bukan di-escape.** SDD §7.3 menuntut "tanpa HTML".
  Mengubah tag menjadi entity justru menyimpan muatannya utuh dan memancing satu
  titik di hilir yang me-render mentah. Polanya sengaja SEMPIT — "gaji < 5
  juta", "a<b", dan "data: 5 orang" tetap utuh — karena sanitizer yang merusak
  teks Indonesia yang sah akan DIMATIKAN orang, bukan diperbaiki.
* **D5 — Sanitasi menumpang `output.transform(...)`.** Ia berjalan DI DALAM
  `schema.safeParse` yang sudah dipanggil adapter (`providers/gemini.ts`), jadi
  tidak ada langkah "ingat sanitasi" di mana pun. Urutannya mengikat: **zod
  dulu, sanitasi sesudah** — membersihkan lebih dulu mengubah byte yang dihakimi
  skema dan bisa menyulap keluaran cacat menjadi tampak sah.
* **D6 — Registry = peta IDENTITAS, bukan peta pemanggilan.** `PROMPT_REGISTRY`
  hanya menyimpan `{nama, versi, id}`. Lookup `string` ke template bertipe
  sengaja tidak ada: ia tidak bisa diketik, dan ia akan menjadi pintu yang
  melangkahi batas tipe AC-4. Fitur mengimpor KONSTANTA templatenya.
* **D7 — Hanya jalur JSON.** Jalur teks polos punya jahitan sanitasi keluaran
  yang harus diingat pemanggil, dan itu persis bentuk yang dihindari D2/D5.

### Penyimpangan dari AC (WAJIB dibaca)

* **AC-4 DIPERSEMPIT atas keputusan owner 2026-09-02.** AC aslinya: "Tipe input
  prompt menolak `SensitiveProfile` (compile-time)". Yang diterapkan: menolak
  **`disabilityTypes`/`disability_types` saja**, rekursif — `accommodationNeeds`
  TETAP DITERIMA.
  **Alasan.** `SensitiveProfile` MEMBUNDEL keduanya, sedangkan SDD §7.3
  (`SDD.md:413`) secara eksplisit MENGIZINKAN kebutuhan akomodasi fungsional
  masuk prompt bila fitur memerlukannya dan pengguna sudah consent. Menolak
  seluruh tipe akan memblokir jalur yang SDD sahkan, dan PR fitur berikutnya
  (PR-066/072) terpaksa MELEMAHKAN guard — persis saat guard biasanya dilemahkan
  dengan buruk. Guard harus mengkodekan aturan privasi yang SEBENARNYA, bukan
  aturan yang lebih tumpul.
  **Efek praktisnya `SensitiveProfile` utuh tetap ditolak** (ia membawa kunci
  itu), jadi yang hilang bukan perlindungannya melainkan ketumpulannya.
  `phase-06-ai-gateway.md` ikut diamandemen (pola koreksi PR-043b).
* **AC-1 dan AC-5 tidak dikerjakan di sini** — keduanya milik cache (PR-044b).
* **AC-2 batasnya.** Unit test tidak bisa membuktikan LLM "menuruti" instruksi.
  Yang dibuktikan adalah KONSTRUKSInya: data hanya muncul di dalam blok
  berdelimiter, penutup palsu gagal menutup blok, dan data tak pernah menyentuh
  `role: "system"`. Jangan dibaca sebagai jaminan perilaku model.

### Penyimpangan dari desain

* **`prompts/definisi.ts` ditambahkan** (desain menaruh `definePrompt` di
  `prompts/index.ts`). Alasan: `index.ts` mengimpor `spesimen.v1.ts` untuk
  merakit registry, sedangkan `spesimen.v1.ts` memanggil `definePrompt` —
  siklus impor. Memisahkan definisinya menghapus siklus itu alih-alih
  menggantungkannya pada hoisting deklarasi fungsi.
* **Batas tipe dipindah dari posisi BATAS ke posisi ARGUMEN.** Bentuk yang
  ditulis desain — `Input extends TanpaDisabilitas<Input>` — ditolak kompiler:
  `TS2313: Type parameter 'Input' has a circular constraint`. Yang dipakai:
  `spec: PromptSpec<Input, Output> & PeriksaTanpaDisabilitas<Input>`, dengan
  `PeriksaTanpaDisabilitas<T> = T extends TanpaDisabilitas<T> ? unknown : {…never}`.
  Efek penolakannya identik dan tetap di titik DEFINISI template.
* **Field `output` diketik `ZodType<Output>`, BUKAN
  `ZodType<Output, ZodTypeDef, unknown>`** seperti arahan hasil probe
  orchestrator. Probe itu benar sejauh yang diukurnya (ZodEffects assignable ke
  field), tetapi tidak mengukur sisi PEMAKAInya. Diuji ulang dengan `tsc` nyata:
  `AiProvider.chatJson<T>(request, schema: ZodType<T>)` ikut menginferensi `T`
  dari parameter Input skema, sehingga `ZodType<Output, ZodTypeDef, unknown>`
  membuat `T = unknown` dan `response.data` KEHILANGAN tipenya
  (`error TS2322: Type 'unknown' is not assignable to type 'Out'`). Karena
  `bersihkanKeluaran` MEMPERTAHANKAN bentuk, `.transform()` di atas
  `ZodType<Output>` menghasilkan `ZodEffects` yang assignable apa adanya — tanpa
  cast dan tanpa mengubah tanda tangan `types.ts`.
  **Konsekuensi yang harus diketahui:** skema keluaran template tidak boleh
  memuat `.transform()` yang MENGUBAH bentuk. Itu batasan yang benar di sini —
  JSON model wajib cocok dengan bentuk yang dideklarasikan.
* **`tipe.ts` masuk allowlist penjaga jangkauan** (satu entri, beralasan): ia
  yang mendefinisikan literal `disabilityTypes`/`disability_types`, dan tanpa
  literalnya di kode tidak ada yang bisa ditolak TypeScript. Pola persis
  `akses-sensitif-jangkauan.test.ts` ("tempat fungsinya didefinisikan").

### Verifikasi

* **Angka gerbang akhir:** `pnpm lint` **9/9** · `pnpm --filter @nawasena/api
  exec tsc --noEmit` **exit 0** · `pnpm --filter @nawasena/api test` **82 berkas,
  1173 lulus / 1 skip**. Berkas test baru: `ai-guard` 104 kasus,
  `prompt-registry` 12, `prompt-sensitif-jangkauan` 6.
  Satu-satunya skip yang tersisa BUKAN karena Docker mati: Postgres dan kedua
  Redis dinyalakan lebih dulu, jadi seluruh test DB/Redis benar-benar dieksekusi
  (termasuk assertion migrasi 10 milik PR-043b yang sebelumnya hanya pernah jalan
  di CI). Cacah skip 148 → 1 karena itu, bukan karena ada test yang dilonggarkan.
* **Assertion tingkat TIPE ditegakkan `tsc --noEmit`, BUKAN `vitest run`.**
  Konsekuensinya perlu diketahui: test tipe yang "hijau" di runner tidak
  membuktikan apa pun — pembuktiannya ada di gerbang typecheck.
* **Gerbang AC-4 diuji BISA GAGAL, bukan hanya lulus.** `PeriksaTanpaDisabilitas`
  sengaja dilemahkan menjadi selalu-lolos; `tsc` langsung melapor **7×
  `TS2578: Unused '@ts-expect-error' directive`** di `prompt-registry.test.ts`
  (baris 78, 87, 98, 110, 122, 134, 146), lalu berkasnya dipulihkan. Gerbang yang
  tidak bisa gagal tidak membuktikan apa pun.
  *(Angka 5× / baris 73-121 sempat tertulis di sini dan SALAH — ia diambil
  sebelum dua kasus index-signature ditambahkan. Dikoreksi setelah QC
  memverifikasi ulang; nomor verifikasi yang basi adalah cara paling mudah
  sebuah log berubah menjadi fiksi.)*
* **Kontrol positif ada dan wajib.** Dua definisi sah TANPA `@ts-expect-error`
  (`{ accommodationNeeds }` dan `{ disabilityTypes?: undefined }`) menutup
  kemungkinan constraint melebar menjadi "tolak semuanya" — yang akan membuat
  seluruh `@ts-expect-error` hijau sambil tidak membuktikan apa-apa.
* Assertion tipe dijalankan `tsc --noEmit` (langkah "Typecheck" di CI), **BUKAN**
  `vitest run`: vitest men-transpile lewat esbuild dan tidak memeriksa tipe.
  Kalimat itu ditulis di kepala suite supaya tidak salah dibaca.

### Risiko yang ditemukan

* **Guard tipe adalah tripwire NAMA, bukan bukti aliran data.** Ia tidak
  menghentikan `catatan: "saya Tuli"` yang mengalir lewat field `string` biasa.
  Penjaga jangkauan menutup dua jalan memutar (literal di berkas template,
  `definePrompt` di luar folder), tetapi tidak yang ketiga itu. Ditulis eksplisit
  di `docs/akses-data-sensitif.md` dan di kepala `tipe.ts`.
* **`any` melewati batas tipe apa pun**, termasuk yang ini — sifat TypeScript,
  bukan cacat guard. Yang tersisa adalah lint `--max-warnings=0` dan review.
* **Sanitasi keluaran tidak pernah 100%.** Jaminan yang sesungguhnya tetap: zod
  di adapter, dan keluaran model tidak pernah dieksekusi maupun dirender HTML
  (`apps/web`, tidak disentuh PR ini).
* **`spesimen.v1` bisa tergoda dipakai sebagai prompt produk.** Dijaga scanner
  yang menolak impornya dari `src/modules/**`.
* **Utang F1 (PR-043b) MASIH TERBUKA** dan tidak dibayar di sini: tidak ada
  penjaga struktural yang melarang modul memanggil `createAiGateway` langsung
  (melewati kuota + `ai_usage`). Reachability tetap NOL (belum ada pemanggil
  produksi). Remediasi tetap wajib menyertai PR fitur AI pertama, bersama tiga
  baris wiring `boot.ts` (D9 043b).

### Security review — temuan, yang diperbaiki dan yang menjadi utang

Berkas ini adalah **sanitizer pertama di repo**, jadi cacatnya adalah cacat
PRESEDEN: dibiarkan, ia disalin ke mana-mana. Verdict **PASS-WITH-FINDINGS**,
nol pemblokir, dan nol temuan yang REACHABLE hari ini (registry hanya memuat
`spesimen.v1`, tidak ada pemanggil modul, `aiClient` belum di-wire).

**Diperbaiki dalam PR ini (5):**

1. **Tabel entity tidak lengkap untuk kelasnya sendiri.** `javascript&#58;alert(1)`
   lolos utuh — pola pembuang mencari titik dua HARFIAH. Ditambah `:` (desimal,
   heksa, `&colon;`).
2. **Bentuk TANPA titik koma lolos seluruhnya** (`&#60script&#62`); peramban
   memaafkannya, tabel kita tidak. Ditambah untuk `< > " ' :`, plus `&#x22;` dan
   `&apos;` yang memang hilang — **dengan lookahead**, sebab `;?` polos memakan
   awalan `&#340;` (Ŕ) dan menyisakan `"0;`. Diuji dua arah.
3. **Penggosokan penanda dikalahkan karakter tak terlihat.** Daftar zero-width
   buatan tangan melewatkan U+00AD, U+2060, U+FE0F, U+034F, U+202E, dan blok tag
   U+E0000–E007F. Satu soft hyphen di tengah penanda sudah cukup — dan pada
   skenario nonce bocor, penggosokan adalah lapisan TERAKHIR.
   Perbaikannya butuh **TIGA generasi**, dan riwayat itu sengaja ditulis di
   `guard.ts` supaya tidak ada yang "menyederhanakannya" kembali:
   (i) daftar zero-width awal melewatkan U+00AD, U+2060, penanda arah, dan blok
   tag U+E0000–E007F; (ii) penggantinya `\p{Cf}` hanya menutup 4 dari 6 karakter
   yang komentarnya sendiri sebut — U+FE0F dan U+034F berkategori **Mn**, bukan
   Cf (ditemukan QC); (iii) tambalan manual atas keduanya MASIH melewatkan 10
   titik kode lain (U+115F, U+1160, U+17B4, U+17B5, U+180B–180D, U+180F, U+3164,
   U+FFA0) — juga ditemukan QC. Hasil akhirnya satu properti:
   **`\p{Default_Ignorable_Code_Point}`**, yang mencakup ke-405 titik kode
   terpakai sekaligus. Berkas ini membuktikan peringatannya sendiri dua kali.
   **Seluruh `\p{Mn}` sengaja TIDAK dibuang**: kategori itu memuat diakritik sah,
   dan sanitizer yang merusak nama pelamar berhuruf Vietnam, Arab, Devanagari
   atau Thai akan dimatikan orang, bukan diperbaiki. `Default_Ignorable` tidak
   memuat satu pun diakritik itu — **diverifikasi, bukan diasumsikan**, dan
   dijaga 5 test nama sungguhan.
4. **AC-4 ditembus index signature.** `Record<string, unknown>` MEMUAT
   `disabilityTypes` — kuncinya hanya belum disebutkan, jadi pemetaan bersyarat
   tidak punya apa pun untuk dicocokkan. Seluruh rantai `bangun({disabilityTypes})`
   sempat mengkompilasi, dan penjaga jangkauan tidak akan pernah melihatnya
   (ia memindai `prompts/**`, bukan tempat panggilan). Ditutup
   `PunyaIndexSignature<T>` → `never`.
5. **Nonce gagal-TERBUKA.** Sumber yang kurang digit dipadatkan nol menjadi
   `"00000000"` — nonce yang dapat ditebak siapa pun, tepat ketika sumber acaknya
   rusak. Kini melempar.

**Test yang sempat HAMPA — dicatat sebagai pelajaran, bukan disembunyikan.**
Enam test parametrik untuk temuan (3) awalnya hanya menghitung terminator
harfiah; hitungan itu benar baik saat penggosokan bekerja MAUPUN saat
`tersembunyi()` dimatikan total. Ia lulus 92/92 di atas kode yang bocor. QC
menemukannya lewat mutasi `tersembunyi() → return false`. Assertion yang
membedakan (`toContain(PENGGANTI_PENANDA)` + penyisipnya lenyap) ditambahkan;
mutasi yang sama kini menjatuhkan **9** test. QC memverifikasinya ulang secara
mandiri, dan menambah mutasinya sendiri: mencabut hanya carve-out non-Cf
menjatuhkan tepat 2 test (U+FE0F, U+034F) — baris itu memang menanggung beban.

**Utang yang TIDAK dibayar di sini (LOW/INFO, semuanya belum reachable):**

* Kunci objek dirender di luar pagar (`definisi.ts`) — hanya nama field, bukan
  data pengguna, tetapi ia memang di luar penanda.
* `<` menggantung selamat: `<img src=x onerror=alert(1)` tanpa `>` tidak dibuang.
  Aturan yang sama yang menyelamatkan `a<b`. Aman selama keluaran tidak pernah
  dirender HTML — dan itu memang jaminan arsitekturnya, bukan janji berkas ini.
* `bersihkanKeluaran` melewati KUNCI objek, dan mengosongkan `Map`/`Set` diam-diam
  (zod di repo ini tidak menghasilkan keduanya hari ini).
* Nonce 32-bit (per panggilan, CSPRNG) — cukup untuk menaikkan biaya tebakan,
  bukan rahasia kriptografis; penggosokanlah lapisan yang sesungguhnya.
* RegExp disusun dari konstanta penanda tanpa escape — konstantanya kita sendiri,
  jadi bukan jalur pengguna.

**Batas sanitizer yang DITERIMA sadar (bukan celah tersembunyi):**
`x<y>z` → `xz` (positif palsu nyata; `<` diikuti huruf memang ambigu dengan tag,
sedangkan `gaji < 5 juta` yang berspasi selamat — menyempitkan lagi hanya menukar
positif palsu dengan negatif palsu); `onerror=` telanjang di luar tag tidak
dibuang (teks inert); zero-width dibuang di masukan tetapi tidak di keluaran;
batas 5 lintasan menyisakan residu TERLIHAT — disengaja, sebab loop tanpa batas
adalah vektor DoS. Security review mencoba menggiring batas itu agar menyisakan
residu yang DAPAT DIEKSEKUSI dan gagal: `[^>]*` yang rakus meruntuhkan
`<scr<script>ipt>` dalam satu lintasan.

### Next steps

* **PR-044b** — `core/ai/cache.ts` + AC-1/AC-5. Kontrak yang 044a wariskan dan
  harus stabil: `PromptTemplate.id` (bahan hash kunci) dan `AiChatRequest` hasil
  `bangun()` (`timeoutMs` dikecualikan dari kunci). Keputusan yang masih harus
  diambil: (b) hit vs kuota, (c) hit vs `ai_usage`, (e) TTL/`userId`/PII. Nama
  "Cache Semantik" di judul PR-044 KELIRU — spec sendiri menulis
  hash(input+versi) = pencocokan persis; namai jujur di 044b.
* **PR fitur AI pertama** — memakai `spesimenV1` sebagai contoh, bukan sebagai
  prompt; menulis templatenya sendiri di `core/ai/prompts/`, dan mengisi
  `AiCallContext.promptVersion` dengan `template.id`.

---

## PR-044b — Cache Prompt (`core/ai/cache.ts`)

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md)
> **Tanggal:** 2026-09-04
> **Status:** Selesai (separuh kedua PR-044; melengkapi registry PR-044a)

### Ringkasan hasil

Separuh kedua PR-044. **044a membangun mekanisme prompt** (registry berversi +
guard injeksi); **044b membangun cache-nya**, dan hanya ia yang menyentuh
`client.ts`, kuota, dan Redis. Yang diselesaikan di sini adalah dua AC yang
sengaja ditinggalkan 044a: **AC-1** ("naikkan versi prompt → cache lama tidak
terpakai") dan **AC-5** ("cache hit tercatat (metrik hemat kuota)").

Nama "Cache Semantik" pada judul PR-044 memang KELIRU dan tidak dipakai: yang
dibangun adalah pencocokan PERSIS atas `hash(input + template)`, sesuai spec-nya
sendiri. Tidak ada cache embedding di sini.

**AC-1 terpenuhi, dan terpenuhi LEBIH KUAT daripada bunyinya.** Kunci cache
memuat `template.id` (`"<nama>.v<versi>"`), jadi menaikkan `versi` membuat entri
lama TIDAK TERJANGKAU — bukan sekadar diabaikan. Di luar itu kunci juga memuat
`template.sidik`, sidik atas bagian STATIS template, sehingga **menyunting isi
template tanpa menaikkan `versi` pun membatalkan entrinya** — kasus yang bunyi
AC-nya sendiri biarkan terbuka. Dibuktikan di tiga tingkat: tingkat kunci,
tingkat cache (`tulis` nyata → `baca` nyata, diassert DUA arah), dan ujung ke
ujung atas cacah panggilan `chatJson` (1 → 1 → 2), yakni atas observable yang
benar-benar berbiaya.

**AC-5 terpenuhi sebagai METRIK**, dan "metrik" itulah kata yang AC pakai:
`ai_cache.hit` / `ai_cache.miss` lewat port metrik yang SUDAH ada di repo. Hit
DAN miss sama-sama dicacah — tanpa penyebut, "hemat" tidak terbaca.

Gate hijau: `pnpm --filter @nawasena/api test` → **Test Files 84 passed (84)**,
**Tests 1232 passed | 1 skipped (1233)**; `tsc --noEmit` **exit 0**; `lint`
**exit 0**.

### Scope selesai

* **`core/ai/cache.ts`** (baru) — `kunciCachePrompt()` (derivasi kunci),
  `createAiPromptCache()` (`baca`/`tulis`), serialisasi kanonik + sha256,
  konstanta `AI_CACHE_PREFIX = "ai:prompt:v1:"`, `METRIK_CACHE_HIT =
  "ai_cache.hit"`, `METRIK_CACHE_MISS = "ai_cache.miss"`, dan antarmuka sempit
  `CacheRedisLike` (pola `QuotaRedisLike`/`OtpRedisLike`) supaya aturannya bisa
  dibuktikan tanpa Docker.
  Bentuk kuncinya:
  `ai:prompt:v1:<template.id>:<template.sidik>:<feature>:<pemilik>:<sha256(input)>`
  dengan `pemilik` = `u:<userId>` (default) atau `bersama`.
* **`core/ai/prompts/tipe.ts` + `definisi.ts`** — `PromptSpec.lingkup?`,
  `PromptTemplate.lingkup` (default `"pengguna"`), `PromptTemplate.sidik`
  (dihitung SEKALI di `definePrompt`), `cacheTtlDetik` + `jepitTtl`
  (`PROMPT_CACHE_TTL_DEFAULT_DETIK` 3600, `PROMPT_CACHE_TTL_MAKS_DETIK` 86400).
* **`core/ai/client.ts`** — jalur baru `AiClient.prompt(ctx, template, input)`:
  cache → kuota → provider → baris `ai_usage` → tulis cache. `chat`/`json`/
  `embed` TIDAK disentuh; `AiClientDeps.cache` opsional, dan absennya = perilaku
  persis pra-PR (ada test-nya).
* **`core/ai/quota.ts`** — `AiQuotaPemakaian.lewatiGlobal?`,
  `AiQuotaReservasi.global` (WAJIB), DECR global bersyarat di `kembalikan`.
* **Barrel `core/ai/index.ts`** — satu blok ekspor baru, berikut peringatan
  gerbang boot yang sama seperti blok kuota/client/prompt.
* **`core/logger/index.ts`** — satu jalur redaksi baru `"err.command.args"`
  (lihat F1; ini SATU-SATUNYA suntingan PR ini di luar permukaannya sendiri).
* **Penjaga & test baru** — `__tests__/ai-cache.test.ts` (46 kasus),
  `__tests__/prompt-cache-lingkup.test.ts` (6, penjaga allow-list `lingkup`),
  6 kasus tambahan di `ai-quota.test.ts`, 1 di `logger.test.ts`.

### Keputusan owner (2026-09-03) — MENGIKAT, berikut konsekuensi jujurnya

Tiga pertanyaan yang 044a tinggalkan terbuka diputuskan owner SEBELUM
implementasi. Ketiganya mengikat; yang ditulis di bawah bukan hanya isinya,
melainkan juga harga yang ikut dibeli.

* **(b) Cache hit MEMOTONG jatah PENGGUNA, tetapi TIDAK memotong pagu GLOBAL.**
  Alasannya fungsi masing-masing penghitung: jatah per pengguna adalah kendali
  **anti-abuse**, pagu global adalah kendali **BIAYA** — dan cache hit tidak
  berbiaya. Jahitannya memang sudah terpisah sejak 043a (`kunciKuotaUser` vs
  `kunciKuotaGlobal`).
  **Konsekuensi jujur:** pengguna TIDAK melihat jatahnya jadi lebih awet. Yang
  diuntungkan cache adalah tier gratis platform, bukan orang yang mengetik. Bila
  suatu hari sebuah fitur MENJANJIKAN "gratis kalau dari cache" kepada pengguna,
  janji itu bertabrakan dengan keputusan ini, bukan dengan kodenya.
* **(c) Hit TIDAK menulis baris `ai_usage`; cukup METRIK.** Hit tidak berbiaya,
  jadi baris 0-token akan merusak rekonsiliasi tagihan yang baru dibangun
  PR-043b — dan 0/0 di sana SUDAH punya arti lain ("embed", `client.ts` 043b).
  AC-5 sendiri meminta metrik.
  **Konsekuensi jujur, dan ini WAJIB diketahui siapa pun yang membaca
  `ai_usage`: cacah PANGGILAN tidak lagi sama dengan cacah BARIS.** Begitu ada
  pemanggil produksi, `SELECT count(*) FROM ai_usage` menjawab "berapa kali kita
  membayar provider", BUKAN "berapa kali fitur dipakai". Angka kedua hanya
  tersedia lewat `ai_cache.hit` + `ai_cache.miss`.
* **(e) Kunci ber-`userId` sebagai DEFAULT; berbagi HANYA bila template
  menyatakannya** (`lingkup: "bersama"`). Mengikuti default-terbalik 044a: lupa
  menandai = jatuh ke sisi aman. Nilai yang disimpan adalah jawaban AI atas
  masukan pengguna; pada produk data disabilitas, cache bersama tanpa syarat =
  kebocoran lintas akun.
  **Konsekuensi jujur:** hit-rate lintas pengguna nol secara default, dan itu
  memang harga yang dipilih. Entri bersama disediakan untuk template yang
  masukannya benar-benar data publik (mis. re-rank lowongan), dan hanya lewat
  allow-list beralasan di `prompt-cache-lingkup.test.ts`.

### Penyimpangan dari SDD §7.1 (WAJIB dibaca) — D9

Ada **dua** diskrepansi terhadap SDD §7.1. Keduanya ditulis di sini alih-alih
diselesaikan diam-diam, karena keduanya akan dibaca orang lain sebagai spesifikasi.

1. **Urutan cache/kuota DIBALIK, dengan sengaja.** SDD §7.1 menaruh pemeriksaan
   kuota SEBELUM pemeriksaan cache. Yang diterapkan kebalikannya: **cache dulu,
   baru `periksaDanPakai({ lewatiGlobal: true })`.**
   Alasannya bukan selera. Memeriksa kuota lebih dulu berarti pagu global sudah
   ter-INCR ketika ternyata jawabannya ada di cache, sehingga dibutuhkan **refund
   parsial** — mengembalikan satu penghitung tetapi tidak yang lain, di dalam
   jendela di mana Redis bisa gagal di tengah. Itu PERSIS kelas bug PR-043b.
   Memeriksa cache lebih dulu adalah satu-satunya urutan yang **tidak butuh
   refund sama sekali**, dan karena itu satu-satunya yang tidak bisa MENCETAK
   kuota. Tidak ada mesin refund parsial yang dibangun di PR ini.
2. **Baris SDD §7.1 "re-rank 3 refresh feed/hari (sisanya dari cache)"
   BERTENTANGAN dengan keputusan owner (b).** Kalimat itu hanya masuk akal bila
   cache hit TIDAK memotong jatah pengguna — kebalikan dari (b). **(b) tetap
   mengikat dan TIDAK dibuka ulang di PR ini.**
   **Akibat yang harus disadari sekarang, bukan nanti: PR-072 (re-rank) akan
   membaca SDD, menemukan jatah "3 refresh/hari", dan mendapati jatah itu TIDAK
   PERNAH CUKUP** — sebab pada implementasi ini setiap refresh memotong jatah
   pengguna, dari cache maupun tidak. PR-072 harus memilih secara SADAR: menaikkan
   angka jatahnya, menandai templatenya `lingkup: "bersama"`, atau mengusulkan
   pembukaan kembali keputusan (b) kepada owner. Yang TIDAK boleh dilakukan adalah
   menganggap SDD dan kode ini sepakat.

### Keputusan teknis

* **D1 — Kunci dihitung dari INPUT MENTAH + template, BUKAN dari
  `AiChatRequest`.** `bangun()` menempelkan nonce ACAK per panggilan (guard
  044a), jadi hash atas `messages` akan memberi hit-rate **0% di produksi
  sambil lulus test**. Konsekuensi bentuknya: cache duduk di lapisan PROMPT
  (`template` + `input` + `ctx`), bukan di `AiClient.json(request)`. Dijaga test
  yang lebih dulu membuktikan `messages` memang berbeda antar-panggilan, lalu
  menuntut kuncinya tetap sama.
* **D2 — Bentuk (B): cek cache dulu, lalu kuota dengan `lewatiGlobal`.** Lihat
  D9 di atas untuk alasannya. Perubahan API kuota dibatasi tiga hal (di bawah).
* **D3 — `template.sidik` menutup "menyunting `system` tanpa menaikkan
  `versi`".** Bahannya `id` + `system` + `fewShot` + `temperature` +
  `maxOutputTokens` (+ `tepercaya` terurut dan `maksKarakter`, tambahan F6),
  dihitung SEKALI di `definePrompt`. Aman karena asimetri: bahan tambahan hanya
  bisa menyebabkan MISS ekstra, tidak pernah HIT basi. `id` tetap satu-satunya
  sumbu versi yang DINYATAKAN, dan satu-satunya yang masuk
  `ai_usage.prompt_version`.
* **D4 — Serialisasi kanonik:** kunci objek diurutkan rekursif, `Date` → ISO,
  properti `undefined` dibuang (semantik JSON), **urutan LARIK dipertahankan**
  (urutan itu bermakna; menyamakannya akan menghasilkan HIT PALSU, yang lebih
  buruk daripada miss). sha256 dari `node:crypto`, preseden `core/auth/tokens.ts`
  — tanpa pustaka baru.
* **D5 — Nilai cache DIPARSE ULANG lewat `template.output` saat dibaca.** Entri
  Redis adalah masukan tak tepercaya begitu ia keluar, dan biaya zod nol
  dibanding panggilan LLM. Efek sampingnya penting: karena `template.output`
  adalah `spec.output.transform(bersihkanKeluaran)`, **sanitizer 044a ikut
  berjalan di jalur hit**, bukan hanya di jalur provider. Entri cacat atau basi
  skema = MISS, bukan lemparan.
* **D6 — GAGAL TERBUKA di setiap titik.** Redis mati, JSON cacat, entri basi
  skema, input tak terserialisasi, `userId` kosong — semuanya menjadi MISS dan
  tak satu pun melempar. Cache yang gagal TERTUTUP akan memadamkan AI demi
  penghematan. Korolarinya yang menenangkan: gagal-terbuka jatuh ke cabang yang
  LEBIH KETAT (dua penghitung + baris `ai_usage`), jadi kegagalan cache tidak
  pernah bisa berubah menjadi jalan pintas kuota.
* **D8 — Memakai port metrik yang SUDAH ada** (`metrics?: { increment(name) }`,
  pola `ai-usage.service.ts`), bukan konvensi kedua.

**Perubahan API kuota — tiga hal, dan kelas bug yang dijaganya:**

1. `AiQuotaPemakaian.lewatiGlobal?: boolean` — **opsional**, default `false`
   lewat destrukturisasi, jadi setiap pemanggil lama berperilaku persis seperti
   sebelumnya.
2. `AiQuotaReservasi.global: boolean` — **wajib, dan sengaja BUKAN opsional.**
   Bila ia opsional, pemanggil bisa lupa mengisinya dan diam-diam mendapat cabang
   "jangan pernah kembalikan pagu global". Wajib berarti `tsc` memaksa setiap
   tempat konstruksi menyatakan sikapnya; harganya satu baris di dua berkas test,
   dan `tsc --noEmit` hijau membuktikan tak ada tempat konstruksi yang terlewat.
3. `kembalikan()` menurunkan pagu global **hanya** `if (reservasi.global)`.

Tanpa penjaga (3), sebuah reservasi `lewatiGlobal` yang di-refund akan men-DECR
pagu yang TIDAK PERNAH NAIK — yakni **MENCETAK anggaran bersama**. Ini persis
kelas bug PR-043b, jadi ia tidak dipercayakan pada pembacaan: **dibuktikan lewat
mutasi.** Menghapus `if (reservasi.global)` membuat **dua** test merah
("REFUND-nya TIDAK menurunkan pagu global" 3 → 2, dan "`kembalikanBila`
menghormati bit yang sama" 1 → 0). Test-nya sengaja menaikkan pagu global ke 3
lewat lalu lintas pengguna LAIN lebih dulu, supaya lantai nol pada `turunkan()`
tidak menutupi bugnya. Saudaranya, "reservasi biasa tetap menaikkan keduanya dan
menandai `global: true`", menutup celah field yang selalu-`false`.

### Batas yang DITERIMA sadar (pilihan, bukan celah yang belum ketahuan)

* **Cacah panggilan ≠ cacah baris `ai_usage`** — konsekuensi langsung keputusan
  (c). Ditulis ulang di sini karena inilah batas yang paling mudah membuat orang
  salah membaca angka tagihan.
* **TANPA PENGUNCIAN.** Dua permintaan identik yang datang BERSAMAAN sama-sama
  miss dan sama-sama memanggil provider; yang belakangan menimpa entri yang sama.
  Yang hilang hanya penghematan, bukan kebenaran — dan mengunci berarti menambah
  jalur gagal (lock bocor = AI padam) demi kasus yang belum terbukti sering.
  Ditulis supaya ia tidak "ditemukan" orang lain nanti sebagai kejutan.
* **Metrik adalah cacah GLOBAL tanpa label.** Port yang ada berbentuk
  `increment(name)`; menambah argumen kedua akan mengubah tiga pemanggil lain.
  Akibatnya `ai_cache.hit` tidak bisa dipecah per fitur atau per template hari
  ini. Bila kelak diperlukan, itu perubahan pada port-nya, bukan pada berkas ini.
* **Entri cache BERTAHAN melewati penghapusan akun sampai TTL/evict (D10).**
  `purge-kelengkapan.test.ts` hanya memindai model Prisma, jadi kunci ber-`userId`
  di Redis tidak pernah masuk permukaan purge. **Satu-satunya mitigasi adalah TTL
  PENDEK**: default 3600 s, plafon keras 86400 s, dijepit di `definePrompt` DAN
  dijepit ulang di titik cekik penulisan (`tulis`) supaya template rakitan tangan
  pun tidak bisa melewatinya. Konsekuensi turunannya: kunci cache mentah TIDAK
  BOLEH pernah masuk log (lihat F1) — log berada di luar permukaan purge, jadi
  bocor ke log berarti bocor melewati TTL sekaligus melewati penghapusan akun.
* **`dariCache` adalah diagnostik sisi server.** Untuk lingkup per-pengguna ia
  hanya menceritakan riwayat orang itu sendiri; untuk template `lingkup:
  "bersama"` ia memberi tahu apakah ADA ORANG LAIN yang pernah bertanya persis
  itu. Ia TIDAK BOLEH muncul di badan respons HTTP untuk template bersama.

### Verifikasi

* **Angka gerbang akhir (diamati dengan container HIDUP):**
  `pnpm --filter @nawasena/api test` → **Test Files 84 passed (84)**, **Tests
  1232 passed | 1 skipped (1233)** · `pnpm --filter @nawasena/api exec tsc
  --noEmit` → **exit 0** · `lint` (`eslint src __tests__ prisma
  --max-warnings=0`) → **exit 0** · `prettier --check` bersih untuk berkas yang
  disentuh.
* **JEBAKAN ANGKA — dicatat supaya tidak berulang untuk ketiga kalinya.**
  Menjalankan suite dengan Docker MATI menghasilkan `1085 passed | 148 skipped`.
  Itu 147 test berbasis DB/Redis yang MELEWAT, **bukan regresi**. Temuan QC utama
  pada PR-043b MAUPUN PR-044a adalah angka verifikasi yang basi; angka di atas
  diambil dari run dengan Postgres dan kedua Redis menyala, dan hanya angka
  semacam itu yang boleh masuk log.
* **QC: PASS**, nol pemblokir. Sepuluh mutasi terarah dijalankan, **sembilan
  merah**: penjaga refund global, sanitasi keluaran di jalur hit, default
  `lingkup`, `userId` di dalam kunci, rekursi penjaga lingkup, `lewatiGlobal` di
  jalur hit, jepitan TTL kedua, metrik hit, dan redaksi log. Satu yang tetap
  hijau (M2b) adalah lapisan kedua, bukan kendalinya sendiri — ditutup sesudah QC
  (lihat catatan mutu test).
* **Regresi: nihil.** Tiga berkas test yang termodifikasi diperiksa baris per
  baris untuk mencari assertion yang dilonggarkan. `ai-guard.test.ts` (+2/-0) dan
  satu literal di `ai-quota.test.ts` berubah semata karena `AiQuotaReservasi.global`
  wajib — dipaksa kompiler, nilainya benar, assertion-nya utuh. `logger.test.ts`
  (+23/-0) murni penambahan. Tidak ada test yang di-skip, dilemahkan, atau dihapus.
* **Tanpa migrasi, tanpa perubahan skema Prisma, tanpa route baru, tanpa
  perubahan format wire.** `AiClientDeps.cache` opsional dan ketiadaannya diuji
  ("tanpa dep cache: perilakunya persis seperti sebelum PR-044b").

### Security review — PASS; F1–F7 semuanya DIPERBAIKI di PR ini

Verdict **PASS**. Tujuh temuan, nol pemblokir, dan **ketujuhnya diperbaiki di
dalam PR ini** — bukan menjadi utang. Model ancaman yang dipakai: nilai yang
di-cache adalah jawaban AI atas masukan pengguna pada produk ketenagakerjaan
disabilitas, jadi yang pantas dikejar adalah (a) pembacaan lintas akun, (b)
jalur apa pun yang menaruh teks jawaban di tempat yang hidup lebih lama daripada
penghapusan akun, dan (c) penghitung yang bisa bergerak tanpa peristiwa nyata.

**F1 (MEDIUM) — objek error ioredis membawa KUNCI CACHE dan JAWABAN AI ke dalam
log.** Rantainya nyata dan tidak eksotis. ioredis menempelkan perintah beserta
ARGUMENnya pada error yang ia tolak (`err.command = { name, args }`, baik pada
balasan `-ERR` maupun pada `AbortError` saat koneksi putus dengan perintah masih
terbang). Serializer bawaan pino menyalin **setiap properti enumerable** dari
`err` ke dalam record. Dan `REDACTION_PATHS` kami tidak punya satu pun jalur yang
mencakupnya. Akibatnya satu `SET` yang gagal — `MISCONF`, `OOM`, `NOAUTH`, `ERR
max number of clients`, atau sekadar `redis-cache` yang restart — menuliskan
`err.command.args = ["ai:prompt:v1:…:u:<userId>:<hash>", "{…jawaban lengkap…}",
"EX", 3600]` ke log apa adanya. Tidak perlu penyerang, dan tidak ada yang bisa
mencegahnya. Yang dirusaknya bukan kerapian melainkan **disiplin retensi**: log
berada di luar permukaan purge, jadi teks jawaban lolos dari TTL yang D10
tetapkan sebagai SATU-SATUNYA kendali privasi untuk data ini. Berkas `cache.ts`
bahkan menyatakan invarian itu di kepalanya sendiri, dan sebuah test tampak
membuktikannya (ternyata tidak — lihat catatan mutu test).
**Diperbaiki DUA LAPIS, sengaja:** (i) penyempitan lokal di `cache.ts` — yang
diserahkan ke logger adalah `namaError(err)`, bukan `err`; (ii) jalur redaksi
baru `"err.command.args"` di `core/logger/index.ts`.
**Dua hal yang wajib diketahui tentang lapis (ii):**
* Ia adalah **satu-satunya suntingan PR ini yang keluar dari permukaan
  PR-044b sendiri**. Itu disengaja dan bukan penyelundupan scope: ia sekaligus
  menutup kebocoran PRA-ADA yang sama bentuknya di `quota.ts:291,307,460`, di
  mana yang bocor adalah kunci kuota — yaitu `userId` — warisan PR-043a/043b.
* Korolarinya: **bila kelak ada yang menghapus jalur redaksi itu, paparan kuota
  tadi KEMBALI**, dan satu-satunya yang menjaganya adalah kasus baru di
  `logger.test.ts`. Jangan "membersihkan" `REDACTION_PATHS` tanpa membaca ini.

**F2 (MEDIUM) — penjaga lingkup bersama hanya memindai LEVEL ATAS `prompts/`.**
Padahal penjaga 044a sendiri secara eksplisit MENGIZINKAN template berada di
subdirektori (`startsWith(prefiksPrompts)`). Jadi `prompts/matching/rerank.v1.ts`
adalah lokasi yang sah menurut 044a dan **tak terlihat** oleh penjaga 044b —
sementara PR-072 (re-rank) justru PR yang paling mungkin menginginkan
`lingkup: "bersama"`, dan memindahkan template ke subfolder adalah gerakan wajar
begitu template lebih dari satu. Entri cache lintas akun bisa lolos hijau.
Test anti-hampa yang ada tidak menangkapnya: ia hanya menuntut ADA berkas
`*.vN.ts` di level atas, dan `spesimen.v1.ts` memenuhinya selamanya.
**Diperbaiki:** pemindainya kini REKURSIF, allow-list dikunci pada path relatif,
dan ada assertion yang menuntut pemindainya benar-benar TURUN ke subfolder
(`toEqual(["datar.v1.ts", "matching/rerank.v1.ts"])` di atas pohon sementara —
pemindai yang tidak turun gagal pada perbandingan larik, bukan pada panjangnya).

**Empat sisanya, ringkas:**

* **F3 (LOW)** — plafon TTL, satu-satunya mitigasi PDP, ditegakkan di waktu
  DEFINISI saja. `PromptTemplate` adalah interface ter-ekspor, jadi template
  rakitan tangan dengan `cacheTtlDetik: 31_536_000` akan menyimpan jawaban
  turunan-pengguna selama setahun tanpa satu test pun merah. **Diperbaiki**
  dengan menjepit ULANG di `tulis`, titik cekik penulisan; ia sekaligus menutup
  kasus `EX 0` / `EX -1` yang gagal menulis diam-diam.
* **F4 (LOW)** — `ctx.userId` masuk kunci tanpa validasi; `""` atau id sintetis
  membuat banyak pemanggil runtuh menjadi satu entri de-facto bersama tanpa ada
  yang menyentuh `lingkup`. **Diperbaiki:** `userId` kosong/bukan-string =
  tidak-bisa-di-cache (bentuk gagal-terbuka yang sudah ada).
  *Yang DIKESAMPINGKAN setelah diperiksa:* injeksi delimiter pada kunci tidak
  mungkin — sufiks `sha256` selalu 64 heks dan berada di paling belakang, jadi
  kesamaan kunci memaksa kesamaan `pemilik`.
* **F5 (LOW)** — `dariCache` sebagai orakel lintas pengguna untuk template
  bersama. **Diperbaiki** sebagai dokumentasi kontrak di komentar
  `AiPromptResponse` (lihat "Batas yang diterima").
* **F6 (LOW)** — `sidik` semula tidak memuat `tepercaya`/`maksKarakter`, sehingga
  MEMPERKETAT pertahanan injeksi tidak membatalkan jawaban yang lahir di bawah
  aturan longgar (terbatas TTL, dan tidak lintas pengguna). **Diperbaiki** dengan
  memasukkan keduanya ke bahan sidik; argumen asimetri D3 berlaku tanpa berubah.
* **F7 (INFO)** — pembacaan cache adalah satu-satunya pintu JSON tak tepercaya di
  `core/ai`. `z.object` hari ini MENGUPAS kunci asing, tetapi skema `.passthrough()`
  / `z.record()` / `z.any()` di masa depan tidak. **Dicatat** di doc `PromptSpec.output`
  supaya pemilih skema berikutnya tahu skemanya dipakai dua kali.

### Catatan mutu test — dicatat sebagai pelajaran, bukan disembunyikan

**Test F1 semula HAMPA.** Ia menggerakkan kegagalan dengan Redis palsu yang
menolak dengan `new Error("…")` biasa — error TANPA properti `command`. Karena
itu assertion `not.toContain(userId)` / `not.toContain(jawaban)` tidak mungkin
gagal, apa pun yang dilakukan kode terhadap `err`; ia lulus di atas kode yang
BOCOR, yang persis cacat F1. Dibangun ulang: error palsunya kini membawa
`command = { name, args }` dengan kunci dan payload `SET` sungguhan (bentuk
ioredis yang nyata), dialirkan lewat **pino sungguhan** ke `Writable` yang
ditangkap, dan sebelum `not.toContain` ia lebih dulu menuntut streamnya TIDAK
kosong dan memuat `template.id` — supaya stream yang tak pernah tertulis tidak
bisa membuatnya lulus hampa.

**Celah lanjutan (N1) ditutup SESUDAH QC.** Penyempitan lokal `namaError` pada
tiga jalur ioredis ternyata hanya terlindungi BERSAMA redaksi pino: mencabutnya
SENDIRIAN tidak membuat satu test pun merah (mutasi M2b hijau 45/45), sementara
mencabut keduanya baru merah. Lapisan yang tidak ada test-nya gagal saat ia
dihapus adalah lapisan yang membusuk diam-diam — dan kandidat "penyederhanaan"
pertama bagi penulis berikutnya. Ditambah satu test yang menguji lapisan lokal
SENDIRIAN, dengan mengassert field `err` yang terserialisasi bertipe **string**,
bukan objek. Dibuktikan: mutasi hanya pada tiga baris itu (redaksi utuh) →
**MERAH, 1 gagal / 45 lulus**; berkas dipulihkan byte-identik (md5 cocok).

**Pelajaran untuk PR berikutnya, karena ini kali kedua di phase yang sama** (044a
punya enam test parametrik yang hampa): sebuah test kebocoran-log hanya bernilai
sebesar REALISME objek error yang ia lemparkan, dan sebuah pertahanan berlapis
hanya terjaga bila SETIAP lapisnya punya mutasi yang menjatuhkannya sendirian.

### Ukuran PR

**~1.957 baris ditambahkan — 795 produksi + 1.162 test — JAUH di atas panduan
500 pada CLAUDE.md §9.** Rinciannya: 367 sisipan pada `apps/api/src` yang sudah
terlacak + 428 baris `cache.ts` baru (produksi); 132 sisipan pada test terlacak +
1.030 baris `ai-cache.test.ts` & `prompt-cache-lingkup.test.ts` (test). Ditambah
29 penghapusan.

**Angka ini dikoreksi saat penutupan, dan koreksinya sendiri layak dicatat.**
Review QC melaporkan "~510 LOC" — angka itu KELIRU: ia hanya menghitung diff
terlacak dan sama sekali melewatkan tiga berkas baru, yang justru memuat
sebagian besar isi PR ini. Kesalahan yang sama persis (angka log yang tidak
diverifikasi ulang) adalah temuan QC utama pada PR-043b DAN PR-044a. Ia nyaris
terulang untuk ketiga kalinya di sini, dan tertangkap hanya karena penulis log
menolak mencatat angka yang tidak bisa ia rekonsiliasi sendiri. Pelajarannya
bukan "hitung lebih teliti", melainkan: **angka yang diwariskan antar-tahap
wajib dihitung ulang di tahap yang mencatatnya.**

Pengecualian ukurannya tetap DISENGAJA dan bukan kelalaian — tetapi harus dibaca
dengan angka yang benar, yakni ~4× panduan, bukan sedikit di atasnya. Memecahnya
berarti mengirim perubahan API kuota (`lewatiGlobal`, `AiQuotaReservasi.global`)
**tanpa satu pun pemanggil** — yakni sebuah field `readonly global` yang cabang
`false`-nya tidak dijalankan apa pun. Itu persis bentuk "field yang selalu
bernilai sama" yang test anti-hampa di PR ini ada untuk mencegahnya. Pemecahan
di sini menghasilkan keadaan antara yang LEBIH SULIT diverifikasi, bukan potongan
review yang lebih kecil.

Yang perlu diketahui pembaca berikutnya: dari 795 baris produksi itu, mayoritas
adalah komentar padat sesuai gaya repo ini (`cache.ts` sendiri lebih banyak
komentar daripada kode). Itu MENJELASKAN angkanya, tetapi tidak membatalkannya —
PR sebesar ini tetap lebih sulit direview, dan keputusan untuk tidak memecahnya
adalah keputusan sadar milik owner, bukan sesuatu yang tersembunyi di balik
angka yang terlalu kecil.

### Risiko yang ditemukan

* **Belum ada satu pun yang MENJALANKAN kode ini.** `boot.ts` masih belum
  merakit `aiClient` (utang D9 PR-043b) dan kini juga belum merakit
  `createAiPromptCache`. Jadi seluruh temuan di atas bersifat menghadap-masa-depan,
  bukan insiden hidup — dan sekaligus: jaminan apa pun di PR ini hari ini hanya
  sekuat test-nya.
* **Utang F1 PR-043b MASIH TERBUKA.** Tidak ada penjaga struktural yang melarang
  sebuah modul memanggil `createAiGateway` langsung, melewati kuota — dan kini
  juga melewati cache. Remediasinya tetap wajib menyertai PR fitur AI pertama,
  bersama tiga baris wiring `boot.ts`.
* **`prompt-registry.test.ts` (PR-044a) masih NON-REKURSIF.** Setelah F2
  diperbaiki, ia menjadi satu-satunya pemindai atas `prompts/` yang masih
  berhenti di level atas: template di subdirektori tak terlihat oleh penjaga
  "setiap `<nama>.vN.ts` terdaftar" dan "`id` === nama berkas". Akar masalahnya
  sama dengan F2, perbaikannya satu suntingan — tidak dikerjakan di sini karena ia
  permukaan 044a.
* **`ai_cache.hit`/`miss` belum punya sink produksi**, sama seperti metrik 043b:
  backend metrik belum ada (ADR-017) dan `metrics` baru terpasang saat `boot.ts`
  di-wire. Sampai saat itu AC-5 terbukti di test, belum terlihat di operasi.
* **Penjaga `lingkup: "bersama"` hanya bisa TEKSTUAL.** `PROMPT_REGISTRY`
  sengaja menyimpan `{nama, versi, id}` dan bukan templatenya (D6 044a), jadi
  assertion runtime atas `lingkup` setiap template terdaftar tidak tersedia hari
  ini. Allow-list yang KOSONG dengan pemindai yang bekerja adalah keadaan
  terkuat penjaga ini — tetapi "kosong" dan "tidak memindai" terlihat sama dari
  luar, dan itulah sebabnya assertion "pemindainya benar-benar turun" wajib ada.

### Next steps

* **PR fitur AI pertama** — tiga baris wiring `boot.ts` (D9 043b) **plus**
  perakitan `createAiPromptCache` di atas `redis.cache` (bukan `redis.queue`:
  cache BOLEH ter-evict, evict hanya berarti miss), **plus** penjaga F1 043b.
  Ketiganya dalam PR yang sama; wiring tanpa penjaga hanya memindahkan lubangnya.
* **PR-072 (re-rank)** — baca "Penyimpangan dari SDD §7.1" di atas SEBELUM
  memakai angka "3 refresh/hari" dari SDD. Ia juga kandidat pertama
  `lingkup: "bersama"`, yang berarti kandidat pertama entri allow-list beralasan
  di `prompt-cache-lingkup.test.ts` — dan `dariCache` tidak boleh ikut ke badan
  respons HTTP-nya.
* **Utang kecil yang layak dibayar sekalian:** membuat
  `prompt-registry.test.ts` rekursif (satu suntingan, akar sama dengan F2).
* **Bila metrik per-fitur kelak dibutuhkan**, ubah PORT-nya
  (`increment(name, label?)`) sekaligus untuk tiga pemanggil lain — jangan
  menambahkan konvensi metrik kedua khusus cache.

---

## PR-045 — SSE Streaming (`core/http/sse.ts`, `core/ai/stream.ts`)

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md)
> **Tanggal:** 2026-09-04
> **Status:** Selesai (infrastruktur; belum terpasang ke route mana pun)

### Ringkasan hasil

Infrastruktur streaming AI: bingkai SSE, detak jantung, penyambungan ulang,
tekanan balik, dan `chatStream()` pada gateway. **Belum ada endpoint** — itu
PR-066, dan hook web-nya PR-068.

Pemisahan berkas adalah keputusan utama PR ini: `core/http/sse.ts` TIDAK tahu
apa-apa tentang AI, `core/ai/stream.ts` tidak tahu apa-apa tentang `res` milik
Express, dan satu-satunya titik temunya adalah `alirkanKeSse`. Akibat langsung
yang membuat pemisahan ini layak: **kelima Acceptance Criteria dapat diuji
tanpa server, tanpa soket, tanpa provider, dan tanpa timer nyata** — 21 test
di `sse.test.ts` dan 18 di `ai-stream.test.ts` memakai respons palsu,
penjadwal manual, dan jam suntik. Aturan yang hanya bisa dibuktikan dengan
menunggu adalah aturan yang test-nya akhirnya di-skip.

Gate hijau: `pnpm --filter @nawasena/api test` → **Test Files 86 passed (86)**,
**Tests 1271 passed | 1 skipped (1272)**; `tsc --noEmit` **exit 0**; `lint`
**exit 0**; `prettier --check` bersih untuk keenam berkas yang disentuh.

### Acceptance Criteria

* **AC-1 — putus → sambung tanpa token duplikat/hilang.** Terpenuhi, dan inti
  seluruh PR. Tiap event bernomor (`id:`); `Last-Event-Id` menentukan titik
  putar ulang; hanya event `> lastEventId` dikirim ulang (tanpa duplikat).
* **AC-2 — detak 15 detik saat menganggur.** Terpenuhi sebagai KOMENTAR SSE
  (`: detak`), yang tidak memicu event di klien dan **tidak memajukan
  penomoran** — memajukannya akan membuat sambung-ulang meminta event yang
  tidak pernah ada.
* **AC-3 — klien lambat tidak menumpuk memori.** Dua batas sekaligus:
  `write()` yang mengembalikan `false` MENAHAN produsen sampai `drain`, dan
  cincin event per sesi berkapasitas tetap (256) adalah plafon memorinya.
* **AC-4 — galat mid-stream sebagai event terstruktur.** Event `error` dengan
  amplop `{code,message,hint}` yang sama seperti error HTTP repo ini.
* **AC-5 — kompatibel `proxy_buffering off`.** `X-Accel-Buffering: no` +
  `Cache-Control: no-cache, no-transform`. Dicatat untuk PR-098.

### Keputusan teknis

* **Lompatan yang tidak tertutup DILAPORKAN, bukan disambung diam-diam.** Ini
  keputusan paling penting di PR ini. Implementasi naif memutar ulang apa yang
  kebetulan masih tersimpan lalu melanjutkan — klien menerima jawaban yang
  MULUS namun BOLONG di tengah, tanpa error dan tanpa gejala. Bila bagian yang
  hilang sudah ter-evict dari cincin, sambungan ditolak dengan
  `SSE_LOMPATAN_TIDAK_TERTUTUP`. **Kehilangan yang dilaporkan bisa ditangani
  produk; kehilangan yang disembunyikan tidak bisa.**
* **Cadangan provider HANYA sebelum token pertama.** Aturan korektness, bukan
  penyederhanaan: berpindah provider di tengah berarti menyambung dua jawaban
  dari dua model menjadi satu paragraf — kalimat berubah arah di tengah, dan
  klien tidak punya cara apa pun untuk mengetahuinya. Kegagalan SESUDAH token
  pertama wajib muncul sebagai galat (AC-4).
* **Penyangga sisa antar potongan pada pembaca SSE provider.** Potongan dari
  `fetch` TIDAK sejajar dengan bingkai SSE. Pembaca yang mengurai per potongan
  lulus sempurna di test yang memberi satu bingkai per potongan, lalu memotong
  token secara acak di jaringan nyata — kegagalan yang hanya muncul di 3G,
  yaitu justru jaringan yang PR ini ada untuk melayaninya.
* **Normalisasi `\r\n` dan `\r`, bukan hanya `\n`.** SSE memperlakukan
  ketiganya sebagai pemisah baris; memecah hanya pada `\n` meninggalkan `\r`
  menggantung yang dibaca klien sebagai pemisah kedua.
* **Kemampuan streaming sebagai antarmuka TERPISAH** (`AiStreamProvider`),
  bukan ditempelkan ke `AiProvider`. `AiProvider` juga dipenuhi provider
  "belum dikonfigurasi" dan pembungkus breaker/router; memaksa `chatStream` ke
  sana berarti kegagalannya baru terlihat saat dipanggil. Terpisah, "bisa
  streaming?" menjadi pertanyaan yang bisa dijawab sebelum satu byte dikirim
  (`dukungStream`).
* **Penjadwal detak DISUNTIK**, bukan `setInterval` langsung — aturan repo
  yang sama dengan `breaker.ts`/`quota.ts`, dan alasannya sama: fake timer
  tidak menggerakkan `AbortSignal.timeout`.
* **Nama event divalidasi.** Sebuah `\n` di dalamnya menyuntikkan field SSE
  palsu ke aliran — bentuk injeksi yang sama seperti header HTTP.

### Batas yang DITERIMA sadar

* **Penyangga sambung-ulang hidup DI MEMORI PROSES.** Dengan dua replika
  (SDD §19), sambungan ulang yang mendarat di proses lain tidak menemukan
  sesinya. Itu benar dan aman (klien memulai ulang), bukan diam-diam salah.
  Membuatnya lintas-proses menuntut Redis per token — mahal, dan `redis.cache`
  justru boleh meng-evict, yang mengembalikan persoalan bolong yang sama.
  **Jalannya sticky routing di PR-098**, bukan Redis.
* **Streaming BELUM memotong kuota dan belum menulis `ai_usage`.** `AiClient`
  (PR-043b) membungkus `chat`/`json`/`embed`, bukan `chatStream`. Selama belum
  ada endpoint, tidak ada yang terekspos — tetapi **PR-066 WAJIB menutup ini
  sebelum route-nya hidup**, kalau tidak streaming menjadi jalur AI tanpa
  kuota dan tanpa jejak biaya.
* **Detak tidak menunggu `drain`.** Klien yang buffernya penuh sudah terbukti
  hidup; memaksa detak mengantre di belakangnya hanya menambah beban.
* **Verifikasi manual throttling 3G belum dilakukan** (checklist PR-045). Ia
  menuntut endpoint, jadi jatuh ke PR-066/PR-068.

### Verifikasi

* `pnpm --filter @nawasena/api test` → **86 berkas / 1271 lulus / 1 skipped**.
  Basis sebelum PR ini 84/1232/1; selisihnya persis +2 berkas dan +39 test
  (21 SSE + 18 stream).
* **Empat mutasi dijalankan, semuanya merah:** menghapus deteksi lompatan
  (2 merah); detak tanpa cek menganggur (1 merah); menghapus normalisasi `\r`
  (1 merah); cadangan provider dibolehkan sesudah token pertama (1 merah).
  Seluruh berkas dipulihkan byte-identik (md5 dicocokkan).
* **Catatan jebakan angka:** menjalankan suite dengan Docker MATI memberi
  ~148 test skipped — itu test berbasis DB/Redis yang MELEWAT, bukan regresi.
  Angka di atas diambil dengan container hidup.

### Risiko yang ditemukan

* **Belum ada satu pun yang MENJALANKAN kode ini.** `boot.ts` tidak merakit
  apa pun dari PR ini, sama seperti `aiClient` (PR-043b) dan cache (PR-044b).
  Tiga utang perakitan kini menumpuk di satu tempat dan sebaiknya dibayar
  sekaligus saat fitur AI pertama mendarat.
* **`SSE_SESI_TIDAK_DIKENAL` disebut di komentar kepala `sse.ts` tetapi belum
  ada registry sesi** — pencarian sesi berdasarkan id adalah milik PR-066,
  yang juga menentukan masa hidup dan plafon jumlah sesi. Tanpa plafon itu,
  registry sesi adalah permukaan kehabisan memori; catat sebagai syarat masuk
  PR-066.
* **Ukuran PR ~1.417 baris** (743 produksi + 674 test), ~2,8× panduan §9.
  Lebih kecil dari PR-044b tetapi tetap di atas panduan; mayoritas produksi
  adalah komentar padat sesuai gaya repo.

### Next steps

* **PR-046** — `DegradedError` + lint no-direct-provider; ia yang memberi
  `alirkanKeSse` peta error→degradasi yang sebenarnya.
* **PR-066** — endpoint cv-chat: registry sesi (berplafon), auth di handshake
  lewat HEADER (bukan token di query), **dan kuota + `ai_usage` untuk jalur
  streaming**.
* **PR-098** — nginx `proxy_buffering off` + sticky routing, keduanya sudah
  disiapkan header dan batasnya di sini.

---

## PR-046 — Kontrak Degradasi + Lint No-Direct-Provider (`core/ai/degraded.ts`)

> **Phase:** [06 - AI Gateway](../phase-06-ai-gateway.md)
> **Tanggal:** 2026-09-05
> **Status:** Selesai (kontrak; belum terpasang ke endpoint mana pun)

### Ringkasan hasil

Lapisan tata kelola penutup Phase 06. Tidak ada integrasi LLM baru, tidak ada
endpoint, tidak ada perubahan DB. Yang lahir: `DegradedError` + `isDegradedError`
+ `withDegradation` di `core/ai/degraded.ts`, `meta.degraded` pada envelope
sukses (`@nawasena/schemas`), dan tabel pola degradasi per fitur di dokumen
phase.

**Yang membuat PR ini bukan kode mati:** satu-satunya titik lempar yang MEMANG
sudah merupakan degradasi — `tolak()` di `quota.ts` — dipindahkan dari
`appError(KUOTA_AI_HABIS, …)` ke `new DegradedError(KUOTA_AI_HABIS, …)`. Kode,
status, dan `Retry-After`-nya tidak berubah sedikit pun, jadi `isKuotaHabis`
dan seluruh test kuota yang membaca `.code` tetap hijau tanpa disentuh. Sejak
PR ini, "jatah AI habis" adalah satu-satunya kegagalan di `core/ai` yang boleh
diturunkan ke jalur non-AI — dan itu tertulis di kode, bukan di komentar.

Gate hijau: `pnpm lint` **9/9**, `pnpm typecheck` **9/9**, `pnpm test` **9/9**.
`@nawasena/api` **87 berkas / 1290 lulus / 1 skipped** (basis PR-045:
86/1271/1 → +1 berkas, +19 test). `@nawasena/schemas` 3 berkas / 40 lulus,
`@nawasena/config` 4 berkas / 25 lulus (+1 test AC-3).

### Acceptance Criteria

* **AC-1 — `withDegradation` mengembalikan fallback saat `DegradedError`.**
  Terpenuhi. Dua bentuk fallback didukung: NILAI siap pakai dan FUNGSI yang
  baru dijalankan saat gagal (jalur non-AI yang mahal tidak boleh berjalan
  ketika jalur AI-nya berhasil). Dibuktikan juga dengan penolakan kuota
  SUNGGUHAN dari `createAiQuota`, bukan hanya `DegradedError` buatan test.
* **AC-2 — kegagalan non-degradasi tidak tertelan.** Terpenuhi. `it.each` atas
  KETUJUH `AiErrorCode`, plus `AppError` non-degradasi (`TIDAK_BERHAK`),
  `Error` biasa, dan `string` telanjang — semuanya dilempar ulang sebagai
  objek yang SAMA (`toBe`, bukan `toEqual`), dan fallback-nya tidak pernah
  dipanggil.
* **AC-3 — impor SDK provider langsung → lint merah.** Terpenuhi, **di tempat
  yang sudah ada** (lihat Penyimpangan D1).
* **AC-4 — tabel pola degradasi per fitur.** Terpenuhi:
  `phase-06-ai-gateway.md`, subbagian baru di bawah PR-046. Tiga baris (CV
  Chat, Feed Lowongan, Sederhanakan Teks) masing-masing menyebut jalur AI,
  fallback, perilaku ke pengguna, dan **PR pelaksananya**.
* **AC-5 — `meta.degraded` konsisten di kontrak zod.** Terpenuhi;
  `degradedMetaSchema` + `successEnvelopeSchema` yang menerima `nextCursor`
  saja, `degraded` saja, keduanya, atau tidak sama sekali.

### Keputusan teknis

* **`DegradedError extends AppError`, bukan kelas berdiri sendiri.** Bila
  fallback-nya tidak ada atau ikut gagal, error ini harus tetap keluar sebagai
  envelope `{code,message,hint}` Bahasa Indonesia beserta `Retry-After`-nya
  lewat `errorHandler` global. Kelas yang tidak turun dari `AppError` berakhir
  sebagai 500 "Terjadi kesalahan" — persis kebalikan maksud degradasi.
  Pemetaan error→HTTP tetap berbasis **KODE** (`handlers.ts:28` memakai
  `instanceof AppError`, lalu status/hint diambil dari `ERROR_CATALOG` via
  `code`), bukan berbasis kelas — `DegradedError` tidak menimpa pemetaan itu.
* **TIDAK ada kode `ERROR_CATALOG` baru.** "Boleh diturunkan" adalah sifat
  PENANGANAN, bukan sebab kegagalan; kelasnya generik atas `ErrorCode` mana pun
  yang sudah terdaftar. Kode baru (mis. breaker terbuka) ditambahkan saat ada
  pemanggil nyata, bukan sekarang.
* **Predikat `isDegradedError`, bukan `instanceof`.** Membaca properti
  `degraded === true`, persis pola `isKuotaHabis` yang membaca `code` — dan
  memenuhi peringatan yang sudah tertulis di `quota.ts` sejak PR-043.
* **Kembaliannya `T`, bukan union `{degraded, data}`.** Menandai jawaban
  kepada klien adalah urusan lapisan response (`meta.degraded`); memaksa bentuk
  union di sini menentukan bentuk API sebelum ada satu pun endpoint yang
  memakainya. Catatan: Risks PR-046 di dokumen phase menyarankan union type
  sebagai mitigasi "fitur lupa menangani degraded" — mitigasi itu **ditunda**
  ke PR endpoint pertama (PR-066/PR-073), bukan dibuang.
* **`meta` envelope dilonggarkan, `paginationMetaSchema` TIDAK.** Envelope
  memakai `paginationMetaSchema.merge(degradedMetaSchema).partial()`; skema
  pagination-nya sendiri tetap mewajibkan `nextCursor`, sebab endpoint
  berhalaman yang lupa mengirimnya adalah bug, bukan pilihan. Nol konsumen
  hari ini (dicek `grep` ke seluruh `apps/` + `packages/`), jadi risiko
  perubahan perilaku nol.
* **Helper MURNI — tanpa logger, tanpa konfigurasi, tanpa `req`/`res`.** Itu
  syarat keamanan spec ("degradasi tidak boleh menurunkan kontrol akses") yang
  dibuat struktural, bukan dijanjikan. Sebuah test membaca `degraded.ts` dan
  menegaskan impornya PERSIS `["../http/index.js"]`: begitu berkas ini mulai
  mengimpor express/middleware/Prisma, gate merah.

### Penyimpangan dari rencana (WAJIB dibaca)

* **D1 — AC-3 tidak menambah fixture di `apps/api/__tests__/fixtures/`.**
  Rencana (dan AC aslinya) meminta fixture baru + test ESLint programatik baru
  di `apps/api`. Saat menyentuh kode nyata ternyata **infrastrukturnya sudah
  ada dan lebih baik**: `packages/config/__tests__/boundaries.test.ts` sudah
  me-lint fixture lewat ESLint Node API, `packages/config/fixtures/` sudah
  dikecualikan dari `pnpm lint` (`.eslintrc.cjs`) DAN dari `tsc`
  (`tsconfig.json` → `exclude: ["fixtures"]`), dan sudah ada fixture
  `violations/ai-sdk-outside-core/…`. Menambah jalur kedua di `apps/api`
  berarti menduplikasi plumbing ESLint, dan fixture fisik di
  `apps/api/__tests__/**` justru akan **dilewati diam-diam** oleh
  `boundaries/ignore: ["**/__tests__/**"]` — gerbang yang tidak menjaga apa
  pun. Jadi AC-3 diperkuat di tempatnya: fixture kini mengimpor **ketiga** SDK
  terlarang, dan test barunya menuntut **tepat 3** error `boundaries/external`
  ber-severity 2 yang pesannya memuat "AI Gateway". `boundaries.cjs` sendiri
  **tidak disentuh** (Constraint 3).
* **D2 — `withDegradation` tanpa parameter logger opsional.** Constraint 5
  menyebut "optional logger injection for testing"; tidak ada yang perlu
  dicatat di dalam helper ini, dan menambahkan lubang logger sekarang adalah
  pintu masuk pertama bagi keadaan ambien yang justru dilarang constraint yang
  sama. Pemanggil yang butuh jejak mencatat di sisinya sendiri.

### Verifikasi

* **Empat mutasi dijalankan, semuanya merah**; keempat berkas dipulihkan
  byte-identik (md5 dicocokkan):
  1. `if (!isDegradedError(err)) throw err` → `if (false)` — **9 test merah**.
  2. `tolak()` dikembalikan ke `appError(...)` biasa — **1 test merah**, dan
     `ai-quota.test.ts` **tetap hijau**: bukti langsung bahwa test kuota yang
     ada memang buta terhadap pergantian kelas ini, dan test barulah yang
     menjaganya.
  3. `meta` envelope dikembalikan ke `paginationMetaSchema.optional()` —
     **3 test merah**.
  4. `disallow` di `boundaries.cjs` dipersempit ke satu SDK — **1 test merah**
     (berkasnya dikembalikan; perubahan itu tidak ikut ter-commit).
* Ukuran PR ~**693 baris** (119 ubahan kode di berkas eksisting + 405 baris
  berkas baru + 169 dokumen); produksi murni ~150 LOC. Pagu §9 (500 LOC)
  terlampaui hanya bila test dan dokumen ikut dihitung — sesuai norma repo
  (komentar sangat padat), tidak memblokir.

### Risiko yang ditemukan

* **Masih belum ada yang MENJALANKAN kode ini.** `boot.ts` tidak merakit apa
  pun dari PR-043b, PR-044b, PR-045, maupun PR ini. **Empat** utang perakitan
  kini menumpuk di satu tempat; PR fitur AI pertama (PR-066) sebaiknya
  membayarnya sekaligus.
* **Seam F1 (PR-043b) tetap terbuka.** Belum ada penjaga yang mencegah modul
  memanggil `createAiGateway` langsung dan melewati `AiClient` (kuota + jejak
  biaya). Di luar scope PR ini; syarat masuk PR-066.
* **Nol pemanggil `withDegradation` di produksi.** Kontrak yang tidak pernah
  dipakai adalah kontrak yang bisa salah bentuk tanpa ketahuan. Mitigasi yang
  dipilih: mengikatnya ke `quota.ts` sekarang juga, sehingga minimal satu
  jalur nyata sudah melempar `DegradedError` sebelum ada fitur.

### Next steps

* **PR-066** — endpoint cv-chat: pemakai `withDegradation` yang pertama;
  sekaligus memutuskan bentuk `{degraded, data}` di controller dan menutup
  kuota + `ai_usage` untuk jalur streaming.
* **PR-068 / PR-073 / PR-087** — mengisi ketiga baris tabel pola degradasi
  dengan implementasi nyata (form CV, feed tanpa re-rank, tombol sederhanakan
  nonaktif).
