// KeadaanKosong — pola empty state (PR-032b, AC PR-032 nomor 4).
//
// Yang diuji di sini adalah tiga hal yang paling mudah rusak dan paling sulit
// terlihat: apakah ia TERDENGAR, apakah ia merusak kerangka heading, dan apakah
// ia memaksa penulisnya menyebutkan langkah berikutnya.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { KeadaanKosong } from "../src/keadaan-kosong.js";
import { Tombol } from "../src/tombol.js";

describe("keadaan kosong terdengar, bukan hanya terlihat", () => {
  it("berupa live region yang sopan (`status`), bukan `alert`", () => {
    render(
      <KeadaanKosong judul="Belum ada lamaran" tingkatJudul={2}>
        <p>Lamaran yang Anda kirim akan muncul di sini.</p>
      </KeadaanKosong>,
    );

    // `status` (polite) menunggu giliran; `alert` (assertive) menyela apa pun
    // yang sedang dibacakan. Layar kosong bukan keadaan darurat — menyela demi
    // mengabarkan ketiadaan justru mengusir pengguna dari kalimat yang sedang
    // ia dengarkan.
    const wilayah = screen.getByRole("status");
    expect(wilayah).toBeInTheDocument();
    expect(wilayah).not.toHaveAttribute("aria-live", "assertive");
  });

  it("judul, penjelasan, DAN aksi berada di dalam satu wilayah yang sama", () => {
    // `role="status"` membawa `aria-atomic` — seluruh isinya dibacakan sebagai
    // satu kesatuan. Aksi yang diletakkan di luar wilayah tidak ikut terbaca,
    // sehingga pengguna mendengar "Belum ada lamaran" tanpa pernah tahu ada
    // tombol yang bisa mengubahnya.
    render(
      <KeadaanKosong
        judul="Belum ada lamaran"
        tingkatJudul={2}
        aksi={<Tombol>Cari lowongan</Tombol>}
      >
        <p>Lamaran yang Anda kirim akan muncul di sini.</p>
      </KeadaanKosong>,
    );

    const wilayah = screen.getByRole("status");
    expect(wilayah).toContainElement(screen.getByRole("heading", { level: 2 }));
    expect(wilayah).toContainElement(screen.getByText(/akan muncul di sini/));
    expect(wilayah).toContainElement(screen.getByRole("button", { name: "Cari lowongan" }));
  });
});

describe("tingkat heading mengikuti tempat pemakaian", () => {
  it("dirender pada tingkat yang diminta, bukan nilai mati", () => {
    render(
      <>
        <KeadaanKosong judul="Dua" tingkatJudul={2}>
          <p>a</p>
        </KeadaanKosong>
        <KeadaanKosong judul="Lima" tingkatJudul={5}>
          <p>b</p>
        </KeadaanKosong>
      </>,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Dua");
    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent("Lima");
  });

  it("lupa memberi tingkat adalah galat KOMPILASI, bukan cacat diam", () => {
    // @ts-expect-error `tingkatJudul` wajib — tanpa ikatan ini, keadaan kosong
    // yang dipakai di kedalaman lain akan menghasilkan kerangka heading yang
    // rusak tanpa satu pun gejala di layar.
    const _salah = <KeadaanKosong judul="Tanpa tingkat">isi</KeadaanKosong>;
    expect(_salah).toBeDefined();
  });

  it("penjelasan WAJIB — 'tidak ada data' saja tidak boleh cukup", () => {
    // @ts-expect-error `children` wajib. Layar kosong tanpa penjelasan
    // meninggalkan pengguna menebak apakah ia salah memakai aplikasinya.
    const _salah = <KeadaanKosong judul="Kosong" tingkatJudul={2} />;
    expect(_salah).toBeDefined();
  });
});

describe("gerbang aksesibilitas", () => {
  it("lolos axe, dengan maupun tanpa aksi", async () => {
    const { container } = render(
      <main>
        <h1>Halaman</h1>
        <KeadaanKosong judul="Belum ada lamaran" tingkatJudul={2}>
          <p>Lamaran yang Anda kirim akan muncul di sini.</p>
        </KeadaanKosong>
        <KeadaanKosong
          judul="Tidak ada hasil"
          tingkatJudul={2}
          aksi={<Tombol varian="sekunder">Hapus filter</Tombol>}
        >
          <p>Coba kurangi filter yang aktif.</p>
        </KeadaanKosong>
      </main>,
    );

    await harusLolosAksesibilitas(container);
  });

  it("penjaga ini tidak lulus secara hampa", async () => {
    // Gerbang yang tidak pernah bisa merah tidak menjaga apa pun.
    const palsu = document.createElement("div");
    palsu.innerHTML = '<button type="button"></button>';
    document.body.append(palsu);
    try {
      await expect(harusLolosAksesibilitas(palsu)).rejects.toThrow(/button-name/);
    } finally {
      palsu.remove();
    }
  });
});
