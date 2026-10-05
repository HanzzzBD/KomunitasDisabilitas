// Profil & CV mobile (PR-092): konfigurasi karier, PDF, bagian CV.
import { createApiClient } from "@nawasena/api-client";
import { KUNCI_LABEL_RESUME } from "@nawasena/formulir";
import { resumeContentInputSchema } from "@nawasena/schemas";
import { describe, expect, it, vi } from "vitest";

import { DAFTAR_CV, labelResume, ringkasBagian, URUTAN_BAGIAN } from "../src/cv/bagian";
import {
  bukaPdfCv,
  namaBerkasPdf,
  pdfSedangDibuat,
  pesanStatusPdf,
  type PlatformPdf,
} from "../src/cv/pdf";
import { KONFIG_KARIER, konfigPendidikan, konfigPengalaman } from "../src/profil/karier";

const ID = "01912345-89ab-7def-8123-000000000001";

function klienPalsu(jawab: unknown) {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(jawab), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  return { klien: createApiClient({ baseUrl: "https://x/api/v1", fetch: fetch as never }), fetch };
}

describe("konfigurasi karier", () => {
  it("formulir kosong punya kunci untuk setiap kolom", () => {
    for (const k of Object.values(KONFIG_KARIER)) {
      expect(Object.keys(k.keNilai(null)).sort()).toEqual(k.kolom.map((c) => c.nama).sort());
    }
  });

  it("isian tidak sah ditolak di klien dengan galat per kolom — tanpa jaringan", async () => {
    const { klien, fetch } = klienPalsu({});
    const hasil = await konfigPengalaman.simpan(
      klien,
      { title: "  ", company: "", startDate: "2024-05-01", endDate: "2023-01-01", description: "" },
      null,
    );
    expect(hasil.ok).toBe(false);
    expect(hasil.ok === false && Object.keys(hasil.galat).sort()).toEqual(["endDate", "title"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("item baru → POST; item lama → PUT ke id-nya; teks kosong jadi null", async () => {
    const item = { id: ID, institution: "SLB Negeri 1", degree: null, field: null, year: 2020 };
    const { klien, fetch } = klienPalsu({ data: item });
    const nilai = { institution: " SLB Negeri 1 ", degree: "", field: "", year: "2020" };

    expect(await konfigPendidikan.simpan(klien, nilai, null)).toEqual({ ok: true, nilai: item });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://x/api/v1/me/educations");
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      institution: "SLB Negeri 1",
      degree: null,
      field: null,
      year: 2020,
    });

    await konfigPendidikan.simpan(klien, nilai, ID);
    expect(fetch.mock.calls[1]?.[0]).toBe(`https://x/api/v1/me/educations/${ID}`);
    expect(fetch.mock.calls[1]?.[1]?.method).toBe("PUT");
  });

  it("ringkasan baris: tanggal tanpa selesai dibaca 'sekarang'", () => {
    expect(
      konfigPengalaman.ringkas({
        id: ID,
        title: "Desainer",
        company: "PT A",
        startDate: "2022-01-01",
        endDate: null,
        description: null,
      }),
    ).toEqual({ judul: "Desainer", keterangan: "PT A · 2022-01-01 – sekarang" });
  });
});

function platformPalsu(viewerGagal = false): PlatformPdf & { panggil: string[] } {
  const panggil: string[] = [];
  return {
    panggil,
    unduh: vi.fn(async (url, nama) => {
      panggil.push(`unduh ${url} ${nama}`);
      return `file:///cache/cv/${nama}`;
    }),
    keContentUri: vi.fn(async (uri) => {
      panggil.push(`content ${uri}`);
      return uri.replace("file:///cache", "content://id.nawasena.app");
    }),
    bukaViewer: vi.fn(async (uri) => {
      panggil.push(`viewer ${uri}`);
      if (viewerGagal) throw new Error("ActivityNotFound");
    }),
    bagikan: vi.fn(async (uri) => void panggil.push(`bagikan ${uri}`)),
  };
}

describe("PDF CV", () => {
  it("unduh ke nama stabil → content:// → viewer", async () => {
    const p = platformPalsu();
    expect(await bukaPdfCv(p, ID, "https://b2/cv.pdf?sig=1")).toBe("viewer");
    expect(p.panggil).toEqual([
      `unduh https://b2/cv.pdf?sig=1 ${namaBerkasPdf(ID)}`,
      `content file:///cache/cv/cv-${ID}.pdf`,
      `viewer content://id.nawasena.app/cv/cv-${ID}.pdf`,
    ]);
  });

  it("tanpa aplikasi PDF → lembar Bagikan dengan berkas yang sama", async () => {
    const p = platformPalsu(true);
    expect(await bukaPdfCv(p, ID, "https://b2/cv.pdf")).toBe("bagikan");
    expect(p.panggil.at(-1)).toBe(`bagikan file:///cache/cv/cv-${ID}.pdf`);
  });

  it("gagal unduh dilempar ke pemanggil (bukan diam-diam membagikan)", async () => {
    const p = platformPalsu();
    vi.mocked(p.unduh).mockRejectedValueOnce(new Error("404"));
    await expect(bukaPdfCv(p, ID, "https://b2/kedaluwarsa")).rejects.toThrow("404");
    expect(p.bagikan).not.toHaveBeenCalled();
  });

  it("polling hanya selama antre/diproses; tiap status punya kalimat", () => {
    expect(pdfSedangDibuat({ status: "queued" })).toBe(true);
    expect(pdfSedangDibuat({ status: "processing" })).toBe(true);
    expect(pdfSedangDibuat({ status: "idle" })).toBe(false);
    expect(pdfSedangDibuat(undefined)).toBe(false);
    for (const status of ["idle", "queued", "processing", "failed"] as const) {
      expect(pesanStatusPdf({ status }, false)).not.toBe("");
    }
    expect(
      pesanStatusPdf(
        { status: "ready", downloadUrl: "https://x", expiresAt: "2026-10-05T00:00:00.000Z" },
        true,
      ),
    ).toMatch(/internet/);
  });
});

describe("bagian CV", () => {
  it("setiap kunci label paket punya teks mobile", () => {
    for (const k of KUNCI_LABEL_RESUME) expect(labelResume(k)).not.toBe("");
  });

  it("urutan bagian mencakup semua bagian daftar", () => {
    const bagian = URUTAN_BAGIAN.map((b) => b.bagian);
    for (const b of Object.keys(DAFTAR_CV)) expect(bagian).toContain(b);
  });

  it("ringkasan bagian untuk kartu editor", () => {
    const isi = resumeContentInputSchema.parse({
      headline: "Desainer",
      experiences: [{ title: "A" }, { title: "B" }],
    });
    expect(ringkasBagian(isi, "ringkasan")).toBe("Desainer");
    expect(ringkasBagian(isi, "experiences")).toBe("2 pengalaman");
    expect(ringkasBagian(isi, "skills")).toBe("Belum diisi");
    expect(ringkasBagian(isi, "kontak")).toBe("Belum diisi");
  });

  it("tombol naik/turun menulis kolom memakai definisi paket (spasi ketikan dipertahankan)", () => {
    const [, perusahaan] = DAFTAR_CV.experiences.kolom;
    expect(perusahaan?.tulis(DAFTAR_CV.experiences.itemKosong, "PT Maju ").company).toBe(
      "PT Maju ",
    );
  });
});
