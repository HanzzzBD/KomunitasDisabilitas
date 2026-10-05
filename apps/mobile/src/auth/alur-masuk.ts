// Logika layar masuk mobile (PR-090) — murni, tanpa React Native, diuji Vitest.
import { ApiError } from "@nawasena/api-client";

/**
 * Ubah ketikan pengguna menjadi E.164 (+62…). Orang Indonesia menulis nomornya
 * sebagai `0812…`, `62812…`, atau `+62 812-…`; memaksa satu format saja
 * memindahkan pekerjaan ke pengguna — terberat bagi pengguna motorik terbatas
 * dan pembaca layar. Hasilnya tetap divalidasi skema saat dikirim.
 */
export function normalisasiNomor(ketikan: string): string {
  const angka = ketikan.replace(/[^\d+]/g, "");
  if (angka.startsWith("+")) return `+${angka.slice(1).replace(/\+/g, "")}`;
  if (angka.startsWith("62")) return `+${angka}`;
  if (angka.startsWith("0")) return `+62${angka.slice(1)}`;
  if (angka.startsWith("8")) return `+62${angka}`;
  return angka;
}

/** Ambil hanya angka, maksimal 6 — untuk kolom kode OTP (termasuk hasil autofill). */
export function rapikanKode(ketikan: string): string {
  return ketikan.replace(/\D/g, "").slice(0, 6);
}

/** Pesan untuk pengguna: dari envelope server bila ada, selain itu pesan umum. */
export function pesanGalat(err: unknown): string {
  if (err instanceof ApiError) {
    return err.hint ? `${err.message}. ${err.hint}` : err.message;
  }
  return "Terjadi kesalahan. Coba lagi.";
}

/** Galat jaringan = server tak terjangkau (status 0), bukan penolakan. */
export function galatJaringan(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

/** Format hitung mundur kirim ulang: 75 → "1:15". */
export function formatHitungMundur(detik: number): string {
  const aman = Math.max(0, Math.floor(detik));
  return `${Math.floor(aman / 60)}:${String(aman % 60).padStart(2, "0")}`;
}
