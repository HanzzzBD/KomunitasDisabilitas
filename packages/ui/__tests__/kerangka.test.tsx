// AC PR-028 nomor 4: "Skeleton menandai wilayah `aria-busy`" — dan nomor 5
// (lolos axe).
//
// Yang diuji bukan keberadaan atributnya, melainkan HUBUNGAN antar elemen:
// penanda sibuk pada wilayah yang benar, dan pengumuman di tempat yang tidak
// ikut tertahan olehnya. Test yang hanya memeriksa `toHaveAttribute` akan tetap
// hijau atas susunan yang bisu.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Kerangka, WilayahMemuat } from "../src/kerangka.js";

function wilayahSibuk(): HTMLElement {
  const el = document.querySelector("[aria-busy]");
  if (!(el instanceof HTMLElement)) throw new Error("wilayah aria-busy tidak ditemukan");
  return el;
}

describe("AC-4: wilayah ditandai aria-busy", () => {
  it("wilayah bertanda sibuk selama memuat", () => {
    render(
      <WilayahMemuat memuat label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    expect(wilayahSibuk()).toHaveAttribute("aria-busy", "true");
  });

  it("tandanya hilang begitu isi datang", () => {
    render(
      <WilayahMemuat memuat={false} label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    expect(wilayahSibuk()).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("Isi")).toBeInTheDocument();
  });

  it("isi sungguhan diganti kerangka selama memuat, bukan ditumpuk", () => {
    render(
      <WilayahMemuat memuat label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    expect(screen.queryByText("Isi")).toBeNull();
  });

  it("kerangka khusus bisa diberikan agar bentuknya menyerupai tata letaknya", () => {
    render(
      <WilayahMemuat memuat label="Memuat profil" kerangka={<Kerangka baris={5} className="h-8" />}>
        <p>Isi</p>
      </WilayahMemuat>,
    );

    expect(wilayahSibuk().querySelectorAll("div[aria-hidden='true'] > div")).toHaveLength(5);
  });
});

describe("pengumuman tidak boleh ikut tertahan aria-busy", () => {
  it("teks status berada DI LUAR wilayah sibuk", () => {
    // `aria-busy="true"` memerintahkan screen reader menahan pembacaan
    // perubahan DI DALAM wilayah itu. Live region yang diletakkan di dalamnya
    // baru terdengar setelah pemuatan usai — tepat saat ia tidak berguna lagi.
    // Bug ini tidak terlihat sama sekali di layar.
    render(
      <WilayahMemuat memuat label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Memuat daftar lowongan");
    expect(wilayahSibuk().contains(status)).toBe(false);
  });

  it("region status SUDAH ADA sebelum memuat dimulai", () => {
    // Live region hanya mengumumkan PERUBAHAN di dalam region yang sudah ada.
    // Region yang lahir bersama pesannya kerap tidak terbaca sama sekali —
    // karena itu ia dirender juga saat diam, hanya kosong.
    const { rerender } = render(
      <WilayahMemuat memuat={false} label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    rerender(
      <WilayahMemuat memuat label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    // Elemen yang SAMA, isinya yang berubah — bukan elemen baru.
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Memuat daftar lowongan");
  });

  it("label spesifik, bukan 'Memuat' telanjang", () => {
    // Pada halaman dengan beberapa wilayah, "Memuat" tidak menjawab: memuat apa.
    render(
      <>
        <WilayahMemuat memuat label="Memuat daftar lowongan">
          <p>A</p>
        </WilayahMemuat>
        <WilayahMemuat memuat label="Memuat profil perusahaan">
          <p>B</p>
        </WilayahMemuat>
      </>,
    );

    const teks = screen.getAllByRole("status").map((s) => s.textContent);
    expect(new Set(teks).size).toBe(2);
  });
});

describe("bentuk kerangka murni visual", () => {
  it("selalu disembunyikan dari screen reader", () => {
    const { container } = render(<Kerangka />);

    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("tidak menyumbang teks apa pun untuk dibacakan", () => {
    // Kerangka yang terbaca hanya menjadi sederet elemen kosong yang harus
    // dilewati satu per satu.
    const { container } = render(<Kerangka baris={4} />);

    expect(container.textContent).toBe("");
  });

  it("beberapa baris meniru paragraf: yang terakhir lebih pendek", () => {
    const { container } = render(<Kerangka baris={3} />);

    const baris = [...container.querySelectorAll("[aria-hidden='true'] > div")];
    expect(baris).toHaveLength(3);
    expect(baris[baris.length - 1]?.className).toContain("w-3/5");
    expect(baris[0]?.className).toContain("w-full");
  });

  it("denyutnya berhenti saat gerak diminta minimal", () => {
    const { container } = render(<Kerangka />);

    const bentuk = container.querySelector("[aria-hidden='true']");
    expect(bentuk?.className).toContain("animate-pulse");
    expect(bentuk?.className).toContain("gerak-minimal:animate-none");
  });

  it("tetap terlihat pada mode kontras tinggi", () => {
    // Abu muda di atas putih nyaris lenyap di kontras tinggi — dan pengguna
    // yang menyalakannya melihat halaman kosong tanpa petunjuk apa pun.
    const { container } = render(<Kerangka />);

    expect(container.querySelector("[aria-hidden='true']")?.className).toContain(
      "kontras-tinggi:bg-gray-500",
    );
  });
});

describe("gerbang aksesibilitas", () => {
  it("wilayah yang sedang memuat lolos axe", async () => {
    const { container } = render(
      <WilayahMemuat memuat label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    await harusLolosAksesibilitas(container);
  });

  it("wilayah yang sudah selesai lolos axe", async () => {
    const { container } = render(
      <WilayahMemuat memuat={false} label="Memuat daftar lowongan">
        <p>Isi</p>
      </WilayahMemuat>,
    );

    await harusLolosAksesibilitas(container);
  });

  it("penjaga ini tidak lulus hampa — aria-busy bernilai ngawur tertangkap", async () => {
    // `aria-busy` hanya menerima "true"/"false". Nilai lain diabaikan diam-diam
    // oleh screen reader: atributnya terlihat ada di inspector, tetapi wilayah
    // itu tidak pernah benar-benar ditandai sibuk.
    const { container } = render(
      <div aria-busy={"memuat" as unknown as boolean}>
        <p>Isi</p>
      </div>,
    );

    await expect(harusLolosAksesibilitas(container)).rejects.toThrow(/aria-valid-attr-value/);
  });
});
