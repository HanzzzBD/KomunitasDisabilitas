-- Migrasi 18 — finalize sesi AI CV Builder → draft CV (PR-067).
--
-- Ditulis tangan (U-15), ditinjau baris per baris. Satu-satunya `DROP` adalah
-- indeks milik PR-065 sendiri yang DIGANTI indeks berpredikat lebih luas di
-- berkas yang sama (terdaftar di `DROP_INDEX_DISENGAJA`).

-- Draft CV hasil ekstraksi. `SET NULL`, bukan `CASCADE` maupun `NO ACTION`:
-- pemilik boleh menghapus draft-nya kapan saja (CV miliknya), dan itu tidak
-- boleh ikut menghapus transkrip — maupun ditolak karena transkripnya masih
-- menunjuk ke sana.
ALTER TABLE "ai_chat_sessions" ADD COLUMN "resume_id" UUID;
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_resume_id_fkey"
  FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Jejak ekstraksi TERAKHIR yang gagal (keputusan owner 2026-09-28: sesi kembali
-- `active` + penanda gagal). Hanya KODE, tidak pernah pesan provider maupun
-- keluaran model — kolom ini ikut ekspor PDP dan dibaca klien.
ALTER TABLE "ai_chat_sessions" ADD COLUMN "extraction_failed_at" TIMESTAMPTZ(6);
ALTER TABLE "ai_chat_sessions" ADD COLUMN "extraction_error" TEXT;

-- SATU sesi TERBUKA per pengguna — `finalizing` kini ikut dihitung. Tanpa itu,
-- "mulai percakapan" selama ekstraksi berjalan melahirkan sesi aktif kedua, dan
-- ekstraksi yang gagal lalu mengembalikan sesi pertama ke `active` — dua sesi
-- aktif, dan resume memilih acak. Indeks lama diganti, bukan ditambah.
DROP INDEX "ai_chat_sessions_satu_aktif";
CREATE UNIQUE INDEX "ai_chat_sessions_satu_terbuka" ON "ai_chat_sessions"("user_id")
  WHERE "status" IN ('active', 'finalizing');
