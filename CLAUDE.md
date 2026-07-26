# CLAUDE.md — Project Context & Development Guide

> **Last Updated:** 2026-07-24
> **Project:** Nawasena — Masa Depan Karier Tanpa Batas
> **Documentation Source:** PRD v1.2, SDD v1.2, ADRs 001–018, Implementation Plan v3.1

---

## 1. Project Overview

**Nawasena** adalah platform karier inklusif berbasis teknologi yang membantu penyandang disabilitas menemukan peluang kerja yang setara, aksesibel, dan sesuai potensi mereka.

### North Star Metrics
- **Primary:** Jumlah penempatan kerja (pengguna diterima bekerja melalui platform)
- **Secondary:** Keterjangkauan (WCAG 2.2 Level AA), engagement pengguna

### Key Features (MVP)
1. **AI Job Matching** — mencocokkan profil pengguna dengan lowongan berdasarkan skill, disabilitas, kebutuhan akomodasi
2. **Accessibility Profile Global State** — preferensi aksesibilitas (screen reader, kontras, teks sederhana, BISINDO, kurangi animasi) diterapkan otomatis di seluruh UI
3. **AI Career Assistant** — CV builder percakapan terpandu, simulasi wawancara, AI CV Checker
4. **SignBridge Indonesia** (Fase 2–3) — penerjemah Bahasa Isyarat Indonesia ↔ Bahasa Indonesia via computer vision + AI
5. **Company Accessibility Profile** — transparansi fasilitas aksesibel & tingkat inklusivitas perusahaan
6. **Community** (Phase 19, post-MVP) — ruang diskusi topik/kota, membership, post teks, report, dan moderasi; tanpa pesan pribadi atau unggahan media pada fase awal

### Target & Timeline
- **Target tahun 1:** Validasi dengan < 5.000 pengguna terdaftar di 1–2 kota/komunitas (~500 DAU)
- **MVP Timeline:** 3–4 bulan
- **Tim:** 2–5 engineer
- **Standar Aksesibilitas:** **WCAG 2.2 Level AA** (end-to-end, tidak opsional)

### Roadmap Implementasi Terbaru
- Dokumentasi implementasi terbaru tersedia di [docs/implementation/README.md](./docs/implementation/README.md)
- MVP dibagi ke dalam **18 phase** dan **112 PR** untuk 8 sprint + soak/release; Community adalah **Phase 19** post-MVP dengan PR-113..PR-119, dimulai setelah v1.0.0 stabil
- Implementasi hingga PR-013 tetap valid; Community masuk melalui migrasi additive PR-113 dan feature flag sampai readiness gate PR-119 lulus
- Phase yang terdefinisi mencakup foundation, auth, web base, accessibility, profile, AI gateway, notifications, companies/jobs, resume PDF, AI CV builder, matching engine, applications, admin analytics, SignBridge, mobile, infrastructure/observability, security hardening, release, dan Community post-MVP

### Dokumentasi Log Implementasi
- Implementasi dilakukan per PR.
- Setiap PR yang selesai dicatat dalam file log phase yang relevan di folder [docs/implementation/log](./docs/implementation/log).
- Format nama file: `implementation_log_phaseXX.md`, contohnya `implementation_log_phase01.md`.
- Di dalam file phase ini, tambahkan catatan untuk setiap PR yang selesai, termasuk ringkasan hasil PR, scope yang selesai, keputusan teknis, risiko, dan next steps.

---

## 2. Tech Stack

### Backend
- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js + TypeScript (strict mode)
- **ORM:** Prisma v5+
- **Database:** PostgreSQL 18 + pgvector (extensions: pgvector, pg_trgm)
- **Task Queue:** BullMQ + Redis (dijalankan dalam proses worker terpisah di Docker Compose)
- **API Documentation:** tBD (swagger/openapi di Fase 2)

### Frontend (Web)
- **Library:** React 18+ (via Vite)
- **State Management:** Zustand (global) + TanStack Query (server state)
- **UI Components:** Custom components dengan focus accessibility-first
- **Styling:** Tailwind CSS (strict WCAG 2.2 AA compliance)
- **Accessibility Checks:** axe-core (axe devtools), jsx-a11y (ESLint), Lighthouse
- **Type Checking:** TypeScript strict

### Frontend (Mobile)
- **Framework:** React Native (Expo)
- **State Management:** Zustand + TanStack Query (same as web)
- **UI Components:** Custom RN components, accessibility-first

### Infrastructure & DevOps
- **Containerization:** Docker + Docker Compose (ADR-006)
- **Deployment Target:** VPS 4 vCPU / 8 GB (≤ Rp300rb/bulan)
- **CI/CD:** GitHub Actions (ADR-016, PR-003)
- **Secrets Management:** `.env` files (development local), env vars (production/CI) — **NEVER commit secrets** (ADR-015)
- **Observability:** Minimal logging stack (structured JSON logs; Fase 2: centralized logging)

### AI & LLM Services
- **Primary LLM:** Google Gemini (free tier API)
- **Fallback LLM:** Groq (free tier API)
- **Access Pattern:** **ALWAYS via AI Gateway** (ADR-012) — không direct SDK imports di luar `core/ai` modul
- **Use Cases:** Job matching embeddings, CV analysis, interview simulation, content generation
- **Rate Limiting:** Per-user quota, tracked in AI Gateway

### Monorepo Tooling
- **Package Manager:** pnpm (workspaces)
- **Monorepo Orchestrator:** Turborepo
- **Workspace Structure:** `apps/{api, worker, web, mobile}` + `packages/{config, schemas, api-client, ui, a11y}`

---

## 3. Architecture

### 3.1 Architectural Pattern: Monolith Modular (ADR-001)

**Why:** Satu tim kecil (2–5 orang), < 5.000 pengguna MVP, satu VPS 8 GB, timeline pendek (3–4 bulan).

**What:** 
- Satu deployable artefak (Express app + worker)
- 13 modul resmi dengan batas tegas ditegakkan `eslint-plugin-boundaries` (PR-002)
- Lapisan: `router → controller → service → repository` (one-way, strict)
- Antar-modul komunikasi hanya via service layer atau in-process event domain

**Trade-offs:**
- ✅ Satu CI/CD, transacsi ACID lintas modul, debugging sederhana
- ❌ Blast radius satu bug = API down; scaling hanya per-whole-app

**Upgrade Path:** Pemecahan ke microservices berdasarkan pemicu SDD §19 (≤ bila terbukti perlu); SignBridge v2 sudah dirancang sebagai service terpisah (ADR-010).

### 3.2 Module Boundaries (SDD §5.1)

```
┌─────────────────────────────────────────────────────┐
│ apps/api                                            │
│ ┌─────────────────────────────────────────────────┐ │
│ │ core/                (shared: http, ai, auth)   │ │
│ │ modules/                                         │ │
│ │   ├── auth/        (Auth, JWT, RBAC)           │ │
│ │   ├── users/       (user management)           │ │
│ │   ├── accessibility/ (profile preferences)     │ │
│ │   ├── profiles/    (seeker profiles & data)    │ │
│ │   ├── resumes/     (CV data & generation)      │ │
│ │   ├── companies/   (employer & company data)   │ │
│ │   ├── jobs/        (job postings)              │ │
│ │   ├── matching/    (AI job-seeker matching)    │ │
│ │   ├── applications/ (apply pipeline)           │ │
│ │   ├── notifications/ (email, SMS, push)        │ │
│ │   ├── admin/       (internal ops, analytics)   │ │
│ │   └── signbridge/  (bridge to SignBridge v2)   │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
  
  Each module: src/{routers, controllers, services, repositories}
```

**Layer Flow (one-way):**
```
HTTP Request
  ↓
Router (route match, basic input parsing)
  ↓
Controller (middleware, permission check, orchestration)
  ↓
Service (business logic, orchestration across repos)
  ↓
Repository (DB query via Prisma)
  ↓
Database (PostgreSQL)
```

**Cross-module Communication:**
- ✅ Call service layer of another module
- ✅ Emit in-process domain event; other module subscribes
- ❌ Direct repo import across modules
- ❌ Direct AI SDK import outside `core/ai`

**Lint Enforcement (PR-002, PR-003):**
- `eslint-plugin-boundaries` checks import rules at CI
- Violation → **build red** (non-negotiable)

### 3.3 Database Design (ADR-003)

**Primary:** PostgreSQL 18 + pgvector (on VPS)

**Why single DB:**
- ✅ One backup/restore, one transaction engine
- ✅ ACID for critical flows (apply idempotent, pipeline status)
- ✅ pgvector HNSW sufficient for MVP scale (≤ ribuan lowongan, ribuan seeker embeddings)
- ✅ FTS + pg_trgm native untuk lowongan search (ADR-018)

**Key Schemas:**
- `users` (authentication, basic identity)
- `seeker_profiles` (career history, skills, preferences; **embedding** kolom `profile_embedding` vektor(768))
- `jobs` (job postings; **embedding** kolom `job_embedding` vektor(768), FTS col `fts_doc`)
- `applications` (apply history, status pipeline)
- `companies` (employer data, accessibility profile)
- `resumes` (CV versions, generated metadata)
- Plus audit/event tables

**Vector Matching:**
- Job matching embedding stored in `matching.embeddings` via raw SQL
- Similarity search uses Prisma `$queryRaw` dengan `ORDER BY ... <-> ...` operator pgvector

**FTS (Full-Text Search):**
- Built-in PostgreSQL FTS + pg_trgm untuk lowongan search (ADR-018)
- Raw SQL di modul `jobs` repo layer

### 3.4 Authentication & Authorization (ADR-xxx)

- **Signup:** Google Sign-In atau SMS OTP + nomor HP
- **Session:** JWT bearer token (Redis-backed session store via BullMQ cache)
- **RBAC:** Role-based (admin, employer, seeker); permissions checked at controller middleware
- **Encrypted Data:** User sensitif data (SSN, bank account, akomodasi detail) encrypted AES-256-GCM (ADR-007) at rest

---

## 4. Key Architecture Decision Records (ADRs)

| ADR | Title | Impact |
|-----|-------|--------|
| **ADR-001** | Monolith Modular vs Microservices | Backend architecture: one deployable, module boundaries enforced |
| **ADR-002** | Express.js + TypeScript | Backend framework; tanpa opini (manual struktur) |
| **ADR-003** | PostgreSQL 18 + pgvector | Database: relational + vector + FTS dalam satu instance |
| **ADR-004** | Redis + BullMQ | Task queue untuk async work (email, notifications, job matching batches) |
| **ADR-005** | Gemini primary + Groq fallback | LLM access: free tier; gateway-mediated; per-user quota |
| **ADR-006** | Docker Compose di VPS | Deployment: satu VPS, multi-container orchestration lokal (bukan K8s) |
| **ADR-007** | AES-256-GCM enkripsi | Data protection: sensitive columns encrypted at rest (SSN, akomodasi) |
| **ADR-008** | Accessibility Profile Global State | Preference global state (screen reader, contrast, simple text, BISINDO, reduce motion); auto UI adaptation |
| **ADR-009** | Online-only MVP | No offline support MVP; Fase 2+ jika terbukti perlu |
| **ADR-010** | SignBridge v2 Service Terpisah | SignBridge (BISINDO↔Indonesia translator) sebagai service terpisah; bridge via API |
| **ADR-011** | React Native + Expo | Mobile frontend (iOS/Android); same state/UI component strategy as web |
| **ADR-012** | AI Gateway Pattern | Centralized LLM access; forbids direct SDK imports outside `core/ai` |
| **ADR-013** | Scope MVP, Reserved Boundaries | MVP scope defined; Community dipromosikan ke Phase 19 post-MVP, boundary lain tetap reserved |
| **ADR-014** | TanStack Query + Zustand | Web/mobile state: server state (TQ), global state (Zustand) |
| **ADR-015** | Secrets via `.env` (dev) & env vars | Never commit secrets; `.gitignore` `.env*` sejak commit pertama |
| **ADR-016** | GitHub Actions CI/CD | PR checks: lint, typecheck, unit; deploy via `deploy.sh --rollback` |
| **ADR-017** | Observability Hemat | Structured JSON logs; minimal stack MVP (Fase 2: centralized logging) |
| **ADR-018** | PostgreSQL FTS + pg_trgm | Job search: native FTS, tidak external search engine MVP |

---

## 5. Development Conventions & Standards

### 5.1 TypeScript & Code Quality

**Enforcement (PR-003):**
- **Lint:** `eslint` + `eslint-plugin-boundaries` → build red on violation
- **Type Check:** `tsc --noEmit` strict mode → build red on type error
- **Format:** `prettier` (auto-format on save)
- **Test:** Unit tests via Vitest (slot e2e/a11y disiapkan, diaktifkan PR-031)

**Conventions (dari PR-PLAN v3.0):**

```typescript
// ❌ DON'T: Validasi ad-hoc
const name = req.body.name;

// ✅ DO: Validasi via zod dari packages/schemas
import { z } from "zod";
import { createUserSchema } from "@nawasena/schemas";

const parsed = createUserSchema.parse(req.body);
const { name } = parsed;
```

```typescript
// ❌ DON'T: Generic error response
res.status(400).json({ error: "invalid input" });

// ✅ DO: Error envelope (code, message, hint) dalam Bahasa Indonesia
res.status(400).json({
  code: "VALIDATION_ERROR",
  message: "Input tidak valid",
  hint: "Periksa format email Anda"
});
```

**Error Handling Async (Express):**
```typescript
// ✅ DO: Wrap async handlers
import { asyncHandler } from "@nawasena/core/http";

router.get("/:id", asyncHandler(async (req, res) => {
  const profile = await profileService.getById(req.params.id);
  res.json(profile);
}));
// Errors propagate to global error handler
```

### 5.2 Accessibility-First (WCAG 2.2 Level AA)

**Non-negotiable:** Setiap PR frontend lolos **a11y gate CI** (axe + jsx-a11y + Lighthouse).

**Principles:**
1. **Global Accessibility Profile** (ADR-008) — preferensi user (screen reader, kontras, simple text, BISINDO, reduce motion) diterapkan otomatis
2. **Keyboard Navigation** — seluruh UI harus navigable via keyboard (Tab, Enter, Esc, Arrow keys)
3. **Screen Reader** — semantic HTML, ARIA labels, alt text, live regions
4. **Color & Contrast** — min 4.5:1 contrast ratio (normal text), 3:1 (large)
5. **Reduce Motion** — respect `prefers-reduced-motion`; no auto-play/infinite scroll
6. **Readability** — max 120 char line width; simple Indonesian (tanpa jargon/passive voice excessive); ~grade 6 reading level
7. **Form Design** — clear labels, error messages, accessible dropdowns/datepickers, large touch targets (min 44×44 px)

**Persona Testing (pada review):**
- **Rina (Tuli, BISINDO):** Semua konten tersedia dalam teks sederhana + opsi BISINDO video (Fase 2+)
- **Bayu (Netra, screen reader TalkBack/NVDA):** Semantic HTML, ARIA, deskripsi gambar via AI
- **Sari (Daksa, motorik terbatas):** Keyboard nav, besar touch target, keyboard shortcuts, minimal drag/swipe
- **Dimas (Autisme):** Konsisten UI, tenang visual (opsi kurangi animasi), deskripsi eksplisit, predictable flow

### 5.3 Module Template (Generator)

Setiap modul baru harus dimulai dengan struktur standar:

```
modules/new-feature/
├── routers/
│   └── index.ts           (route definition)
├── controllers/
│   └── new-feature.controller.ts   (request ↔ service)
├── services/
│   └── new-feature.service.ts      (business logic)
├── repositories/
│   └── new-feature.repository.ts   (Prisma queries)
├── types.ts               (shared types, interfaces)
├── index.ts               (exports)
└── __tests__/
    └── *.test.ts          (unit tests, co-located)
```

**Import Rules (enforced PR-002):**
```typescript
// ✅ DO: Module external → service layer only
import { newFeatureService } from "modules/new-feature";

// ✅ DO: Within module → any layer
import { newFeatureRepository } from "./repositories";

// ❌ DON'T: Cross-module repo (bypass service)
import { userRepository } from "modules/users/repositories"; // LINT ERROR

// ❌ DON'T: Direct AI SDK (use gateway)
import { GoogleGenerativeAI } from "@google/generative-ai"; // LINT ERROR (use core/ai)
```

### 5.4 Database Migrations (Prisma)

```bash
# 1. Define schema in schema.prisma
# 2. Generate migration
pnpm exec prisma migrate dev --name feature_name

# 3. Migrations are backward-compatible one version
# 4. If destructive, include down migration & test rollback
# 5. Raw SQL (pgvector index, FTS) goes inside migration
```

### 5.5 Testing Strategy

**Layer 1 (Unit):** Vitest untuk service, repo, controller
```typescript
describe("matching service", () => {
  it("should rank jobs by score", async () => {
    const jobs = await matchingService.rankJobs(seekerId);
    expect(jobs[0].score).toBeGreaterThanOrEqual(jobs[1].score);
  });
});
```

**Layer 2 (Integration):** API contract tests + DB (slot PR-031)
**Layer 3 (E2E):** Playwright user flows (slot PR-031)
**Layer 4 (Accessibility):** axe-core, jsx-a11y linting (mandatory PR gate)

### 5.6 Environment & Secrets (ADR-015)

**Development (local):**
```bash
# apps/api/.env (NEVER commit — .env.example hidup per app, tidak di root)
DATABASE_URL="postgresql://nawasena:nawasena@localhost:5433/nawasena"
REDIS_URL="redis://localhost:6379"
GEMINI_API_KEY="..."
NODE_ENV="development"
```

**CI/Production:**
- Env vars set in GitHub Secrets, passed to runner at build time
- No `.env` files in repo
- Secrets scan di CI (pre-commit hooks recommended locally)

### 5.7 Rollback Strategy (RB-Std)

**Standard Rollback:**
```bash
# 1. Revert PR merge
git revert <commit-hash>

# 2. Rebuild image (CI automatic)
# 3. Rollback deployment
./deploy.sh --rollback

# Database: Migrations backward-compatible one version
# (DB NOT rolled back with image; ensures no data loss)
```

### 5.8 Alur Pengiriman PR (Wajib — Setelah Task PR Selesai)

Setelah sebuah task PR-XXX **selesai** (implementasi + test + `pnpm lint`/`typecheck`/`test` hijau + log implementasi ditulis), agent LANGSUNG menjalankan alur berikut **tanpa menunggu perintah tambahan**:

1. **Branch:** kerja di `pr-XXX-<slug>` yang dibuat dari tip branch phase aktif (`phase-XX-<nama>`). Jangan pernah bekerja langsung di branch phase atau `main`.
2. **Commit:** satu commit bermakna, pesan `PR-XXX: <ringkasan singkat>`. Jangan commit file di luar scope PR (mis. file modified yang bukan hasil kerja task ini — biarkan).
3. **Push:** `git push -u origin pr-XXX-<slug>`.
4. **Buat PR** ke branch phase (BUKAN `main`):
   `gh pr create --base phase-XX-<nama> --head pr-XXX-<slug>` dengan body what/why/AC terpenuhi/hasil verifikasi.
   - Push langsung ke branch phase DITOLAK (protected, required check `lint-typecheck-test`) — PR adalah satu-satunya jalur masuk.
5. **Tunggu CI:** `gh pr checks <nomor> --watch --interval 15`. Merge HANYA bila `lint-typecheck-test` pass.
   - CI merah → STOP merge, perbaiki di branch PR, push lagi, tunggu ulang. Jangan pernah bypass check.
6. **Merge manual setelah hijau:** `gh pr merge <nomor> --merge`.
   - Auto-merge repo DINONAKTIFKAN (by design) — jangan pakai `--auto`; agent yang menunggu CI lalu merge.
7. **Sinkron lokal:** `git fetch origin --prune && git checkout phase-XX-<nama> && git pull --ff-only`, lalu kembali/berhenti.
8. **Larangan keras:** JANGAN pernah membuat PR atau merge apa pun ke `main`. `phase-XX → main` hanya terjadi setelah SELURUH PR phase selesai (Exit Criteria terpenuhi) **dan** atas perintah eksplisit owner.

---

## 6. Project Structure (Monorepo)

```
ProjectKomunitasDisabilitas/
├── apps/
│   ├── api/              (Express backend)
│   ├── worker/           (BullMQ task processor)
│   ├── web/              (React 18 frontend)
│   └── mobile/           (React Native Expo)
├── packages/
│   ├── config/           (tsconfig, eslint, prettier presets)
│   ├── schemas/          (zod schemas, shared validation)
│   ├── api-client/       (generated/manual client SDK)
│   ├── ui/               (shared React components, a11y)
│   └── a11y/             (accessibility utilities & hooks)
├── docs/
│   ├── PR-PLAN.md        (engineering backlog)
│   ├── adr/              (architecture decision records)
│   ├── implementation/   (phase-based implementation plan, 18 phases / 112 PR)
│   │   ├── log/          (implementation logs per completed phase)
│   │   └── *.md          (phase docs)
│   └── README.md         (ADR index)
├── .github/
│   └── workflows/        (GitHub Actions: pr.yml, deploy.yml)
├── apps/api/.env.example (template per app — TIDAK ada .env.example di root)
├── docker-compose.yml    (local dev, staging, production overlays)
├── Dockerfile            (single multi-stage for API + worker)
├──     .md             (product design, personas, flows)
├── PRD.md                (product requirements)
├── SDD.md                (software design doc)
├── Deskripsi.txt         (project overview)
├── CLAUDE.md             (this file)
├── package.json          (root workspace)
├── pnpm-workspace.yaml   (pnpm config)
├── turbo.json            (Turborepo config)
└── README.md             (main project readme)
```

---

## 7. Important Files & Reference Links

| File | Purpose |
|------|---------|
| [PRD.md](./PRD.md) | Product Requirements Document v1.1 — business goals, user personas, features |
| [SDD.md](./SDD.md) | Software Design Document v1.1 — technical architecture, module design, risks/mitigations |
| [DESIGN.md](./DESIGN.md) | Product Design — UI flows, accessibility specs, design system |
| [docs/PR-PLAN.md](./docs/PR-PLAN.md) | Engineering Backlog v3.0 — PR breakdown, dependencies, acceptance criteria |
| [docs/implementation/README.md](./docs/implementation/README.md) | Implementation plan index — 18 MVP phases / 112 PR + Community Phase 19 post-MVP |
| [docs/implementation/phase-19-community.md](./docs/implementation/phase-19-community.md) | Community post-MVP: schema, API, moderasi, readiness gate, dan PR-113..PR-119 |
| [docs/implementation/phase-01-foundation.md](./docs/implementation/phase-01-foundation.md) | Phase 1 foundation PRs and execution scope |
| [docs/implementation/phase-02-authentication-account.md](./docs/implementation/phase-02-authentication-account.md) | Phase 2 authentication and account flows |
| [docs/adr/](./docs/adr/) | Architecture Decision Records 001–018 — decision rationale, consequences, mitigations |
| [docs/adr/README.md](./docs/adr/README.md) | ADR index & navigation |
| `apps/api/.env.example` | Template env backend — salin ke `apps/api/.env` (`.env.example` hidup per app, tidak di root; NEVER commit `.env` nyata) |
| `docker-compose.yml` | Multi-container setup (PostgreSQL, Redis, API, worker, web) |

---

## 8. Quick Start (Development)

```bash
# 1. Install dependencies
pnpm install

# 2. Setup environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env bila perlu (default sudah cocok dengan compose dev)

# 3. Start PostgreSQL + Redis locally (or Docker Compose)
docker-compose up -d postgres redis

# 4. Run migrations
pnpm --filter @nawasena/api exec prisma migrate dev

# 5. Run dev servers (all workspaces)
pnpm dev

# 6. Run type check + lint
pnpm typecheck && pnpm lint

# 7. Run tests
pnpm test

# 8. Check accessibility (web only, slot PR-031)
# pnpm --filter @nawasena/web test:a11y
```

---

## 9. PR Checklist (Before Pushing)

- [ ] Code passes `pnpm lint` (eslint + prettier)
- [ ] Types pass `pnpm typecheck` (strict mode)
- [ ] Unit tests pass `pnpm test`
- [ ] **If frontend:** Passes axe-core + jsx-a11y checks (manual or automated)
- [ ] Database migrations (if any) are backward-compatible; rollback tested
- [ ] Error messages in **Bahasa Indonesia**, simple language
- [ ] No PII, secrets, or sensitive data in logs/code
- [ ] PR description includes: what, why, acceptance criteria met
- [ ] New module? Follows `router → controller → service → repo` pattern
- [ ] Crossed module boundary? Checked against PR-002 lint rules
- [ ] Called LLM? Via `core/ai` gateway only, rate limiting respected
- [ ] PR < 500 LOC (split if larger)

---

## 10. Common Tasks & Commands

### Development
```bash
# Start all services (api, worker, web, mobile)
pnpm dev

# Type check workspace
pnpm typecheck

# Lint & auto-fix
pnpm lint --fix

# Format code
pnpm format

# Run tests (all workspaces)
pnpm test

# Run tests with coverage
pnpm test:cov
```

### Database
```bash
# Create migration
pnpm --filter @nawasena/api exec prisma migrate dev --name feature_name

# Open Prisma Studio
pnpm --filter @nawasena/api exec prisma studio

# Reset DB (dev only, destructive)
pnpm --filter @nawasena/api exec prisma migrate reset
```

### Docker & Deployment
```bash
# Build Docker image locally
docker build -t nawasena:latest .

# Start full stack (local dev)
docker-compose up

# Deploy (via CI/CD on push to main)
git push origin main  # triggers GitHub Actions

# Manual rollback
./deploy.sh --rollback
```

### Monorepo
```bash
# Run script in specific workspace
pnpm --filter @nawasena/api <script>

# List all workspaces
pnpm ls -r

# Update Turborepo cache
pnpm turbo prune --scope=@nawasena/api
```

---

## 11. Key Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Erosi arsitektur (module boundaries) | **T1** | lint-boundaries gate CI; PR-002 aturan ditegakkan strict |
| Accessibility regression | **T1** | a11y gate CI (axe + jsx-a11y); persona testing on review |
| Database scaling (pgvector + TPS) | **T2** | Monitor via `pg_stat_statements`; upgrade path di SDD §19 |
| Secret leakage | **T1** | `.gitignore` sejak awal; pre-commit hooks; secrets scan CI |
| Single blast radius (monolith) | **T2** | Stateless API + 2 replicas; healthcheck; RB-Std rollback |
| Distributed AI quota overrun | **T2** | Per-user quota, AI Gateway mediation (ADR-012) |

---

## 12. Communication & Escalation

- **Product/Design questions:** Refer to PRD §3, DESIGN.md
- **Architecture questions:** Check ADRs 001–018; if unclear, escalate to tech lead
- **Accessibility questions:** Review WCAG 2.2 Level AA; persona testing; refer to DESIGN.md §accessibility
- **Database design:** Consult SDD §6–7; Prisma schema is source of truth; raw SQL changes need review
- **Deployment/DevOps:** Refer to ADR-006, PR-003; `deploy.sh` is standard; RB-Std is rollback procedure
- **Security/secrets:** ADR-015 governs; `.env` never committed; GitHub Secrets for CI/prod

---

## 13. Useful Resources

- **Prisma Docs:** https://www.prisma.io/docs/
- **pgvector GitHub:** https://github.com/pgvector/pgvector
- **WCAG 2.2 Level AA:** https://www.w3.org/WAI/WCAG22/quickref/
- **Express.js Guide:** https://expressjs.com/
- **TanStack Query Docs:** https://tanstack.com/query/latest
- **Zustand GitHub:** https://github.com/pmndrs/zustand
- **Turborepo Docs:** https://turbo.build/repo/docs
- **axe-core:** https://github.com/dequelabs/axe-core
- **BullMQ Docs:** https://docs.bullmq.io/

---

## 14. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-07-17 | Initial creation from PRD v1.1, SDD v1.1, ADRs, PR-PLAN v3.0 |

---

**Last Edited:** 2026-07-17  
**Next Review:** After PR-010 (first integration point)  
**Maintainer:** Tech Lead / Architect
