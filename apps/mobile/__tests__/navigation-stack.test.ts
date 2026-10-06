import { describe, expect, it } from "vitest";
import { tujuanStack } from "../src/navigation/tujuan-stack";
import { tujuanDeepLink } from "../src/navigation/deep-link";
import { createAntreanTautan } from "../src/navigation/antrean-tautan";

const ID = "01912345-89ab-7def-8123-456789abcdef";
describe("tujuan stack setelah migrasi", () => {
  it("tautan CV AI membuka chat di tab CV", () => {
    expect(tujuanStack(tujuanDeepLink("nawasena://cv/chat")!)).toEqual({
      screen: "Cv",
      params: { screen: "CvChat", initial: false },
    });
  });
  it.each([
    ["lowongan", "Cari", "LowonganDetail"],
    ["lamaran", "Lamaran", "LamaranDetail"],
    ["cv", "Cv", "CvEditor"],
  ] as const)("tautan %s lama membuka detail di stack tab", (path, tab, screen) => {
    const t = tujuanDeepLink(`nawasena://${path}/${ID}`)!;
    expect(tujuanStack(t)).toEqual({
      screen: tab,
      params: { screen, params: { id: ID }, initial: false },
    });
  });
  it("notifikasi tetap utility di HomeStack", () => {
    expect(tujuanStack({ layar: "Notifikasi" })).toEqual({
      screen: "Beranda",
      params: { screen: "Notifikasi", initial: false },
    });
  });
  it("cold start menunggu sesi dan wizard sebelum membuka nested screen", () => {
    const diterima: unknown[] = [];
    const antrean = createAntreanTautan((t) => diterima.push(tujuanStack(t)));
    antrean.url(`nawasena://lamaran/${ID}`);
    expect(diterima).toEqual([]);
    antrean.aturSiap(true);
    expect(diterima).toEqual([
      {
        screen: "Lamaran",
        params: { screen: "LamaranDetail", params: { id: ID }, initial: false },
      },
    ]);
    antrean.hapus();
    antrean.aturSiap(true);
    expect(diterima).toHaveLength(1);
  });
});
