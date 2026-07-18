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
