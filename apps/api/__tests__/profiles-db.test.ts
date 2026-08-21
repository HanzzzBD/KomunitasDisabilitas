// Integration DB profil pencari kerja (PR-037) — PostgreSQL sungguhan.
//
// KENAPA FILE INI ADA DI SAMPING profiles-http.test.ts. Yang di sana memakai
// tabel palsu di memori, jadi ia membuktikan alur endpoint tetapi TIDAK bisa
// membuktikan dua hal yang justru menjadi inti PR ini:
//
//   1. Apa yang benar-benar mendarat di kolom `bytea`. Fake yang menyimpan
//      Buffer apa adanya akan lulus meski Prisma sesungguhnya menuliskan
//      sesuatu yang lain. AC-1 menuntut pembacaan MENTAH dari database.
//   2. Bahwa penjaga consent berjalan di dalam satu transaksi sungguhan —
//      `$transaction` palsu hanya memanggil callback-nya.
//
// Pola skip anggun sama dengan db-seeker.test.ts (PR-010): tanpa DB, file ini
// dilewati; CI selalu punya service Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createFieldCrypto, parseFieldKeys } from "../src/core/crypto/index.js";
import { createProfileRepository } from "../src/modules/profiles/repositories/profile.repository.js";
import {
  createProfilesService,
  type ProfilesActor,
} from "../src/modules/profiles/services/profiles.service.js";
import { AppError } from "../src/core/http/index.js";
import { busUji } from "./helpers/events.js";

const prisma = new PrismaClient();
let dbTersedia = false;

/** Kunci dev-only deterministik — sama polanya dengan crypto.test.ts. */
const crypto = createFieldCrypto(
  parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 5).toString("base64") }),
);

interface Jejak {
  action: string;
  meta: unknown;
}

const audit: Jejak[] = [];

const service = createProfilesService({
  profileRepository: createProfileRepository(prisma as unknown as AppPrisma),
  crypto,
  auditLog: (_actor, action, _entity, _entityId, meta) => audit.push({ action, meta }),
  // Bus nyata tanpa pelanggan (PR-038): `emit` menjadi no-op yang tetap bertipe
  // benar. Yang menguji penerbitannya adalah career-http.test.ts.
  events: busUji(),
});

/** Nomor uji berprefiks khusus supaya pembersihan tidak menyentuh data lain. */
const PREFIX_UJI = "+62887";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test profil dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    const usersUji = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX_UJI } } });
    for (const u of usersUji) {
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
  await prisma.$disconnect();
});

let urutan = 0;

async function buatAktor(): Promise<ProfilesActor> {
  urutan += 1;
  const user = await prisma.user.create({
    data: { id: uuidV7(), phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`, fullName: "Uji Profil" },
  });
  audit.length = 0;
  return { userId: user.id, requestId: uuidV7() };
}

/** Baca kolom sensitif MENTAH — melewati service, repository, dan pemetaan. */
async function bacaMentah(userId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ disability_types: Buffer | null; accommodation_needs: Buffer | null }>
  >(
    Prisma.sql`SELECT disability_types, accommodation_needs
      FROM seeker_profiles WHERE user_id = ${userId}::uuid`,
  );
  return rows[0];
}

const ISI = {
  consentSensitive: true,
  disabilityTypes: ["tuli", "daksa"] as const,
  accommodationNeeds: {
    tags: ["juru_bahasa_isyarat"] as const,
    notes: "Perlu juru bahasa pada wawancara luring",
  },
};

describe("AC-1 — kolom sensitif tersimpan sebagai ciphertext", () => {
  it("pembacaan MENTAH dari bytea tidak memuat satu pun nilai plaintext", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const actor = await buatAktor();

    await service.updateMe(actor, {
      consentSensitive: true,
      disabilityTypes: [...ISI.disabilityTypes],
      accommodationNeeds: { ...ISI.accommodationNeeds, tags: [...ISI.accommodationNeeds.tags] },
    });

    const mentah = await bacaMentah(actor.userId);
    expect(mentah?.disability_types).not.toBeNull();
    expect(mentah?.accommodation_needs).not.toBeNull();

    const byte = Buffer.concat([
      mentah?.disability_types ?? Buffer.alloc(0),
      mentah?.accommodation_needs ?? Buffer.alloc(0),
    ]).toString("latin1");
    // Hanya token BERMAKNA. Menguji satu karakter tunggal (mis. kurung siku
    // pembuka JSON) akan merah sesekali karena kebetulan: ciphertext 32 byte
    // memuat byte apa pun dengan peluang yang tidak kecil — dan penjaga yang
    // merah secara acak akan dimatikan orang sebelum ia sempat berguna.
    for (const bocor of ["tuli", "daksa", "juru_bahasa_isyarat", "juru bahasa", "notes"]) {
      expect(byte, `plaintext "${bocor}" bocor ke kolom bytea`).not.toContain(bocor);
    }
  });

  it("byte pertama adalah versi kunci — format berversi, bukan blob tanpa asal", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Inilah yang membuat rotasi kunci (docs/runbook-keys.md) mungkin: data
    // lama tetap terbaca setelah kunci baru dipakai. Blob tanpa penanda versi
    // hanya bisa dibaca oleh kunci yang kebetulan sedang aktif.
    const actor = await buatAktor();
    await service.updateMe(actor, { consentSensitive: true, disabilityTypes: ["netra"] });

    const mentah = await bacaMentah(actor.userId);
    expect(crypto.versionOf(mentah?.disability_types as Buffer)).toBe(1);
  });

  it("pemilik membaca kembali datanya terdekripsi persis seperti yang disimpan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const actor = await buatAktor();
    const needs = { tags: [...ISI.accommodationNeeds.tags], notes: ISI.accommodationNeeds.notes };

    await service.updateMe(actor, {
      consentSensitive: true,
      disabilityTypes: [...ISI.disabilityTypes],
      accommodationNeeds: needs,
    });
    const profil = await service.getMe(actor);

    expect(profil.sensitive).toEqual({
      disabilityTypes: ["tuli", "daksa"],
      accommodationNeeds: needs,
    });
  });
});

describe("AC-2 — gerbang consent di dalam transaksi sungguhan", () => {
  it("tulis sensitif tanpa consent → 403, dan TIDAK ada baris seeker_profiles yang lahir", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const actor = await buatAktor();

    const gagal = await service
      .updateMe(actor, { disabilityTypes: ["netra"] })
      .then(() => null)
      .catch((err: unknown) => err);

    expect(gagal).toBeInstanceOf(AppError);
    expect((gagal as AppError).code).toBe("CONSENT_SENSITIF_DIPERLUKAN");
    expect((gagal as AppError).status).toBe(403);
    // Transaksi berhenti sebelum upsert — bukan menulis lalu membatalkan.
    expect(await prisma.seekerProfile.count({ where: { userId: actor.userId } })).toBe(0);
    expect(audit).toHaveLength(0);
  });

  it("baris aman yang sudah ada tidak ikut rusak saat tulis sensitif ditolak", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const actor = await buatAktor();
    await service.updateMe(actor, { headline: "Analis data", city: "Semarang" });

    await service.updateMe(actor, { disabilityTypes: ["netra"] }).catch(() => undefined);

    const profil = await service.getMe(actor);
    expect(profil).toMatchObject({ headline: "Analis data", city: "Semarang", sensitive: null });
    expect((await bacaMentah(actor.userId))?.disability_types).toBeNull();
  });
});

describe("AC-3 — pencabutan consent menghapus datanya dari DB", () => {
  it("setelah dicabut, kedua kolom bytea benar-benar NULL (bukan sekadar tak terbaca)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const actor = await buatAktor();
    await service.updateMe(actor, {
      consentSensitive: true,
      disabilityTypes: [...ISI.disabilityTypes],
      accommodationNeeds: { tags: [], notes: "catatan yang harus hilang" },
    });
    expect((await bacaMentah(actor.userId))?.accommodation_needs).not.toBeNull();
    audit.length = 0;

    await service.updateMe(actor, { consentSensitive: false });

    const mentah = await bacaMentah(actor.userId);
    expect(mentah?.disability_types).toBeNull();
    expect(mentah?.accommodation_needs).toBeNull();

    const baris = await prisma.seekerProfile.findUnique({
      where: { userId: actor.userId },
      select: { consentSensitiveAt: true },
    });
    expect(baris?.consentSensitiveAt).toBeNull();
    expect(audit).toEqual([
      {
        action: "PROFILE_SENSITIVE_UPDATED",
        meta: { operation: "consentRevoked", fields: ["disabilityTypes", "accommodationNeeds"] },
      },
    ]);
  });

  it("consent dicatat sekali dan tidak bergeser saat profil disimpan lagi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const actor = await buatAktor();
    await service.updateMe(actor, { consentSensitive: true });
    const pertama = (await service.getMe(actor)).consentSensitiveAt;

    await service.updateMe(actor, { consentSensitive: true, headline: "berubah" });

    expect((await service.getMe(actor)).consentSensitiveAt).toBe(pertama);
  });
});

describe("cascade — data sensitif ikut hilang bersama akunnya", () => {
  it("hapus user → baris seeker_profiles beserta ciphertext-nya hilang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // `onDelete: Cascade` sudah diuji di db-seeker.test.ts untuk baris kosong.
    // Yang diperiksa di sini adalah kasus yang benar-benar penting bagi hak
    // hapus UU PDP: baris yang BERISI data disabilitas terenkripsi.
    const actor = await buatAktor();
    await service.updateMe(actor, { consentSensitive: true, disabilityTypes: ["autisme"] });

    await prisma.user.delete({ where: { id: actor.userId } });

    expect(await bacaMentah(actor.userId)).toBeUndefined();
  });
});
