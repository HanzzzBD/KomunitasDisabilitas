# Implementation Log — Phase 01 (Foundation)

> Catatan per PR yang selesai di Phase 01. Format sesuai CLAUDE.md §1 (Dokumentasi Log Implementasi).

---
## Log Implementasi — PR-001: Turborepo Workspace & Shared Config

> **Phase:** [01 - Foundation](../phase-01-foundation.md#pr-001---turborepo-workspace--shared-config)  
> **Tanggal:** 2026-07-18  
> **Status:** Selesai

### Ringkasan hasil

Monorepo pnpm + Turborepo berdiri dengan 9 workspace ter-resolve: `apps/{api,worker,web,mobile}` + `packages/{config,schemas,api-client,ui,a11y}`. Preset config terpusat tersedia di `@incasif/config` (tsconfig base/node/react, eslint base, prettier). Seluruh gate hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9 (strict), `pnpm test` 9/9 (4 unit test preset lulus). README root diganti dengan struktur repo, prasyarat, perintah dasar, konvensi global, dan RB-Std.

### Scope selesai

- `turbo.json` (task: build, dev, lint, typecheck, test, test:cov), root `package.json` (packageManager pin `pnpm@9.15.0`), `pnpm-workspace.yaml`, `.npmrc`, `.prettierignore`, `.prettierrc.cjs` (forward ke preset).
- `packages/config`: `tsconfig/base.json` (strict + noUncheckedIndexedAccess + verbatimModuleSyntax), `tsconfig/node.json`, `tsconfig/react.json`, `eslint/base.cjs`, `prettier/index.js`, diekspos via `exports` map.
- Placeholder workspace untuk 4 apps + 4 packages: masing-masing `package.json` + `tsconfig.json` (extends preset) + `src/index.ts` stub + `.eslintrc.cjs` — agar workspace resolve & semua task turbo bisa jalan sejak sekarang.
- Unit test (Vitest) di `packages/config/__tests__/presets.test.ts`: memverifikasi preset prettier/eslint ter-load dan strict mode aktif di tsconfig base.
- README struktur repo & cara menjalankan.

### Scope tidak selesai

Tidak ada. Catatan verifikasi: "clone bersih" diverifikasi sebagai fresh install (belum ada `node_modules`) di working tree — repo belum di-push sehingga clone literal belum mungkin; ulangi verifikasi saat PR-003 (CI) berjalan di runner bersih.

### Keputusan teknis

1. **Placeholder berisi `package.json` + stub `src/index.ts`, bukan folder benar-benar kosong.** Folder kosong tidak ter-resolve sebagai workspace pnpm dan membuat acceptance criteria "semua workspace ter-resolve" tidak terverifikasi. Stub hanya mengekspor konstanta/`export {}` tanpa logika.
2. **ESLint 8 (legacy config), bukan flat config.** `eslint-plugin-boundaries` (PR-002) dan ekosistem preset masih paling stabil di legacy config; migrasi flat config bisa jadi keputusan terpisah nanti. Konsumsi preset via `module.exports = require("@incasif/config/eslint")` karena resolver `extends` string ESLint tidak membaca `exports` map package.
3. **`verbatimModuleSyntax` aktif di base** untuk kebersihan import type; di-override `false` hanya di tsconfig lokal `packages/config` karena file test/vitest config-nya ESM sementara paket ber-`type: commonjs`.
4. **Versi di-pin exact** (`save-exact` di `.npmrc`; turbo 2.3.3, TS 5.7.2, eslint 8.57.1, vitest 2.1.8, prettier 3.3.3) untuk build deterministik.
5. **Dokumen pre-existing (PRD/SDD/CLAUDE/docs) dikecualikan dari prettier** via `.prettierignore` agar `pnpm format` tidak menghasilkan diff besar di luar scope PR kode.

### Risiko ditemukan

- `corepack enable` gagal (EPERM) di mesin dev Windows tanpa admin — workaround terdokumentasi: `corepack enable --install-directory <dir-user> pnpm`. Perlu dicek ulang saat setup CI (PR-003); di runner GitHub Actions biasanya tidak bermasalah.
- Lint script pakai `--ext .ts,.tsx` (eslint 8 default hanya `.js`) — saat migrasi ke flat config nanti, flag ini harus diganti pattern glob.

### Next steps

- PR-002: tambahkan aturan `eslint-plugin-boundaries` ke preset `@incasif/config/eslint` + fixtures pelanggaran.
- PR-003: CI GitHub Actions memakai `corepack` + cache pnpm/turbo; verifikasi acceptance "clone bersih" di runner.
- Saat apps terisi kode nyata: ganti stub `src/index.ts`, tambahkan `dev` script per app (task `dev` di turbo.json sudah disiapkan).

## PR-002 — Lint Boundaries: Arsitektur sebagai Kode

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* Preset `@incasif/config/eslint/boundaries` (`packages/config/eslint/boundaries.cjs`) menegakkan 3 aturan arsitektur via `eslint-plugin-boundaries` v5:
  1. Lapisan satu arah `router → controller → service → repository` (dilarang loncat lapisan).
  2. Dilarang impor repository lintas modul — antar-modul hanya via service layer.
  3. Dilarang impor SDK AI (`@google/generative-ai`, `groq-sdk`, `openai`) di luar `src/core/ai` (ADR-012).
* Fixtures bukti gate bekerja di `packages/config/fixtures/`: struktur modul mini valid (jobs, users, core/ai, core/http) + 3 folder pelanggaran (`cross-module-repo`, `ai-sdk-outside-core`, `layer-jump`) — satu per aturan.
* Unit test `packages/config/__tests__/boundaries.test.ts` (Vitest) me-lint fixtures programatik via ESLint Node API: tiap pelanggaran memunculkan rule ID yang tepat; aliran valid nol pelanggaran boundaries. 4 test hijau.
* `apps/api/.eslintrc.cjs` memakai preset via extends tunggal.
* Dokumentasi aturan + escape hatch (`eslint-disable-next-line` ber-alasan + tautan review) di `packages/config/README.md`.

**Hasil gate:** `pnpm lint` / `pnpm typecheck` / `pnpm test` hijau di seluruh 9 workspace. Manual verification: eslint dijalankan langsung pada `fixtures/violations/**` → tepat 3 error dengan rule ID sesuai ekspektasi.

### Scope selesai vs tidak

* ✅ Preset boundaries di `packages/config` — selesai.
* ✅ Fixture pelanggaran tiap aturan — selesai (3 aturan, 3 fixture).
* ✅ Dokumentasi aturan di README config — selesai.
* Tidak ada scope yang dipangkas.

### Keputusan teknis

* Klasifikasi elemen berbasis path (`boundaries/elements`) dengan `capture: ["module"]` sehingga aturan membedakan "modul sama" vs "modul berbeda" via placeholder `${from.module}` — tanpa hardcode daftar 13 modul (modul baru otomatis tunduk aturan).
* SDK AI diblokir via `boundaries/external` dengan `default: "allow"` + disallow eksplisit per elemen non-`core-ai`; daftar SDK saat ini `@google/generative-ai`, `groq-sdk`, `openai` (ADR-005/012) — perlu diperluas jika ada SDK baru.
* `boundaries/entry-point`, `no-private`, `no-unknown`, `no-unknown-files` dimatikan untuk MVP (terlalu bising sebelum modul nyata ada); dapat diaktifkan bertahap.
* Fixtures diletakkan di luar `__tests__/` karena `boundaries/ignore` mencakup `**/__tests__/**`; fixtures di-exclude dari lint/typecheck normal paket.
* Test memakai ESLint Node API (bukan snapshot CLI) agar assert pada rule ID presisi dan tak rapuh terhadap format output.

### Risiko yang ditemukan

* Daftar SDK AI terlarang bersifat enumerasi manual — SDK baru (mis. `@anthropic-ai/sdk`) tidak otomatis terblokir. Follow-up: review daftar saat fase AI Gateway (PR-050an).
* Aturan belum ditegakkan di CI — pelanggaran hanya ketahuan saat lint lokal. Ditutup oleh PR-003.
* `module-shared` (types.ts/index.ts modul) boleh diimpor `repository` lintas modul (untuk tipe bersama); jika kelak disalahgunakan untuk logic, perketat.

### Next steps

* PR-003: jadikan `pnpm lint` (termasuk boundaries) check wajib CI + bukti fixture menggagalkan pipeline.
* Saat modul nyata pertama dibuat (PR-006+), validasi klasifikasi elemen terhadap struktur folder riil.

**Out of Scope (dicatat):** CI enforcement (PR-003); modul nyata di `apps/api` (baru konvensi folder).

---

## PR-003 — CI Pipeline Dasar (PR Checks)

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* `.github/workflows/pr.yml`: workflow GitHub Actions ter-trigger `pull_request` ke `main`, satu job blocking `lint-typecheck-test` (`pnpm lint` → `pnpm typecheck` → `pnpm test` via Turborepo) + dua slot job non-blocking `e2e` dan `a11y` (`if: false`, diaktifkan PR-031, ADR-016).
* Cache dua lapis: pnpm store (`actions/setup-node` `cache: pnpm`) + Turborepo (`actions/cache` pada `.turbo/cache` dengan restore-keys berjenjang branch → OS).
* Least-privilege: `permissions: contents: read`; tanpa secrets produksi. `concurrency` cancel-in-progress per branch PR.
* Dokumentasi status check di README root: tabel check (nama, isi, blocking/non-blocking), karakteristik pipeline, cara mereproduksi kegagalan secara lokal, dan langkah setup branch protection (UI + `gh api`).
* PR-001 & PR-002 di-commit dan di-push ke `origin/main` (prasyarat pipeline berjalan di remote).
* Gate lokal hijau: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 (8 test).

### Scope selesai vs tidak

* ✅ `.github/workflows/pr.yml` (lint, typecheck, unit) — selesai.
* ✅ Cache pnpm + turbo — selesai (terpasang di workflow).
* ✅ Dokumentasi status check di README — selesai.
* ✅ Branch protection required checks — **aktif di `main`**: required check `lint-typecheck-test` (strict), require PR before merge, `enforce_admins: true`. Diterapkan via `gh api` (perintah terdokumentasi di README). Catatan: fitur ini butuh repo public/GitHub Pro — repo diubah ke **public** atas persetujuan owner.

### Keputusan teknis

1. **Satu job blocking (`lint-typecheck-test`), bukan tiga job terpisah.** Tiga job = 3× setup (checkout + install ± 1–2 menit each) pada repo yang lint+typecheck+test-nya sendiri < 1 menit; satu job berurutan lebih cepat dan lebih murah. Branch protection juga cukup menunjuk satu context. Bisa dipecah nanti bila durasi per step membengkak (sharding sudah diantisipasi ADR-016).
2. **Slot e2e/a11y sebagai job `if: false`, bukan dihapus.** Nama check sudah "dipesan" dan struktur terlihat di file — PR-031 tinggal mengganti kondisi + mengisi step, tanpa mengubah wiring branch protection untuk job blocking.
3. **corepack (`corepack enable`), bukan `pnpm/action-setup`.** `packageManager: pnpm@9.15.0` sudah di-pin di package.json (PR-001) — corepack membacanya, satu sumber kebenaran versi, tanpa dependensi action pihak ketiga tambahan. Risiko EPERM corepack di Windows dev tidak berlaku di runner ubuntu.
4. **Cache path `.turbo/cache`** (default turbo 2.x) dengan key `os-branch-sha` + restore-keys berjenjang: run pertama branch baru tetap dapat cache dari main; sha di key memastikan cache terbaru selalu tersimpan.
5. **Tidak ada unit test Vitest baru.** Workflow YAML tidak memuat logic aplikasi; "unit test" pada Testing Checklist PR ini bermakna pipeline *menjalankan* unit suite yang ada (termasuk 8 test fixture boundaries dari PR-002 sebagai bukti gate). Test yang mem-parse YAML dinilai rapuh dan bernilai rendah — diputuskan tidak ditulis.

### Risiko yang ditemukan

* **Repo diubah private → public** (prasyarat branch protection di plan gratis). Konsekuensi: kode & seluruh dokumen (PRD/SDD/ADR) terlihat publik — pastikan tidak pernah ada secret/PII di history (saat ini bersih; `.env*` di-ignore sejak commit pertama, ADR-015). Alternatif kembali private: upgrade GitHub Pro.
* `enforce_admins: true` — admin pun tidak bisa bypass; push langsung ke `main` ditolak, semua perubahan (termasuk milik agent) wajib lewat PR.
* Repo GitHub bernama `KomunitasDisabilitas` sementara folder lokal `ProjectKomunitasDisabilitas` — tidak berdampak fungsional, dicatat agar tidak membingungkan.
* Job `e2e`/`a11y` dengan `if: false` muncul sebagai "skipped" di UI check — jangan dijadikan required check sebelum PR-031, atau PR akan terblokir selamanya.

### Next steps

* PR-031: aktifkan slot e2e (Playwright) + a11y (axe-core + Lighthouse), lalu tambahkan ke required checks.
* PR-099: job build image; PR-108: secrets scan.

**Out of Scope (dicatat):** build image (PR-099); a11y gate aktif (PR-031); secrets scan (PR-108); workflow deploy (`deploy.yml`).

### Verifikasi remote (PR uji #1)

* Run pertama (`29633017746`): job `lint-typecheck-test` hijau, total **26s** (install 2s, lint 3s, typecheck 5s, test 2s).
* Run kedua (`29633057780`): total **14s** — pnpm store & turbo cache hit ("cache hit, replaying logs" di seluruh task). Step yang terdampak cache (install+lint+typecheck+test): **12s → 3s (25%)**; sisa durasi adalah overhead tetap runner (checkout + setup Node) yang tidak bisa di-cache. AC "< 50%" terpenuhi pada bagian yang dapat dipengaruhi cache.
* Slot `e2e`/`a11y` tampil sebagai skipped (sesuai desain).
* Branch protection terverifikasi aktif: merge PR #1 diblokir sampai `lint-typecheck-test` hijau.

---

## PR-004 — packages/schemas + OpenAPI Generator

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* `packages/schemas` terisi: fondasi `src/common.ts` (error envelope `{code,message,hint?}` berpesan Bahasa Indonesia, success envelope `{data,meta?}`, pagination cursor `?cursor=&limit=` + `meta.nextCursor`, id uuid, timestamp ISO), 1 contoh skema lengkap `src/auth.ts` (`requestOtpSchema` + response, nomor HP E.164 `+62`), dan 10 skeleton domain (accessibility, profiles, resumes, companies, jobs, matching, applications, notifications, admin, signbridge) yang diisi bertahap per PR fitur.
* Builder OpenAPI `src/openapi.ts` (zod-openapi, SDD §11) + generator CLI `scripts/gen-openapi.ts`: `gen:openapi` menulis `openapi.json`; `check:openapi` (mode `--check`) exit 1 bila drift → step "OpenAPI drift check" di `pr.yml`.
* Output deterministik by design: tanpa timestamp/nilai acak, `CONTRACT_VERSION` di-pin manual (0.1.0), serialisasi kanonik `JSON.stringify(…, 2)` + newline.
* 9 unit test Vitest: parse valid/invalid + pesan error Indonesia, type-level `expectTypeOf`, determinisme (2× byte identik), guard drift (openapi.json ter-commit = hasil generate), struktur dokumen (paths + components).
* `README.md` paket: tabel konvensi penamaan, aturan tambahan (ekstensi `.js` ESM, `zod-openapi/extend`, envelope wajib), alur tambah skema, kebijakan drift.
* Validasi eksternal: `redocly lint` 0 error (1 warning `info-license` — lisensi API belum ditentukan, keputusan owner).
* Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 9/9 workspace (17 test total), format check hijau.

### Scope selesai vs tidak

* ✅ Skeleton schemas per domain + contoh — selesai (11 domain + common).
* ✅ Generator `scripts/gen-openapi.ts` + CI diff check — selesai (di `packages/schemas/scripts/`, step CI ditambah di pr.yml).
* ✅ Konvensi penamaan + dokumentasi README — selesai.
* Tidak ada scope yang dipangkas.

### Keputusan teknis

1. **Library `zod-openapi` 4.2.4** (persis SDD §11), bukan `@asteasolutions/zod-to-openapi`; zod di-pin 3.24.1. `.openapi()` diaktifkan via import `"zod-openapi/extend"` per file domain.
2. **Generator di `packages/schemas/scripts/`**, bukan root `scripts/` — concern paket; dijalankan `tsx` (devDep paket).
3. **Determinisme dijamin desain + diuji**, bukan dijanjikan: builder murni tanpa sumber non-deterministik, unit test membandingkan 2× render byte-per-byte, dan guard drift menjadikan `pnpm test` ikut gagal bila openapi.json basi — CI mendeteksi drift lewat dua jalur (step check + unit test).
4. **`src/openapi.ts` tidak diekspor dari `index.ts`** — konsumen paket (web/mobile/api-client) hanya butuh skema zod; builder dokumen khusus generator & test.
5. **Skeleton domain berupa file `export {}` berkomentar konvensi** — memesan struktur & path impor stabil tanpa menebak isi skema (diisi per PR fitur, sesuai Out of Scope phase file).
6. **`security: []` eksplisit pada operasi publik** (temuan `redocly lint` rule security-defined) — endpoint OTP memang pre-auth.
7. **`openapi.json` masuk `.prettierignore`** — format kanonik ditentukan generator (basis diff check), bukan prettier.

### Risiko yang ditemukan

* Kontrak `paths` di `src/openapi.ts` bisa membengkak jadi satu file besar saat domain terisi — follow-up: pecah registrasi path per domain (mis. `src/<domain>.paths.ts`) begitu > ~3 domain aktif.
* `info.license` belum diisi (warning redocly) — butuh keputusan owner tentang lisensi API/proyek.
* Versi kontrak (`CONTRACT_VERSION`) dinaikkan manual — rawan lupa; pertimbangkan check CI "kontrak berubah tapi versi tidak" di masa depan.

### Next steps

* PR-005: `@incasif/api-client` mengonsumsi `requestOtpSchema` sebagai endpoint contoh.
* PR-007: `validate(schema)` middleware memakai skema paket ini; katalog kode error melengkapi `errorCodeSchema`.
* PR-016: implementasi endpoint OTP nyata memakai skema contoh ini.

**Out of Scope (dicatat):** skema domain lengkap (per PR fitur); pemakaian di api-client (PR-005); middleware validasi Express (PR-007).

---

## PR-005 — packages/api-client

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* `packages/api-client` terisi (dari placeholder): typed client framework-agnostic dari kontrak zod, dipakai web & mobile tanpa perubahan (ADR-014).
* `src/client.ts` — `createApiClient({baseUrl, getAccessToken?, refresh?, fetch?})`: fetch injectable (default `globalThis.fetch` — jalan browser/RN/Node ≥ 18), header Authorization dari `getAccessToken()`, parse envelope, validasi response opsional per endpoint via skema zod.
* Interceptor 401: panggil hook `refresh()` **sekali** → bila true, retry **sekali** dengan token terbaru; tidak pernah loop. Default = stub menolak (implementasi nyata PR-018) — kontrak publik tidak akan berubah.
* `src/errors.ts` — `ApiError {code, message, hint?, status}`; error jaringan → `JARINGAN_GAGAL` (status 0), body tak dikenal → `RESPONS_TIDAK_DIKENAL` (teks mentah server tidak pernah diteruskan ke pengguna); pesan Bahasa Indonesia sederhana.
* `src/query-keys.ts` — konvensi `[domain, params]`, params dinormalisasi (urutan key stabil, undefined dibuang) → deterministik.
* `src/endpoints/auth.ts` — 1 endpoint contoh terhubung skema PR-004: `requestOtp()` (validasi body sebelum kirim + `responseSchema` guard drift runtime) + factory `authKeys`.
* 16 unit test (3 file): envelope mapping, 401→refresh→retry (termasuk anti-loop & token terbaru), error jaringan, queryKey, **bundle test esbuild** (tree-shake + bebas DOM). README konvensi lengkap.
* `.gitattributes` ditambahkan (`* text=auto eol=lf`) — menghentikan flip-flop CRLF checkout Windows vs prettier/CI Linux.
* Gate: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 33 test hijau, format check hijau.

### Scope selesai vs tidak

* ✅ Base client + interceptor 401→refresh (stub sampai PR-018) — selesai.
* ✅ Helper `queryKey [domain, params]` — selesai.
* ✅ 1 endpoint contoh terhubung skema PR-004 — selesai (`requestOtp`).
* Tidak ada scope yang dipangkas.

### Keputusan teknis

1. **Tanpa dependensi `@tanstack/react-query`** — scope hanya butuh konvensi query key (array murni); paket TQ dipasang di apps. Paket tetap framework-agnostic, RN-safe, dan ringan di-tree-shake.
2. **Refresh 401 = hook point** (`refresh?: () => boolean|Promise<boolean>`) dengan default menolak — PR-018 tinggal mengisi callback nyata tanpa mengubah API publik.
3. **`sideEffects: false` + bundle test esbuild** — AC tree-shakeable dibuktikan, bukan diklaim: impor `queryKey` saja menghasilkan bundle tanpa client/endpoint/zod; sanity test kebalikannya mencegah false positive.
4. **Bebas DOM dibuktikan dua lapis**: suite vitest jalan di environment node polos + bundle scan assert tidak ada `document/window/localStorage/XMLHttpRequest`.
5. **Token tidak pernah di-log/di-serialisasi** — hanya dibaca saat menyusun header; diuji: serialisasi ApiError tidak memuat token; error jaringan tidak membawa detail request.
6. **`requestOtp` dibuat `async`** agar error validasi zod menjadi rejection (bukan throw sinkron) — konsisten untuk pemakai `.catch()`/TanStack mutation.
7. **`.gitattributes` LF** — perbaikan infra kecil di luar paket namun perlu: tanpa ini working tree Windows terus konflik dengan prettier (`endOfLine: lf`) setiap `git checkout`.

### Risiko yang ditemukan

* Stub refresh menolak semua 401 → sampai PR-018, sesi kedaluwarsa memaksa login ulang (perilaku sadar, dicatat di README).
* `queryKey` membatasi params ke nilai primitif (`QueryParams`) — objek bersarang tidak didukung; bila nanti perlu filter kompleks, perluas normalisasi (rekursif) dengan test determinisme.
* Factory `authKeys.otpRequest` memuat nomor HP dalam key cache (in-memory TanStack, tidak di-log) — aman untuk MVP, tapi jangan pernah memasukkan key cache ke logger/telemetri.

### Next steps

* PR-018: implementasi `refresh()` nyata (rotasi refresh token family) — cukup mengisi hook.
* PR fitur FE pertama (PR-019+): pasang TanStack Query di apps, konsumsi `requestOtp` + `authKeys` sebagai pola.
* Endpoint baru selalu ikuti pola `src/endpoints/auth.ts` (skema dari @incasif/schemas, validasi body, responseSchema).

**Out of Scope (dicatat):** implementasi refresh nyata (PR-018); hooks TanStack per endpoint (per PR fitur); integrasi ke apps web/mobile.

---

## PR-006 — API Bootstrap — core/config + core/logger

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* `apps/api` hidup (dari placeholder): bootstrap Express dengan dua modul core pertama sesuai SDD §5.1 (ADR-002 — DI manual via factory function).
* **`src/core/config/env.ts`** — skema env zod: wajib `DATABASE_URL`/`REDIS_URL` (URL valid), default `NODE_ENV`/`HOST`/`PORT` (coerce 0–65535)/`LOG_LEVEL`. `loadEnv()` fungsi murni → `EnvError` berisi daftar `[variabel, alasan]` (Bahasa Indonesia + rujukan .env.example); keputusan exit ada di entry point.
* **`src/core/logger/index.ts`** — pino JSON (`service: "api"`, level label, ISO time), **redaction deny-list 10 kunci** (authorization, cookie, otp, password, token, accessToken, refreshToken, fieldKey, apiKey, secret — level atas + bersarang + `req.headers.*`), censor `[RAHASIA]`; `createHttpLogger` = pino-http dengan `genReqId` uuid v4 → **setiap baris request-scoped ber-requestId**; destination injectable untuk test.
* **`src/server.ts`** — `createServer(env, logger)` → `{app, start, stop}`: start resolve saat siap (log `bootMs`), stop tunggu koneksi aktif + idempotent; `registerShutdownHooks` SIGTERM/SIGINT anti-double-stop, `exitFn` injectable.
* **`src/index.ts`** — entry: `loadEnv` gagal → pesan + exit 1; sukses → logger → server → start → hooks.
* **`.env.example`** dibuat (template tanpa rahasia; placeholder berkomentar untuk FIELD_KEY_V1/GEMINI/GROQ per PR mendatang).
* 26 test baru (59 total workspace); gate `pnpm lint`/`typecheck`/`test` 9/9 hijau; boot manual nyata `bootMs=8`.

### Scope selesai vs tidak

* ✅ `server.ts` start/stop bersih — selesai.
* ✅ `core/config` skema env + fail-fast — selesai.
* ✅ `core/logger` pino + redaction + requestId binding — selesai.
* Tidak ada scope yang dipangkas. Catatan: validasi kunci enkripsi (`FIELD_KEY_V*`) TIDAK di sini — scope PR-013 (fail-fast kunci dilakukan `core/crypto` saat boot).

### Keputusan teknis

1. **`loadEnv` fungsi murni, exit di entry point** — unit test bisa menguji fail-fast tanpa mematikan proses test; pesan error tetap satu sumber (`EnvError.message`).
2. **pino-http untuk requestId binding** (bukan AsyncLocalStorage manual) — standar ekosistem pino; `req.log` child ber-requestId + `customProps` menaruh `requestId` eksplisit di tiap baris. ALS bisa menyusul bila service layer butuh logger implicit (PR-007+).
3. **Redaction deny-list ganda (level atas + `*.key` + headers)** — wildcard pino hanya satu level; kombinasi ini menutup pola log nyata (`logger.info({otp})`, `logger.info({body: {otp}})`, serializer pino-http). Kebijakan: kunci baru bermuatan credential WAJIB masuk list (tercatat di komentar file).
4. **`registerShutdownHooks` terpisah dari `createServer`** — test membuat server tanpa menyentuh handler global proses; `exitFn` injectable.
5. **Tanpa route & error handler custom** — 404 default Express cukup untuk membuktikan proses hidup; envelope error & health = PR-007/008 (tidak mencuri scope).
6. **`x-powered-by` dimatikan** — kebiasaan keamanan kecil; helmet lengkap menyusul PR-007.

### Risiko yang ditemukan

* **Sinyal POSIX tidak berfungsi di Windows dev** — `kill` Git-Bash/Windows = hard-terminate (exit 143), handler SIGTERM tidak pernah terpanggil di OS ini. Bukan bug kode: perilaku dibuktikan unit test (`process.emit`) dan efektif di Linux/Docker (target deploy, ADR-006). Verifikasi ulang saat PR-008 (compose healthcheck + `docker stop`).
* Redaction list bersifat enumerasi manual — field credential baru yang tidak didaftarkan akan lolos. Mitigasi tercatat: review wajib di PR-013/014 + komentar kebijakan di file logger.
* `express.json()` limit 1mb global — cukup untuk MVP; endpoint upload (foto profil dsb.) perlu limit/multipart tersendiri di PR terkait.

### Next steps

* PR-007: `core/http` — error envelope `{code,message,hint}`, asyncHandler, helmet/CORS/rate-limit; pakai `req.id` yang sudah tersedia.
* PR-008: compose + `/healthz` `/readyz` + koneksi DB/Redis nyata; verifikasi graceful shutdown via `docker stop`.
* PR-013: validasi `FIELD_KEY_V1` saat boot (core/crypto) — melengkapi janji "fail-fast kunci enkripsi kosong".

**Out of Scope (dicatat):** error envelope & middleware HTTP (PR-007); health endpoints & koneksi DB/Redis (PR-008); validasi kunci crypto (PR-013); Sentry (ADR-017, Fase 2).

---

## PR-007 — core/http — Envelope, asyncHandler, Helmet, Rate Limit Global

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* `core/http` lengkap — middleware stack baku seluruh modul (SDD §5.3, §8.4):
  * **`errors.ts`** — `ERROR_CATALOG` terpusat 7 kode: `VALIDATION_ERROR` (400), `JSON_TIDAK_VALID` (400), `TIDAK_TERAUTENTIKASI` (401), `TIDAK_BERHAK` (403), `RUTE_TIDAK_DITEMUKAN` (404), `TERLALU_BANYAK_PERMINTAAN` (429), `TERJADI_KESALAHAN` (500) — semua message+hint Bahasa Indonesia sederhana; `AppError`/`appError(code)` cara baku melempar error dari layer mana pun.
  * **`handlers.ts`** — `notFoundHandler` + `errorHandler` global: AppError → envelope katalog; ZodError → 400 `VALIDATION_ERROR` (hint menyebut field); body-parser rusak → 400 `JSON_TIDAK_VALID`; lainnya → 500. **Stack/detail internal hanya ke log ber-requestId — tidak pernah ke klien.**
  * **`async-handler.ts`** — propagasi rejection handler async (mitigasi ADR-002).
  * **`validate.ts`** — `validate({body?, query?, params?})` dengan skema zod dari `packages/schemas`; req.\* diganti hasil parse (typed).
  * **`security.ts`** — helmet dasar (nosniff, frame DENY; CSP off → PR-105; HSTS off → urusan edge), CORS whitelist exact-match dari `CORS_ORIGINS`, rate limit global per IP (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`, memory store) dengan handler 429 → envelope + `Retry-After`.
* `server.ts` — urutan baku: helmet → CORS → rate limit → httpLogger → json → routes (hook `options.routes`) → notFound → errorHandler.
* Env baru: `CORS_ORIGINS` (default `http://localhost:5173`), `RATE_LIMIT_MAX` (300), `RATE_LIMIT_WINDOW_MS` (60000) + `.env.example`.
* 14 test baru (40 total apps/api; 73 workspace); manual curl: 404/JSON-rusak/429+Retry-After/headers — semua envelope katalog.

### Scope selesai vs tidak

* ✅ Error handler global + mapping error → envelope — selesai.
* ✅ `asyncHandler` + notFound handler — selesai.
* ✅ helmet + CORS whitelist + express-rate-limit — selesai (memory store; Redis store PR-008 sesuai scope).
* Tambahan atas permintaan review plan: kode 401 `TIDAK_TERAUTENTIKASI` + 403 `TIDAK_BERHAK`; assertion requestId di integration test.

### Keputusan teknis

1. **Katalog `as const satisfies Record<string, CatalogEntry>`** — kode & status literal ter-typecheck; `appError("KODE_SALAH")` = compile error. Ini implementasi mitigasi risiko "katalog tidak disiplin" di level tipe, melengkapi rencana lint literal.
2. **Inline snapshot untuk katalog & headers helmet** — perubahan pesan error atau security header selalu muncul eksplisit di diff review, tidak bisa berubah diam-diam.
3. **Nama kode berbahasa Indonesia** (`TIDAK_BERHAK`, dst.) mengikuti preseden `JARINGAN_GAGAL` (api-client); `VALIDATION_ERROR` dipertahankan karena sudah dipakai CLAUDE.md & schemas sebagai contoh.
4. **`createServer(options.routes)` sebagai titik mount router** — router modul dipasang sebelum notFound/errorHandler tanpa mengubah wiring; test memakai hook yang sama (route uji tidak pernah ada di kode produksi).
5. **CSP & HSTS sengaja dimatikan di helmet** — CSP ketat butuh inventaris aset FE (PR-105); HSTS/TLS urusan Cloudflare/Nginx (SDD §4). Frame-deny + nosniff tetap aktif.
6. **CORS origin asing → request tetap 200 tanpa header CORS** (bukan 403) — sesuai model CORS browser; server-to-server/curl tanpa Origin tetap dilayani.
7. **`errorHandler` cek `res.headersSent`** — response yang sudah mengalir (mis. SSE nanti) tidak ditimpa envelope.

### Risiko yang ditemukan

* Rate limit memory store bersifat per proses — dua replicas (SDD §19) = limit efektif 2×; beres saat Redis store (PR-008). `trust proxy` juga belum diaktifkan: di belakang Nginx semua request terlihat dari satu IP — WAJIB set `TRUST_PROXY` saat deploy (PR-099), kalau tidak rate limit akan memblokir semua pengguna sekaligus.
* express-rate-limit memvalidasi konfigurasi saat request pertama, bukan saat boot — salah konfigurasi baru ketahuan saat traffic. Mitigasi ringan: nilai dari env sudah tervalidasi zod.
* Lint anti string-literal kode error (mitigasi phase file) belum dibuat — tipe TS sudah menutup sebagian besar celah; aturan eslint khusus bisa menyusul bila muncul pelanggaran nyata.

### Next steps

* PR-008: Redis store express-rate-limit + `trust proxy` env + health endpoints memakai `asyncHandler`.
* PR-016: rate limit khusus OTP (3/nomor/jam, SDD §8.4) di atas fondasi ini.
* PR-105: CSP ketat final + limit per endpoint.
* Modul fitur: SELALU `appError("KODE")` — tambah kode baru ke katalog, jangan string literal / res.status manual.

**Out of Scope (dicatat):** CSP final & limit per endpoint (PR-105); rate limit OTP khusus (PR-016); Redis store rate limit (PR-008).

---

## PR-008 — Docker Compose Dev + Health Endpoints

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* **Lingkungan dev satu perintah** — `docker compose -f docker-compose.dev.yml up`: `postgres` (pgvector/pgvector:pg18 + init `vector`+`pg_trgm`), `redis-cache` (maxmemory 200mb, allkeys-lru), `redis-queue` (noeviction + AOF), `api` (Dockerfile target dev, hot-reload tsx watch). Semua ber-healthcheck; API menunggu dependensi healthy.
* **ADR-004 direvisi** (persetujuan owner): dua **service** Redis menggantikan dua DB index — `maxmemory-policy` Redis berlaku per instance dan BullMQ mensyaratkan `noeviction`; klien tetap terpisah (`REDIS_URL` cache / `REDIS_QUEUE_URL` queue, env baru wajib).
* **`core/db`** — klien `pg` ringan (pool max 2, timeout 2s) hanya untuk ping; **`core/redis`** — dua klien ioredis (lazyConnect, gagal-cepat, tanpa offline queue).
* **`modules/health`** — modul pertama berpola `router → controller → service` (tanpa repository — memeriksa infra, bukan data): `GET /healthz` liveness murni; `GET /readyz` ping DB+2 Redis paralel timeout 2s → gagal = 503 envelope kode baru `BELUM_SIAP` (detail per dependensi hanya ke log ber-requestId). Mount di root (konsumen: compose healthcheck & Uptime Kuma), bukan `/api/v1`.
* `registerShutdownHooks` diperluas: hook `onStopped` menutup koneksi DB/Redis setelah server berhenti.
* Verifikasi manual LENGKAP di Docker (daemon dinyalakan saat sesi): compose up dari nol, assert config kedua Redis, pgvector, hot-reload, readyz vs dependensi mati, dan **graceful shutdown SIGTERM via `docker stop` (ExitCode=0) — melunasi verifikasi yang tertunda dari PR-006 (keterbatasan sinyal Windows).**
* 6 test baru (46 apps/api; 79 workspace); `.dockerignore` dibuat.

### Scope selesai vs tidak

* ✅ `docker-compose.dev.yml` + `apps/api/Dockerfile` (dev target) — selesai.
* ✅ `infra/pg-init.sql` — selesai (+`pg_trgm`, kebutuhan pasti ADR-018; dicatat).
* ✅ Redis dua service + klien terpisah — selesai (bentuk direvisi dari "dua DB index", lihat ADR-004).
* ✅ Endpoint health & ready — selesai.
* Ditunda dengan persetujuan owner: Redis store express-rate-limit → bersama wiring BullMQ (PR-010).

### Keputusan teknis

1. **Dua service Redis (revisi ADR-004)** — satu-satunya cara memenuhi dua kebijakan eviction; total RAM tetap (SDD §15); queue diberi AOF (job tahan restart) sekaligus memperbaiki konsekuensi negatif lama "RDB bukan AOF".
2. **Klien `pg` (bukan Prisma) untuk ping DB** — Prisma init = scope PR-009/010; PR-010 tinggal mengganti isi `pingDatabase()` tanpa menyentuh modul health.
3. **Health di root path** — `/healthz` `/readyz` bukan bagian kontrak klien `/api/v1`; konsumen adalah compose/Uptime Kuma (SDD §17).
4. **`BELUM_SIAP` (503) masuk katalog** — konsisten envelope; detail per-dependensi tidak dibocorkan ke response (fingerprinting infra), hanya ke log.
5. **Hot-reload via `CHOKIDAR_USEPOLLING=true`** — bind mount NTFS→container tidak meneruskan inotify (keterbatasan Docker Desktop); polling interval 800ms cukup responsif (restart <12s) tanpa membebani CPU berarti.
6. **Image pg18 mount di `/var/lib/postgresql`** (bukan `.../data`) — konvensi baru image postgres 18+; ketahuan saat compose up pertama gagal, dikodifikasi + komentar di compose.
7. **`.dockerignore`** — node_modules/git/docs tidak masuk build context (build cepat, image bersih).

### Risiko yang ditemukan

* **Insiden proses (pelajaran):** `git checkout -- server.ts` saat membersihkan uji hot-reload ikut membuang edit `onStopped` yang belum ter-commit — tertangkap `pnpm typecheck` sebelum commit. Pelajaran: bersihkan file uji dengan `sed`/patch, bukan `git checkout`, saat ada perubahan belum ter-commit.
* Kredensial dev-only tertulis di compose (incasif/incasif) — dev-only by design (ADR-015); compose prod (PR-097) wajib env.
* Polling chokidar menambah CPU idle kecil di container dev — dapat dimatikan per mesin (Linux host tidak membutuhkannya).
* `depends_on: service_healthy` menunggu start_period API 60s pada mesin lambat — bila mengganggu, turunkan interval healthcheck.

### Next steps

* PR-009: Prisma init + migrasi identitas — jalankan terhadap postgres compose ini.
* PR-010: BullMQ wiring (klien queue sudah tersedia) + Redis store express-rate-limit + ganti ping DB ke Prisma.
* PR-097: compose prod/staging (image pin sama, env-based secrets, tanpa bind mount).

**Out of Scope (dicatat):** compose prod/staging (PR-097); Prisma init (PR-009); BullMQ queues + Redis store rate limit (PR-010).

---

## PR-009 — Migrasi Inti Identitas

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* **Prisma init** (`apps/api/prisma/`, Prisma 5.22): `schema.prisma` = sumber kebenaran struktur DB; migrasi 01 `01_inti_identitas` menghasilkan 4 tabel sesuai SDD §6/§14 + PRD §10:
  * `users` — role enum native (`seeker|admin|employer`, employer reserved), soft-delete `deleted_at`, phone/google_id nullable dengan **unique PARSIAL** (`WHERE deleted_at IS NULL`, raw SQL) — nomor boleh dipakai ulang setelah hapus akun (hak hapus UU PDP; dikonfirmasi owner).
  * `refresh_tokens` — hanya `token_hash` (token mentah tidak pernah ke DB), `family_id` untuk deteksi reuse rotating token (SDD §8.1), FK CASCADE.
  * `accessibility_profiles` — preferensi UI ADR-008 (text_scale, high_contrast, reduce_motion, simple_language, prefers_sign_language, large_touch_targets, screen_reader_hint), 1:1 users, BUKAN data medis.
  * `audit_logs` — append-only, **sengaja tanpa FK** (jejak tahan penghapusan akun; actor NULL = aksi sistem), BRIN `created_at` (raw SQL).
* **Konvensi migrasi terdokumentasi** (`prisma/README.md`): raw SQL di file migrasi yang sama; **`down.sql` manual wajib per migrasi + diuji up→down→up** (keputusan implementasi untuk memenuhi AC "down teruji" — bukan ADR); backward-compatible satu versi (expand→contract); jebakan `findFirst + deletedAt: null` untuk lookup phone (findUnique tidak bisa dengan unique parsial).
* **Helper uuid v7** (`core/ids`) — implementasi murni RFC 9562 tanpa dependensi; sortable antar-ms (diuji); dipakai seed + service layer ke depan.
* **Seed admin idempotent** (`prisma/seed.ts`, terdaftar di `prisma.seed`): findFirst aktif → create (dengan audit log `seed.admin_dibuat`) / naikkan role / no-op; identitas via env `SEED_ADMIN_PHONE`/`SEED_ADMIN_NAME`, default dev bukan-rahasia (`+620000000001`).
* **CI**: service Postgres `pgvector/pgvector:pg18` (image = compose dev, hindari drift) + step `prisma migrate reset --force` (migrasi dari nol + seed) sebelum test; `turbo.json` meneruskan `DATABASE_URL`/`CI` ke task test.
* 10 test baru (4 unit uuid v7 + 6 integration DB dengan skip anggun bila DB tidak terjangkau); 89 test workspace.

### Scope selesai vs tidak

* ✅ `schema.prisma` awal + migrasi 01 — selesai.
* ✅ Seed admin pertama — selesai (idempotent, diuji 2×).
* ✅ Konvensi migrasi (raw SQL non-Prisma) — selesai (README + contoh nyata unique parsial & BRIN).
* Tidak ada scope dipangkas.

### Keputusan teknis

1. **uuid v7 di-generate aplikasi** — `gen_random_uuid()` DB = v4 (tidak sortable); extension pg_uuidv7 tidak tersedia di image resmi. Konsekuensi: kolom id tanpa default DB — insert wajib lewat kode (seed/service memakai `core/ids`).
2. **`down.sql` manual per migrasi** — Prisma tidak meng-generate down (by design sejak v3); bentuk pemenuhan AC diputuskan di PR ini, didokumentasikan sebagai konvensi. Diuji nyata: down → 4 tabel + enum hilang; deploy ulang → pulih.
3. **`audit_logs` tanpa FK** — append-only harus tahan `ON DELETE` users (jejak PDP); enforcement no-UPDATE/DELETE via grant DB role dicatat untuk PR-097.
4. **Port host Postgres compose pindah 5432→5433** — mesin dev umum (Laragon di mesin owner) sudah menempati 5432; ketahuan saat `prisma migrate` gagal auth (menyambung ke Postgres lokal, bukan container). Dalam network compose tetap 5432; `.env.example` + CI disesuaikan.
5. **Integration test dengan skip anggun** — `beforeAll` ping DB; tidak terjangkau → semua test DB di-skip dengan pesan (unit test lain tetap jalan). CI selalu menjalankannya (service Postgres); lokal butuh compose hidup.
6. **`turbo.json` env passthrough** — `DATABASE_URL`/`CI` masuk cache key task test; tanpa ini turbo menyajikan hasil cache lama saat env berubah (ketahuan saat verifikasi lokal).

### Risiko yang ditemukan

* **Window pra-purge**: bisa ada ≥2 baris phone sama (1 aktif + N soft-deleted) sampai job purge (≤30 hari, worker Fase mendatang). Semua lookup identitas WAJIB filter `deleted_at IS NULL` — tercatat tebal di prisma/README.md; PR-016 (OTP login) harus mengikuti.
* Enum `Role` bernama PascalCase default Prisma (`"Role"` quoted di SQL) — kosmetik, konsisten selama dari Prisma; disadari, tidak diubah.
* `migrate reset` di CI menambah ±10 detik per run — dapat diterima; bila membengkak, pindah ke `migrate deploy` + seed terpisah.
* Insert manual bypass aplikasi (psql) bisa membuat id non-v7 — tidak di-enforce DB; disiplin kode + review.

### Next steps

* PR-010: migrasi 02 domain seeker (vector(768) + HNSW raw SQL — konvensi sudah siap); ganti ping `core/db` ke Prisma; BullMQ wiring.
* PR-016/018: modul auth memakai `refresh_tokens` (hash + family) — ikuti jebakan `findFirst deletedAt: null`.
* PR-097: grant DB role aplikasi tanpa UPDATE/DELETE pada audit_logs.

**Out of Scope (dicatat):** tabel domain seeker (PR-010) & marketplace (PR-011); seed persona lengkap (PR-012); grant append-only (PR-097); pemakaian refresh_tokens oleh auth (PR-016/018).

---

## PR-010 — Migrasi Domain Seeker

**Tanggal selesai:** 2026-07-18

### Ringkasan hasil

* **Migrasi 02** `02_domain_seeker` — 5 tabel domain seeker (SDD §6.2, PRD §10):
  * `seeker_profiles` — kolom sensitif **`disability_types`/`accommodation_needs` bertipe `bytea` (ciphertext)** (logika enkripsi PR-013); `disclosureDefault` enum native; **`profileEmbedding Unsupported("vector(768)")`** (akses hanya via `$queryRaw` terkurung di repo matching, PR-025+); `consentSensitiveAt` bukti consent UU PDP; FK CASCADE dari users.
  * `experiences`, `educations`, `skills`, `resumes` — FK CASCADE dari users; `content Json`; `createdVia` enum native; `startDate`/`endDate` tipe `date`.
* **Raw SQL di file migrasi** (konvensi PR-009):
  * `CREATE EXTENSION IF NOT EXISTS vector` **self-contained** — diprepend di migrasi (CI service Postgres tidak mount pg-init.sql; `migrate reset` drop extension → harus dibuat ulang dari dalam file migrasi).
  * `CREATE INDEX ... USING hnsw (profile_embedding vector_cosine_ops)` — dibuat saat tabel kosong (build instan); parameter default m=16/ef_construction=64.
* **`down.sql`** manual — diuji up→down (5 tabel + 2 enum hilang) → up (pulih); extension NOT di-drop (dipakai migrasi lain).
* **Schema update**: BRIN `audit_logs.created_at` dipindah dari raw SQL ke deklarasi Prisma (`@@index [...Brin]`) — mencegah Prisma meng-generate `DROP INDEX` di migrasi berikutnya saat drift detection.
* **`prisma/README.md`** diperbarui: catatan `apps/api/.env` (jebakan port 5432 vs 5433 debugged PR-009); konvensi `CREATE EXTENSION` self-contained.
* 11 test baru (integration DB; 62 total apps/api; 95 workspace): bytea introspeksi, bytea no-plaintext, vector roundtrip self-distance ≈0, EXPLAIN HNSW (via `$transaction` — `SET LOCAL` + `EXPLAIN` harus satu transaksi), FK CASCADE 5 tabel, enum menolak nilai liar.
* `openapi.json` di-regenerasi (CRLF→LF akibat git checkout Windows).

### Scope selesai vs tidak

* ✅ Migrasi 02: 5 tabel + FK CASCADE dari users — selesai.
* ✅ Raw SQL kolom vector + indeks HNSW — selesai (sekaligus `CREATE EXTENSION IF NOT EXISTS vector` self-contained).
* ✅ down.sql teruji — selesai.
* Tidak ada scope dipangkas. Catatan: schema update BRIN adalah perbaikan kecil supaya migrasi berikutnya bersih (bukan scope baru).

### Keputusan teknis

1. **`CREATE EXTENSION IF NOT EXISTS vector` di file migrasi (self-contained)** — ini beda dengan migrasi 01: saat itu extension sudah ada di DB lokal (pg-init.sql compose). CI tidak mount compose, jadi `migrate reset` men-drop extension → tipe `vector` tidak ditemukan. Solusi definitif: extension dibuat kembali dari dalam file migrasi (idempotent `IF NOT EXISTS`). Ini juga membuat proyek bisa berjalan tanpa pg-init.sql sama sekali.
2. **BRIN dipindah ke deklarasi Prisma** — Prisma 5 mendukung `type: Brin` + `map` untuk nama eksplisit. Tanpa ini, setiap `prisma migrate dev` berikutnya mendeteksi "drift" (index ada di DB, tidak di schema) dan meng-generate `DROP INDEX "audit_logs_created_at_brin"` secara otomatis — ketahuan saat generate migrasi 02.
3. **`SET LOCAL enable_seqscan=off` + `EXPLAIN` via `$transaction`** — Prisma `$queryRaw` menolak multi-statement dalam prepared statement (error 42601). Solusi: `$transaction(async tx => { await tx.$executeRaw; return tx.$queryRaw })` memberikan koneksi yang sama sehingga `SET LOCAL` efektif untuk query berikutnya dalam transaksi yang sama.
4. **`profileEmbedding Unsupported("vector(768)")`** — Prisma tidak mendukung tipe vector secara native; `Unsupported` mencegah Prisma Client memuat kolom (tidak bisa di-select biasa) dan mendokumentasikan pembatasan ini secara eksplisit di schema. Komentar di field mengarahkan developer ke pola `$queryRaw`.
5. **`Skill.level` = `String?`** — leveling belum diputuskan produk; teks bebas dulu; persempit via expand→contract nanti (konvensi prisma/README.md).
6. **Cleanup artefak test via `afterAll`** — phone prefix `+62888` khusus test; `afterAll` hard-delete (purge path) sehingga test idempotent dan tidak mengotori DB dev bersama.

### Risiko yang ditemukan

* Vector 768-dim dalam SQL parameter adalah literal string panjang (`"[0.1,0.1,...,0.1]"`, 768 nilai) — driver Prisma mengirimnya sebagai prepared statement parameter, bukan inline. Perlu diverifikasi di produksi bahwa pg tidak punya batas `max_lock_bytes` atau `max_query_length` yang menjadi masalah saat batch embedding insert (PR-025+).
* HNSW index EXPLAIN hanya bisa diverifikasi reliable setelah ada baris data — test roundtrip menyisipkan 1 baris sebelum EXPLAIN; dengan `enable_seqscan=off` Postgres dipaksa ke index bahkan untuk tabel kecil. Periksa ulang saat data volume prod nyata.
* `Skill.level` String? memungkinkan nilai bebas masuk DB — bila produk memutuskan enum, migrasi `ALTER TYPE` dibutuhkan (expand→contract PR tersendiri).

### Next steps

* PR-011: migrasi 03 marketplace (companies, jobs + `job_embedding vector(768)`, applications, match_scores, ai_usage, notifications, sign_videos + seluruh indeks SDD §6.3). `CREATE EXTENSION IF NOT EXISTS vector` tidak perlu diulang (sudah dari migrasi 02).
* PR-013/037: util `core/crypto` AES-256-GCM — mengisi `disabilityTypes`/`accommodationNeeds` yang selama ini `NULL` (ciphertext kosong tidak valid). Perhatikan konvensi `iv‖tag‖data` prefix versi kunci.
* PR-025+: repo matching pemakai `profileEmbedding` — `$queryRaw` terkurung di satu file, akses via service layer.
* Tambahkan catatan `apps/api/.env` yang harus dibuat lokal (jangan commit) ke README onboarding root — ketahuan saat debugging PR-009/010.

**Out of Scope (dicatat):** logika enkripsi (PR-013/037); repo matching (PR-025+); tabel marketplace (PR-011); seed persona (PR-012).

---

## PR-011 — Migrasi Domain Marketplace

**Tanggal selesai:** 2026-07-19

### Ringkasan hasil

* **Migrasi 03** `03_domain_marketplace` — 7 tabel + 8 enum melengkapi skema MVP (SDD §6.2–6.3, PRD §10):
  * `companies` (inclusivity_status enum, accommodations jsonb, verified_by SetNull), `jobs` (employment/work_mode/status/source enum, salary Int, accommodations jsonb, welcomed_disability_types text[] — data lowongan publik, bukan data pribadi; `job_embedding vector(768)` Unsupported), `applications` (**unique (user_id, job_id)** idempotensi; user Cascade / **job Restrict** / resume NoAction; status_history jsonb append-only; hired_confirmed_at = North Star), `match_scores` (PK komposit, Cascade dua arah — cache), `ai_usage` (feature enum + index kuota harian), `notifications` (partial index unread), `sign_videos` (SignBridge v1, FTS phrase).
* **Raw SQL indeks lengkap SDD §6.3**: FTS `'indonesian'` GIN (title+description), pg_trgm GIN title (extension self-contained), GIN accommodations `jsonb_path_ops`, HNSW job_embedding, btree (status, published_at DESC), partial notifications unread, btree applications ×2, FTS sign_videos.phrase.
* **down.sql** — 7 tabel + 8 enum; diuji up→down→up + full `migrate reset` (01→02→03+seed) hijau.
* 8 test integration baru (70 total apps/api; 103 workspace): EXPLAIN×3 membuktikan tiap indeks terpakai, race apply paralel, Restrict vs Cascade kontras, enum snapshot (pg_enum), partial index.

### Scope selesai vs tidak

* ✅ Migrasi 03: 7 tabel + raw SQL indeks — selesai.
* ✅ FK applications→jobs RESTRICT — selesai (+resume NoAction, lihat keputusan 3).
* Tidak ada scope dipangkas.

### Keputusan teknis

1. **Enum yang PRD/SDD tidak rinci** (`EmploymentType`, `AiFeature`) kudetailkan sendiri — nilai standar pasar kerja & daftar fitur kuota SDD §7.2; enum PostgreSQL bisa `ADD VALUE` tanpa rewrite. Snapshot test membuat perubahan selalu terlihat di review.
2. **`applications.resume_id` = `NoAction`** (bukan Restrict): RESTRICT dicek segera per baris — hapus akun (cascade users→applications+resumes dalam satu statement) bisa gagal tergantung urutan eksekusi; NO ACTION dicek di akhir statement sehingga cascade bersih, tapi DELETE resume langsung yang masih dipakai lamaran tetap ditolak. Semantik "CV tak hilang selama lamaran ada" terpenuhi tanpa menghalangi hak hapus akun PDP.
3. **Pelanggaran RESTRICT = SQLSTATE 23001, bukan P2003** — Prisma hanya memetakan 23503 (foreign key violation NO ACTION) ke P2003; 23001 jadi `PrismaClientUnknownRequestError`. Test assert perilaku (ditolak + baris utuh), bukan kode error. Catatan penting untuk error handling modul jobs nanti (PR-024+): tangkap kedua bentuk.
4. **DropIndex nyasar kedua kalinya** — Prisma kembali menganggap index HNSW (kolom Unsupported) sebagai drift dan menyisipkan `DROP INDEX seeker_profiles_embedding_hnsw` diam-diam ke migrasi 03. Ritual "periksa & hapus blok DropIndex pada file migrasi generated" kini terdokumentasi tebal di prisma/README.md (Jebakan) — berlaku untuk SEMUA migrasi ke depan yang menyentuh tabel ber-embedding.
5. **Verifikasi risiko FTS**: text search config `'indonesian'` TERSEDIA di image pgvector/pg18 (dicek `pg_ts_config` sebelum implementasi) — risiko phase file tidak terwujud, tidak perlu fallback 'simple'.

### Risiko yang ditemukan

* SQLSTATE 23001 tidak terpetakan Prisma (lihat keputusan 3) — modul jobs/companies HARUS menangani `PrismaClientUnknownRequestError` berisi "restrict" saat delete, bukan hanya P2003.
* `welcomed_disability_types text[]` plaintext adalah keputusan sadar (data lowongan yang MENYAMBUT, milik perusahaan, publik) — jangan dikacaukan dengan `disability_types` seeker (bytea). Kalau kelak ada kebijakan lain, kolom mudah dienkripsi menyusul.
* HNSW jobs dibuat saat tabel kosong; dengan ~150 lowongan target tahun 1, recall/latency bukan isu — evaluasi ulang parameter (m, ef) saat katalog ribuan.
* Advisory lock Prisma sempat menggantung berulang di sesi dev Windows (proses tsx/prisma zombie) — bila `migrate` timeout advisory lock: cari & kill proses node prisma (`Get-CimInstance ... -match 'prisma'`), lalu `pg_terminate_backend` sisa koneksi. Belum perlu otomasi; catat gejalanya.

### Next steps

* PR-012: seed persona (3 seeker, 5 companies, 20 jobs, lamaran contoh) — seluruh tabel kini tersedia.
* PR-024+ (modul jobs): error handling delete → tangkap 23001; soft-close lowongan alih-alih delete.
* PR-025+ (matching): `$queryRaw` HNSW terkurung repo matching; pola `$transaction` untuk SET LOCAL sudah teruji.
* PR-048/065/083: devices, ai_chat_sessions, suspended_at — inkremental sesuai backlog.

**Out of Scope (dicatat):** devices (PR-048); ai_chat_sessions (PR-065); suspended_at (PR-083); seed persona (PR-012); modul pemakai tabel (PR-021+).

---

## PR-012 — Seed Data Dev & Fixture E2E

**Tanggal selesai:** 2026-07-19

### Ringkasan hasil

* **`prisma/fixtures.ts`** — konstanta UUID stabil (format v7 valid, timestamp beku 2026-01-01, blok akhiran readable): 5 users (admin + 4 persona), 5 companies, 20 jobs, 4 resumes, 6 applications; derivatif stabil untuk experience/education/skills.
* **`prisma/seed-data.ts`** — logika seed importable (dipisah dari entry `seed.ts` supaya test bisa memanggil `runSeed(prisma)` langsung):
  * **Guard produksi**: `NODE_ENV=production` → `SeedProductionError` SEBELUM query DB apa pun.
  * **Idempotent via upsert by fixture ID** — 2× jalan = jumlah identik; data dev lain tak tersentuh (bukan delete-recreate).
  * **4 persona PRD §4** (AC menulis 4; Objective "3 persona" — AC diikuti): Rina/Tuli (prefers_sign_language+simple_language), Bayu/Netra (screen_reader_hint+high_contrast), Sari/Daksa (large_touch_targets), Dimas/Autisme (simple_language+reduce_motion) — masing-masing lengkap dengan seeker_profile, pendidikan, keahlian, resume (content jsonb).
  * **5 companies** variasi inclusivity_status (2 verified, 2 self_claimed, 1 unverified) + taksonomi akomodasi berbeda.
  * **20 jobs** matriks matching: 3 work_mode × 6 jenis akomodasi × status (17 published, 2 draft, 1 closed), salary variatif, welcomed_disability_types sebagian terisi, relevansi per persona (j01–03 Rina, j04–07 Bayu, j08–11 Sari, j12–15 Dimas).
  * **6 lamaran** pipeline beragam termasuk **Sari→j09 hired ber-hired_confirmed_at + status_history 4 langkah (North Star terlihat)**.
* **`prisma/FIXTURES.md`** — dokumentasi blok ID, aturan "jangan ubah UUID", tabel persona/jobs/applications.
* **Kolom sensitif (disability_types/accommodation_needs/consent) SEMUA NULL** — bytea ciphertext, util enkripsi = PR-013; dilarang plaintext. Diuji eksplisit (guard kebijakan).
* 6 test integration baru (76 total apps/api; 109 workspace); manual `db:reset` penuh + inspeksi psql.

### Scope selesai vs tidak

* ✅ `seed.ts` idempotent — selesai (upsert by ID, diuji 2×).
* ✅ Fixture ID stabil untuk E2E — selesai (fixtures.ts + FIXTURES.md).
* Tidak ada scope dipangkas.

### Keputusan teknis

1. **Tanpa faker** (phase file §backlog menyebut "faker seeded") — fixture E2E butuh nilai stabil PERSIS antar-run & antar-mesin, bukan sekadar deterministik dalam satu proses; literal tetap juga diff-able di review dan tanpa dependensi baru. Penyimpangan sadar, dicatat.
2. **`seed-data.ts` dipisah dari `seed.ts`** — entry CLI tetap tipis; test memanggil `runSeed()` langsung tanpa spawn proses (idempotensi 2× diuji dalam satu suite).
3. **Guard produksi dilempar sebelum koneksi DB** — diuji dengan client palsu yang meledak bila tersentuh; seed tidak akan pernah menulis apa pun ke DB produksi bahkan bila DATABASE_URL produksi terpasang.
4. **UUID fixture memakai timestamp beku (2026-01-01)** — tetap lolos format v7/varian (validasi zod `idSchema` kompatibel), sortable konsisten, dan segmen akhiran readable per blok entitas (…0011 = Rina, …0201 = j01).
5. **Kebutuhan akomodasi persona diwakili data non-sensitif** — preferensi UI (accessibility_profiles) + akomodasi jobs; kolom sensitif menunggu PR-013. Matching dev tetap bisa diuji via accommodations jobs vs preferensi.
6. **Nomor HP fixture prefix `+62115…`** — dummy jelas di luar rentang operator nyata; nama semua berlabel "(Fiktif)".

### Risiko yang ditemukan

* Fixture applications memakai resume persona — bila PR-013 nanti mengenkripsi kolom sensitif seed (mengisi nilai), test "SEMUA NULL" harus diperbarui sadar (bukan dilonggarkan diam-diam).
* `db:seed` di mesin dev butuh Docker hidup — gejala `Can't reach database server at localhost:5433` = Docker Desktop mati (terjadi di sesi ini; nyalakan dulu). Sudah terdokumentasi di prisma/README.md gejala serupa.
* Derivatif ID (`…e`/`…d`/hex) valid uuid tapi tidak berversi-7 murni pada digit varian — hanya dipakai internal seed, tidak diekspor sebagai fixture E2E; kalau kelak dibutuhkan E2E, promosikan ke konstanta eksplisit.

### Next steps

* PR-013: core/crypto — setelahnya pertimbangkan mengisi kolom sensitif persona via seed TERENKRIPSI (dengan kunci dev) agar flow disclosure bisa diuji end-to-end.
* PR-031: E2E smoke memakai FIXTURE.* — jangan hardcode UUID di spec, impor dari fixtures.ts.
* PR-025+ (matching): jobs j01–j20 dirancang untuk menguji ranking per persona — pakai sebagai dataset evaluasi awal.

**Out of Scope (dicatat):** data pilot produksi (kurasi admin nyata); embeddings (PR-025+); pengisian kolom terenkripsi (PR-013/037); E2E smoke run (PR-031).

## PR-013 — core/crypto — AES-256-GCM Berversi

* 2026-07-21 — Selesai. `core/crypto` (`encryptField`/`decryptField` + rotasi kunci berversi), fail-fast validasi kunci saat boot, dan `docs/runbook-keys.md`.

### Ringkasan hasil

* `apps/api/src/core/crypto/index.ts` — util enkripsi field sensitif AES-256-GCM berversi (ADR-007). Format biner `[1 byte versi][12 byte IV][16 byte tag][n byte ciphertext]`. API: `parseFieldKeys()`, `createFieldCrypto()` (`encryptField`/`decryptField`/`encryptJson`/`decryptJson`/`versionOf`), `isEncryptedField()`, tipe branded `EncryptedField`, error `FieldKeyError`/`DekripsiError`.
* Fail-fast kunci di `apps/api/src/index.ts` — `parseFieldKeys()` dipanggil SEBELUM `createLogger`/`createDbClient`/`createRedisClients`/`createServer`. Kunci hilang/salah panjang/format → `console.error` + `process.exit(1)`, server tidak pernah listen.
* `docs/runbook-keys.md` — runbook rotasi (konsep, generate, rotasi tanpa downtime, retire, kompromi kunci, verifikasi dev, DR/ADR-015, tabel troubleshooting).
* `apps/api/.env.example` + `docker-compose.dev.yml` — `FIELD_KEY_V1` dummy dev-only (base64 32 byte valid) + instruksi `openssl rand -base64 32`.
* 2 file test baru (13 unit + 4 integration); **101 test workspace apps/api hijau**. Lint & typecheck hijau. Rotasi diverifikasi manual via tsx.

### Scope selesai vs tidak

* ✅ Util crypto + tipe `EncryptedField` — selesai.
* ✅ Validasi kunci saat boot (panjang, format, versi) — selesai, fail-fast di entry point.
* ✅ `docs/runbook-keys.md` (rotasi) — selesai.
* Tidak ada scope dipangkas.

### Keputusan teknis

1. **`parseFieldKeys()` sebelum segala inisialisasi** (permintaan eksplisit + AC): dipanggil tepat setelah `loadEnv()`, sebelum logger/DB/Redis/listener. Instance `FieldKeys` disimpan (`void fieldKeys`) untuk diteruskan ke modul profiles (PR-037) — validasi kunci sudah terjadi di boot sejak sekarang, bukan saat enkripsi pertama.
2. **Validasi kunci TIDAK di `core/config` (env.ts)**: kepemilikan validasi kunci di `core/crypto` (dicatat sebagai janji PR-006 → dilunasi di sini). `loadEnv` tetap murni tanpa `FIELD_KEY_*`, jadi test env/server lama tidak berubah.
3. **Round-trip guard base64**: `key.toString("base64") !== raw.trim()` menolak base64 rusak yang "diam-diam" di-decode Node jadi buffer 32 byte tapi bukan encoding kanonik.
4. **Versi kanonik (`match[1] !== String(version)`)**: menolak `FIELD_KEY_V01` agar tidak ada dua nama env menunjuk versi 1 yang sama (ambiguitas kunci aktif).
5. **Modul crypto tidak import logger**: material kunci/plaintext tidak boleh berisiko ter-log dari dalam modul; redaction pino (`fieldKey`) adalah lapisan kedua, bukan satu-satunya.
6. **Boot test via child process nyata** (`node --import tsx src/index.ts`, bukan `.bin/tsx`): membuktikan ORDERING fail-fast (exit sebelum "API siap") lintas OS tanpa masalah resolusi `.cmd` di Windows.
7. **Truncation test di SEMUA panjang 0..len-1** (bukan sampel): memastikan tidak ada panjang potong yang lolos mengembalikan plaintext — GCM auth + guard panjang minimum menutup seluruh rentang.

### Risiko yang ditemukan

* **Kunci bocor via env (T8)** — mitigasi tercatat di runbook §5/§7 & ADR-015 (chmod 600, password manager, redaction). Job re-encrypt untuk retire kunci bocor = PR-037+.
* **Dummy `FIELD_KEY_V1` di `.env.example`/compose bersifat publik** — sengaja dummy dev-only dengan peringatan eksplisit "WAJIB ganti"; kunci prod via env vars/secret store, tidak pernah di compose (dicatat di komentar compose).
* **Retire kunci prematur** — mendekripsi data yang versinya sudah di-retire melempar `DekripsiError` (bukan senyap). Runbook §4/§8 menegaskan jangan retire sebelum re-encrypt tuntas; `versionOf()` disediakan untuk memilih baris belum-migrasi.

### Next steps

* PR-037 (profiles): pakai `createFieldCrypto` untuk mengisi `disability_types`/`accommodation_needs`; sediakan job re-encrypt bertahap (retire kunci lama). `versionOf()` sudah tersedia untuk monitoring versi.
* PR-012 follow-up: pertimbangkan mengisi kolom sensitif seed via ciphertext (kunci dev) agar flow disclosure teruji end-to-end — saat itu test "SEMUA NULL" di `db-seed.test.ts` harus diperbarui sadar.
* PR-014 (audit): tinjau ulang deny list redaction bersama helper audit (janji bersama PR-006).

**Out of Scope (dicatat):** pemakaian di profiles (PR-037); enkripsi backup `age` (PR-104); job re-encrypt/retire otomatis (PR-037+); pengisian kolom sensitif seed (PR-012 follow-up / PR-037).

---

## PR-014 — core/audit — Audit Logging Helper

**Tanggal selesai:** 2026-07-24

### Ringkasan hasil

* `core/audit` menyediakan factory `createAuditLog()` yang menghasilkan kontrak `auditLog(actor, action, entity, entityId, meta)`. Entry memiliki UUID v7 dan hanya dikirim melalui `AuditWriter.append()`; adapter Prisma hanya menjalankan `create`.
* `actor` membawa `actorId` historis (boleh `null` untuk sistem) dan `requestId`. Karena tabel PR-009 tidak memiliki kolom request ID, helper menyimpan `requestId` tervalidasi UUID dalam `meta` tanpa migrasi.
* Katalog action terpusat berada di `packages/schemas/src/audit.ts`: login gagal, baca/ubah profil sensitif, perubahan status lamaran, verifikasi perusahaan, aksi admin, ekspor data, dan hapus akun. Dokumentasi meta aman ada di `docs/audit-action-catalog.md`.
* Zod allowlist per action membuang key tidak dikenal sebelum insert. Nilai disabilitas, kebutuhan akomodasi, nama, dan nomor telepon tidak masuk ke `audit_logs`.
* Promise writer tidak ditunggu sehingga aksi bisnis tidak terblokir. Jika gagal, helper menaikkan metric sink `audit_write_failed` dan menulis konteks aman saja (tanpa error atau meta mentah) ke Pino.
* Dua file test baru mencakup 12 unit test (strip semua action, validasi meta, latency, failure) dan satu integration test PostgreSQL untuk insert nyata.

### Scope selesai vs tidak

* Selesai: helper append-only, meta schema per action, enum action terpusat dan dokumentasinya.
* Tidak ada scope dipangkas.

### Keputusan teknis

1. `requestId` disimpan di `meta` karena kolom terpisah tidak ada dan perubahan database di luar scope.
2. Allowlist Zod dipilih alih-alih redaction blacklist agar field baru tidak terekam secara tidak sengaja.
3. Writer dan metric sink diinjeksi agar core tidak membuat koneksi Prisma atau memilih backend observability sendiri.
4. Kegagalan tidak melog objek error atau meta mentah agar error database tidak menjadi jalur PII.

### Risiko yang ditemukan

* Grant database yang melarang `UPDATE`/`DELETE` belum ada; enforcement append-only pada DB tetap follow-up PR-097 sesuai PR-009.
* Katalog action perlu ditinjau saat modul mulai memakainya agar tidak bising; baca massal harus dicatat per job/ringkasan, bukan per record.
* Integration test memakai PostgreSQL development Nawasena yang sudah hidup karena port 5433 telah dipakai. Artefak `audit-test` dibersihkan; CI tetap memakai service PostgreSQL sendiri.

### Next steps

* PR auth, profiles, applications, companies, admin, dan PDP memetakan aksi mereka ke katalog ini.
* PR-097 menambahkan grant database append-only untuk `audit_logs`.
* PR observability berikutnya menghubungkan `AuditMetricSink` ke backend metrik produksi.

**Out of Scope (dicatat):** pemetaan panggilan audit per modul; retensi/arsip 2 tahun (PR-024 hook); grant append-only database (PR-097); backend metrik produksi.
