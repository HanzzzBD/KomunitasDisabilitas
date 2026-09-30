// Integration mesin skor (PR-071) — profil TERENKRIPSI nyata di PostgreSQL.
// Skip anggun bila DB tidak terjangkau.
//
// Unit test memakai pembaca akomodasi palsu, jadi ia tidak bisa membuktikan
// bahwa jalur sungguhan — ciphertext AES-256-GCM di kolom `bytea`, gerbang
// consent, dan audit agregat tujuan `matching` — benar-benar menghasilkan
// kebutuhan yang dipakai hard filter. Berkas ini membuktikannya ujung ke ujung:
// tulis lewat `profiles.service` → baca lewat `sensitiveAccess.bacaSensitif` →
// hard filter + skor.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createFieldCrypto, parseFieldKeys } from "../src/core/crypto/index.js";
import {
  createProfileRepository,
  createProfilesService,
  createSensitiveAccess,
} from "../src/modules/profiles/index.js";
import {
  ALASAN_AKSES_MATCHING,
  BOBOT_SKOR_SDD,
  createPembacaAkomodasi,
  createPenilaianService,
  type LowonganUntukSkor,
} from "../src/modules/matching/index.js";
import { busUji } from "./helpers/events.js";

const prisma = new PrismaClient();
let dbTersedia = false;

const crypto = createFieldCrypto(
  parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 7).toString("base64") }),
);
const jejak: Array<{ action: string; entityId: string | null; meta: unknown }> = [];
const auditLog = (
  _a: unknown,
  action: string,
  _e: string,
  entityId: string | null,
  meta: unknown,
) => void jejak.push({ action, entityId, meta });

const profileRepository = createProfileRepository(prisma as unknown as AppPrisma);
const profiles = createProfilesService({ profileRepository, crypto, auditLog, events: busUji() });
const sensitiveAccess = createSensitiveAccess({ profileRepository, crypto, auditLog });
const penilaian = createPenilaianService({
  akomodasi: createPembacaAkomodasi({ sensitiveAccess }),
  bobot: BOBOT_SKOR_SDD,
  paruhKebaruanHari: 14,
  clock: () => new Date("2026-09-30T00:00:00.000Z"),
});

const user = uuidV7();
const aktor = { userId: user, requestId: "req-pr071" };

const kandidat = (
  id: string,
  accommodations: LowonganUntukSkor["accommodations"],
): LowonganUntukSkor => ({
  jobId: id,
  kemiripan: 0.8,
  workMode: "remote",
  city: null,
  province: null,
  accommodations,
  publishedAt: new Date("2026-09-29T00:00:00.000Z"),
});
const KANDIDAT = [
  kandidat("job-lengkap", ["akses_kursi_roda", "jam_kerja_fleksibel", "ruang_kerja_tenang"]),
  kandidat("job-sebagian", ["akses_kursi_roda"]),
  kandidat("job-tanpa", []),
];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test skor dilewati.");
    return;
  }
  await prisma.user.create({
    data: { id: user, phone: "+628690710000001", fullName: "Uji PR-071" },
  });
});

afterAll(async () => {
  if (dbTersedia) await prisma.user.deleteMany({ where: { id: user } });
  await prisma.$disconnect();
});

describe("penilaian — profil terenkripsi nyata", () => {
  it("kebutuhan wajib dari kolom bytea terenkripsi menyaring kandidat yang tidak memenuhinya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await profiles.updateMe(aktor, {
      openToRemote: true,
      consentSensitive: true,
      disabilityTypes: ["daksa"],
      accommodationNeeds: {
        tags: ["akses_kursi_roda", "jam_kerja_fleksibel"],
        notes: "RAHASIA-PR071",
      },
    });
    // Benar-benar ciphertext di DB — bukan teks yang kebetulan lolos.
    const [mentah] = await prisma.$queryRaw<Array<{ teks: string }>>`
      SELECT encode(accommodation_needs, 'escape') AS teks FROM seeker_profiles WHERE user_id = ${user}::uuid`;
    expect(mentah?.teks).not.toContain("akses_kursi_roda");

    const hasil = await penilaian.nilai(
      aktor,
      { city: null, province: null, openToRemote: true },
      KANDIDAT,
    );

    expect(hasil.map((h) => h.jobId)).toEqual(["job-lengkap"]);
    expect(JSON.stringify(hasil)).not.toMatch(/daksa|RAHASIA-PR071/);
  });

  it("pembacaan tercatat sebagai audit AGREGAT tujuan matching (tanpa subjek per baris)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    jejak.length = 0;
    await penilaian.nilai(aktor, { city: null, province: null, openToRemote: true }, KANDIDAT);
    await penilaian.nilai(aktor, { city: null, province: null, openToRemote: true }, KANDIDAT);
    expect(jejak).toEqual([]); // masih di ember, belum per panggilan

    sensitiveAccess.flushAudit();
    const agregat = jejak.filter((j) => (j.meta as { purpose?: string }).purpose === "matching");
    expect(agregat).toHaveLength(1);
    expect(agregat[0]).toMatchObject({
      entityId: null,
      meta: { purpose: "matching", reason: ALASAN_AKSES_MATCHING },
    });
    expect((agregat[0]!.meta as { count: number }).count).toBeGreaterThanOrEqual(2);
  });

  it("consent dicabut → tanpa data → netral: tidak ada yang tersaring", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await profiles.updateMe(aktor, { consentSensitive: false });

    const hasil = await penilaian.nilai(
      aktor,
      { city: null, province: null, openToRemote: true },
      KANDIDAT,
    );
    expect(hasil.map((h) => h.jobId).sort()).toEqual(["job-lengkap", "job-sebagian", "job-tanpa"]);
  });
});
