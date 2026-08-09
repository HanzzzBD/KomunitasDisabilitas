// Penjaga katalog i18n — AC PR-029 nomor 2 & 4.
//
// PEMBAGIAN TUGAS yang perlu dipahami sebelum menambah aturan di sini:
//
//   TIPE menjamin kedua varian ADA (`EntriTeks`, PR-029a). Varian yang hilang
//   adalah `typecheck` merah, jadi TIDAK perlu diuji ulang di sini.
//
//   Penjaga ini menangani yang TIDAK bisa dijamin tipe: varian simple yang
//   disalin mentah dari `id`, struktur katalog per fitur, dan kunci yang saling
//   menimpa diam-diam.
//
// Panduan menulis varian simple: docs/panduan-bahasa-sederhana.md
import { describe, expect, it } from "vitest";
import { fiturKatalog, katalog } from "../src/shared/i18n/katalog/index.js";
import { MODE_BAHASA } from "../src/shared/i18n/tipe.js";

/**
 * Entri yang varian `id`-nya SAMA PERSIS dengan `id-simple`, beserta alasannya.
 *
 * Menyalin `id` ke `id-simple` adalah cara termudah membuat katalog tampak
 * "lengkap" tanpa benar-benar menulis varian sederhananya — dan tipe tidak bisa
 * membedakan salinan malas dari kalimat yang memang sudah sesederhana mungkin.
 * Yang bisa membedakan hanya manusia, jadi penjaga ini memaksa manusia itu
 * menuliskan keputusannya.
 */
const SAMA_DENGAN_SENGAJA: Readonly<Record<string, string>> = {
  "shell.merek": "Nama produk — tidak diterjemahkan dan tidak disederhanakan.",
  "shell.aksi.masuk": "Satu kata sehari-hari; tidak ada bentuk yang lebih sederhana.",
  "shell.luring.cobaLagi": "Label tombol dua kata, sudah memakai kata sehari-hari.",

  // --- auth (PR-030b) ---
  // Sebagian besar di sini adalah LABEL, bukan kalimat. Label yang panjangnya
  // dua-tiga kata sehari-hari tidak punya bentuk yang lebih sederhana, dan
  // mengarang perbedaan hanya membuat kedua varian tidak konsisten satu sama
  // lain — pengguna yang berpindah mode akan menyangka tombolnya berubah.
  "auth.judul": "Nama produk plus dua kata sehari-hari.",
  "auth.nomor.label": "Label dua kata; 'Nomor HP' adalah sebutan sehari-harinya.",
  "auth.nomor.kirim": "Label tombol dua kata sehari-hari.",
  "auth.nomor.mengirim": "Kalimat penanda tunggu, sudah sependek mungkin.",
  "auth.kode.label": "Label yang sudah menyebut bentuknya secara harfiah ('6 angka').",
  "auth.kode.takValid":
    "Kalimat empat kata; menyederhanakannya hanya mengubah kata tanpa menambah kejelasan.",
  "auth.kode.masuk": "Satu kata sehari-hari, sama dengan label aksi di shell.",
  "auth.kode.memeriksa": "Kalimat penanda tunggu, sudah sependek mungkin.",
  "auth.kode.terkirim": "Kalimat empat kata dengan kata sehari-hari.",
  "auth.google.atau": "Satu kata penghubung; tidak ada bentuk yang lebih sederhana.",
  "auth.google.kembali": "Label tautan empat kata sehari-hari, sudah menyebut tujuannya.",
};

const entri = Object.entries(katalog) as ReadonlyArray<
  readonly [string, Readonly<Record<string, string>>]
>;

function identik([, e]: readonly [string, Readonly<Record<string, string>>]): boolean {
  return e.id === e["id-simple"];
}

describe("katalog — varian simple yang disalin mentah", () => {
  it("setiap entri identik SUDAH didaftarkan beserta alasannya", () => {
    const belumTerdaftar = entri
      .filter(identik)
      .map(([kunci]) => kunci)
      .filter((kunci) => !Object.hasOwn(SAMA_DENGAN_SENGAJA, kunci));

    expect(
      belumTerdaftar,
      "Varian `id-simple` sama persis dengan `id`. Tulis varian sederhananya " +
        "(lihat docs/panduan-bahasa-sederhana.md), atau daftarkan di " +
        "SAMA_DENGAN_SENGAJA beserta alasannya bila kalimatnya memang sudah sederhana.",
    ).toEqual([]);
  });

  it("daftar pengecualian tidak menyimpan entri basi", () => {
    // Arah sebaliknya. Tanpa ini, kunci yang sudah diperbaiki varian
    // sederhananya akan meninggalkan alasan yang tidak lagi benar — dan daftar
    // pengecualian yang memuat kebohongan berhenti bisa dipercaya.
    const takLagiIdentik = Object.keys(SAMA_DENGAN_SENGAJA).filter((kunci) => {
      const e = katalog[kunci as keyof typeof katalog] as Record<string, string> | undefined;
      return e === undefined || e.id !== e["id-simple"];
    });

    expect(
      takLagiIdentik,
      "Entri ini tidak lagi identik (atau kuncinya sudah hilang) — hapus dari SAMA_DENGAN_SENGAJA.",
    ).toEqual([]);
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    // Katalog kosong akan membuat kedua test di atas lulus tanpa memeriksa apa
    // pun. Dan bila SEMUA entri identik, katalog `id-simple` sesungguhnya tidak
    // pernah ditulis.
    expect(entri.length).toBeGreaterThan(5);
    expect(entri.filter(identik).length).toBeLessThan(entri.length / 2);
  });
});

describe("katalog — struktur per fitur (AC 4)", () => {
  it("setiap kunci berprefiks nama fiturnya", () => {
    // Prefiks yang cocok dengan berkasnya membuat kunci bisa dilacak dengan
    // grep apa adanya — dan mencegah satu fitur menaruh kuncinya di katalog
    // fitur lain, tempat ia tidak akan pernah dicari.
    for (const { nama, entri: milikFitur } of fiturKatalog) {
      for (const kunci of Object.keys(milikFitur)) {
        expect(kunci.startsWith(`${nama}.`), `kunci "${kunci}" tidak berprefiks "${nama}."`).toBe(
          true,
        );
      }
    }
  });

  it("tidak ada kunci yang saling menimpa antar fitur", () => {
    // Katalog dirakit dengan spread; kunci kembar akan menimpa DIAM-DIAM, dan
    // fitur yang kalah kehilangan teksnya tanpa satu pun galat.
    const semua = fiturKatalog.flatMap(({ entri: e }) => Object.keys(e));
    expect(semua).toHaveLength(new Set(semua).size);
  });

  it("`katalog` dan `fiturKatalog` memuat kunci yang sama", () => {
    // Keduanya sengaja terpisah (lihat catatan di katalog/index.ts). Penjaga
    // ini yang membuat pemisahan itu aman: fitur yang ditambahkan ke salah satu
    // saja langsung merah.
    const dariFitur = fiturKatalog.flatMap(({ entri: e }) => Object.keys(e)).sort();
    expect(Object.keys(katalog).sort()).toEqual(dariFitur);
  });

  it("setiap fitur menyumbang setidaknya satu kunci", () => {
    for (const { nama, entri: e } of fiturKatalog) {
      expect(Object.keys(e).length, `fitur "${nama}" kosong`).toBeGreaterThan(0);
    }
  });
});

describe("katalog — isi entri", () => {
  it("tidak ada varian kosong", () => {
    // Tipe menjamin field-nya ADA; string kosong tetap lolos tipe dan akan
    // tampil sebagai ruang hampa di layar.
    for (const [kunci, e] of entri) {
      for (const mode of MODE_BAHASA) {
        expect(e[mode]?.trim(), `"${kunci}" varian ${mode} kosong`).not.toBe("");
      }
    }
  });

  it("tidak ada spasi menggantung di awal/akhir", () => {
    // Spasi tak sengaja terbaca screen reader sebagai jeda dan menggeser
    // tata letak — tidak terlihat saat review, terlihat di layar.
    for (const [kunci, e] of entri) {
      for (const mode of MODE_BAHASA) {
        expect(e[mode], `"${kunci}" varian ${mode} punya spasi menggantung`).toBe(e[mode]?.trim());
      }
    }
  });
});
