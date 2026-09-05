-- Migrasi 13: `audit_logs` append-only DITEGAKKAN DATABASE.
--
-- Sampai sekarang larangan ini hanya hidup sebagai kalimat di prisma/README.md
-- dan CLAUDE.md ("dilarang UPDATE/DELETE dari aplikasi ... sampai itu, disiplin
-- kode + review"). Disiplin bukan penegakan: satu `deleteMany` yang lolos review
-- sudah cukup, dan yang hilang justru catatan yang gunanya membuktikan apa yang
-- terjadi ketika ada yang menyangkal.
--
-- MENGAPA TRIGGER, BUKAN REVOKE. Rencana semula (PR-097) adalah mencabut hak
-- UPDATE/DELETE dari role aplikasi. Itu menuntut role aplikasi yang TERPISAH
-- dari pemilik tabel, dan penyediaannya milik Phase 16 (infrastruktur) — belum
-- ada hari ini: API menyambung dengan role yang sekaligus pemilik tabel, dan
-- REVOKE atas pemilik bisa ia kembalikan sendiri kapan saja. Trigger berlaku
-- untuk SIAPA PUN, termasuk pemilik dan superuser, jadi ia yang bisa dipasang
-- hari ini tanpa menunggu phase lain.
--
-- BATASNYA DINYATAKAN, bukan disembunyikan: pemilik tabel masih bisa
-- `ALTER TABLE ... DISABLE TRIGGER`. Ini penjaga terhadap BUG APLIKASI dan
-- penghapusan tak sengaja — bukan terhadap pemilik basis data yang sudah
-- dikuasai penyerang. Pemisahan role least-privilege TETAP menjadi PR-097.
--
-- TRUNCATE ikut ditutup, dan itu bukan kelengkapan formal: trigger BARIS tidak
-- pernah menyala untuk TRUNCATE, sehingga `TRUNCATE audit_logs` akan
-- mengosongkan seluruh tabel tanpa satu pun penjaga di atas berbunyi. Ia butuh
-- trigger STATEMENT tersendiri.

CREATE OR REPLACE FUNCTION audit_logs_tolak_ubah() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Pesan untuk manusia yang membaca log insiden, bukan untuk pengguna akhir:
  -- endpoint mana pun tidak boleh sampai memicunya.
  RAISE EXCEPTION
    'audit_logs bersifat append-only: % ditolak (migrasi 13). Catatan audit tidak boleh diubah atau dihapus.',
    TG_OP;
END;
$$;

-- FOR EACH ROW: menolak per baris, sehingga UPDATE/DELETE yang tidak mengenai
-- satu baris pun tetap lolos apa adanya (tidak ada yang berubah, tidak ada yang
-- perlu ditolak) dan pesannya hanya muncul saat ada catatan yang benar-benar
-- terancam.
CREATE TRIGGER audit_logs_append_only_baris
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_tolak_ubah();

CREATE TRIGGER audit_logs_append_only_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_tolak_ubah();

-- Kebersihan tambahan, bukan penjaga utama: PUBLIC tidak pernah butuh hak ini.
-- Penjaganya tetap trigger di atas — REVOKE tidak berlaku bagi pemilik tabel.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM PUBLIC;
