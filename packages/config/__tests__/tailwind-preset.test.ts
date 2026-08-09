// Preset Tailwind diuji dengan MENJALANKAN Tailwind, bukan dengan memeriksa
// isi objek konfigurasinya.
//
// Bedanya menentukan. Konfigurasi yang "terlihat benar" bisa menghasilkan CSS
// yang salah — kunci yang keliru sarang, nilai yang tidak dikenali Tailwind,
// atau varian yang tidak pernah terpakai. Yang dipakai pengguna adalah CSS-nya,
// jadi itu yang diperiksa.
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import preset from "../tailwind/preset.cjs";

/** Kompilasi utilitas Tailwind untuk sepotong markup, kembalikan CSS-nya. */
async function kompilasi(markup: string): Promise<string> {
  const hasil = await postcss([
    tailwindcss({
      presets: [preset],
      // `raw` — tidak menyentuh berkas mana pun, jadi test ini tidak ikut
      // berubah saat kode aplikasi berubah.
      content: [{ raw: markup, extension: "html" }],
      corePlugins: { preflight: false },
    }),
  ]).process("@tailwind utilities;", { from: undefined });

  return hasil.css;
}

describe("skala teks membaca --font-scale", () => {
  it("setiap ukuran teks memakai calc() atas token, bukan angka mati", async () => {
    // Inilah yang membuat preferensi teks 200% berlaku pada SELURUH teks,
    // termasuk yang ditulis dengan kelas ukuran tetap.
    const css = await kompilasi(`<p class="text-base text-sm text-2xl">x</p>`);

    expect(css).toContain("var(--font-scale, 1)");
    expect(css.match(/calc\([^)]*var\(--font-scale/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("nilai cadangan `1` selalu ada", async () => {
    // Tanpa cadangan, `calc()` batal bila token belum tertulis — teksnya
    // kehilangan ukuran sama sekali, bukan sekadar kembali normal. Itu bisa
    // terjadi bila skrip pra-paint gagal di lingkungan yang memblokir
    // localStorage.
    const css = await kompilasi(`<p class="text-base">x</p>`);
    expect(css).toContain("var(--font-scale, 1)");
    expect(css).not.toMatch(/var\(--font-scale\)/);
  });

  it("tinggi baris teks isi minimal 1.5 (WCAG 2.2 §1.4.12)", async () => {
    const css = await kompilasi(`<p class="text-base">x</p>`);
    const cocok = /line-height:\s*([0-9.]+)/.exec(css);
    expect(Number(cocok?.[1])).toBeGreaterThanOrEqual(1.5);
  });
});

describe("target sentuh membaca --touch-target-min", () => {
  it("`min-h-sentuh` dan `min-w-sentuh` memakai token", async () => {
    // Komponen menulis kelas ini dan ikut preferensi pengguna tanpa perlu tahu
    // apa pun tentang preferensi.
    const css = await kompilasi(`<button class="min-h-sentuh min-w-sentuh">x</button>`);

    expect(css).toContain("min-height: var(--touch-target-min, 44px)");
    expect(css).toContain("min-width: var(--touch-target-min, 44px)");
  });

  it("cadangan 44px sesuai WCAG 2.2 & SDD §4.3", async () => {
    const css = await kompilasi(`<button class="min-h-sentuh">x</button>`);
    expect(css).toContain("44px");
  });
});

describe("varian membaca ATRIBUT token, bukan media query", () => {
  it.each([
    ["kontras-tinggi", '[data-contrast="high"]'],
    ["gerak-minimal", '[data-motion="reduced"]'],
    ["bahasa-sederhana", '[data-lang-mode="simple"]'],
  ])("varian %s menghasilkan selektor %s", async (varian, selektor) => {
    const css = await kompilasi(`<div class="${varian}:underline">x</div>`);
    expect(css).toContain(selektor);
  });

  it("TIDAK memakai @media prefers-reduced-motion", async () => {
    // Media query hanya tahu setelan OS. Atribut sudah memperhitungkan pilihan
    // eksplisit pengguna yang boleh MENIMPA OS (ADR-008) — memakai media query
    // akan mengabaikan pengguna yang sengaja menyalakan animasi di aplikasi ini.
    const css = await kompilasi(`<div class="gerak-minimal:underline">x</div>`);
    expect(css).not.toContain("prefers-reduced-motion");
  });
});

describe("cincin fokus", () => {
  it("tebal 3px tersedia sebagai `ring-fokus`", async () => {
    // 2px bawaan hilang di antara piksel pada kontras rendah dan layar kecil.
    const css = await kompilasi(`<button class="ring-fokus ring-offset-fokus">x</button>`);
    expect(css).toContain("3px");
    expect(css).toContain("2px");
  });
});

describe("penjaga ini tidak lulus secara hampa", () => {
  it("kompilasi benar-benar menghasilkan CSS", async () => {
    const css = await kompilasi(`<p class="text-base">x</p>`);
    expect(css.length).toBeGreaterThan(20);
  });

  it("kelas yang TIDAK dipakai markup tidak ikut dihasilkan", async () => {
    // Membuktikan `content` benar-benar menyaring — kalau tidak, seluruh test
    // di atas akan lulus atas CSS yang selalu memuat segalanya.
    const css = await kompilasi(`<p class="text-base">x</p>`);
    expect(css).not.toContain("min-height: var(--touch-target-min");
  });
});
