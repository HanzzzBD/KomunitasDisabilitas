// Batas hari WIB untuk kuota AI (PR-043, AC-2: "counter reset harian
// (timezone WIB) teruji").
//
// TANPA FAKE TIMER. Kedua fungsi menerima `Date` sebagai argumen, jadi
// "melintasi tengah malam" cukup dengan menyerahkan titik waktu lain — dan
// test-nya tidak bergantung pada jam mesin CI maupun pada TZ sistemnya.
import { describe, it, expect } from "vitest";
import { detikKeTengahMalamWib, hariWib, ZONA_WIB } from "../src/core/ai/waktu-wib.js";

/** 17:00Z = 00:00 WIB (+07:00) — inilah batas yang harus tepat. */
const SEDETIK_SEBELUM = new Date("2026-08-31T16:59:59.000Z");
const TEPAT_TENGAH_MALAM = new Date("2026-08-31T17:00:00.000Z");

describe("hariWib — komponen tanggal pada kunci penghitung", () => {
  it("zona yang dipakai adalah Asia/Jakarta", () => {
    expect(ZONA_WIB).toBe("Asia/Jakarta");
  });

  it("16:59:59Z masih hari yang sama (23:59:59 WIB)", () => {
    expect(hariWib(SEDETIK_SEBELUM)).toBe("2026-08-31");
  });

  it("17:00:00Z sudah hari berikutnya (00:00:00 WIB)", () => {
    expect(hariWib(TEPAT_TENGAH_MALAM)).toBe("2026-09-01");
  });

  it("bentuknya YYYY-MM-DD sehingga bisa diurutkan sebagai string", () => {
    expect(hariWib(new Date("2026-01-05T02:00:00.000Z"))).toBe("2026-01-05");
    expect(hariWib(new Date("2026-12-31T23:00:00.000Z"))).toBe("2027-01-01");
  });

  it("tengah hari UTC dan tengah hari WIB tidak tertukar", () => {
    // 2026-08-31T12:00Z = 19:00 WIB, masih tanggal yang sama.
    expect(hariWib(new Date("2026-08-31T12:00:00.000Z"))).toBe("2026-08-31");
    // 2026-08-31T20:00Z = 03:00 WIB tanggal 1 September.
    expect(hariWib(new Date("2026-08-31T20:00:00.000Z"))).toBe("2026-09-01");
  });

  it("melintasi tengah malam UTC TIDAK mengganti hari WIB (penjaga bug selisih 7 jam)", () => {
    // Implementasi yang keliru memakai batas UTC (bukan WIB) akan melihat
    // tanggal berganti persis di 00:00Z. Keduanya di bawah ini adalah
    // 06:xx/07:xx WIB tanggal 31 Agustus — harus tetap SATU hari WIB yang
    // sama meski UTC-nya berpindah tanggal.
    expect(hariWib(new Date("2026-08-30T23:59:59.000Z"))).toBe("2026-08-31"); // 06:59:59 WIB
    expect(hariWib(new Date("2026-08-31T00:00:01.000Z"))).toBe("2026-08-31"); // 07:00:01 WIB
  });
});

describe("detikKeTengahMalamWib — dasar Retry-After & TTL", () => {
  it("satu detik sebelum tengah malam WIB → 1 detik", () => {
    expect(detikKeTengahMalamWib(SEDETIK_SEBELUM)).toBe(1);
  });

  it("tepat tengah malam WIB → sehari penuh (kunci baru berumur penuh)", () => {
    expect(detikKeTengahMalamWib(TEPAT_TENGAH_MALAM)).toBe(86_400);
  });

  it("tengah hari WIB → separuh hari", () => {
    // 05:00Z = 12:00 WIB
    expect(detikKeTengahMalamWib(new Date("2026-08-31T05:00:00.000Z"))).toBe(43_200);
  });

  it("selalu > 0 — Retry-After nol berarti 'coba lagi sekarang', dan itu bohong", () => {
    for (let jam = 0; jam < 24; jam += 1) {
      const t = new Date(Date.UTC(2026, 7, 31, jam, 30, 15));
      expect(detikKeTengahMalamWib(t), t.toISOString()).toBeGreaterThan(0);
      expect(detikKeTengahMalamWib(t), t.toISOString()).toBeLessThanOrEqual(86_400);
    }
  });
});
