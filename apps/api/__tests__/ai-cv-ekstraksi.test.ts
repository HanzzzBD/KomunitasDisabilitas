// Ekstraksi transkrip → draft CV (PR-067) — unit service worker.
//
// AC phase-10 PR-067 yang dijaga di sini:
//   - output valid → draft resume tersimpan untuk review (created_via ai_chat)
//   - invalid 1× → retry dengan feedback; 2× → fallback manual (tidak buntu)
//   - tidak ada draft gagal-schema tersimpan
//   - notifikasi "draft CV siap direview" (dan "gagal")
//   - idempoten per sesi
// Transisi status di PostgreSQL sungguhan ada di `ai-cv-finalize-db.test.ts`.
import { describe, it, expect } from "vitest";
import type { AiExtractResumeJob, ResumeContent } from "@nawasena/schemas";
import {
  AiProviderError,
  cvExtractorV1,
  PENANDA_AWAL,
  type AiCallContext,
} from "../src/core/ai/index.js";
import { appError } from "../src/core/http/index.js";
import {
  createCvEkstraksiService,
  formatPercakapan,
  type CvTujuan,
  type PenerbitNotifikasi,
} from "../src/modules/ai/index.js";
import { repoSesiMemori } from "./helpers/chat-sessions-memori.js";

const U = "018f4c1e-0000-7000-8000-00000000aaaa";
const S = "018f4c1e-0000-7000-8000-0000000000a1";
const WAKTU = new Date("2026-09-28T03:00:00.000Z");

const job: AiExtractResumeJob = {
  sessionId: S,
  userId: U,
  reservasi: {
    hari: "2026-09-28",
    userId: U,
    feature: "cv_finalize",
    tercatat: true,
    global: true,
  },
};

const VALID = {
  headline: "Kasir berpengalaman",
  summary: "Saya kasir teliti selama dua tahun.",
  experiences: [
    {
      title: "Kasir",
      company: "Toko Roti Maju",
      startDate: "2022-01-01",
      endDate: "2024-01-01",
      description: null,
    },
  ],
  educations: [],
  skills: [{ name: "Melayani pembeli", level: null }],
  certifications: [],
  organizations: [],
};

/** Sesi `finalizing` dengan transkrip dua giliran. */
async function siapkan() {
  const repo = repoSesiMemori();
  await repo.createOrGetActive(U, S, WAKTU);
  const batas = { maxTurns: 120, maxTranscriptBytes: 1_000_000 };
  await repo.appendTurn(
    U,
    S,
    { role: "assistant", content: "Apa pekerjaan terakhir Anda?", at: WAKTU },
    batas,
  );
  await repo.appendTurn(
    U,
    S,
    { role: "user", content: "Kasir di Toko Roti Maju, 2022 sampai 2024.", at: WAKTU },
    batas,
  );
  await repo.mulaiFinalisasi(U, S, WAKTU);
  return repo;
}

/** AI palsu: menjawab dari antrean jawaban (nilai atau error), mencatat panggilan. */
function aiPalsu(jawaban: unknown[]) {
  const panggilan: Array<{
    ctx: AiCallContext;
    input: { perbaikan: string | null; percakapan: string };
  }> = [];
  return {
    panggilan,
    ai: {
      prompt: (ctx: AiCallContext, _t: unknown, input: unknown) => {
        panggilan.push({ ctx, input: input as { perbaikan: string | null; percakapan: string } });
        const j = jawaban.shift();
        return j instanceof Error
          ? Promise.reject(j)
          : Promise.resolve({ data: j, dariCache: false });
      },
    } as never,
  };
}

function cvPalsu(opsi: { sudahAda?: boolean; penuh?: boolean } = {}) {
  const dibuat: Array<{ id: string; content: ResumeContent; createdVia: string; title: string }> =
    [];
  const tujuan: CvTujuan = {
    get: (_a, id) =>
      opsi.sudahAda === true || dibuat.some((c) => c.id === id)
        ? Promise.resolve({ id })
        : Promise.reject(appError("CV_TIDAK_DITEMUKAN")),
    create: (_a, input, createdVia, o) => {
      if (opsi.penuh === true) return Promise.reject(appError("BATAS_CV_TERCAPAI"));
      dibuat.push({ id: o.id, content: input.content, createdVia, title: input.title });
      return Promise.resolve({ id: o.id });
    },
  };
  return { tujuan, dibuat };
}

function notifPalsu() {
  const terbit: Array<{ type: string; kunciPeristiwa: string }> = [];
  const n: PenerbitNotifikasi = {
    terbitkan: (o) => {
      terbit.push({ type: o.type, kunciPeristiwa: o.kunciPeristiwa });
      return Promise.resolve(true);
    },
  };
  return { n, terbit };
}

async function rakit(jawaban: unknown[], cvOpsi: { sudahAda?: boolean; penuh?: boolean } = {}) {
  const repo = await siapkan();
  const { ai, panggilan } = aiPalsu(jawaban);
  const { tujuan, dibuat } = cvPalsu(cvOpsi);
  const { n, terbit } = notifPalsu();
  const dikembalikan: string[] = [];
  const service = createCvEkstraksiService({
    repo,
    ai,
    quota: {
      kembalikanBila: (_r, err) => {
        dikembalikan.push(err instanceof AiProviderError ? err.code : "?");
        return Promise.resolve();
      },
    },
    resumes: tujuan,
    notifikasi: n,
    template: cvExtractorV1,
    logger: { warn: () => undefined, error: () => undefined },
    clock: () => WAKTU,
  });
  const sesi = () => repo.baris.get(S);
  return { service, panggilan, dibuat, terbit, dikembalikan, sesi };
}

describe("keluaran valid → draft tersimpan untuk review", () => {
  it("draft ai_chat ber-id sesi, sesi finalized + resumeId, satu notifikasi siap", async () => {
    const t = await rakit([VALID]);
    const hasil = await t.service.jalankan(job, { percobaanTerakhir: false });

    expect(hasil).toEqual({ status: "draft", resumeId: S, percobaanLlm: 1 });
    expect(t.dibuat).toHaveLength(1);
    expect(t.dibuat[0]).toMatchObject({ id: S, createdVia: "ai_chat" });
    expect(t.dibuat[0]?.title).toMatch(/^CV dari percakapan AI \(28 September 2026\)$/);
    expect(t.dibuat[0]?.content.experiences[0]).toMatchObject({
      title: "Kasir",
      company: "Toko Roti Maju",
    });
    expect(t.sesi()).toMatchObject({ status: "finalized", resumeId: S, finalizedAt: WAKTU });
    expect(t.terbit).toEqual([{ type: "resume.draft_ai_siap", kunciPeristiwa: `${S}:siap` }]);
  });

  it("jatah yang SUDAH dipotong API diteruskan — panggilan LLM tidak memotong lagi", async () => {
    const t = await rakit([VALID]);
    await t.service.jalankan(job, { percobaanTerakhir: false });
    expect(t.panggilan[0]?.ctx).toMatchObject({ feature: "cv_finalize", reservasi: job.reservasi });
  });

  it("kontak dari model DIBUANG; schemaVersion milik kita", async () => {
    const t = await rakit([
      { ...VALID, contact: { email: "x@contoh.id", phone: "+6281234567890" }, schemaVersion: 99 },
    ]);
    await t.service.jalankan(job, { percobaanTerakhir: false });
    expect(t.dibuat[0]?.content.contact).toEqual({
      email: null,
      phone: null,
      city: null,
      province: null,
      links: [],
    });
    expect(t.dibuat[0]?.content.schemaVersion).toBe(1);
  });

  it("transkrip masuk prompt sebagai DATA terbungkus, bukan instruksi", async () => {
    const t = await rakit([VALID]);
    await t.service.jalankan(job, { percobaanTerakhir: false });
    const { messages } = cvExtractorV1.bangun({ ...t.panggilan[0]!.input, tahunSekarang: 2026 });
    expect(messages.at(-1)?.content).toContain(PENANDA_AWAL);
    expect(t.panggilan[0]?.input.percakapan).toContain("Pengguna: Kasir di Toko Roti Maju");
  });
});

describe("retry-with-feedback", () => {
  it("invalid 1× → percobaan kedua membawa daftar masalah → sukses", async () => {
    const rusak = {
      ...VALID,
      experiences: [{ title: "", startDate: "2024-05-01", endDate: "2023-01-01" }],
    };
    const t = await rakit([rusak, VALID]);
    const hasil = await t.service.jalankan(job, { percobaanTerakhir: false });

    expect(hasil).toMatchObject({ status: "draft", percobaanLlm: 2 });
    expect(t.panggilan[0]?.input.perbaikan).toBeNull();
    expect(t.panggilan[1]?.input.perbaikan).toContain("experiences.0.title");
    expect(t.panggilan[1]?.input.perbaikan).toContain("experiences.0.endDate");
  });

  it("keluaran bukan JSON (AI_INVALID_OUTPUT) diperlakukan sebagai keluaran rusak, bukan provider tumbang", async () => {
    const t = await rakit([new AiProviderError("AI_INVALID_OUTPUT", "gemini"), VALID]);
    expect(await t.service.jalankan(job, { percobaanTerakhir: false })).toMatchObject({
      status: "draft",
    });
    expect(t.panggilan[1]?.input.perbaikan).toContain("objek JSON");
  });

  it("invalid 2× → TIDAK ADA draft; sesi kembali aktif dengan jejak gagal; notifikasi gagal", async () => {
    const t = await rakit([{ headline: 5 }, { experiences: "bukan larik" }]);
    const hasil = await t.service.jalankan(job, { percobaanTerakhir: false });

    expect(hasil).toEqual({ status: "gagal", kode: "AI_INVALID_OUTPUT" });
    expect(t.dibuat).toEqual([]);
    expect(t.sesi()).toMatchObject({
      status: "active",
      extractionError: "AI_INVALID_OUTPUT",
      extractionFailedAt: WAKTU,
      resumeId: null,
    });
    // Transkrip utuh — jalur manual tetap punya bahannya.
    expect(t.sesi()?.transcript).toHaveLength(2);
    expect(t.terbit).toEqual([
      { type: "resume.draft_ai_gagal", kunciPeristiwa: `${S}:gagal:${WAKTU.toISOString()}` },
    ]);
  });

  it("field disabilitas dari model DITOLAK skema (strict) — tidak pernah tersimpan", async () => {
    const t = await rakit([
      { ...VALID, disabilityTypes: ["tuli"] },
      { ...VALID, accommodationNeeds: { juru: true } },
    ]);
    expect(await t.service.jalankan(job, { percobaanTerakhir: false })).toMatchObject({
      status: "gagal",
    });
    expect(t.dibuat).toEqual([]);
  });
});

describe("idempotensi per sesi", () => {
  it("job kedua setelah sukses → dilewati, tanpa draft kedua dan tanpa panggilan AI", async () => {
    const t = await rakit([VALID, VALID]);
    await t.service.jalankan(job, { percobaanTerakhir: false });
    const kedua = await t.service.jalankan(job, { percobaanTerakhir: false });

    expect(kedua).toEqual({ status: "dilewati", sebab: "bukan-finalizing" });
    expect(t.dibuat).toHaveLength(1);
    expect(t.panggilan).toHaveLength(1);
  });

  it("retry setelah draft tersimpan tetapi sebelum sesi ditandai → draft yang ada dipakai ulang", async () => {
    const t = await rakit([VALID], { sudahAda: true });
    expect(await t.service.jalankan(job, { percobaanTerakhir: false })).toMatchObject({
      status: "draft",
      resumeId: S,
    });
    expect(t.dibuat).toEqual([]);
    expect(t.sesi()?.status).toBe("finalized");
  });
});

describe("kegagalan provider & batas CV", () => {
  it("provider tumbang BUKAN percobaan terakhir → dilempar (BullMQ retry), sesi tetap finalizing, jatah tidak pulang", async () => {
    const t = await rakit([new AiProviderError("AI_TIMEOUT", "gemini")]);
    await expect(t.service.jalankan(job, { percobaanTerakhir: false })).rejects.toMatchObject({
      code: "AI_TIMEOUT",
    });
    expect(t.sesi()?.status).toBe("finalizing");
    expect(t.dikembalikan).toEqual([]);
    expect(t.terbit).toEqual([]);
  });

  it("provider tumbang pada percobaan TERAKHIR → jatah pulang, sesi aktif + jejak, notifikasi gagal", async () => {
    const t = await rakit([new AiProviderError("AI_TIMEOUT", "gemini")]);
    expect(await t.service.jalankan(job, { percobaanTerakhir: true })).toEqual({
      status: "gagal",
      kode: "AI_TIMEOUT",
    });
    expect(t.dikembalikan).toEqual(["AI_TIMEOUT"]);
    expect(t.sesi()).toMatchObject({ status: "active", extractionError: "AI_TIMEOUT" });
    expect(t.terbit.map((x) => x.type)).toEqual(["resume.draft_ai_gagal"]);
  });

  it("batas lima CV tercapai sebelum draft dibuat → gagal BATAS_CV_TERCAPAI tanpa retry", async () => {
    const t = await rakit([VALID], { penuh: true });
    expect(await t.service.jalankan(job, { percobaanTerakhir: false })).toEqual({
      status: "gagal",
      kode: "BATAS_CV_TERCAPAI",
    });
    expect(t.sesi()?.status).toBe("active");
  });
});

describe("formatPercakapan", () => {
  it("label peran milik kita, urut sesuai transkrip", () => {
    expect(
      formatPercakapan({
        transcript: [
          { seq: 1, role: "assistant", content: "Halo", at: WAKTU.toISOString() },
          { seq: 2, role: "user", content: "Hai", at: WAKTU.toISOString() },
        ],
      }),
    ).toBe("Pewawancara: Halo\nPengguna: Hai");
  });
});
