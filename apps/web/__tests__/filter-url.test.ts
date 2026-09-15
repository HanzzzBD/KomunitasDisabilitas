// Filter pencarian ↔ query string (PR-059) — dasar AC "kembali ke list →
// pencarian yang sama pulih". Alamat bisa datang dari luar (tautan dibagikan,
// diketik tangan), jadi pembacaannya harus tahan nilai liar.
import { describe, expect, it } from "vitest";
import { FILTER_KOSONG } from "../src/features/job-feed/filter-panel.js";
import { dariParamPencarian, keParamPencarian } from "../src/features/job-feed/filter-url.js";

describe("keParamPencarian", () => {
  it("filter kosong → query string kosong", () => {
    expect(keParamPencarian(FILTER_KOSONG).toString()).toBe("");
  });

  it("kolom dipangkas, kolom kosong dan mode 'semua' tidak ditulis", () => {
    const param = keParamPencarian({
      ...FILTER_KOSONG,
      query: "  kasir ",
      city: "   ",
      province: "Jawa Barat",
    });
    expect(param.toString()).toBe("query=kasir&province=Jawa+Barat");
  });

  it("akomodasi ditulis BERULANG dan terurut — urutan centang tidak mengubah alamat", () => {
    const a = keParamPencarian({
      ...FILTER_KOSONG,
      workMode: "remote",
      accommodations: ["ramah_screen_reader", "akses_kursi_roda"],
    });
    const b = keParamPencarian({
      ...FILTER_KOSONG,
      workMode: "remote",
      accommodations: ["akses_kursi_roda", "ramah_screen_reader"],
    });
    expect(a.toString()).toBe(b.toString());
    expect(a.getAll("accommodations")).toEqual(["akses_kursi_roda", "ramah_screen_reader"]);
    expect(a.get("workMode")).toBe("remote");
  });
});

describe("dariParamPencarian", () => {
  it("alamat tanpa parameter → filter kosong", () => {
    expect(dariParamPencarian(new URLSearchParams())).toEqual(FILTER_KOSONG);
  });

  it("pulang-pergi: nilai → alamat → nilai yang sama", () => {
    const nilai = {
      query: "data",
      city: "Bandung",
      province: "Jawa Barat",
      workMode: "hybrid" as const,
      accommodations: ["akses_kursi_roda" as const, "jam_kerja_fleksibel" as const],
    };
    expect(dariParamPencarian(keParamPencarian(nilai))).toEqual(nilai);
  });

  it("mode kerja liar → 'semua', bukan diteruskan ke server untuk ditolak", () => {
    const nilai = dariParamPencarian(new URLSearchParams("workMode=bulan"));
    expect(nilai.workMode).toBe("semua");
  });

  it("akomodasi tak dikenal dibuang, duplikat digabung", () => {
    const nilai = dariParamPencarian(
      new URLSearchParams(
        "accommodations=kursi_pijat&accommodations=akses_kursi_roda&accommodations=akses_kursi_roda",
      ),
    );
    expect(nilai.accommodations).toEqual(["akses_kursi_roda"]);
  });
});
