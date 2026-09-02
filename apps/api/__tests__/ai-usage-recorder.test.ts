// Recorder `ai_usage` (PR-043b) — sisi produsen (service) + sisi tulis
// (repository) + kontrak payload yang melintasi batas proses.
//
// AC yang dijaga berkas ini:
// - AC-3 satu peristiwa = satu job `ai-usage-record` berisi metadata biaya;
// - AC-6 enqueue yang gagal TIDAK PERNAH menggagalkan panggilan AI;
// - AC-7 job yang sama diproses dua kali tetap satu baris (P2002 ditelan);
// - AC-11 payload tertutup (`.strict()`) — tidak ada tempat bagi isi prompt.
//
// Processor worker sendiri TIDAK diuji di sini, dan itu konsekuensi yang
// disadari: `apps/worker` berjalan `--passWithNoTests`, jadi seluruh keputusan
// sengaja ditarik ke sisi api. Yang tersisa di processor hanya `parse` +
// panggil repository + log.
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  QUEUE_NAME,
  aiFeatureSchema,
  aiUsageRecordJobSchema,
  type AiUsageRecordJob,
  type QueueName,
} from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import type { AiUsagePeristiwa } from "../src/core/ai/index.js";
import {
  METRIK_ENQUEUE_GAGAL,
  createAiUsageRecorder,
  createAiUsageRepository,
} from "../src/modules/ai/index.js";
import type { EnqueueOptions, EnqueueResult } from "../src/core/queue/index.js";

const USER = "018f4c1e-0000-7000-8000-00000000aa01";
const ID_BARIS = "018f4c1e-0000-7000-8000-00000000bb02";
const SAAT = new Date("2026-08-31T05:00:00.000Z");

function peristiwa(override: Partial<AiUsagePeristiwa> = {}): AiUsagePeristiwa {
  return {
    id: ID_BARIS,
    userId: USER,
    feature: "cv_chat",
    provider: "gemini",
    tokensIn: 7,
    tokensOut: 11,
    createdAt: SAAT,
    ...override,
  };
}

/** Registry antrean palsu — permukaannya persis `Pick<QueueRegistry,"enqueue">`. */
function queuesPalsu(mode: "sukses" | "menolak" | "melempar" = "sukses") {
  const panggilan: Array<{ name: QueueName; payload: unknown; options?: EnqueueOptions }> = [];
  const enqueue = vi.fn(
    (name: QueueName, payload: unknown, options?: EnqueueOptions): Promise<EnqueueResult> => {
      panggilan.push({ name, payload, ...(options === undefined ? {} : { options }) });
      if (mode === "menolak") return Promise.reject(new Error("Redis antrean tak terjangkau"));
      if (mode === "melempar") throw new Error("koneksi antrean sudah ditutup");
      return Promise.resolve({ jobId: options?.jobId ?? null });
    },
  );
  return { queues: { enqueue }, enqueue, panggilan };
}

function rakit(mode: "sukses" | "menolak" | "melempar" = "sukses") {
  const q = queuesPalsu(mode);
  const logger = { error: vi.fn() };
  const increment = vi.fn();
  const recorder = createAiUsageRecorder({
    queues: q.queues,
    logger,
    metrics: { increment },
  });
  return { recorder, logger, increment, ...q };
}

describe("AC-3 — satu peristiwa jadi satu job `ai-usage-record`", () => {
  it("job berisi metadata biaya, jobId deterministik, dan createdAt sebagai ISO", async () => {
    const { recorder, enqueue, panggilan } = rakit();

    await recorder.catat(peristiwa());

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(panggilan[0]?.name).toBe(QUEUE_NAME.AI_USAGE_RECORD);
    expect(panggilan[0]?.payload).toEqual({
      id: ID_BARIS,
      userId: USER,
      feature: "cv_chat",
      provider: "gemini",
      tokensIn: 7,
      tokensOut: 11,
      createdAt: "2026-08-31T05:00:00.000Z",
    });
    // `jobId` deterministik = lapisan anti-duplikat PERTAMA. Ia diturunkan dari
    // id baris, bukan dari waktu atau nomor acak: dua kali enqueue peristiwa yang
    // sama harus menghasilkan id yang sama, kalau tidak lapisannya tak berguna.
    expect(panggilan[0]?.options?.jobId).toBe(`ai-usage-${ID_BARIS}`);
  });

  it("promptVersion diteruskan bila ada, dan kuncinya HILANG bila tidak", async () => {
    const { recorder, panggilan } = rakit();

    await recorder.catat(peristiwa({ promptVersion: "cv-chat.v2" }));
    await recorder.catat(peristiwa({ id: "018f4c1e-0000-7000-8000-00000000bb03" }));

    expect(panggilan[0]?.payload).toMatchObject({ promptVersion: "cv-chat.v2" });
    expect(Object.keys(panggilan[1]?.payload as object)).not.toContain("promptVersion");
  });
});

describe("AC-6 — enqueue yang gagal tidak pernah menggagalkan panggilan AI", () => {
  it.each(["menolak", "melempar"] as const)(
    "antrean yang %s: `catat` RESOLVE, error dicatat, metrik bertambah",
    async (mode) => {
      const { recorder, logger, increment } = rakit(mode);

      await expect(recorder.catat(peristiwa())).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(increment).toHaveBeenCalledWith(METRIK_ENQUEUE_GAGAL);
      expect(METRIK_ENQUEUE_GAGAL).toBe("ai_usage.enqueue_gagal");
    },
  );

  it("log kegagalan tidak menjadi tempat baru PII berkumpul", async () => {
    const { recorder, logger } = rakit("menolak");

    await recorder.catat(peristiwa());

    const konteks = logger.error.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(konteks).sort()).toEqual(["err", "feature", "provider"]);
  });

  it("tanpa sink metrik pun kegagalannya tetap ditelan — `metrics` memang opsional", async () => {
    const q = queuesPalsu("menolak");
    const logger = { error: vi.fn() };
    const recorder = createAiUsageRecorder({ queues: q.queues, logger });

    await expect(recorder.catat(peristiwa())).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("E4 — identitas cacat ditolak zod DI SISI PRODUSEN, dan tidak pernah menyentuh antrean", async () => {
    // `userId` bukan UUID adalah bug pemanggil, bukan alasan mencabut jawaban
    // dari pengguna. Yang penting: payload cacat tidak melintasi batas proses,
    // sebab di sisi konsumen ia hanya terlihat sebagai job DLQ tanpa konteks.
    const { recorder, enqueue, logger, increment } = rakit();

    await expect(recorder.catat(peristiwa({ userId: "bukan-uuid" }))).resolves.toBeUndefined();

    expect(enqueue).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith(METRIK_ENQUEUE_GAGAL);
  });
});

// ---------------------------------------------------------------------------
// Repository — satu-satunya tempat baris `ai_usage` ditulis.
// ---------------------------------------------------------------------------

function job(override: Partial<AiUsageRecordJob> = {}): AiUsageRecordJob {
  return aiUsageRecordJobSchema.parse({
    id: ID_BARIS,
    userId: USER,
    feature: "cv_chat",
    provider: "groq",
    tokensIn: 7,
    tokensOut: 11,
    createdAt: SAAT.toISOString(),
    ...override,
  });
}

/** Prisma palsu — repository hanya menyentuh `aiUsage.create` (pola retention.test.ts). */
function prismaPalsu(gagalDengan?: unknown) {
  const create = vi.fn((args: { data: Record<string, unknown> }) => {
    if (gagalDengan !== undefined) return Promise.reject(gagalDengan);
    return Promise.resolve(args.data);
  });
  return { prisma: { aiUsage: { create } } as unknown as AppPrisma, create };
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`galat ${code}`, {
    code,
    clientVersion: "5.22.0",
  });
}

describe("AC-7 — penulisan baris idempoten by construction", () => {
  it("job normal → 'ditulis', dengan createdAt panggilan AI (bukan now() worker)", async () => {
    const { prisma, create } = prismaPalsu();

    await expect(createAiUsageRepository(prisma).simpan(job())).resolves.toBe("ditulis");

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.data).toEqual({
      id: ID_BARIS,
      userId: USER,
      feature: "cv_chat",
      provider: "groq",
      tokensIn: 7,
      tokensOut: 11,
      promptVersion: null,
      createdAt: SAAT,
    });
  });

  it("promptVersion yang ada ikut tertulis; yang tidak ada menjadi NULL", async () => {
    const { prisma, create } = prismaPalsu();
    const repo = createAiUsageRepository(prisma);

    await repo.simpan(job({ promptVersion: "cv-chat.v2" }));

    expect(create.mock.calls[0]?.[0]?.data?.promptVersion).toBe("cv-chat.v2");
  });

  it("P2002 (retry membawa id yang sama) → 'duplikat', TANPA melempar, satu percobaan tulis", async () => {
    const { prisma, create } = prismaPalsu(prismaError("P2002"));

    await expect(createAiUsageRepository(prisma).simpan(job())).resolves.toBe("duplikat");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("E3 — P2003 (pemilik barisnya sudah dipurge) → 'pemilik-hilang', bukan DLQ", async () => {
    const { prisma } = prismaPalsu(prismaError("P2003"));

    await expect(createAiUsageRepository(prisma).simpan(job())).resolves.toBe("pemilik-hilang");
  });

  it.each(["P1001", "P2021"])(
    "%s DILEMPAR — kegagalan yang sesungguhnya harus tetap berisik (retry lalu DLQ)",
    async (kode) => {
      const { prisma } = prismaPalsu(prismaError(kode));

      await expect(createAiUsageRepository(prisma).simpan(job())).rejects.toMatchObject({
        code: kode,
      });
    },
  );

  it("error non-Prisma dilempar apa adanya — tidak diam-diam dianggap duplikat", async () => {
    const { prisma } = prismaPalsu(new Error("koneksi putus"));

    await expect(createAiUsageRepository(prisma).simpan(job())).rejects.toThrow("koneksi putus");
  });
});

// ---------------------------------------------------------------------------
// Kontrak payload — apa yang boleh melintasi batas proses.
// ---------------------------------------------------------------------------

describe("AC-11 — payload tertutup: tanpa isi prompt, tanpa jawaban model", () => {
  it("daftar field payload adalah metadata biaya SAJA", () => {
    // Snapshot yang disengaja: menambah field di sini menuntut keputusan sadar,
    // dan kalimat ini adalah tempat keputusan itu dibaca ulang.
    expect(Object.keys(aiUsageRecordJobSchema.shape).sort()).toEqual([
      "createdAt",
      "feature",
      "id",
      "promptVersion",
      "provider",
      "tokensIn",
      "tokensOut",
      "userId",
    ]);
  });

  it.each(["prompt", "jawaban", "messages", "reservasi"])(
    "kunci asing `%s` DITOLAK keras, bukan dibuang diam-diam",
    (kunci) => {
      // `.strict()` dan bukan `.passthrough()`: kunci yang dibuang diam-diam
      // adalah kebocoran yang lolos review berikutnya. Ditolak = job gagal =
      // DLQ = terlihat di `GET /internal/queues`.
      //
      // `reservasi` ikut diuji sebagai KAWAT PEMICU putusan D5: dedup refund
      // berbasis identitas objek hanya sah selama reservasi tidak pernah
      // melintasi batas serialisasi. Percobaan pertama menyelipkannya ke sini
      // membuat test ini merah.
      const hasil = aiUsageRecordJobSchema.safeParse({
        id: ID_BARIS,
        userId: USER,
        feature: "cv_chat",
        provider: "gemini",
        tokensIn: 1,
        tokensOut: 1,
        createdAt: SAAT.toISOString(),
        [kunci]: "rahasia pengguna",
      });

      expect(hasil.success).toBe(false);
    },
  );

  it("token negatif / pecahan / fitur asing ditolak — payload cacat tidak pernah jadi baris", () => {
    const dasar = {
      id: ID_BARIS,
      userId: USER,
      feature: "cv_chat",
      provider: "gemini",
      tokensIn: 1,
      tokensOut: 1,
      createdAt: SAAT.toISOString(),
    };
    expect(aiUsageRecordJobSchema.safeParse({ ...dasar, tokensIn: -1 }).success).toBe(false);
    expect(aiUsageRecordJobSchema.safeParse({ ...dasar, tokensOut: 1.5 }).success).toBe(false);
    expect(aiUsageRecordJobSchema.safeParse({ ...dasar, feature: "cv_chatt" }).success).toBe(false);
    expect(aiUsageRecordJobSchema.safeParse({ ...dasar, provider: "" }).success).toBe(false);
    expect(aiUsageRecordJobSchema.safeParse({ ...dasar, createdAt: "31-08-2026" }).success).toBe(
      false,
    );
  });

  it("penjaga ini tidak lulus secara hampa — payload yang benar TETAP diterima", () => {
    expect(aiUsageRecordJobSchema.safeParse(job()).success).toBe(true);
    expect(aiFeatureSchema.options.length).toBeGreaterThan(3);
  });
});
