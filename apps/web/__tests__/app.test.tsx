// Membuktikan rangkaian Vite → React → jsdom → Testing Library benar-benar
// hidup. Test ini sengaja kecil: nilainya bukan menguji <h1>, melainkan
// membuktikan bahwa harness-nya berfungsi sebelum PR berikutnya bergantung
// padanya. Harness yang rusak akan tampak sebagai "semua test lulus".
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/app/App.js";

describe("App shell", () => {
  it("merender landmark main dan tepat satu h1", () => {
    render(<App />);

    // getByRole, bukan querySelector: yang diuji adalah apa yang DILIHAT
    // pengguna screen reader, bukan nama tag-nya.
    expect(screen.getByRole("main")).toBeInTheDocument();

    const judul = screen.getAllByRole("heading", { level: 1 });
    expect(judul).toHaveLength(1);
    expect(judul[0]).toHaveAccessibleName("Nawasena");
  });
});
