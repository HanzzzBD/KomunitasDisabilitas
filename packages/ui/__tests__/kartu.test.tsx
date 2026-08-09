// Kartu — bagian AC PR-028 nomor 5 (lolos axe).
//
// Kartu tidak punya perilaku, jadi yang diuji hanyalah satu hal yang bisa
// dirusaknya: kerangka heading halaman.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Kartu } from "../src/kartu.js";
import { Tombol } from "../src/tombol.js";

describe("judul kartu menjadi heading sungguhan", () => {
  it("dirender sebagai heading pada tingkat yang diminta", () => {
    render(
      <Kartu judul="Pengembang Web" tingkatJudul={2}>
        <p>PT Contoh</p>
      </Kartu>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Pengembang Web" })).toBeInTheDocument();
  });

  it("tingkatnya benar-benar mengikuti prop, bukan nilai mati", () => {
    // Pengguna screen reader menjelajah halaman dengan melompat antar heading,
    // dan urutan tingkat itulah kerangkanya. Kartu yang selalu menulis <h3>
    // merusak kerangka begitu ia dipakai pada kedalaman lain.
    render(
      <>
        <Kartu judul="Dua" tingkatJudul={2}>
          <p>a</p>
        </Kartu>
        <Kartu judul="Lima" tingkatJudul={5}>
          <p>b</p>
        </Kartu>
      </>,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Dua");
    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent("Lima");
  });

  it("kartu tanpa judul tidak menyumbang heading apa pun", () => {
    // Heading kosong yang lahir "supaya konsisten" hanya menambah perhentian
    // buntu saat pengguna melompat antar heading.
    render(
      <Kartu>
        <p>Isi saja</p>
      </Kartu>,
    );

    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("judul tanpa tingkat adalah galat kompilasi, bukan cacat diam", () => {
    // Dijaga tipe: `tsc --noEmit` gagal bila baris di bawah TIDAK bermasalah.
    // Inilah yang membuat lupa memberi tingkat mustahil lolos ke produksi.
    render(
      // @ts-expect-error tingkatJudul wajib menyertai judul
      <Kartu judul="Tanpa tingkat">
        <p>Isi</p>
      </Kartu>,
    );

    expect(screen.getByRole("heading")).toBeInTheDocument();
  });
});

describe("isi dan aksi", () => {
  it("isi dirender apa adanya", () => {
    render(
      <Kartu>
        <p>PT Contoh</p>
      </Kartu>,
    );

    expect(screen.getByText("PT Contoh")).toBeInTheDocument();
  });

  it("baris aksi dirender bila ada", () => {
    render(
      <Kartu judul="Pengembang Web" tingkatJudul={3} aksi={<Tombol>Lamar</Tombol>}>
        <p>PT Contoh</p>
      </Kartu>,
    );

    expect(screen.getByRole("button", { name: "Lamar" })).toBeInTheDocument();
  });

  it("tanpa aksi, tidak ada wadah aksi yang kosong", () => {
    const { container } = render(
      <Kartu>
        <p>Isi</p>
      </Kartu>,
    );

    expect(container.querySelectorAll("div")).toHaveLength(2);
  });
});

describe("batasnya terlihat tanpa bergantung bayangan", () => {
  it("memakai garis tepi, bukan hanya bayangan", () => {
    // Bayangan lenyap di mode kontras tinggi dan saat dicetak; tanpa garis,
    // batas antar kartu hilang dan isinya terbaca sebagai satu blok panjang.
    const { container } = render(
      <Kartu>
        <p>Isi</p>
      </Kartu>,
    );

    const kelas = container.firstElementChild?.className ?? "";
    expect(kelas).toContain("border");
    expect(kelas).toContain("border-gray-300");
  });
});

describe("gerbang aksesibilitas", () => {
  it("kartu lengkap lolos axe", async () => {
    const { container } = render(
      <Kartu judul="Pengembang Web" tingkatJudul={2} aksi={<Tombol>Lamar</Tombol>}>
        <p>PT Contoh — Jakarta</p>
      </Kartu>,
    );

    await harusLolosAksesibilitas(container);
  });

  it("penjaga ini tidak lulus hampa — heading kosong tertangkap", async () => {
    // Cacat yang mengintai persis di sini: `judul` yang diberi string kosong
    // menghasilkan heading tanpa teks — perhentian buntu bagi pengguna yang
    // menjelajah dengan melompat antar heading.
    //
    // Dirakit lewat DOM, bukan JSX, dan bukan demi kerapian: `jsx-a11y`
    // (gerbang LAPIS SATU) menolak `<h2 />` saat lint, jadi cacat ini tidak
    // bisa ditulis sebagai JSX sama sekali. Kebetulan yang menyenangkan —
    // tetapi gerbang lapis dua tetap perlu dibuktikan tidak hampa, sebab
    // heading kosong juga bisa lahir dari nilai runtime yang lint tak lihat.
    const palsu = document.createElement("div");
    palsu.innerHTML = "<h2></h2>";
    document.body.append(palsu);

    try {
      await expect(harusLolosAksesibilitas(palsu)).rejects.toThrow(/empty-heading/);
    } finally {
      palsu.remove();
    }
  });
});
