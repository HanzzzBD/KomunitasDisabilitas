-- Migrasi 17 — nilai enum `finalizing` untuk sesi AI CV Builder (PR-067).
--
-- BERKAS SENDIRI, dan itu bukan kerapian. PostgreSQL menolak MEMAKAI nilai enum
-- baru di dalam transaksi yang sama dengan `ALTER TYPE ... ADD VALUE` yang
-- menambahkannya ("unsafe use of new value"), dan satu berkas migrasi dikirim
-- sebagai satu kueri — satu transaksi implisit. Indeks parsial di migrasi 18
-- menyebut `'finalizing'`, jadi ia harus berjalan SESUDAH berkas ini selesai.
--
-- Ditulis tangan (U-15): aditif, tanpa `DROP` apa pun.
ALTER TYPE "AiChatSessionStatus" ADD VALUE IF NOT EXISTS 'finalizing' BEFORE 'finalized';
