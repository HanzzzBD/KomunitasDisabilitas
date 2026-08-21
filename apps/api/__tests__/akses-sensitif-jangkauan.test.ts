// Penjaga JANGKAUAN pembacaan data sensitif (PR-039).
//
// KENAPA ADA. `bacaSensitif` menjamin bahwa pembacaan data disabilitas
// meninggalkan jejak — tetapi jaminan itu hanya berlaku bagi yang MELEWATINYA.
// Repository di bawahnya tetap punya `findSensitiveByUserId` yang membaca kedua
// kolom tanpa alasan dan tanpa audit, dan tidak ada satu pun hal di TypeScript
// yang menghalangi service berikutnya memanggilnya langsung.
//
// Kegagalannya tidak menimbulkan gejala apa pun: query berjalan, datanya benar,
// test hijau, dan `audit_logs` diam-diam berhenti lengkap. Baru terlihat saat
// seseorang bertanya "siapa yang membuka profil saya?" dan jawabannya kurang —
// yaitu pada saat jawabannya paling dibutuhkan dan paling tidak bisa diperbaiki
// surut.
//
// Karena itu jangkauannya dibatasi di sini. DIPASANG SELAGI BERSIH, sama seperti
// soft-delete-jangkauan.test.ts (PR-021a): saat PR-039 ditulis, pemanggilnya
// tepat dua — jalur pemilik dan jalur ber-alasan — jadi daftarnya lahir kecil
// dan setiap tambahan adalah keputusan yang terlihat, bukan warisan.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tanpaKomentar } from "./pemindai-kode.js";

const SRC = join(__dirname, "..", "src");
const WORKER_SRC = join(__dirname, "..", "..", "worker", "src");

/** Nama fungsi repository yang membaca kedua kolom sensitif. */
const FUNGSI = "findSensitiveByUserId";

/**
 * Berkas yang BOLEH memanggilnya, dan kenapa.
 *
 * Menambah entri di sini berarti ada jalur baca data disabilitas yang tidak
 * lewat `bacaSensitif`, dan pemanggilnya WAJIB menjelaskan bagaimana
 * pertanggungjawabannya dijamin. Jawaban yang benar hampir selalu "pakai
 * `bacaSensitif`", bukan "tambahkan ke daftar ini".
 */
const DIIZINKAN: ReadonlyArray<{ file: string; alasan: string }> = [
  {
    file: join("modules", "profiles", "repositories", "profile.repository.ts"),
    alasan: "tempat fungsinya didefinisikan",
  },
  {
    file: join("modules", "profiles", "services", "profiles.service.ts"),
    alasan:
      "jalur PEMILIK (snapshotFor/updateMe). Tidak menerima id dari input — identitas selalu dari sesi — jadi tidak ada pembacaan pihak lain yang bisa disembunyikan di baliknya (KEBIJAKAN_AUDIT.selfService)",
  },
  {
    file: join("modules", "profiles", "services", "sensitive-access.service.ts"),
    alasan: "jalur ber-alasan; ia yang menulis PROFILE_SENSITIVE_READ",
  },
];

const diizinkan = new Set(DIIZINKAN.map((d) => d.file));

function berkasTs(dir: string): string[] {
  const hasil: string[] = [];
  for (const entri of readdirSync(dir, { withFileTypes: true })) {
    const penuh = join(dir, entri.name);
    if (entri.isDirectory()) hasil.push(...berkasTs(penuh));
    else if (entri.name.endsWith(".ts")) hasil.push(penuh);
  }
  return hasil;
}

/** Berkas yang menyebut `FUNGSI` di dalam KODE (bukan di komentar). */
function pemanggil(root: string): string[] {
  return berkasTs(root)
    .filter((f) => tanpaKomentar(readFileSync(f, "utf8")).includes(FUNGSI))
    .map((f) => relative(root, f));
}

describe("jangkauan pembacaan data sensitif", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    // Fungsi yang berganti nama akan membuat daftar pemanggil kosong dan
    // SELURUH pemeriksaan di bawah hijau tanpa memeriksa apa pun.
    const ditemukan = pemanggil(SRC);
    expect(ditemukan.length).toBeGreaterThan(0);
    expect(ditemukan).toContain(DIIZINKAN[0]?.file);
  });

  it("tidak ada berkas di apps/api yang menyentuhnya di luar daftar", () => {
    const liar = pemanggil(SRC).filter((f) => !diizinkan.has(f));

    expect(
      liar,
      `Berkas berikut membaca data disabilitas tanpa melewati bacaSensitif, ` +
        `jadi pembacaannya TIDAK berjejak. Pakai sensitiveAccess.bacaSensitif() ` +
        `(docs/akses-data-sensitif.md), atau daftarkan di ` +
        `apps/api/__tests__/akses-sensitif-jangkauan.test.ts berikut alasannya: ${liar.join(", ")}`,
    ).toEqual([]);
  });

  it("apps/worker sama sekali tidak menyentuhnya", () => {
    // Worker menjalankan job terjadwal (purge, retensi, expiry). Tidak satu pun
    // di antaranya perlu membaca data disabilitas, dan yang kelak perlu
    // (matching, PR-069) harus melewati jalur ber-alasan seperti yang lain.
    expect(pemanggil(WORKER_SRC)).toEqual([]);
  });

  it("setiap alasan benar-benar ditulis, bukan diisi seadanya", () => {
    const pendek = DIIZINKAN.filter((d) => d.alasan.trim().length < 20);
    expect(pendek.map((d) => d.file)).toEqual([]);
  });

  it("tidak ada entri basi — berkas yang sudah tidak memanggilnya wajib dihapus", () => {
    // Arah sebaliknya. Tanpa ini, daftar hanya bertambah dan pelan-pelan
    // menjadi katalog izin yang tidak lagi dipakai siapa pun.
    const ditemukan = new Set(pemanggil(SRC));
    const basi = DIIZINKAN.filter((d) => !ditemukan.has(d.file)).map((d) => d.file);
    expect(basi).toEqual([]);
  });

  it("pemindai membedakan kode dari komentar", () => {
    // docs/akses-data-sensitif.md dan komentar repository menyebut nama fungsi
    // ini sebagai prosa. Penjaga yang menuduh dokumentasinya sendiri akan
    // dimatikan orang, bukan diperbaiki.
    expect(tanpaKomentar(`// ${FUNGSI}\nconst x = 1;`)).not.toContain(FUNGSI);
    expect(tanpaKomentar(`const y = repo.${FUNGSI}(id);`)).toContain(FUNGSI);
  });

  it("path pemisahnya benar di platform ini", () => {
    // `relative()` memakai pemisah OS; daftar di atas dirakit dengan join()
    // supaya tidak pecah di Windows. Pemeriksaan ini yang menangkapnya kalau
    // suatu saat ada yang menuliskannya sebagai literal ber-slash.
    for (const d of DIIZINKAN) expect(d.file).toContain(sep);
  });
});
