-- Migrasi 21 — penangguhan akun (PR-083, FR-6.2).
--
-- Ditangguhkan ≠ dihapus: data utuh, akses diblok. `suspended_at` NULL = aktif.
-- `suspend_reason` adalah catatan INTERNAL admin (juga tercatat di audit_logs)
-- dan TIDAK PERNAH ditampilkan kepada pengguna yang ditangguhkan (keputusan
-- owner 2026-10-03). CHECK menjaga keduanya selalu berpasangan.
--
-- Ditulis tangan (U-15): aditif, nullable — kode versi sebelumnya tetap jalan.
ALTER TABLE "users" ADD COLUMN "suspended_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "suspend_reason" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_suspend_berpasangan"
  CHECK (("suspended_at" IS NULL) = ("suspend_reason" IS NULL));
