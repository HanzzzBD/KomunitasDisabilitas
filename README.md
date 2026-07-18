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

## Secrets & Environment

- Development: salin `.env.example` → `.env.local`, isi nilai lokal. File `.env*` di-ignore git (ADR-015).
- CI/Production: env vars via GitHub Secrets — tidak ada file `.env` di repo.

## Rollback (RB-Std)

```bash
git revert <commit-hash>   # revert PR merge
./deploy.sh --rollback     # rollback deployment (menyusul saat CI/CD aktif)
```

Migrasi database backward-compatible satu versi; DB tidak di-rollback bersama image.
