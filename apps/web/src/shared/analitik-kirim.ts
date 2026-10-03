// Pengirim analytics (PR-082) — DIMUAT MALAS oleh `analitik.ts` pada event
// pertama, supaya zod & kontrak event tidak ikut bundel awal.
//
// Satu-satunya jalan data analytics meninggalkan perangkat:
//   1. path dinormalkan (`normalkanPath`: id → `:id`, query & hash dibuang);
//   2. payload divalidasi kontrak no-PII (`analyticsPayloadSchema`) — gagal =
//      TIDAK DIKIRIM (dan tidak melempar);
//   3. diterjemahkan ke format koleksi Umami (`POST /api/send`), TANPA `title`
//      (judul halaman bisa memuat judul lowongan/nama) dan TANPA `referrer`
//      (URL rujukan bisa memuat query siapa pun);
//   4. `fetch` keepalive, galat apa pun ditelan (fire-and-forget).
import { analyticsPayloadSchema, normalkanPath, type AnalyticsPayload } from "@nawasena/schemas";
import type { KonfigurasiAnalitik } from "./analitik.js";

type Kiriman =
  | { type: "pageview"; pathMentah: string }
  | { type: "event"; pathMentah: string; name: string; data?: Record<string, string> };

export function siapkanPayload(k: Kiriman): AnalyticsPayload | null {
  const path = normalkanPath(k.pathMentah);
  const kandidat =
    k.type === "pageview"
      ? { type: "pageview" as const, path }
      : { type: "event" as const, path, name: k.name, ...(k.data ? { data: k.data } : {}) };
  const hasil = analyticsPayloadSchema.safeParse(kandidat);
  return hasil.success ? hasil.data : null;
}

/** Badan permintaan koleksi Umami v2. */
export function badanUmami(p: AnalyticsPayload, websiteId: string) {
  const layar = globalThis.screen;
  return {
    type: "event",
    payload: {
      website: websiteId,
      hostname: globalThis.location?.hostname ?? "",
      language: globalThis.navigator?.language ?? "id",
      screen: layar ? `${String(layar.width)}x${String(layar.height)}` : "",
      url: p.path,
      ...(p.type === "event" ? { name: p.name, ...(p.data ? { data: p.data } : {}) } : {}),
    },
  };
}

export async function kirimKeUmami(
  k: Kiriman,
  konfigurasi: KonfigurasiAnalitik,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
  try {
    if (konfigurasi.websiteId === undefined) return;
    const payload = siapkanPayload(k);
    if (payload === null) return;
    await fetchImpl(`${konfigurasi.dasarUrl}/api/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(badanUmami(payload, konfigurasi.websiteId)),
      keepalive: true,
      credentials: "omit",
    });
  } catch {
    // Server analytics mati / jaringan putus — tidak pernah sampai ke pengguna.
  }
}
