// AC PR-027: "Fokus ring selalu terlihat di semua varian" & "Target sentuh
// ≥ 44px (≥ 56px saat large_touch_targets)".
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Tombol, type VarianTombol } from "../src/tombol.js";

const VARIAN: VarianTombol[] = ["utama", "sekunder", "hening"];

describe("Tombol — semantik natif dipertahankan", () => {
  it("dirender sebagai <button> dengan peran button", () => {
    render(<Tombol>Simpan</Tombol>);
    expect(screen.getByRole("button", { name: "Simpan" }).tagName).toBe("BUTTON");
  });

  it("BAWAANNYA type=button, bukan submit", () => {
    // Bawaan HTML adalah "submit", sehingga tombol apa pun di dalam form akan
    // mengirim form itu saat ditekan — termasuk tombol "Batal". Bug paling
    // lazim dan paling membingungkan bagi pengguna keyboard, yang menekan
    // Enter jauh lebih sering daripada pengguna tetikus.
    render(<Tombol>Batal</Tombol>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("type dapat ditimpa saat memang tombol submit", () => {
    render(<Tombol type="submit">Kirim</Tombol>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("dapat diaktifkan dengan keyboard (Enter dan Spasi)", async () => {
    // Perilaku ini datang GRATIS dari <button> natif. Test-nya ada untuk
    // menangkap saat seseorang kelak menggantinya dengan <div role="button">.
    const klik = vi.fn();
    render(<Tombol onClick={klik}>Simpan</Tombol>);

    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(klik).toHaveBeenCalledTimes(2);
  });

  it("disabled tidak bisa diklik dan keluar dari urutan tab", async () => {
    const klik = vi.fn();
    render(<Tombol disabled onClick={klik}>Simpan</Tombol>);

    await userEvent.click(screen.getByRole("button"));
    expect(klik).not.toHaveBeenCalled();
  });
});

describe("AC-4: target sentuh", () => {
  it.each(VARIAN)("varian %s memakai token target sentuh", (varian) => {
    // `min-h-sentuh` membaca --touch-target-min, jadi 44px → 56px mengikuti
    // preferensi pengguna TANPA komponen ini tahu apa pun tentang preferensi.
    // Ukuran pikselnya sendiri tidak bisa diukur di jsdom (tidak ada tata
    // letak) — PR-031b yang mengukurnya di browser.
    render(<Tombol varian={varian}>Aksi</Tombol>);
    const kelas = screen.getByRole("button").className;

    expect(kelas).toContain("min-h-sentuh");
    expect(kelas).toContain("min-w-sentuh");
  });

  it("ukuran `kecil` TETAP memenuhi target sentuh", () => {
    // "Kecil" hanya merapatkan padding. Target sentuh bukan gaya yang boleh
    // dipilih — ia batas bawah.
    render(<Tombol ukuran="kecil">Aksi</Tombol>);
    expect(screen.getByRole("button").className).toContain("min-h-sentuh");
  });
});

describe("AC-1: cincin fokus tidak pernah dimatikan", () => {
  it.each(VARIAN)("varian %s tidak memakai outline-none", (varian) => {
    // Menghapus outline adalah cara paling umum cincin fokus mati — biasanya
    // karena seseorang menggantinya dengan ring-* lalu lupa satu varian.
    // Aturan `:focus-visible` global (PR-027a) memberi outline `currentColor`
    // yang ikut berubah bersama warna teks tiap varian.
    render(<Tombol varian={varian}>Aksi</Tombol>);
    const kelas = screen.getByRole("button").className;

    expect(kelas).not.toContain("outline-none");
    expect(kelas).not.toContain("outline-0");
    expect(kelas).not.toContain("focus:outline-none");
  });

  it("className dari pemakai tidak bisa menyelundupkan outline-none", () => {
    // Bisa DITIMPA dengan sengaja, tetapi tidak boleh terjadi tanpa terlihat.
    // Test ini merekam bahwa jalurnya ada — penjagaan sesungguhnya ada di
    // review dan di PR-031b yang mengukur di browser.
    render(<Tombol className="outline-none">Aksi</Tombol>);
    expect(screen.getByRole("button").className).toContain("outline-none");
  });
});

describe("gerak minimal & penimpaan kelas", () => {
  it("transisi dimatikan lewat varian atribut, bukan media query", () => {
    // Atribut sudah memperhitungkan pilihan eksplisit pengguna yang boleh
    // menimpa setelan OS (ADR-008).
    render(<Tombol>Aksi</Tombol>);
    expect(screen.getByRole("button").className).toContain("gerak-minimal:transition-none");
  });

  it("className pemakai menang atas kelas bawaan yang bertabrakan", () => {
    render(<Tombol className="rounded-full">Aksi</Tombol>);
    const kelas = screen.getByRole("button").className;
    expect(kelas).toContain("rounded-full");
    expect(kelas).not.toMatch(/\brounded\b(?!-)/);
  });
});

describe("gerbang aksesibilitas", () => {
  it.each(VARIAN)("varian %s lolos axe", async (varian) => {
    const { container } = render(<Tombol varian={varian}>Simpan</Tombol>);
    await harusLolosAksesibilitas(container);
  });

  it("tombol ikon WAJIB punya nama yang bisa dibaca", async () => {
    // Tanpa aria-label, tombol ikon tidak punya nama sama sekali — cacat yang
    // sepenuhnya tak terlihat bagi siapa pun yang melihat layar.
    const { container } = render(
      <Tombol aria-label="Tutup">
        <span aria-hidden="true">×</span>
      </Tombol>,
    );
    await harusLolosAksesibilitas(container);
    expect(screen.getByRole("button")).toHaveAccessibleName("Tutup");
  });

  it("penjaga ini tidak lulus secara hampa — tombol ikon TANPA label gagal", async () => {
    const { container } = render(
      <Tombol>
        <span aria-hidden="true">×</span>
      </Tombol>,
    );
    await expect(harusLolosAksesibilitas(container)).rejects.toThrow(/button-name/);
  });
});
