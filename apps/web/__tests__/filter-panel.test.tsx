// Panel filter pencarian lowongan (PR-058) — AC "Cari + filter end-to-end",
// "Filter keyboard-only + tidak ada jebakan fokus".
//
// YANG DIJAGA DI SINI: `onCari` HANYA terpanggil saat submit (Enter/klik
// "Cari"), TIDAK PERNAH saat mengetik atau mencentang — itulah seluruh alasan
// arsitektur "rancangan vs diterapkan" ada (lihat `browse-daftar.tsx`), dan
// satu-satunya cara membuktikannya adalah mengetik/mencentang lalu memeriksa
// `onCari` BELUM dipanggil.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PenyediaI18n } from "../src/shared/i18n/index.js";
import {
  FILTER_KOSONG,
  FilterPanel,
  type NilaiFilterLowongan,
} from "../src/features/job-feed/filter-panel.js";

function Terkontrol({
  onCari,
  onReset,
}: {
  onCari: (nilai: NilaiFilterLowongan) => void;
  onReset: () => void;
}) {
  const [nilai, setNilai] = useState(FILTER_KOSONG);
  return (
    <FilterPanel
      nilai={nilai}
      onUbah={setNilai}
      onCari={() => {
        onCari(nilai);
      }}
      onReset={() => {
        setNilai(FILTER_KOSONG);
        onReset();
      }}
    />
  );
}

function renderPanel(onCari: (nilai: NilaiFilterLowongan) => void, onReset: () => void = () => {}) {
  return render(
    <PenyediaI18n>
      <Terkontrol onCari={onCari} onReset={onReset} />
    </PenyediaI18n>,
  );
}

describe("FilterPanel — filter hanya terapkan saat submit", () => {
  it("mengetik kata kunci TIDAK memanggil onCari", async () => {
    const onCari = vi.fn();
    renderPanel(onCari);

    await userEvent.type(screen.getByRole("textbox", { name: "Kata kunci" }), "kasir");

    expect(onCari).not.toHaveBeenCalled();
  });

  it("mencentang akomodasi TIDAK memanggil onCari", async () => {
    const onCari = vi.fn();
    renderPanel(onCari);

    await userEvent.click(screen.getByText("Akses kursi roda"));

    expect(onCari).not.toHaveBeenCalled();
  });

  it("menekan 'Cari' memanggil onCari dengan nilai yang sudah diisi", async () => {
    const onCari = vi.fn();
    renderPanel(onCari);

    await userEvent.type(screen.getByRole("textbox", { name: "Kata kunci" }), "kasir");
    await userEvent.type(screen.getByRole("textbox", { name: "Kota" }), "Jakarta");
    await userEvent.click(screen.getByText("Akses kursi roda"));
    await userEvent.click(screen.getByRole("button", { name: "Cari" }));

    expect(onCari).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "kasir",
        city: "Jakarta",
        accommodations: ["akses_kursi_roda"],
      }),
    );
  });

  it("menekan Enter di kolom kata kunci mengirim form (native submit)", async () => {
    const onCari = vi.fn();
    renderPanel(onCari);

    const kotak = screen.getByRole("textbox", { name: "Kata kunci" });
    await userEvent.type(kotak, "admin{Enter}");

    expect(onCari).toHaveBeenCalledTimes(1);
  });

  it("'Hapus semua filter' mengosongkan seluruh kolom TANPA memanggil onCari", async () => {
    const onCari = vi.fn();
    const onReset = vi.fn();
    renderPanel(onCari, onReset);

    await userEvent.type(screen.getByRole("textbox", { name: "Kata kunci" }), "kasir");
    await userEvent.click(screen.getByRole("button", { name: "Hapus semua filter" }));

    expect(screen.getByRole("textbox", { name: "Kata kunci" })).toHaveValue("");
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onCari).not.toHaveBeenCalled();
  });

  it("form ber-nama aksesibel (aria-label) — kotak dialog/region bisa dibedakan", () => {
    renderPanel(vi.fn());

    expect(screen.getByRole("form", { name: "Filter pencarian lowongan" })).toBeInTheDocument();
  });
});
