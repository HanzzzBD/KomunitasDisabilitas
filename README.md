# Incasif — Inclusive Career Ecosystem for People with Disabilities

Platform pencarian kerja berbasis AI yang dirancang khusus dan sepenuhnya aksesibel bagi penyandang disabilitas di Indonesia (Tuli, Netra, Daksa, Autisme, dan disabilitas ganda). Standar aksesibilitas: **WCAG 2.2 Level AA** (end-to-end).

Dokumen produk & teknis: [PRD.md](./PRD.md) · [SDD.md](./SDD.md) · [DESIGN.md](./DESIGN.md) · [ADR](./docs/adr/) · [Rencana implementasi](./docs/implementation/README.md)

## Struktur Repo (Monorepo — pnpm + Turborepo)

```
ProjectKomunitasDisabilitas/
├── apps/
│   ├── api/          Express + TypeScript (monolith modular) — backend API
│   ├── worker/       BullMQ worker (codebase sama dengan api, entry berbeda)
│   ├── web/          React 18 + Vite (SPA, accessibility-first)
│   └── mobile/       React Native + Expo (Android; iOS Fase 2)
├── packages/
│   ├── config/       Preset terpusat: tsconfig, eslint, prettier
│   ├── schemas/      Skema zod bersama (validasi FE = validasi BE)
│   ├── api-client/   Client TS dari kontrak zod + TanStack Query
│   ├── ui/           Design system aksesibel (web + RN counterpart)
│   └── a11y/         Hook & context profil aksesibilitas
├── docs/             ADR, rencana implementasi (18 phase / 112 PR)
├── turbo.json        Pipeline Turborepo (build, lint, typecheck, test, dev)
└── pnpm-workspace.yaml
```

> Catatan: `apps/*` dan `packages/*` (selain `config`) saat ini berupa placeholder workspace. Kode aplikasi diisi bertahap sesuai [rencana implementasi](./docs/implementation/README.md).

## Prasyarat

- **Node.js 20 LTS** atau lebih baru
- **pnpm 9** — aktifkan via corepack: `corepack enable pnpm` (versi di-pin di `package.json` → `packageManager`)

## Cara Menjalankan

```bash
# 1. Install dependencies (seluruh workspace)
pnpm install

# 2. Type check seluruh workspace (strict mode)
pnpm typecheck

# 3. Lint seluruh workspace
pnpm lint

# 4. Jalankan unit test (Vitest)
pnpm test

# 5. Format check / auto-format
pnpm format:check
pnpm format

# 6. Dev server (belum ada — menyusul saat apps terisi)
pnpm dev
```

Semua perintah di atas dijalankan lewat Turborepo (`turbo run <task>`) sehingga mendukung cache & paralelisme antar workspace.

## Konvensi Global

Berlaku untuk semua PR (detail di [CLAUDE.md](./CLAUDE.md) dan [docs/implementation/README.md](./docs/implementation/README.md)):

- **Lint boundaries** — batas modul ditegakkan `eslint-plugin-boundaries` (mulai PR-002); no cross-module repo import, no direct AI SDK import di luar `core/ai`.
- **Validasi input** — selalu via zod dari `@incasif/schemas`.
- **Error envelope** — `{code, message, hint}` dalam Bahasa Indonesia sederhana.
- **A11y gate** — perubahan frontend wajib lolos axe-core + jsx-a11y + Lighthouse (WCAG 2.2 AA).
- **AI via gateway** — panggilan LLM hanya lewat `core/ai`, hormati kuota per-user.
- **No PII/secret** — tidak ada PII atau secret di log maupun kode; `.env*` tidak pernah di-commit (lihat `.gitignore`).
- **Ukuran PR** — target < 500 LOC.

## CI — Status Check per PR

Setiap PR ke `main` menjalankan workflow [`.github/workflows/pr.yml`](./.github/workflows/pr.yml) (GitHub Actions, ADR-016). Check **wajib hijau sebelum merge** (branch protection):

| Status check                    | Isi                                                                                                                       | Blocking?       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `lint-typecheck-test`           | `pnpm lint` (termasuk **boundaries** — pelanggaran arsitektur = merah) → `pnpm typecheck` (strict) → `pnpm test` (Vitest) | ✅ Wajib        |
| `e2e (slot — aktif di PR-031)`  | Slot Playwright — belum berjalan                                                                                          | ⏸ Non-blocking |
| `a11y (slot — aktif di PR-031)` | Slot axe-core + Lighthouse CI — belum berjalan                                                                            | ⏸ Non-blocking |

Karakteristik pipeline:

- **Cache**: pnpm store (via `actions/setup-node`) + Turborepo (`.turbo/cache` via `actions/cache`) — run kedua dengan input sama jauh lebih cepat.
- **Least-privilege**: `permissions: contents: read`; tanpa secrets produksi.
- **Concurrency**: push baru ke branch PR yang sama membatalkan run lama.

Kalau check merah: buka tab **Checks** di PR → lihat step yang gagal → jalankan perintah yang sama secara lokal (`pnpm lint` / `pnpm typecheck` / `pnpm test`) untuk mereproduksi.

### Branch protection (setup sekali, admin repo)

Settings → Branches → Add branch ruleset/protection rule untuk `main`:

1. ✅ Require a pull request before merging
2. ✅ Require status checks to pass before merging → pilih **`lint-typecheck-test`**
3. ✅ Require branches to be up to date before merging (opsional, disarankan)

Atau via CLI (`gh auth login` dulu):

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection \
  -F 'required_status_checks[strict]=true' \
  -f 'required_status_checks[checks][][context]=lint-typecheck-test' \
  -F enforce_admins=true \
  -F 'required_pull_request_reviews[required_approving_review_count]=0' \
  -F restrictions=null
```

## Secrets & Environment

- Development: salin `.env.example` → `.env.local`, isi nilai lokal. File `.env*` di-ignore git (ADR-015).
- CI/Production: env vars via GitHub Secrets — tidak ada file `.env` di repo.

## Rollback (RB-Std)

```bash
git revert <commit-hash>   # revert PR merge
./deploy.sh --rollback     # rollback deployment (menyusul saat CI/CD aktif)
```

Migrasi database backward-compatible satu versi; DB tidak di-rollback bersama image.
