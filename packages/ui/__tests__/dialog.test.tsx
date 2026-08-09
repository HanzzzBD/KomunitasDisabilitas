// AC PR-028 nomor 1: "Dialog: fokus masuk saat buka, kembali ke pemicu saat
// tutup" — dan nomor 5 (lolos axe).
//
// Manajemen fokus datang dari Radix. Yang diuji di sini: bahwa ia benar-benar
// sampai ke pengguna setelah kita menatanya, dan bahwa penataan kita tidak
// merusaknya. Itu satu-satunya risiko yang memang milik berkas kita.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Dialog, TutupDialog } from "../src/dialog.js";
import { Tombol } from "../src/tombol.js";

function Contoh({ deskripsi }: { deskripsi?: string } = {}) {
  return (
    <Dialog judul="Hapus lamaran" deskripsi={deskripsi} pemicu={<Tombol>Buka</Tombol>}>
      <p>Lamaran yang dihapus tidak bisa dikembalikan.</p>
    </Dialog>
  );
}

async function buka() {
  const pemicu = screen.getByRole("button", { name: "Buka" });
  await userEvent.click(pemicu);
  await screen.findByRole("dialog");
  return pemicu;
}

describe("AC-1: fokus masuk saat buka, kembali saat tutup", () => {
  it("fokus MASUK ke dalam dialog saat terbuka", async () => {
    render(<Contoh />);
    await buka();

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("Escape menutup DAN mengembalikan fokus ke pemicu", async () => {
    render(<Contoh />);
    const pemicu = await buka();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pemicu).toHaveFocus();
  });

  it("tombol tutup mengembalikan fokus ke pemicu", async () => {
    render(<Contoh />);
    const pemicu = await buka();

    await userEvent.click(screen.getByRole("button", { name: "Tutup" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pemicu).toHaveFocus();
  });

  it("fokus TERJERAT: Tab berputar di dalam dialog, tidak lolos ke belakang", async () => {
    // Cacat yang paling menjebak: fokus yang lolos membuat pengguna keyboard
    // menjelajah halaman yang tidak bisa ia lihat sedang tertutup.
    render(
      <>
        <button type="button">Di luar dialog</button>
        <Contoh />
      </>,
    );
    await buka();

    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 8; i += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("Shift+Tab juga tidak lolos ke belakang", async () => {
    render(
      <>
        <button type="button">Di luar dialog</button>
        <Contoh />
      </>,
    );
    await buka();

    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 5; i += 1) {
      await userEvent.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("menutup dari tombol aksi di dalam isi juga mengembalikan fokus", async () => {
    // `TutupDialog` ada supaya keadaan terbuka tidak perlu diangkat ke luar
    // hanya untuk sebuah tombol "Batal".
    render(
      <Dialog
        judul="Hapus lamaran"
        pemicu={<Tombol>Buka</Tombol>}
        aksi={
          <TutupDialog asChild>
            <Tombol varian="sekunder">Batal</Tombol>
          </TutupDialog>
        }
      >
        <p>Isi</p>
      </Dialog>,
    );
    const pemicu = await buka();

    await userEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pemicu).toHaveFocus();
  });
});

describe("dialog punya nama yang diumumkan", () => {
  it("judul menjadi nama aksesibel dialog", async () => {
    // Dialog tanpa nama terumumkan sebagai "dialog" saja: pengguna tahu sesuatu
    // terbuka, tetapi tidak tahu apa.
    render(<Contoh />);
    await buka();

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Hapus lamaran");
  });

  it("deskripsi ikut diumumkan bila ada", async () => {
    render(<Contoh deskripsi="Tindakan ini permanen." />);
    await buka();

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Tindakan ini permanen.");
  });

  it("tombol tutup punya nama yang bisa dibaca, bukan hanya ×", async () => {
    render(<Contoh />);
    await buka();

    const tutup = screen.getByRole("button", { name: "Tutup" });
    expect(tutup).toHaveAccessibleName("Tutup");
    expect(tutup.textContent).toBe("×");
  });

  it("labelTutup dapat disesuaikan bahasanya", async () => {
    render(
      <Dialog judul="Judul" pemicu={<Tombol>Buka</Tombol>} labelTutup="Tutup dialog hapus">
        <p>Isi</p>
      </Dialog>,
    );
    await buka();

    expect(screen.getByRole("button", { name: "Tutup dialog hapus" })).toBeInTheDocument();
  });
});

describe("dialog bertumpuk DILARANG secara struktural", () => {
  it("dialog di dalam dialog melempar galat, bukan sekadar tidak dianjurkan", async () => {
    // Risks PR-028 menulis larangan ini sebagai "by-convention". Konvensi tidak
    // menahan apa pun — yang menumpuk dialog biasanya tidak sadar sedang
    // melakukannya. Dua jerat fokus bersarang mengurung pengguna keyboard DI
    // DALAM kurungan.
    const diam = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <Dialog judul="Luar" terbuka>
          <Dialog judul="Dalam" terbuka>
            <p>Isi</p>
          </Dialog>
        </Dialog>,
      ),
    ).toThrow(/bertumpuk/);

    diam.mockRestore();
  });

  it("dua dialog BERDAMPINGAN tetap sah", async () => {
    // Yang dilarang bersarang, bukan berjumlah lebih dari satu di satu halaman.
    render(
      <>
        <Dialog judul="Pertama" pemicu={<Tombol>Buka pertama</Tombol>}>
          <p>Isi</p>
        </Dialog>
        <Dialog judul="Kedua" pemicu={<Tombol>Buka kedua</Tombol>}>
          <p>Isi</p>
        </Dialog>
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Buka kedua" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Kedua");
  });
});

describe("dikendalikan dari luar", () => {
  it("prop terbuka membuka dialog tanpa pemicu sama sekali", async () => {
    render(
      <Dialog judul="Sesi berakhir" terbuka>
        <p>Silakan masuk kembali.</p>
      </Dialog>,
    );

    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Sesi berakhir");
  });

  it("onUbahTerbuka dipanggil saat pengguna menutup", async () => {
    const ubah = vi.fn();
    render(
      <Dialog judul="Judul" terbuka onUbahTerbuka={ubah}>
        <p>Isi</p>
      </Dialog>,
    );
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");
    expect(ubah).toHaveBeenCalledWith(false);
  });
});

describe("penataan kita tidak merusak apa pun", () => {
  it("isi dialog bisa digulir — penting pada zoom 200%", async () => {
    // Dialog `fixed` yang tingginya tidak dibatasi memanjang melewati layar,
    // dan isinya tidak bisa digulir sama sekali — tombol aksinya jadi mustahil
    // dijangkau (WCAG 2.2 §1.4.4).
    render(<Contoh />);
    await buka();

    const kelas = screen.getByRole("dialog").className;
    expect(kelas).toContain("max-h-[90vh]");
    expect(kelas).toContain("overflow-y-auto");
  });

  it("lapisan dan panel tidak beranimasi saat gerak diminta minimal", async () => {
    render(<Contoh />);
    await buka();

    expect(screen.getByRole("dialog").className).toContain("gerak-minimal:transition-none");
  });

  it("tombol tutup memakai Tombol, jadi ikut aturan target sentuh", async () => {
    render(<Contoh />);
    await buka();

    expect(screen.getByRole("button", { name: "Tutup" }).className).toContain("min-h-sentuh");
  });
});

describe("gerbang aksesibilitas", () => {
  it("dialog terbuka lolos axe", async () => {
    render(<Contoh deskripsi="Tindakan ini permanen." />);
    await buka();

    // Isi dialog hidup di portal pada `document.body`, BUKAN di `container`
    // milik render. Memeriksa `container` akan lolos atas markup kosong —
    // penjaga yang selalu hijau karena tidak memeriksa apa pun.
    await harusLolosAksesibilitas(document.body);
  });

  it("penjaga ini tidak lulus secara hampa — dialog cacat tertangkap", async () => {
    // Dialog dengan `aria-labelledby` menunjuk id yang tidak ada — persis yang
    // terjadi bila judulnya dirender bersyarat lalu lupa. Cacat inilah yang
    // dicegah `judul` menjadi prop WAJIB, jadi ia tidak bisa lahir dari
    // komponen kita; penjaga ini membuktikan gerbangnya memang menangkapnya.
    const palsu = document.createElement("div");
    palsu.setAttribute("role", "dialog");
    palsu.setAttribute("aria-labelledby", "judul-yang-tidak-ada");
    palsu.innerHTML = "<p>Isi</p>";
    document.body.append(palsu);

    try {
      await expect(harusLolosAksesibilitas(document.body)).rejects.toThrow(/aria-dialog-name/);
    } finally {
      // `cleanup()` hanya menyapu kontainer milik RTL. Tanpa ini, dialog cacat
      // bertahan di `document.body` dan membuat test axe LAIN merah — kegagalan
      // yang menuduh berkas yang salah.
      palsu.remove();
    }
  });
});
