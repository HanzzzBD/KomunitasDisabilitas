// AC PR-026: "`prefers-reduced-motion` OS dihormati bila user belum set eksplisit."
//
// Aturannya satu kalimat, tetapi punya tiga keadaan yang mudah tertukar:
// pengguna memilih ya, pengguna memilih TIDAK, dan pengguna belum memilih.
// Yang kedua dan ketiga sama-sama "tidak aktif" di layar, dan justru karena itu
// mudah disamakan di kode — padahal maknanya berlawanan.
import { describe, expect, it } from "vitest";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/schemas";
import { dipilihPengguna, rekonsiliasi } from "../src/rekonsiliasi.js";

describe("rekonsiliasi — urutan menang", () => {
  it("tanpa pilihan & tanpa sinyal OS → bawaan", () => {
    expect(rekonsiliasi({})).toEqual(ACCESSIBILITY_DEFAULTS);
  });

  it("OS menang atas bawaan bila pengguna belum memilih", () => {
    expect(rekonsiliasi({}, { reduceMotion: true }).reduceMotion).toBe(true);
    expect(rekonsiliasi({}, { highContrast: true }).highContrast).toBe(true);
  });

  it("pilihan pengguna menang atas OS", () => {
    // Pengguna yang menyalakan animasi meski OS meredamnya sedang menyatakan
    // sesuatu tentang aplikasi INI. Menimpanya dengan setelan sistem berarti
    // memberi tahu mereka bahwa pilihannya tidak dihitung.
    expect(rekonsiliasi({ reduceMotion: false }, { reduceMotion: true }).reduceMotion).toBe(false);
    expect(rekonsiliasi({ reduceMotion: true }, { reduceMotion: false }).reduceMotion).toBe(true);
  });

  it("`false` eksplisit BERBEDA dari belum memilih", () => {
    // Inilah alasan pilihan pengguna disimpan sebagai objek SEBAGIAN. Kalau ia
    // profil utuh, kedua baris di bawah tidak akan bisa dibedakan.
    expect(rekonsiliasi({ reduceMotion: false }, { reduceMotion: true }).reduceMotion).toBe(false);
    expect(rekonsiliasi({}, { reduceMotion: true }).reduceMotion).toBe(true);
  });

  it("`undefined` dari OS BERBEDA dari `false` dari OS", () => {
    // Browser lama tidak melaporkan `prefers-contrast` sama sekali.
    // Memperlakukan ketiadaannya sebagai "tidak mau" akan menimpa keinginan
    // yang tidak pernah dinyatakan siapa pun.
    expect(rekonsiliasi({}, { highContrast: undefined }).highContrast).toBe(
      ACCESSIBILITY_DEFAULTS.highContrast,
    );
    expect(rekonsiliasi({}, { highContrast: false }).highContrast).toBe(false);
  });
});

describe("rekonsiliasi — preferensi tanpa padanan OS", () => {
  it("hanya pengguna yang bisa menyatakannya", () => {
    // Tidak ada API browser maupun Android yang melaporkan keempat hal ini.
    const os = { reduceMotion: true, highContrast: true };
    const hasil = rekonsiliasi({}, os);

    expect(hasil.simpleLanguage).toBe(false);
    expect(hasil.prefersSignLanguage).toBe(false);
    expect(hasil.largeTouchTargets).toBe(false);
    expect(hasil.screenReaderHint).toBe(false);
  });

  it("textScale mengikuti pilihan pengguna atau bawaan", () => {
    expect(rekonsiliasi({}).textScale).toBe(100);
    expect(rekonsiliasi({ textScale: 150 }).textScale).toBe(150);
  });
});

describe("dipilihPengguna", () => {
  it("membedakan pilihan eksplisit dari yang mengikuti perangkat", () => {
    // Dipakai panel preferensi (PR-036) untuk menampilkan "mengikuti setelan
    // perangkat" alih-alih nilai mati — pengguna berhak tahu mana yang akan
    // ikut berubah bila mereka mengubah setelan sistem.
    const pilihan = { reduceMotion: false };
    expect(dipilihPengguna(pilihan, "reduceMotion")).toBe(true);
    expect(dipilihPengguna(pilihan, "highContrast")).toBe(false);
  });
});
