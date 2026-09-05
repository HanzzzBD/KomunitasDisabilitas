// Unit kontributor ekspor PDP bagian `accessibility` (utang U-03, dibayar
// 2026-09-05).
//
// KENAPA UTANG INI ADA SELAMA LIMA PHASE. Penjaga ekspor menempatkan
// `accessibility_profiles` di DITUNDA sejak PR-022 dengan alasan yang berlaku
// bagi seluruh daftar itu — "belum ada endpoint yang bisa mengisinya". Alasan
// itu berhenti benar pada hari PR-034 merged, dan tidak ada yang meninjaunya
// ulang. Selama itu, orang yang memakai haknya mengunduh data pribadi menerima
// berkas tanpa preferensi aksesibilitasnya: pilihan yang ia buat sendiri,
// tentang disabilitasnya.
//
// Yang dijaga berkas ini karena itu bukan sekadar "kontributor bekerja",
// melainkan: apa yang ada di berkas ekspor SAMA dengan apa yang dilihat
// pemiliknya di pengaturannya.
import { describe, it, expect } from "vitest";
import {
  ACCESSIBILITY_PROFILE_KOSONG,
  accessibilityProfileSchema,
  dataExportSchema,
  EXPORT_FORMAT_VERSION,
  SEEKER_PROFILE_KOSONG,
  type AccessibilityProfile,
} from "@nawasena/schemas";
import {
  createAccessibilityExportContributor,
  createAccessibilityService,
  type AccessibilityProfileRow,
} from "../src/modules/accessibility/index.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const LAIN = "018f4c1e-0000-7000-8000-00000000bbbb";

/** Preferensi yang benar-benar dipilih seseorang — bukan bawaan. */
const PILIHAN: AccessibilityProfile = {
  textScale: 150,
  highContrast: true,
  reduceMotion: true,
  simpleLanguage: true,
  prefersSignLanguage: true,
  largeTouchTargets: true,
  // `screenReaderHint` boolean, bukan nama pembaca layar: yang disimpan adalah
  // "pengguna menyatakan memakai screen reader", bukan merek alatnya.
  screenReaderHint: true,
};

function rakit(baris: Record<string, AccessibilityProfile>) {
  const diminta: string[] = [];

  // Service SUNGGUHAN di atas repository palsu — bukan kontributor yang
  // memalsukan service. Kalau `getMe` kelak berubah cara membaca barisnya,
  // ekspor harus ikut berubah, dan test ini yang membuktikannya masih sejalan.
  const service = createAccessibilityService({
    accessibilityRepository: {
      findByUserId: async (userId: string) => {
        diminta.push(userId);
        const isi = baris[userId];
        return isi === undefined ? null : ({ userId, ...isi } as AccessibilityProfileRow);
      },
      upsert: async () => {
        throw new Error("ekspor tidak boleh menulis");
      },
    } as never,
  });

  return { kontributor: createAccessibilityExportContributor({ accessibility: service }), diminta };
}

describe("kontributor bagian accessibility", () => {
  it("mendaftar dengan nama bagian yang ada di kontrak ekspor", () => {
    const { kontributor } = rakit({});

    expect(kontributor.bagian).toBe("accessibility");
    // Kontributor tanpa tempat di `dataExportSchema` menggagalkan permintaan
    // saat runtime (skema itu `.strict()`).
    expect(Object.keys(dataExportSchema.shape)).toContain(kontributor.bagian);
  });

  it("berisi preferensi yang BENAR-BENAR dipilih pengguna", async () => {
    const { kontributor } = rakit({ [USER_ID]: PILIHAN });

    const bagian = await kontributor.kumpulkan(USER_ID);

    expect(accessibilityProfileSchema.parse(bagian)).toEqual(PILIHAN);
  });

  it("pengguna yang belum pernah memilih → tujuh null, bukan bawaan", async () => {
    // Bedanya penting bagi pembaca berkas, dan ini alasan yang sama dengan
    // jawaban `GET /me/accessibility`: `null` menyatakan "belum memilih", yang
    // TIDAK sama dengan "memilih nilai bawaan". Mengekspor bawaan akan membuat
    // berkas mengklaim pilihan yang tidak pernah dibuat orangnya.
    const { kontributor } = rakit({});

    const bagian = await kontributor.kumpulkan(USER_ID);

    expect(bagian).toEqual(ACCESSIBILITY_PROFILE_KOSONG);
  });

  it("hanya membaca milik userId yang diminta", async () => {
    const { kontributor, diminta } = rakit({ [USER_ID]: PILIHAN, [LAIN]: PILIHAN });

    await kontributor.kumpulkan(USER_ID);

    expect(diminta).toEqual([USER_ID]);
    expect(diminta).not.toContain(LAIN);
  });

  it("TIDAK menulis apa pun — ekspor adalah jalur baca", async () => {
    // Repository palsu di atas melempar pada `upsert`. Kontributor yang
    // diam-diam menulis (mis. "sekalian sediakan barisnya") akan menggagalkan
    // test ini alih-alih menambah efek samping pada permintaan unduh data.
    const { kontributor } = rakit({});

    await expect(kontributor.kumpulkan(USER_ID)).resolves.toBeDefined();
  });

  it("bagian yang dihasilkan lolos kontrak berkas penuh", async () => {
    const { kontributor } = rakit({ [USER_ID]: PILIHAN });

    const berkas = dataExportSchema.parse({
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: "2026-09-05T10:00:00.000Z",
      account: {
        id: USER_ID,
        fullName: "Bayu Nugroho",
        email: null,
        emailVerified: false,
        phone: "+6281234567890",
        role: "seeker",
        createdAt: "2026-08-01T03:00:00.000Z",
        authMethods: ["otp"],
      },
      profile: { ...SEEKER_PROFILE_KOSONG, experiences: [], educations: [], skills: [] },
      accessibility: await kontributor.kumpulkan(USER_ID),
      notifications: [],
    });

    expect(berkas.accessibility).toEqual(PILIHAN);
  });
});
