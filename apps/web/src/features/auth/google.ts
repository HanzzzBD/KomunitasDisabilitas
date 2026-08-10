// Alur masuk Google — menyiapkan pengalihan, dan menerima kembaliannya.
//
// Yang membuat berkas ini rumit bukan OAuth-nya, melainkan bahwa PENGALIHAN
// MEMBUANG SELURUH MEMORI HALAMAN. Antara menekan tombol dan kembali dari
// Google, aplikasinya dimuat ulang dari nol: state React hilang, dan
// satu-satunya yang tersisa adalah URL kembalian plus apa pun yang sempat
// kita titipkan ke penyimpanan peramban.
//
// Ada TIGA hal yang harus selamat menyeberang, dan melupakan salah satunya
// tidak menggagalkan alurnya secara mencolok — ia hanya membuatnya salah:
//   `verifier` — tanpa ini penukaran code ditolak;
//   `state`    — tanpa ini alurnya bisa dibajak (lihat di bawah);
//   `tujuan`   — tanpa ini pengguna mendarat di beranda alih-alih halaman
//                yang tadi ingin ia buka.
import { buatChallenge, buatState, buatVerifier } from "./pkce.js";
import { bersihkanTujuan } from "../../shared/rute/tujuan.js";

const KUNCI = "nawasena-google-oauth";

/**
 * `sessionStorage`, BUKAN `localStorage`.
 *
 * Isinya hanya berguna selama satu perjalanan ke Google dan kembali.
 * `sessionStorage` mati bersama tab; `localStorage` bertahan berbulan-bulan,
 * meninggalkan verifier menganggur di perangkat bersama.
 */
/**
 * Untuk apa perjalanan ke Google ini (PR-033c-2).
 *
 * IKUT DITITIPKAN karena alamat kembaliannya SAMA. `/masuk/google` sudah
 * terdaftar di Google Cloud Console sejak PR-025 dan tidak bisa kita tambah
 * sesuka hati; jadi halaman itu harus bisa membedakan "saya baru saja mencoba
 * masuk" dari "saya baru saja menyetujui penghapusan akun saya". Tanpa penanda
 * ini, satu-satunya cara menebaknya adalah dari ada-tidaknya sesi — dan
 * tebakan itu salah persis pada kasus yang paling berbahaya.
 */
export type MaksudOAuth = "masuk" | "hapus-akun";

interface TitipanOAuth {
  verifier: string;
  state: string;
  tujuan: string;
  maksud: MaksudOAuth;
}

/** Alamat kembalian — harus SAMA PERSIS dengan yang terdaftar di Google Cloud Console. */
export function alamatKembali(asal: string): string {
  return `${asal}/masuk/google`;
}

/**
 * Client ID dari env. Kosong = tombol Google TIDAK ditampilkan.
 *
 * Menampilkan tombol yang pasti gagal lebih buruk daripada tidak
 * menampilkannya: pengguna mengira dirinya yang salah, mencoba berulang, lalu
 * menyerah — padahal jalur OTP di sebelahnya terbuka penuh. Ini mengikuti sikap
 * yang sama dengan API, yang menjawab 503 berikut saran jalan masuk lain
 * ketimbang berpura-pura endpoint-nya tidak ada.
 */
export function clientIdGoogle(): string | null {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * Siapkan titipan, lalu kembalikan alamat Google yang harus dibuka.
 *
 * Menulis titipan SEBELUM mengembalikan alamat, bukan sesudah pengalihan
 * dimulai: begitu `location.assign` berjalan, tidak ada jaminan baris
 * berikutnya sempat dieksekusi.
 */
async function siapkanAlurGoogle(opsi: {
  clientId: string;
  asal: string;
  tujuan: string;
  maksud: MaksudOAuth;
  simpanan?: Storage;
}): Promise<string> {
  const simpanan = opsi.simpanan ?? sessionStorage;
  const verifier = buatVerifier();
  const state = buatState();
  const titipan: TitipanOAuth = {
    verifier,
    state,
    tujuan: bersihkanTujuan(opsi.tujuan),
    maksud: opsi.maksud,
  };
  simpanan.setItem(KUNCI, JSON.stringify(titipan));

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", opsi.clientId);
  url.searchParams.set("redirect_uri", alamatKembali(opsi.asal));
  url.searchParams.set("response_type", "code");
  // `openid email profile` — yang paling sedikit yang masih cukup. Server
  // hanya memakai `sub` dan alamat email yang terverifikasi.
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge", await buatChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  if (opsi.maksud === "hapus-akun") {
    // MEMINTA GOOGLE MEMBUKTIKAN ULANG, bukan sekadar menerbitkan code.
    //
    // Inti re-auth adalah membuktikan bahwa orang yang menekan tombol SEKARANG
    // adalah pemiliknya. Bila Google mengembalikan code diam-diam karena
    // peramban ini masih punya sesi Google yang hidup, yang terbukti hanyalah
    // "peramban ini pernah dipakai masuk ke Google" — persis kelemahan yang
    // seharusnya ditutup langkah ini.
    //
    // `max_age=0` menuntut autentikasi yang baru; `select_account` memastikan
    // pengguna menyatakan akun mana yang ia maksud alih-alih dipilihkan.
    //
    // BATASNYA JUJUR: yang bisa kita lakukan hanya MEMINTA. Apakah Google
    // benar-benar menegakkannya hanya terbaca dari klaim `auth_time` di
    // id_token, dan server kita saat ini hanya mencocokkan `sub` (PR-021).
    // Memverifikasi `auth_time` adalah perubahan backend — dicatat sebagai
    // langkah lanjutan, bukan diklaim sudah ada.
    url.searchParams.set("max_age", "0");
    url.searchParams.set("prompt", "select_account");
  }

  return url.toString();
}

/** Masuk lewat Google. */
export async function siapkanMasukGoogle(opsi: {
  clientId: string;
  asal: string;
  tujuan: string;
  simpanan?: Storage;
}): Promise<string> {
  return siapkanAlurGoogle({ ...opsi, maksud: "masuk" });
}

/**
 * Konfirmasi ulang identitas untuk MENGHAPUS akun (PR-033c-2).
 *
 * `tujuan` sengaja tidak diminta: sesudah akun terhapus tidak ada halaman yang
 * masuk akal untuk dituju selain beranda, dan membawa tujuan lama berarti
 * mengantar pengguna ke halaman yang butuh akun yang baru saja ia hapus.
 */
export async function siapkanHapusAkunGoogle(opsi: {
  clientId: string;
  asal: string;
  simpanan?: Storage;
}): Promise<string> {
  return siapkanAlurGoogle({ ...opsi, tujuan: "/", maksud: "hapus-akun" });
}

export type HasilTitipan =
  | { ok: true; verifier: string; tujuan: string; maksud: MaksudOAuth }
  | { ok: false; sebab: "hilang" | "state-tidak-cocok" };

/**
 * Ambil titipan dan cocokkan `state`-nya — SEKALI PAKAI.
 *
 * KENAPA `state` DIPERIKSA. Tanpa pemeriksaan ini, penyerang bisa memancing
 * korban membuka alamat kembalian yang membawa authorization code MILIK
 * PENYERANG. Korban tidak melihat kejanggalan apa pun: ia mendarat di aplikasi
 * yang benar dan tampak sudah masuk — tetapi ke akun penyerang. Segala yang ia
 * tulis sesudah itu (CV, riwayat kerja, nomor HP) masuk ke akun yang bukan
 * miliknya, dan penyerang tinggal membukanya. Ini login-CSRF, dan akibatnya di
 * platform ini adalah kebocoran data pribadi yang paling sensitif.
 *
 * Titipannya DIHAPUS lebih dulu, apa pun hasilnya: alamat kembalian bisa
 * dibuka ulang (tombol kembali, riwayat, tab dipulihkan), dan verifier yang
 * masih tersimpan berarti percobaan kedua memakai rahasia yang sama.
 */
export function ambilTitipan(stateDariUrl: string | null, simpanan?: Storage): HasilTitipan {
  const gudang = simpanan ?? sessionStorage;
  const mentah = gudang.getItem(KUNCI);
  gudang.removeItem(KUNCI);

  if (mentah === null) return { ok: false, sebab: "hilang" };

  let titipan: TitipanOAuth;
  try {
    titipan = JSON.parse(mentah) as TitipanOAuth;
  } catch {
    return { ok: false, sebab: "hilang" };
  }

  if (typeof titipan.verifier !== "string" || typeof titipan.state !== "string") {
    return { ok: false, sebab: "hilang" };
  }
  if (stateDariUrl === null || stateDariUrl !== titipan.state) {
    return { ok: false, sebab: "state-tidak-cocok" };
  }

  return {
    ok: true,
    verifier: titipan.verifier,
    // Dibersihkan LAGI saat dibaca, meski sudah dibersihkan saat ditulis:
    // `sessionStorage` bisa disunting lewat devtools, dan pembersihan yang
    // hanya terjadi di satu sisi adalah pembersihan yang bisa dilewati.
    tujuan: bersihkanTujuan(titipan.tujuan),
    // Titipan yang tidak menyebut maksudnya diperlakukan sebagai MASUK, bukan
    // sebagai hapus akun. Bentuk lama (sebelum PR-033c-2) bisa saja masih
    // tersimpan di tab yang belum ditutup, dan menebak "hapus akun" untuk
    // sesuatu yang tidak menyatakannya adalah cara terburuk untuk salah.
    maksud: titipan.maksud === "hapus-akun" ? "hapus-akun" : "masuk",
  };
}
