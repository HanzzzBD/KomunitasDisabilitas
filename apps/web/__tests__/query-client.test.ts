// Angka-angka di sini datang dari SDD §4.1 dan ADR-009, bukan dari selera.
// Test ini mengunci kontraknya supaya perubahannya harus disengaja — setelan
// query yang bergeser diam-diam mengubah perilaku SETIAP layar sekaligus.
import { describe, expect, it } from "vitest";
import {
  MAKS_RETRY,
  STALE_TIME_MS,
  createQueryClient,
  jedaRetryMs,
} from "../src/app/query-client.js";

describe("createQueryClient — kontrak SDD §4.1", () => {
  it("staleTime 60 detik dan retry 2", () => {
    const bawaan = createQueryClient().getDefaultOptions().queries;
    expect(bawaan?.staleTime).toBe(60_000);
    expect(bawaan?.retry).toBe(2);
    expect(STALE_TIME_MS).toBe(60_000);
    expect(MAKS_RETRY).toBe(2);
  });

  it("networkMode 'online' — ADR-009, mutasi & query ditahan saat offline", () => {
    // Bedanya penting bagi pengguna: "ditahan" dan "gagal" menuntut tindakan
    // yang berbeda. Ini yang membuat banner offline (PR-025c) jujur.
    const opsi = createQueryClient().getDefaultOptions();
    expect(opsi.queries?.networkMode).toBe("online");
    expect(opsi.mutations?.networkMode).toBe("online");
  });

  it("mutasi TIDAK di-retry otomatis", () => {
    // Melamar dan menghapus akun tidak idempoten; mengulangnya diam-diam bisa
    // menciptakan aksi ganda yang tidak pernah diminta pengguna.
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(0);
  });

  it("tidak memuat ulang saat jendela kembali fokus", () => {
    // Bawaan TanStack Query adalah true. Dimatikan sadar: konten yang berubah
    // sendiri saat pengguna kembali menghilangkan konteks yang sedang dibaca
    // screen reader.
    expect(createQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it("backoff naik lalu berhenti di batas", () => {
    expect(jedaRetryMs(0)).toBe(1000);
    expect(jedaRetryMs(1)).toBe(2000);
    expect(jedaRetryMs(2)).toBe(4000);
    // Berbatas, supaya jeda tidak tumbuh tak terhingga bila kelak retry dinaikkan.
    expect(jedaRetryMs(20)).toBe(30_000);
  });

  it("tiap panggilan menghasilkan klien BARU (cache test tidak bocor)", () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});
