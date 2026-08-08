// Pembaca `schema.prisma` untuk penjaga-penjaga yang menuntut keputusan atas
// setiap tabel data pengguna (PR-022 ekspor, PR-023 purge).
//
// Ditaruh di satu tempat karena dua penjaga memakai pertanyaan yang sama —
// "model mana yang menyimpan data milik seorang pengguna?" — dan dua salinan
// parser akan bebas menyimpang. Yang menyimpang diam-diam adalah yang paling
// berbahaya: penjaga yang berhenti menjaring tetap hijau.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ModelBerelasi {
  /** Nama model Prisma, mis. `SeekerProfile`. */
  model: string;
  /** Nama delegate klien Prisma, mis. `seekerProfile`. */
  delegate: string;
  /** Nama tabel DB dari `@@map`, mis. `seeker_profiles`. */
  tabel: string;
}

export function bacaSchemaPrisma(): string {
  return readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
}

/**
 * Model yang punya field bertipe `User`/`User?` — yaitu yang barisnya terikat
 * pada seorang pengguna, baik sebagai pemilik maupun sebagai pengarang.
 *
 * `audit_logs` tidak akan muncul dan itu disengaja: ia TIDAK punya FK ke users
 * (skema PR-009), justru supaya jejak audit bertahan melewati penghapusan akun.
 */
export function modelBerelasiUser(prismaSchema: string): ModelBerelasi[] {
  const hasil: ModelBerelasi[] = [];
  const modelPola = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  let cocok: RegExpExecArray | null;
  while ((cocok = modelPola.exec(prismaSchema)) !== null) {
    const model = cocok[1] as string;
    const isi = cocok[2] as string;
    // Field relasi berbentuk `nama  User` atau `nama User?  @relation(...)`.
    // `userId String` TIDAK cocok — itu kolom skalar, bukan relasi.
    if (!/^\s*\w+\s+User\??\s/m.test(isi)) continue;
    const map = /@@map\("([^"]+)"\)/.exec(isi);
    if (map === null) continue;
    hasil.push({
      model,
      delegate: model.charAt(0).toLowerCase() + model.slice(1),
      tabel: map[1] as string,
    });
  }
  return hasil.sort((a, b) => a.tabel.localeCompare(b.tabel));
}

/** Nama tabel saja — bentuk yang dipakai penjaga ekspor. */
export function tabelBerelasiUser(prismaSchema: string): string[] {
  return modelBerelasiUser(prismaSchema).map((m) => m.tabel);
}
