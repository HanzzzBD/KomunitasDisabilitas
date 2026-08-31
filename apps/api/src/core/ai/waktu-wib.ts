// core/ai — pengelompokan hari WIB untuk kuota harian (PR-043, AC-2).
//
// KENAPA HARI DIHITUNG, BUKAN TTL YANG DIPAKAI SEBAGAI RESET. Kunci penghitung
// memuat TANGGAL WIB-nya (`…:2026-08-31:u:<id>:cv_chat`), jadi pada 00:00 WIB
// setiap pemanggil dengan sendirinya menulis kunci baru yang bernilai nol.
// Resetnya eksak, serentak untuk semua pengguna, tanpa job terjadwal, dan tanpa
// bergantung pada EXPIRE yang berhasil. TTL bergulir akan melakukan hal lain:
// ia mereset pada jam yang berbeda-beda per pengguna (AC-2 tidak bisa
// dibuktikan) dan, bila EXPIRE-nya gagal, mengunci pengguna itu selamanya.
//
// KENAPA WIB, BUKAN UTC. Batas harinya harus batas hari PENGGUNA: "jatah harian
// habis" yang berganti pukul 07:00 pagi WIB adalah kejutan, bukan kebijakan.
//
// TANPA LIBRARY TANGGAL DAN TANPA FAKE TIMER. `Intl` sudah membawa basis data
// zona waktu, dan kedua fungsi di bawah MURNI: waktunya masuk sebagai argumen.
// Pemanggil menyuntik `clock?: () => Date` (pola `core/ai/breaker.ts`), jadi
// test melintasi tengah malam cukup dengan menyerahkan Date lain.
//
// OFFSET +07:00 SENGAJA TIDAK DITULIS SEBAGAI ANGKA di mana pun. WIB memang
// tidak mengenal DST hari ini, tetapi zona waktu adalah keputusan politik yang
// pernah berubah di negeri ini; membiarkan Intl yang menjawab berarti kode ini
// tidak perlu ikut diperbaiki bila itu terjadi lagi.

/** Zona waktu resmi kuota (SDD §7.1 "reset harian WIB"). */
export const ZONA_WIB = "Asia/Jakarta";

const DETIK_PER_HARI = 86_400;

/**
 * `en-CA` menghasilkan `YYYY-MM-DD` — satu-satunya locale bawaan yang urutannya
 * ISO, sehingga tanggalnya bisa diurutkan sebagai string biasa. Formatter dibuat
 * SEKALI: konstruksinya mahal dan dipanggil pada tiap permintaan AI.
 */
const formatHari = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_WIB,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const formatJam = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_WIB,
  hourCycle: "h23", // 00–23; tanpa ini tengah malam bisa terbaca "24"
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function bagian(formatter: Intl.DateTimeFormat, now: Date, type: string): number {
  const nilai = formatter.formatToParts(now).find((p) => p.type === type)?.value;
  return nilai === undefined ? 0 : Number(nilai);
}

/**
 * Tanggal WIB dari sebuah titik waktu, `YYYY-MM-DD` — komponen tanggal pada
 * kunci penghitung.
 *
 * Batasnya: 16:59:59Z masih hari N (23:59:59 WIB), 17:00:00Z sudah hari N+1.
 */
export function hariWib(now: Date): string {
  return formatHari.format(now);
}

/**
 * Detik tersisa menuju tengah malam WIB berikutnya — dipakai dua kali:
 * `Retry-After` pada penolakan kuota (kapan jatah kembali) dan dasar TTL kunci.
 *
 * Selalu > 0. Tepat pada 00:00:00 WIB nilainya sehari penuh, sebab kunci yang
 * baru saja lahir memang berumur satu hari penuh.
 */
export function detikKeTengahMalamWib(now: Date): number {
  const berjalan =
    bagian(formatJam, now, "hour") * 3_600 +
    bagian(formatJam, now, "minute") * 60 +
    bagian(formatJam, now, "second");
  return DETIK_PER_HARI - berjalan;
}
