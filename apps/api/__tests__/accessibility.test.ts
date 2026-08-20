// Unit service preferensi aksesibilitas (PR-034, ADR-008).
//
// Yang diuji di sini adalah keputusan-keputusan yang tidak terlihat dari HTTP:
// bahwa GET menjawab "belum diatur" (tujuh NULL) TANPA menulis apa pun, bahwa
// PUT menggabung alih-alih mengganti, bahwa `null` pada patch MENGOSONGKAN
// kolom, dan bahwa penyediaan awal saat registrasi tidak pernah mengembalikan
// preferensi yang sudah dipilih pengguna ke bawaan.
import { describe, it, expect, vi } from "vitest";
import {
  ACCESSIBILITY_DEFAULTS,
  ACCESSIBILITY_PROFILE_KOSONG,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
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
 * Terapkan patch seperti Prisma: kunci yang TIDAK DISEBUT tidak menyentuh
 * kolomnya, kunci bernilai `null` MENGOSONGKAN kolomnya.
 *
 * Spread biasa tidak cukup — `{...baris, ...patch}` ikut menuliskan kunci yang
 * hadir bernilai `undefined`, dan itu justru perilaku yang tidak dimiliki
 * Prisma. Palsu yang lebih longgar daripada aslinya membuat test lulus atas
 * perilaku yang tidak pernah terjadi di produksi.
 */
function terapkan(
  baris: AccessibilityProfileRow,
  patch: UpdateAccessibilityPreferences,
): AccessibilityProfileRow {
  const hasil = { ...baris };
  for (const [kunci, nilai] of Object.entries(patch)) {
    if (nilai !== undefined) Object.assign(hasil, { [kunci]: nilai });
  }
  return hasil;
}

/**
 * Repository palsu berisi satu tabel in-memory. `upsert` meniru perilaku
 * Prisma SESUDAH migrasi 09: field yang tidak disebut patch TIDAK disentuh, dan
 * baris yang belum ada lahir KOSONG (tujuh NULL) lalu ditimpa patch — bukan
 * lahir dari bawaan, sebab kolomnya tidak lagi punya `@default`.
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
      tersimpan = terapkan(tersimpan ?? { ...ACCESSIBILITY_PROFILE_KOSONG }, patch);
      return Promise.resolve({ ...tersimpan });
    },
  };

  const service = createAccessibilityService({ accessibilityRepository });
  return { service, patchTercatat, cariDipanggil, isi: () => tersimpan };
}

describe("getMe", () => {
  it("belum punya baris → menjawab TUJUH NULL, TANPA menulis apa pun", async () => {
    // Inti keputusannya: endpoint baca tidak boleh diam-diam menjadi jalur
    // tulis yang berlomba dengan pelanggan event atas kunci primer yang sama.
    //
    // Yang dijawab adalah "belum diatur", BUKAN bawaan. Menjawab bawaan membuat
    // akun yang belum pernah memilih tidak bisa dibedakan dari akun yang memilih
    // bawaan, dan klien yang menuliskannya sebagai pilihan memadamkan sinyal OS
    // (ADR-008) untuk selamanya. Itu cacat yang migrasi 09 ada untuk menutupnya.
    const { service, patchTercatat } = rakit({ row: null });

    await expect(service.getMe(actor)).resolves.toEqual(ACCESSIBILITY_PROFILE_KOSONG);
    expect(patchTercatat).toHaveLength(0);
  });

  it("profil kosong yang dijawab adalah SALINAN — pemanggil tidak bisa merusak konstanta", async () => {
    const { service } = rakit({ row: null });

    const hasil = await service.getMe(actor);
    hasil.textScale = 175;

    expect(ACCESSIBILITY_PROFILE_KOSONG.textScale).toBeNull();
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
  it("panggilan pertama pada pengguna tanpa baris → hanya field yang dikirim yang terisi", async () => {
    // Yang TIDAK dikirim lahir NULL, bukan bawaan: pengguna menyatakan satu
    // pilihan, jadi satu pilihan pula yang tercatat. Melahirkan enam sisanya
    // sebagai bawaan berarti mengarang enam pilihan atas namanya.
    const { service, patchTercatat } = rakit({ row: null });

    const hasil = await service.updateMe(actor, { highContrast: true });

    expect(patchTercatat).toEqual([{ highContrast: true }]);
    expect(hasil).toEqual({ ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: true });
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

  it("badan kosong pada pengguna tanpa baris → baris lahir KOSONG", async () => {
    const { service } = rakit({ row: null });
    await expect(service.updateMe(actor, {})).resolves.toEqual(ACCESSIBILITY_PROFILE_KOSONG);
  });

  it("response tidak membawa kolom internal", async () => {
    const { service } = rakit({ row: null });
    const hasil = await service.updateMe(actor, { largeTouchTargets: true });

    expect(Object.keys(hasil).sort()).toEqual(Object.keys(ACCESSIBILITY_PROFILE_KOSONG).sort());
  });
});

describe("provisionDefaults", () => {
  it("pengguna baru → baris lahir KOSONG, bukan berisi bawaan", async () => {
    // Namanya masih `provisionDefaults`, tetapi yang disediakan kini barisnya —
    // bukan isinya. Justru baris berisi bawaan itulah yang dulu membuat setiap
    // akun tampak sudah memilih tujuh hal sejak detik pendaftaran.
    const { service, isi } = rakit({ row: null });

    await service.provisionDefaults(USER_ID);

    expect(isi()).toEqual(ACCESSIBILITY_PROFILE_KOSONG);
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

describe("kontrak 'belum diatur'", () => {
  it("akun tanpa baris menjawab tujuh NULL — server tidak pernah mengarang bawaan", async () => {
    // Test ini dulu menjepit KEBALIKANNYA: bahwa `getMe` menjawab
    // ACCESSIBILITY_DEFAULTS, dengan alasan "bawaan yang berbeda antara klien
    // dan server membuat pengguna melihat dua tampilan". Alasannya benar,
    // kesimpulannya salah — yang harus sama adalah BAWAANNYA, bukan tempat
    // bawaan itu dipakai. Server yang menjawab bawaan tidak bisa membedakan
    // "belum memilih" dari "memilih bawaan", dan klien yang menyimpannya sebagai
    // pilihan memadamkan sinyal OS pengguna selamanya (ADR-008).
    //
    // Bawaan tetap satu sumber, di `packages/schemas`, dan tetap dipakai — hanya
    // saja di klien, saat rekonsiliasi, bukan di jawaban server.
    const { service } = rakit({ row: null });

    await expect(service.getMe(actor)).resolves.toEqual({
      textScale: null,
      highContrast: null,
      reduceMotion: null,
      simpleLanguage: null,
      prefersSignLanguage: null,
      largeTouchTargets: null,
      screenReaderHint: null,
    });
  });

  it("null pada patch MENGOSONGKAN kolom, bukan diabaikan sebagai 'tidak disebut'", async () => {
    // Inilah yang membuat tombol reset panel (AC-4 PR-036) benar-benar mereset:
    // tanpa perilaku ini, reset hanya menulis bawaan sebagai pilihan baru dan
    // memaku field yang justru baru saja dilepas pengguna.
    const { service, isi } = rakit({ row: baris({ highContrast: true, textScale: 150 }) });

    await service.updateMe(actor, { highContrast: null });

    expect(isi()?.highContrast).toBeNull();
    // Yang tidak disebut tidak tersentuh.
    expect(isi()?.textScale).toBe(150);
  });
});
