// Unit test query kandidat (PR-070) — penyusun parameter filter + service.
// SQL, indeks, dan kinerja nyata diuji di `matching-kandidat-db.test.ts`.
import { describe, it, expect, vi } from "vitest";
import {
  JUMLAH_KANDIDAT,
  createKandidatService,
  susunFilterKandidat,
  type KandidatRepository,
} from "../src/modules/matching/index.js";

describe("susunFilterKandidat — profil → parameter hard filter", () => {
  it("SDD §7.2: semua mode kerja boleh, remote bebas lokasi, provinsi pengguna jadi syarat", () => {
    expect(susunFilterKandidat({ province: "Jawa Barat" })).toEqual({
      modeDiizinkan: ["onsite", "hybrid", "remote"],
      modeBebasLokasi: ["remote"],
      provinsi: "Jawa Barat",
    });
  });

  it.each([[null], [{ province: null }], [{ province: "   " }]])(
    "tanpa provinsi (%j) → tanpa filter lokasi, bukan feed kosong",
    (profil) => {
      expect(susunFilterKandidat(profil).provinsi).toBeNull();
    },
  );

  it("provinsi dirapikan spasinya (pembanding SQL juga case-insensitif)", () => {
    expect(susunFilterKandidat({ province: "  DI Yogyakarta " }).provinsi).toBe("DI Yogyakarta");
  });

  it("openToRemote TIDAK ikut menyaring (keputusan owner 2026-09-30)", () => {
    // Objek profil yang membawa openToRemote=false tetap menghasilkan filter
    // yang MEMBOLEHKAN remote — nilai bawaan false tidak boleh menyembunyikan
    // lowongan remote dari orang yang tidak pernah mencentangnya.
    const filter = susunFilterKandidat({ province: "Bali", openToRemote: false } as never);
    expect(filter.modeDiizinkan).toContain("remote");
    expect(filter.modeBebasLokasi).toEqual(["remote"]);
  });
});

describe("createKandidatService", () => {
  it("meneruskan filter dari profil, batas top-50, dan ef_search dari config", async () => {
    const cariKandidat = vi.fn<KandidatRepository["cariKandidat"]>(() => Promise.resolve([]));
    const service = createKandidatService({
      repo: { cariKandidat },
      bacaProfil: () => Promise.resolve({ province: "DKI Jakarta" }),
      efSearch: 120,
    });

    await service.cari("018f4c1e-0000-7000-8000-0000000000a1");

    expect(cariKandidat).toHaveBeenCalledWith(
      "018f4c1e-0000-7000-8000-0000000000a1",
      susunFilterKandidat({ province: "DKI Jakarta" }),
      { batas: JUMLAH_KANDIDAT, efSearch: 120 },
    );
    expect(JUMLAH_KANDIDAT).toBe(50);
  });

  it("tanpa vektor profil → null diteruskan apa adanya (PR-073 yang memutuskan penggantinya)", async () => {
    const service = createKandidatService({
      repo: { cariKandidat: () => Promise.resolve(null) },
      bacaProfil: () => Promise.resolve(null),
      efSearch: 100,
    });
    expect(await service.cari("018f4c1e-0000-7000-8000-0000000000a1")).toBeNull();
  });
});
