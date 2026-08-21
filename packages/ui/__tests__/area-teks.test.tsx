// AreaTeks (PR-040) — saudara `Masukan` untuk jawaban berbaris banyak.
//
// Diuji atas janji yang SAMA dengan `Masukan`, dan itu disengaja: keduanya
// dipakai bergantian di dalam `KolomForm` yang sama, jadi perbedaan perilaku di
// antara keduanya akan muncul sebagai kolom yang kadang terhubung ke labelnya
// dan kadang tidak — tergantung panjang jawaban yang kebetulan diminta.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { AreaTeks } from "../src/area-teks.js";
import { KolomForm } from "../src/kolom-form.js";

describe("AreaTeks — semantik natif dipertahankan", () => {
  it("dirender sebagai <textarea>", () => {
    render(<AreaTeks aria-label="Ringkasan" />);
    const kolom = screen.getByRole("textbox", { name: "Ringkasan" });

    expect(kolom.tagName).toBe("TEXTAREA");
  });

  it("dapat difokus dan diketik dengan keyboard", async () => {
    render(<AreaTeks aria-label="Ringkasan" />);

    await userEvent.tab();
    const kolom = screen.getByRole("textbox");
    expect(kolom).toHaveFocus();

    await userEvent.keyboard("Saya terbiasa bekerja dari rumah");
    expect(kolom).toHaveValue("Saya terbiasa bekerja dari rumah");
  });

  it("menerima baris baru — itulah alasan komponen ini ada", async () => {
    // `<input>` menelan Enter sebagai submit. Kalau komponen ini diam-diam
    // dirender sebagai input, kegagalannya justru tidak terlihat di layar:
    // tulisan pengguna hanya kehilangan pemisah paragrafnya.
    render(<AreaTeks aria-label="Ringkasan" />);

    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard("baris satu{Enter}baris dua");

    expect(screen.getByRole("textbox")).toHaveValue("baris satu\nbaris dua");
  });

  it("meneruskan ref ke elemen sungguhan", () => {
    let elemen: HTMLTextAreaElement | null = null;
    render(<AreaTeks aria-label="Ringkasan" ref={(n) => (elemen = n)} />);

    expect(elemen).toBe(screen.getByRole("textbox"));
  });

  it("rows bawaan 4, dan bisa ditimpa", () => {
    const { rerender } = render(<AreaTeks aria-label="Ringkasan" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "4");

    rerender(<AreaTeks aria-label="Ringkasan" rows={8} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "8");
  });
});

describe("keadaan bermasalah menulis aria-invalid, bukan sekadar warna", () => {
  it("bermasalah → aria-invalid=true", () => {
    render(<AreaTeks bermasalah aria-label="Ringkasan" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("tanpa masalah, aria-invalid TIDAK ditulis sama sekali", () => {
    // `aria-invalid="false"` sah, tetapi menuliskannya di setiap kolom membuat
    // sebagian screen reader menyebut "valid" pada tiap kolom yang disusuri —
    // kebisingan yang tidak menambah satu pun informasi.
    render(<AreaTeks aria-label="Ringkasan" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });
});

describe("menyambung diri ke KolomForm lewat konteks", () => {
  it("mengambil id dari KolomForm sehingga labelnya terhubung", () => {
    render(
      <KolomForm label="Ringkasan tentang Anda">
        <AreaTeks />
      </KolomForm>,
    );

    // Terhubung lewat `htmlFor`/`id`, bukan lewat kedekatan visual.
    expect(screen.getByRole("textbox", { name: "Ringkasan tentang Anda" })).toBeInTheDocument();
  });

  it("mengambil galat dan bantuan lewat aria-describedby", () => {
    render(
      <KolomForm label="Ringkasan" bantuan="Boleh dikosongkan" galat="Terlalu panjang">
        <AreaTeks />
      </KolomForm>,
    );

    const kolom = screen.getByRole("textbox");
    expect(kolom).toHaveAttribute("aria-invalid", "true");

    const id = kolom.getAttribute("aria-describedby")?.split(" ") ?? [];
    const teks = id.map((x) => document.getElementById(x)?.textContent ?? "").join(" ");
    expect(teks).toContain("Boleh dikosongkan");
    expect(teks).toContain("Terlalu panjang");
  });

  it("prop eksplisit MENANG atas konteks — masih bisa dipakai di luar KolomForm", () => {
    render(
      <KolomForm label="Ringkasan" galat="Terlalu panjang">
        <AreaTeks bermasalah={false} />
      </KolomForm>,
    );

    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });
});

describe("aksesibilitas", () => {
  it("lolos axe di dalam KolomForm, termasuk saat bermasalah", async () => {
    const { container } = render(
      <KolomForm label="Ringkasan" bantuan="Boleh dikosongkan" galat="Terlalu panjang">
        <AreaTeks />
      </KolomForm>,
    );

    await harusLolosAksesibilitas(container);
  });
});
