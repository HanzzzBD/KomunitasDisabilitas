// Unit kontrol akses data sensitif terpusat (PR-039).
//
// Yang dijaga file ini adalah kelima Acceptance Criteria PR-039:
//   AC-1 setiap panggilan jalur sensitif → baris audit dengan alasan
//   AC-2 response umum secara TIPE tidak dapat memuat field sensitif
//        (compile-time, lewat expectTypeOf)
//   AC-3 tanpa alasan → error, dan datanya TIDAK dibaca
//   AC-4 matching memakai alasan baku, teragregasi harian bukan per-panggilan
//   AC-5 dokumentasinya ada dan sinkron dengan kebijakan di kode
import { describe, it, expect, expectTypeOf, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOMMODATION_NEEDS_KOSONG,
  AUDIT_ACTION,
  auditMetaSchemas,
  type SafeProfile,
  type SeekerProfile,
} from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import { createFieldCrypto, parseFieldKeys } from "../src/core/crypto/index.js";
import {
  createSensitiveAccess,
  KEBIJAKAN_AUDIT,
} from "../src/modules/profiles/services/sensitive-access.service.js";
import type {
  ProfileRepository,
  SafeProfileRow,
  SeekerProfileRow,
} from "../src/modules/profiles/repositories/profile.repository.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const REQ = "018f4c1e-0000-7000-8000-0000000000ff";

const crypto = createFieldCrypto(
  parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 9).toString("base64") }),
);

const AMAN: SafeProfileRow = {
  headline: "Analis data",
  summary: null,
  city: "Yogyakarta",
  province: null,
  openToRemote: true,
  disclosureDefault: "ask_each_time",
};

function barisSensitif(): SeekerProfileRow {
  return {
    ...AMAN,
    consentSensitiveAt: new Date("2026-08-01T03:00:00.000Z"),
    disabilityTypes: crypto.encryptJson(["tuli"]),
    accommodationNeeds: crypto.encryptJson({
      ...ACCOMMODATION_NEEDS_KOSONG,
      tags: ["juru_bahasa_isyarat"],
    }),
  };
}

interface Jejak {
  actorId: string | null;
  requestId: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
}

function rakit(options: { baris?: SeekerProfileRow | null; waktu?: string } = {}) {
  const jejak: Jejak[] = [];
  let sekarang = options.waktu ?? "2026-08-21T10:00:00.000Z";

  const baris = options.baris === undefined ? barisSensitif() : options.baris;
  const bacaAmanSpy = vi.fn(
    (_userId: string): Promise<SafeProfileRow | null> =>
      Promise.resolve(baris === null ? null : AMAN),
  );
  const bacaSensitifSpy = vi.fn(
    (_userId: string): Promise<SeekerProfileRow | null> => Promise.resolve(baris),
  );

  const repo = {
    findSafeByUserId: bacaAmanSpy,
    findSensitiveByUserId: bacaSensitifSpy,
    upsertByUserId: vi.fn(),
  } as unknown as ProfileRepository;

  const akses = createSensitiveAccess({
    profileRepository: repo,
    crypto,
    auditLog: (actor, action, entity, entityId, meta) => {
      jejak.push({ ...actor, action, entity, entityId, meta });
    },
    clock: () => new Date(sekarang),
  });

  return {
    akses,
    jejak,
    bacaAmanSpy,
    bacaSensitifSpy,
    majuKe: (iso: string) => {
      sekarang = iso;
    },
  };
}

const aktor = { userId: A, requestId: REQ };

describe("jalur aman (AC-2)", () => {
  it("tidak pernah meminta kolom sensitif ke repository", async () => {
    const { akses, bacaAmanSpy, bacaSensitifSpy } = rakit();

    await akses.bacaAman(B);

    expect(bacaAmanSpy).toHaveBeenCalledWith(B);
    // Yang dijaga bukan "hasilnya tidak memuat field sensitif" melainkan
    // "kolomnya tidak pernah keluar dari PostgreSQL". Jalur aman yang membaca
    // semuanya lalu membuang sebagian akan lolos assertion pertama dan tetap
    // menaruh data disabilitas di memori proses, log, dan heap dump.
    expect(bacaSensitifSpy).not.toHaveBeenCalled();
  });

  it("tidak menulis audit — tidak ada yang perlu dipertanggungjawabkan", async () => {
    const { akses, jejak } = rakit();

    await akses.bacaAman(B);

    expect(jejak).toEqual([]);
  });

  it("tipe SafeProfile menolak field sensitif secara compile-time", () => {
    // Inilah AC-2 dalam bentuk yang bisa gagal saat `tsc` berjalan, bukan saat
    // seseorang membaca ulang response. Menambahkan `sensitive` ke bentuk aman
    // menjadi typecheck merah, bukan keputusan yang lolos review.
    expectTypeOf<SafeProfile>().not.toHaveProperty("disabilityTypes");
    expectTypeOf<SafeProfile>().not.toHaveProperty("accommodationNeeds");
    expectTypeOf<SafeProfile>().not.toHaveProperty("sensitive");
    expectTypeOf<SafeProfile>().not.toHaveProperty("consentSensitiveAt");
    expectTypeOf<SafeProfileRow>().not.toHaveProperty("disabilityTypes");
    expectTypeOf<SafeProfileRow>().not.toHaveProperty("accommodationNeeds");
    expectTypeOf<SafeProfileRow>().not.toHaveProperty("consentSensitiveAt");
    // Penjaga anti-hampa: bentuknya memang bentuk profil, bukan objek kosong
    // yang membuat keempat pemeriksaan di atas hijau tanpa arti.
    expectTypeOf<SafeProfile>().toHaveProperty("headline");
    expectTypeOf<SafeProfileRow>().toHaveProperty("disclosureDefault");
  });

  it("jalur aman tidak bisa mengembalikan profil lengkap secara tipe", () => {
    const { akses } = rakit();
    expectTypeOf(akses.bacaAman).returns.resolves.not.toEqualTypeOf<SeekerProfile | null>();
  });
});

describe("jalur sensitif — alasan wajib (AC-3)", () => {
  it("alasan kosong → error, dan datanya TIDAK pernah dibaca", async () => {
    const { akses, bacaSensitifSpy, jejak } = rakit();

    const err = await akses
      .bacaSensitif(aktor, B, { purpose: "support", reason: "   " })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("ALASAN_AKSES_DIPERLUKAN");
    expect((err as AppError).status).toBe(403);
    // Menolak SETELAH membaca berarti datanya sudah keluar dari database, dan
    // penolakannya hanya kosmetik.
    expect(bacaSensitifSpy).not.toHaveBeenCalled();
    expect(jejak).toEqual([]);
  });

  it("alasan melebihi 200 karakter juga ditolak", async () => {
    const { akses } = rakit();

    await expect(
      akses.bacaSensitif(aktor, B, { purpose: "support", reason: "x".repeat(201) }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("jalur sensitif — jejak (AC-1)", () => {
  it("satu panggilan support → satu baris audit dengan alasannya", async () => {
    const { akses, jejak } = rakit();

    const profil = await akses.bacaSensitif(aktor, B, {
      purpose: "support",
      reason: "tiket #4821 — pengguna melaporkan akomodasi tidak muncul",
    });

    expect(profil?.sensitive?.disabilityTypes).toEqual(["tuli"]);
    expect(jejak).toHaveLength(1);
    expect(jejak[0]).toMatchObject({
      actorId: A,
      requestId: REQ,
      action: AUDIT_ACTION.PROFILE_SENSITIVE_READ,
      entity: "profiles.seeker",
      // Subjeknya, bukan pembacanya — pertanyaan yang diajukan orang adalah
      // "siapa yang membuka profil SAYA", dan itu dicari lewat entityId.
      entityId: B,
      meta: {
        purpose: "support",
        fields: ["disabilityTypes", "accommodationNeeds"],
        reason: "tiket #4821 — pengguna melaporkan akomodasi tidak muncul",
      },
    });
  });

  it("meta yang diterbitkan lolos allowlist audit — bukan hanya bentuk karangan test", async () => {
    const { akses, jejak } = rakit();

    await akses.bacaSensitif(aktor, B, { purpose: "disclosure", reason: "lamaran dikirim" });

    const parsed = auditMetaSchemas[AUDIT_ACTION.PROFILE_SENSITIVE_READ].safeParse(jejak[0]?.meta);
    expect(parsed.success).toBe(true);
  });

  it("profil yang TIDAK ADA tetap meninggalkan jejak", async () => {
    // Kalau hanya pembacaan yang berhasil yang tercatat, menyisir siapa yang
    // PUNYA data disabilitas menjadi gratis: coba semua id, yang berjejak
    // berarti kosong dan yang tidak berarti terisi.
    const { akses, jejak } = rakit({ baris: null });

    const profil = await akses.bacaSensitif(aktor, B, {
      purpose: "support",
      reason: "memeriksa laporan",
    });

    expect(profil).toBeNull();
    expect(jejak).toHaveLength(1);
  });

  it("`selfService` tidak bisa disebut di jalur ini — dikeluarkan oleh TIPE", () => {
    const { akses } = rakit();
    // @ts-expect-error selfService bukan anggota TujuanAksesLain
    void (() => akses.bacaSensitif(aktor, B, { purpose: "selfService", reason: "x" }));
    // Tanpa penutupan ini, siapa pun bisa membaca profil orang lain sambil
    // mengaku melayani dirinya sendiri, dan kebijakan "tanpa catatan" untuk
    // self service berubah dari keringanan menjadi lubang.
    expect(KEBIJAKAN_AUDIT.selfService).toBe("tanpaCatatan");
  });
});

describe("agregasi matching (AC-4)", () => {
  it("seribu pembacaan dalam satu hari → NOL baris sampai di-flush, lalu SATU", async () => {
    const { akses, jejak } = rakit();

    for (let i = 0; i < 1000; i += 1) {
      await akses.bacaSensitif(aktor, B, { purpose: "matching", reason: "pencocokan harian" });
    }

    // Inilah mitigasi risiko yang tercantum di dokumen phase ("audit matching
    // terlalu bising"): seribu baris audit per batch bukan audit melainkan
    // salinan tabel, dan yang berguna saat menyelidiki justru tenggelam.
    expect(jejak).toEqual([]);
    expect(akses.tertahan()).toBe(1000);

    akses.flushAudit();

    expect(jejak).toHaveLength(1);
    expect(jejak[0]).toMatchObject({
      // null, bukan salah satu subjek yang kebetulan terakhir: barisnya
      // berbicara tentang satu job, bukan tentang satu orang.
      entityId: null,
      meta: { purpose: "matching", reason: "pencocokan harian", count: 1000 },
    });
    expect(akses.tertahan()).toBe(0);
  });

  it("pergantian hari menutup ember kemarin dengan sendirinya", async () => {
    const { akses, jejak, majuKe } = rakit({ waktu: "2026-08-21T23:59:00.000Z" });

    await akses.bacaSensitif(aktor, B, { purpose: "matching", reason: "batch kemarin" });
    await akses.bacaSensitif(aktor, B, { purpose: "matching", reason: "batch kemarin" });

    majuKe("2026-08-22T00:01:00.000Z");
    await akses.bacaSensitif(aktor, B, { purpose: "matching", reason: "batch hari ini" });

    expect(jejak).toHaveLength(1);
    expect(jejak[0]?.meta).toMatchObject({ count: 2, reason: "batch kemarin" });
    expect(akses.tertahan()).toBe(1);
  });

  it("dua pelaku pada hari yang sama menghasilkan dua baris terpisah", async () => {
    // Menjumlahkan pembacaan dua job berbeda menjadi satu baris akan membuat
    // pertanyaan "job mana yang membaca sebanyak itu?" tidak bisa dijawab.
    const { akses, jejak } = rakit();

    await akses.bacaSensitif(aktor, B, { purpose: "matching", reason: "job A" });
    await akses.bacaSensitif({ userId: B, requestId: REQ }, A, {
      purpose: "matching",
      reason: "job B",
    });
    akses.flushAudit();

    expect(jejak).toHaveLength(2);
    expect(jejak.map((j) => j.actorId).sort()).toEqual([A, B].sort());
    for (const j of jejak) expect(j.meta).toMatchObject({ count: 1 });
  });

  it("flush pada keadaan kosong tidak menulis apa pun", () => {
    const { akses, jejak } = rakit();

    akses.flushAudit();

    expect(jejak).toEqual([]);
  });

  it("datanya tetap terbaca meski jejaknya ditunda", async () => {
    // Agregasi menunda CATATANNYA, bukan pembacaannya. Kalau ia ikut menunda
    // hasilnya, matching akan menerima profil kosong.
    const { akses } = rakit();

    const profil = await akses.bacaSensitif(aktor, B, {
      purpose: "matching",
      reason: "pencocokan harian",
    });

    expect(profil?.sensitive?.accommodationNeeds.tags).toEqual(["juru_bahasa_isyarat"]);
  });
});

describe("kebijakan & dokumentasinya (AC-5)", () => {
  it("setiap tujuan punya kebijakan — tujuan baru tidak bisa lahir tanpa keputusan", () => {
    // `Record<SensitiveAccessPurpose, …>` sudah menuntutnya saat typecheck;
    // pemeriksaan ini menangkap arah sebaliknya, yaitu kebijakan yang tertinggal
    // untuk tujuan yang sudah tidak ada.
    expect(Object.keys(KEBIJAKAN_AUDIT).sort()).toEqual([
      "disclosure",
      "matching",
      "selfService",
      "support",
    ]);
  });

  it("dokumennya menyebut ketiga jalur dan kebijakan tiap tujuan", () => {
    // AC-5 menuntut "dokumentasi kapan memakai jalur mana". Dokumen yang tidak
    // diperiksa akan menua diam-diam: kebijakan berubah di kode, dokumennya
    // tetap menjanjikan yang lama, dan orang berikutnya memercayai dokumennya.
    const doc = readFileSync(join(__dirname, "..", "..", "..", "docs", "akses-data-sensitif.md"), "utf8");

    for (const jalur of ["bacaAman", "bacaSensitif", "snapshotFor"]) {
      expect(doc, `dokumen tidak menyebut jalur ${jalur}`).toContain(jalur);
    }
    for (const [tujuan, kebijakan] of Object.entries(KEBIJAKAN_AUDIT)) {
      expect(doc, `dokumen tidak menyebut tujuan ${tujuan}`).toContain(tujuan);
      expect(doc, `dokumen tidak menyebut kebijakan ${kebijakan}`).toContain(kebijakan);
    }
  });
});
