// Dialog native (PR-089): fokus TalkBack masuk ke judul saat tampil dan kembali
// ke pemicu saat tertutup.
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/a11y";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { RefObject } from "react";
import { AccessibilityInfo, type View } from "react-native";

import { Dialog, PenyediaTokenA11y } from "../src";

let kirimEvent: jest.SpyInstance;

beforeEach(() => {
  kirimEvent = jest
    .spyOn(AccessibilityInfo, "sendAccessibilityEvent")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  kirimEvent.mockRestore();
});

function tampilkan(props: {
  terbuka: boolean;
  tutup?: () => void;
  pemicu?: RefObject<View | null>;
  reduceMotion?: boolean;
}) {
  return (
    <PenyediaTokenA11y
      preferensi={{ ...ACCESSIBILITY_DEFAULTS, reduceMotion: props.reduceMotion ?? false }}
    >
      <Dialog
        terbuka={props.terbuka}
        tutup={props.tutup ?? (() => undefined)}
        judul="Hapus CV?"
        deskripsi="CV yang dihapus tidak bisa dikembalikan."
        pemicu={props.pemicu}
      />
    </PenyediaTokenA11y>
  );
}

/**
 * Host Modal (mock jest RN merendernya sebagai host "Modal" di akar pohon);
 * props-nya (onShow, onRequestClose, animationType) diteruskan apa adanya.
 */
function hostModal() {
  const [modal] = screen.container.queryAll((n) => n.type === "Modal");
  if (!modal) throw new Error("Modal tidak dirender");
  return modal;
}

describe("Dialog", () => {
  it("judul bertanda header; tombol tutup berlabel dan memanggil tutup", async () => {
    const tutup = jest.fn();
    await render(tampilkan({ terbuka: true, tutup }));

    expect(screen.getByRole("header", { name: "Hapus CV?" })).toBeTruthy();
    expect(screen.getByText("CV yang dihapus tidak bisa dikembalikan.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Tutup" }));
    expect(tutup).toHaveBeenCalledTimes(1);
  });

  it("fokus MASUK: saat Modal tampil, fokus aksesibilitas dikirim ke judul", async () => {
    await render(tampilkan({ terbuka: true }));

    hostModal().props.onShow();

    expect(kirimEvent).toHaveBeenCalledTimes(1);
    const [sasaran, jenis] = kirimEvent.mock.calls[0] as [
      { props: Record<string, unknown> },
      string,
    ];
    expect(jenis).toBe("focus");
    // Sasaran harus host Text judul itu sendiri, bukan sekadar "sesuatu". Di
    // test-renderer, ref host = TestInstance; dibandingkan lewat props-nya
    // (membandingkan objeknya langsung membuat diff melingkar yang tak terbaca).
    expect(sasaran.props.accessibilityRole).toBe("header");
    expect(sasaran.props.children).toBe("Hapus CV?");
  });

  it("tombol Kembali Android (onRequestClose) menutup dialog", async () => {
    const tutup = jest.fn();
    await render(tampilkan({ terbuka: true, tutup }));
    hostModal().props.onRequestClose();
    expect(tutup).toHaveBeenCalledTimes(1);
  });

  it("fokus KELUAR: terbuka → tertutup mengembalikan fokus ke pemicu", async () => {
    const penanda = {} as View;
    const pemicu: RefObject<View | null> = { current: penanda };

    const { rerender } = await render(tampilkan({ terbuka: true, pemicu }));
    kirimEvent.mockClear();
    await rerender(tampilkan({ terbuka: false, pemicu }));

    expect(kirimEvent).toHaveBeenCalledWith(penanda, "focus");
  });

  it("render awal yang tertutup tidak mencuri fokus", async () => {
    const pemicu: RefObject<View | null> = { current: {} as View };
    await render(tampilkan({ terbuka: false, pemicu }));
    expect(kirimEvent).not.toHaveBeenCalled();
  });

  it("kurangi gerak → Modal tanpa animasi; normal → fade", async () => {
    const { rerender } = await render(tampilkan({ terbuka: true, reduceMotion: true }));
    expect(hostModal().props.animationType).toBe("none");
    await rerender(tampilkan({ terbuka: true }));
    expect(hostModal().props.animationType).toBe("fade");
  });
});
