// Sinkron akun (PR-091): `gabungkanDariServer` diuji tuntas di web
// (sambungkan-server.test.tsx, lewat ekspor ulang); di sini cukup bukti bahwa
// inti paket membawanya, plus `profilBelumDiatur` yang baru.
import { describe, expect, it } from "vitest";
import { ACCESSIBILITY_PROFILE_KOSONG } from "@nawasena/schemas";

import { gabungkanDariServer, profilBelumDiatur } from "../src/index.js";

describe("profilBelumDiatur", () => {
  it("profil akun baru (semua null) → belum diatur", () => {
    expect(profilBelumDiatur(ACCESSIBILITY_PROFILE_KOSONG)).toBe(true);
  });

  it("satu field saja yang diatur — termasuk `false` — sudah cukup", () => {
    expect(profilBelumDiatur({ ...ACCESSIBILITY_PROFILE_KOSONG, reduceMotion: false })).toBe(false);
    expect(profilBelumDiatur({ ...ACCESSIBILITY_PROFILE_KOSONG, textScale: 150 })).toBe(false);
  });
});

describe("gabungkanDariServer (inti paket)", () => {
  it("null tidak ditulis; nilai server mengisi field yang tidak disentuh", () => {
    const hasil = gabungkanDariServer(
      { ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: true, textScale: 150 },
      { textScale: 125 },
      { textScale: 175 },
    );
    expect(hasil).toEqual({ highContrast: true });
  });
});
