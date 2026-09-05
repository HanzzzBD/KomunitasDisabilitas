-- Urutan "terbaru dulu" untuk sub-entitas karier (PR-038) berhenti bersandar
-- pada `id`. UUID v7 hanya berurut ANTAR milidetik — `core/ids/index.ts`
-- menyatakannya sendiri — sehingga baris yang lahir dalam milidetik yang sama
-- keluar dalam urutan acak. TIMESTAMPTZ(6) berpresisi mikrodetik.
--
-- CATATAN: blok `-- DropIndex` yang di-generate Prisma untuk index raw SQL
-- (HNSW, GIN, trgm, partial) SENGAJA DIHAPUS dari berkas ini — lihat
-- prisma/README.md "Jebakan yang harus diingat". Membiarkannya akan menghapus
-- tujuh index produksi tanpa ada yang memintanya.
--
-- Aditif dan backward-compatible (CLAUDE.md §5.4): kode versi N yang tidak tahu
-- kolom ini tetap jalan. Baris yang sudah ada menerima satu stempel waktu yang
-- SAMA, jadi urutannya jatuh ke penengah `id desc` — persis perilaku hari ini,
-- bukan urutan baru yang mengejutkan.

-- AlterTable
ALTER TABLE "educations" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "experiences" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
