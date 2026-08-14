// AC PR-027 nomor 5: "Keyboard interaksi Select sesuai pola WAI-ARIA".
//
// Perilakunya milik Radix, bukan milik kita — test di sini TIDAK menguji ulang
// pustakanya. Yang diuji: bahwa perilaku itu benar-benar sampai ke pengguna
// setelah kita menatanya, dan bahwa penataan itu tidak merusak apa pun. Itulah
// risiko yang dicatat dokumen phase ("kustomisasi berlebihan merusak perilaku
// ARIA"), dan satu-satunya risiko yang memang milik berkas kita.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { KolomForm } from "../src/kolom-form.js";
import { Pilihan, type OpsiPilihan } from "../src/pilihan.js";

const OPSI: OpsiPilihan[] = [
  { nilai: "tuli", label: "Tuli" },
  { nilai: "netra", label: "Netra" },
  { nilai: "daksa", label: "Daksa" },
];

function render_(tambahan: Partial<Parameters<typeof Pilihan>[0]> = {}) {
  return render(
    <KolomForm label="Jenis disabilitas">
      <Pilihan opsi={OPSI} {...tambahan} />
    </KolomForm>,
  );
}

describe("AC-5: pola WAI-ARIA sampai ke pengguna", () => {
  it("pemicu adalah combobox dengan aria-expanded yang berubah", async () => {
    render_();
    const pemicu = screen.getByRole("combobox", { name: "Jenis disabilitas" });

    expect(pemicu).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(pemicu);
    expect(pemicu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("dibuka dengan keyboard, tanpa tetikus sama sekali", async () => {
    const ubah = vi.fn();
    render_({ onUbah: ubah });

    await userEvent.tab();
    expect(screen.getByRole("combobox")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("membuka daftar langsung MENYOROT opsi pertama", async () => {
    // Pola WAI-ARIA menuntut selalu ada opsi tersorot saat daftar terbuka —
    // kalau tidak, pengguna keyboard membuka daftar lalu tidak tahu di mana ia
    // berada. Test terpisah dari yang di bawah karena inilah yang menjelaskan
    // kenapa satu kali ArrowDown mendarat di opsi KEDUA, bukan pertama.
    render_();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    await screen.findByRole("listbox");
    expect(screen.getByRole("option", { name: "Tuli" })).toHaveAttribute("data-highlighted");
  });

  it("panah bawah memindahkan sorotan, Enter memilih yang tersorot", async () => {
    const ubah = vi.fn();
    render_({ onUbah: ubah });

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("listbox");

    // Terbuka dengan "Tuli" tersorot, satu langkah turun → "Netra".
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(ubah).toHaveBeenCalledTimes(1);
    expect(ubah.mock.calls[0]?.[0]).toBe("netra");
  });

  it("Escape menutup daftar DAN mengembalikan fokus ke pemicu", async () => {
    // Fokus yang tidak kembali adalah cara paling umum pengguna keyboard
    // "tersesat": daftarnya hilang, dan fokusnya entah di mana.
    render_();
    const pemicu = screen.getByRole("combobox");

    await userEvent.click(pemicu);
    await screen.findByRole("listbox");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(pemicu).toHaveFocus();
  });

  it("opsi nonaktif tidak bisa dipilih", async () => {
    const ubah = vi.fn();
    render(
      <KolomForm label="Kota">
        <Pilihan
          opsi={[
            { nilai: "jakarta", label: "Jakarta" },
            { nilai: "bandung", label: "Bandung", nonaktif: true },
          ]}
          onUbah={ubah}
        />
      </KolomForm>,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Bandung" }));

    expect(ubah).not.toHaveBeenCalled();
  });

  it("nilai terpilih diumumkan lewat aria-selected, bukan hanya tanda centang", async () => {
    render_({ nilaiAwal: "netra" });

    expect(screen.getByRole("combobox")).toHaveTextContent("Netra");

    await userEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /Netra/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("penataan kita tidak merusak apa pun", () => {
  it("pemicu tidak memakai outline-none", () => {
    // Sama seperti PR-027b: outline `:focus-visible` global yang bekerja.
    render_();
    const kelas = screen.getByRole("combobox").className;

    expect(kelas).not.toContain("outline-none");
    expect(kelas).not.toContain("outline-0");
  });

  it("item yang disorot TIDAK mematikan outline-nya", async () => {
    // Contoh Radix di internet lazim memasangkan `bg-*-100` dengan
    // `outline-none`. Abu muda di atas putih hanya ± 1,1:1 — jauh di bawah
    // 3:1 yang dituntut WCAG 2.2 §1.4.11 — sehingga begitu outline-nya
    // dimatikan, penanda fokus keyboard praktis hilang.
    render_();
    await userEvent.click(screen.getByRole("combobox"));

    for (const item of await screen.findAllByRole("option")) {
      expect(item.className).not.toContain("outline-none");
    }
  });

  it("yang terpilih ditandai BENTUK, bukan warna saja", async () => {
    // WCAG 2.2 §1.4.1: informasi tidak boleh disampaikan warna semata. Latar
    // gelap pada item terpilih hilang sama sekali di mode kontras tinggi dan
    // pada cetak; tanda centangnya tidak.
    //
    // Centangnya `aria-hidden` — keadaan terpilih SUDAH diumumkan lewat
    // `aria-selected`, jadi ia murni penanda visual dan tidak menambah
    // kebisingan bagi pengguna screen reader.
    render_({ nilaiAwal: "netra" });
    await userEvent.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox");

    const terpilih = screen.getByRole("option", { name: "Netra" });
    const lain = screen.getByRole("option", { name: "Tuli" });

    expect(terpilih.textContent).toContain("✓");
    expect(lain.textContent).not.toContain("✓");
    expect(terpilih).toHaveAccessibleName("Netra");
  });

  it("pemicu memakai token target sentuh", () => {
    render_();
    expect(screen.getByRole("combobox").className).toContain("min-h-sentuh");
  });

  it("setiap opsi memenuhi target sentuh", async () => {
    // Daftar yang rapat adalah sasaran yang mudah meleset — dan opsi yang
    // salah terpilih jauh lebih mahal daripada tombol yang salah tertekan.
    render_();
    await userEvent.click(screen.getByRole("combobox"));

    for (const item of await screen.findAllByRole("option")) {
      expect(item.className).toContain("min-h-sentuh");
    }
  });
});

describe("sambungan ke KolomForm", () => {
  it("label KolomForm menamai pemicu, galat menyalakan aria-invalid", async () => {
    const { container } = render(
      <KolomForm label="Jenis disabilitas" galat="Pilih salah satu">
        <Pilihan opsi={OPSI} />
      </KolomForm>,
    );

    const pemicu = screen.getByRole("combobox", { name: "Jenis disabilitas" });
    expect(pemicu).toHaveAttribute("aria-invalid", "true");
    expect(pemicu).toHaveAccessibleDescription("Pilih salah satu");
    await harusLolosAksesibilitas(container);
  });

  it("dipakai di luar KolomForm, aria-label sendiri tetap cukup", async () => {
    const { container } = render(<Pilihan opsi={OPSI} aria-label="Urutkan" />);

    expect(screen.getByRole("combobox", { name: "Urutkan" })).toBeInTheDocument();
    await harusLolosAksesibilitas(container);
  });
});

describe("penjaga ini tidak lulus secara hampa", () => {
  it("Pilihan TANPA label apa pun ditangkap axe", async () => {
    const { container } = render(<Pilihan opsi={OPSI} />);
    // Nama aturannya ikut diperiksa, supaya penjaga ini tidak bisa "lulus"
    // gara-gara galat lain yang kebetulan terlempar.
    await expect(harusLolosAksesibilitas(container)).rejects.toThrow(/select-name|button-name/);
  });
});
