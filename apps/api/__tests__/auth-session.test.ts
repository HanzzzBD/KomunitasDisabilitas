// Unit service sesi (PR-018a/c) — rotasi, reuse detection, logout.
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
  revokedReason: string | null;
}

/** Repository refresh in-memory dengan semantik yang sama seperti Prisma. */
function refreshRepoPalsu() {
  const rows: BarisPalsu[] = [];
  return {
    rows,
    async insert(input: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) {
      const id = uuidV7();
      rows.push({ id, revokedAt: null, revokedReason: null, ...input });
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
      current.revokedReason = "rotated";
      const id = uuidV7();
      rows.push({
        id,
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: input.nextTokenHash,
        expiresAt: input.nextExpiresAt,
        revokedAt: null,
        revokedReason: null,
      });
      return id;
    },
    async markReuse(id: string) {
      const baris = rows.find((r) => r.id === id);
      if (baris !== undefined) baris.revokedReason = "reuse";
    },
    async revokeFamily(familyId: string, now: Date, reason: string) {
      const target = rows.filter((r) => r.familyId === familyId && r.revokedAt === null);
      for (const r of target) {
        r.revokedAt = now;
        r.revokedReason = reason;
      }
      return target.length;
    },
    async revokeAllForUser(userId: string, now: Date, reason: string) {
      const target = rows.filter((r) => r.userId === userId && r.revokedAt === null);
      for (const r of target) {
        r.revokedAt = now;
        r.revokedReason = reason;
      }
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

/**
 * Menangkap AppError yang DIHARAPKAN terjadi.
 * Berbeda dari `.catch(() => undefined)`: bila panggilan justru BERHASIL, test
 * gagal alih-alih diam-diam lolos — penting untuk jalur reuse, di mana yang
 * diuji adalah penolakannya sendiri.
 */
async function tangkap(jalan: () => Promise<unknown>): Promise<AppError> {
  try {
    await jalan();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Diharapkan AppError, tetapi panggilan berhasil");
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
      revokedReason: null,
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

  /**
   * KONTRAK (keputusan owner 2026-08-04, mengubah perilaku PR-018a):
   *
   *   audit  → PALING BANYAK SEKALI per keluarga token
   *   tolak  → SETIAP KALI, tanpa kecuali
   *
   * Dua hal itu sengaja dipisah. Alarm pertama sudah memicu pencabutan seluruh
   * keluarga, jadi alarm kedua dan seterusnya tidak menambah tindakan apa pun
   * yang bisa diambil — sementara penyerang yang menggedor token mati bisa
   * menulis baris audit tanpa batas (retensi 2 tahun, dan `/auth/refresh` belum
   * ber-rate-limit; lihat risiko PR-018b dan PR-105). Yang diredam adalah
   * KEBISINGAN CATATAN, bukan penegakannya.
   *
   * Mekanismenya: `markReuse` menandai token pemicu sebagai `reuse`, sehingga
   * percobaan berikutnya tidak lagi terbaca sebagai `rotated` dan tidak masuk
   * cabang alarm — tetapi tetap jatuh ke penolakan.
   *
   * Kalau kelak dibutuhkan visibilitas atas percobaan berulang, tempatnya
   * metrik/rate limit (PR-105), BUKAN melonggarkan batas audit ini.
   */
  it("reuse berulang: ditolak SETIAP kali, diaudit PALING BANYAK sekali per keluarga", async () => {
    const { service, catatan } = rakit();
    const awal = await service.issue(USER_ID);
    await service.refresh(awal.refreshToken, actor); // rotasi sah

    // Tiga percobaan reuse berturut-turut atas token yang sama.
    const percobaan: AppError[] = [];
    for (let i = 0; i < 3; i += 1) {
      percobaan.push(await tangkap(() => service.refresh(awal.refreshToken, actor)));
    }

    // Separuh pertama kontrak: penegakan TIDAK melemah setelah alarm pertama.
    // Inilah yang harus gagal bila kelak ada yang "mengoptimalkan" jalur reuse
    // dengan cara yang tanpa sengaja meloloskan percobaan kedua.
    expect(percobaan).toHaveLength(3);
    for (const err of percobaan) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe("SESI_TIDAK_VALID");
    }

    // Separuh kedua: satu baris audit untuk seluruh rentetan itu.
    expect(catatan).toHaveLength(1);
    expect(catatan[0]?.action).toBe(AUDIT_ACTION.AUTH_REFRESH_REUSED);
  });

  it("batas sekali itu PER KELUARGA, bukan per pengguna", async () => {
    // Kalau batasnya per pengguna, insiden di perangkat kedua akan tertelan
    // oleh insiden di perangkat pertama dan tidak pernah terlihat.
    const { service, catatan } = rakit();
    const hp = await service.issue(USER_ID);
    const laptop = await service.issue(USER_ID);

    for (const sesi of [hp, laptop]) {
      await service.refresh(sesi.refreshToken, actor);
      await tangkap(() => service.refresh(sesi.refreshToken, actor));
    }

    expect(catatan).toHaveLength(2);
  });
});

describe("logout — keluar dari perangkat ini (PR-018c)", () => {
  it("mencabut seluruh keluarga perangkat itu dengan sebab `logout`", async () => {
    const { service, refreshTokenRepository } = rakit();
    const awal = await service.issue(USER_ID);
    const kedua = await service.refresh(awal.refreshToken, actor);

    await service.logout(kedua.refreshToken);

    expect(refreshTokenRepository.rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(refreshTokenRepository.rows.at(-1)?.revokedReason).toBe("logout");
    await expect(service.refresh(kedua.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });

  it("perangkat LAIN tidak ikut keluar", async () => {
    const { service } = rakit();
    const hp = await service.issue(USER_ID);
    const laptop = await service.issue(USER_ID);

    await service.logout(hp.refreshToken);

    await expect(service.refresh(laptop.refreshToken, actor)).resolves.toBeDefined();
  });

  it("idempoten: token tak dikenal / sudah dicabut tidak melempar", async () => {
    const { service } = rakit();
    const awal = await service.issue(USER_ID);

    await expect(service.logout("token-karangan")).resolves.toBeUndefined();
    await service.logout(awal.refreshToken);
    await expect(service.logout(awal.refreshToken)).resolves.toBeUndefined();
  });
});

describe("logout TIDAK boleh menyalakan alarm reuse (PR-018c)", () => {
  it("klien basi yang refresh setelah logout ditolak TANPA audit reuse", async () => {
    const { service, refreshTokenRepository, catatan } = rakit();
    const awal = await service.issue(USER_ID);
    await service.logout(awal.refreshToken);

    // Tab lain yang belum tahu pengguna sudah keluar mencoba memperpanjang.
    await expect(service.refresh(awal.refreshToken, actor)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });

    // Inilah inti PR-018c: perilaku normal tidak boleh mengotori sinyal keamanan.
    expect(catatan).toHaveLength(0);
    // Sebabnya juga tidak boleh ditimpa menjadi 'reuse'.
    expect(refreshTokenRepository.rows[0]?.revokedReason).toBe("logout");
  });

  it("setelah logout-all pun tidak ada alarm reuse", async () => {
    const { service, catatan } = rakit();
    const awal = await service.issue(USER_ID);
    await service.logoutAll(USER_ID);

    await expect(service.refresh(awal.refreshToken, actor)).rejects.toBeInstanceOf(AppError);
    expect(catatan).toHaveLength(0);
  });

  it("token yang dicabut karena ROTASI tetap memicu alarm (regresi PR-018a)", async () => {
    const { service, refreshTokenRepository, catatan } = rakit();
    const awal = await service.issue(USER_ID);
    await service.refresh(awal.refreshToken, actor); // awal → 'rotated'

    await expect(service.refresh(awal.refreshToken, actor)).rejects.toBeInstanceOf(AppError);

    expect(catatan).toHaveLength(1);
    expect(catatan[0]?.action).toBe(AUDIT_ACTION.AUTH_REFRESH_REUSED);
    expect(refreshTokenRepository.rows[0]?.revokedReason).toBe("reuse");
  });

  it("baris lama tanpa revokedReason (NULL) diperlakukan sebagai rotasi", async () => {
    // Baris yang dicabut SEBELUM migrasi 05 ada. Memperlakukannya sebagai
    // "bukan reuse" akan diam-diam melemahkan deteksi untuk data lama.
    const { service, refreshTokenRepository, catatan } = rakit();
    const awal = await service.issue(USER_ID);
    const baris = refreshTokenRepository.rows[0];
    if (baris !== undefined) {
      baris.revokedAt = T0;
      baris.revokedReason = null;
    }

    await expect(service.refresh(awal.refreshToken, actor)).rejects.toBeInstanceOf(AppError);
    expect(catatan).toHaveLength(1);
  });
});

describe("logoutAll — logout semua perangkat", () => {
  it("menaikkan ver DAN mencabut semua refresh milik pengguna", async () => {
    const user = userRepoPalsu();
    const { service, refreshTokenRepository } = rakit({ user });
    const hp = await service.issue(USER_ID);
    await service.issue(USER_ID);

    const hasil = await service.logoutAll(USER_ID);

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
    await service.logoutAll(USER_ID);

    const baru = await service.issue(USER_ID);
    expect(await tokenService.verifyAccessToken(baru.accessToken, { version: 1 })).toMatchObject({
      ver: 1,
    });
  });

  it("pengguna tidak aktif → SESI_TIDAK_VALID", async () => {
    const user = userRepoPalsu();
    user.hapus();
    const { service } = rakit({ user });
    await expect(service.logoutAll(USER_ID)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });
});
