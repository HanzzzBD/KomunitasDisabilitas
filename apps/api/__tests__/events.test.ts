// Unit bus event domain (PR-024b).
//
// Yang diuji di sini adalah SIFAT-SIFAT yang membuat bus ini aman dipakai
// penerbit yang sudah menulis ke database. Ketiganya gagal secara diam bila
// salah: pelanggan yang melempar akan menjatuhkan job yang pekerjaannya sudah
// benar, dan pengulangan job itu menerbitkan event yang sama lagi.
import { describe, it, expect, vi } from "vitest";
import { createEventBus, type EventBus } from "../src/core/events/index.js";
import type { JobClosedEvent } from "@nawasena/schemas";

const CONTOH: JobClosedEvent = {
  jobId: "018f4c1e-0000-7000-8000-00000000aaaa",
  closedAt: "2026-08-08T00:00:00.000Z",
  reason: "expired",
};

function rakit(): { bus: EventBus; error: ReturnType<typeof vi.fn> } {
  const error = vi.fn();
  return { bus: createEventBus({ logger: { error } }), error };
}

describe("bus event — pengiriman", () => {
  it("pelanggan menerima payload apa adanya", () => {
    const { bus } = rakit();
    const diterima: JobClosedEvent[] = [];
    bus.on("job.closed", (p) => {
      diterima.push(p);
    });

    bus.emit("job.closed", CONTOH);

    expect(diterima).toEqual([CONTOH]);
  });

  it("semua pelanggan menerima, bukan hanya yang pertama", () => {
    const { bus } = rakit();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("job.closed", a);
    bus.on("job.closed", b);

    bus.emit("job.closed", CONTOH);

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("event tanpa pelanggan tidak melempar apa pun", () => {
    // Hari ini `job.closed` memang belum punya pelanggan. Penerbit tidak boleh
    // peduli — dan tidak boleh punya cara mengetahuinya.
    const { bus } = rakit();

    expect(() => bus.emit("job.closed", CONTOH)).not.toThrow();
  });

  it("emit tidak mengembalikan apa pun", () => {
    const { bus } = rakit();
    bus.on("job.closed", () => {});

    expect(bus.emit("job.closed", CONTOH)).toBeUndefined();
  });
});

describe("bus event — pelanggan tidak pernah menjatuhkan penerbit", () => {
  it("pelanggan yang melempar sinkron dicatat, tidak diteruskan", () => {
    // Saat `job.closed` terbit, lowongannya SUDAH tertutup di database.
    // Melempar ke penerbit akan membatalkan pekerjaan yang sudah benar.
    const { bus, error } = rakit();
    bus.on("job.closed", () => {
      throw new Error("pelanggan rusak");
    });

    expect(() => bus.emit("job.closed", CONTOH)).not.toThrow();
    expect(error).toHaveBeenCalledOnce();
  });

  it("pelanggan yang gagal tidak menghalangi pelanggan berikutnya", () => {
    const { bus } = rakit();
    const kedua = vi.fn();
    bus.on("job.closed", () => {
      throw new Error("rusak");
    });
    bus.on("job.closed", kedua);

    bus.emit("job.closed", CONTOH);

    expect(kedua).toHaveBeenCalledOnce();
  });

  it("promise pelanggan async yang ditolak ikut ditangkap", async () => {
    // Tanpa `.catch`, ini menjadi unhandled rejection — kegagalan satu
    // pelanggan menjatuhkan SELURUH proses worker.
    const { bus, error } = rakit();
    bus.on("job.closed", () => Promise.reject(new Error("gagal async")));

    bus.emit("job.closed", CONTOH);
    await new Promise((r) => setTimeout(r, 0));

    expect(error).toHaveBeenCalledOnce();
  });

  it("penerbit tidak menunggu pelanggan async selesai", async () => {
    const { bus } = rakit();
    let selesai = false;
    bus.on("job.closed", async () => {
      await new Promise((r) => setTimeout(r, 20));
      selesai = true;
    });

    bus.emit("job.closed", CONTOH);

    // Penerbit sudah lanjut; pelanggan masih berjalan.
    expect(selesai).toBe(false);
  });
});

describe("bus event — langganan", () => {
  it("membatalkan langganan menghentikan pengiriman", () => {
    const { bus } = rakit();
    const handler = vi.fn();
    const batal = bus.on("job.closed", handler);

    batal();
    bus.emit("job.closed", CONTOH);

    expect(handler).not.toHaveBeenCalled();
  });

  it("membatalkan dua kali tidak melempar", () => {
    const { bus } = rakit();
    const batal = bus.on("job.closed", vi.fn());
    batal();

    expect(() => batal()).not.toThrow();
  });

  it("pelanggan yang membatalkan dirinya di dalam handler tidak melewatkan yang lain", () => {
    // Daftar yang diiterasi langsung akan bergeser saat elemen dihapus di
    // tengah jalan, dan pelanggan berikutnya terlewat tanpa gejala apa pun.
    const { bus } = rakit();
    const kedua = vi.fn();
    let batal: () => void = () => {};
    batal = bus.on("job.closed", () => batal());
    bus.on("job.closed", kedua);

    bus.emit("job.closed", CONTOH);

    expect(kedua).toHaveBeenCalledOnce();
  });

  it("jumlahPelanggan mencerminkan keadaan sekarang", () => {
    const { bus } = rakit();
    expect(bus.jumlahPelanggan("job.closed")).toBe(0);

    const batal = bus.on("job.closed", vi.fn());
    expect(bus.jumlahPelanggan("job.closed")).toBe(1);

    batal();
    expect(bus.jumlahPelanggan("job.closed")).toBe(0);
  });
});
