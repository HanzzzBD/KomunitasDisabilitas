// Unit service sesi (PR-018a) — rotasi, reuse detection, revokeAllSessions.
// Repository dipalsukan; semantik transaksi & unique index dibuktikan terpisah
// di auth-session-db.test.ts terhadap PostgreSQL NYATA. Jangan perlakukan test
// ini sebagai penggantinya.
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { AUDIT_ACTION } from "@nawasena/schemas";
import { createTokenService } from "../src/core/auth/tokens.js";
import { createSessionService } from "../src/modules/auth/services/session.service.js";
import type { AuditLog } from "../src/core/audit/index.js";
import { AppError } from "../src/core/http/index.js";
import { uuidV7 } from "../src/core/ids/index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const T0 = new Date("2026-08-04T10:00:00.000Z");
const USER_ID = "018a0000-0000-7000-8000-0000000000aa";
const REQUEST_ID = "018a0000-0000-7000-8000-0000000000bb";
const actor = { requestId: REQUEST_ID };

interface BarisPalsu {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Repository refresh in-memory dengan semantik yang sama seperti Prisma. */
function refreshRepoPalsu() {
  const rows: BarisPalsu[] = [];
  return {
    rows,
    async insert(input: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) {
      const id = uuidV7();
      rows.push({ id, revokedAt: null, ...input });
      return id;
    },
    async findByHash(tokenHash: string) {
      return rows.find((r) => r.tokenHash === tokenHash) ?? null;
    },
    async rotate(input: {
      currentId: string;
      nextTokenHash: string;
      nextExpiresAt: Date;
      userId: string;
      familyId: string;
      now: Date;
    }) {
      const current = rows.find((r) => r.id === input.currentId && r.revokedAt === null);
      if (current === undefined) return null; // kalah balapan
      current.revokedAt = input.now;
      const id = uuidV7();
      rows.push({
        id,
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: input.nextTokenHash,
        expiresAt: input.nextExpiresAt,
        revokedAt: null,
      });
      return id;
    },
    async revokeFamily(familyId: string, now: Date) {
      const target = rows.filter((r) => r.familyId === familyId && r.revokedAt === null);
      for (const r of target) r.revokedAt = now;
      return target.length;
    },
    async revokeAllForUser(userId: string, now: Date) {
      const target = rows.filter((r) => r.userId === userId && r.revokedAt === null);
      for (const r of target) r.revokedAt = now;
      return target.length;
    },
  };
}

function userRepoPalsu(awal = { id: USER_ID, role: "seeker" as const, tokenVersion: 0 }) {
  let user: { id: string; role: "seeker"; tokenVersion: number } | null = { ...awal };
  return {
    get current() {
      return user;
    },
    hapus() {
      user = null;
    },
    async findActiveSessionUser(id: string) {
      return user !== null && user.id === id ? { ...user } : null;
    },
    async bumpTokenVersion(id: string) {
      if (user === null || user.id !== id) return null;
      user.tokenVersion += 1;
      return user.tokenVersion;
    },
  };
}

type Catatan = { action: string; entityId: string | null; meta: unknown; actorId: string | null };

function rakit(options: { user?: ReturnType<typeof userRepoPalsu>; clock?: () => Date } = {}) {
  const refreshTokenRepository = refreshRepoPalsu();
  const userRepository = options.user ?? userRepoPalsu();
  const catatan: Catatan[] = [];
  const auditLog: AuditLog = (a, action, _entity, entityId, meta) => {
    catatan.push({ action, entityId, meta, actorId: a.actorId });
  };
  const clock = options.clock ?? (() => T0);
  const service = createSessionService({
    tokenService: createTokenService({ privateKey, publicKey, clock }),
    // Cukup untuk service; bentuk penuh repo diuji di test DB.
    userRepository: userRepository as never,
    refreshTokenRepository: refreshTokenRepository as never,
    auditLog,
    clock,
  });
  return { service, refreshTokenRepository, userRepository, catatan };
}

const tokenService = createTokenService({ privateKey, publicKey, clock: () => T0 });

describe("issue — sesi baru", () => {
  it("mengembalikan pasangan token dan menyimpan HANYA hash refresh", async () => {
    const { service, refreshTokenRepository } = rakit();
    const tokens = await service.issue(USER_ID);

    expect(tokens.expiresIn).toBe(15 * 60);
    expect(refreshTokenRepository.rows).toHaveLength(1);

    const baris = refreshTokenRepository.rows[0];
    expect(baris?.tokenHash).toBe(tokenService.hashRefreshToken(tokens.refreshToken));
    // Token mentah tidak boleh ada di mana pun pada baris DB.
    expect(JSON.stringify(baris)).not.toContain(tokens.refreshToken);
  });

  it("access token memuat ver terkini milik pengguna", async () => {
    const user = userRepoPalsu({ id: USER_ID, role: "seeker", tokenVersion: 7 });
    const { service } = rakit({ user });
    const tokens = await service.issue(USER_ID);
    expect(await tokenService.verifyAccessToken(tokens.accessToken, { version: 7 })).toMatchObject({
      sub: USER_ID,
      ver: 7,
    });
  });

  it("setiap login memulai KELUARGA BARU (perangkat tidak saling menjatuhkan)", async () => {
    const { service, refreshTokenRepository } = rakit();
    await service.issue(USER_ID);
    await service.issue(USER_ID);
    const families = new Set(refreshTokenRepository.rows.map((r) => r.familyId));
    expect(families.size).toBe(2);
  });

  it("akun tidak aktif → SESI_TIDAK_VALID, tanpa baris tersimpan", async () => {
    const user = userRepoPalsu();
    user.hapus();
    const { service, refreshTokenRepository } = rakit({ user });
    await expect(service.issue(USER_ID)).rejects.toMatchObject({ code: "SESI_TIDAK_VALID" });
    expect(refreshTokenRepository.rows).toHaveLength(0);
  });
});

describe("refresh — rotasi", () => {
  it("menukar refresh lama dengan pasangan baru, keluarga tetap sama", async () => {
    const { service, refreshTokenRepository } = rakit();
    const awal = await service.issue(USER_ID);
    const baru = await service.refresh(awal.refreshToken, actor);

    expect(baru.refreshToken).not.toBe(awal.refreshToken);
    expect(refreshTokenRepository.rows).toHaveLength(2);
    expect(refreshTokenRepository.rows[0]?.revokedAt).toEqual(T0); // lama dicabut
    expect(refreshTokenRepository.rows[1]?.revokedAt).toBeNull(); // baru aktif
    expect(refreshTokenRepository.rows[1]?.familyId).toBe(refreshTokenRepository.rows[0]?.familyId);
  });

  it("rantai rotasi berkali-kali tetap dalam satu keluarga", async () => {
    const { service, refreshTokenRepository } = rakit();
    let tokens = await service.issue(USER_ID);
    for (let i = 0; i < 4; i += 1) tokens = await service.refresh(tokens.refreshToken, actor);

    expect(refreshTokenRepository.rows).toHaveLength(5);
    expect(new Set(refreshTokenRepository.rows.map((r) => r.familyId)).size).toBe(1);
    expect(refreshTokenRepository.rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });

  it("refresh yang tidak dikenal ditolak, tanpa audit reuse", async () => {
    const { service, catatan } = rakit();
    await expect(service.refresh("token-karangan", actor)).rejects.toBeInstanceOf(AppError);
    expect(catatan).toHaveLength(0);
  });

  it("refresh kedaluwarsa ditolak", async () => {
    const { service } = rakit();
    const awal = await service.issue(USER_ID);

    const lewat = new Date(T0.getTime() + 31 * 24 * 60 * 60 * 1000);
    const { service: nanti, refreshTokenRepository } = rakit({ clock: () => lewat });
    // Pindahkan baris hasil issue ke instance ber-jam maju.
    refreshTokenRepository.rows.push({
      id: uuidV7(),
      userId: USER_ID,
      familyId: uuidV7(),
      tokenHash: tokenService.hashRefreshToken(awal.refreshToken),
      expiresAt: new Date(T0.getTime() + 30 * 24 * 60 * 60 * 1000),
      revokedAt: null,
    });
    await expect(nanti.refresh(awal.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });

  it("akun dihapus setelah login → refresh ditolak", async () => {
    const user = userRepoPalsu();
    const { service } = rakit({ user });
    const awal = await service.issue(USER_ID);
    user.hapus();
    await expect(service.refresh(awal.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });

  it("kalah balapan rotasi → ditolak, tidak menyerahkan access token yatim", async () => {
    const { service, refreshTokenRepository } = rakit();
    const awal = await service.issue(USER_ID);
    // Simulasi: permintaan lain mencabut baris ini tepat sebelum rotate.
    const asli = refreshTokenRepository.rotate.bind(refreshTokenRepository);
    refreshTokenRepository.rotate = async (input) => {
      const baris = refreshTokenRepository.rows.find((r) => r.id === input.currentId);
      if (baris !== undefined) baris.revokedAt = T0;
      return asli(input);
    };
    await expect(service.refresh(awal.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });
});

describe("reuse detection (AC: reuse → seluruh family dicabut + audit)", () => {
  it("memakai refresh yang SUDAH dirotasi mencabut seluruh keluarga", async () => {
    const { service, refreshTokenRepository } = rakit();
    const awal = await service.issue(USER_ID);
    const kedua = await service.refresh(awal.refreshToken, actor); // awal kini dicabut
    const ketiga = await service.refresh(kedua.refreshToken, actor); // rantai sah berlanjut

    // Penyerang (atau korban) memakai token lama yang sudah dicabut.
    await expect(service.refresh(awal.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });

    // SELURUH keluarga mati — termasuk token terbaru yang tadi masih sah.
    expect(refreshTokenRepository.rows.every((r) => r.revokedAt !== null)).toBe(true);
    await expect(service.refresh(ketiga.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });

  it("menulis audit AUTH_REFRESH_REUSED berisi jumlah sesi tercabut, tanpa token", async () => {
    const { service, catatan } = rakit();
    const awal = await service.issue(USER_ID);
    await service.refresh(awal.refreshToken, actor);
    await service.refresh(awal.refreshToken, actor).catch(() => undefined);

    expect(catatan).toHaveLength(1);
    expect(catatan[0]).toMatchObject({
      action: AUDIT_ACTION.AUTH_REFRESH_REUSED,
      actorId: USER_ID,
      entityId: USER_ID,
      meta: { revokedCount: 1 }, // hanya token terbaru yang masih aktif
    });
    expect(JSON.stringify(catatan)).not.toContain(awal.refreshToken);
  });

  it("keluarga LAIN (perangkat lain) tidak ikut mati", async () => {
    const { service, refreshTokenRepository } = rakit();
    const hp = await service.issue(USER_ID);
    const laptop = await service.issue(USER_ID);

    await service.refresh(hp.refreshToken, actor);
    await service.refresh(hp.refreshToken, actor).catch(() => undefined); // reuse di hp

    // Sesi laptop harus selamat.
    const barisLaptop = refreshTokenRepository.rows.find(
      (r) => r.tokenHash === tokenService.hashRefreshToken(laptop.refreshToken),
    );
    expect(barisLaptop?.revokedAt).toBeNull();
    await expect(service.refresh(laptop.refreshToken, actor)).resolves.toBeDefined();
  });

  it("reuse kedua kali tetap ditolak dan tetap teraudit", async () => {
    const { service, catatan } = rakit();
    const awal = await service.issue(USER_ID);
    await service.refresh(awal.refreshToken, actor);
    await service.refresh(awal.refreshToken, actor).catch(() => undefined);
    await service.refresh(awal.refreshToken, actor).catch(() => undefined);

    expect(catatan).toHaveLength(2);
    expect(catatan[1]).toMatchObject({ meta: { revokedCount: 0 } }); // sudah habis dicabut
  });
});

describe("revokeAllSessions — logout semua perangkat", () => {
  it("menaikkan ver DAN mencabut semua refresh milik pengguna", async () => {
    const user = userRepoPalsu();
    const { service, refreshTokenRepository } = rakit({ user });
    const hp = await service.issue(USER_ID);
    await service.issue(USER_ID);

    const hasil = await service.revokeAllSessions(USER_ID);

    expect(hasil).toEqual({ tokenVersion: 1, revokedCount: 2 });
    expect(refreshTokenRepository.rows.every((r) => r.revokedAt !== null)).toBe(true);
    // Access token lama ditolak terhadap ver baru…
    expect(await tokenService.verifyAccessToken(hp.accessToken, { version: 1 })).toBeNull();
    // …dan refresh tidak bisa menerbitkan yang ber-ver baru.
    await expect(service.refresh(hp.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });

  it("sesi yang diterbitkan SETELAH bump memakai ver baru dan tetap sah", async () => {
    const user = userRepoPalsu();
    const { service } = rakit({ user });
    await service.issue(USER_ID);
    await service.revokeAllSessions(USER_ID);

    const baru = await service.issue(USER_ID);
    expect(await tokenService.verifyAccessToken(baru.accessToken, { version: 1 })).toMatchObject({
      ver: 1,
    });
  });

  it("pengguna tidak aktif → SESI_TIDAK_VALID", async () => {
    const user = userRepoPalsu();
    user.hapus();
    const { service } = rakit({ user });
    await expect(service.revokeAllSessions(USER_ID)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });
});
