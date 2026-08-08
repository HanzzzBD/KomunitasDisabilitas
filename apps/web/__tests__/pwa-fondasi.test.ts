// Fondasi PWA — ADR-009. Pendaftaran, manifest, dan penjaga sumber.
import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JALUR_SW, daftarkanServiceWorker } from "../src/shared/pwa/daftar.js";

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("daftarkanServiceWorker — syarat pendaftaran", () => {
  const kontainer = () => ({ register: vi.fn().mockResolvedValue({}) });

  it("TIDAK mendaftar di luar produksi", async () => {
    // Di dev, service worker menyimpan aset lalu menyajikannya kembali —
    // perubahan kode tampak "tidak berpengaruh" dan pengembang menelusuri bug
    // yang tidak ada.
    const sw = kontainer();
    await expect(daftarkanServiceWorker({ produksi: false, serviceWorker: sw })).resolves.toBe(
      false,
    );
    expect(sw.register).not.toHaveBeenCalled();
  });

  it("mendaftar di produksi, pada jalur tetap", async () => {
    const sw = kontainer();
    await expect(daftarkanServiceWorker({ produksi: true, serviceWorker: sw })).resolves.toBe(true);
    expect(sw.register).toHaveBeenCalledWith(JALUR_SW);
  });

  it("browser tanpa dukungan → false, bukan melempar", async () => {
    await expect(
      daftarkanServiceWorker({ produksi: true, serviceWorker: undefined }),
    ).resolves.toBe(false);
  });

  it("pendaftaran gagal TIDAK menjatuhkan aplikasi", async () => {
    // Service worker adalah peningkatan, bukan prasyarat. Aplikasi yang menolak
    // terbuka karena cache-nya gagal dipasang adalah kemunduran.
    const lapor = vi.fn();
    const sw = { register: vi.fn().mockRejectedValue(new Error("konteks tak aman")) };

    await expect(
      daftarkanServiceWorker({ produksi: true, serviceWorker: sw, laporGagal: lapor }),
    ).resolves.toBe(false);
    expect(lapor).toHaveBeenCalledTimes(1);
  });
});

describe("manifest", () => {
  const manifest = JSON.parse(
    readFileSync(join(AKAR, "public/manifest.webmanifest"), "utf8"),
  ) as Record<string, unknown>;

  it("menyatakan bahasa Indonesia", () => {
    // Screen reader memilih pengucapan dari sini juga, bukan hanya dari <html>.
    expect(manifest.lang).toBe("id");
  });

  it("punya field yang dibutuhkan agar bisa dipasang", () => {
    for (const field of ["name", "short_name", "start_url", "display", "icons"]) {
      expect(manifest[field], `field "${field}" hilang`).toBeDefined();
    }
  });

  it("setiap ikon yang dirujuk benar-benar ada", () => {
    // Manifest yang menunjuk berkas hilang gagal DIAM-DIAM: aplikasi tetap
    // jalan, tombol "pasang" saja yang tidak pernah muncul.
    const ikon = manifest.icons as ReadonlyArray<{ src: string }>;
    expect(ikon.length).toBeGreaterThan(0);
    for (const { src } of ikon) {
      expect(existsSync(join(AKAR, "public", src.replace(/^\//, ""))), `${src} tidak ada`).toBe(
        true,
      );
    }
  });

  it("deskripsinya memakai bahasa sederhana, bukan jargon", () => {
    // Teks ini muncul di daftar aplikasi sistem operasi — sering menjadi
    // kalimat pertama yang dibaca pengguna tentang produk ini.
    const deskripsi = String(manifest.description);
    expect(deskripsi).not.toMatch(/ekosistem|inklusif|platform|solusi/i);
  });
});

/**
 * Buang komentar sebelum memindai.
 *
 * Bukan kerapian: versi pertama penjaga di bawah gagal karena `sw.ts` memuat
 * kalimat "`skipWaiting()` SENGAJA TIDAK dipanggil" — komentar yang MENJELASKAN
 * aturan tertangkap sebagai PELANGGARAN aturan. Pemindai yang menghukum
 * dokumentasi mengajari orang untuk berhenti mendokumentasikan.
 *
 * (Masalah yang sama pernah ditemukan di `soft-delete-jangkauan.test.ts`, PR-021a.)
 */
function tanpaKomentar(sumber: string): string {
  return sumber.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("penjaga sumber service worker", () => {
  const sumber = tanpaKomentar(readFileSync(join(AKAR, "src/shared/pwa/sw.ts"), "utf8"));

  it("seluruh keputusan cache lewat putuskanStrategi", () => {
    // Kalau sw.ts kelak memutuskan sendiri apa yang disimpan, aturan yang diuji
    // di strategi-cache.test.ts berhenti mengikat — dan penolakan `/api/` bisa
    // hilang tanpa satu pun test merah.
    expect(sumber).toContain("putuskanStrategi");
  });

  it("hanya ada SATU tempat yang menulis ke cache", () => {
    // Penulisan kedua di luar cabang strategi adalah cara paling mudah aturan
    // ini dilanggar tanpa terlihat.
    expect(sumber.match(/cache\.put\(/g) ?? []).toHaveLength(1);
  });

  it("TIDAK memanggil skipWaiting", () => {
    // skipWaiting membuat service worker baru mengambil alih tab yang sedang
    // terbuka, sehingga aset lama dan baru bercampur di satu halaman berjalan —
    // sumber galat "chunk gagal dimuat" tepat setelah deploy.
    expect(sumber).not.toMatch(/skipWaiting\s*\(/);
  });

  it("membersihkan cache versi lama saat activate", () => {
    // Tanpa ini, tiap kenaikan versi meninggalkan salinan penuh aset lama di
    // disk pengguna — selamanya.
    expect(sumber).toContain("cacheUsang");
  });
});
