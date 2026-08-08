// Penjaga KELENGKAPAN ekspor data pribadi (PR-022).
//
// KENAPA ADA. Hak portabilitas UU PDP (§8.7) menuntut SELURUH data seseorang.
// Platform ini akan tumbuh — profil karier, CV, lamaran, notifikasi — dan tiap
// tabel baru adalah kesempatan baru untuk melupakan ekspornya. Kelalaian itu
// tidak menimbulkan gejala apa pun: endpoint tetap 200, test tetap hijau, dan
// pengguna menerima berkas yang kurang tanpa satu pun cara mengetahuinya.
//
// Karena itu daftar di bawah BUKAN dokumentasi, melainkan syarat build. Setiap
// model Prisma yang punya relasi ke `User` harus berada di salah satu dari tiga
// keadaan:
//
//   TERDAFTAR  — sudah menjadi bagian berkas ekspor hari ini
//   DITUNDA    — belum, dan menyebut PR yang akan mengambilnya
//   DIKECUALIKAN — tidak akan pernah, dengan alasan tertulis
//
// Tabel baru yang tidak masuk salah satunya membuat build MERAH sampai
// seseorang memutuskan. Itulah seluruh gunanya: memaksa keputusan pada saat
// tabelnya lahir, bukan menunggu ada yang teringat.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dataExportSchema } from "@nawasena/schemas";

const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");

/** Bagian yang BENAR-BENAR ada di berkas ekspor hari ini. */
const TERDAFTAR: Readonly<Record<string, string>> = {
  users: "account",
};

/**
 * Menunggu modul pemiliknya lahir. Daftar ini ADALAH AC-1 PR-022 ("ekspor
 * memuat akun, preferensi, profil, CV, lamaran, notifikasi") — dipindahkan dari
 * checklist dokumen ke tempat yang tidak bisa dilewati.
 *
 * Tabelnya sudah ada sejak migrasi 02–03, tetapi TIDAK ADA endpoint yang bisa
 * mengisinya: pengguna hari ini tidak bisa membuat profil karier, CV, lamaran,
 * atau notifikasi. Jadi ekspor tanpa bagian-bagian ini bukan ekspor yang
 * setengah jadi — ia lengkap terhadap data yang benar-benar bisa dimiliki.
 */
const DITUNDA: Readonly<Record<string, string>> = {
  accessibility_profiles: "modul accessibility (Phase 04) — preferensi UI milik pengguna",
  seeker_profiles: "PR-037 — termasuk field terenkripsi yang didekripsi hanya untuk pemiliknya (ADR-007)",
  experiences: "PR-037 — riwayat kerja",
  educations: "PR-037 — riwayat pendidikan",
  skills: "PR-037 — daftar keterampilan",
  resumes: "modul resumes (Phase 09) — CV beserta isinya",
  applications: "modul applications (Phase 12) — riwayat lamaran & status",
  notifications: "modul notifications (Phase 07) — riwayat pemberitahuan",
  ai_usage: "modul AI (Phase 06) — pemakaian fitur AI oleh pengguna ybs",
};

/**
 * Tidak akan pernah masuk ekspor. Alasannya WAJIB, dan sengaja spesifik: entri
 * tanpa alasan berubah menjadi tempat sampah dalam dua PR.
 */
const DIKECUALIKAN: Readonly<Record<string, string>> = {
  refresh_tokens:
    "kredensial sesi, bukan data pribadi. Isinya hash token — tidak berguna bagi pengguna, dan mengekspornya memindahkan bahan pengambilalihan ke berkas yang beredar lewat email/cloud.",
  match_scores:
    "cache turunan yang selalu bisa dihitung ulang (retensi 7 hari, SDD §6.2). Yang bermakna bagi pengguna adalah profil dan lowongannya, bukan skor sementara di antaranya.",
  companies:
    "relasi `verified_by` adalah KEPENGARANGAN admin atas entitas lain, bukan data pribadi subjeknya. Mengekspornya membocorkan data perusahaan ke berkas milik seseorang.",
  jobs: "relasi `created_by` — sama seperti companies: data lowongan milik platform, bukan milik kuratornya.",
  sign_videos: "relasi `created_by` — sama seperti companies: konten kamus BISINDO milik platform.",
};

/**
 * Model + nama tabelnya yang punya field bertipe `User`/`User?`.
 *
 * `audit_logs` tidak akan muncul di sini dan itu disengaja: ia TIDAK punya FK ke
 * users (skema PR-009), justru supaya jejak audit bertahan melewati penghapusan
 * akun. Ia juga bukan kandidat ekspor — isinya catatan keamanan kami yang
 * memuat aktor lain.
 */
export function tabelBerelasiUser(prismaSchema: string): string[] {
  const tabel: string[] = [];
  const modelPola = /^model\s+\w+\s*\{([\s\S]*?)^\}/gm;

  let cocok: RegExpExecArray | null;
  while ((cocok = modelPola.exec(prismaSchema)) !== null) {
    const isi = cocok[1] as string;
    // Field relasi berbentuk `nama  User` atau `nama User?  @relation(...)`.
    if (!/^\s*\w+\s+User\??\s/m.test(isi)) continue;
    const map = /@@map\("([^"]+)"\)/.exec(isi);
    if (map !== null) tabel.push(map[1] as string);
  }
  return tabel.sort();
}

const berelasi = tabelBerelasiUser(schema);

describe("pemindai schema.prisma", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Regex model yang tidak cocok lagi (mis. format schema berubah) akan
    // membuat daftar kosong dan SELURUH pemeriksaan di bawah hijau tanpa
    // memeriksa satu tabel pun.
    expect(berelasi.length).toBeGreaterThan(10);
    expect(berelasi).toContain("seeker_profiles");
    expect(berelasi).toContain("refresh_tokens");
  });

  it("tidak menjaring model tanpa relasi ke User", () => {
    // `audit_logs` sengaja tanpa FK (PR-009) supaya jejak bertahan melewati
    // hapus akun. Ia harus tetap di luar — kalau ikut terjaring, penjaga ini
    // akan menuntut keputusan atas tabel yang bukan urusannya.
    expect(berelasi).not.toContain("audit_logs");
    expect(berelasi).not.toContain("users");
  });

  it("membedakan relasi bernama dari kolom biasa", () => {
    const contoh = `
model Contoh {
  id        String  @id
  userLabel String
  creator   User?   @relation("ContohCreator", fields: [createdBy], references: [id])
  @@map("contoh")
}
model TanpaRelasi {
  id     String @id
  userId String
  @@map("tanpa_relasi")
}
`;
    // `userLabel`/`userId` adalah kolom skalar, bukan relasi. Menjaringnya akan
    // membuat penjaga menuntut keputusan atas tabel yang tidak menyimpan data
    // pengguna sama sekali — dan penjaga berisik akan dimatikan orang.
    expect(tabelBerelasiUser(contoh)).toEqual(["contoh"]);
  });
});

describe("kelengkapan ekspor — setiap tabel data pengguna sudah diputuskan", () => {
  it("tidak ada tabel berelasi User yang belum diputuskan", () => {
    const belum = berelasi.filter(
      (t) => !(t in TERDAFTAR) && !(t in DITUNDA) && !(t in DIKECUALIKAN),
    );

    expect(
      belum,
      "Tabel berikut menyimpan data pengguna tetapi belum diputuskan nasibnya di ekspor PDP. " +
        "Daftarkan sebagai bagian ekspor, tunda dengan menyebut PR pengambilnya, atau " +
        `kecualikan dengan alasan (apps/api/__tests__/export-kelengkapan.test.ts): ${belum.join(", ")}`,
    ).toEqual([]);
  });

  it("tidak ada entri basi — tabel yang sudah tidak ada wajib dihapus dari daftar", () => {
    // Arah sebaliknya. Tanpa ini, daftar hanya bertambah dan pelan-pelan
    // menjadi katalog tabel yang sudah lama tidak ada.
    const dikenal = new Set([...berelasi, "users"]);
    const basi = [
      ...Object.keys(TERDAFTAR),
      ...Object.keys(DITUNDA),
      ...Object.keys(DIKECUALIKAN),
    ].filter((t) => !dikenal.has(t));

    expect(basi, `Entri berikut tidak cocok dengan tabel mana pun: ${basi.join(", ")}`).toEqual([]);
  });

  it("setiap alasan benar-benar ditulis, bukan diisi seadanya", () => {
    const terlaluPendek = [
      ...Object.entries(DITUNDA),
      ...Object.entries(DIKECUALIKAN),
    ].filter(([, alasan]) => alasan.trim().length < 20);

    expect(terlaluPendek.map(([t]) => t)).toEqual([]);
  });

  it("bagian terdaftar benar-benar ada di kontrak ekspor", () => {
    // Kontributor yang tidak punya tempat di `dataExportSchema` akan ditolak
    // saat runtime (skema itu `.strict()`), tetapi menemukannya di CI jauh
    // lebih murah daripada menemukannya lewat 500 di produksi.
    const kunciKontrak = new Set(Object.keys(dataExportSchema.shape));
    for (const bagian of Object.values(TERDAFTAR)) {
      expect(kunciKontrak, `bagian "${bagian}" tidak ada di dataExportSchema`).toContain(bagian);
    }
  });

  it("daftar DITUNDA memuat seluruh kategori yang dijanjikan AC-1", () => {
    // AC-1 menyebut: akun, preferensi, profil, CV, lamaran, notifikasi.
    // `account` sudah terdaftar; lima sisanya harus terlacak sebagai utang,
    // bukan menguap begitu dokumen phase ditutup.
    for (const tabel of [
      "accessibility_profiles",
      "seeker_profiles",
      "resumes",
      "applications",
      "notifications",
    ]) {
      expect(DITUNDA, `${tabel} hilang dari daftar utang AC-1`).toHaveProperty(tabel);
    }
  });
});
