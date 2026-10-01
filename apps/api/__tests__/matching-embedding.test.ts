// Unit test pipeline embedding (PR-069) — penyusun teks, service, dan pemicu.
//
// Yang dijaga di sini, per AC:
//   - teks embed TIDAK memuat data sensitif, bahkan bila objek masukannya
//     kebetulan membawanya (tipe struktural TypeScript mengizinkan itu);
//   - Gemini gagal → service MELEMPAR (BullMQ yang mengulang), tanpa vektor
//     pengganti dan tanpa menimpa vektor lama;
//   - skor dibuang SEBELUM AI disentuh, jadi kegagalan AI tidak menyisakan skor basi;
//   - pemicu meng-enqueue dengan kunci coalescing per entitas.
// Alur nyata (PostgreSQL + Redis) ada di `matching-embedding-db.test.ts`.
import { describe, it, expect, vi } from "vitest";
import { QUEUE_NAME, type AiEmbedJob } from "@nawasena/schemas";
import { AI_EMBED_DIMENSIONS, AiProviderError } from "../src/core/ai/index.js";
import type { EnqueueOptions } from "../src/core/queue/index.js";
import {
  BATAS_TEKS_EMBEDDING,
  DIMENSI_KOLOM_VEKTOR,
  JEDA_EMBED_MS,
  createEmbeddingService,
  daftarkanPemicuEmbedding,
  kunciEmbedding,
  teksLowongan,
  teksProfil,
  type EmbeddingServiceDeps,
  type ProfilUntukEmbedding,
  type SumberLowongan,
} from "../src/modules/matching/index.js";
import { busUji } from "./helpers/events.js";

const USER = "018f4c1e-0000-7000-8000-0000000000a1";
const KURATOR = "018f4c1e-0000-7000-8000-0000000000ad";
const JOB = "018f4c1e-0000-7000-8000-000000000j01";

const PROFIL: ProfilUntukEmbedding = {
  profil: { headline: "Admin gudang berpengalaman", summary: "Rapi dan  teliti." },
  keahlian: [
    { name: "Microsoft Excel", level: "mahir" },
    { name: "Inventaris", level: null },
  ],
  pengalaman: [{ title: "Staf Gudang", company: "PT Maju", description: "Mencatat stok harian" }],
  pendidikan: [{ institution: "SMK Negeri 4", degree: "SMK", field: "Akuntansi" }],
};

const LOWONGAN: SumberLowongan = {
  title: "Staf Administrasi",
  description: "Mengelola dokumen",
  requirements: "Menguasai Excel",
  createdBy: KURATOR,
};

describe("teksProfil / teksLowongan — penyusun teks embedding", () => {
  it("merangkai bagian bermakna, sinyal terkuat lebih dulu", () => {
    expect(teksProfil(PROFIL)).toBe(
      [
        "Judul profil: Admin gudang berpengalaman",
        "Keahlian: Microsoft Excel (mahir), Inventaris",
        "Ringkasan: Rapi dan teliti.",
        "Pengalaman: Staf Gudang di PT Maju. Mencatat stok harian",
        "Pendidikan: SMK, Akuntansi, SMK Negeri 4",
      ].join("\n"),
    );
    expect(teksLowongan(LOWONGAN)).toBe(
      "Posisi: Staf Administrasi\nPersyaratan: Menguasai Excel\nDeskripsi: Mengelola dokumen",
    );
  });

  it("AC: teks TIDAK memuat data sensitif walau objeknya menyelundupkannya", () => {
    // Objek "kotor": membawa kolom sensitif profil DAN field lowongan yang
    // disengaja tidak ikut (akomodasi, ragam disabilitas disambut, lokasi).
    const kotor = {
      ...PROFIL,
      profil: {
        ...PROFIL.profil,
        city: "Bandung",
        openToRemote: true,
        disabilityTypes: ["netra"],
        accommodationNeeds: { items: ["ramah_screen_reader"], notes: "RAHASIA-CATATAN" },
      },
      disabilityTypes: ["daksa"],
    } as unknown as ProfilUntukEmbedding;
    const teks = teksProfil(kotor);
    for (const terlarang of [
      "netra",
      "daksa",
      "ramah_screen_reader",
      "RAHASIA-CATATAN",
      "Bandung",
      "remote",
    ]) {
      expect(teks.toLowerCase()).not.toContain(terlarang.toLowerCase());
    }

    const lowonganKotor = {
      ...LOWONGAN,
      accommodations: ["juru_bahasa_isyarat"],
      welcomedDisabilityTypes: ["tuli"],
      city: "Surabaya",
      workMode: "remote",
    } as unknown as SumberLowongan;
    const teksJob = teksLowongan(lowonganKotor);
    for (const terlarang of ["juru_bahasa_isyarat", "tuli", "Surabaya", "remote", KURATOR]) {
      expect(teksJob).not.toContain(terlarang);
    }
  });

  it("profil tanpa isi bermakna → string kosong", () => {
    expect(
      teksProfil({
        profil: { headline: "  ", summary: null },
        keahlian: [],
        pengalaman: [],
        pendidikan: [],
      }),
    ).toBe("");
  });

  it("teks sangat panjang dipotong di batas, bukan ditolak", () => {
    const panjang = teksLowongan({ ...LOWONGAN, description: "kata ".repeat(5_000) });
    expect(panjang.length).toBeLessThanOrEqual(BATAS_TEKS_EMBEDDING);
    expect(panjang.startsWith("Posisi: Staf Administrasi")).toBe(true);
  });
});

describe("DIMENSI_KOLOM_VEKTOR", () => {
  it("sama dengan dimensi yang diminta adapter AI", () => {
    expect(DIMENSI_KOLOM_VEKTOR).toBe(AI_EMBED_DIMENSIONS);
  });
});

function vektor(): number[] {
  return Array.from({ length: AI_EMBED_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));
}

function fakeRepo() {
  const log: string[] = [];
  const repo: EmbeddingServiceDeps["repo"] = {
    simpanVektorProfil: vi.fn((_id: string, v: readonly number[] | null) => {
      log.push(v === null ? "kosongkan-profil" : "simpan-profil");
      return Promise.resolve(true);
    }),
    simpanVektorLowongan: vi.fn((_id: string, v: readonly number[] | null) => {
      log.push(v === null ? "kosongkan-lowongan" : "simpan-lowongan");
      return Promise.resolve(true);
    }),
    hapusSkorPengguna: vi.fn(() => {
      log.push("hapus-skor-pengguna");
      return Promise.resolve(3);
    }),
    hapusSkorLowongan: vi.fn(() => {
      log.push("hapus-skor-lowongan");
      return Promise.resolve(0);
    }),
  };
  return { repo, log };
}

function boot(opsi: {
  profil?: ProfilUntukEmbedding | null;
  lowongan?: SumberLowongan | null;
  embed?: () => Promise<{ vector: number[]; dimensions: number; provider: string; model: string }>;
}) {
  const { repo, log } = fakeRepo();
  const embed = vi.fn(
    opsi.embed ??
      (() =>
        Promise.resolve({
          vector: vektor(),
          dimensions: AI_EMBED_DIMENSIONS,
          provider: "gemini",
          model: "gemini-embedding-001",
        })),
  );
  const logger = { error: vi.fn() };
  const service = createEmbeddingService({
    repo,
    ai: { embed },
    bacaProfil: () => Promise.resolve(opsi.profil === undefined ? PROFIL : opsi.profil),
    bacaLowongan: () => Promise.resolve(opsi.lowongan === undefined ? LOWONGAN : opsi.lowongan),
    logger,
  });
  return { service, repo, log, embed, logger };
}

const JOB_PROFIL: AiEmbedJob = { jenis: "profil", userId: USER };
const JOB_LOWONGAN: AiEmbedJob = { jenis: "lowongan", jobId: JOB };

describe("createEmbeddingService — profil", () => {
  it("AC: skor dibuang DULU, lalu embed atas nama pemiliknya, lalu vektor disimpan", async () => {
    const { service, log, embed, repo } = boot({});

    expect(await service.jalankan(JOB_PROFIL)).toEqual({ status: "tersimpan" });
    expect(log).toEqual(["hapus-skor-pengguna", "simpan-profil"]);
    expect(embed).toHaveBeenCalledWith(
      { userId: USER, feature: "embed" },
      { text: teksProfil(PROFIL) },
    );
    expect(repo.simpanVektorProfil).toHaveBeenCalledWith(USER, vektor());
  });

  it("AC: Gemini tumbang → MELEMPAR (untuk di-retry BullMQ); skor tetap dibuang, vektor lama tidak disentuh", async () => {
    const { service, log } = boot({
      embed: () => Promise.reject(new AiProviderError("AI_PROVIDER_UNAVAILABLE", "gemini")),
    });

    await expect(service.jalankan(JOB_PROFIL)).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });
    expect(log).toEqual(["hapus-skor-pengguna"]);
  });

  it("profil tidak ada → dilewati tanpa panggilan AI", async () => {
    const { service, embed } = boot({ profil: null });
    expect(await service.jalankan(JOB_PROFIL)).toEqual({ status: "dilewati", alasan: "tidak-ada" });
    expect(embed).not.toHaveBeenCalled();
  });

  it("profil dikosongkan pemiliknya → vektor lama DIKOSONGKAN, tanpa AI", async () => {
    const { service, embed, log } = boot({
      profil: {
        profil: { headline: null, summary: null },
        keahlian: [],
        pengalaman: [],
        pendidikan: [],
      },
    });
    expect(await service.jalankan(JOB_PROFIL)).toEqual({ status: "dikosongkan" });
    expect(embed).not.toHaveBeenCalled();
    expect(log).toEqual(["hapus-skor-pengguna", "kosongkan-profil"]);
  });
});

describe("createEmbeddingService — lowongan", () => {
  it("jatah AI dipikul kurator pembuatnya (keputusan owner 2026-09-30)", async () => {
    const { service, embed, log } = boot({});

    expect(await service.jalankan(JOB_LOWONGAN)).toEqual({ status: "tersimpan" });
    expect(embed).toHaveBeenCalledWith(
      { userId: KURATOR, feature: "embed" },
      { text: teksLowongan(LOWONGAN) },
    );
    expect(log).toEqual(["hapus-skor-lowongan", "simpan-lowongan"]);
  });

  it("lowongan tidak aktif → dilewati", async () => {
    const { service, embed } = boot({ lowongan: null });
    expect(await service.jalankan(JOB_LOWONGAN)).toEqual({
      status: "dilewati",
      alasan: "tidak-aktif",
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it("tanpa kurator → dilewati + log error (tidak ada yang bisa memikul kuota)", async () => {
    const { service, embed, logger } = boot({ lowongan: { ...LOWONGAN, createdBy: null } });
    expect(await service.jalankan(JOB_LOWONGAN)).toEqual({
      status: "dilewati",
      alasan: "tanpa-pemilik",
    });
    expect(embed).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("kuota habis → MELEMPAR, tidak ada vektor pengganti", async () => {
    const { service, log } = boot({
      embed: () => Promise.reject(new AiProviderError("AI_RATE_LIMIT", "gemini")),
    });
    await expect(service.jalankan(JOB_LOWONGAN)).rejects.toBeInstanceOf(AiProviderError);
    expect(log).toEqual(["hapus-skor-lowongan"]);
  });
});

describe("daftarkanPemicuEmbedding — event → enqueue ai-embed", () => {
  function pasang() {
    const events = busUji();
    const panggilan: Array<{ queue: string; payload: unknown; opsi: EnqueueOptions | undefined }> =
      [];
    const queues = {
      enqueue: vi.fn((queue: string, payload: unknown, opsi?: EnqueueOptions) => {
        panggilan.push({ queue, payload, opsi });
        return Promise.resolve({ jobId: null });
      }),
    };
    daftarkanPemicuEmbedding({ events, queues });
    return { events, panggilan };
  }

  const tunggu = () => new Promise((r) => setTimeout(r, 0));

  it("profile.updated → job profil ber-coalesceId + jeda", async () => {
    const { events, panggilan } = pasang();
    events.emit("profile.updated", {
      userId: USER,
      section: "skills",
      updatedAt: "2026-09-30T00:00:00.000Z",
    });
    await tunggu();

    expect(panggilan).toEqual([
      {
        queue: QUEUE_NAME.AI_EMBED,
        payload: { jenis: "profil", userId: USER },
        opsi: { delayMs: JEDA_EMBED_MS, coalesceId: `embed-profil-${USER}` },
      },
    ]);
  });

  it("job.published DAN job.updated → job lowongan dengan kunci yang SAMA", async () => {
    const { events, panggilan } = pasang();
    events.emit("job.published", {
      jobId: JOB,
      companyId: KURATOR,
      publishedAt: "2026-09-30T00:00:00.000Z",
    });
    events.emit("job.updated", {
      jobId: JOB,
      companyId: KURATOR,
      updatedAt: "2026-09-30T00:00:00.000Z",
    });
    await tunggu();

    expect(panggilan.map((p) => p.payload)).toEqual([
      { jenis: "lowongan", jobId: JOB },
      { jenis: "lowongan", jobId: JOB },
    ]);
    expect(new Set(panggilan.map((p) => p.opsi?.coalesceId))).toEqual(
      new Set([kunciEmbedding({ jenis: "lowongan", jobId: JOB })]),
    );
  });

  it("kunci profil dan lowongan tidak pernah bertabrakan, dan tanpa ':' (dilarang BullMQ)", () => {
    const sama = "018f4c1e-0000-7000-8000-000000000999";
    const a = kunciEmbedding({ jenis: "profil", userId: sama });
    const b = kunciEmbedding({ jenis: "lowongan", jobId: sama });
    expect(a).not.toBe(b);
    expect(`${a}${b}`).not.toContain(":");
  });
});
