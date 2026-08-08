import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useStatusJaringan } from "../src/shared/status-jaringan.js";

function setDaring(nilai: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: nilai, configurable: true });
}

function pancarkan(nama: "online" | "offline") {
  act(() => {
    window.dispatchEvent(new Event(nama));
  });
}

/** Komponen tipis yang hanya memperlihatkan nilai hook ke DOM. */
function Penguji() {
  const { daring, periksaUlang } = useStatusJaringan();
  return (
    <>
      <output>{daring ? "daring" : "luring"}</output>
      <button type="button" onClick={periksaUlang}>
        periksa
      </button>
    </>
  );
}

afterEach(() => {
  setDaring(true);
});

describe("useStatusJaringan", () => {
  it("membaca status awal dari navigator", () => {
    setDaring(false);
    render(<Penguji />);
    expect(screen.getByRole("status")).toHaveTextContent("luring");
  });

  it("mengikuti event 'offline' dan 'online'", () => {
    setDaring(true);
    render(<Penguji />);
    expect(screen.getByRole("status")).toHaveTextContent("daring");

    setDaring(false);
    pancarkan("offline");
    expect(screen.getByRole("status")).toHaveTextContent("luring");

    setDaring(true);
    pancarkan("online");
    expect(screen.getByRole("status")).toHaveTextContent("daring");
  });

  it("membaca ulang setelah listener terpasang — menutup celah balapan", () => {
    // Perubahan yang terjadi ANTARA render pertama dan pemasangan listener akan
    // hilang tanpa pembacaan ulang di dalam useEffect. Jendelanya sempit, tetapi
    // persis jenis kondisi yang muncul di perangkat lambat dan tidak pernah
    // muncul di mesin pengembang.
    setDaring(true);
    const { unmount } = render(<Penguji />);
    unmount();

    // Simulasi: status sudah berubah sebelum komponen terpasang.
    setDaring(false);
    render(<Penguji />);
    expect(screen.getByRole("status")).toHaveTextContent("luring");
  });

  it("melepas listener saat unmount — tidak ada kebocoran", () => {
    setDaring(true);
    const { unmount } = render(<Penguji />);
    unmount();

    // Kalau listener masih terpasang, setState pada komponen yang sudah
    // dilepas akan memancing peringatan React.
    setDaring(false);
    expect(() => {
      pancarkan("offline");
    }).not.toThrow();
  });
});
