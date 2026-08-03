# ADR-003 — PostgreSQL 18 + pgvector sebagai Database Utama

Status: Accepted

Tanggal: 2026-07-15

## Context

Nawasena membutuhkan: (a) data relasional transaksional (users, jobs, applications dengan integritas FK), (b) penyimpanan embedding 768-dimensi untuk AI Job Matching (PRD §9), (c) full-text search lowongan, dan (d) penyimpanan data sensitif terenkripsi (UU PDP). Semua harus berjalan pada satu VPS 8 GB dengan tim tanpa DBA khusus.

Constraint: biaya ≤ Rp300rb/bulan; satu datastore lebih murah dioperasikan daripada beberapa.

Alternatif yang dipertimbangkan:
1. **PostgreSQL + vector DB terpisah (Qdrant/Pinecone)** — performa vektor lebih tinggi pada skala jutaan embedding, tetapi menambah sistem yang harus disinkronkan dan dipelihara; skala Nawasena (ribuan embedding) tidak membutuhkannya.
2. **MySQL/MariaDB** — tanpa dukungan vector native yang matang dan FTS lebih lemah.
3. **PostgreSQL 18 + pgvector** — satu datastore untuk relasional + vektor + FTS.

## Decision

Database utama Nawasena adalah **PostgreSQL 18 dengan ekstensi pgvector**, diakses melalui **Prisma** sebagai ORM. Kolom embedding (`seeker_profiles.profile_embedding`, `jobs.job_embedding`) bertipe `vector(768)` dengan indeks HNSW; fitur yang belum didukung Prisma (tipe vector, indeks HNSW/GIN/FTS) ditulis sebagai raw SQL di dalam file migrasi Prisma. Pencarian lowongan menggunakan FTS + pg_trgm bawaan PostgreSQL (ADR-018).

## Consequences

### Positif

* Satu datastore untuk relasional, vektor, dan FTS → operasional dan backup tunggal.
* ACID penuh untuk alur kritis (apply idempotent, status pipeline).
* pgvector HNSW lebih dari cukup untuk skala katalog MVP (≤ ribuan lowongan).

### Negatif

* Query vektor dan relasional berbagi resource pada satu instance — beban vektor besar dapat memengaruhi latensi transaksional.
* Prisma tidak mendukung tipe vector secara native → sebagian query matching memakai `$queryRaw` ber-parameter.
* Batas skala pgvector diketahui lebih rendah daripada vector DB khusus.

### Mitigasi

* Indeks dan resource limit dipantau via `pg_stat_statements`; penambahan indeks wajib berbasis bukti (SDD §6.3).
* Raw SQL vektor terkurung di repo layer modul `matching` — satu tempat audit.
* Jalur upgrade terukur: pisahkan DB ke host/managed terpisah, lalu vector DB khusus hanya bila pemicu SDD §19 terpenuhi.

## Referensi

SDD §6, §7.2, §19; PRD §8–10. Terkait: ADR-002, ADR-007, ADR-018.
