// AC PR-027 nomor 2 ("Label terasosiasi programatik") dan 3 ("Error field
// diumumkan — aria-describedby + aria-invalid").
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { KolomForm } from "../src/kolom-form.js";
import { Masukan } from "../src/masukan.js";

describe("AC-2: label terasosiasi programatik", () => {
  it("label menamai kontrol tanpa id ditulis manual", async () => {
    // Inti komponen ini: penyambungannya TERJADI, bukan diingat.
    const { container } = render(
      <KolomForm label="Nama lengkap">
        <Masukan />
      </KolomForm>,
    );

    expect(screen.getByRole("textbox")).toHaveAccessibleName("Nama lengkap");
    await harusLolosAksesibilitas(container);
  });

  it("mengklik label memindahkan fokus ke kontrol", async () => {
    // Bukti `htmlFor` benar-benar menunjuk kontrolnya, bukan sekadar ada.
    // Sekaligus memperbesar sasaran klik — penting bagi Sari (motorik terbatas).
    render(
      <KolomForm label="Nama lengkap">
        <Masukan />
      </KolomForm>,
    );

    await userEvent.click(screen.getByText("Nama lengkap"));
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("dua kolom di satu halaman tidak bertabrakan id-nya", async () => {
    // Id yang disusun dari nama kolom akan bertabrakan begitu kolomnya muncul
    // dua kali, dan `aria-describedby` ke id ganda mengumumkan yang salah.
    const { container } = render(
      <>
        <KolomForm label="Surel" galat="Format salah">
          <Masukan />
        </KolomForm>
        <KolomForm label="Surel penagihan" galat="Wajib diisi">
          <Masukan />
        </KolomForm>
      </>,
    );

    const kolom = screen.getAllByRole("textbox");
    const id = kolom.map((k) => k.id);
    const deskripsi = kolom.map((k) => k.getAttribute("aria-describedby"));

    expect(new Set(id).size).toBe(2);
    expect(new Set(deskripsi).size).toBe(2);
    await harusLolosAksesibilitas(container);
  });

  it("wajib diumumkan sebagai teks, bukan hanya bintang", () => {
    // Bintang hanya bermakna bagi yang melihatnya, dan artinya harus ditebak.
    render(
      <KolomForm label="Nama" wajib>
        <Masukan />
      </KolomForm>,
    );

    const kolom = screen.getByRole("textbox");
    expect(kolom).toHaveAccessibleName(/wajib diisi/);
    expect(kolom).toBeRequired();
  });
});

describe("AC-3: galat diumumkan", () => {
  it("galat tersambung lewat aria-describedby DAN menyalakan aria-invalid", async () => {
    const { container } = render(
      <KolomForm label="Surel" galat="Format surel tidak sesuai">
        <Masukan />
      </KolomForm>,
    );

    const kolom = screen.getByRole("textbox");
    expect(kolom).toHaveAttribute("aria-invalid", "true");
    expect(kolom).toHaveAccessibleDescription("Format surel tidak sesuai");
    await harusLolosAksesibilitas(container);
  });

  it("galat memakai role=alert agar terumumkan saat MUNCUL", () => {
    // Tanpa live region, galat yang lahir setelah submit hanya terlihat —
    // pengguna screen reader tidak tahu ada yang berubah sampai menjelajah ulang.
    render(
      <KolomForm label="Surel" galat="Wajib diisi">
        <Masukan />
      </KolomForm>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Wajib diisi");
  });

  it("bantuan dibacakan sebelum galat", () => {
    // "Apa yang salah" tanpa "apa yang diminta" tidak bisa ditindaklanjuti.
    render(
      <KolomForm label="Sandi" bantuan="Minimal 12 karakter" galat="Terlalu pendek">
        <Masukan />
      </KolomForm>,
    );

    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "Minimal 12 karakter Terlalu pendek",
    );
  });

  it("tanpa galat: tidak ada aria-invalid dan tidak ada alert", () => {
    render(
      <KolomForm label="Surel" bantuan="Contoh: nama@surel.id">
        <Masukan />
      </KolomForm>,
    );

    const kolom = screen.getByRole("textbox");
    expect(kolom).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(kolom).toHaveAccessibleDescription("Contoh: nama@surel.id");
  });

  it("bantuan tetap tersambung saat galat muncul, tidak tergusur", () => {
    const { rerender } = render(
      <KolomForm label="Sandi" bantuan="Minimal 12 karakter">
        <Masukan />
      </KolomForm>,
    );
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Minimal 12 karakter");

    rerender(
      <KolomForm label="Sandi" bantuan="Minimal 12 karakter" galat="Terlalu pendek">
        <Masukan />
      </KolomForm>,
    );
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "Minimal 12 karakter Terlalu pendek",
    );
  });
});

describe("prop eksplisit menang atas konteks", () => {
  it("id dan aria-describedby yang ditulis pemakai tidak ditimpa", () => {
    render(
      <KolomForm label="Surel" galat="Salah">
        <Masukan id="surel-khusus" aria-describedby="penjelasan-lain" />
      </KolomForm>,
    );

    const kolom = screen.getByRole("textbox");
    expect(kolom).toHaveAttribute("id", "surel-khusus");
    expect(kolom).toHaveAttribute("aria-describedby", "penjelasan-lain");
  });

  it("kontrol di LUAR KolomForm tetap bekerja tanpa konteks", () => {
    // Konteks yang tidak ada harus berarti "tidak ada kolom", bukan "kolom
    // kosong" — kontrol yang lepas tidak boleh tampak seolah tersambung.
    render(<Masukan aria-label="Cari" />);
    const kolom = screen.getByRole("textbox");

    expect(kolom).not.toHaveAttribute("aria-describedby");
    expect(kolom).not.toHaveAttribute("aria-invalid");
  });
});

describe("penjaga ini tidak lulus secara hampa", () => {
  it("kontrol di luar KolomForm TIDAK punya nama — dan axe menangkapnya", async () => {
    const { container } = render(<Masukan />);
    await expect(harusLolosAksesibilitas(container)).rejects.toThrow(/label/);
  });
});
