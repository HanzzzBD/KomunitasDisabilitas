// Penjaga KELENGKAPAN purge PDP (PR-023).
//
// KENAPA ADA, DAN KENAPA TIDAK CUKUP MENGANDALKAN CASCADE. Purge punya dua
// jalur (lihat purge.service.ts). Jalur hapus-penuh aman selamanya: `DELETE
// FROM users` menyerahkan sisanya kepada `ON DELETE CASCADE`, jadi tabel yang
// lahir di PR mana pun ikut tercakup tanpa ada yang perlu mengingatnya.
//
// Jalur ANONIMISASI tidak punya kemewahan itu. Baris `users` sengaja
// dipertahankan supaya hired count (North Star) selamat — dan justru karena
// barisnya tidak pernah dihapus, cascade tidak pernah menyala. Setiap tabel
// harus disebut satu per satu, dan tabel yang terlewat akan menyimpan data
// pribadi seseorang SELAMANYA tanpa satu pun gejala: job melaporkan sukses,
// audit mencatat "dibersihkan", dan datanya masih di sana.
//
// Karena itu setiap model berelasi `User` wajib berada di salah satu dari tiga
// keadaan. Tabel baru = build merah sampai seseorang memutuskan.
import { describe, it, expect } from "vitest";
import { TABEL_DIHAPUS } from "../src/modules/users/index.js";
import { bacaSchemaPrisma, modelBerelasiUser } from "./helpers/prisma-schema.js";

const berelasi = modelBerelasiUser(bacaSchemaPrisma());

/**
 * Sengaja DIPERTAHANKAN pada jalur anonimisasi, dengan alasan yang harus
 * bertahan dibaca ulang setahun kemudian.
 */
const DIPERTAHANKAN: Readonly<Record<string, string>> = {
  applications:
    "hired count adalah North Star Metric proyek ini (SDD §6.4). Barisnya ber-onDelete Cascade, jadi menghapusnya berarti setiap orang yang menghapus akunnya ikut menghapus bukti bahwa platform ini pernah menempatkan seseorang bekerja. Setelah baris users dianonimkan, lamaran ini tidak lagi menunjuk siapa pun.",
};

/**
 * Relasi KEPENGARANGAN, bukan kepemilikan: barisnya milik platform, dan
 * pengguna hanya tercatat sebagai pembuat/verifikatornya. FK-nya `SetNull`,
 * jadi tautannya lepas sendiri saat baris users dihapus.
 */
const KEPENGARANGAN: Readonly<Record<string, string>> = {
  companies: "verified_by — data perusahaan milik platform; menghapusnya karena verifikatornya pergi akan menghilangkan status verifikasi yang sah.",
  jobs: "created_by — lowongan milik platform; riwayat lamaran orang lain bergantung padanya.",
  sign_videos: "created_by — kamus BISINDO milik platform, dipakai seluruh pengguna.",
};

describe("pemindai schema.prisma (purge)", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    expect(berelasi.length).toBeGreaterThan(10);
    expect(berelasi.map((m) => m.tabel)).toContain("seeker_profiles");
  });

  it("nama delegate diturunkan benar dari nama model", () => {
    // `TABEL_DIHAPUS` memakai nama delegate klien Prisma (`seekerProfile`),
    // bukan nama tabel DB. Penurunan yang salah membuat seluruh pemeriksaan
    // silang di bawah membandingkan dua daftar yang tidak pernah bisa cocok.
    const petaModel = new Map(berelasi.map((m) => [m.tabel, m.delegate]));
    expect(petaModel.get("seeker_profiles")).toBe("seekerProfile");
    expect(petaModel.get("ai_usage")).toBe("aiUsage");
    expect(petaModel.get("refresh_tokens")).toBe("refreshToken");
  });
});

describe("kelengkapan purge — setiap tabel data pengguna sudah diputuskan", () => {
  const dihapus = new Set<string>(TABEL_DIHAPUS);

  it("tidak ada tabel berelasi User yang belum diputuskan", () => {
    const belum = berelasi.filter(
      (m) =>
        !dihapus.has(m.delegate) &&
        !(m.tabel in DIPERTAHANKAN) &&
        !(m.tabel in KEPENGARANGAN),
    );

    expect(
      belum.map((m) => m.tabel),
      "Tabel berikut menyimpan data terkait pengguna tetapi tidak diputuskan nasibnya saat purge. " +
        "Jalur anonimisasi TIDAK memicu cascade — tabel yang terlewat akan menyimpan data pribadi " +
        "selamanya tanpa gejala. Tambahkan ke TABEL_DIHAPUS (purge.service.ts), atau daftarkan di " +
        "DIPERTAHANKAN/KEPENGARANGAN beserta alasannya.",
    ).toEqual([]);
  });

  it("setiap entri TABEL_DIHAPUS benar-benar model yang ada", () => {
    // Arah sebaliknya: nama delegate salah ketik akan melempar saat runtime —
    // di tengah transaksi purge, pada akun sungguhan. Lebih murah di CI.
    const dikenal = new Set(berelasi.map((m) => m.delegate));
    const asing = [...TABEL_DIHAPUS].filter((t) => !dikenal.has(t));

    expect(asing, `Bukan model berelasi User: ${asing.join(", ")}`).toEqual([]);
  });

  it("daftar pengecualian tidak menyimpan entri basi", () => {
    const dikenal = new Set(berelasi.map((m) => m.tabel));
    const basi = [...Object.keys(DIPERTAHANKAN), ...Object.keys(KEPENGARANGAN)].filter(
      (t) => !dikenal.has(t),
    );

    expect(basi, `Entri tidak cocok dengan tabel mana pun: ${basi.join(", ")}`).toEqual([]);
  });

  it("setiap alasan benar-benar ditulis, bukan diisi seadanya", () => {
    const pendek = [...Object.entries(DIPERTAHANKAN), ...Object.entries(KEPENGARANGAN)].filter(
      ([, alasan]) => alasan.trim().length < 40,
    );

    expect(pendek.map(([t]) => t)).toEqual([]);
  });

  it("applications TIDAK ada di TABEL_DIHAPUS — di situlah hired count hidup", () => {
    // Pemeriksaan yang tampak berlebihan, dan justru karena itu ada: menambah
    // `application` ke daftar penghapusan adalah satu baris yang terlihat wajar
    // dan menghapus North Star Metric proyek ini secara diam-diam.
    expect(dihapus.has("application")).toBe(false);
  });

  it("refresh_tokens ikut dihapus meski retensinya 180 hari (SDD §6.4)", () => {
    // Retensi refresh_tokens adalah jendela deteksi reuse — tetapi ia TIDAK
    // menahan hak hapus: SDD menyatakan akun terhapus membawa serta
    // refresh_tokens-nya. Jalur anonimisasi harus menegakkan itu sendiri,
    // karena cascade tidak menyala di sana.
    expect(dihapus.has("refreshToken")).toBe(true);
  });
});
