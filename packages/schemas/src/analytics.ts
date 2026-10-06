// Kontrak event analytics privacy-first (PR-082, PRD §15, Gap G2).
//
// PLATFORM-AGNOSTIK: web (PR-082) dan mobile (PR-094) memakai skema, daftar
// event, dan penormal path yang SAMA — transportnya saja yang berbeda.
//
// KEBIJAKAN NO-PII DITEGAKKAN SKEMA, BUKAN KONVENSI:
//   - nama event = enum tertutup; event baru = perubahan kontrak yang ditinjau;
//   - `data` per event `.strict()` dan hanya berisi enum kecil — tidak ada
//     string bebas, angka id, atau apa pun yang bisa memuat nama/telepon/email;
//   - path dinormalkan: UUID & angka panjang → `:id`, query & hash DIBUANG
//     (query bisa memuat `?tujuan=`, kata kunci pencarian, atau token);
//   - TIDAK ADA data disabilitas — termasuk pilihan pengungkapan saat melamar:
//     "mengungkap" sendiri sudah menyiratkan disabilitas.
// Identitas pengunjung adalah hash anonim milik Umami (IP + UA + salt harian,
// tanpa cookie) — tidak ada id pengguna yang dikirim.
//
// Katalog lengkap + pemetaan ke KPI: `docs/katalog-event-analitik.md`.
import { z } from "zod";

export const ANALYTICS_EVENTS = [
  "daftar",
  "profil_lengkap",
  "cv_dibuat",
  "lamar",
  "wawancara",
  "hired_confirmed",
] as const;

export const analyticsEventNameSchema = z.enum(ANALYTICS_EVENTS);
export type AnalyticsEventName = z.infer<typeof analyticsEventNameSchema>;

const tanpaData = z.undefined();

/** `data` yang SAH per event — hanya enum kecil, tidak ada teks bebas. */
export const analyticsEventDataSchemas = {
  daftar: z.object({ metode: z.enum(["otp", "google"]) }).strict(),
  profil_lengkap: tanpaData,
  /** `via` = KPI "pengguna yang memakai AI CV builder". */
  cv_dibuat: z.object({ via: z.enum(["ai", "profil"]) }).strict(),
  lamar: tanpaData,
  wawancara: tanpaData,
  hired_confirmed: tanpaData,
} as const satisfies Record<AnalyticsEventName, z.ZodTypeAny>;

export type AnalyticsEventData<N extends AnalyticsEventName> = z.infer<
  (typeof analyticsEventDataSchemas)[N]
>;

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLA_ANGKA_ID = /^\d{4,}$/;

/**
 * Path yang aman dikirim: tanpa query/hash, segmen id → `:id`, maks 200 char.
 * `/lamaran/0191…?tujuan=x#y` → `/lamaran/:id`.
 */
export function normalkanPath(path: string): string {
  // A room slug can reveal a topic someone visited; send the route pattern.
  const tanpaEkor = (path.split(/[?#]/, 1)[0] ?? "/").replace(
    /^\/community\/[^/]+/,
    "/community/:slug",
  );
  const segmen = tanpaEkor
    .split("/")
    .map((s) => (POLA_UUID.test(s) || POLA_ANGKA_ID.test(s) ? ":id" : s));
  const hasil = segmen.join("/") || "/";
  return hasil.slice(0, 200);
}

/** Path ternormal — dipakai skema payload sebagai penjaga terakhir. */
export const analyticsPathSchema = z
  .string()
  .max(200)
  .regex(/^\/[A-Za-z0-9/_:.-]*$/, { message: "Path analytics berisi karakter tak dikenal" })
  .refine((p) => !/^\/community\/(?!:slug(?:\/|$))[^/]+/.test(p), {
    message: "Path analytics masih memuat slug ruang",
  })
  .refine((p) => p.split("/").every((s) => !POLA_UUID.test(s) && !POLA_ANGKA_ID.test(s)), {
    message: "Path analytics masih memuat id",
  });

/**
 * Payload yang boleh meninggalkan perangkat (bentuk netral; transport web
 * menerjemahkannya ke format koleksi Umami). `name` kosong = pageview.
 */
export const analyticsPayloadSchema = z.union([
  z.object({ type: z.literal("pageview"), path: analyticsPathSchema }).strict(),
  z
    .object({
      type: z.literal("event"),
      path: analyticsPathSchema,
      name: analyticsEventNameSchema,
      data: z.record(z.string(), z.string()).optional(),
    })
    .strict()
    .superRefine((p, ctx) => {
      const hasil = analyticsEventDataSchemas[p.name].safeParse(p.data);
      if (!hasil.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Data event "${p.name}" tidak sesuai kontrak no-PII`,
        });
      }
    }),
]);

export type AnalyticsPayload = z.infer<typeof analyticsPayloadSchema>;
