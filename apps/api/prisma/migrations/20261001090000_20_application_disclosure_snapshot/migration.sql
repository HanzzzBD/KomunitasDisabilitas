-- Migrasi 20 — snapshot pengungkapan per lamaran (PR-075, SDD §13 DFD P3).
--
-- Lamaran dengan `disclose_disability = true` menyimpan SALINAN ragam
-- disabilitas + kebutuhan akomodasi pada saat melamar, terenkripsi AES-256-GCM
-- berversi di lapisan aplikasi (ADR-007, format yang sama dengan
-- `seeker_profiles`). Salinan, bukan referensi: perubahan profil kemudian
-- tidak boleh mengubah apa yang sudah diungkap kepada perusahaan.
--
-- CHECK di bawah memindahkan janji "disclose=false → nol jejak sensitif" dari
-- disiplin kode ke database: bug di service mana pun yang mencoba menyimpan
-- snapshot pada lamaran tertutup ditolak PostgreSQL. Arah sebaliknya
-- (disclose=true tanpa snapshot) SENGAJA tidak ditolak di sini — aplikasi
-- menolaknya lebih dulu dengan pesan yang bisa ditindaklanjuti.
--
-- Ditulis tangan (U-15): aditif, nullable — kode versi sebelumnya tetap jalan.
ALTER TABLE "applications" ADD COLUMN "disclosure_snapshot" BYTEA;

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_snapshot_hanya_bila_disclose"
  CHECK ("disclose_disability" OR "disclosure_snapshot" IS NULL);
