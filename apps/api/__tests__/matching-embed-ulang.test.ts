// Unit test re-embed massal (PR-069b, U-29) — service + parser argumen CLI.
//
// Yang dijaga: batas `maks` dihormati (lowongan dulu, profil dari sisanya),
// mode kering tidak menyentuh antrean, job dijarakkan, dan kunci coalescing SAMA
// dengan pemicu event (job massal + suntingan pengguna = satu panggilan embed).
// Kueri "tanpa vektor" di PostgreSQL diuji di `matching-embed-ulang-db.test.ts`.
import { describe, it, expect, vi } from "vitest";
import { QUEUE_NAME } from "@nawasena/schemas";
import type { EnqueueOptions } from "../src/core/queue/index.js";
import {
  JARAK_EMBED_ULANG_MS,
  createEmbedUlangService,
  kunciEmbedding,
  maksEmbedUlangBawaan,
  type EmbedUlangDeps,
} from "../src/modules/matching/index.js";
import { ArgumenTidakValidError, bacaArgumenEmbedUlang } from "../scripts/embed-ulang-argumen.js";

const LOWONGAN = ["018f4c1e-0000-7000-8000-00000000j001", "018f4c1e-0000-7000-8000-00000000j002"];
const PROFIL = [
  "018f4c1e-0000-7000-8000-00000000u001",
  "018f4c1e-0000-7000-8000-00000000u002",
  "018f4c1e-0000-7000-8000-00000000u003",
];

function boot(opsi: { tanpaKurator?: number } = {}) {
  const repo = {
    cariLowonganTanpaVektor: vi.fn((batas: number) => Promise.resolve(LOWONGAN.slice(0, batas))),
    cariProfilTanpaVektor: vi.fn((batas: number) => Promise.resolve(PROFIL.slice(0, batas))),
    hitungLowonganTanpaKurator: vi.fn(() => Promise.resolve(opsi.tanpaKurator ?? 0)),
  } satisfies EmbedUlangDeps["repo"];
  const antrean: Array<{ queue: string; payload: unknown; opsi?: EnqueueOptions }> = [];
  const queues = {
    enqueue: vi.fn((queue: string, payload: unknown, o?: EnqueueOptions) => {
      antrean.push({ queue, payload, opsi: o });
      return Promise.resolve({ jobId: null });
    }),
  };
  return { service: createEmbedUlangService({ repo, queues }), repo, antrean };
}

describe("maksEmbedUlangBawaan", () => {
  it("25% pagu global (keputusan owner) — bawaan 1.200 → 300", () => {
    expect(maksEmbedUlangBawaan(1_200)).toBe(300);
    expect(maksEmbedUlangBawaan(0)).toBe(0);
  });
});

describe("createEmbedUlangService", () => {
  it("lowongan DULU, profil dari sisa batas; dijarakkan; kunci coalescing sama dengan pemicu", async () => {
    const { service, repo, antrean } = boot();

    const laporan = await service.jalankan({
      jenis: "semua",
      maks: 4,
      kering: false,
      jarakMs: 1_000,
    });

    expect(repo.cariLowonganTanpaVektor).toHaveBeenCalledWith(4);
    expect(repo.cariProfilTanpaVektor).toHaveBeenCalledWith(2);
    expect(antrean.map((a) => a.payload)).toEqual([
      { jenis: "lowongan", jobId: LOWONGAN[0] },
      { jenis: "lowongan", jobId: LOWONGAN[1] },
      { jenis: "profil", userId: PROFIL[0] },
      { jenis: "profil", userId: PROFIL[1] },
    ]);
    expect(antrean.every((a) => a.queue === QUEUE_NAME.AI_EMBED)).toBe(true);
    expect(antrean.map((a) => a.opsi?.delayMs)).toEqual([0, 1_000, 2_000, 3_000]);
    expect(antrean[2]?.opsi?.coalesceId).toBe(
      kunciEmbedding({ jenis: "profil", userId: PROFIL[0]! }),
    );
    expect(laporan).toEqual({
      kering: false,
      maks: 4,
      lowongan: { dipilih: 2, tanpaKurator: 0 },
      profil: { dipilih: 2 },
      mungkinMasihAda: true,
    });
  });

  it("mode kering: melapor jumlah yang SAMA, antrean tidak disentuh", async () => {
    const { service, antrean } = boot({ tanpaKurator: 5 });

    const laporan = await service.jalankan({ jenis: "semua", maks: 300, kering: true, jarakMs: 0 });

    expect(antrean).toEqual([]);
    expect(laporan).toMatchObject({
      kering: true,
      lowongan: { dipilih: 2, tanpaKurator: 5 },
      profil: { dipilih: 3 },
      mungkinMasihAda: false,
    });
  });

  it("--jenis=profil tidak membaca lowongan; --jenis=lowongan tidak membaca profil", async () => {
    const a = boot();
    await a.service.jalankan({ jenis: "profil", maks: 10, kering: true, jarakMs: 0 });
    expect(a.repo.cariLowonganTanpaVektor).not.toHaveBeenCalled();
    expect(a.repo.hitungLowonganTanpaKurator).not.toHaveBeenCalled();

    const b = boot();
    await b.service.jalankan({ jenis: "lowongan", maks: 10, kering: true, jarakMs: 0 });
    expect(b.repo.cariProfilTanpaVektor).not.toHaveBeenCalled();
  });

  it("maks 0 (AI dimatikan lewat pagu 0) → tidak ada yang dicari, tidak ada yang diantrekan", async () => {
    const { service, repo, antrean } = boot();
    const laporan = await service.jalankan({ jenis: "semua", maks: 0, kering: false, jarakMs: 0 });
    expect(repo.cariLowonganTanpaVektor).not.toHaveBeenCalled();
    expect(repo.cariProfilTanpaVektor).not.toHaveBeenCalled();
    expect(antrean).toEqual([]);
    expect(laporan.mungkinMasihAda).toBe(false);
  });
});

describe("bacaArgumenEmbedUlang", () => {
  const BAWAAN = { maks: 300, jarakMs: JARAK_EMBED_ULANG_MS };

  it("tanpa argumen → bawaan", () => {
    expect(bacaArgumenEmbedUlang([], BAWAAN)).toEqual({
      bantuan: false,
      opsi: { jenis: "semua", maks: 300, kering: false, jarakMs: 1_000 },
    });
  });

  it("membaca semua opsi, mengabaikan pemisah `--` dari pnpm", () => {
    expect(
      bacaArgumenEmbedUlang(
        ["--", "--jenis=lowongan", "--maks=20", "--jarak-ms=0", "--kering"],
        BAWAAN,
      ),
    ).toEqual({ bantuan: false, opsi: { jenis: "lowongan", maks: 20, kering: true, jarakMs: 0 } });
    expect(bacaArgumenEmbedUlang(["--bantuan"], BAWAAN)).toEqual({ bantuan: true });
  });

  it.each([
    ["--maks=-1"],
    ["--maks=abc"],
    ["--maks="],
    ["--jenis=semuanya"],
    ["--paksa"],
    ["lowongan"],
  ])("%s → ArgumenTidakValidError (bukan diam-diam memakai bawaan)", (arg) => {
    expect(() => bacaArgumenEmbedUlang([arg], BAWAAN)).toThrow(ArgumenTidakValidError);
  });
});
