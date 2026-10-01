// Jendela toleransi rotasi (utang U-10) — PostgreSQL NYATA. Skip anggun bila DB
// tidak terjangkau.
//
// Skenario yang dulu mencabut sesi pengguna sah: dua tab (atau pemulihan boot
// vs refresh 401) mengirim refresh token yang SAMA bersamaan. Yang dibuktikan di
// sini dengan transaksi sungguhan: tepat satu menang, yang kalah mendapat
// `SESI_SUDAH_DIROTASI`, dan token pemenang TETAP hidup.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTokenService } from "../src/core/auth/index.js";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createRefreshTokenRepository } from "../src/modules/auth/repositories/refresh-token.repository.js";
import { createAuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";
import { createSessionService } from "../src/modules/auth/services/session.service.js";
import { SESSION_KEYS } from "./helpers/session.js";

const prisma = new PrismaClient();
const app = prisma as unknown as AppPrisma;
const PREFIX = "+62858019";
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test toleransi rotasi dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

function service(toleransiRotasiMs: number) {
  return createSessionService({
    tokenService: createTokenService(SESSION_KEYS),
    userRepository: createAuthUserRepository(app),
    refreshTokenRepository: createRefreshTokenRepository(app),
    auditLog: () => undefined,
    toleransiRotasiMs,
  });
}

async function buatUser(suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: { id: uuidV7(), phone: `${PREFIX}${suffix}`, fullName: "Uji Toleransi" },
    select: { id: true },
  });
  return user.id;
}

const actor = { requestId: "req-u10" };
const kode = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected" ? (r.reason as { code?: string }).code : "OK";

describe("dua refresh bersamaan dengan token yang sama (dua tab)", () => {
  it("toleransi 10 dtk: satu menang, yang kalah SESI_SUDAH_DIROTASI, sesi pemenang tetap hidup", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const s = service(10_000);
    const userId = await buatUser("01");
    const awal = await s.issue(userId);

    const hasil = await Promise.allSettled([
      s.refresh(awal.refreshToken, actor),
      s.refresh(awal.refreshToken, actor),
    ]);
    expect(hasil.map(kode).sort()).toEqual(["OK", "SESI_SUDAH_DIROTASI"]);

    const pemenang = hasil.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
      refreshToken: string;
    }>;
    // Keluarga TIDAK dicabut: token pemenang masih bisa dirotasi.
    await expect(s.refresh(pemenang.value.refreshToken, actor)).resolves.toHaveProperty(
      "accessToken",
    );
    expect(await prisma.refreshToken.count({ where: { userId, revokedReason: "reuse" } })).toBe(0);
  });

  it("tanpa toleransi (0): pemakaian ulang sesudah rotasi tetap mencabut keluarga", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const s = service(0);
    const awal = await s.issue(await buatUser("02"));
    const kedua = await s.refresh(awal.refreshToken, actor);

    await expect(s.refresh(awal.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
    await expect(s.refresh(kedua.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });
});
