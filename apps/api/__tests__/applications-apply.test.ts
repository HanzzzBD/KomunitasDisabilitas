// Unit service apply (PR-075) — fake repository + fake Redis in-memory.
//
// Yang dibuktikan di sini adalah KEPUTUSAN service, bukan perilaku database:
// urutan langkah (data sensitif tidak disentuh sebelum lowongan & CV sah),
// cabang idempotensi (putar ulang, bentrok, sedang diproses, klaim dilepas
// saat gagal), Redis yang mati tidak menolak lamaran, dan disclose=false tidak
// pernah membaca profil sensitif. Unique, CHECK, dan balapan sungguhan
// dibuktikan `applications-db.test.ts` terhadap PostgreSQL + Redis nyata.
import { describe, it, expect, vi } from "vitest";
import {
  AUDIT_ACTION,
  disclosureSnapshotSchema,
  type SeekerProfile,
  type SensitiveProfile,
} from "@nawasena/schemas";
import { AppError, appError } from "../src/core/http/index.js";
import { createFieldCrypto, parseFieldKeys } from "../src/core/crypto/index.js";
import {
  APPLY_POLICY,
  SudahMelamarError,
  createApplyService,
  createIdempotensiRepository,
  type ApplicationBaru,
  type ApplicationRow,
  type ApplicationsRepository,
  type ApplyRedisLike,
} from "../src/modules/applications/index.js";

const crypto = createFieldCrypto(
  parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 75).toString("base64") }),
);

const PELAMAR = { userId: "018f4c1e-0000-7000-8000-0000000000a1", requestId: "req-075" };
const JOB = "018f4c1e-0000-7000-8000-0000000000b1";
const JOB_LAIN = "018f4c1e-0000-7000-8000-0000000000b2";
const CV = "018f4c1e-0000-7000-8000-0000000000c1";
const KUNCI = "kunci-uji-075-aaaa";

const SENSITIF: SensitiveProfile = {
  disabilityTypes: ["tuli"],
  accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: null },
};

function profil(sensitive: SensitiveProfile | null): SeekerProfile {
  return {
    headline: null,
    summary: null,
    city: null,
    province: null,
    openToRemote: false,
    disclosureDefault: "ask_each_time",
    consentSensitiveAt: sensitive === null ? null : "2026-09-01T00:00:00.000Z",
    sensitive,
  };
}

/** Redis in-memory dengan semantik NX/EX/INCR yang dipakai repository. */
function fakeRedis(): ApplyRedisLike & { isi: Map<string, string> } {
  const isi = new Map<string, string>();
  const ttl = new Map<string, number>();
  const redis = {
    isi,
    get: (k: string) => Promise.resolve(isi.get(k) ?? null),
    set: (k: string, v: string, _ex: "EX", detik: number, nx?: "NX") => {
      if (nx === "NX" && isi.has(k)) return Promise.resolve(null);
      isi.set(k, v);
      ttl.set(k, detik);
      return Promise.resolve("OK" as const);
    },
    del: (...ks: string[]) => Promise.resolve(ks.filter((k) => isi.delete(k)).length),
    incr: (k: string) => {
      const n = Number(isi.get(k) ?? "0") + 1;
      isi.set(k, String(n));
      return Promise.resolve(n);
    },
    expire: (k: string, d: number) => {
      ttl.set(k, d);
      return Promise.resolve(1);
    },
    ttl: (k: string) => Promise.resolve(ttl.get(k) ?? -2),
  };
  return redis as unknown as ApplyRedisLike & { isi: Map<string, string> };
}

/** Redis yang selalu gagal — meniru cache yang mati. */
function redisMati(): ApplyRedisLike {
  const gagal = () => Promise.reject(new Error("ECONNREFUSED"));
  return { get: gagal, set: gagal, del: gagal, incr: gagal, expire: gagal, ttl: gagal };
}

function fakeRepo() {
  const baris: Array<ApplicationBaru & ApplicationRow> = [];
  const repo: Pick<ApplicationsRepository, "create" | "adaUntuk" | "findOwned"> = {
    create: (data) => {
      if (baris.some((b) => b.userId === data.userId && b.jobId === data.jobId)) {
        return Promise.reject(new SudahMelamarError());
      }
      const row = { ...data, status: "submitted" as const, appliedAt: new Date() };
      baris.push(row);
      return Promise.resolve(row);
    },
    adaUntuk: (userId, jobId) =>
      Promise.resolve(baris.some((b) => b.userId === userId && b.jobId === jobId)),
    findOwned: (userId, id) =>
      Promise.resolve(baris.find((b) => b.userId === userId && b.id === id) ?? null),
  };
  return { repo, baris };
}

function rakit(
  opsi: {
    redis?: ApplyRedisLike;
    sensitive?: SensitiveProfile | null;
    lowonganAda?: boolean;
    cvAda?: boolean;
  } = {},
) {
  const { repo, baris } = fakeRepo();
  const audit: Array<{ action: string; meta: unknown }> = [];
  const emit = vi.fn();
  const bacaProfil = vi.fn(() =>
    Promise.resolve(profil(opsi.sensitive === undefined ? SENSITIF : opsi.sensitive)),
  );
  const warn = vi.fn();
  const redis = opsi.redis ?? fakeRedis();
  const service = createApplyService({
    applicationsRepository: repo,
    idempotensi: createIdempotensiRepository(redis),
    crypto,
    auditLog: (_a, action, _e, _id, meta) => audit.push({ action, meta }),
    events: { emit },
    logger: { warn },
    pastikanLowonganAktif: (jobId) =>
      opsi.lowonganAda === false || jobId === "hilang"
        ? Promise.reject(appError("LOWONGAN_TIDAK_DITEMUKAN"))
        : Promise.resolve(),
    pastikanCvMilik: () =>
      opsi.cvAda === false ? Promise.reject(appError("CV_TIDAK_DITEMUKAN")) : Promise.resolve(),
    bacaProfilUntukPengungkapan: bacaProfil,
    clock: () => new Date("2026-10-01T03:00:00.000Z"),
  });
  return { service, baris, audit, emit, bacaProfil, warn, redis };
}

async function kodeGalat(janji: Promise<unknown>): Promise<string> {
  try {
    await janji;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error("seharusnya menolak");
}

const tutup = { resumeId: CV, discloseDisability: false };
const buka = { resumeId: CV, discloseDisability: true };

describe("disclose=false — nol jejak sensitif", () => {
  it("profil sensitif TIDAK PERNAH dibaca dan snapshot null", async () => {
    const r = rakit();
    const hasil = await r.service.apply(PELAMAR, JOB, tutup, KUNCI);

    expect(hasil.replay).toBe(false);
    expect(hasil.application.discloseDisability).toBe(false);
    expect(r.bacaProfil).not.toHaveBeenCalled();
    expect(r.baris[0]?.disclosureSnapshot).toBeNull();
  });
});

describe("disclose=true — snapshot salinan terenkripsi", () => {
  it("menyimpan ciphertext yang terdekripsi menjadi ragam + akomodasi saat itu", async () => {
    const r = rakit();
    await r.service.apply(PELAMAR, JOB, buka, KUNCI);

    const ct = r.baris[0]?.disclosureSnapshot;
    expect(Buffer.isBuffer(ct)).toBe(true);
    // Ciphertext, bukan JSON polos: nilai sensitif tidak terbaca dari byte-nya.
    expect((ct as Buffer).toString("utf8")).not.toContain("tuli");
    const isi = disclosureSnapshotSchema.parse(crypto.decryptJson(ct as Buffer));
    expect(isi).toEqual({ ...SENSITIF, capturedAt: "2026-10-01T03:00:00.000Z" });
  });

  it("consent belum ada → 422 DATA_DISABILITAS_KOSONG, tanpa lamaran", async () => {
    const r = rakit({ sensitive: null });
    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, buka, KUNCI))).toBe(
      "DATA_DISABILITAS_KOSONG",
    );
    expect(r.baris).toHaveLength(0);
  });

  it("consent ada tetapi ragam & akomodasi kosong → 422 juga", async () => {
    const r = rakit({
      sensitive: { disabilityTypes: [], accommodationNeeds: { tags: [], notes: null } },
    });
    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, buka, KUNCI))).toBe(
      "DATA_DISABILITAS_KOSONG",
    );
  });

  it("lowongan tidak aktif → data sensitif TIDAK dibaca sama sekali", async () => {
    const r = rakit({ lowonganAda: false });
    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, buka, KUNCI))).toBe(
      "LOWONGAN_TIDAK_DITEMUKAN",
    );
    expect(r.bacaProfil).not.toHaveBeenCalled();
  });

  it("CV bukan miliknya → data sensitif TIDAK dibaca sama sekali", async () => {
    const r = rakit({ cvAda: false });
    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, buka, KUNCI))).toBe("CV_TIDAK_DITEMUKAN");
    expect(r.bacaProfil).not.toHaveBeenCalled();
  });

  it("sudah melamar → 409 SEBELUM data sensitif dibaca", async () => {
    const r = rakit();
    await r.service.apply(PELAMAR, JOB, tutup, KUNCI);
    r.bacaProfil.mockClear();

    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, buka, "kunci-lain-075-bbbb"))).toBe(
      "SUDAH_MELAMAR",
    );
    expect(r.bacaProfil).not.toHaveBeenCalled();
  });
});

describe("Idempotency-Key", () => {
  it("kunci sama → putar ulang lamaran yang SAMA, tanpa audit/event kedua", async () => {
    const r = rakit();
    const pertama = await r.service.apply(PELAMAR, JOB, tutup, KUNCI);
    const kedua = await r.service.apply(PELAMAR, JOB, tutup, KUNCI);

    expect(kedua.replay).toBe(true);
    expect(kedua.application).toEqual(pertama.application);
    expect(r.baris).toHaveLength(1);
    expect(r.emit).toHaveBeenCalledTimes(1);
    expect(r.audit.filter((a) => a.action === AUDIT_ACTION.APPLICATION_SUBMITTED)).toHaveLength(1);
  });

  it("kunci sama untuk lowongan LAIN → 422 bentrok, bukan putar ulang", async () => {
    const r = rakit();
    await r.service.apply(PELAMAR, JOB, tutup, KUNCI);
    expect(await kodeGalat(r.service.apply(PELAMAR, JOB_LAIN, tutup, KUNCI))).toBe(
      "IDEMPOTENCY_KEY_BENTROK",
    );
  });

  it("kunci yang masih diklaim permintaan pertama → 409 sedang diproses", async () => {
    const redis = fakeRedis();
    const r = rakit({ redis });
    await createIdempotensiRepository(redis).klaim(PELAMAR.userId, KUNCI, JOB, 60);

    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, tutup, KUNCI))).toBe(
      "LAMARAN_SEDANG_DIPROSES",
    );
    expect(r.baris).toHaveLength(0);
  });

  it("kegagalan MELEPAS klaim — retry dengan kunci sama bisa berhasil", async () => {
    const r = rakit({ sensitive: null });
    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, buka, KUNCI))).toBe(
      "DATA_DISABILITAS_KOSONG",
    );
    // Pelamar memilih tidak mengungkap, mengulang dengan kunci yang sama.
    const hasil = await r.service.apply(PELAMAR, JOB, tutup, KUNCI);
    expect(hasil.replay).toBe(false);
    expect(r.baris).toHaveLength(1);
  });
});

describe("Redis mati tidak menolak lamaran (North Star)", () => {
  it("lamaran tetap tersimpan, kegagalan dicatat warn", async () => {
    const r = rakit({ redis: redisMati() });
    const hasil = await r.service.apply(PELAMAR, JOB, tutup, KUNCI);

    expect(hasil.application.status).toBe("submitted");
    expect(r.baris).toHaveLength(1);
    expect(r.warn).toHaveBeenCalled();
  });

  it("lapis kedua tetap berdiri: lamaran kedua → 409 SUDAH_MELAMAR", async () => {
    const r = rakit({ redis: redisMati() });
    await r.service.apply(PELAMAR, JOB, tutup, KUNCI);
    expect(await kodeGalat(r.service.apply(PELAMAR, JOB, tutup, KUNCI))).toBe("SUDAH_MELAMAR");
  });
});

describe("batas laju", () => {
  it(`permintaan ke-${APPLY_POLICY.maksPerJendela + 1} dalam jendela → 429 + Retry-After`, async () => {
    const r = rakit();
    for (let i = 0; i < APPLY_POLICY.maksPerJendela; i += 1) {
      await r.service
        .apply(PELAMAR, `hilang`, tutup, `kunci-laju-${String(i).padStart(4, "0")}`)
        .catch(() => undefined);
    }
    try {
      await r.service.apply(PELAMAR, JOB, tutup, KUNCI);
      throw new Error("seharusnya 429");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("TERLALU_BANYAK_PERMINTAAN");
      expect((err as AppError).retryAfterSeconds).toBe(APPLY_POLICY.jendelaDetik);
    }
  });
});

describe("audit + event", () => {
  it("audit APPLICATION_SUBMITTED memuat FAKTA disclose, bukan isinya; event terbit", async () => {
    const r = rakit();
    const { application } = await r.service.apply(PELAMAR, JOB, buka, KUNCI);

    expect(r.audit).toEqual([
      { action: AUDIT_ACTION.APPLICATION_SUBMITTED, meta: { jobId: JOB, disclosed: true } },
    ]);
    expect(JSON.stringify(r.audit)).not.toContain("tuli");
    expect(r.emit).toHaveBeenCalledWith("application.submitted", {
      applicationId: application.id,
      userId: PELAMAR.userId,
      jobId: JOB,
      submittedAt: application.appliedAt,
    });
  });
});
