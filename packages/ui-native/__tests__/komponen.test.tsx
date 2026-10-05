// Komponen native (PR-089): role + label yang dibaca TalkBack, state, dan token.
// Dirender RN sungguhan lewat jest-expo (preset Android) + RNTL v14 (API async).
import { ACCESSIBILITY_DEFAULTS, type AccessibilityPreferences } from "@nawasena/a11y";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";

import { Kartu, KotakCentang, Masukan, PenyediaTokenA11y, PilihanTunggal, Tombol } from "../src";

function denganProfil(ui: ReactElement, ubah: Partial<AccessibilityPreferences> = {}) {
  return render(
    <PenyediaTokenA11y preferensi={{ ...ACCESSIBILITY_DEFAULTS, ...ubah }}>{ui}</PenyediaTokenA11y>,
  );
}

function gayaDatar(el: { props: Record<string, unknown> }) {
  return StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
}

describe("Tombol", () => {
  it("dibaca sebagai tombol bernama sesuai teks terlihatnya", async () => {
    const tekan = jest.fn();
    await denganProfil(
      <Tombol label="Kirim lamaran" onPress={tekan} petunjuk="Mengirim CV Anda" />,
    );

    const tombol = screen.getByRole("button", { name: "Kirim lamaran" });
    expect(tombol.props.accessibilityHint).toBe("Mengirim CV Anda");
    await fireEvent.press(tombol);
    expect(tekan).toHaveBeenCalledTimes(1);
  });

  it("nonaktif & sibuk diumumkan lewat state, dan tidak bisa ditekan", async () => {
    const tekan = jest.fn();
    await denganProfil(<Tombol label="Simpan" onPress={tekan} sibuk />);

    const tombol = screen.getByRole("button", { name: "Simpan" });
    expect(tombol.props.accessibilityState).toEqual({ disabled: true, busy: true });
    await fireEvent.press(tombol);
    expect(tekan).not.toHaveBeenCalled();
  });

  it.each([
    [false, 44],
    [true, 56],
  ])("target sentuh mengikuti token (besar=%s → %i dp)", async (largeTouchTargets, dp) => {
    await denganProfil(<Tombol label="OK" onPress={() => undefined} testID="t" />, {
      largeTouchTargets,
    });
    const gaya = gayaDatar(screen.getByTestId("t"));
    expect(gaya.minHeight).toBe(dp);
    expect(gaya.minWidth).toBe(dp);
  });

  it("ukuran huruf mengikuti skala teks", async () => {
    await denganProfil(<Tombol label="Besar" onPress={() => undefined} />, { textScale: 200 });
    expect(gayaDatar(screen.getByText("Besar")).fontSize).toBe(32);
  });

  it("tanpa penyedia tetap memakai token bawaan", async () => {
    await render(<Tombol label="Tanpa penyedia" onPress={() => undefined} testID="t" />);
    expect(gayaDatar(screen.getByTestId("t")).minHeight).toBe(44);
  });
});

describe("Masukan", () => {
  it("kolom bernama sesuai label terlihat dan meneruskan ketikan", async () => {
    const ubah = jest.fn();
    await denganProfil(
      <Masukan label="Email" nilai="" ubahNilai={ubah} keyboardType="email-address" />,
    );

    const kolom = screen.getByLabelText("Email");
    expect(kolom.props.keyboardType).toBe("email-address");
    await fireEvent.changeText(kolom, "rina@contoh.id");
    expect(ubah).toHaveBeenCalledWith("rina@contoh.id");
  });

  it("galat tampil sebagai live region dan dibaca sebagai petunjuk kolom", async () => {
    await denganProfil(
      <Masukan
        label="Nomor HP"
        nilai="08"
        ubahNilai={() => undefined}
        petunjuk="Contoh: 0812xxxx"
        galat="Nomor HP terlalu pendek"
      />,
    );

    expect(screen.getByLabelText("Nomor HP").props.accessibilityHint).toBe(
      "Nomor HP terlalu pendek. Contoh: 0812xxxx",
    );
    expect(screen.getByText("Nomor HP terlalu pendek").props.accessibilityLiveRegion).toBe(
      "polite",
    );
  });

  it("tanpa galat tidak ada petunjuk; tinggi kolom mengikuti token", async () => {
    await denganProfil(<Masukan label="Nama" nilai="" ubahNilai={() => undefined} testID="k" />, {
      largeTouchTargets: true,
    });
    expect(screen.getByLabelText("Nama").props.accessibilityHint).toBeUndefined();
    expect(gayaDatar(screen.getByTestId("k")).minHeight).toBe(56);
  });
});

describe("Kartu", () => {
  it("kartu statis bukan tombol; isinya terbaca satu per satu", async () => {
    await denganProfil(
      <Kartu>
        <Text>Staf Administrasi</Text>
        <Tombol label="Lamar" onPress={() => undefined} />
      </Kartu>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Staf Administrasi")).toBeTruthy();
  });

  it("kartu yang dapat ditekan adalah satu tombol berlabel", async () => {
    const tekan = jest.fn();
    await denganProfil(
      <Kartu label="Staf Administrasi, PT Contoh, Bandung" onPress={tekan}>
        <Text>Staf Administrasi</Text>
      </Kartu>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Staf Administrasi, PT Contoh, Bandung" }),
    );
    expect(tekan).toHaveBeenCalledTimes(1);
  });
});

describe("KotakCentang (PR-091)", () => {
  it("dibaca sebagai kotak centang bernama label, dengan state dan petunjuk", async () => {
    const ubah = jest.fn();
    await denganProfil(
      <KotakCentang
        label="Kontras tinggi"
        bantuan="Warna lebih tegas"
        dicentang={false}
        onUbah={ubah}
      />,
    );

    const kotak = screen.getByRole("checkbox", { name: "Kontras tinggi" });
    expect(kotak.props.accessibilityState).toEqual({ checked: false });
    expect(kotak.props.accessibilityHint).toBe("Warna lebih tegas");
    await fireEvent.press(kotak);
    expect(ubah).toHaveBeenCalledWith(true);
  });

  it("dicentang → menekan lagi melepas centang; tanda ✓ terlihat", async () => {
    const ubah = jest.fn();
    await denganProfil(<KotakCentang label="Kurangi animasi" dicentang onUbah={ubah} />);

    expect(screen.getByText("✓")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Kurangi animasi" }));
    expect(ubah).toHaveBeenCalledWith(false);
  });

  it("seluruh baris memenuhi target sentuh token (56 dp saat target besar)", async () => {
    await denganProfil(
      <KotakCentang label="X" dicentang={false} onUbah={() => undefined} testID="k" />,
      { largeTouchTargets: true },
    );
    expect(gayaDatar(screen.getByTestId("k")).minHeight).toBe(56);
  });
});

describe("PilihanTunggal (PR-092)", () => {
  const OPSI = [
    { nilai: "never", label: "Jangan pernah" },
    { nilai: "ask_each_time", label: "Tanya saya dulu" },
    { nilai: "always", label: "Selalu" },
  ] as const;

  it("grup radio bernama judul; opsi terpilih ditandai dan posisinya terbaca", async () => {
    const ubah = jest.fn();
    await denganProfil(
      <PilihanTunggal judul="Saat melamar" opsi={OPSI} nilai="ask_each_time" onUbah={ubah} />,
    );

    // Grup sengaja TIDAK `accessible` (opsi tetap disentuh satu per satu), jadi
    // getByRole tidak menjangkaunya; role + nama diperiksa lewat label.
    expect(screen.getByLabelText("Saat melamar").props.accessibilityRole).toBe("radiogroup");
    const tanya = screen.getByRole("radio", { name: "Tanya saya dulu" });
    expect(tanya.props.accessibilityState).toEqual({ checked: true });
    expect(tanya.props.accessibilityValue).toEqual({ text: "2 dari 3" });
    await fireEvent.press(screen.getByRole("radio", { name: "Selalu" }));
    expect(ubah).toHaveBeenCalledWith("always");
  });
});

describe("Masukan banyak baris (PR-092)", () => {
  it("multiline + maxLength diteruskan ke TextInput", async () => {
    await denganProfil(
      <Masukan label="Ringkasan" nilai="" ubahNilai={() => undefined} multiline maxLength={2000} />,
    );
    const kolom = screen.getByLabelText("Ringkasan");
    expect(kolom.props.multiline).toBe(true);
    expect(kolom.props.maxLength).toBe(2000);
  });
});
