// Unit ekspor data pribadi (PR-022) — agregator, kontributor, dan kuota.
//
// Yang diuji di sini adalah keputusannya: apa yang masuk berkas, apa yang tidak
// pernah boleh masuk, dan apa yang terjadi saat kontributor tidak sesuai
// kontrak. Bentuk berkas yang benar-benar sampai ke klien diuji lewat HTTP
// (users-export-http.test.ts).
import { describe, it, expect, vi } from "vitest";
import {
  ACCESSIBILITY_PROFILE_KOSONG,
  AUDIT_ACTION,
  EXPORT_FORMAT_VERSION,
  SEEKER_PROFILE_KOSONG,
  type ExportProfile,
} from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import {
  createAccountContributor,
  createExportQuotaRepository,
  createExportService,
  EXPORT_POLICY,
  type ExportContributor,
} from "../src/modules/users/index.js";
import type { ExportRedisLike } from "../src/modules/users/repositories/export-quota.repository.js";
import type { ExportAccountRow } from "../src/modules/users/repositories/user.repository.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const REQUEST_ID = "018f4c1e-0000-7000-8000-0000000000ff";
const actor = { userId: USER_ID, requestId: REQUEST_ID };

const EMAIL = "rina@contoh.id";
const PHONE = "+6281234567890";
const GOOGLE_ID = "google-sub-rina";

function barisAkun(ubah: Partial<ExportAccountRow> = {}): ExportAccountRow {
  return {
    id: USER_ID,
    fullName: "Rina Pratiwi",
    email: EMAIL,
    emailVerified: true,
    phone: PHONE,
    role: "seeker",
    createdAt: new Date("2026-08-01T03:00:00.000Z"),
    googleId: GOOGLE_ID,
    ...ubah,
  };
}

/**
 * Bagian `profile` sekadar cukup untuk memenuhi kontrak (PR-038).
 *
 * Berkas ekspor kini WAJIB memuatnya, jadi test yang merakit ekspor harus
 * menyediakannya — dan itu memang gunanya field wajib. Isi sungguhannya diuji di
 * career-export.test.ts; di sini yang diuji adalah agregatornya.
 */
const PROFIL_KOSONG: ExportProfile = {
  ...SEEKER_PROFILE_KOSONG,
  experiences: [],
  educations: [],
  skills: [],
};

const kontributorProfil: ExportContributor = {
  bagian: "profile",
  kumpulkan: async () => PROFIL_KOSONG,
};

/**
 * Dua bagian yang lahir 2026-09-05 (utang U-03 & U-04). Keduanya WAJIB di
 * `dataExportSchema`, jadi setiap perakitan di berkas ini harus menyertakannya —
 * dan itu memang yang diinginkan: kontrak yang menuntut bagian baru membuat test
 * lama MERAH alih-alih diam-diam meloloskan berkas yang kekurangan.
 */
const kontributorAksesibilitas: ExportContributor = {
  bagian: "accessibility",
  kumpulkan: async () => ({ ...ACCESSIBILITY_PROFILE_KOSONG }),
};

const kontributorNotifikasi: ExportContributor = {
  bagian: "notifications",
  kumpulkan: async () => [],
};

/** Ketiga kontributor modul lain — urutannya sama dengan boot.ts. */
const KONTRIBUTOR_MODUL = [
  kontributorProfil,
  kontributorAksesibilitas,
  kontributorNotifikasi,
] as const;

/** Redis in-memory seukuran kebutuhan repository kuota. */
function fakeRedis(): ExportRedisLike & { nilai: Map<string, number>; ttlNilai: Map<string, number> } {
  const nilai = new Map<string, number>();
  const ttlNilai = new Map<string, number>();
  return {
    nilai,
    ttlNilai,
    async incr(key) {
      const next = (nilai.get(key) ?? 0) + 1;
      nilai.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      ttlNilai.set(key, seconds);
      return 1;
    },
    async ttl(key) {
      return ttlNilai.get(key) ?? -1;
    },
  };
}

function fakeAudit() {
  const entri: Array<{ action: string; entityId: string | null; meta: unknown }> = [];
  const auditLog = vi.fn((_actor, action, _entity, entityId, meta) => {
    entri.push({ action: action as string, entityId, meta });
  });
  return { auditLog: auditLog as never, entri };
}

function rakit(options: { contributors?: readonly ExportContributor[]; redis?: ExportRedisLike } = {}) {
  const audit = fakeAudit();
  const redis = options.redis ?? fakeRedis();
  const service = createExportService({
    contributors: options.contributors ?? [
      createAccountContributor({ findAccountForExport: async () => barisAkun() }),
      ...KONTRIBUTOR_MODUL,
    ],
    quotaRepository: createExportQuotaRepository(redis),
    auditLog: audit.auditLog,
    clock: () => new Date("2026-08-07T10:00:00.000Z"),
  });
  return { service, audit, redis };
}

describe("kontributor account", () => {
  it("memetakan baris DB menjadi kontrak, bukan meneruskannya", async () => {
    const kontributor = createAccountContributor({ findAccountForExport: async () => barisAkun() });

    const hasil = await kontributor.kumpulkan(USER_ID);

    expect(hasil).toEqual({
      id: USER_ID,
      fullName: "Rina Pratiwi",
      email: EMAIL,
      emailVerified: true,
      phone: PHONE,
      role: "seeker",
      createdAt: "2026-08-01T03:00:00.000Z",
      authMethods: ["otp", "google"],
    });
  });

  it("google_id TIDAK pernah keluar — hanya diturunkan jadi cara masuk", async () => {
    // Pengenal opaque milik Google: tidak berarti apa pun bagi pengguna, dan ia
    // tautan kredensial. Yang ingin diketahui orang saat membaca ekspornya
    // adalah "bagaimana saya masuk", bukan nomor internal provider.
    const kontributor = createAccountContributor({ findAccountForExport: async () => barisAkun() });

    const hasil = await kontributor.kumpulkan(USER_ID);

    expect(JSON.stringify(hasil)).not.toContain(GOOGLE_ID);
    expect(hasil).not.toHaveProperty("googleId");
  });

  it("cara masuk mengikuti kredensial yang benar-benar dimiliki", async () => {
    const hanyaOtp = createAccountContributor({
      findAccountForExport: async () => barisAkun({ googleId: null }),
    });
    const hanyaGoogle = createAccountContributor({
      findAccountForExport: async () => barisAkun({ phone: null }),
    });

    expect(await hanyaOtp.kumpulkan(USER_ID)).toMatchObject({ authMethods: ["otp"] });
    expect(await hanyaGoogle.kumpulkan(USER_ID)).toMatchObject({ authMethods: ["google"] });
  });

  it("akun tidak aktif → sesi tidak valid", async () => {
    const kontributor = createAccountContributor({ findAccountForExport: async () => null });

    await expect(kontributor.kumpulkan(USER_ID)).rejects.toMatchObject({
      code: "SESI_TIDAK_VALID",
    });
  });
});

describe("agregator ekspor", () => {
  it("berkas memuat versi, waktu, dan bagian dari tiap kontributor", async () => {
    const { service } = rakit();

    const berkas = await service.exportMe(actor);

    expect(berkas.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(berkas.exportedAt).toBe("2026-08-07T10:00:00.000Z");
    expect(berkas.account.id).toBe(USER_ID);
  });

  it("kontributor yang belum punya tempat di kontrak MENGGAGALKAN permintaan", async () => {
    // Inilah alasan `dataExportSchema` memakai `.strict()`. Objek zod yang
    // longgar akan membuang bagian ini diam-diam: modul baru mendaftar, tidak
    // ada yang error, dan pengguna menerima ekspor yang kekurangan datanya
    // tanpa satu pun sinyal.
    const { service } = rakit({
      contributors: [
        createAccountContributor({ findAccountForExport: async () => barisAkun() }),
        ...KONTRIBUTOR_MODUL,
        { bagian: "resumes", kumpulkan: async () => [{ id: "cv-1" }] },
      ],
    });

    await expect(service.exportMe(actor)).rejects.toThrow();
  });

  it("kontributor yang menghasilkan bentuk salah juga menggagalkan", async () => {
    const { service } = rakit({
      contributors: [
        { bagian: "account", kumpulkan: async () => ({ id: "bukan-uuid" }) },
        ...KONTRIBUTOR_MODUL,
      ],
    });

    await expect(service.exportMe(actor)).rejects.toThrow();
  });

  it("bagian dirakit sesuai urutan kontributor", async () => {
    // Urutan key menentukan bagaimana berkas terbaca manusia; `account` harus
    // di atas supaya pembaca menemukan identitas pemiliknya lebih dulu.
    //
    // Urutannya ditentukan DEKLARASI `dataExportSchema`, bukan urutan
    // kontributor: `parse` merakit ulang objeknya mengikuti bentuk skema. Jadi
    // menambah bagian baru di tengah skema akan menggesernya di berkas yang
    // dibaca pengguna — dan itulah yang test ini tangkap.
    const { service } = rakit();

    const berkas = await service.exportMe(actor);

    expect(Object.keys(berkas)).toEqual([
      "formatVersion",
      "exportedAt",
      "account",
      "profile",
      "accessibility",
      "notifications",
    ]);
  });
});

describe("audit ekspor", () => {
  it("setiap ekspor tercatat dengan versi dan daftar bagian", async () => {
    const { service, audit } = rakit();

    await service.exportMe(actor);

    expect(audit.entri).toHaveLength(1);
    expect(audit.entri[0]).toMatchObject({
      action: AUDIT_ACTION.DATA_EXPORTED,
      entityId: USER_ID,
      meta: {
        format: "json",
        formatVersion: EXPORT_FORMAT_VERSION,
        sections: ["account", "profile", "accessibility", "notifications"],
      },
    });
  });

  it("isi data TIDAK pernah masuk audit", async () => {
    // audit_logs bertahan 2 tahun (SDD §6.4) — jauh melewati baris yang
    // memilikinya. Mencatat isi ekspor berarti menyalin seluruh data pribadi
    // seseorang ke tabel yang tidak ikut terhapus saat ia menghapus akunnya.
    const { service, audit } = rakit();

    await service.exportMe(actor);

    const semua = JSON.stringify(audit.entri);
    expect(semua).not.toContain(EMAIL);
    expect(semua).not.toContain(PHONE);
    expect(semua).not.toContain("Rina");
  });

  it("ekspor yang ditolak kuota TIDAK dicatat sebagai ekspor", async () => {
    const { service, audit } = rakit();
    for (let i = 0; i < EXPORT_POLICY.maxPerWindow; i += 1) await service.exportMe(actor);

    await service.exportMe(actor).catch(() => undefined);

    // Tepat tiga — yang keempat tidak pernah menghasilkan berkas apa pun.
    expect(audit.entri).toHaveLength(EXPORT_POLICY.maxPerWindow);
  });
});

describe("kuota ekspor", () => {
  it("tiga kali lolos, keempat ditolak dengan sisa jendela", async () => {
    const { service } = rakit();
    for (let i = 0; i < EXPORT_POLICY.maxPerWindow; i += 1) {
      await expect(service.exportMe(actor)).resolves.toBeDefined();
    }

    const err = await service.exportMe(actor).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("TERLALU_BANYAK_PERMINTAAN");
    expect((err as AppError).retryAfterSeconds).toBe(EXPORT_POLICY.windowSeconds);
    // Pesan menyebut apa yang terjadi dan apa yang bisa dilakukan — ia
    // dibacakan screen reader apa adanya.
    expect((err as AppError).hint).toMatch(/besok|simpan/i);
  });

  it("kuota diperiksa SEBELUM satu pun data dibaca", async () => {
    // Endpoint ini menyentuh banyak tabel. Menolak setelah bekerja berarti
    // biaya penyalahgunaan tetap dibayar server.
    const dasar = createAccountContributor({ findAccountForExport: async () => barisAkun() });
    const kumpulkan = vi.fn((userId: string) => dasar.kumpulkan(userId));
    const { service } = rakit({ contributors: [{ bagian: "account", kumpulkan }, ...KONTRIBUTOR_MODUL] });

    for (let i = 0; i < EXPORT_POLICY.maxPerWindow; i += 1) await service.exportMe(actor);
    expect(kumpulkan).toHaveBeenCalledTimes(EXPORT_POLICY.maxPerWindow); // spy benar tersambung
    kumpulkan.mockClear();

    await service.exportMe(actor).catch(() => undefined);

    expect(kumpulkan).not.toHaveBeenCalled();
  });

  it("kuota terpisah per pengguna", async () => {
    const { service } = rakit();
    const lain = { userId: "018f4c1e-0000-7000-8000-00000000bbbb", requestId: REQUEST_ID };
    for (let i = 0; i < EXPORT_POLICY.maxPerWindow; i += 1) await service.exportMe(actor);

    // Jatah pengguna lain tidak ikut habis — kalau ikut, satu pengguna bisa
    // mengunci hak PDP seluruh platform dengan tiga permintaan.
    await expect(service.exportMe(lain)).resolves.toBeDefined();
  });
});

describe("repository kuota", () => {
  it("memasang TTL hanya pada kenaikan pertama", async () => {
    const redis = fakeRedis();
    const repo = createExportQuotaRepository(redis);

    const pertama = await repo.bump(USER_ID, 100);
    redis.ttlNilai.set(`pdp:export:${USER_ID}`, 40); // waktu berjalan
    const kedua = await repo.bump(USER_ID, 100);

    expect(pertama).toEqual({ value: 1, resetInSeconds: 100 });
    // Jendela BERGERAK MAJU: TTL tidak diperpanjang, jadi Retry-After yang
    // dilaporkan ke pengguna selalu jujur.
    expect(kedua).toEqual({ value: 2, resetInSeconds: 40 });
  });

  it("kunci tanpa TTL dipasangi ulang — tidak boleh mengunci pengguna selamanya", async () => {
    const redis = fakeRedis();
    const repo = createExportQuotaRepository(redis);
    await repo.bump(USER_ID, 100);
    // Meniru EXPIRE yang gagal saat Redis sekarat: kunci hidup tanpa umur.
    redis.ttlNilai.delete(`pdp:export:${USER_ID}`);

    const hasil = await repo.bump(USER_ID, 100);

    expect(hasil.resetInSeconds).toBe(100);
    expect(redis.ttlNilai.get(`pdp:export:${USER_ID}`)).toBe(100);
  });

  it("kunci memuat userId apa adanya — bukan PII, dan operasi perlu membacanya", async () => {
    const redis = fakeRedis();
    await createExportQuotaRepository(redis).bump(USER_ID, 100);

    expect([...redis.nilai.keys()]).toEqual([`pdp:export:${USER_ID}`]);
  });
});
