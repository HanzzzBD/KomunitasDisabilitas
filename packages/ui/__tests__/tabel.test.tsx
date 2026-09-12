// Tabel — AC PR-052: "AdminTable: header terasosiasi, sortable via keyboard,
// caption". Ketiganya diuji lewat interaksi/struktur sungguhan, bukan lewat
// pemanggilan handler — pola yang sama dengan tab.test.tsx.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Tabel, type KolomTabel, type UrutanTabel } from "../src/tabel.js";

interface BarisUji {
  id: string;
  nama: string;
  kota: string;
}

const DATA: BarisUji[] = [
  { id: "1", nama: "PT Inklusif Teknologi", kota: "Jakarta" },
  { id: "2", nama: "Kreatif Studio Nusantara", kota: "Jakarta" },
];

const KOLOM: KolomTabel<BarisUji>[] = [
  { kunci: "nama", label: "Nama", urut: true },
  { kunci: "kota", label: "Kota", urut: true },
];

function Contoh(props: Partial<React.ComponentProps<typeof Tabel<BarisUji>>> = {}) {
  return (
    <Tabel
      kolom={KOLOM}
      data={DATA}
      kunciBaris={(b) => b.id}
      judul="Daftar perusahaan"
      kosong="Belum ada perusahaan."
      {...props}
    />
  );
}

describe("AC: header terasosiasi", () => {
  it("setiap header punya scope=col — sel terasosiasi lewat peran natif <table>", () => {
    render(<Contoh />);

    const tabel = screen.getByRole("table");
    for (const header of within(tabel).getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("scope", "col");
    }
  });

  it("caption menamai tabelnya", () => {
    render(<Contoh />);

    expect(screen.getByRole("table", { name: "Daftar perusahaan" })).toBeInTheDocument();
  });

  it("baris data punya sel sejumlah kolom", () => {
    render(<Contoh />);

    const baris = screen.getAllByRole("row");
    // Baris pertama = header; dua berikutnya = data.
    expect(within(baris[1]!).getAllByRole("cell")).toHaveLength(2);
  });
});

describe("AC: sortable via keyboard", () => {
  it("header kolom sortable adalah tombol — fokusabel via Tab, aktif via Enter", async () => {
    const onUrutkan = vi.fn();
    render(<Contoh onUrutkan={onUrutkan} />);

    const tombol = screen.getByRole("button", { name: "Nama" });
    tombol.focus();
    expect(tombol).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onUrutkan).toHaveBeenCalledWith("nama");
  });

  it("Spasi juga mengaktifkan tombol urut", async () => {
    const onUrutkan = vi.fn();
    render(<Contoh onUrutkan={onUrutkan} />);

    screen.getByRole("button", { name: "Kota" }).focus();
    await userEvent.keyboard(" ");

    expect(onUrutkan).toHaveBeenCalledWith("kota");
  });

  it("kolom TANPA `urut` dirender sebagai teks biasa, bukan tombol", () => {
    render(
      <Contoh
        kolom={[
          { kunci: "nama", label: "Nama", urut: true },
          { kunci: "kota", label: "Kota" },
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Kota" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Kota" })).toBeInTheDocument();
  });

  it("aria-sort mengikuti prop `urutan`, bukan state internal", () => {
    const urutan: UrutanTabel = { kunci: "nama", arah: "asc" };
    render(<Contoh urutan={urutan} />);

    expect(screen.getByRole("columnheader", { name: "Nama" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByRole("columnheader", { name: "Kota" })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("arah desc tercermin di aria-sort", () => {
    render(<Contoh urutan={{ kunci: "kota", arah: "desc" }} />);

    expect(screen.getByRole("columnheader", { name: "Kota" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("kolom tanpa `urut` tidak pernah punya aria-sort, meski disebut di `urutan`", () => {
    render(
      <Contoh
        kolom={[{ kunci: "nama", label: "Nama" }, { kunci: "kota", label: "Kota", urut: true }]}
        urutan={{ kunci: "nama", arah: "asc" }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Nama" })).not.toHaveAttribute("aria-sort");
  });
});

describe("keadaan kosong", () => {
  it("data kosong → baris `kosong` yang tampil, bukan tabel tanpa isi tanpa penjelasan", () => {
    render(<Contoh data={[]} />);

    expect(screen.getByText("Belum ada perusahaan.")).toBeInTheDocument();
    expect(screen.queryAllByRole("row")).toHaveLength(2); // header + satu baris pesan
  });

  it("sel kosong merentang seluruh kolom (colSpan)", () => {
    render(<Contoh data={[]} />);

    const sel = screen.getByText("Belum ada perusahaan.").closest("td");
    expect(sel).toHaveAttribute("colspan", String(KOLOM.length));
  });
});

describe("isi sel bawaan", () => {
  it("kolom tanpa `render` menampilkan nilai field apa adanya", () => {
    render(<Contoh />);

    expect(screen.getByText("PT Inklusif Teknologi")).toBeInTheDocument();
    expect(screen.getAllByText("Jakarta")).toHaveLength(2);
  });

  it("kolom dengan `render` memakai isi kustom, bukan nilai mentah", () => {
    render(
      <Contoh
        kolom={[
          { kunci: "nama", label: "Nama", render: (b) => `#${b.nama}` },
          { kunci: "kota", label: "Kota" },
        ]}
      />,
    );

    expect(screen.getByText("#PT Inklusif Teknologi")).toBeInTheDocument();
  });
});

describe("gerbang aksesibilitas", () => {
  it("tabel terisi lolos axe", async () => {
    const { container } = render(<Contoh />);
    await harusLolosAksesibilitas(container);
  });

  it("tabel kosong lolos axe", async () => {
    const { container } = render(<Contoh data={[]} />);
    await harusLolosAksesibilitas(container);
  });
});
