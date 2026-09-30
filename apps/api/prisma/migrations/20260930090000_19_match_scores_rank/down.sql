-- Turun migrasi 19: buang urutan re-rank. `match_scores` adalah cache yang
-- selalu bisa dihitung ulang (SDD §6.1 butir 3) — tidak ada data yang hilang
-- selain urutan LLM yang akan dibuat lagi pada refresh berikutnya.
ALTER TABLE "match_scores" DROP CONSTRAINT IF EXISTS "match_scores_rank_positif";
ALTER TABLE "match_scores" DROP COLUMN IF EXISTS "rank";
