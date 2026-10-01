-- Migrasi 19 — urutan hasil re-rank LLM di `match_scores` (PR-072).
--
-- `score` adalah skor DETERMINISTIK PR-071 dan tetap begitu: ia bisa dijelaskan
-- ulang dari komponennya kapan pun. Urutan yang dipilih LLM (SDD §7.2 langkah 4)
-- disimpan TERPISAH di `rank` supaya angka skor yang tampil tidak pernah
-- dipelintir mengikuti urutan model (keputusan owner 2026-09-30).
--
-- NULL = baris belum/tidak di-rerank (di luar top-20, rerank belum selesai,
-- kuota habis, atau AI mati) → urut menurut `score`.
--
-- Ditulis tangan (U-15): aditif, tanpa `DROP` apa pun.
ALTER TABLE "match_scores" ADD COLUMN "rank" SMALLINT;

ALTER TABLE "match_scores"
  ADD CONSTRAINT "match_scores_rank_positif" CHECK ("rank" IS NULL OR "rank" >= 1);
