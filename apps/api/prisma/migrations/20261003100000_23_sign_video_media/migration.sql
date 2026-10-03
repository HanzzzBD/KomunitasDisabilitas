-- Migrasi 23 — media kamus BISINDO (PR-084, ADR-010 v1, SDD §7.4).
--
-- SDD §7.4: "caption & transkrip wajib". Tabel dari migrasi 03 belum punya
-- kolom untuk keduanya, dan `video_url` NOT NULL memaksa video ada SEBELUM
-- draft lahir — padahal unggahan presigned (PR-085) butuh id draft lebih dulu.
-- Keputusan owner 2026-10-03:
--   1. Kolom menyimpan KEY object storage (`sign-videos/{id}/...`), bukan URL:
--      bucket privat (ADR-020), URL presigned dibuat saat dibaca.
--   2. Video & thumbnail boleh kosong selama draft.
--   3. Caption = berkas .vtt di storage (dibaca <track>), transkrip = teks DB.
--
-- Rename aman: belum ada kode yang membaca tabel ini (modul `signbridge` lahir
-- di PR ini). Ditulis tangan (U-15).
ALTER TABLE "sign_videos" RENAME COLUMN "video_url" TO "video_key";
ALTER TABLE "sign_videos" RENAME COLUMN "thumbnail_url" TO "thumbnail_key";
ALTER TABLE "sign_videos" ALTER COLUMN "video_key" DROP NOT NULL;
ALTER TABLE "sign_videos" ADD COLUMN "caption_key" TEXT;
ALTER TABLE "sign_videos" ADD COLUMN "transcript" TEXT;

-- Jaring terakhir di bawah validasi service (422): video yang terbit selalu
-- punya video, caption, dan transkrip. Caption adalah kontrol aksesibilitas,
-- bukan pelengkap — jadi DB pun menolak baris published tanpanya.
ALTER TABLE "sign_videos"
  ADD CONSTRAINT "sign_videos_terbit_lengkap"
  CHECK (
    "status" <> 'published'
    OR (
      "video_key" IS NOT NULL
      AND "caption_key" IS NOT NULL
      AND "transcript" IS NOT NULL
      AND btrim("transcript") <> ''
    )
  );
