# ADR-002 — Express.js + TypeScript sebagai Backend Framework

Status: Accepted

Tanggal: 2026-07-15

## Context

Backend Nawasena membutuhkan framework HTTP untuk monolith modular (ADR-001) yang mendukung REST + SSE, middleware auth/RBAC, dan dapat dikembangkan cepat oleh tim 2–5 orang dengan bantuan AI engineering tools.

Constraint: framework harus matang, berdokumentasi luas, dan kompatibel dengan ekosistem Node.js/TypeScript yang dipakai monorepo (Turborepo, zod, Prisma).

Alternatif yang dipertimbangkan:
1. **NestJS + Prisma** — struktur modul bawaan dan DI, tetapi ditolak oleh pemilik produk pada discovery (kurva belajar dan opini framework tidak diinginkan).
2. **Fastify + Drizzle** — performa tinggi, tetapi ekosistem middleware lebih kecil dan tanpa struktur bawaan.
3. **Express.js + TypeScript + Prisma** — paling familiar, ekosistem terluas, tanpa struktur bawaan.

## Decision

Backend Nawasena menggunakan **Express.js + TypeScript** dengan **Prisma** sebagai ORM. Karena Express tidak memaksakan struktur, seluruh kode backend WAJIB mengikuti konvensi modul SDD §5.1: lapisan `router → controller → service → repo` satu arah, satu folder per modul, dependency injection manual via factory function, dan aturan import ditegakkan `eslint-plugin-boundaries` sebagai gate CI.

## Consequences

### Positif

* Ekosistem dan dokumentasi terluas di Node.js → onboarding cepat, AI coding tools sangat terlatih pada Express.
* Kontrol penuh atas struktur — konvensi Nawasena tidak berbenturan dengan opini framework.
* Middleware matang tersedia untuk kebutuhan keamanan (helmet, rate limit).

### Negatif

* Tidak ada struktur bawaan → risiko erosi arsitektur tertinggi di antara alternatif (Risiko T1 SDD §20).
* Tidak ada DI container → wiring dependensi manual.
* Penanganan async error Express memerlukan wrapper eksplisit.

### Mitigasi

* Konvensi modul SDD §5.1 bersifat WAJIB dan ditegakkan lint boundaries di CI — bukan sekadar dokumentasi.
* Helper `asyncHandler` terpusat di `core/http` untuk propagasi error async ke error handler global.
* Template modul (generator) disediakan agar setiap modul baru lahir dengan struktur benar.

## Referensi

SDD §5.1–5.3, §20 (T1); PRD §8. Terkait: ADR-001, ADR-003.
