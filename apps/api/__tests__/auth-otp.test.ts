// Unit test login OTP (PR-016a) — limiter, hashing, lockout, find-or-create.
//
// Redis dipalsukan in-memory (deterministik, tanpa server); klien nyata diuji
// di auth-otp-redis.test.ts. Sender selalu mock: tidak ada pesan keluar.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUDIT_ACTION } from "@nawasena/schemas";
import { AppError } from "../src/core/http/errors.js";
import {
  createOtpRepository,
  type OtpRedisLike,
} from "../src/modules/auth/repositories/otp.repository.js";
import {
  createOtpService,
  generateOtpCode,
  OTP_POLICY,
} from "../src/modules/auth/services/otp.service.js";
import { OtpSenderError, type OtpSender } from "../src/modules/auth/services/otp-sender.js";
import type { AuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";

const PHONE = "+6281234567890";
const SECRET = "rahasia-uji-otp-minimal-32-karakter!!";
const ACTOR = { requestId: "01912345-89ab-7def-8123-456789abcdef" };

/** Redis in-memory: hanya perintah yang dipakai repo, plus kontrol TTL manual. */
function createFakeRedis() {
  const nilai = new Map<string, string>();
  const kedaluwarsa = new Map<string, number>();

  const redis: OtpRedisLike & { keys(): string[]; majukanWaktu(detik: number): void } = {
    async get(key) {
      return nilai.get(key) ?? null;
    },
    async set(key, value, _mode, seconds) {
      nilai.set(key, value);
      kedaluwarsa.set(key, seconds);
      return "OK";
    },
    async del(...keys) {
      let terhapus = 0;
      for (const key of keys) {
        if (nilai.delete(key)) terhapus += 1;
        kedaluwarsa.delete(key);
      }
      return terhapus;
    },
    async incr(key) {
      const next = Number(nilai.get(key) ?? "0") + 1;
      nilai.set(key, String(next));
      return next;
    },
    async expire(key, seconds) {
      kedaluwarsa.set(key, seconds);
      return 1;
    },
    async ttl(key) {
      if (!nilai.has(key)) return -2;
      return kedaluwarsa.get(key) ?? -1;
    },
    keys: () => [...nilai.keys()],
    majukanWaktu(detik) {
      for (const [key, sisa] of kedaluwarsa) {
        const baru = sisa - detik;
        if (baru <= 0) {
          nilai.delete(key);
          kedaluwarsa.delete(key);
        } else kedaluwarsa.set(key, baru);
      }
    },
  };
  return { redis, nilai };
}

function createFakeUserRepository(existing: string | null = null): AuthUserRepository {
  let simpan = existing;
  return {
    async findActiveByPhone() {
      return simpan === null ? null : { id: simpan };
    },
    async findOrCreateByPhone() {
      if (simpan !== null) return { id: simpan, isNew: false };
      simpan = "01912345-89ab-7def-8123-000000000001";
      return { id: simpan, isNew: true };
    },
    // Jalur Google (PR-017) tidak dipakai alur OTP; dibuat meledak supaya
    // pemakaian tak sengaja terlihat sebagai kegagalan test, bukan diam-diam.
    findActiveByGoogleId() {
      throw new Error("Alur OTP tidak boleh menyentuh jalur Google");
    },
    findOrCreateByGoogle() {
      throw new Error("Alur OTP tidak boleh menyentuh jalur Google");
    },
  };
}

/** Sender penangkap: menyimpan kode agar test bisa "membaca WhatsApp". */
function createCapturingSender() {
  const terkirim: Array<{ phone: string; code: string }> = [];
  const sender: OtpSender = {
    name: "uji",
    async send(message) {
      terkirim.push({ ...message });
    },
  };
  return { sender, terkirim };
}

function setup(options: { sender?: OtpSender; userId?: string | null } = {}) {
  const { redis, nilai } = createFakeRedis();
  const penangkap = createCapturingSender();
  const auditLog = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const otpRepository = createOtpRepository({ redis, secret: SECRET });
  const service = createOtpService({
    otpRepository,
    userRepository: createFakeUserRepository(options.userId ?? null),
    sender: options.sender ?? penangkap.sender,
    auditLog,
    logger,
  });
  return { service, otpRepository, redis, nilai, auditLog, logger, terkirim: penangkap.terkirim };
}

/** Ambil AppError yang dilempar (vitest rejects tidak memberi objeknya). */
async function tangkap(jalan: () => Promise<unknown>): Promise<AppError> {
  try {
    await jalan();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Diharapkan AppError, tetapi tidak ada error");
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe("generateOtpCode", () => {
  it("selalu 6 angka, termasuk saat nilainya kecil", () => {
    for (let i = 0; i < 200; i += 1) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });
});

describe("penyimpanan OTP (AC: tidak pernah plaintext)", () => {
  it("tidak ada nilai Redis yang memuat kode, dan tidak ada kunci memuat nomor", async () => {
    await ctx.service.request({ phone: PHONE }, ACTOR);
    const code = ctx.terkirim[0]?.code ?? "";
    expect(code).toMatch(/^\d{6}$/);

    for (const [key, value] of ctx.nilai) {
      expect(key, "kunci Redis memuat nomor HP").not.toContain(PHONE);
      expect(key).not.toContain("6281234567890");
      expect(value, "nilai Redis memuat kode mentah").not.toContain(code);
    }
  });

  it("hash terikat nomor: kode benar untuk nomor lain tidak cocok", async () => {
    const repo = ctx.otpRepository;
    await repo.saveCode(PHONE, "123456", 300);
    const hash = await repo.readCodeHash(PHONE);
    expect(hash).not.toBeNull();
    expect(repo.matches(PHONE, "123456", hash!)).toBe(true);
    expect(repo.matches("+6289999999999", "123456", hash!)).toBe(false);
  });
});

describe("limiter kirim (AC: kirim ke-4 dalam 1 jam → 429 + Retry-After)", () => {
  it("tiga kirim lolos, kirim keempat ditolak dengan sisa jendela", async () => {
    for (let i = 0; i < OTP_POLICY.maxSendPerWindow; i += 1) {
      await ctx.service.request({ phone: PHONE }, ACTOR);
    }
    expect(ctx.terkirim).toHaveLength(3);

    const err = await tangkap(() => ctx.service.request({ phone: PHONE }, ACTOR));
    expect(err.code).toBe("TERLALU_BANYAK_PERMINTAAN");
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(OTP_POLICY.sendWindowSeconds);
    expect(ctx.terkirim).toHaveLength(3); // tidak ada pesan tambahan keluar
    expect(ctx.auditLog).toHaveBeenCalledWith(
      { actorId: null, requestId: ACTOR.requestId },
      AUDIT_ACTION.AUTH_LOGIN_FAILED,
      "auth.otp",
      null,
      { reason: "rateLimited" },
    );
  });

  it("kirim ketiga melaporkan retryAfterSeconds > 0 (kuota habis)", async () => {
    const pertama = await ctx.service.request({ phone: PHONE }, ACTOR);
    expect(pertama.retryAfterSeconds).toBe(0);
    await ctx.service.request({ phone: PHONE }, ACTOR);
    const ketiga = await ctx.service.request({ phone: PHONE }, ACTOR);
    expect(ketiga.retryAfterSeconds).toBe(OTP_POLICY.sendWindowSeconds);
  });
});

describe("verify", () => {
  it("kode benar → find-or-create user baru (AC)", async () => {
    await ctx.service.request({ phone: PHONE }, ACTOR);
    const hasil = await ctx.service.verify(
      { phone: PHONE, code: ctx.terkirim[0]!.code },
      ACTOR,
    );
    expect(hasil.isNewUser).toBe(true);
    expect(hasil.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.auditLog).not.toHaveBeenCalled();
  });

  it("kode benar untuk nomor yang sudah punya akun → isNewUser false", async () => {
    const lain = setup({ userId: "01912345-89ab-7def-8123-0000000000aa" });
    await lain.service.request({ phone: PHONE }, ACTOR);
    const hasil = await lain.service.verify(
      { phone: PHONE, code: lain.terkirim[0]!.code },
      ACTOR,
    );
    expect(hasil).toEqual({ userId: "01912345-89ab-7def-8123-0000000000aa", isNewUser: false });
  });

  it("tanpa kode aktif → 410 hangus + audit", async () => {
    const err = await tangkap(() => ctx.service.verify({ phone: PHONE, code: "000000" }, ACTOR));
    expect(err.code).toBe("KODE_OTP_HANGUS");
    expect(err.status).toBe(410);
    expect(ctx.auditLog).toHaveBeenCalledTimes(1);
  });

  it("kode salah → 401 dengan sisa percobaan pada hint", async () => {
    await ctx.service.request({ phone: PHONE }, ACTOR);
    const salah = ctx.terkirim[0]!.code === "000000" ? "111111" : "000000";
    const err = await tangkap(() => ctx.service.verify({ phone: PHONE, code: salah }, ACTOR));
    expect(err.code).toBe("KODE_OTP_SALAH");
    expect(err.hint).toContain("Sisa 4 percobaan");
  });

  it("kode kedaluwarsa (TTL 5 menit lewat) → hangus", async () => {
    await ctx.service.request({ phone: PHONE }, ACTOR);
    ctx.redis.majukanWaktu(OTP_POLICY.ttlSeconds + 1);
    const err = await tangkap(() =>
      ctx.service.verify({ phone: PHONE, code: ctx.terkirim[0]!.code }, ACTOR),
    );
    expect(err.code).toBe("KODE_OTP_HANGUS");
  });
});

describe("lockout progresif (AC: percobaan ke-6 → OTP hangus + audit)", () => {
  async function gagalBerulang(kali: number) {
    const kodeBenar = ctx.terkirim[ctx.terkirim.length - 1]!.code;
    const salah = kodeBenar === "000000" ? "111111" : "000000";
    const errors: AppError[] = [];
    for (let i = 0; i < kali; i += 1) {
      errors.push(await tangkap(() => ctx.service.verify({ phone: PHONE, code: salah }, ACTOR)));
    }
    return errors;
  }

  it("percobaan ke-6 menghanguskan kode, mengunci 5 menit, dan ter-audit", async () => {
    await ctx.service.request({ phone: PHONE }, ACTOR);
    const kodeBenar = ctx.terkirim[0]!.code;

    const errors = await gagalBerulang(OTP_POLICY.maxAttempts + 1);
    expect(errors.slice(0, 5).map((e) => e.code)).toEqual(Array(5).fill("KODE_OTP_SALAH"));

    const keenam = errors[5]!;
    expect(keenam.code).toBe("TERLALU_BANYAK_PERCOBAAN");
    expect(keenam.status).toBe(429);
    expect(keenam.retryAfterSeconds).toBe(OTP_POLICY.lockoutLadderSeconds[0]);

    // Kode hangus: kode BENAR pun tidak bisa lagi dipakai.
    const setelah = await tangkap(() =>
      ctx.service.verify({ phone: PHONE, code: kodeBenar }, ACTOR),
    );
    expect(setelah.code).toBe("TERLALU_BANYAK_PERCOBAAN");

    expect(ctx.auditLog).toHaveBeenCalledWith(
      { actorId: null, requestId: ACTOR.requestId },
      AUDIT_ACTION.AUTH_LOGIN_FAILED,
      "auth.otp",
      null,
      { reason: "accountLocked" },
    );
  });

  it("selama terkunci, permintaan kode baru pun ditolak dengan sisa waktu", async () => {
    await ctx.service.request({ phone: PHONE }, ACTOR);
    await gagalBerulang(OTP_POLICY.maxAttempts + 1);

    const err = await tangkap(() => ctx.service.request({ phone: PHONE }, ACTOR));
    expect(err.code).toBe("TERLALU_BANYAK_PERCOBAAN");
    expect(err.retryAfterSeconds).toBe(OTP_POLICY.lockoutLadderSeconds[0]);
  });

  it("tangga lockout naik pada hangus berikutnya (5m → 15m)", async () => {
    await ctx.service.request({ phone: PHONE }, ACTOR);
    await gagalBerulang(OTP_POLICY.maxAttempts + 1);

    // Lockout pertama habis, pengguna minta kode baru dan gagal lagi 6 kali.
    ctx.redis.majukanWaktu(OTP_POLICY.lockoutLadderSeconds[0]! + 1);
    await ctx.service.request({ phone: PHONE }, ACTOR);
    const errors = await gagalBerulang(OTP_POLICY.maxAttempts + 1);
    expect(errors[5]!.retryAfterSeconds).toBe(OTP_POLICY.lockoutLadderSeconds[1]);
  });
});

describe("kegagalan pengirim", () => {
  it("sender gagal → 503 dan kode dihanguskan (tidak menggantung)", async () => {
    const gagal: OtpSender = {
      name: "gagal",
      send: () => Promise.reject(new OtpSenderError("gagal", "provider mati")),
    };
    const lokal = setup({ sender: gagal });

    const err = await tangkap(() => lokal.service.request({ phone: PHONE }, ACTOR));
    expect(err.code).toBe("BELUM_SIAP");
    expect(err.status).toBe(503);
    expect(await lokal.otpRepository.readCodeHash(PHONE)).toBeNull();
    // Log kegagalan hanya menyebut provider — tanpa nomor/kode.
    expect(lokal.logger.error).toHaveBeenCalledWith({ provider: "gagal" }, expect.any(String));
  });
});
