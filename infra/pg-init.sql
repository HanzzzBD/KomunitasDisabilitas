-- Init Postgres dev (PR-008) — dijalankan otomatis docker-entrypoint-initdb.d
-- saat volume data pertama kali dibuat (ADR-003).
CREATE EXTENSION IF NOT EXISTS vector; -- pgvector: embedding matching (SDD §6)
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- fuzzy search lowongan (ADR-018)
