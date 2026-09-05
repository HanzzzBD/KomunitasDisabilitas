-- Kebalikan migrasi 04. Aman: kolom aditif, tidak dirujuk FK maupun index.
-- Konsekuensi yang harus disadari sebelum dipakai: `token_version` adalah
-- kill-switch sesi. Menurunkannya membuang seluruh pencabutan yang pernah
-- dilakukan — setiap access token yang masih hidup kembali berlaku.
ALTER TABLE "users" DROP COLUMN "token_version";
