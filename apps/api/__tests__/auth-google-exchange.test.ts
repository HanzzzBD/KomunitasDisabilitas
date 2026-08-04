// PR-017b — unit penukaran authorization code + pemetaan audit service.
//
// Melengkapi test HTTP: di sini yang diuji adalah perilaku yang butuh
// kegagalan jaringan nyata dan pemeriksaan siapa yang diaudit — khususnya
// keputusan bahwa gangguan infrastruktur BUKAN "percobaan login gagal".
import { describe, it, expect, vi } from "vitest";
import { AppError } from "../src/core/http/index.js";
import { createGoogleCodeExchange } from "../src/modules/auth/services/google-token.js";
import { createGoogleService } from "../src/modules/auth/services/google.service.js";
import type { GoogleIdentity } from "../src/modules/auth/services/google-id-token.js";
import type { AuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";

const KONFIG = {
  clientId: "123-uji.apps.googleusercontent.com",
  clientSecret: "rahasia-uji",
  tokenUrl: "https://oauth2.contoh.invalid/token",
  timeoutMs: 2000,
};
const INPUT = { code: "kode-uji", codeVerifier: "v".repeat(64), redirectUri: "http://localhost/cb" };
const IDENTITAS: GoogleIdentity = {
  googleId: "sub-1",
  email: "rina@contoh.id",
  fullName: "Rina Pratiwi",
};
const ACTOR = { requestId: "01912345-89ab-7def-8123-456789abcdea" };

const logger = () => ({ warn: vi.fn(), error: vi.fn() });

describe("createGoogleCodeExchange", () => {
  it("jaringan gagal → 503 (masalah kita), BUKAN 401 (menyalahkan pengguna)", async () => {
    const log = logger();
    const exchange = createGoogleCodeExchange(KONFIG, log, () =>
      Promise.reject(new TypeError("fetch failed")),
    );

    await expect(exchange.exchange(INPUT)).rejects.toMatchObject({ code: "BELUM_SIAP", status: 503 });
    // Log kegagalan menyebut jenisnya saja — bukan kredensial permintaan.
    const dicatat = JSON.stringify(log.warn.mock.calls);
    expect(dicatat).toContain("TypeError");
    expect(dicatat).not.toContain(INPUT.codeVerifier);
  });

  it("habis waktu → 503, dan permintaan memakai AbortSignal", async () => {
    const log = logger();
    const exchange = createGoogleCodeExchange(KONFIG, log, (_url, init) => {
      expect(init.signal).toBeDefined();
      const err = new Error("The operation was aborted");
      err.name = "TimeoutError";
      return Promise.reject(err);
    });

    await expect(exchange.exchange(INPUT)).rejects.toMatchObject({ status: 503 });
  });

  it("balasan sukses: HANYA id_token yang keluar, token lain ditinggalkan", async () => {
    const exchange = createGoogleCodeExchange(KONFIG, logger(), () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id_token: "token.id.uji",
            access_token: "ya29.rahasia",
            refresh_token: "1//rahasia",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    // Nilai kembalinya string, bukan objek — access/refresh token tidak punya
    // jalan keluar dari fungsi ini.
    await expect(exchange.exchange(INPUT)).resolves.toBe("token.id.uji");
  });

  it("balasan bukan JSON dengan status 400 → 401, bukan crash", async () => {
    const exchange = createGoogleCodeExchange(KONFIG, logger(), () =>
      Promise.resolve(new Response("<html>gateway error</html>", { status: 400 })),
    );

    await expect(exchange.exchange(INPUT)).rejects.toMatchObject({
      code: "GOOGLE_EXCHANGE_GAGAL",
      status: 401,
    });
  });
});

describe("createGoogleService — apa yang diaudit", () => {
  const repoPalsu = (): AuthUserRepository =>
    ({
      findOrCreateByGoogle: () => Promise.resolve({ id: "01912345-89ab-7def-8123-000000000001", isNew: true }),
    }) as unknown as AuthUserRepository;

  const buat = (gagalDengan?: AppError) => {
    const auditLog = vi.fn();
    const service = createGoogleService({
      exchange: {
        exchange: () => (gagalDengan === undefined ? Promise.resolve("token") : Promise.reject(gagalDengan)),
      },
      verifier: { verify: () => Promise.resolve(IDENTITAS) },
      userRepository: repoPalsu(),
      auditLog,
    });
    return { service, auditLog };
  };

  it("sukses → audit AUTH_LOGIN_SUCCEEDED dengan metode & status akun baru", async () => {
    const { service, auditLog } = buat();
    const hasil = await service.login(INPUT, ACTOR);

    expect(hasil.isNewUser).toBe(true);
    expect(auditLog).toHaveBeenCalledTimes(1);
    const [actor, action, entity, entityId, meta] = auditLog.mock.calls[0]!;
    expect(action).toBe("AUTH_LOGIN_SUCCEEDED");
    expect(entity).toBe("auth.google");
    expect(entityId).toBe(hasil.userId);
    expect(actor).toEqual({ actorId: hasil.userId, requestId: ACTOR.requestId });
    expect(meta).toEqual({ method: "google", isNewUser: true });
  });

  it.each([
    ["GOOGLE_EXCHANGE_GAGAL", "googleExchangeFailed"],
    ["TOKEN_GOOGLE_TIDAK_VALID", "googleTokenInvalid"],
    ["EMAIL_GOOGLE_BELUM_TERVERIFIKASI", "googleEmailNotVerified"],
  ] as const)("penolakan %s → audit gagal ber-reason %s", async (kode, alasan) => {
    const { service, auditLog } = buat(new AppError(kode));

    await expect(service.login(INPUT, ACTOR)).rejects.toBeInstanceOf(AppError);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog.mock.calls[0]![1]).toBe("AUTH_LOGIN_FAILED");
    expect(auditLog.mock.calls[0]![4]).toEqual({ reason: alasan });
  });

  it("gangguan infrastruktur (503) TIDAK diaudit sebagai percobaan login gagal", async () => {
    const { service, auditLog } = buat(new AppError("BELUM_SIAP"));

    await expect(service.login(INPUT, ACTOR)).rejects.toMatchObject({ status: 503 });
    // Mencatatnya akan mengotori sinyal keamanan justru saat sedang ada insiden.
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("audit tidak pernah memuat email/nama pengguna (bebas PII)", async () => {
    const { service, auditLog } = buat();
    await service.login(INPUT, ACTOR);

    const dicatat = JSON.stringify(auditLog.mock.calls);
    expect(dicatat).not.toContain(IDENTITAS.email);
    expect(dicatat).not.toContain(IDENTITAS.fullName);
  });
});
