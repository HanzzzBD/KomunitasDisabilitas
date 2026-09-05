-- Kebalikan migrasi 09. SATU-SATUNYA down di repo ini yang tidak sepele.
--
-- Urutannya wajib backfill DULU, baru SET NOT NULL: kolom yang masih memuat
-- NULL menolak batasan itu, dan ALTER-nya gagal di tengah jalan.
--
-- YANG HILANG SAAT DITURUNKAN — dan ini bukan detail teknis. Migrasi 09 membuat
-- NULL berarti "pengguna belum memilih", yang berbeda dari "pengguna memilih
-- nilai bawaan". COALESCE di bawah meratakan keduanya menjadi nilai bawaan,
-- sehingga informasi "belum pernah memilih" hilang PERMANEN — menaikkan
-- kembali migrasi 09 tidak mengembalikannya. Bagi pengguna, preferensi
-- aksesibilitas yang belum ia sentuh menjadi tak terbedakan dari yang sudah ia
-- setel ke bawaan.
--
-- Nilai bawaan di bawah disalin dari CREATE TABLE migrasi 01, bukan dikarang.
UPDATE "accessibility_profiles" SET
  "text_scale"            = COALESCE("text_scale", 100),
  "high_contrast"         = COALESCE("high_contrast", false),
  "reduce_motion"         = COALESCE("reduce_motion", false),
  "simple_language"       = COALESCE("simple_language", false),
  "prefers_sign_language" = COALESCE("prefers_sign_language", false),
  "large_touch_targets"   = COALESCE("large_touch_targets", false),
  "screen_reader_hint"    = COALESCE("screen_reader_hint", false);

ALTER TABLE "accessibility_profiles"
  ALTER COLUMN "text_scale" SET DEFAULT 100,
  ALTER COLUMN "text_scale" SET NOT NULL,
  ALTER COLUMN "high_contrast" SET DEFAULT false,
  ALTER COLUMN "high_contrast" SET NOT NULL,
  ALTER COLUMN "reduce_motion" SET DEFAULT false,
  ALTER COLUMN "reduce_motion" SET NOT NULL,
  ALTER COLUMN "simple_language" SET DEFAULT false,
  ALTER COLUMN "simple_language" SET NOT NULL,
  ALTER COLUMN "prefers_sign_language" SET DEFAULT false,
  ALTER COLUMN "prefers_sign_language" SET NOT NULL,
  ALTER COLUMN "large_touch_targets" SET DEFAULT false,
  ALTER COLUMN "large_touch_targets" SET NOT NULL,
  ALTER COLUMN "screen_reader_hint" SET DEFAULT false,
  ALTER COLUMN "screen_reader_hint" SET NOT NULL;
