import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    /**
     * SATU FILE PADA SATU WAKTU — bukan sekadar preferensi.
     *
     * Test integrasi di sini memakai SATU PostgreSQL dan SATU Redis bersama,
     * dan sebagian menegaskan keadaan GLOBAL: `db-seed.test.ts` membuktikan
     * idempotensi seed dengan menghitung seluruh baris `users` sebelum dan
     * sesudah seed kedua. Bila file lain berjalan paralel dan kebetulan membuat
     * user di antara dua hitungan itu (mis. `auth-user-db.test.ts` sejak
     * PR-016a), hitungan berubah dan seed dituduh tidak idempotent padahal
     * seluruh operasinya `upsert` ber-ID fixture.
     *
     * Menyempitkan hitungan db-seed ke ID fixture akan menghilangkan gejalanya
     * SEKALIGUS melemahkan testnya: baris duplikat ber-ID acak justru tidak
     * akan terhitung. Jadi keadaan global tetap diuji apa adanya, dan yang
     * dihilangkan adalah paralelismenya.
     *
     * Biaya: durasi suite naik (~8 detik → ~25 detik). Dibayar sekali,
     * menutup seluruh kelas kegagalan flaky untuk modul-modul berikutnya.
     */
    fileParallelism: false,
  },
});
