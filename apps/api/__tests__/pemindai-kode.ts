// Pemindai kode bersama untuk penjaga-penjaga JANGKAUAN.
//
// KENAPA BERKAS TERSENDIRI. `tanpaKomentar` lahir di
// `soft-delete-jangkauan.test.ts` (PR-021a) dan diekspor dari sana. Ketika
// `akses-sensitif-jangkauan.test.ts` (PR-039) membutuhkannya juga, meng-import
// berkas `.test.ts` berarti vitest MENJALANKAN ULANG seluruh test di dalamnya
// di bawah konteks berkas pengimpor — sembilan test yang sama muncul dua kali
// di laporan, dan kegagalannya menunjuk berkas yang tidak menulisnya.
//
// Berkas ini tidak berakhiran `.test.ts`, jadi pola `include` di
// `vitest.config.ts` tidak mengumpulkannya; ia murni modul biasa. Testnya
// sendiri tetap tinggal di berkas penjaga yang memakainya.
/**
 * Buang komentar, PERTAHANKAN string dan baris baru.
 *
 * Wajib: `core/db/soft-delete.ts` memuat `include: { user: true }` di dalam
 * komentar penjelasnya sendiri. Tanpa langkah ini, penjaga akan menuduh
 * dokumentasi yang justru menerangkannya — dan orang akan mematikan penjaganya,
 * bukan memperbaikinya.
 */
export function tanpaKomentar(kode: string): string {
  let hasil = "";
  let mode: "kode" | "baris" | "blok" | "'" | '"' | "`" = "kode";

  for (let i = 0; i < kode.length; i += 1) {
    const c = kode[i] as string;
    const d = kode[i + 1];

    if (mode === "kode") {
      if (c === "/" && d === "/") {
        mode = "baris";
        i += 1;
      } else if (c === "/" && d === "*") {
        mode = "blok";
        i += 1;
      } else if (c === "'" || c === '"' || c === "`") {
        mode = c;
        hasil += c;
      } else {
        hasil += c;
      }
      continue;
    }

    if (mode === "baris") {
      // Baris baru dipertahankan supaya nomor baris laporan tetap jujur.
      if (c === "\n") {
        mode = "kode";
        hasil += c;
      }
      continue;
    }

    if (mode === "blok") {
      if (c === "*" && d === "/") {
        mode = "kode";
        i += 1;
      } else if (c === "\n") {
        hasil += c;
      }
      continue;
    }

    // Di dalam string: escape apa pun ikut apa adanya.
    if (c === "\\") {
      hasil += c + (d ?? "");
      i += 1;
      continue;
    }
    if (c === mode) mode = "kode";
    hasil += c;
  }

  return hasil;
}

