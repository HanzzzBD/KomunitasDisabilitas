// Kartu lowongan (PR-058) — AC "Kartu = satu kesatuan bagi SR (nama,
// perusahaan, akomodasi, lokasi)". Diuji terisolasi (bukan lewat router
// penuh): komponen ini murni presentasional, hanya butuh konteks i18n +
// router MINIMAL untuk `<Link>` "Lihat detail"-nya.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { JobSearchResult } from "@nawasena/schemas";
import { PenyediaI18n } from "../src/shared/i18n/index.js";
import { KartuLowongan } from "../src/features/job-feed/kartu-lowongan.js";

function lowongan(overrides: Partial<JobSearchResult> = {}): JobSearchResult {
  return {
    id: "01912345-89ab-7def-8123-4567890abe01",
    companyId: "01912345-89ab-7def-8123-4567890abc01",
    companyName: "PT Inklusif Fiktif",
    title: "Staf Layanan Pelanggan",
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    accommodations: ["akses_kursi_roda", "ramah_screen_reader"],
    publishedAt: "2026-01-12T00:00:00.000Z",
    ...overrides,
  };
}

function renderKartu(l: JobSearchResult) {
  return render(
    <PenyediaI18n>
      <MemoryRouter>
        <KartuLowongan lowongan={l} />
      </MemoryRouter>
    </PenyediaI18n>,
  );
}

describe("KartuLowongan — satu kesatuan bagi screen reader", () => {
  it("menampilkan judul sebagai heading", () => {
    renderKartu(lowongan());

    expect(screen.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toBeInTheDocument();
  });

  it("menampilkan nama perusahaan", () => {
    renderKartu(lowongan({ companyName: "PT Contoh Sejahtera" }));

    expect(screen.getByText(/PT Contoh Sejahtera/)).toBeInTheDocument();
  });

  it("menampilkan lokasi (kota, provinsi)", () => {
    renderKartu(lowongan({ city: "Surabaya", province: "Jawa Timur" }));

    expect(screen.getByText(/Surabaya, Jawa Timur/)).toBeInTheDocument();
  });

  it("lokasi kosong → keterangan eksplisit, bukan bagian yang hilang diam-diam", () => {
    renderKartu(lowongan({ city: null, province: null }));

    expect(screen.getByText(/Lokasi tidak dicantumkan/)).toBeInTheDocument();
  });

  it("akomodasi ditampilkan berlabel teks (bukan ikon tanpa nama)", () => {
    renderKartu(lowongan({ accommodations: ["akses_kursi_roda", "juru_bahasa_isyarat"] }));

    expect(screen.getByText("Akses kursi roda")).toBeInTheDocument();
    expect(screen.getByText("Juru bahasa isyarat")).toBeInTheDocument();
  });

  it("akomodasi kosong → keterangan eksplisit, bukan daftar kosong yang diam", () => {
    renderKartu(lowongan({ accommodations: [] }));

    expect(
      screen.getByText("Belum ada akomodasi yang dicantumkan untuk posisi ini."),
    ).toBeInTheDocument();
  });

  it("tautan 'Lihat detail' menyebut judul lowongan pada nama aksesibelnya", () => {
    renderKartu(lowongan({ title: "Kasir Toko Cabang Bandung" }));

    const tautan = screen.getByRole("link", {
      name: "Lihat detail lowongan Kasir Toko Cabang Bandung",
    });
    expect(tautan).toHaveAttribute("href", "/lowongan/01912345-89ab-7def-8123-4567890abe01");
  });

  it("jenis pekerjaan dan mode kerja diterjemahkan ke istilah yang dipahami (bukan enum mentah)", () => {
    renderKartu(lowongan({ employmentType: "freelance", workMode: "remote" }));

    expect(screen.getByText(/Lepas \(freelance\)/)).toBeInTheDocument();
    expect(screen.getByText(/Jarak jauh/)).toBeInTheDocument();
  });
});
