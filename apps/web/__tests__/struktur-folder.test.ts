// AC PR-025: "Struktur folder sesuai SDD §4.1".
//
// Ditegakkan mesin, bukan diperiksa mata saat review. Struktur folder adalah
// jenis keputusan yang tidak pernah dilanggar sekaligus — ia luntur satu berkas
// pada satu waktu, dan tiap langkahnya tampak masuk akal sendiri. Penjaga ini
// membuat langkah pertamanya terlihat.
//
// Yang TIDAK dijaga di sini: isi tiap folder. Aturan "apa yang boleh masuk"
// ditulis di README masing-masing, dan penegakannya adalah review — bukan
// pemindai teks yang akan salah menuduh.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * Empat folder dari SDD §4.1. Ditulis sebagai daftar, bukan diturunkan dari isi
 * folder, supaya HILANGNYA sebuah folder juga membuat merah — bukan hanya
 * hadirnya folder asing.
 */
const FOLDER_SDD = ["app", "routes", "features", "shared"] as const;

describe("struktur folder apps/web (SDD §4.1)", () => {
  it.each(FOLDER_SDD)("src/%s ada", (nama) => {
    const jalur = join(SRC, nama);
    expect(existsSync(jalur), `src/${nama} tidak ada — lihat SDD §4.1`).toBe(true);
    expect(statSync(jalur).isDirectory()).toBe(true);
  });

  it("tiap folder membawa README yang menjelaskan apa yang boleh masuk", () => {
    // Folder kosong tanpa keterangan adalah undangan untuk diisi asal. README
    // di tiap folder adalah tempat aturannya hidup bersama kodenya, bukan di
    // dokumen terpisah yang tidak pernah dibuka saat menambah berkas.
    for (const nama of FOLDER_SDD) {
      expect(existsSync(join(SRC, nama, "README.md")), `src/${nama}/README.md hilang`).toBe(true);
    }
  });

  it("tidak ada folder tingkat atas di luar daftar SDD §4.1", () => {
    // Menangkap folder kelima yang lahir diam-diam (`utils/`, `components/`,
    // `lib/`) — bentuk paling umum dari erosi struktur. Menambahnya harus
    // menjadi keputusan sadar yang mengubah daftar di atas DAN SDD.
    const isi = readdirSync(SRC, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    expect(isi).toEqual([...FOLDER_SDD].sort());
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    // Kalau SRC salah jalur, ketiga test di atas akan gagal — tetapi kalau
    // suatu saat mereka diubah menjadi toleran, ini yang menahan.
    expect(existsSync(SRC)).toBe(true);
    expect(FOLDER_SDD.length).toBeGreaterThan(0);
  });
});
