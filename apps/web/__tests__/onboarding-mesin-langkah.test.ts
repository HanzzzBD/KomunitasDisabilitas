// Mesin langkah wizard onboarding (PR-035) — Testing Checklist ticket: "Unit
// Test (state wizard)".
//
// TANPA SATU PUN RENDER. Itulah alasan mesinnya dipisah dari komponennya:
// batas-batas navigasi ("tidak ada langkah sebelum yang pertama", "tidak ada
// sesudah yang terakhir") adalah tempat wizard paling mudah salah, dan
// mengujinya lewat DOM berarti menempuh empat render untuk memeriksa satu
// penjumlahan — lambat, dan gagalnya menunjuk ke tombol alih-alih ke aturannya.
import { describe, expect, it } from "vitest";
import {
  LANGKAH,
  initStateWizard,
  langkahSaatIni,
  reduksiWizard,
  type AksiWizard,
  type StateWizard,
} from "../src/features/onboarding/mesin-langkah.js";

function jalankan(awal: StateWizard, ...aksi: AksiWizard[]): StateWizard {
  return aksi.reduce(reduksiWizard, awal);
}

const MAJU: AksiWizard = { type: "MAJU" };
const MUNDUR: AksiWizard = { type: "MUNDUR" };

describe("keadaan awal", () => {
  it("mulai di langkah pertama, dengan hanya langkah pertama tercatat dikunjungi", () => {
    const awal = initStateWizard();
    expect(awal.indeks).toBe(0);
    expect(awal.dikunjungi).toEqual([true, false, false, false]);
    expect(langkahSaatIni(awal)).toBe("ragam");
  });

  it("panjangnya mengikuti daftar langkah, bukan angka yang diketik ulang", () => {
    // Mitigasi risiko ticket ("maksimal 4 langkah"). Angka yang diketik ulang
    // di komponen akan menyimpang begitu daftarnya bertambah.
    expect(LANGKAH).toHaveLength(4);
    expect(initStateWizard().dikunjungi).toHaveLength(LANGKAH.length);
  });
});

describe("batas navigasi", () => {
  it("MAJU berhenti di langkah terakhir, berapa kali pun ditekan", () => {
    // Tanpa penjaga ini, indeksnya melewati akhir daftar dan `langkahSaatIni`
    // membaca `undefined` — layar kosong tanpa satu pun galat.
    const akhir = jalankan(initStateWizard(), MAJU, MAJU, MAJU, MAJU, MAJU);
    expect(akhir.indeks).toBe(LANGKAH.length - 1);
    expect(langkahSaatIni(akhir)).toBe("ringkasan");
  });

  it("MUNDUR di langkah pertama tidak mengubah apa pun", () => {
    const awal = initStateWizard();
    const sesudah = jalankan(awal, MUNDUR, MUNDUR);
    expect(sesudah.indeks).toBe(0);
    // Objek yang SAMA, bukan sekadar nilai yang sama: state baru pada aksi yang
    // tidak mengubah apa pun akan merender ulang seluruh wizard tanpa sebab.
    expect(sesudah).toBe(awal);
  });

  it("MAJU di langkah terakhir mengembalikan state yang SAMA persis", () => {
    const akhir = jalankan(initStateWizard(), MAJU, MAJU, MAJU);
    expect(reduksiWizard(akhir, MAJU)).toBe(akhir);
  });
});

describe("penanda kunjungan", () => {
  it("bertambah saat maju, dan TIDAK dicabut saat mundur", () => {
    // Indikator progres yang menyala-padam saat pengguna mundur membuatnya
    // mengira ia kehilangan kemajuan yang sudah ditempuh.
    const sesudah = jalankan(initStateWizard(), MAJU, MAJU, MUNDUR);
    expect(sesudah.indeks).toBe(1);
    expect(sesudah.dikunjungi).toEqual([true, true, true, false]);
  });

  it("maju-mundur berulang tidak pernah mengurangi jumlah yang dikunjungi", () => {
    let state = initStateWizard();
    let tertinggi = state.dikunjungi.filter(Boolean).length;
    for (const aksi of [MAJU, MUNDUR, MAJU, MAJU, MUNDUR, MUNDUR, MAJU]) {
      state = reduksiWizard(state, aksi);
      const kini = state.dikunjungi.filter(Boolean).length;
      expect(kini).toBeGreaterThanOrEqual(tertinggi);
      tertinggi = kini;
    }
  });
});

describe("melewati wizard BUKAN urusan mesin ini", () => {
  it("hanya ada dua aksi: MAJU dan MUNDUR", () => {
    // Inilah yang membuat "boleh dilewati kapan saja" (AC 1) benar tanpa satu
    // pun percabangan: tidak ada transisi 'LEWATI'/'SELESAI' yang bisa salah,
    // sebab keduanya bukan perpindahan langkah melainkan JALAN KELUAR yang
    // ditangani komponen (tandai selesai → pindah halaman).
    //
    // Diperiksa lewat perilaku, bukan lewat tipe: aksi asing dikembalikan apa
    // adanya, jadi mesin ini tidak punya jalur tersembunyi.
    const awal = initStateWizard();
    expect(reduksiWizard(awal, { type: "LEWATI" } as unknown as AksiWizard)).toBe(awal);
    expect(reduksiWizard(awal, { type: "SELESAI" } as unknown as AksiWizard)).toBe(awal);
  });

  it("keluar dari langkah 1 tidak menuntut data langkah mana pun sesudahnya", () => {
    // Bentuk state-nya sendiri yang menjaminnya: mesin ini tidak menyimpan satu
    // pun jawaban pengguna — hanya indeks dan penanda kunjungan. Tidak ada
    // field yang bisa `undefined` saat wizard ditutup di tengah.
    expect(Object.keys(initStateWizard()).sort()).toEqual(["dikunjungi", "indeks"]);
  });
});
