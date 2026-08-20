-- Migrasi 09 — preferensi aksesibilitas: NULL berarti "belum diatur".
--
-- KENAPA. Kolom-kolom ini lahir NOT NULL dengan DEFAULT (migrasi 02), dan sejak
-- PR-034 setiap akun baru diberi satu baris lewat pelanggan event
-- `auth.user_registered`. Gabungan keduanya berarti server SELALU menjawab tujuh
-- nilai konkret, sehingga "pengguna belum pernah memilih" tidak punya bentuk
-- yang bisa dikirim. Klien yang menuliskan jawaban itu sebagai pilihan eksplisit
-- membuat tingkat OS pada `rekonsiliasi()` (ADR-008) tak terjangkau selamanya:
-- pengguna yang sistemnya meminta `prefers-reduced-motion` atau
-- `prefers-contrast` kehilangan akomodasi itu diam-diam begitu ia masuk.
--
-- Bawaan TIDAK hilang, ia hanya pindah tempat: satu-satunya sumbernya kini
-- `ACCESSIBILITY_DEFAULTS` di `packages/schemas`, dipakai saat rekonsiliasi di
-- klien. Bawaan yang tersimpan sebagai NILAI KOLOM adalah persis yang membuatnya
-- tak bisa dibedakan dari sebuah pilihan.
--
-- KOMPATIBILITAS MUNDUR (CLAUDE.md §5.4). Melonggarkan NOT NULL aman bagi kode
-- versi sebelumnya: setiap baris yang sudah ada tetap membawa nilainya, dan
-- pembaca lama tidak akan pernah menemui NULL pada baris lama. Baris BARU yang
-- ditulis kode baru bisa berisi NULL, dan pembaca lama akan menolaknya — karena
-- itu rollback image WAJIB dibarengi rollback ke versi kode yang sama, bukan
-- dijalankan sendirian. Turun-migrasinya ada di bawah, tidak dijalankan otomatis.
--
-- DATA LAMA SENGAJA TIDAK DISENTUH. Baris yang ada hari ini bercampur: sebagian
-- berisi pilihan sungguhan dari wizard onboarding, sebagian hanya bawaan hasil
-- penyediaan otomatis. Keduanya tidak bisa dibedakan lagi — tidak ada kolom
-- `created_at` untuk membandingkannya dengan `updated_at`. Menyeragamkan
-- semuanya ke NULL akan MEMBUANG pilihan yang benar-benar pernah dinyatakan
-- orang; membiarkannya menyisakan ambiguitas hanya pada baris lama, dan hanya
-- sampai pengguna itu menyentuh panelnya sekali. Yang kedua tidak menghapus apa
-- pun milik siapa pun, jadi itu yang dipilih. Sisa itu dicatat, bukan didiamkan.

ALTER TABLE "accessibility_profiles"
  ALTER COLUMN "text_scale" DROP NOT NULL,
  ALTER COLUMN "text_scale" DROP DEFAULT,
  ALTER COLUMN "high_contrast" DROP NOT NULL,
  ALTER COLUMN "high_contrast" DROP DEFAULT,
  ALTER COLUMN "reduce_motion" DROP NOT NULL,
  ALTER COLUMN "reduce_motion" DROP DEFAULT,
  ALTER COLUMN "simple_language" DROP NOT NULL,
  ALTER COLUMN "simple_language" DROP DEFAULT,
  ALTER COLUMN "prefers_sign_language" DROP NOT NULL,
  ALTER COLUMN "prefers_sign_language" DROP DEFAULT,
  ALTER COLUMN "large_touch_targets" DROP NOT NULL,
  ALTER COLUMN "large_touch_targets" DROP DEFAULT,
  ALTER COLUMN "screen_reader_hint" DROP NOT NULL,
  ALTER COLUMN "screen_reader_hint" DROP DEFAULT;

-- TURUN (manual, diuji sebelum dipakai — RB-Std):
--
-- UPDATE "accessibility_profiles" SET
--   "text_scale"            = COALESCE("text_scale", 100),
--   "high_contrast"         = COALESCE("high_contrast", false),
--   "reduce_motion"         = COALESCE("reduce_motion", false),
--   "simple_language"       = COALESCE("simple_language", false),
--   "prefers_sign_language" = COALESCE("prefers_sign_language", false),
--   "large_touch_targets"   = COALESCE("large_touch_targets", false),
--   "screen_reader_hint"    = COALESCE("screen_reader_hint", false);
-- ALTER TABLE "accessibility_profiles"
--   ALTER COLUMN "text_scale" SET DEFAULT 100,
--   ALTER COLUMN "text_scale" SET NOT NULL,
--   ALTER COLUMN "high_contrast" SET DEFAULT false,
--   ALTER COLUMN "high_contrast" SET NOT NULL,
--   ALTER COLUMN "reduce_motion" SET DEFAULT false,
--   ALTER COLUMN "reduce_motion" SET NOT NULL,
--   ALTER COLUMN "simple_language" SET DEFAULT false,
--   ALTER COLUMN "simple_language" SET NOT NULL,
--   ALTER COLUMN "prefers_sign_language" SET DEFAULT false,
--   ALTER COLUMN "prefers_sign_language" SET NOT NULL,
--   ALTER COLUMN "large_touch_targets" SET DEFAULT false,
--   ALTER COLUMN "large_touch_targets" SET NOT NULL,
--   ALTER COLUMN "screen_reader_hint" SET DEFAULT false,
--   ALTER COLUMN "screen_reader_hint" SET NOT NULL;
--
-- Turun ini MEMULIHKAN BENTUK, bukan makna: setiap NULL menjadi bawaan, dan
-- perbedaan "belum diatur" vs "memilih bawaan" hilang lagi untuk baris itu.
