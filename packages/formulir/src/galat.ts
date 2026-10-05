// Galat per kolom dari zod (dipindah dari apps/web, PR-092). Validasi klien
// memakai skema yang SAMA dengan server, jadi pesannya sudah Bahasa Indonesia.
import type { z } from "zod";

/** Nama kolom (path dirangkai titik, mis. `accommodationNeeds.notes`) → pesan. */
export type GalatKolom = Readonly<Record<string, string>>;

export function galatPerKolom(galat: z.ZodError): GalatKolom {
  const hasil: Record<string, string> = {};
  for (const masalah of galat.issues) {
    // `??=`: yang pertama datang paling dekat dengan sebab aslinya.
    hasil[masalah.path.join(".")] ??= masalah.message;
  }
  return hasil;
}

export type HasilPeriksa<T> = { ok: true; nilai: T } | { ok: false; galat: GalatKolom };

/** Validasi sebelum mengirim — gagal di klien lebih cepat dan pesannya per kolom. */
export function periksa<T>(
  skema: z.ZodType<T, z.ZodTypeDef, unknown>,
  nilai: unknown,
): HasilPeriksa<T> {
  const hasil = skema.safeParse(nilai);
  return hasil.success
    ? { ok: true, nilai: hasil.data }
    : { ok: false, galat: galatPerKolom(hasil.error) };
}
