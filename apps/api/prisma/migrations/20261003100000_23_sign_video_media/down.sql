-- Rollback migrasi 23. Draft TANPA video dihapus: kolom `video_url` lama
-- NOT NULL dan baris itu memang belum punya media apa pun. Caption & transkrip
-- ikut hilang — isi kamus versi sebelumnya tidak mengenal keduanya.
ALTER TABLE "sign_videos" DROP CONSTRAINT IF EXISTS "sign_videos_terbit_lengkap";
DELETE FROM "sign_videos" WHERE "video_key" IS NULL;
ALTER TABLE "sign_videos" DROP COLUMN IF EXISTS "transcript";
ALTER TABLE "sign_videos" DROP COLUMN IF EXISTS "caption_key";
ALTER TABLE "sign_videos" ALTER COLUMN "video_key" SET NOT NULL;
ALTER TABLE "sign_videos" RENAME COLUMN "thumbnail_key" TO "thumbnail_url";
ALTER TABLE "sign_videos" RENAME COLUMN "video_key" TO "video_url";
