// Membuktikan rangkaian nyata hidup: Vite → React → provider → router → jsdom.
// Test ini merender `App` APA ADANYA — router browser dan semua — supaya
// perakitan yang dipakai pengguna itulah yang diuji, bukan versi yang dirakit
// ulang khusus untuk test.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/app/App.js";

describe("App shell", () => {
  it("merender route '/' lewat pemuatan lazy", async () => {
    render(<App />);

    // findBy*, bukan getBy*: route dimuat `import()` dinamis, jadi render
    // pertama sengaja belum memuat isinya. Memakai getBy di sini akan gagal —
    // dan kegagalannya justru bukti bahwa pemecahan chunk-nya nyata.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Cari kerja tanpa hambatan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("menyediakan tautan ke halaman masuk", async () => {
    render(<App />);

    // Sejak PR-032a ajakan utama landing berbunyi "Mulai sekarang" — kata kerja
    // yang menyebut apa yang terjadi berikutnya, bukan nama halaman tujuan.
    const tautan = await screen.findByRole("link", { name: "Mulai sekarang" });
    expect(tautan).toHaveAttribute("href", "/masuk");
  });
});
