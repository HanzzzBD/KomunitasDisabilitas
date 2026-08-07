// Penjaga rujukan path di dokumen utama (audit dokumen 2026-08-07).
//
// KENAPA ADA. Audit menemukan CLAUDE.md merujuk `docs/PR-PLAN.md` (tidak pernah
// ada), `docker-compose.yml` (namanya `docker-compose.dev.yml`), `Dockerfile` di
// root (adanya di `apps/api/`), dan `docs/README.md` (tidak ada). Akibatnya
// Quick Start untuk developer baru gagal dijalankan — tiga perintah, tiga-tiganya
// menunjuk file yang tidak ada.
//
// Yang dijaga: setiap path yang DIRUJUK dokumen harus benar-benar ada, kecuali
// yang terdaftar sebagai rencana di `BELUM_ADA` di bawah. Daftar itu sendiri
// adalah dokumentasi: ia memaksa "belum ada" menjadi pernyataan sadar, bukan
// kelalaian yang menyamar sebagai fakta.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");

/** Dokumen yang rujukannya dijaga. Keduanya dibaca manusia baru & agent. */
const DOKUMEN = ["CLAUDE.md", "README.md"];

/**
 * Path yang sengaja BELUM ada — direncanakan, bukan salah tulis. Menghapus
 * entri dari sini saat filenya lahir adalah bagian dari PR yang melahirkannya.
 */
const BELUM_ADA = new Set([
  // Lahir di Phase 16 (infra/deploy.sh) — lihat phase-16-infrastructure-observability.md.
  "deploy.sh",
  "infra/deploy.sh",
]);

/**
 * File yang keberadaannya BERGANTUNG MESIN: dibuat developer, di-gitignore
 * (ADR-015). Tidak boleh masuk BELUM_ADA — di laptop yang sudah menyalinnya,
 * pemeriksaan kebalikan akan menuduhnya "sudah ada, hapus dari daftar".
 */
const LOKAL = new Set(["apps/api/.env", ".env"]);

/**
 * Rujukan inline hanya diperiksa bila BENTUKNYA memang path repo: ada prefiks
 * folder yang dikenal, atau ia file root yang namanya khas. Tanpa syarat itu,
 * penyebutan nama file sebagai prosa (`index.ts`, `.env.example`,
 * `implementation_log_phaseXX.md`) ikut terjaring dan penjaganya jadi berisik —
 * dan penjaga yang berisik akan dimatikan orang, bukan diperbaiki.
 */
const BERBENTUK_PATH = /^(apps|packages|docs|infra|\.github)\/|^docker-compose[\w.-]*\.ya?ml$|^Dockerfile$/;

/** Rujukan bergaya markdown: [teks](path) — anchor & URL dilewati. */
function tautan(isi: string): string[] {
  return [...isi.matchAll(/\]\(([^)]+)\)/g)]
    .map((m) => (m[1] as string).trim())
    .filter((t) => !/^(https?:|mailto:|#)/.test(t))
    .map((t) => t.replace(/#.*$/, ""));
}

/** Rujukan di dalam `kode inline` yang berbentuk path repo. */
function pathInline(isi: string): string[] {
  return [...isi.matchAll(/`([^`\n]+)`/g)]
    .map((m) => (m[1] as string).trim())
    .filter((t) => !/[\s(){}<>*|]/.test(t))
    .filter((t) => BERBENTUK_PATH.test(t))
    .filter((t) => !t.includes("*"));
}

describe("rujukan path di dokumen utama benar-benar ada", () => {
  for (const dokumen of DOKUMEN) {
    it(`${dokumen} — semua path yang dirujuk ada di repo`, () => {
      const isi = readFileSync(resolve(root, dokumen), "utf8");
      const dirujuk = [...new Set([...tautan(isi), ...pathInline(isi)])];

      // Penyaring yang terlalu ketat akan membuat daftar kosong dan test hijau
      // tanpa memeriksa apa pun. Yang menjaga penjaganya adalah baris ini.
      expect(dirujuk.length).toBeGreaterThan(3);

      const hilang = dirujuk
        .map((t) => t.replace(/^\.\//, ""))
        .filter((t) => !BELUM_ADA.has(t) && !LOKAL.has(t))
        .filter((t) => !existsSync(resolve(root, t)));

      expect(hilang, `${dokumen} merujuk path yang tidak ada: ${hilang.join(", ")}`).toEqual([]);
    });
  }

  it("daftar BELUM_ADA tidak menyembunyikan file yang sebenarnya sudah ada", () => {
    // Kebalikannya: begitu `deploy.sh` lahir, entrinya WAJIB dihapus — kalau
    // tidak, daftar ini pelan-pelan berubah menjadi tempat sampah pengecualian.
    const sudahAda = [...BELUM_ADA].filter((t) => existsSync(resolve(root, t)));
    expect(sudahAda).toEqual([]);
  });
});
