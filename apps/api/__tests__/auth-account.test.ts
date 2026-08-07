// Unit service hapus akun (PR-021).
//
// Fokusnya SATU: apa yang terjadi sebelum penghapusan dijalankan. Penghapusan
// itu sendiri satu panggilan repository yang atomisitasnya hanya bisa
// dibuktikan terhadap PostgreSQL (auth-account-db.test.ts); yang bisa salah di
// lapisan ini adalah keputusan — cara pembuktian mana yang diterima, kapan
// ditolak, dan apa yang tercatat saat ditolak.
import { describe, it, expect, vi } from "vitest";
import { AUDIT_ACTION } from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import { createAccountService } from "../src/modules/auth/index.js";
import type { AuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";

const USER_ID = "01912345-89ab-7def-8123-000000000001";
const REQUEST_ID = "01912345-89ab-7def-8123-0000000000ff";
const PHONE = "+6281234567890";
const GOOGLE_ID = "google-sub-abc";

const actor = { userId: USER_ID, requestId: REQUEST_ID };

interface KonteksAkun {
  phone: string | null;
  googleId: string | null;
}

/**
 * Repository palsu: hanya dua metode yang dipakai jalur ini. Sisanya meledak,
 * supaya pemakaian tak sengaja terlihat sebagai kegagalan test — bukan lolos
 * diam-diam lewat stub yang mengembalikan undefined.
 */
function fakeUserRepository(konteks: KonteksAkun | null, hasilHapus?: { revokedCount: number }) {
  const dipanggil = { hapus: 0 };
  const repository = {
    async findDeleteContext() {
      return konteks === null ? null : { id: USER_ID, ...konteks };
    },
    async deleteAccount() {
      dipanggil.hapus += 1;
      return hasilHapus === undefined ? null : { tokenVersion: 4, ...hasilHapus };
    },
  } as unknown as AuthUserRepository;
  return { repository, dipanggil };
}

function fakeAudit() {
  const entri: Array<{ action: string; entityId: string | null; meta: unknown }> = [];
  const auditLog = vi.fn((_actor, action, _entity, entityId, meta) => {
    entri.push({ action: action as string, entityId, meta });
  });
  const tahap = () =>
    entri
      .filter((e) => e.action === AUDIT_ACTION.ACCOUNT_DELETED)
      .map((e) => (e.meta as { stage: string }).stage);
  return { auditLog: auditLog as never, entri, tahap };
}

/** Verifier + exchange Google palsu; `sub` yang dikembalikan bisa diatur. */
function fakeGoogle(googleId: string) {
  const dipanggil = { tukar: 0 };
  return {
    exchange: {
      async exchange() {
        dipanggil.tukar += 1;
        return "id-token-palsu";
      },
    },
    verifier: {
      async verify() {
        return { googleId, email: "orang@contoh.id", fullName: "Orang Uji" };
      },
    },
    dipanggil,
  };
}

const GOOGLE_INPUT = {
  code: "kode-google",
  codeVerifier: "a".repeat(43),
  redirectUri: "http://localhost:5173/masuk/google",
};

describe("hapus akun — jalur kode OTP", () => {
  it("mencocokkan kode ke nomor MILIK AKUN, bukan nomor dari input", async () => {
    // Ini bentuk paling penting dari "user A tidak bisa menghapus user B":
    // nomor yang dikirimi tantangan datang dari baris akun, dan body permintaan
    // tidak punya field untuk menyebut nomor lain sama sekali.
    const { repository, dipanggil } = fakeUserRepository(
      { phone: PHONE, googleId: null },
      { revokedCount: 3 },
    );
    const konfirmasiKode = vi.fn(async () => {});
    const audit = fakeAudit();

    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode },
      auditLog: audit.auditLog,
    });

    const hasil = await service.deleteAccount(actor, { otpCode: "482913" });

    expect(konfirmasiKode).toHaveBeenCalledWith(PHONE, "482913", { requestId: REQUEST_ID });
    expect(dipanggil.hapus).toBe(1);
    expect(hasil.revokedCount).toBe(3);
  });

  it("mencatat requested lalu completed, dengan jumlah sesi yang dicabut", async () => {
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null }, { revokedCount: 2 });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "482913" });

    expect(audit.tahap()).toEqual(["requested", "completed"]);
    expect(audit.entri.at(-1)?.meta).toEqual({
      stage: "completed",
      method: "otp",
      revokedCount: 2,
    });
  });

  it("kode salah → tidak menghapus apa pun, dan tercatat sebagai rejected", async () => {
    const { repository, dipanggil } = fakeUserRepository({ phone: PHONE, googleId: null });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: {
        konfirmasiKode: async () => {
          throw new AppError("KODE_OTP_SALAH");
        },
      },
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "000000" })).rejects.toMatchObject({
      code: "KODE_OTP_SALAH",
    });
    expect(dipanggil.hapus).toBe(0);
    expect(audit.tahap()).toEqual(["rejected"]);
    expect(audit.entri[0]?.meta).toEqual({ stage: "rejected", method: "otp" });
  });

  it("akun tanpa nomor → ditolak dengan saran memakai Google", async () => {
    const { repository, dipanggil } = fakeUserRepository({ phone: null, googleId: GOOGLE_ID });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    const err = await service.deleteAccount(actor, { otpCode: "482913" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("CARA_KONFIRMASI_TIDAK_COCOK");
    // Pesan buntu memaksa pengguna menebak; hint menyebut jalan yang ADA.
    expect((err as AppError).hint).toContain("Google");
    expect(dipanggil.hapus).toBe(0);
    expect(audit.tahap()).toEqual(["rejected"]);
  });

  it("OTP mati di server → 503, BUKAN melewatkan pembuktian", async () => {
    // Kegagalan yang paling berbahaya untuk kontrol seperti ini adalah gagal
    // terbuka: fitur pembuktian mati, dan penghapusan tetap berjalan.
    const { repository, dipanggil } = fakeUserRepository({ phone: PHONE, googleId: null });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: undefined,
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "482913" })).rejects.toMatchObject({
      code: "KONFIRMASI_TIDAK_TERSEDIA",
    });
    expect(dipanggil.hapus).toBe(0);
  });
});

describe("hapus akun — jalur Google", () => {
  it("sub cocok → akun dihapus", async () => {
    const { repository, dipanggil } = fakeUserRepository(
      { phone: null, googleId: GOOGLE_ID },
      { revokedCount: 1 },
    );
    const google = fakeGoogle(GOOGLE_ID);
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google,
      auditLog: audit.auditLog,
    });

    await service.deleteAccount(actor, { google: GOOGLE_INPUT });

    expect(google.dipanggil.tukar).toBe(1);
    expect(dipanggil.hapus).toBe(1);
    expect(audit.tahap()).toEqual(["requested", "completed"]);
    expect(audit.entri.at(-1)?.meta).toMatchObject({ method: "google" });
  });

  it("sub milik akun Google LAIN → ditolak, tidak menghapus apa pun", async () => {
    // Consent-nya sah dan tanda tangannya benar; yang salah adalah pemiliknya.
    // Tanpa perbandingan ini, siapa pun yang bisa menyelesaikan alur Google —
    // dengan akun Google-nya sendiri — bisa menghapus akun orang lain yang
    // access token-nya ia pegang.
    const { repository, dipanggil } = fakeUserRepository({ phone: null, googleId: GOOGLE_ID });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google: fakeGoogle("google-sub-penyerang"),
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { google: GOOGLE_INPUT })).rejects.toMatchObject({
      code: "KONFIRMASI_GOOGLE_BEDA_AKUN",
    });
    expect(dipanggil.hapus).toBe(0);
    expect(audit.tahap()).toEqual(["rejected"]);
  });

  it("akun tanpa tautan Google → ditolak dengan saran memakai OTP", async () => {
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google: fakeGoogle(GOOGLE_ID),
      auditLog: audit.auditLog,
    });

    const err = await service
      .deleteAccount(actor, { google: GOOGLE_INPUT })
      .catch((e: unknown) => e);

    expect((err as AppError).code).toBe("CARA_KONFIRMASI_TIDAK_COCOK");
    expect((err as AppError).hint).toContain("OTP");
  });

  it("kredensial Google kosong di server → 503, bukan lolos", async () => {
    const { repository, dipanggil } = fakeUserRepository({ phone: null, googleId: GOOGLE_ID });
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      google: undefined,
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { google: GOOGLE_INPUT })).rejects.toMatchObject({
      code: "KONFIRMASI_TIDAK_TERSEDIA",
    });
    expect(dipanggil.hapus).toBe(0);
  });
});

describe("hapus akun — keadaan akun", () => {
  it("akun sudah tidak aktif → sesi tidak valid, tanpa menyentuh pembuktian", async () => {
    const { repository } = fakeUserRepository(null);
    const konfirmasiKode = vi.fn(async () => {});
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode },
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "482913" })).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
    expect(konfirmasiKode).not.toHaveBeenCalled();
    // Tidak ada `rejected`: tidak ada yang mencoba membuktikan apa pun.
    expect(audit.tahap()).toEqual([]);
  });

  it("kalah balapan dengan permintaan hapus lain → tidak mencatat completed", async () => {
    // deleteAccount mengembalikan null saat barisnya sudah tidak aktif. Mencatat
    // `completed` di situ akan membuat audit mengklaim penghapusan yang
    // dilakukan permintaan LAIN — dan menghitung ganda jumlah sesi tercabut.
    const { repository } = fakeUserRepository({ phone: PHONE, googleId: null }, undefined);
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    await expect(service.deleteAccount(actor, { otpCode: "482913" })).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
    expect(audit.tahap()).toEqual(["requested"]);
  });
});

describe("hapus akun — audit bebas PII", () => {
  it("tidak pernah mencatat nomor, googleId, atau email", async () => {
    // audit_logs bertahan 2 tahun (SDD §6.4) — jauh melewati baris users yang
    // memilikinya. Menaruh nomor di sana berarti hak hapus PDP tidak benar-benar
    // menghapus, dan tidak ada yang akan menyadarinya.
    const { repository } = fakeUserRepository(
      { phone: PHONE, googleId: GOOGLE_ID },
      { revokedCount: 1 },
    );
    const audit = fakeAudit();
    const service = createAccountService({
      userRepository: repository,
      otp: { konfirmasiKode: async () => {} },
      auditLog: audit.auditLog,
    });

    await service.deleteAccount(actor, { otpCode: "482913" });

    const semua = JSON.stringify(audit.entri);
    expect(semua).not.toContain(PHONE);
    expect(semua).not.toContain(GOOGLE_ID);
    expect(semua).not.toContain("482913");
    // Yang boleh ada: id akun (bukan PII) sebagai entityId.
    expect(audit.entri.every((e) => e.entityId === USER_ID)).toBe(true);
  });
});
