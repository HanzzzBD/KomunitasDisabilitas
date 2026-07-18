# Architecture Decision Records — Incasif

Direktori ini adalah **sumber kebenaran resmi ADR** proyek Incasif. SDD §21 merujuk ke sini. Aturan: satu file per keputusan; ADR bersifat append-only — perubahan keputusan dilakukan dengan ADR baru berstatus menggantikan (Superseded) ADR lama, bukan dengan mengedit isi lama.

Sumber kebenaran hulu: PRD (kebutuhan bisnis) dan SDD (keputusan teknis).

## Indeks

| ADR | Judul | Status | Area |
|---|---|---|---|
| [ADR-001](ADR-001-monolith-mo dular.md) | Monolith Modular vs Microservices | Accepted | Arsitektur |
| [ADR-002](ADR-002-expressjs-typescript-backend.md) | Express.js + TypeScript sebagai Backend Framework | Accepted | Backend |
| [ADR-003](ADR-003-postgresql-pgvector.md) | PostgreSQL 18 + pgvector sebagai Database Utama | Accepted | Database |
| [ADR-004](ADR-004-redis-bullmq.md) | Redis + BullMQ untuk Queue dan Cache | Accepted | Backend/Infra |
| [ADR-005](ADR-005-gemini-primary-groq-fallback.md) | Gemini sebagai AI Provider Utama dan Groq sebagai Fallback | Accepted | AI |
| [ADR-006](ADR-006-docker-compose-vps.md) | Docker Compose pada VPS sebagai Platform Deployment | Accepted | Infrastruktur |
| [ADR-007](ADR-007-aes-256-gcm-enkripsi.md) | AES-256-GCM untuk Enkripsi Data Sensitif | Accepted | Keamanan |
| [ADR-008](ADR-008-accessibility-profile-global-state.md) | Accessibility Profile sebagai Global State Produk | Accepted | Frontend/Produk |
| [ADR-009](ADR-009-online-only-mvp.md) | Online-only MVP | Accepted | Frontend |
| [ADR-010](ADR-010-signbridge-v2-service-terpisah.md) | SignBridge v2 sebagai Service Terpisah | Accepted | AI/Arsitektur |
| [ADR-011](ADR-011-react-native-expo.md) | React Native Expo untuk Mobile Application | Accepted | Mobile |
| [ADR-012](ADR-012-ai-gateway.md) | AI Gateway sebagai Satu-satunya Jalur Akses AI Provider | Accepted | AI |
| [ADR-013](ADR-013-scope-mvp-reserved-boundaries.md) | Scope Desain: MVP Rinci + Reserved Boundaries untuk Ekosistem | Accepted | Arsitektur |
| [ADR-014](ADR-014-tanstack-query-zustand.md) | TanStack Query + Zustand untuk State Management Klien | Accepted | Frontend |
| [ADR-015](ADR-015-secrets-env.md) | Secrets via .env + GitHub Actions Secrets | Accepted | Keamanan |
| [ADR-016](ADR-016-github-actions-cicd.md) | GitHub Actions CI/CD dengan Accessibility sebagai Quality Gate | Accepted | Infrastruktur |
| [ADR-017](ADR-017-observability-hemat.md) | Observability Hemat: Sentry + Uptime Kuma + pino/Dozzle | Accepted | Infrastruktur |
| [ADR-018](ADR-018-postgres-fts-search.md) | PostgreSQL FTS + pg_trgm untuk Pencarian Lowongan | Accepted | Database |

## Pemetaan dari SDD §21 (penomoran lama v1.0/v1.1 → resmi)

| SDD lama | ADR resmi |
|---|---|
| ADR-1 (scope MVP) | ADR-013 |
| ADR-2 (SignBridge bertahap) | ADR-010 |
| ADR-3 (Express + Prisma) | ADR-002 |
| ADR-4 (monolith 1 VPS) | ADR-001 + ADR-006 |
| ADR-5 (TanStack/Zustand; online-only; web+Android) | ADR-014 + ADR-009 + ADR-011 |
| ADR-6 (Postgres platform data tunggal) | ADR-003 |
| ADR-7 (enkripsi field AES-256-GCM) | ADR-007 |
| ADR-8 (secrets .env) | ADR-015 |
| ADR-9 (GitHub Actions + a11y gate) | ADR-016 |
| ADR-10 (gerbang riset SignBridge v2) | ADR-010 |
| ADR-11 (observability hemat) | ADR-017 |
| ADR-12 (Postgres FTS) | ADR-018 |

Keputusan yang tersirat di SDD dan kini eksplisit sebagai ADR sendiri: ADR-004 (Redis + BullMQ), ADR-005 (Gemini + Groq), ADR-008 (Accessibility Profile global state), ADR-012 (AI Gateway).
