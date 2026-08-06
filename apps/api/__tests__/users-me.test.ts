// Unit service profil akun (PR-020).
//
// Yang diuji di sini adalah keputusan-keputusan yang tidak terlihat dari HTTP:
// kapan audit email menyala, apa yang dibawa meta-nya, dan bahwa kolom internal
// tidak punya jalan keluar dari pemetaan.
import { describe, it, expect } from "vitest";
import type { AuditAction } from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import { createUsersService } from "../src/modules/users/index.js";
import {
  EmailSudahDipakaiError,
  type UserProfileRepository,
  type UserProfileRow,
} from "../src/modules/users/index.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const REQUEST_ID = "018f4c1e-0000-7000-8000-00000000ffff";
const actor = { userId: USER_ID, requestId: REQUEST_ID };

function baris(overrides: Partial<UserProfileRow> = {}): UserProfileRow {
  return {
    id: USER_ID,
    fullName: "Rina Pratiwi",
    email: null,
    phone: "+6281234567890",
    role: "seeker",
    createdAt: new Date("2026-08-01T03:00:00.000Z"),
    ...overrides,
  };
}

interface Audit {
  action: AuditAction;
  entityId: string | null;
  meta: unknown;
}

/** Repository palsu; `emailBentrok` meniru wasit index parsial migrasi 06. */
function rakit(options: { row?: UserProfileRow | null; emailBentrok?: boolean } = {}) {
  const audit: Audit[] = [];
  const tersimpan: Array<{ fullName: string; email?: string | null }> = [];
  const awal = options.row === undefined ? baris() : options.row;

  const userRepository: UserProfileRepository = {
    findActiveById: () => Promise.resolve(awal),
    updateProfile: (_id, data) => {
      if (options.emailBentrok === true) return Promise.reject(new EmailSudahDipakaiError());
      tersimpan.push(data);
      if (awal === null) return Promise.resolve(null);
      return Promise.resolve({
        ...awal,
        fullName: data.fullName,
        email: data.email === undefined ? awal.email : data.email,
      });
    },
  };

  const service = createUsersService({
    userRepository,
    auditLog: (_actor, action, _entity, entityId, meta) => {
      audit.push({ action, entityId, meta });
    },
  });
  return { service, audit, tersimpan };
}

describe("getMe", () => {
  it("memetakan baris DB ke kontrak API (createdAt jadi ISO)", async () => {
    const { service } = rakit();
    await expect(service.getMe(actor)).resolves.toEqual({
      id: USER_ID,
      fullName: "Rina Pratiwi",
      email: null,
      phone: "+6281234567890",
      role: "seeker",
      createdAt: "2026-08-01T03:00:00.000Z",
    });
  });

  it("tidak membawa field internal meski repository mengembalikannya", async () => {
    // Simulasi kolom yang kelak ikut terbawa repository — pemetaan service
    // adalah lapisan kedua yang menahannya.
    const bocor = { ...baris(), tokenVersion: 7, googleId: "google-123", deletedAt: null };
    const { service } = rakit({ row: bocor as UserProfileRow });

    const profil = await service.getMe(actor);

    expect(Object.keys(profil).sort()).toEqual([
      "createdAt",
      "email",
      "fullName",
      "id",
      "phone",
      "role",
    ]);
  });

  it("akun hilang di antara guard dan query → SESI_TIDAK_VALID", async () => {
    const { service } = rakit({ row: null });
    await expect(service.getMe(actor)).rejects.toMatchObject({ code: "SESI_TIDAK_VALID" });
  });
});

describe("updateMe — email tidak dikirim", () => {
  it("kolom email tidak disentuh (undefined diteruskan apa adanya)", async () => {
    const { service, tersimpan } = rakit({ row: baris({ email: "lama@contoh.id" }) });

    const profil = await service.updateMe(actor, { fullName: "Rina P." });

    expect(tersimpan[0]).toEqual({ fullName: "Rina P.", email: undefined });
    expect(profil.email).toBe("lama@contoh.id");
  });

  it("TIDAK menulis audit — menyimpan nama bukan perubahan email", async () => {
    const { service, audit } = rakit({ row: baris({ email: "lama@contoh.id" }) });
    await service.updateMe(actor, { fullName: "Rina P." });
    expect(audit).toHaveLength(0);
  });
});

describe("updateMe — audit perubahan email (AC)", () => {
  it("mengisi email pertama kali → hadPreviousEmail false", async () => {
    const { service, audit } = rakit({ row: baris({ email: null }) });

    await service.updateMe(actor, { fullName: "Rina", email: "baru@contoh.id" });

    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual({
      action: "ACCOUNT_EMAIL_CHANGED",
      entityId: USER_ID,
      meta: { hadPreviousEmail: false, cleared: false },
    });
  });

  it("mengganti email → hadPreviousEmail true", async () => {
    const { service, audit } = rakit({ row: baris({ email: "lama@contoh.id" }) });
    await service.updateMe(actor, { fullName: "Rina", email: "baru@contoh.id" });
    expect(audit[0]?.meta).toEqual({ hadPreviousEmail: true, cleared: false });
  });

  it("mengosongkan email → cleared true", async () => {
    const { service, audit } = rakit({ row: baris({ email: "lama@contoh.id" }) });
    await service.updateMe(actor, { fullName: "Rina", email: null });
    expect(audit[0]?.meta).toEqual({ hadPreviousEmail: true, cleared: true });
  });

  it("mengirim email yang SAMA persis → tidak ada audit", async () => {
    const { service, audit } = rakit({ row: baris({ email: "sama@contoh.id" }) });
    await service.updateMe(actor, { fullName: "Rina", email: "sama@contoh.id" });
    expect(audit).toHaveLength(0);
  });

  it("alamat email TIDAK PERNAH masuk isi audit", async () => {
    const { service, audit } = rakit({ row: baris({ email: "lama@contoh.id" }) });
    await service.updateMe(actor, { fullName: "Rina", email: "rahasia@contoh.id" });

    const teks = JSON.stringify(audit);
    expect(teks).not.toContain("rahasia@contoh.id");
    expect(teks).not.toContain("lama@contoh.id");
  });
});

describe("updateMe — email bentrok", () => {
  it("pelanggaran unique index → 409 EMAIL_TIDAK_BISA_DIPAKAI", async () => {
    const { service } = rakit({ emailBentrok: true });

    const err = await service
      .updateMe(actor, { fullName: "Rina", email: "dipakai@contoh.id" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("EMAIL_TIDAK_BISA_DIPAKAI");
    expect((err as AppError).status).toBe(409);
  });

  it("pesan penolakan tidak memastikan akun lain itu ada", async () => {
    const { service } = rakit({ emailBentrok: true });
    const err = (await service
      .updateMe(actor, { fullName: "Rina", email: "dipakai@contoh.id" })
      .catch((e: unknown) => e)) as AppError;

    // "sudah terdaftar" akan menjadikan endpoint ini alat memeriksa siapa saja
    // yang punya akun di Nawasena.
    expect(err.message).not.toMatch(/terdaftar|sudah dipakai|akun lain/i);
    expect(err.envelope.hint?.length ?? 0).toBeGreaterThan(0);
  });

  it("bentrok → tidak ada audit yang tertulis", async () => {
    const { service, audit } = rakit({ emailBentrok: true });
    await service.updateMe(actor, { fullName: "Rina", email: "dipakai@contoh.id" }).catch(() => {});
    expect(audit).toHaveLength(0);
  });
});
