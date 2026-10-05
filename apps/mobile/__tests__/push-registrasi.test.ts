import { describe, expect, it, vi } from "vitest";
import type { Device } from "@nawasena/schemas";

import { createRegistrasiPush } from "../src/push/registrasi";
import { denganBatas } from "../src/push/batas-waktu";

const device: Device = {
  id: "018f4c1e-0000-7000-8000-00000000aaaa",
  platform: "android",
  createdAt: "2026-10-05T00:00:00Z",
  lastSeenAt: "2026-10-05T00:00:00Z",
};
function buat() {
  const deps = {
    token: vi.fn(async (_minta: boolean): Promise<string | null> => "fcm-1"),
    daftar: vi.fn(async () => device),
    lepas: vi.fn(async () => undefined),
    cabutToken: vi.fn(async () => undefined),
  };
  const p = createRegistrasiPush(deps);
  p.akun("akun-A");
  return { deps, p };
}
describe("registrasi FCM", () => {
  it("akun baru menunggu pencabutan token akun lama sebelum mendaftar", async () => {
    const { deps, p } = buat();
    await p.daftarkan(false);
    let selesai!: () => void;
    deps.cabutToken.mockImplementationOnce(
      () =>
        new Promise<undefined>((r) => {
          selesai = () => r(undefined);
        }),
    );
    const keluar = p.lepas();
    await vi.waitFor(() => expect(deps.cabutToken).toHaveBeenCalled());
    p.akun(null);
    p.akun("akun-B");
    const masuk = p.daftarkan(false);
    expect(deps.daftar).toHaveBeenCalledTimes(1);
    selesai();
    await Promise.all([keluar, masuk]);
    expect(deps.daftar).toHaveBeenCalledTimes(2);
  });
  it("boot tidak meminta izin; tanpa izin tidak mengirim registrasi", async () => {
    const { deps, p } = buat();
    deps.token.mockResolvedValue(null);
    expect(await p.daftarkan(false)).toBeNull();
    expect(deps.token).toHaveBeenCalledWith(false);
    expect(deps.daftar).not.toHaveBeenCalled();
  });
  it("permintaan paralel single-flight; token yang sama tidak didaftarkan ulang sesi ini", async () => {
    const { deps, p } = buat();
    await Promise.all([p.daftarkan(true), p.daftarkan(true)]);
    await p.daftarkan(false);
    expect(deps.daftar).toHaveBeenCalledTimes(1);
  });
  it("rotasi token didaftarkan kembali", async () => {
    const { deps, p } = buat();
    await p.daftarkan(false);
    deps.token.mockResolvedValue("fcm-2");
    await p.daftarkan(false);
    expect(deps.daftar).toHaveBeenLastCalledWith("fcm-2");
  });
  it("registrasi gagal dapat dicoba ulang", async () => {
    const { deps, p } = buat();
    deps.daftar.mockRejectedValueOnce(new Error("offline"));
    await expect(p.daftarkan(true)).rejects.toThrow("offline");
    expect(await p.daftarkan(true)).toEqual(device);
  });
  it("jawaban akun lama dibuang setelah akun berganti", async () => {
    const { deps, p } = buat();
    let selesai!: (d: Device) => void;
    deps.daftar.mockImplementationOnce(
      () =>
        new Promise((r) => {
          selesai = r;
        }),
    );
    const kerja = p.daftarkan(false);
    await vi.waitFor(() => expect(deps.daftar).toHaveBeenCalled());
    p.akun("akun-B");
    selesai(device);
    expect(await kerja).toBeNull();
    expect(p.perangkat()).toBeNull();
  });
  it("logout menunggu registrasi, melepas perangkat, dan menolak registrasi baru", async () => {
    const { deps, p } = buat();
    let selesai!: (d: Device) => void;
    deps.daftar.mockImplementationOnce(
      () =>
        new Promise((r) => {
          selesai = r;
        }),
    );
    const kerja = p.daftarkan(false);
    await vi.waitFor(() => expect(deps.daftar).toHaveBeenCalled());
    const keluar = p.lepas();
    expect(await p.daftarkan(true)).toBeNull();
    selesai(device);
    await Promise.all([kerja, keluar]);
    expect(deps.lepas).toHaveBeenCalledWith(device.id);
    expect(deps.cabutToken).toHaveBeenCalledTimes(1);
    expect(p.perangkat()).toBeNull();
  });
  it("hapus backend gagal tetap mencabut token native dan menyelesaikan logout", async () => {
    const { deps, p } = buat();
    await p.daftarkan(false);
    deps.lepas.mockRejectedValue(new Error("offline"));
    await expect(p.lepas()).resolves.toBeUndefined();
    expect(deps.cabutToken).toHaveBeenCalled();
  });
  it("akun berikutnya bisa mendaftarkan token baru", async () => {
    const { p, deps } = buat();
    await p.daftarkan(false);
    await p.lepas();
    p.akun(null);
    p.akun("akun-B");
    await p.daftarkan(false);
    expect(deps.daftar).toHaveBeenCalledTimes(2);
  });
  it("timeout membatalkan request dan tidak menahan logout", async () => {
    await expect(
      denganBatas(
        (signal) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(new Error("dibatalkan"))),
          ),
        5,
      ),
    ).rejects.toThrow();
  });
});
