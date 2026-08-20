// KotakCentang — dipromosikan dari `apps/web/src/features/onboarding` di PR-036.
//
// Komponennya lahir di PR-035 lengkap dengan pemakaiannya, tetapi TANPA test
// miliknya sendiri: sampai kemarin ia diuji hanya lewat wizard yang memakainya.
// Begitu ia menjadi permukaan publik `@nawasena/ui`, pemakainya tidak lagi satu
// — dan komponen bersama yang hanya diuji lewat satu pemakainya akan rusak bagi
// pemakai kedua tanpa satu pun test yang merah.
//
// Yang diuji: sasaran sentuh yang seluas labelnya, sambungan `aria-describedby`,
// dan bahwa keadaannya benar-benar dikendalikan pemanggil.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { KotakCentang } from "../src/kotak-centang.js";

describe("KotakCentang", () => {
  it("labelnya ikut menjadi sasaran klik, bukan hanya kotaknya", async () => {
    // Kotak bawaan peramban ±13px — jauh di bawah ambang target sentuh WCAG 2.2
    // §2.5.8. Yang membuatnya memenuhi ambang adalah label yang membungkusnya.
    const onUbah = vi.fn();
    render(<KotakCentang label="Kontras tinggi" dicentang={false} onUbah={onUbah} />);

    await userEvent.click(screen.getByText("Kontras tinggi"));

    expect(onUbah).toHaveBeenCalledWith(true);
  });

  it("teks bantuan tersambung lewat `aria-describedby`", () => {
    render(
      <KotakCentang
        label="Kontras tinggi"
        bantuan="Warna dibuat lebih tegas."
        dicentang={false}
        onUbah={() => undefined}
      />,
    );

    // Diperiksa lewat nama + deskripsi yang dihitung, bukan lewat id yang
    // ditulis di markup: id yang cocok tetapi tidak pernah dibacakan adalah
    // sambungan yang hanya ada di atas kertas.
    expect(
      screen.getByRole("checkbox", {
        name: "Kontras tinggi",
        description: "Warna dibuat lebih tegas.",
      }),
    ).toBeInTheDocument();
  });

  it("tanpa bantuan, tidak menyisakan `aria-describedby` yang menunjuk ketiadaan", () => {
    render(<KotakCentang label="Kontras tinggi" dicentang={false} onUbah={() => undefined} />);

    expect(screen.getByRole("checkbox")).not.toHaveAttribute("aria-describedby");
  });

  it("keadaannya milik pemanggil — komponen ini tidak menyimpan apa pun sendiri", async () => {
    // Kalau ia menyimpan keadaan sendiri, kotak akan tampak tercentang meski
    // pemanggilnya menolak perubahan (mis. penyimpanan gagal) — layar yang
    // berbohong tentang apa yang tersimpan.
    const onUbah = vi.fn();
    render(<KotakCentang label="Kontras tinggi" dicentang={false} onUbah={onUbah} />);

    await userEvent.click(screen.getByRole("checkbox"));

    expect(onUbah).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("lolos axe", async () => {
    const { container } = render(
      <KotakCentang
        label="Kontras tinggi"
        bantuan="Warna dibuat lebih tegas."
        dicentang
        onUbah={() => undefined}
      />,
    );

    await harusLolosAksesibilitas(container);
  });
});
