// Penanda "onboarding sudah selesai", per pengguna, per perangkat (PR-035).
//
// KENAPA TIDAK DI SERVER. Ticket PR-035 menyatakan tidak ada perubahan backend
// maupun basis data, jadi kolom `has_completed_onboarding` bukan pilihan yang
// tersedia. Akibatnya dinyatakan apa adanya, bukan disembunyikan: pengguna yang
// menyelesaikan (atau melewati) wizard di satu perangkat akan melihatnya sekali
// lagi di perangkat lain. Yang hilang di sana adalah satu ajakan yang bisa
// dilewati dengan satu tombol — bukan data, bukan preferensi, bukan keamanan.
//
// KENAPA TIDAK DI `@nawasena/a11y`. Paket itu berisi NILAI PREFERENSI dan
// rekonsiliasinya (pilihan pengguna → sinyal OS → bawaan), dan ia dipakai
// mobile juga. "Sudah pernah onboarding" bukan preferensi melainkan keadaan
// alur, dan alur onboarding mobile (PR-091) belum ada — menitipkannya ke sana
// akan memaksa setiap konsumen paket itu mewarisi field yang hanya bermakna
// bagi satu wizard web.
//
// KENAPA `sub` DIBACA TANPA VERIFIKASI TANDA TANGAN. Lihat catatan pada
// `idPenggunaSaatIni()` — dan JANGAN pakai ulang fungsi itu untuk keputusan
// yang berhubungan dengan otorisasi.
import { ambilTokenAkses } from "../../shared/sesi/store.js";

const PREFIX_KUNCI = "nawasena-onboarding-selesai";

/**
 * Penyimpanan yang dipakai.
 *
 * Disuntikkan (bukan diambil langsung dari `localStorage`) dengan alasan yang
 * sama seperti `features/auth/google.ts`: berkas di `features/` tidak boleh
 * mengunci diri ke satu platform, dan test butuh penyimpanan yang bisa
 * dibuat gagal dengan sengaja. Bawaannya dibaca lewat `globalThis` dengan
 * optional chaining — sebagian peramban melempar saat `localStorage` disentuh
 * dalam mode privat, dan itu tidak boleh menjatuhkan aplikasi.
 */
export type PenyimpananPenanda = Pick<Storage, "getItem" | "setItem">;

function bawaan(): PenyimpananPenanda | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Dekode satu segmen base64url tanpa dependensi apa pun.
 *
 * `atob`, BUKAN `Buffer`: berkas ini berjalan di peramban, dan `Buffer` hanya
 * ada di Node — memakainya membuat kode ini lulus di test yang berjalan di
 * Node lalu gagal senyap di tangan pengguna. Base64url mengganti `+`/`/`
 * menjadi `-`/`_` dan membuang padding, jadi keduanya dikembalikan lebih dulu.
 *
 * `atob` mengembalikan BYTE, bukan teks: tiap karakter hasilnya adalah satu
 * oktet. `TextDecoder` yang menerjemahkannya menjadi UTF-8 — tanpa itu, klaim
 * yang memuat huruf non-ASCII terbaca rusak. Payload di sini hampir selalu
 * ASCII (`sub` berupa UUID), tetapi "hampir selalu" bukan alasan menulis
 * dekoder yang salah.
 */
function dekodeBase64Url(segmen: string): string {
  const base64 = segmen.replaceAll("-", "+").replaceAll("_", "/");
  const berpadding = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const biner = atob(berpadding);
  return new TextDecoder().decode(Uint8Array.from(biner, (c) => c.charCodeAt(0)));
}

/**
 * Klaim `sub` dari access token — TANPA verifikasi tanda tangan.
 *
 * Itu boleh HANYA karena akibatnya terbatas pada satu hal yang bukan keamanan:
 * kunci `localStorage` mana yang menentukan apakah satu ajakan yang bisa
 * dilewati ditampilkan. Token palsu tidak membuka akses ke apa pun — paling
 * buruk wizard-nya tampil lagi (mengganggu), atau penandanya tersimpan di
 * bawah id yang salah (sama saja).
 *
 * JANGAN DIPAKAI ULANG untuk keputusan otorisasi. Yang butuh identitas
 * terpercaya di klien memanggil `GET /me` (`getMe`), yang jawabannya berasal
 * dari server dan sudah melewati guard.
 *
 * Mengembalikan `null` untuk SEMUA bentuk yang tidak dikenali — tidak ada
 * token, bukan tiga segmen, base64 rusak, payload bukan JSON, `sub` hilang
 * atau bukan string. Melempar dari sini akan meruntuhkan `TataLetak`, yang
 * merender setiap halaman.
 */
export function idPenggunaSaatIni(): string | null {
  const token = ambilTokenAkses();
  if (token === null) return null;

  const bagian = token.split(".");
  if (bagian.length !== 3) return null;

  try {
    const payload = JSON.parse(dekodeBase64Url(bagian[1] ?? "")) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub !== "" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Kunci penanda untuk satu pengguna. Satu kunci per id, bukan satu daftar. */
export function kunciPenanda(userId: string): string {
  return `${PREFIX_KUNCI}:${userId}`;
}

/**
 * Cadangan penanda "selesai" untuk SATU sesi tab ini — HANYA dipakai jalur
 * penyimpanan bawaan (`simpanan` tidak disebutkan pemanggil).
 *
 * KENAPA INI ADA (QC-1, PR-035). Kegagalan menulis (penyimpanan penuh, mode
 * privat/diblokir) TIDAK berakibat "wizard tampil lagi pada pemuatan
 * berikutnya" seperti yang tertulis di sini sebelumnya — akibat sesungguhnya
 * adalah pengalihan yang berulang SEKARANG JUGA dan SELAMANYA: `TataLetak`
 * mengevaluasi ulang setiap kali lokasi berganti, `sudahOnboarding` tetap
 * menjawab "belum" karena penandanya memang tidak pernah tertulis, dan
 * pengguna terkunci di `/onboarding` tanpa jalan keluar — `tutup()` dan
 * `selesaikan()` di `wizard.tsx` sama-sama berakhir di sini. Set di memori ini
 * memutus lingkaran itu: begitu `tandaiOnboardingSelesai` dipanggil (jalur
 * SELESAI maupun LEWATI), pengguna dianggap sudah menuntaskan onboarding untuk
 * SISA sesi tab ini, terlepas dari berhasil-tidaknya penulisan ke penyimpanan.
 *
 * DIBATASI PADA JALUR BAWAAN (`simpanan === undefined`) dengan sengaja: unit
 * test di `onboarding-identitas.test.ts` menyuntikkan penyimpanan tiruannya
 * sendiri justru supaya perilakunya deterministik dan tidak bergantung pada
 * pengguna id mana yang kebetulan sudah "selesai" di test lain dalam berkas
 * yang sama. Kode produksi (`wizard.tsx`, `tata-letak.tsx`) tidak pernah
 * mengirim `simpanan`, jadi cadangan ini selalu aktif di jalur nyata.
 *
 * TIDAK PERNAH DIRESET SECARA EKSPLISIT: muat ulang halaman membuat modul ini
 * — dan Set ini — lahir kosong lagi. Itu bukan cacat, melainkan konsisten
 * dengan sifat "per sesi" yang dijanjikan komentar ini: pengguna yang
 * penyimpanannya masih rusak sesudah muat ulang akan melihat wizard sekali
 * lagi, lalu keluar dari sana pula lewat jalur yang sama.
 */
const penandaSesiBawaan = new Set<string>();

/**
 * Tandai onboarding selesai — dipanggil pada jalur SELESAI maupun LEWATI.
 *
 * Kegagalan menulis ke penyimpanan (penuh, mode privat) TIDAK dibiarkan
 * meruntuhkan aplikasi (lihat catatan `penandaSesiBawaan` di atas untuk akibat
 * yang sebenarnya, dan kenapa itu mengharuskan cadangan sesi): kegagalannya
 * ditelan, tetapi jalur bawaan mencatat keberhasilannya sendiri di
 * `penandaSesiBawaan` supaya `sudahOnboarding` tidak terus-menerus menjawab
 * "belum" untuk sesuatu yang sudah dilakukan pengguna di tab ini.
 */
export function tandaiOnboardingSelesai(userId: string, simpanan?: PenyimpananPenanda): void {
  const tujuan = simpanan ?? bawaan();
  let tertulis = false;
  try {
    tujuan?.setItem(kunciPenanda(userId), "1");
    tertulis = tujuan !== undefined;
  } catch {
    tertulis = false;
  }
  // `tujuan === undefined` (properti `localStorage` sendiri melempar, ditelan
  // oleh `bawaan()`) TIDAK melempar apa pun di titik ini — optional chaining di
  // atas membuatnya diam-diam tidak melakukan apa-apa. Itu sebabnya
  // keberhasilan diperiksa lewat `tertulis`, bukan lewat ada-tidaknya galat.
  if (!tertulis && simpanan === undefined) {
    penandaSesiBawaan.add(userId);
  }
}

/**
 * Sudah pernah selesai/dilewati di perangkat ini (atau, bila penyimpanannya
 * tidak bisa dipakai, di sesi tab ini)? Gagal baca = jatuh ke cadangan sesi
 * untuk jalur bawaan; jalur dengan penyimpanan yang disuntik eksplisit (test)
 * tetap menjawab "belum" apa adanya.
 */
export function sudahOnboarding(userId: string, simpanan?: PenyimpananPenanda): boolean {
  try {
    if ((simpanan ?? bawaan())?.getItem(kunciPenanda(userId)) === "1") return true;
  } catch {
    /* baca gagal — jatuh ke cadangan sesi di bawah, bila berlaku */
  }
  return simpanan === undefined && penandaSesiBawaan.has(userId);
}
