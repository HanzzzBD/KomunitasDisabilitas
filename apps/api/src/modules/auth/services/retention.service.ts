// modules/auth — kebijakan retensi `refresh_tokens` (PR-024a, SDD §6.4).
//
// KENAPA DI SINI, BUKAN DI BERKAS MAINTENANCE. Ambang 180 hari BUKAN setelan
// kebersihan storage — ia adalah JENDELA DETEKSI REUSE. Baris yang dicabut
// adalah satu-satunya cara `session.service.ts` membedakan token curian dari
// token yang tidak dikenal: begitu barisnya hilang, replay terbaca sebagai
// "tidak dikenal" dan keluarga token tidak pernah dicabut.
//
// Alasan sepenting itu harus duduk di sebelah kode yang bergantung padanya.
// Ditaruh di berkas retensi umum, ia akan dibaca sebagai angka yang boleh
// dikecilkan demi menghemat disk — dan orang yang mengecilkannya tidak akan
// pernah tahu bahwa ia baru saja memperpendek kemampuan kita melihat pencurian
// sesi.
import type { RetentionPolicy } from "../../users/index.js";
import type { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";

/** Umur (hari) per kategori — datang dari env, default SDD §6.4. */
export interface RefreshTokenRetentionDays {
  /** Kedaluwarsa dan TIDAK pernah dicabut: tidak membawa bukti apa pun. */
  expired: number;
  /** Dicabut karena rotasi/logout/hapus akun — jendela deteksi reuse. */
  revoked: number;
  /** Dicabut karena reuse TERDETEKSI: bukti insiden, sejajar audit_logs. */
  reuse: number;
}

function cutoff(now: Date, hari: number): Date {
  return new Date(now.getTime() - hari * 86_400_000);
}

/**
 * Tiga kebijakan, satu tabel. Dipisah supaya laporan dan audit menyebut
 * kategori mana yang bergerak — "refresh_tokens berkurang 40.000 baris" tidak
 * memberi tahu apakah yang hilang sampah rotasi atau bukti insiden.
 */
export function createRefreshTokenPolicies(deps: {
  repository: Pick<RefreshTokenRepository, "countRetention" | "deleteRetentionBatch">;
  days: RefreshTokenRetentionDays;
}): RetentionPolicy[] {
  const { repository, days } = deps;

  const buat = (
    kategori: "expired" | "revoked" | "reuse",
    hari: number,
  ): RetentionPolicy => ({
    nama: `refresh_tokens.${kategori}`,
    hitung: (now) => repository.countRetention(kategori, cutoff(now, hari)),
    hapus: (now, batas) => repository.deleteRetentionBatch(kategori, cutoff(now, hari), batas),
  });

  return [
    buat("expired", days.expired),
    buat("revoked", days.revoked),
    buat("reuse", days.reuse),
  ];
}
