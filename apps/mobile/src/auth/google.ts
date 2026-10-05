// Alur Sign in with Google Android (PR-090) — murni, diuji Vitest.
//
//   nonce dari server → Credential Manager (pilih akun) → id_token
//     → POST /auth/google/mobile → simpan sesi Nawasena
//
// BUKAN authorization code + PKCE (itu jalur web). Android tidak membuka
// browser/Custom Tab dan tidak memakai redirect `nawasena://` untuk Google:
// Credential Manager memberi id_token langsung, ber-`aud` Web Client ID kita
// (serverClientId). Penggantinya PKCE untuk anti-replay adalah nonce terbitan
// server yang dikonsumsi sekali.
import type { SessionTokens } from "@nawasena/schemas";

import { pesanGalat } from "./alur-masuk";

/** Kode galat dari modul native — kontrak dengan GoogleCredentialModule.kt. */
export type KodeGalatNative = "DIBATALKAN" | "TIDAK_ADA_AKUN" | "GAGAL";

export interface DepsGoogle {
  /** Web OAuth Client ID (serverClientId). Publik — bukan rahasia. */
  serverClientId: string;
  mintaNonce: () => Promise<string>;
  /** Tampilkan pemilih akun Credential Manager; hasilnya id_token. */
  pilihAkun: (serverClientId: string, nonce: string) => Promise<string>;
  tukar: (idToken: string) => Promise<SessionTokens>;
  /** Sesi baru dianggap berhasil setelah refresh token tersimpan aman di HP. */
  simpanSesi: (tokens: SessionTokens) => Promise<void>;
}

export type HasilGoogle =
  | { ok: true; tokens: SessionTokens }
  /** Native dapat membatalkan karena pengguna atau kendala konfigurasi Google. */
  | { ok: false; sebab: "dibatalkan"; pesan: string }
  | { ok: false; sebab: "galat"; pesan: string };

function kodeNative(err: unknown): KodeGalatNative | null {
  const kode = (err as { code?: unknown } | null)?.code;
  return kode === "DIBATALKAN" || kode === "TIDAK_ADA_AKUN" || kode === "GAGAL" ? kode : null;
}

export async function masukDenganGoogle(deps: DepsGoogle): Promise<HasilGoogle> {
  let idToken: string;
  try {
    // Nonce baru per percobaan: sekali pakai dan hangus dalam 5 menit.
    const nonce = await deps.mintaNonce();
    idToken = await deps.pilihAkun(deps.serverClientId, nonce);
  } catch (err) {
    const kode = kodeNative(err);
    if (kode === "DIBATALKAN") {
      return {
        ok: false,
        sebab: "dibatalkan",
        pesan: "Masuk dengan Google belum selesai. Coba lagi, atau masuk dengan nomor HP.",
      };
    }
    if (kode === "TIDAK_ADA_AKUN") {
      return {
        ok: false,
        sebab: "galat",
        pesan:
          "Belum ada akun Google di HP ini. Tambahkan akun di Setelan HP, atau masuk dengan nomor HP.",
      };
    }
    if (kode === "GAGAL") {
      return {
        ok: false,
        sebab: "galat",
        pesan: "Masuk dengan Google tidak berhasil. Coba lagi, atau masuk dengan nomor HP.",
      };
    }
    return { ok: false, sebab: "galat", pesan: pesanGalat(err) };
  }

  let tokens: SessionTokens;
  try {
    tokens = await deps.tukar(idToken);
  } catch (err) {
    return { ok: false, sebab: "galat", pesan: pesanGalat(err) };
  }

  try {
    await deps.simpanSesi(tokens);
  } catch {
    return {
      ok: false,
      sebab: "galat",
      pesan: "Tidak bisa menyimpan sesi di HP ini. Coba lagi.",
    };
  }
  return { ok: true, tokens };
}

/** Web Client ID dari env build. Kosong = tombol Google tidak ditampilkan (paritas web). */
export function serverClientIdGoogle(
  nilai: string | undefined = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
): string | null {
  const id = (nilai ?? "").trim();
  return id.endsWith(".apps.googleusercontent.com") ? id : null;
}
