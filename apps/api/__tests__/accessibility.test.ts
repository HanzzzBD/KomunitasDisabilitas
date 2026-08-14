// Unit service preferensi aksesibilitas (PR-034, ADR-008).
//
// Yang diuji di sini adalah keputusan-keputusan yang tidak terlihat dari HTTP:
// bahwa GET menjawab bawaan TANPA menulis apa pun, bahwa PUT menggabung alih-alih
// mengganti, dan bahwa penyediaan awal saat registrasi tidak pernah
// mengembalikan preferensi yang sudah dipilih pengguna ke bawaan.
import { describe, it, expect, vi } from "vitest";
import { ACCESSIBILITY_DEFAULTS, type UpdateAccessibilityPreferences } from "@nawasena/schemas";
import { createEventBus } from "../src/core/events/index.js";
import {
  createAccessibilityService,
  type AccessibilityProfileRow,
  type AccessibilityRepository,
} from "../src/modules/accessibility/index.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const REQUEST_ID = "018f4c1e-0000-7000-8000-00000000ffff";
const actor = { userId: USER_ID, requestId: REQUEST_ID };

function baris(overrides: Partial<AccessibilityProfileRow> = {}): AccessibilityProfileRow {
  return { ...ACCESSIBILITY_DEFAULTS, ...overrides };
}

/**
 * Repository palsu berisi satu tabel in-memory. `upsert` meniru perilaku
 * Prisma: field yang tidak disebut patch TIDAK disentuh, dan baris yang belum
 * ada lahir dari bawaan yang ditimpa patch.
 */
function rakit(options: { row?: AccessibilityProfileRow | null } = {}) {
  let tersimpan = options.row === undefined ? null : options.row;
  const patchTercatat: UpdateAccessibilityPreferences[] = [];
  const cariDipanggil = vi.fn();

  const accessibilityRepository: AccessibilityRepository = {
    findByUserId: (userId) => {
      cariDipanggil(userId);
      return Promise.resolve(tersimpan === null ? null : { ...tersimpan });
    },
    upsertByUserId: (_userId, patch) => {
      patchTercatat.push({ ...patch });
      tersimpan =
        tersimpan === null ? { ...ACCESSIBILITY_DEFAULTS, ...patch } : { ...tersimpan, ...patch };
      return Promise.resolve({ ...tersimpan });
    },
  };

  const service = createAccessibilityService({ accessibilityRepository });
  return { service, patchTercatat, cariDipanggil, isi: () => tersimpan };
}

describe("getMe", () => {
  it("belum punya baris → menjawab bawaan, TANPA menulis apa pun", async () => {
    // Inti keputusannya: endpoint baca tidak boleh diam-diam menjadi jalur
    // tulis yang berlomba dengan pelanggan event atas kunci primer yang sama.
    const { service, patchTercatat } = rakit({ row: null });

    await expect(service.getMe(actor)).resolves.toEqual(ACCESSIBILITY_DEFAULTS);
    expect(patchTercatat).toHaveLength(0);
  });

  it("bawaan yang dijawab adalah SALINAN — pemanggil tidak bisa merusak konstanta", async () => {
    const { service } = rakit({ row: null });

    const hasil = await service.getMe(actor);
    hasil.textScale = 175;

    expect(ACCESSIBILITY_DEFAULTS.textScale).toBe(100);
  });

  it("punya baris → tujuh field kontrak, tanpa kolom internal", async () => {
    // Simulasi kolom yang kelak ikut terbawa repository — pemetaan service
    // adalah lapisan kedua yang menahannya.
    const bocor = { ...baris({ textScale: 150 }), userId: USER_ID, updatedAt: new Date() };
    const { service } = rakit({ row: bocor as AccessibilityProfileRow });

    const preferensi = await service.getMe(actor);

    expect(preferensi).not.toHaveProperty("userId");
    expect(preferensi).not.toHaveProperty("updatedAt");
    expect(Object.keys(preferensi).sort()).toEqual(Object.keys(ACCESSIBILITY_DEFAULTS).sort());
    expect(preferensi.textScale).toBe(150);
  });

  it("membaca baris MILIK PEMILIK SESI, bukan id dari mana pun", async () => {
    const { service, cariDipanggil } = rakit();
    await service.getMe(actor);
    expect(cariDipanggil).toHaveBeenCalledWith(USER_ID);
  });
});

describe("updateMe", () => {
  it("panggilan pertama pada pengguna tanpa baris → bawaan digabung di bawah patch", async () => {
    const { service, patchTercatat } = rakit({ row: null });

    const hasil = await service.updateMe(actor, { highContrast: true });

    expect(patchTercatat).toEqual([{ highContrast: true }]);
    expect(hasil).toEqual({ ...ACCESSIBILITY_DEFAULTS, highContrast: true });
  });

  it("patch sebagian TIDAK mengembalikan field lain ke bawaan", async () => {
    // PUT di sini bermakna "gabung", bukan "ganti seluruhnya" — bentuk yang
    // dijanjikan `updateAccessibilityPreferencesSchema` yang `.partial()`.
    const { service } = rakit({ row: baris({ textScale: 175, simpleLanguage: true }) });

    const hasil = await service.updateMe(actor, { highContrast: true });

    expect(hasil).toEqual({
      ...ACCESSIBILITY_DEFAULTS,
      textScale: 175,
      simpleLanguage: true,
      highContrast: true,
    });
  });

  it("badan yang sama dikirim dua kali → hasil akhirnya identik (idempoten)", async () => {
    const { service } = rakit({ row: null });
    const badan = { textScale: 150, reduceMotion: true };

    const pertama = await service.updateMe(actor, badan);
    const kedua = await service.updateMe(actor, badan);

    expect(kedua).toEqual(pertama);
  });

  it("badan kosong pada pengguna tanpa baris → baris lahir tepat di bawaan", async () => {
    const { service } = rakit({ row: null });
    await expect(service.updateMe(actor, {})).resolves.toEqual(ACCESSIBILITY_DEFAULTS);
  });

  it("response tidak membawa kolom internal", async () => {
    const { service } = rakit({ row: null });
    const hasil = await service.updateMe(actor, { largeTouchTargets: true });

    expect(Object.keys(hasil).sort()).toEqual(Object.keys(ACCESSIBILITY_DEFAULTS).sort());
  });
});

describe("provisionDefaults", () => {
  it("pengguna baru → baris lahir dengan SELURUH nilai bawaan", async () => {
    const { service, isi } = rakit({ row: null });

    await service.provisionDefaults(USER_ID);

    expect(isi()).toEqual(ACCESSIBILITY_DEFAULTS);
  });

  it("selalu patch KOSONG — tidak pernah menulis nilai apa pun sendiri", async () => {
    const { service, patchTercatat } = rakit({ row: null });

    await service.provisionDefaults(USER_ID);
    await service.provisionDefaults(USER_ID);

    expect(patchTercatat).toEqual([{}, {}]);
  });

  it("dipanggil dua kali pada baris yang sudah dipilih pengguna → tidak mengubah apa pun", async () => {
    // Inilah yang melindungi pengguna lama bila event yang sama terbit dua kali:
    // preferensi yang sudah dipilih TIDAK boleh kembali ke bawaan.
    const awal = baris({ textScale: 200, screenReaderHint: true });
    const { service, isi } = rakit({ row: awal });

    await service.provisionDefaults(USER_ID);
    await service.provisionDefaults(USER_ID);

    expect(isi()).toEqual(awal);
  });
});

describe("langganan auth.user_registered — kegagalan pelanggan", () => {
  it("penyediaan awal gagal → emit tidak melempar, dan kegagalannya tercatat", async () => {
    // Penerbitnya adalah alur MASUK. Pelanggan yang gagal dan menjatuhkan
    // penerbit akan membuat pengguna gagal masuk karena baris preferensi —
    // hal yang tidak ada hubungannya dengan kredensialnya.
    const error = vi.fn();
    const bus = createEventBus({ logger: { error } });
    const service = createAccessibilityService({
      accessibilityRepository: {
        findByUserId: () => Promise.resolve(null),
        upsertByUserId: () => Promise.reject(new Error("database mati")),
      },
    });
    bus.on("auth.user_registered", (payload) => service.provisionDefaults(payload.userId));

    expect(() =>
      bus.emit("auth.user_registered", {
        userId: USER_ID,
        registeredAt: "2026-08-14T03:00:00.000Z",
      }),
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 0));
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("kontrak nilai bawaan", () => {
  it("bawaan yang dipakai service adalah yang dari @nawasena/schemas, bukan salinan lokal", async () => {
    // Bawaan yang berbeda antara klien dan server berarti pengguna baru melihat
    // satu tampilan sebelum sinkron dan tampilan lain sesudahnya, tanpa pernah
    // mengubah apa pun (lihat komentar ACCESSIBILITY_DEFAULTS di packages/schemas).
    const { service } = rakit({ row: null });

    await expect(service.getMe(actor)).resolves.toEqual({
      textScale: 100,
      highContrast: false,
      reduceMotion: false,
      simpleLanguage: false,
      prefersSignLanguage: false,
      largeTouchTargets: false,
      screenReaderHint: false,
    });
  });
});
