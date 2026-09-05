// Registry prompt + batas tipe data disabilitas (PR-044a, AC-4).
//
// BACA INI SEBELUM MENAMBAH ASSERTION. Sebagian besar berkas ini TIDAK
// dibuktikan `vitest run`: vitest men-transpile lewat esbuild, yang membuang
// tipe tanpa memeriksanya, jadi setiap `@ts-expect-error` di bawah akan
// "lulus" di sana tanpa arti apa pun. Yang benar-benar menjalankannya adalah
// `pnpm --filter @nawasena/api typecheck` (`tsc --noEmit`, langkah "Typecheck"
// di CI) — `tsconfig.json` memang meng-include `__tests__/**/*.ts` supaya
// berkas ini berada di dalam gerbang itu.
//
// Konsekuensinya dua arah, dan keduanya disengaja:
// - Batas tipe yang MELEMAH → `@ts-expect-error` tidak lagi menemukan error →
//   `tsc` melapor "Unused '@ts-expect-error' directive" → build merah.
// - Batas tipe yang MELEBAR jadi "tolak semuanya" tetap membuat seluruh
//   `@ts-expect-error` hijau. Karena itu ada KONTROL POSITIF di bawah: satu
//   definisi sah TANPA `@ts-expect-error`. Tanpa kontrol itu, berkas ini bisa
//   hijau sambil tidak membuktikan apa-apa.
import { describe, it, expect, expectTypeOf } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { SensitiveProfile } from "@nawasena/schemas";
import { definePrompt, PROMPT_REGISTRY, spesimenV1 } from "../src/core/ai/prompts/index.js";
import type { TanpaDisabilitas } from "../src/core/ai/prompts/index.js";

const PROMPTS = join(__dirname, "..", "src", "core", "ai", "prompts");

/** Skema keluaran seadanya — yang diuji berkas ini adalah sisi MASUKAN. */
const keluaran = z.object({ hasil: z.string() });

describe("TanpaDisabilitas — bentuk tipenya", () => {
  it("memaksa kunci disabilitas menjadi never, termasuk yang bersarang", () => {
    expectTypeOf<TanpaDisabilitas<SensitiveProfile>["disabilityTypes"]>().toBeNever();
    expectTypeOf<
      TanpaDisabilitas<{
        profil: { sensitive: SensitiveProfile };
      }>["profil"]["sensitive"]["disabilityTypes"]
    >().toBeNever();
    expectTypeOf<
      TanpaDisabilitas<{ disability_types: string[] }>["disability_types"]
    >().toBeNever();

    // Anti-hampa: pemetaannya tidak melahap SELURUH objek. Bila ia melakukannya,
    // ketiga assertion di atas hijau tanpa membedakan apa pun.
    expectTypeOf<TanpaDisabilitas<SensitiveProfile>["accommodationNeeds"]>().not.toBeNever();
    expectTypeOf<TanpaDisabilitas<{ catatan: string }>["catatan"]>().toEqualTypeOf<string>();
    // Rekursi berhenti di Date — memetakan propertinya akan mengubahnya menjadi
    // objek biasa yang tidak lagi assignable ke Date.
    expectTypeOf<TanpaDisabilitas<{ sejak: Date }>["sejak"]>().toEqualTypeOf<Date>();
  });
});

describe("definePrompt — batas masukan (AC-4, ditegakkan tsc)", () => {
  it("KONTROL POSITIF: kebutuhan akomodasi DITERIMA", () => {
    // Wajib ada dan wajib TANPA @ts-expect-error. SDD §7.3 secara eksplisit
    // mengizinkan kebutuhan akomodasi fungsional masuk prompt bila fitur
    // memerlukannya dan pengguna sudah consent; batas yang menolaknya juga
    // adalah batas yang salah, dan PR fitur berikutnya akan MELEMAHKANNYA.
    const sah = definePrompt<
      { accommodationNeeds: readonly string[]; catatan: string },
      { hasil: string }
    >({
      nama: "kontrol-positif",
      versi: 1,
      system: "uji",
      output: keluaran,
    });

    expect(sah.id).toBe("kontrol-positif.v1");
  });

  it("bentuk ber-INDEX SIGNATURE ditolak — ia memuat setiap kunci sekaligus", () => {
    // Temuan security review. `Record<string, unknown>` MEMUAT
    // `disabilityTypes`; kuncinya hanya belum disebutkan, jadi pemetaan
    // bersyarat tidak punya apa pun untuk dicocokkan dan meloloskannya. Itu
    // pintu terbuka yang melewati seluruh guard — dan pintu yang penjaga
    // jangkauan tidak pernah lihat, sebab ia hanya memindai `prompts/**`.
    // @ts-expect-error masukan prompt harus bentuk dengan kunci yang disebutkan
    const tolakRecord = definePrompt<Record<string, unknown>, { hasil: string }>({
      nama: "tolak-record",
      versi: 1,
      system: "uji",
      output: keluaran,
    });
    expect(tolakRecord).toBeDefined();

    // @ts-expect-error index signature literal pun ditolak
    const tolakLiteral = definePrompt<{ [k: string]: unknown }, { hasil: string }>({
      nama: "tolak-index-literal",
      versi: 1,
      system: "uji",
      output: keluaran,
    });
    expect(tolakLiteral).toBeDefined();
  });

  it("SensitiveProfile utuh DITOLAK — ia membundel jenis disabilitas", () => {
    // @ts-expect-error masukan prompt tidak boleh memuat jenis disabilitas
    const tolak = definePrompt<SensitiveProfile, { hasil: string }>({
      nama: "tolak-bundel",
      versi: 1,
      system: "uji",
      output: keluaran,
    });

    expect(tolak.id).toBe("tolak-bundel.v1");
  });

  it("bentuk BERSARANG juga ditolak — kebocoran nyatanya memang bersarang", () => {
    // @ts-expect-error jenis disabilitas tersembunyi di dalam objek anak
    const tolak = definePrompt<{ pelamar: { sensitive: SensitiveProfile } }, { hasil: string }>({
      nama: "tolak-bersarang",
      versi: 1,
      system: "uji",
      output: keluaran,
    });

    expect(tolak.id).toBe("tolak-bersarang.v1");
  });

  it("ejaan kolom DB (snake_case) ikut ditolak", () => {
    // @ts-expect-error disability_types adalah ejaan kolom yang sama
    const tolak = definePrompt<{ disability_types: string[] }, { hasil: string }>({
      nama: "tolak-snake",
      versi: 1,
      system: "uji",
      output: keluaran,
    });

    expect(tolak.id).toBe("tolak-snake.v1");
  });

  it("larik objek ikut ditelusuri", () => {
    // @ts-expect-error setiap elemen larik pun diperiksa
    const tolak = definePrompt<{ riwayat: SensitiveProfile[] }, { hasil: string }>({
      nama: "tolak-larik",
      versi: 1,
      system: "uji",
      output: keluaran,
    });

    expect(tolak.id).toBe("tolak-larik.v1");
  });

  it("field OPSIONAL yang masih bisa membawa data tetap ditolak", () => {
    // @ts-expect-error `?: string[]` masih bisa berisi datanya
    const tolak = definePrompt<{ disabilityTypes?: string[] }, { hasil: string }>({
      nama: "tolak-opsional",
      versi: 1,
      system: "uji",
      output: keluaran,
    });

    expect(tolak.id).toBe("tolak-opsional.v1");
  });

  it("field yang HANYA bisa undefined diterima — ia tidak membawa data apa pun", () => {
    // Sisi lain dari kasus di atas, dan ia memang benar lolos: properti yang
    // tipenya hanya `undefined` tidak dapat memuat satu pun nilai disabilitas.
    const sah = definePrompt<{ disabilityTypes?: undefined; catatan: string }, { hasil: string }>({
      nama: "opsional-kosong",
      versi: 1,
      system: "uji",
      output: keluaran,
    });

    expect(sah.id).toBe("opsional-kosong.v1");
  });
});

describe("konvensi versi & kelengkapan registry", () => {
  it("id template sama persis dengan basename berkasnya", () => {
    expect(spesimenV1.id).toBe("spesimen.v1");
    expect(readdirSync(PROMPTS)).toContain(`${spesimenV1.id}.ts`);
  });

  it("setiap berkas <nama>.vN.ts terdaftar di PROMPT_REGISTRY", () => {
    const berkas = readdirSync(PROMPTS)
      .filter((f) => /\.v\d+\.ts$/.test(f))
      .map((f) => f.replace(/\.ts$/, ""));

    // Anti-hampa: folder kosong akan membuat perbandingan di bawah hijau tanpa
    // memeriksa satu template pun.
    expect(berkas.length).toBeGreaterThan(0);
    expect(berkas.sort()).toEqual(Object.keys(PROMPT_REGISTRY).sort());
  });

  it("registry menyimpan identitas, bukan templatenya", () => {
    // Lookup `string → template bertipe` sengaja tidak ada: ia tidak bisa
    // diketik, dan ia menjadi pintu yang melangkahi batas tipe di atas.
    expect(PROMPT_REGISTRY[spesimenV1.id]).toEqual({
      nama: "spesimen",
      versi: 1,
      id: "spesimen.v1",
    });
    expect(PROMPT_REGISTRY[spesimenV1.id]).not.toHaveProperty("bangun");
  });
});
