import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Masukan } from "../src/masukan.js";

describe("Masukan — semantik natif dipertahankan", () => {
  it("dirender sebagai <input> dengan type text bawaan", () => {
    render(<Masukan aria-label="Nama" />);
    const kolom = screen.getByRole("textbox", { name: "Nama" });

    expect(kolom.tagName).toBe("INPUT");
    expect(kolom).toHaveAttribute("type", "text");
  });

  it("type dapat ditimpa", () => {
    render(<Masukan type="email" aria-label="Surel" />);
    expect(screen.getByRole("textbox", { name: "Surel" })).toHaveAttribute("type", "email");
  });

  it("dapat difokus dan diketik dengan keyboard", async () => {
    render(<Masukan aria-label="Nama" />);

    await userEvent.tab();
    const kolom = screen.getByRole("textbox");
    expect(kolom).toHaveFocus();

    await userEvent.keyboard("Rina");
    expect(kolom).toHaveValue("Rina");
  });

  it("meneruskan ref ke elemen sungguhan", () => {
    // FormField (PR-027c) dan pengelola form memindahkan fokus lewat ref;
    // ref yang putus membuat "lompat ke kolom bermasalah" diam-diam mati.
    let elemen: HTMLInputElement | null = null;
    render(<Masukan aria-label="Nama" ref={(n) => (elemen = n)} />);

    expect(elemen).toBe(screen.getByRole("textbox"));
  });
});

describe("keadaan bermasalah menulis aria-invalid, bukan sekadar warna", () => {
  it("bermasalah → aria-invalid=true dan tepi merah", () => {
    render(<Masukan bermasalah aria-label="Surel" />);
    const kolom = screen.getByRole("textbox");

    expect(kolom).toHaveAttribute("aria-invalid", "true");
    expect(kolom.className).toContain("border-red-700");
  });

  it("normal → TIDAK menulis aria-invalid sama sekali", () => {
    // `aria-invalid="false"` sah, tetapi sebagian screen reader lawas tetap
    // menyebutnya. Atribut yang absen tidak punya ambiguitas itu.
    render(<Masukan aria-label="Surel" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("warna merah tidak pernah muncul tanpa aria-invalid", () => {
    // Inilah cacat yang dijaga: kolom yang TERLIHAT bermasalah tetapi tidak
    // MENYATAKANNYA hanya menyesatkan pengguna screen reader. Karena satu prop
    // menulis keduanya, keduanya tidak bisa menyimpang.
    render(<Masukan aria-label="Surel" />);
    expect(screen.getByRole("textbox").className).not.toContain("border-red-700");
  });
});

describe("AC-1 & AC-4: fokus dan target sentuh", () => {
  it("memakai token target sentuh", () => {
    render(<Masukan aria-label="Nama" />);
    expect(screen.getByRole("textbox").className).toContain("min-h-sentuh");
  });

  it.each([true, false])("bermasalah=%s tidak memakai outline-none", (bermasalah) => {
    render(<Masukan bermasalah={bermasalah} aria-label="Nama" />);
    const kelas = screen.getByRole("textbox").className;

    expect(kelas).not.toContain("outline-none");
    expect(kelas).not.toContain("outline-0");
  });
});

describe("gerbang aksesibilitas", () => {
  it("kolom berlabel lolos axe", async () => {
    const { container } = render(
      <>
        <label htmlFor="nama">Nama lengkap</label>
        <Masukan id="nama" />
      </>,
    );
    await harusLolosAksesibilitas(container);
  });

  it("penjaga ini tidak lulus secara hampa — kolom TANPA label gagal", async () => {
    // Kolom tanpa nama adalah cacat aksesibilitas paling lazim di form, dan
    // sepenuhnya tak terlihat bagi yang melihat layar. Karena Masukan sengaja
    // tidak mengurus label (itu tugas FormField), penjaga ini yang memastikan
    // ketiadaan label tetap tertangkap sampai PR-027c datang.
    const { container } = render(<Masukan />);
    await expect(harusLolosAksesibilitas(container)).rejects.toThrow(/label/);
  });

  it("aria-describedby diteruskan apa adanya untuk dipakai FormField", () => {
    render(<Masukan aria-label="Surel" aria-describedby="bantuan-surel" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "bantuan-surel");
  });
});
