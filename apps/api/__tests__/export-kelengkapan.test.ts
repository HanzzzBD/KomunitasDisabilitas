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
import { dataExportSchema } from "@nawasena/schemas";
import { bacaSchemaPrisma, tabelBerelasiUser } from "./helpers/prisma-schema.js";

const schema = bacaSchemaPrisma();

/** Bagian yang BENAR-BENAR ada di berkas ekspor hari ini. */
const TERDAFTAR: Readonly<Record<string, string>> = {
  users: "account",
  // Keempatnya menyumbang SATU bagian (`profile`), dan itu memang benar: riwayat
  // kerja, pendidikan, dan keahlian tidak berarti apa-apa lepas dari profil yang
  // memilikinya. Peta di sini table→bagian, bukan bagian→table, jadi banyak
  // tabel boleh menunjuk bagian yang sama.
  seeker_profiles: "profile",
  experiences: "profile",
  educations: "profile",
  skills: "profile",
  // Dibayar 2026-09-05 (U-03 & U-04). Keduanya sempat berada di DITUNDA dengan
  // alasan yang sudah berhenti benar — lihat catatan di atas DITUNDA.
  accessibility_profiles: "accessibility",
  notifications: "notifications",
};

/**
 * Belum menjadi bagian berkas ekspor. Daftar ini ADALAH AC-1 PR-022 ("ekspor
 * memuat akun, preferensi, profil, CV, lamaran, notifikasi") — dipindahkan dari
 * checklist dokumen ke tempat yang tidak bisa dilewati.
 *
 * KETIGA SISANYA BENAR-BENAR BELUM BISA ADA. Tabelnya sudah ada sejak migrasi
 * 02–03, tetapi tidak ada endpoint yang menulisnya: pengguna hari ini tidak bisa
 * membuat CV maupun melamar, dan `ai_usage` menunggu endpoint AI pertama. Jadi
 * ekspor tanpa bagian-bagian ini bukan ekspor yang setengah jadi — ia lengkap
 * terhadap data yang benar-benar bisa dimiliki seseorang.
 *
 * PELAJARAN YANG DIBAYAR MAHAL, SENGAJA DITINGGALKAN DI SINI. Sampai 2026-09-05,
 * kalimat pembenar di atas juga dipakai untuk `accessibility_profiles` dan
 * `notifications` — padahal blocker keduanya sudah lunas (modul accessibility
 * sejak Phase 04, notifications sejak PR-047) dan datanya sudah ada untuk
 * pengguna sungguhan. Selama lima phase, orang yang memakai haknya mengunduh
 * data pribadi menerima berkas yang kurang, tanpa satu pun gejala. Keduanya
 * ditemukan lewat rekonsiliasi utang, bukan lewat laporan pengguna, dan dibayar
 * hari itu juga — keduanya kini ada di TERDAFTAR.
 *
 * Penjaga ini TIDAK gagal: `DITUNDA` memang keadaan yang sah, dan ia tidak bisa
 * (dan tidak seharusnya) memutuskan kapan utang dibayar. Yang tidak ada adalah
 * peninjauan ULANG alasannya saat blocker-nya lunas.
 *
 * ATURAN YANG LAHIR DARINYA: setiap kali sebuah modul baru lahir, periksa apakah
 * ia menghapus alasan penundaan di daftar ini. Status utang dilacak di
 * docs/utang-teknis.md.
 */
const DITUNDA: Readonly<Record<string, string>> = {
  resumes: "modul resumes (Phase 09) — belum ada endpoint yang bisa membuat CV",
  applications: "modul applications (Phase 12) — belum ada endpoint yang bisa melamar",
  // Pemiliknya dikoreksi 2026-09-05 (U-05): Phase 06 melahirkan MODULNYA, bukan
  // datanya. `boot.ts` belum merakit `aiClient` (U-06), jadi belum ada satu pun
  // baris `ai_usage` milik siapa pun. Yang akan melahirkan datanya PR-066.
  ai_usage:
    "PR-066 (endpoint AI pertama) — Phase 06 melahirkan modulnya, bukan datanya; tabel masih kosong",
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
  devices:
    "kredensial pengiriman, bukan data pribadi — alasannya sama persis dengan refresh_tokens. Isinya token FCM: siapa pun yang memegangnya bisa mengirim notifikasi ke layar kunci perangkat itu, dan mengekspornya memindahkan kemampuan itu ke berkas yang beredar lewat email/cloud. Yang tersisa (platform, last_seen_at) tidak memberi tahu pemiliknya apa pun yang tidak sudah ia ketahui dari perangkat di tangannya. Dihapus saat purge — lihat TABEL_DIHAPUS di purge.service.ts.",
};

/** Tabel yang barisnya terikat pada seorang pengguna (parser: helpers/prisma-schema). */
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

  it("seluruh kategori yang dijanjikan AC-1 terdaftar ATAU masih tercatat sebagai utang", () => {
    // AC-1 menyebut: akun, preferensi, profil, CV, lamaran, notifikasi.
    //
    // Pemeriksaannya sengaja "terdaftar ATAU ditunda", bukan "ditunda" saja.
    // Bentuk lamanya menuntut `seeker_profiles` ada di DITUNDA — yang berarti
    // MEMBAYAR utang itu (PR-038) membuat penjaganya merah, dan penjaga yang
    // menghukum perbaikan adalah penjaga yang akhirnya dilonggarkan orang.
    // Yang benar-benar dijaga adalah bahwa tidak satu pun kategori menguap
    // begitu dokumen phase-nya ditutup.
    for (const tabel of [
      "accessibility_profiles",
      "seeker_profiles",
      "resumes",
      "applications",
      "notifications",
    ]) {
      expect(
        tabel in TERDAFTAR || tabel in DITUNDA,
        `${tabel} hilang dari ekspor DAN dari daftar utang AC-1`,
      ).toBe(true);
    }
  });
});
