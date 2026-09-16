// Unit service CV (PR-060) — repository palsu, tanpa I/O.
//
// Yang dijaga di sini adalah keputusan-keputusan yang tinggal DI SERVICE, bukan
// di database maupun di gerbang zod:
//   AC-3 batas CV per pengguna datang dari config, dan pesannya menyebut angkanya
//   AC-5 `createdVia` ditentukan JALUR, bukan diakui klien
//   404 seragam untuk "tidak ada" dan "milik orang lain"
//   penolakan FK (`CV masih dipakai lamaran`) diterjemahkan, bukan dibiarkan 500
import { describe, it, expect } from "vitest";
import { AppError } from "../src/core/http/index.js";
import {
  createResumesService,
  CvDipakaiLamaranError,
  kunciAntreCv,
  type ResumeRow,
  type ResumesRepository,
} from "../src/modules/resumes/index.js";

const AKTOR = { userId: "018f4c1e-0000-7000-8000-00000000aaaa" };
const ISI_KOSONG = {
  schemaVersion: 1 as const,
  headline: null,
  summary: null,
  contact: { email: null, phone: null, city: null, province: null, links: [] },
  experiences: [],
  educations: [],
  skills: [],
  certifications: [],
  organizations: [],
};

function baris(patch: Partial<ResumeRow> = {}): ResumeRow {
  return {
    id: "018f4c1e-0000-7000-8000-00000000001a",
    title: "CV Utama",
    content: ISI_KOSONG,
    pdfUrl: null,
    createdVia: "manual",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-02T00:00:00.000Z"),
    ...patch,
  };
}

/**
 * Repository palsu yang MENGHORMATI batas — persis seperti yang sungguhan.
 *
 * `createIfUnderLimit` yang selalu berhasil akan membuat test batas di bawah
 * lulus secara palsu: yang ingin dibuktikan adalah service menerjemahkan `null`
 * menjadi 409 berpesan benar, dan itu hanya terbukti bila `null` memang pernah
 * dikembalikan.
 */
function repoPalsu(awal: ResumeRow[] = []): ResumesRepository & { isi: ResumeRow[] } {
  const isi = [...awal];
  return {
    isi,
    listByUser: () => Promise.resolve(isi.map(({ content: _abaikan, ...r }) => r)),
    findOwned: (_userId, id) => Promise.resolve(isi.find((r) => r.id === id) ?? null),
    createIfUnderLimit: (_userId, id, data, maks) => {
      if (isi.length >= maks) return Promise.resolve(null);
      const row = baris({ id, title: data.title, content: data.content, createdVia: data.createdVia });
      isi.push(row);
      return Promise.resolve(row);
    },
    updateOwned: (_userId, id, patch) => {
      const row = isi.find((r) => r.id === id);
      if (row === undefined) return Promise.resolve(null);
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.content !== undefined) row.content = patch.content;
      return Promise.resolve(row);
    },
    deleteOwned: (_userId, id) => {
      const i = isi.findIndex((r) => r.id === id);
      if (i === -1) return Promise.resolve(false);
      isi.splice(i, 1);
      return Promise.resolve(true);
    },
  };
}

const service = (repo: ResumesRepository, maksPerPengguna = 5) =>
  createResumesService({ repo, maksPerPengguna });

async function galat(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("seharusnya melempar AppError");
}

describe("batas CV per pengguna (AC-3)", () => {
  it("menolak pembuatan ke-6 saat batasnya 5", async () => {
    const repo = repoPalsu(Array.from({ length: 5 }, (_, i) => baris({ id: `id-${String(i)}` })));
    const err = await galat(() => service(repo).create(AKTOR, { title: "CV Keenam", content: ISI_KOSONG }));
    expect(err.code).toBe("BATAS_CV_TERCAPAI");
    expect(err.status).toBe(409);
  });

  it("menyebutkan ANGKA batasnya di pesan", async () => {
    // "Sudah mencapai batas" tanpa menyebut batasnya memaksa pengguna menghitung
    // sendiri berapa yang harus ia hapus.
    const repo = repoPalsu([baris(), baris({ id: "b" })]);
    const err = await galat(() => service(repo, 2).create(AKTOR, { title: "CV", content: ISI_KOSONG }));
    expect(err.message).toContain("2");
  });

  it("batas datang dari config, bukan angka tetap di service", async () => {
    // Angka 5 di dokumen phase adalah BAWAAN, bukan aturan yang dipanggang.
    const repo = repoPalsu([baris()]);
    await expect(
      service(repo, 1).create(AKTOR, { title: "CV Kedua", content: ISI_KOSONG }),
    ).rejects.toThrow(AppError);

    const longgar = repoPalsu([baris()]);
    await expect(
      service(longgar, 9).create(AKTOR, { title: "CV Kedua", content: ISI_KOSONG }),
    ).resolves.toMatchObject({ title: "CV Kedua" });
  });

  it("batasnya diteruskan apa adanya ke repository", async () => {
    // Penegakannya ada DI DALAM transaksi repository (anti balapan klik ganda);
    // yang menjadi tanggung jawab service hanyalah menyerahkan angkanya.
    let terlihat = -1;
    const repo = repoPalsu();
    const asli = repo.createIfUnderLimit.bind(repo);
    repo.createIfUnderLimit = (userId, id, data, maks) => {
      terlihat = maks;
      return asli(userId, id, data, maks);
    };
    await service(repo, 7).create(AKTOR, { title: "CV", content: ISI_KOSONG });
    expect(terlihat).toBe(7);
  });
});

describe("createdVia ditentukan jalur, bukan klien (AC-5)", () => {
  it("bawaannya manual", async () => {
    const repo = repoPalsu();
    const hasil = await service(repo).create(AKTOR, { title: "CV Manual", content: ISI_KOSONG });
    expect(hasil.createdVia).toBe("manual");
  });

  it("jalur AI memanggil service yang SAMA dengan nilai berbeda", async () => {
    // Inilah yang membuat PR-066 tidak perlu service kedua — dan karena itu
    // tidak bisa punya batas CV, kontrak isi, atau pemetaan baris yang berbeda.
    const repo = repoPalsu();
    const hasil = await service(repo).create(AKTOR, { title: "CV AI", content: ISI_KOSONG }, "ai_chat");
    expect(hasil.createdVia).toBe("ai_chat");
  });
});

describe("404 seragam: tidak ada dan bukan milikmu dijawab sama", () => {
  it.each(["get", "update", "remove"] as const)("%s pada id yang tidak ada", async (operasi) => {
    const repo = repoPalsu();
    const svc = service(repo);
    const jalan = {
      get: () => svc.get(AKTOR, "018f4c1e-0000-7000-8000-0000000000ff"),
      update: () => svc.update(AKTOR, "018f4c1e-0000-7000-8000-0000000000ff", { title: "X" }),
      remove: () => svc.remove(AKTOR, "018f4c1e-0000-7000-8000-0000000000ff"),
    };
    const err = await galat(jalan[operasi]);
    expect(err.code).toBe("CV_TIDAK_DITEMUKAN");
    expect(err.status).toBe(404);
  });
});

describe("CV yang masih dipakai lamaran", () => {
  it("penolakan FK diterjemahkan menjadi 409, bukan dibiarkan menjadi 500", async () => {
    // Penolakannya datang dari `applications.resume_id` (onDelete NoAction).
    // Tanpa terjemahan ini, aturan yang BENAR sampai ke pengguna sebagai
    // "terjadi kesalahan pada server" tanpa satu pun petunjuk.
    const repo = repoPalsu([baris()]);
    repo.deleteOwned = () => Promise.reject(new CvDipakaiLamaranError());
    const err = await galat(() => service(repo).remove(AKTOR, baris().id));
    expect(err.code).toBe("CV_DIPAKAI_LAMARAN");
    expect(err.status).toBe(409);
  });

  it("galat lain TIDAK ikut tertelan", async () => {
    const repo = repoPalsu([baris()]);
    repo.deleteOwned = () => Promise.reject(new Error("koneksi putus"));
    await expect(service(repo).remove(AKTOR, baris().id)).rejects.toThrow("koneksi putus");
  });
});

describe("pemetaan baris → kontrak API", () => {
  it("daftar TIDAK membawa isi CV", async () => {
    const hasil = await service(repoPalsu([baris()])).list(AKTOR);
    expect(hasil[0]).not.toHaveProperty("content");
    expect(hasil[0]).toMatchObject({ id: baris().id, title: "CV Utama", pdfUrl: null });
  });

  it("stempel waktu keluar sebagai ISO 8601", async () => {
    const hasil = await service(repoPalsu([baris()])).get(AKTOR, baris().id);
    expect(hasil.createdAt).toBe("2026-09-01T00:00:00.000Z");
    expect(hasil.updatedAt).toBe("2026-09-02T00:00:00.000Z");
  });

  it("tidak membocorkan kolom di luar kontrak", async () => {
    const hasil = await service(repoPalsu([baris()])).get(AKTOR, baris().id);
    // `userId` tidak pernah punya jalan keluar: pemetaannya eksplisit, bukan
    // penyebaran `...row`.
    expect(Object.keys(hasil).sort()).toEqual([
      "content",
      "createdAt",
      "createdVia",
      "id",
      "pdfUrl",
      "title",
      "updatedAt",
    ]);
  });
});

describe("kunci antre pembuatan CV", () => {
  // Fungsi ini adalah SATU-SATUNYA bagian `createIfUnderLimit` yang tidak butuh
  // database untuk diuji — nilainya dihitung di JavaScript justru supaya begitu.
  // Perilaku penguncinya sendiri (menunggu, bukan membatalkan) hanya bisa
  // dibuktikan terhadap PostgreSQL sungguhan; lihat `resumes-db.test.ts`.
  const BATAS_INT8 = 2n ** 63n;

  it("stabil: userId yang sama selalu menghasilkan kunci yang sama", () => {
    // Kunci yang berubah antar-permintaan bukan kunci: dua POST dari pengguna
    // yang sama akan menunggu di dua antrean berbeda dan lewat berbarengan.
    expect(kunciAntreCv(AKTOR.userId)).toBe(kunciAntreCv(AKTOR.userId));
  });

  it("berbeda untuk userId yang berbeda", () => {
    const lain = "018f4c1e-0000-7000-8000-00000000bbbb";
    expect(kunciAntreCv(AKTOR.userId)).not.toBe(kunciAntreCv(lain));
  });

  it("selalu muat di jangkauan bigint PostgreSQL, termasuk yang berhash besar", () => {
    // `pg_advisory_xact_lock` menerima int8 BERTANDA. Membaca hash tanpa tanda
    // akan melampaui jangkauannya untuk separuh nilai yang mungkin — dan
    // penolakannya baru muncul di produksi, pada pengguna yang kebetulan
    // idnya berhash besar.
    for (let i = 0; i < 500; i += 1) {
      const kunci = kunciAntreCv(`018f4c1e-0000-7000-8000-${String(i).padStart(12, "0")}`);
      expect(kunci).toBeGreaterThanOrEqual(-BATAS_INT8);
      expect(kunci).toBeLessThan(BATAS_INT8);
    }
  });

  it("menghasilkan nilai negatif maupun positif — hash memakai seluruh jangkauan", () => {
    const kunci = Array.from({ length: 200 }, (_, i) => kunciAntreCv(`pengguna-${String(i)}`));
    expect(kunci.some((k) => k < 0n)).toBe(true);
    expect(kunci.some((k) => k > 0n)).toBe(true);
  });
});
