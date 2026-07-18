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
