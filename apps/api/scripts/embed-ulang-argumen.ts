// Parser argumen `embed:ulang` (PR-069b). Terpisah dari skripnya supaya bisa
// diuji tanpa menyalakan koneksi DB/Redis.
import type { OpsiEmbedUlang } from "../src/modules/matching/index.js";

export const BANTUAN_EMBED_ULANG = `Pemakaian: pnpm --filter @nawasena/api embed:ulang [opsi]

Mencari profil & lowongan aktif yang belum punya vektor, lalu meng-enqueue job
ai-embed (diproses apps/worker). Lowongan didahulukan.

  --jenis=semua|profil|lowongan   bawaan: semua
  --maks=N                        batas per jalan; bawaan 25% pagu AI global harian
  --jarak-ms=N                    jarak antar-job (ms); bawaan 1000
  --kering                        hanya melapor, tidak meng-enqueue apa pun
  --bantuan                       tampilkan pesan ini`;

export class ArgumenTidakValidError extends Error {
  override name = "ArgumenTidakValidError";
}

export type HasilArgumen = { bantuan: true } | { bantuan: false; opsi: OpsiEmbedUlang };

function bilanganBulat(nama: string, nilai: string): number {
  const angka = Number(nilai);
  if (nilai.trim() === "" || !Number.isInteger(angka) || angka < 0) {
    throw new ArgumenTidakValidError(`--${nama} harus bilangan bulat ≥ 0, bukan "${nilai}"`);
  }
  return angka;
}

export function bacaArgumenEmbedUlang(
  argv: readonly string[],
  bawaan: { maks: number; jarakMs: number },
): HasilArgumen {
  const opsi: OpsiEmbedUlang = {
    jenis: "semua",
    maks: bawaan.maks,
    kering: false,
    jarakMs: bawaan.jarakMs,
  };

  for (const arg of argv) {
    if (arg === "--") continue; // pemisah yang diteruskan pnpm
    if (arg === "--bantuan" || arg === "--help") return { bantuan: true };
    if (arg === "--kering") {
      opsi.kering = true;
      continue;
    }
    const cocok = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (cocok === null) throw new ArgumenTidakValidError(`Argumen tidak dikenal: ${arg}`);
    const [, nama = "", nilai = ""] = cocok;
    if (nama === "jenis") {
      if (nilai !== "semua" && nilai !== "profil" && nilai !== "lowongan") {
        throw new ArgumenTidakValidError(`--jenis harus semua, profil, atau lowongan`);
      }
      opsi.jenis = nilai;
    } else if (nama === "maks") {
      opsi.maks = bilanganBulat(nama, nilai);
    } else if (nama === "jarak-ms") {
      opsi.jarakMs = bilanganBulat(nama, nilai);
    } else {
      throw new ArgumenTidakValidError(`Argumen tidak dikenal: --${nama}`);
    }
  }

  return { bantuan: false, opsi };
}
