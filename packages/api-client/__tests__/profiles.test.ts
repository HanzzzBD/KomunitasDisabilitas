// Endpoint profil karier (PR-040) — pemakai pertama kontrak PR-037/PR-038.
//
// YANG DIUJI DI SINI bukan "fetch dipanggil", melainkan janji-janji lapisan
// endpoint yang paling mudah salah dan paling mahal bila salah:
//
//   1. Amplop `{ data }` benar-benar DIBUKA — skema yang memarse profil
//      telanjang akan menolak SETIAP jawaban yang benar, dan hanya di produksi.
//   2. Permintaan yang saling meniadakan ditahan SEBELUM berangkat: mencabut
//      consent sambil menyimpan data disabilitas.
//   3. DELETE tidak menuntut badan JSON — jawaban 204 yang benar tidak boleh
//      diterjemahkan menjadi kegagalan.
//   4. Kunci cache DILINGKUPI pemiliknya, sebab yang tersimpan di entri itu
//      adalah ragam disabilitas seseorang.
import { describe, expect, it, vi } from "vitest";
import {
  createApiClient,
  educationsApi,
  experiencesApi,
  getProfile,
  profilesKeys,
  skillsApi,
  updateProfile,
} from "../src/index.js";

const PROFIL = {
  headline: "Analis data",
  summary: null,
  city: "Yogyakarta",
  province: null,
  openToRemote: true,
  disclosureDefault: "ask_each_time",
  consentSensitiveAt: null,
  sensitive: null,
};

const PENGALAMAN = {
  id: "01912345-89ab-7def-8123-4567890abc01",
  title: "Analis Data",
  company: "PT Contoh",
  startDate: "2020-01-15",
  endDate: null,
  description: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function klien(fetch: ReturnType<typeof vi.fn>) {
  return createApiClient({ baseUrl: "https://x/api/v1", fetch: fetch as unknown as typeof globalThis.fetch });
}

describe("getProfile", () => {
  it("memanggil GET /me/profile dan MEMBUKA amplop `{ data }`", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PROFIL }));

    await expect(getProfile(klien(fetch))).resolves.toEqual(PROFIL);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/me/profile");
  });

  it("jawaban yang menyimpang dari kontrak ditolak, bukan diteruskan", async () => {
    // `undefined` yang menyebar sampai ke layar muncul sebagai baris kosong
    // tanpa sebab yang terlihat; kegagalan berkode bisa ditangani.
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: { headline: 42 } }));

    await expect(getProfile(klien(fetch))).rejects.toMatchObject({
      code: "RESPONS_TIDAK_DIKENAL",
    });
  });
});

describe("updateProfile", () => {
  it("mengirim PUT berisi badan yang sudah divalidasi", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PROFIL }));

    await updateProfile(klien(fetch), { headline: "Admin data" });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ headline: "Admin data" });
  });

  it("string kosong menjadi null — 'kosongkan' bisa dinyatakan", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PROFIL }));

    await updateProfile(klien(fetch), { headline: "" });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ headline: null });
  });

  it("MENCABUT consent sambil menyimpan data sensitif ditolak SEBELUM berangkat", async () => {
    // Permintaan yang saling meniadakan paling mungkin lahir dari state
    // formulir. Menahannya di sini berarti pengguna melihat pesannya seketika,
    // bukan setelah satu perjalanan yang sudah pasti berakhir 400.
    const fetch = vi.fn();

    await expect(
      updateProfile(klien(fetch), {
        consentSensitive: false,
        disabilityTypes: ["tuli"],
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("field asing ditolak di sini, bukan setelah perjalanan ke server", async () => {
    const fetch = vi.fn();

    await expect(
      updateProfile(klien(fetch), { bukanField: true } as unknown as { headline?: string }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("sub-entitas karier", () => {
  it("list membuka amplop dan mengembalikan lariknya", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: [PENGALAMAN] }));

    await expect(experiencesApi.list(klien(fetch))).resolves.toEqual([PENGALAMAN]);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/me/experiences");
  });

  it("create mengirim POST dan mengembalikan ITEM, bukan amplopnya", async () => {
    // Bentuk generiknya sempat menyimpulkan `data` sebagai opsional; yang
    // muncul di layar kalau itu lolos adalah `undefined`, bukan galat.
    const fetch = vi.fn().mockResolvedValue(jsonResponse(201, { data: PENGALAMAN }));

    const hasil = await experiencesApi.create(klien(fetch), { title: "Kasir" });

    expect(hasil).toEqual(PENGALAMAN);
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
  });

  it("update menaruh id di alamat, bukan di badan", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { data: PENGALAMAN }));

    await experiencesApi.update(klien(fetch), PENGALAMAN.id, { title: "Kasir Senior" });

    expect(fetch.mock.calls[0]?.[0]).toBe(`https://x/api/v1/me/experiences/${PENGALAMAN.id}`);
    expect(JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      title: "Kasir Senior",
    });
  });

  it("remove menerima 204 TANPA badan sebagai keberhasilan", async () => {
    // Skema response di sini akan menuntut JSON pada jawaban yang justru
    // berhasil, dan menerjemahkan keberhasilan menjadi RESPONS_TIDAK_DIKENAL.
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(experiencesApi.remove(klien(fetch), PENGALAMAN.id)).resolves.toBeUndefined();
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
  });

  it("id di alamat di-encode — id asing tidak bisa menyelinap sebagai jalur", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await skillsApi.remove(klien(fetch), "a/../b");

    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/me/skills/a%2F..%2Fb");
  });

  it("badan create divalidasi sebelum berangkat", async () => {
    const fetch = vi.fn();

    await expect(educationsApi.create(klien(fetch), { institution: "" })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ketiganya menunjuk alamat yang berbeda", async () => {
    // Pabrik yang sama melayani ketiganya; basis yang tertukar akan membuat
    // pendidikan tersimpan sebagai pengalaman tanpa satu pun galat.
    // `mockImplementation`, BUKAN `mockResolvedValue`: badan `Response` hanya
    // bisa dibaca SEKALI, jadi satu objek yang dipakai ulang membuat panggilan
    // kedua gagal memarse jawaban yang sebenarnya benar.
    const fetch = vi.fn().mockImplementation(() => jsonResponse(200, { data: [] }));
    const c = klien(fetch);

    await experiencesApi.list(c);
    await educationsApi.list(c);
    await skillsApi.list(c);

    expect(fetch.mock.calls.map((p) => p[0])).toEqual([
      "https://x/api/v1/me/experiences",
      "https://x/api/v1/me/educations",
      "https://x/api/v1/me/skills",
    ]);
  });
});

describe("profilesKeys — pelingkupan cache", () => {
  it("pengguna berbeda mendapat key berbeda", () => {
    // Cache TanStack hidup selama DOKUMENnya, bukan selama sesinya. Satu key
    // tanpa pelingkup berarti pengguna berikutnya yang masuk di tab yang sama
    // membaca ragam disabilitas milik pengguna sebelumnya.
    expect(profilesKeys.me("a")).not.toEqual(profilesKeys.me("b"));
    expect(profilesKeys.experiences("a")).not.toEqual(profilesKeys.experiences("b"));
  });

  it("sesi yang belum dikenali punya laci sendiri, bukan berbagi dengan siapa pun", () => {
    expect(profilesKeys.me(null)).toEqual(profilesKeys.me(null));
    expect(profilesKeys.me(null)).not.toEqual(profilesKeys.me("a"));
  });

  it("keempat domain tidak saling menimpa", () => {
    const semua = [
      JSON.stringify(profilesKeys.me("a")),
      JSON.stringify(profilesKeys.experiences("a")),
      JSON.stringify(profilesKeys.educations("a")),
      JSON.stringify(profilesKeys.skills("a")),
    ];
    expect(new Set(semua).size).toBe(4);
  });
});
