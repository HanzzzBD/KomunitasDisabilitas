// Endpoint profil pencari kerja (PR-037/PR-038 di sisi server; dikonsumsi PR-040).
//
// LIMA ALAMAT, EMPAT BELAS OPERASI, SATU BERKAS. Profil dan ketiga sub-entitas
// kariernya adalah satu layar bagi pengguna, dan memecahnya menjadi empat berkas
// hanya akan menyebarkan satu keputusan (bagaimana kunci cache dilingkupi) ke
// empat tempat yang bebas menyimpang.
//
// KETIGA SUB-ENTITAS DILAYANI SATU PABRIK. Alurnya identik — daftar, tambah,
// ubah, hapus — dan salinan ketiga adalah tempat seseorang kelak lupa memarse
// response, atau lupa memvalidasi body sebelum mengirimnya. Bentuk generiknya
// mengikuti `career.service.ts` di sisi server, yang memecahkan masalah yang
// sama dengan cara yang sama.
import { z } from "zod";
import {
  createEducationSchema,
  createExperienceSchema,
  createSkillSchema,
  educationListResponseSchema,
  educationSchema,
  experienceListResponseSchema,
  experienceSchema,
  seekerProfileResponseSchema,
  skillListResponseSchema,
  skillSchema,
  updateEducationSchema,
  updateExperienceSchema,
  updateSeekerProfileSchema,
  updateSkillSchema,
  type Education,
  type Experience,
  type SeekerProfile,
  type Skill,
  type UpdateSeekerProfile,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/**
 * Key cache TanStack untuk profil sendiri — DILINGKUPI PEMILIKNYA (`sub`).
 *
 * Alasannya sama dengan `accessibilityKeys`, tetapi taruhannya jauh lebih besar
 * di sini. Cache TanStack hidup selama DOKUMENnya, bukan selama sesinya, dan
 * `keluar()` tidak membuangnya. Satu key tanpa pelingkup berarti pengguna
 * berikutnya yang masuk di tab yang sama membaca entri milik pengguna
 * sebelumnya — dan yang tersimpan di entri ini adalah ragam disabilitas dan
 * kebutuhan akomodasi seseorang.
 *
 * `sub` null (sesi belum dikenali) memberi laci terpisah lagi, sehingga jawaban
 * pra-login tidak pernah menetes ke pengguna mana pun.
 */
export const profilesKeys = {
  me: (sub: string | null) => queryKey("profile-me", { sub: sub ?? "anonim" }),
  experiences: (sub: string | null) => queryKey("profile-experiences", { sub: sub ?? "anonim" }),
  educations: (sub: string | null) => queryKey("profile-educations", { sub: sub ?? "anonim" }),
  skills: (sub: string | null) => queryKey("profile-skills", { sub: sub ?? "anonim" }),
};

/**
 * GET /me/profile — profil lengkap milik pemilik sesi.
 *
 * `sensitive` bernilai `null` bila consent belum diberikan ATAU sudah dicabut.
 * Itu bukan "datanya kosong": ia menyatakan platform tidak sedang memegang data
 * disabilitas orang ini sama sekali. Pemanggil WAJIB membedakan keduanya —
 * formulir kosong yang seolah siap diisi menyembunyikan bahwa langkah consent
 * belum ditempuh.
 */
export async function getProfile(client: ApiClient): Promise<SeekerProfile> {
  const res = await client.request("/me/profile", {
    responseSchema: seekerProfileResponseSchema,
  });
  return res.data;
}

/**
 * PUT /me/profile — perubahan SEBAGIAN.
 *
 * Body divalidasi SEBELUM dikirim, dan di sini itu lebih dari penghematan satu
 * perjalanan: `updateSeekerProfileSchema` memuat larangan "mencabut consent
 * sambil menyimpan data disabilitas". Permintaan yang saling meniadakan itu
 * paling mungkin lahir dari state formulir — dan menahannya di sini berarti
 * pengguna melihat pesannya seketika, bukan setelah menunggu jaringan.
 */
export async function updateProfile(
  client: ApiClient,
  input: UpdateSeekerProfile,
): Promise<SeekerProfile> {
  const body = updateSeekerProfileSchema.parse(input);
  const res = await client.request("/me/profile", {
    method: "PUT",
    body,
    responseSchema: seekerProfileResponseSchema,
  });
  return res.data;
}

/**
 * Tipe MASUKAN skema, bukan keluarannya.
 *
 * `CreateExperience` dan kerabatnya di `@nawasena/schemas` adalah hasil
 * `z.infer` — tipe SESUDAH `.default(null)` diterapkan, jadi setiap field
 * beroleh nilai bawaan tampak WAJIB di sana. Memakainya di sini akan menuntut
 * pemanggil menuliskan `company: null, startDate: null, endDate: null,
 * description: null` hanya untuk menambah satu pekerjaan yang ia tahu judulnya
 * saja — persis kebalikan dari guna `.default()`.
 *
 * `z.input` adalah bentuk yang benar-benar boleh dikirim pemanggil.
 */
export type BuatPengalaman = z.input<typeof createExperienceSchema>;
export type UbahPengalaman = z.input<typeof updateExperienceSchema>;
export type BuatPendidikan = z.input<typeof createEducationSchema>;
export type UbahPendidikan = z.input<typeof updateEducationSchema>;
export type BuatKeahlian = z.input<typeof createSkillSchema>;
export type UbahKeahlian = z.input<typeof updateSkillSchema>;

/** Empat operasi satu sub-entitas karier. */
export interface BagianKarierApi<Item, Create, Update> {
  list(client: ApiClient): Promise<Item[]>;
  create(client: ApiClient, input: Create): Promise<Item>;
  update(client: ApiClient, id: string, input: Update): Promise<Item>;
  remove(client: ApiClient, id: string): Promise<void>;
}

function bagianKarier<Item, Create, Update>(
  basis: string,
  skema: {
    daftar: z.ZodType<{ data: Item[] }>;
    /**
     * Response SATU item (`{ data }`), dirakit di PEMANGGIL, bukan di sini.
     *
     * Atas tipe yang masih generik, `z.object({ data: item })` menyimpulkan
     * `data` sebagai OPSIONAL — zod tidak bisa membuktikan `Item` tak memuat
     * `undefined` — sehingga hasilnya `Item | undefined`. Di pemanggil tipenya
     * sudah konkret dan persoalan itu tidak ada.
     *
     * Dirakit di paket ini, bukan ditambahkan ke `@nawasena/schemas`: ia tidak
     * punya pemakai di sisi server — controller menulis JSON-nya langsung — dan
     * skema ber-`ref` OpenAPI yang tidak dirujuk path mana pun hanya menambah
     * bentuk yang harus dijaga tanpa menjaga apa pun.
     */
    satu: z.ZodType<{ data: Item }>;
    buat: z.ZodType<Create, z.ZodTypeDef, unknown>;
    ubah: z.ZodType<Update, z.ZodTypeDef, unknown>;
  },
): BagianKarierApi<Item, Create, Update> {
  const satu = skema.satu;

  return {
    async list(client) {
      const res = await client.request(basis, { responseSchema: skema.daftar });
      return res.data;
    },

    async create(client, input) {
      const res = await client.request(basis, {
        method: "POST",
        body: skema.buat.parse(input),
        responseSchema: satu,
      });
      return res.data;
    },

    async update(client, id, input) {
      const res = await client.request(`${basis}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: skema.ubah.parse(input),
        responseSchema: satu,
      });
      return res.data;
    },

    /**
     * DELETE → 204 TANPA BADAN, jadi tidak ada `responseSchema`.
     *
     * Memasang skema di sini akan menuntut badan JSON pada jawaban yang justru
     * berhasil, dan menerjemahkan keberhasilan menjadi `RESPONS_TIDAK_DIKENAL`.
     */
    async remove(client, id) {
      await client.request(`${basis}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  };
}

export const experiencesApi: BagianKarierApi<Experience, BuatPengalaman, UbahPengalaman> =
  bagianKarier("/me/experiences", {
    daftar: experienceListResponseSchema,
    satu: z.object({ data: experienceSchema }),
    buat: createExperienceSchema,
    ubah: updateExperienceSchema,
  });

export const educationsApi: BagianKarierApi<Education, BuatPendidikan, UbahPendidikan> =
  bagianKarier("/me/educations", {
    daftar: educationListResponseSchema,
    satu: z.object({ data: educationSchema }),
    buat: createEducationSchema,
    ubah: updateEducationSchema,
  });

export const skillsApi: BagianKarierApi<Skill, BuatKeahlian, UbahKeahlian> = bagianKarier(
  "/me/skills",
  {
    daftar: skillListResponseSchema,
    satu: z.object({ data: skillSchema }),
    buat: createSkillSchema,
    ubah: updateSkillSchema,
  },
);
