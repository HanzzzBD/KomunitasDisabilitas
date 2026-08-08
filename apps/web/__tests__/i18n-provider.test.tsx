// AC PR-029: "Toggle mode mengubah seluruh string shell TANPA RELOAD" dan
// "fallback key hilang → tampil key + error log (bukan blank)".
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PenyediaI18n, useModeBahasa, useTeks } from "../src/shared/i18n/index.js";
import type { KunciTeks } from "../src/shared/i18n/index.js";

/** Menampilkan beberapa string sekaligus + tombol ganti mode. */
function Layar() {
  const t = useTeks();
  const { mode, setMode } = useModeBahasa();

  return (
    <>
      <p>{t("shell.beranda.tagline")}</p>
      <p>{t("shell.luring.judul")}</p>
      <output>{mode}</output>
      <button type="button" onClick={() => setMode(mode === "id" ? "id-simple" : "id")}>
        ganti mode
      </button>
    </>
  );
}

describe("PenyediaI18n — toggle mode", () => {
  it("mengubah SELURUH string yang tampil, tanpa memuat ulang", async () => {
    render(
      <PenyediaI18n>
        <Layar />
      </PenyediaI18n>,
    );

    expect(screen.getByText(/Ekosistem karier inklusif/)).toBeInTheDocument();
    expect(screen.getByText(/Anda sedang tidak terhubung ke internet/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ganti mode" }));

    // Dua string berbeda ikut berubah — bukan hanya yang kebetulan diperiksa.
    // Kalau hanya satu yang berubah, konteksnya tidak benar-benar merender
    // ulang pohonnya.
    expect(screen.getByText(/Cari kerja yang ramah/)).toBeInTheDocument();
    expect(screen.getByText(/Internet Anda mati/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("id-simple");
  });

  it("menghormati mode awal yang disuntikkan (jalur masuk PR-026)", () => {
    // PR-026 akan menyambungkan preferensi pengguna lewat prop ini.
    render(
      <PenyediaI18n modeAwal="id-simple">
        <Layar />
      </PenyediaI18n>,
    );
    expect(screen.getByText(/Cari kerja yang ramah/)).toBeInTheDocument();
  });

  it("bawaannya `id`", () => {
    render(
      <PenyediaI18n>
        <Layar />
      </PenyediaI18n>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("id");
  });
});

describe("PenyediaI18n — kunci hilang", () => {
  function Nakal() {
    const t = useTeks();
    // Kunci karangan: TIPE menolaknya, jadi cast diperlukan untuk mencapai
    // jalur runtime-nya sama sekali. Itu sendiri bukti bahwa pertahanan lapis
    // pertama ada di typecheck — yang diuji di sini pertahanan lapis kedua,
    // untuk kunci dinamis dan bundel yang tidak sinkron.
    return <p>{t("shell.tidak.pernah.ada" as KunciTeks)}</p>;
  }

  it("menampilkan kunci apa adanya, bukan blank", () => {
    render(
      <PenyediaI18n laporKunciHilang={() => {}}>
        <Nakal />
      </PenyediaI18n>,
    );
    expect(screen.getByText("shell.tidak.pernah.ada")).toBeInTheDocument();
  });

  it("melaporkan kunci yang hilang — tidak gagal senyap", () => {
    const lapor = vi.fn();
    render(
      <PenyediaI18n laporKunciHilang={lapor}>
        <Nakal />
      </PenyediaI18n>,
    );
    expect(lapor).toHaveBeenCalledWith("shell.tidak.pernah.ada");
  });

  it("TIDAK melapor untuk kunci yang ada", () => {
    const lapor = vi.fn();
    render(
      <PenyediaI18n laporKunciHilang={lapor}>
        <Layar />
      </PenyediaI18n>,
    );
    expect(lapor).not.toHaveBeenCalled();
  });
});

describe("useTeks di luar provider", () => {
  it("melempar, bukan diam-diam memakai bahasa bawaan", () => {
    // Fallback diam-diam akan membuat komponen yang lupa dibungkus tetap
    // "bekerja" — sampai seseorang mengubah mode dan menemukan satu sudut layar
    // yang tidak ikut berubah. Terbukti berguna: penjaga ini menangkap dua
    // berkas test yang belum dibungkus saat i18n dipasang.
    const Telanjang = () => <p>{useTeks()("shell.merek")}</p>;
    expect(() => render(<Telanjang />)).toThrow(/di luar <PenyediaI18n>/);
  });
});
