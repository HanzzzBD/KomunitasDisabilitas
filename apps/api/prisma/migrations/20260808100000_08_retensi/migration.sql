-- Migrasi 08 (PR-024a): pendukung kebijakan retensi SDD §6.4.
--
-- ADITIF SEPENUHNYA — satu tabel baru dan dua index. Tidak ada kolom yang
-- diubah atau dibuang, jadi versi kode sebelumnya tetap berjalan di atas skema
-- ini (syarat backward-compatible satu versi, CLAUDE.md §5.4).
--
-- ROLLBACK: `DROP TABLE ai_usage_monthly;` dan `DROP INDEX` kedua index di
-- bawah. Keduanya aman dijalankan kapan pun — tidak ada kode versi sebelumnya
-- yang membacanya. Yang HILANG saat rollback adalah agregat bulanan yang sudah
-- terkumpul; ia tidak bisa dihitung ulang dari `ai_usage` yang barisnya sudah
-- dihapus. Karena itu rollback setelah job retensi pernah berjalan menuntut
-- restore dari backup harian, bukan sekadar DROP.

-- Agregat bulanan pemakaian AI. Tanpa user_id dengan sengaja: agregat yang
-- memuat PII akan ikut terhapus saat purge (PR-023), dan ketiadaan itulah yang
-- membuat angkanya selamat melewati penghapusan akun.
CREATE TABLE "ai_usage_monthly" (
    "month" DATE NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "provider" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" BIGINT NOT NULL DEFAULT 0,
    "tokens_out" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_monthly_pkey" PRIMARY KEY ("month","feature","provider")
);

-- BRIN untuk selector retensi refresh_tokens. Kolomnya append-mostly dan
-- berkorelasi waktu (SDD §6.2) — indeksnya kilobyte, bukan megabyte, sementara
-- tabelnya tumbuh terus. Tanpa keduanya purge harian men-seq-scan seluruh tabel.
CREATE INDEX "refresh_tokens_revoked_at_brin" ON "refresh_tokens" USING BRIN ("revoked_at");
CREATE INDEX "refresh_tokens_expires_at_brin" ON "refresh_tokens" USING BRIN ("expires_at");
