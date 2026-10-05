// Penjaga sinkronisasi `apps/mobile/.env.example` (pola sama
// apps/api/__tests__/env-example.test.ts). Setiap `process.env.X` yang dibaca
// kode mobile harus terdokumentasi di sana — variabel yang hanya hidup di kode
// adalah variabel yang tidak diketahui orang yang menyiapkan build EAS.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const AKAR = resolve(__dirname, "..");
const contoh = readFileSync(join(AKAR, ".env.example"), "utf8");

function berkasKode(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) return berkasKode(jalur);
    return /\.(ts|tsx)$/.test(nama) ? [jalur] : [];
  });
}

const dipakai = new Set(
  [...berkasKode(join(AKAR, "src")), join(AKAR, "app.config.ts")].flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1] as string),
  ),
);

/** Diset mesin build EAS sendiri — disebut di catatan, bukan sebagai baris isian. */
const OTOMATIS = new Set(["EAS_BUILD"]);

const didefinisikan = new Set(
  contoh
    .split("\n")
    .map((b) => /^([A-Z0-9_]+)=/.exec(b)?.[1])
    .filter((v): v is string => v !== undefined),
);

describe("apps/mobile/.env.example", () => {
  it("memuat setiap variabel yang dibaca kode mobile", () => {
    const hilang = [...dipakai].filter((v) => !OTOMATIS.has(v) && !didefinisikan.has(v));
    expect(hilang).toEqual([]);
  });

  it("tidak memuat variabel yang tidak lagi dibaca siapa pun", () => {
    expect([...didefinisikan].filter((v) => !dipakai.has(v))).toEqual([]);
  });

  it("variabel otomatis EAS disebut tetapi tidak diisi", () => {
    for (const v of OTOMATIS) {
      expect(contoh).toContain(v);
      expect(didefinisikan.has(v)).toBe(false);
    }
  });

  it("tidak ada nilai yang tampak seperti rahasia (semua EXPO_PUBLIC_* ikut ke APK)", () => {
    expect(contoh).not.toMatch(/^[A-Z_]*(SECRET|PASSWORD|PRIVATE)[A-Z_]*=/m);
  });
});
