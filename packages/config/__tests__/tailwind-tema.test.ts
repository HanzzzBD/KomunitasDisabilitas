// Tema Tailwind diuji dengan MENGOMPILASI CSS sungguhan, bukan memeriksa
// struktur konfigurasi.
//
// Bedanya menentukan, dan tidak berubah saat pindah dari v3 ke v4 (ADR-019):
// konfigurasi yang "terlihat benar" bisa menghasilkan CSS yang salah — nama
// namespace keliru, nilai tak dikenali, varian yang tidak pernah terpakai.
// Yang dipakai pengguna adalah CSS-nya, jadi itu yang diperiksa.
//
// `@source inline(...)` menyatakan kelas kandidat langsung di CSS, sehingga
// test ini tidak memindai berkas mana pun — dan karena itu tidak ikut berubah
// saat kode aplikasi berubah.
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AKAR = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Kompilasi tema + daftar kelas yang diminta, kembalikan CSS-nya.
 *
 * DUA hal yang membuat test ini pernah menguji hal yang salah:
 *
 * 1. `source(none)` — tanpa itu, v4 MEMINDAI berkas di sekitar `from` secara
 *    otomatis, termasuk BERKAS TEST INI SENDIRI. String `min-h-sentuh` yang
 *    ditulis di assertion di bawah ikut menjadi kandidat kelas, dan CSS-nya
 *    memuat utilitas yang tidak pernah diminta. Test "kelas yang tidak diminta
 *    tidak ikut dihasilkan" gagal karena itu — dan assertion lain bisa LULUS
 *    karena alasan yang salah.
 *
 * 2. `from` UNIK tiap panggilan — plugin meng-cache compiler & scanner
 *    berdasarkan jalur itu, sehingga kandidat antar-pemanggilan menumpuk.
 */
let nomor = 0;
async function kompilasi(kelas: string): Promise<string> {
  const masuk = `
    @import "tailwindcss" source(none);
    @import "./tailwind/tema.css";
    @source inline("${kelas}");
  `;
  const hasil = await postcss([tailwind()]).process(masuk, {
    from: join(AKAR, `uji-${++nomor}.css`),
  });
  return hasil.css;
}

describe("skala teks membaca --font-scale", () => {
  it("ukuran teks memakai calc() atas token, bukan angka mati", async () => {
    // Inilah yang membuat preferensi teks 200% berlaku pada SELURUH teks,
    // termasuk yang ditulis dengan kelas ukuran tetap.
    const css = await kompilasi("text-xs text-sm text-base text-2xl");

    expect(css).toContain("var(--font-scale, 1)");
    expect(css.match(/calc\([^)]*var\(--font-scale/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("nilai cadangan `1` selalu ada", async () => {
    // Tanpa cadangan, `calc()` batal bila token belum tertulis — teksnya
    // kehilangan ukuran sama sekali, bukan sekadar kembali normal. Itu bisa
    // terjadi bila skrip pra-paint (PR-026c) gagal.
    const css = await kompilasi("text-base");
    expect(css).toContain("var(--font-scale, 1)");
    expect(css).not.toMatch(/var\(--font-scale\)/);
  });

  it("tinggi baris teks isi minimal 1.5 (WCAG 2.2 §1.4.12)", async () => {
    const css = await kompilasi("text-base");
    const cocok = /line-height:\s*(?:var\([^)]*,\s*)?([0-9.]+)/.exec(css);
    expect(Number(cocok?.[1])).toBeGreaterThanOrEqual(1.5);
  });
});

describe("target sentuh membaca --touch-target-min", () => {
  it("`min-h-sentuh` dan `min-w-sentuh` memakai token", async () => {
    // Komponen menulis kelas ini dan ikut preferensi pengguna tanpa perlu tahu
    // apa pun tentang preferensi.
    const css = await kompilasi("min-h-sentuh min-w-sentuh");

    expect(css).toMatch(/min-height:\s*var\(--spacing-sentuh/);
    expect(css).toMatch(/min-width:\s*var\(--spacing-sentuh/);
    // Rantainya harus sampai ke token runtime, bukan berhenti di variabel tema.
    expect(css).toContain("var(--touch-target-min, 44px)");
  });

  it("cadangan 44px sesuai WCAG 2.2 & SDD §4.3", async () => {
    expect(await kompilasi("min-h-sentuh")).toContain("44px");
  });
});

describe("varian membaca ATRIBUT token, bukan media query", () => {
  it.each([
    ["kontras-tinggi", '[data-contrast="high"]'],
    ["gerak-minimal", '[data-motion="reduced"]'],
    ["bahasa-sederhana", '[data-lang-mode="simple"]'],
  ])("varian %s menghasilkan selektor %s", async (varian, selektor) => {
    expect(await kompilasi(`${varian}:underline`)).toContain(selektor);
  });

  it("TIDAK memakai @media prefers-reduced-motion", async () => {
    // Media query hanya tahu setelan OS. Atribut sudah memperhitungkan pilihan
    // eksplisit pengguna yang boleh MENIMPA OS (ADR-008) — memakai media query
    // akan mengabaikan pengguna yang sengaja menyalakan animasi di aplikasi ini.
    const css = await kompilasi("gerak-minimal:underline");
    expect(css).not.toContain("prefers-reduced-motion");
  });
});

describe("penjaga ini tidak lulus secara hampa", () => {
  it("kompilasi benar-benar menghasilkan CSS", async () => {
    expect((await kompilasi("text-base")).length).toBeGreaterThan(50);
  });

  it("kelas yang TIDAK diminta tidak ikut dihasilkan", async () => {
    // Membuktikan penyaring kandidat benar-benar bekerja — kalau tidak,
    // seluruh test di atas akan lulus atas CSS yang selalu memuat segalanya.
    const css = await kompilasi("text-base");
    expect(css).not.toMatch(/min-height:\s*var\(--spacing-sentuh/);
  });
});
