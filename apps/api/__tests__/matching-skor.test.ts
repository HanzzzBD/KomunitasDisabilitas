// Unit + property test mesin skor (PR-071). Profil terenkripsi nyata di
// `matching-skor-db.test.ts`.
//
// AC yang dijaga di berkas ini:
//   - lowongan tanpa akomodasi wajib user TIDAK PERNAH lolos (property test);
//   - tiap komponen teruji terpisah;
//   - user tanpa data akomodasi → netral (tidak menghukum);
//   - deterministik (input sama → skor sama).
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { ACCOMMODATION_NEEDS, type AccommodationNeed } from "@nawasena/schemas";
import { loadEnv } from "../src/core/config/index.js";
import {
  ALASAN_AKSES_MATCHING,
  BOBOT_SKOR_SDD,
  KEBARUAN_TANPA_TANGGAL,
  NILAI_LOKASI,
  bobotDariEnv,
  createPembacaAkomodasi,
  createPenilaianService,
  hitungSkor,
  komponenAkomodasi,
  komponenKebaruan,
  komponenKemiripan,
  komponenLokasi,
  memenuhiAkomodasi,
  nilaiKandidat,
  type KonteksSkor,
  type LowonganUntukSkor,
} from "../src/modules/matching/index.js";

const SEKARANG = new Date("2026-09-30T00:00:00.000Z");
const hariLalu = (n: number) => new Date(SEKARANG.getTime() - n * 86_400_000);

const PROFIL_JABAR = { city: "Bandung", province: "Jawa Barat", openToRemote: false };

function konteks(over: Partial<KonteksSkor> = {}): KonteksSkor {
  return {
    profil: PROFIL_JABAR,
    kebutuhan: null,
    bobot: BOBOT_SKOR_SDD,
    paruhKebaruanHari: 14,
    sekarang: SEKARANG,
    ...over,
  };
}

function lowongan(over: Partial<LowonganUntukSkor> = {}): LowonganUntukSkor {
  return {
    jobId: "018f4c1e-0000-7000-8000-000000000j01",
    kemiripan: 0.8,
    workMode: "onsite",
    city: "Bandung",
    province: "Jawa Barat",
    accommodations: ["akses_kursi_roda"],
    publishedAt: SEKARANG,
    ...over,
  };
}

// --- Arbitrary fast-check -------------------------------------------------
const arbAkomodasi = fc.subarray([...ACCOMMODATION_NEEDS]) as fc.Arbitrary<AccommodationNeed[]>;
const arbLowongan: fc.Arbitrary<LowonganUntukSkor> = fc.record({
  jobId: fc.uuid(),
  kemiripan: fc.double({ min: -1, max: 1, noNaN: true }),
  workMode: fc.constantFrom("onsite" as const, "hybrid" as const, "remote" as const),
  city: fc.option(fc.constantFrom("Bandung", "Jakarta", "Bekasi"), { nil: null }),
  province: fc.option(fc.constantFrom("Jawa Barat", "DKI Jakarta", " jawa barat "), { nil: null }),
  accommodations: arbAkomodasi,
  publishedAt: fc.option(
    fc.date({ min: new Date("2025-01-01"), max: new Date("2026-12-31"), noInvalidDate: true }),
    { nil: null },
  ),
});
const arbKebutuhan = fc.option(arbAkomodasi, { nil: null });

describe("komponen — masing-masing teruji terpisah (AC)", () => {
  it("kemiripan: dijepit ke [0, 1]", () => {
    expect(komponenKemiripan(0.83)).toBe(0.83);
    expect(komponenKemiripan(-0.4)).toBe(0);
    expect(komponenKemiripan(1.2)).toBe(1);
    expect(komponenKemiripan(Number.NaN)).toBe(0);
  });

  it("akomodasi: keluasan = unik dalam taksonomi ÷ 6", () => {
    expect(komponenAkomodasi([])).toBe(0);
    expect(komponenAkomodasi(["akses_kursi_roda", "akses_kursi_roda"])).toBeCloseTo(1 / 6);
    expect(komponenAkomodasi([...ACCOMMODATION_NEEDS])).toBe(1);
    expect(komponenAkomodasi(["bukan_taksonomi" as AccommodationNeed])).toBe(0);
  });

  it("lokasi: tabel NILAI_LOKASI", () => {
    const remote = { workMode: "remote" as const, city: null, province: null };
    expect(komponenLokasi({ ...PROFIL_JABAR, openToRemote: true }, remote)).toBe(
      NILAI_LOKASI.remoteTerbuka,
    );
    expect(komponenLokasi(PROFIL_JABAR, remote)).toBe(NILAI_LOKASI.remoteTidakTerbuka);
    expect(
      komponenLokasi(PROFIL_JABAR, {
        workMode: "onsite",
        city: " bandung",
        province: "JAWA BARAT",
      }),
    ).toBe(NILAI_LOKASI.kotaSama);
    expect(
      komponenLokasi(PROFIL_JABAR, { workMode: "hybrid", city: "Bekasi", province: "Jawa Barat" }),
    ).toBe(NILAI_LOKASI.provinsiSamaBedaKota);
    expect(komponenLokasi(PROFIL_JABAR, { workMode: "onsite", city: null, province: null })).toBe(
      NILAI_LOKASI.lowonganTanpaProvinsi,
    );
    expect(
      komponenLokasi(
        { city: null, province: null, openToRemote: false },
        { workMode: "onsite", city: "X", province: "Bali" },
      ),
    ).toBe(NILAI_LOKASI.penggunaTanpaProvinsi);
    expect(
      komponenLokasi(PROFIL_JABAR, { workMode: "onsite", city: "Denpasar", province: "Bali" }),
    ).toBe(NILAI_LOKASI.provinsiLain);
  });

  it("kebaruan: peluruhan eksponensial, paruh 14 hari", () => {
    expect(komponenKebaruan(SEKARANG, SEKARANG, 14)).toBe(1);
    expect(komponenKebaruan(hariLalu(14), SEKARANG, 14)).toBeCloseTo(0.5, 10);
    expect(komponenKebaruan(hariLalu(42), SEKARANG, 14)).toBeCloseTo(0.125, 10);
    expect(komponenKebaruan(new Date(SEKARANG.getTime() + 86_400_000), SEKARANG, 14)).toBe(1);
    expect(komponenKebaruan(null, SEKARANG, 14)).toBe(KEBARUAN_TANPA_TANGGAL);
  });

  it("skor = Σ bobot × komponen, dibulatkan 4 desimal", () => {
    const hasil = hitungSkor(
      lowongan({
        accommodations: ["akses_kursi_roda", "ramah_screen_reader"],
        publishedAt: hariLalu(14),
      }),
      konteks(),
    );
    // 0.55·0.8 + 0.25·(2/6) + 0.10·1 + 0.10·0.5
    expect(hasil.skor).toBe(Math.round((0.44 + 0.25 / 3 + 0.1 + 0.05) * 10_000) / 10_000);
    expect(hasil.komponen).toEqual({ kemiripan: 0.8, akomodasi: 0.3333, lokasi: 1, kebaruan: 0.5 });
  });
});

describe("hard filter akomodasi — property test (AC)", () => {
  it("lowongan yang TIDAK memuat setiap kebutuhan wajib user tidak pernah lolos", () => {
    fc.assert(
      fc.property(fc.array(arbLowongan, { maxLength: 50 }), arbAkomodasi, (kandidat, kebutuhan) => {
        const lolos = new Set(nilaiKandidat(kandidat, konteks({ kebutuhan })).map((s) => s.jobId));
        for (const l of kandidat) {
          const lengkap = kebutuhan.every((k) => l.accommodations.includes(k));
          if (!lengkap && lolos.has(l.jobId)) {
            // Id acak bisa kembar: lowongan lain ber-id sama yang lengkap sah lolos.
            const kembarLengkap = kandidat.some(
              (x) => x.jobId === l.jobId && kebutuhan.every((k) => x.accommodations.includes(k)),
            );
            if (!kembarLengkap) return false;
          }
        }
        return true;
      }),
      { numRuns: 1_000 },
    );
  });

  it("dan yang memuatnya SELALU lolos (filter tidak berlebihan)", () => {
    fc.assert(
      fc.property(fc.array(arbLowongan, { maxLength: 50 }), arbAkomodasi, (kandidat, kebutuhan) => {
        const lengkap = kandidat.filter((l) => memenuhiAkomodasi(kebutuhan, l.accommodations));
        return nilaiKandidat(kandidat, konteks({ kebutuhan })).length === lengkap.length;
      }),
      { numRuns: 500 },
    );
  });

  it("AC: user tanpa data akomodasi → tidak ada yang tersaring DAN skornya identik dengan user berkebutuhan", () => {
    fc.assert(
      fc.property(arbLowongan, arbAkomodasi, (l, kebutuhan) => {
        expect(memenuhiAkomodasi(null, l.accommodations)).toBe(true);
        // Netral: bila lowongan lolos untuk user berkebutuhan, skornya SAMA
        // dengan skor untuk user tanpa data — data akomodasi tidak menghukum
        // maupun menguntungkan siapa pun di angka skor.
        if (memenuhiAkomodasi(kebutuhan, l.accommodations)) {
          expect(hitungSkor(l, konteks({ kebutuhan })).skor).toBe(
            hitungSkor(l, konteks({ kebutuhan: null })).skor,
          );
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe("determinisme & rentang (AC)", () => {
  it("input sama → keluaran identik, termasuk urutan", () => {
    fc.assert(
      fc.property(fc.array(arbLowongan, { maxLength: 50 }), arbKebutuhan, (kandidat, kebutuhan) => {
        const k = konteks({ kebutuhan });
        expect(nilaiKandidat(kandidat, k)).toEqual(nilaiKandidat([...kandidat], k));
        expect(nilaiKandidat([...kandidat].reverse(), k).map((s) => s.jobId)).toEqual(
          nilaiKandidat(kandidat, k).map((s) => s.jobId),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("skor dan setiap komponen selalu di [0, 1]; urutan skor menurun", () => {
    fc.assert(
      fc.property(fc.array(arbLowongan, { maxLength: 50 }), (kandidat) => {
        const hasil = nilaiKandidat(kandidat, konteks());
        for (let i = 0; i < hasil.length; i += 1) {
          const h = hasil[i]!;
          for (const n of [h.skor, ...Object.values(h.komponen)])
            expect(n >= 0 && n <= 1).toBe(true);
          if (i > 0) expect(hasil[i - 1]!.skor).toBeGreaterThanOrEqual(h.skor);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe("bobot dari env tanpa deploy kode (AC)", () => {
  // Env minimal yang sah (pola env.test.ts) — bukan process.env mesin ini.
  const ENV_DASAR: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/nawasena",
    REDIS_URL: "redis://localhost:6379",
    REDIS_QUEUE_URL: "redis://localhost:6380",
  };

  it("bawaan env = bobot SDD", () => {
    expect(bobotDariEnv(loadEnv(ENV_DASAR))).toEqual(BOBOT_SKOR_SDD);
  });

  it("env mengubah bobot, dan bobot itu benar-benar mengubah skor", () => {
    const env = loadEnv({
      ...ENV_DASAR,
      MATCHING_WEIGHT_SIMILARITY: "1",
      MATCHING_WEIGHT_ACCOMMODATION: "0",
      MATCHING_WEIGHT_LOCATION: "0",
      MATCHING_WEIGHT_RECENCY: "0",
    });
    const bobot = bobotDariEnv(env);
    expect(hitungSkor(lowongan({ kemiripan: 0.37 }), konteks({ bobot })).skor).toBe(0.37);
  });

  it("jumlah bobot ≠ 1 → boot gagal (fail-fast), menyebut variabelnya", () => {
    expect(() => loadEnv({ ...ENV_DASAR, MATCHING_WEIGHT_SIMILARITY: "0.9" })).toThrow(
      /MATCHING_WEIGHT_SIMILARITY/,
    );
  });
});

describe("createPembacaAkomodasi / createPenilaianService", () => {
  const AKTOR = { userId: "018f4c1e-0000-7000-8000-0000000000a1", requestId: "req-1" };

  it("membaca lewat bacaSensitif tujuan `matching` + alasan konstan, hanya mengambil tags", async () => {
    const bacaSensitif = vi.fn(() =>
      Promise.resolve({
        headline: null,
        summary: null,
        city: null,
        province: null,
        openToRemote: false,
        disclosureDefault: "ask_each_time" as const,
        consentSensitiveAt: "2026-09-01T00:00:00.000Z",
        sensitive: {
          disabilityTypes: ["daksa" as const],
          accommodationNeeds: { tags: ["akses_kursi_roda" as const], notes: "catatan rahasia" },
        },
      }),
    );
    const pembaca = createPembacaAkomodasi({ sensitiveAccess: { bacaSensitif } });

    expect(await pembaca.kebutuhanWajib(AKTOR)).toEqual(["akses_kursi_roda"]);
    expect(bacaSensitif).toHaveBeenCalledWith(AKTOR, AKTOR.userId, {
      purpose: "matching",
      reason: ALASAN_AKSES_MATCHING,
    });
  });

  it.each([
    ["tanpa profil", null],
    ["consent dicabut (sensitive null)", { sensitive: null }],
    [
      "tags kosong",
      { sensitive: { disabilityTypes: [], accommodationNeeds: { tags: [], notes: null } } },
    ],
  ])("%s → null (netral, tidak menyaring)", async (_l, profil) => {
    const pembaca = createPembacaAkomodasi({
      sensitiveAccess: { bacaSensitif: () => Promise.resolve(profil as never) },
    });
    expect(await pembaca.kebutuhanWajib(AKTOR)).toBeNull();
  });

  it("kandidat kosong → tidak membaca data sensitif sama sekali", async () => {
    const kebutuhanWajib = vi.fn(() => Promise.resolve(null));
    const service = createPenilaianService({
      akomodasi: { kebutuhanWajib },
      bobot: BOBOT_SKOR_SDD,
      paruhKebaruanHari: 14,
    });
    expect(await service.nilai(AKTOR, PROFIL_JABAR, [])).toEqual([]);
    expect(kebutuhanWajib).not.toHaveBeenCalled();
  });

  it("keluaran tidak memuat apa pun tentang kebutuhan user — hanya id, skor, komponen angka", async () => {
    const service = createPenilaianService({
      akomodasi: { kebutuhanWajib: () => Promise.resolve(["juru_bahasa_isyarat"]) },
      bobot: BOBOT_SKOR_SDD,
      paruhKebaruanHari: 14,
      clock: () => SEKARANG,
    });
    const hasil = await service.nilai(AKTOR, PROFIL_JABAR, [
      { ...lowongan({ jobId: "a", accommodations: ["juru_bahasa_isyarat"] }), kemiripan: 0.9 },
      { ...lowongan({ jobId: "b", accommodations: ["akses_kursi_roda"] }), kemiripan: 0.99 },
    ]);
    expect(hasil.map((h) => h.jobId)).toEqual(["a"]);
    expect(Object.keys(hasil[0]!).sort()).toEqual(["jobId", "komponen", "skor"]);
    expect(JSON.stringify(hasil)).not.toContain("juru_bahasa_isyarat");
  });
});
