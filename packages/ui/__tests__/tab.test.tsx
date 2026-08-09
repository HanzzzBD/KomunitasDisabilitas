// AC PR-028 nomor 3: "Tabs keyboard sesuai pola WAI-ARIA" — dan nomor 5
// (lolos axe).
//
// Seluruh AC ini soal keyboard, jadi diuji lewat penekanan tombol sungguhan,
// bukan lewat pemanggilan handler. Test yang memanggil `onUbah` langsung akan
// tetap hijau atas komponen yang panahnya tidak berfungsi sama sekali.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Tab, type ItemTab } from "../src/tab.js";

const DAFTAR: ItemTab[] = [
  { nilai: "lamaran", label: "Lamaran", isi: <p>Isi lamaran</p> },
  { nilai: "tersimpan", label: "Tersimpan", isi: <p>Isi tersimpan</p> },
  { nilai: "riwayat", label: "Riwayat", isi: <p>Isi riwayat</p> },
];

function Contoh(props: Partial<React.ComponentProps<typeof Tab>> = {}) {
  return <Tab daftar={DAFTAR} label="Bagian lamaran" {...props} />;
}

function tab(nama: string) {
  return screen.getByRole("tab", { name: nama });
}

describe("AC-3: keyboard sesuai pola WAI-ARIA", () => {
  it("seluruh daftar tab hanya SATU perhentian Tab (roving tabindex)", async () => {
    // Inti pola tab: menekan Tab memasuki dan MENINGGALKAN daftar, tidak
    // menyusurinya satu per satu. Tanpa ini, daftar sepuluh tab menjadi
    // sepuluh perhentian yang harus dilewati sebelum mencapai isinya.
    //
    // Diuji lewat perpindahan fokus sungguhan, bukan lewat atribut tiap tab:
    // Radix menaruh perhentiannya pada WADAH tablist, yang lalu melimpahkan
    // fokus ke tab terpilih. Memeriksa `tabindex` tiap tab akan menyimpulkan
    // "tidak ada perhentian sama sekali" atas komponen yang benar.
    render(
      <>
        <button type="button">Sebelum</button>
        <Contoh />
        <button type="button">Sesudah</button>
      </>,
    );
    screen.getByRole("button", { name: "Sebelum" }).focus();

    await userEvent.tab();
    expect(tab("Lamaran")).toHaveFocus();

    await userEvent.tab();
    // Perhentian berikutnya BUKAN tab kedua — daftar sudah ditinggalkan.
    expect(screen.getByRole("tab", { name: "Tersimpan" })).not.toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveFocus();
  });

  it("masuk ke daftar mendarat pada tab yang SEDANG aktif, bukan yang pertama", async () => {
    // Kalau fokus selalu mendarat di tab pertama, pengguna keyboard kehilangan
    // tempatnya setiap kali ia kembali ke daftar.
    render(
      <>
        <button type="button">Sebelum</button>
        <Contoh nilaiAwal="riwayat" />
      </>,
    );
    screen.getByRole("button", { name: "Sebelum" }).focus();

    await userEvent.tab();
    expect(tab("Riwayat")).toHaveFocus();
  });

  it("panah kanan memindahkan fokus ke tab berikutnya", async () => {
    render(<Contoh />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Tersimpan")).toHaveFocus();
  });

  it("panah kiri memindahkan fokus ke tab sebelumnya", async () => {
    render(<Contoh />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowRight}{ArrowLeft}");
    expect(tab("Lamaran")).toHaveFocus();
  });

  it("Home melompat ke tab pertama, End ke tab terakhir", async () => {
    render(<Contoh />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{End}");
    expect(tab("Riwayat")).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(tab("Lamaran")).toHaveFocus();
  });

  it("orientasi tegak memakai panah atas/bawah, bukan kiri/kanan", async () => {
    // Panah yang berlaku harus cocok dengan arah tab tersusun di layar;
    // kalau tidak, arah yang ditekan tidak sesuai dengan arah yang terlihat.
    render(<Contoh orientasi="vertikal" />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(tab("Tersimpan")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Tersimpan")).toHaveFocus();
  });

  it("tablist mengumumkan orientasinya", async () => {
    render(<Contoh orientasi="vertikal" />);

    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
  });
});

describe("aktivasi manual — bawaan, dan sengaja berbeda dari Radix", () => {
  it("panah MEMINDAHKAN fokus tanpa mengganti panel", async () => {
    // Radix MELEPAS panel tidak aktif dari DOM. Dengan aktivasi otomatis,
    // menyusuri tab dengan panah memasang lalu membongkar setiap panel yang
    // dilewati — beserta permintaan data yang dijalankannya.
    const onUbah = vi.fn();
    render(<Contoh onUbah={onUbah} />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowRight}");

    expect(tab("Tersimpan")).toHaveFocus();
    expect(onUbah).not.toHaveBeenCalled();
    expect(screen.getByText("Isi lamaran")).toBeInTheDocument();
  });

  it("Enter mengaktifkan tab yang sedang disorot", async () => {
    render(<Contoh />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowRight}{Enter}");

    expect(tab("Tersimpan")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Isi tersimpan")).toBeInTheDocument();
  });

  it("Spasi juga mengaktifkan", async () => {
    render(<Contoh />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowRight} ");

    expect(tab("Tersimpan")).toHaveAttribute("aria-selected", "true");
  });

  it("aktivasi otomatis tersedia bila isinya memang statis", async () => {
    render(<Contoh aktivasi="otomatis" />);
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowRight}");

    expect(tab("Tersimpan")).toHaveAttribute("aria-selected", "true");
  });
});

describe("tab dan panel tersambung dua arah", () => {
  it("tab menunjuk panelnya, panel menamai dirinya dari tab", async () => {
    // Dua cacat paling lazim pada tab: `aria-controls` yang menunjuk panel
    // tidak ada, dan panel yang tidak dimiliki tab mana pun. API berbasis
    // larik membuat keduanya mustahil — ini yang membuktikannya.
    render(<Contoh />);

    const aktif = tab("Lamaran");
    const panel = screen.getByRole("tabpanel");

    expect(aktif.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(aktif.id);
    expect(panel).toHaveAccessibleName("Lamaran");
  });

  it("hanya panel yang aktif yang hadir", async () => {
    render(<Contoh />);

    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.queryByText("Isi riwayat")).toBeNull();
  });

  it("panel bisa dicapai keyboard meski isinya tanpa elemen fokusable", async () => {
    // Panel berisi teks saja tetap harus bisa dijangkau, kalau tidak isinya
    // mustahil dibaca dengan penjelajahan Tab.
    render(<Contoh />);

    expect(screen.getByRole("tabpanel")).toHaveAttribute("tabindex", "0");
  });

  it("daftar tab punya nama, bukan hanya posisi", async () => {
    // Tanpa nama, pengguna hanya mendengar "tab 1 dari 3" — tahu ada tiga
    // hal, tidak tahu tiga hal apa.
    render(<Contoh />);

    expect(screen.getByRole("tablist")).toHaveAccessibleName("Bagian lamaran");
  });
});

describe("keadaan aktif tidak bergantung pada warna", () => {
  it("ditandai garis dan ketebalan huruf, bukan warna saja", async () => {
    // Penanda yang hanya berupa warna gagal WCAG 2.2 §1.4.1 dan hilang sama
    // sekali di mode kontras tinggi.
    render(<Contoh />);

    const kelas = tab("Lamaran").className;
    expect(kelas).toContain("data-[state=active]:border-gray-900");
    expect(kelas).toContain("data-[state=active]:font-semibold");
  });

  it("garisnya sudah ada sejak awal supaya tab tidak bergeser saat dipilih", async () => {
    render(<Contoh />);

    expect(tab("Tersimpan").className).toContain("border-transparent");
  });

  it("tidak ada outline-none di mana pun", async () => {
    // Pada aktivasi manual, cincin fokus adalah SATU-SATUNYA yang membedakan
    // "tab yang sedang disorot" dari "tab yang aktif".
    render(<Contoh />);

    for (const t of screen.getAllByRole("tab")) {
      expect(t.className).not.toContain("outline-none");
      expect(t.className).not.toContain("outline-0");
    }
  });

  it("target sentuh mengikuti token", async () => {
    render(<Contoh />);

    expect(tab("Lamaran").className).toContain("min-h-sentuh");
  });
});

describe("tab nonaktif", () => {
  it("dilewati saat menjelajah dengan panah", async () => {
    render(
      <Tab
        label="Bagian lamaran"
        daftar={[DAFTAR[0]!, { ...DAFTAR[1]!, nonaktif: true }, DAFTAR[2]!]}
      />,
    );
    tab("Lamaran").focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Riwayat")).toHaveFocus();
  });
});

describe("gerbang aksesibilitas", () => {
  it("tab lolos axe", async () => {
    const { container } = render(<Contoh />);

    await harusLolosAksesibilitas(container);
  });

  it("penjaga ini tidak lulus hampa — tab yang menunjuk panel hilang tertangkap", async () => {
    // Cacat yang persis dicegah API berbasis larik: `aria-controls` menunjuk
    // id yang tidak ada, yang terjadi begitu tab dan panel ditulis di dua
    // tempat terpisah lalu salah satunya berubah.
    const { container } = render(
      <div role="tablist" aria-label="Rusak">
        <button type="button" role="tab" aria-selected="true" aria-controls="panel-yang-hilang">
          Satu
        </button>
      </div>,
    );

    await expect(harusLolosAksesibilitas(container)).rejects.toThrow(/aria-valid-attr-value/);
  });
});
