// Wizard onboarding aksesibilitas (PR-035) — AC ticket nomor 1, 2, dan 5.
//
// TIGA HAL YANG HANYA BISA DIJAMIN DI SINI, dan bukan di lapis mana pun lain:
//
//   1. LALU LINTAS JARINGAN. AC 5 ("melewati consent = tidak ada data
//      disabilitas tersimpan — verifikasi network") adalah klaim NEGATIF: yang
//      harus dibuktikan adalah ketiadaan permintaan. Ia hanya bisa dibuktikan
//      dengan mencegat setiap permintaan dan memeriksa daftarnya — bukan dengan
//      membaca kode.
//   2. PRATINJAU LANGSUNG. AC 2 menuntut perubahan terlihat SEBELUM disimpan.
//      Yang diperiksa karena itu adalah `<html>` pada saat belum ada satu pun
//      permintaan terkirim.
//   3. PENULISAN GANDA saat selesai: store lokal (sudah tertulis lewat
//      pratinjau) DAN `PUT /me/accessibility` dengan badan yang benar.
//
// Yang TIDAK bisa dijamin berkas ini: kontras warna dan ukuran target sentuh
// (butuh kaskade CSS sungguhan — `e2e/aksesibilitas.spec.ts`), dan urutan
// pembacaan NVDA (butuh telinga manusia — checklist manual PR ini).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { createA11yStore, type A11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/schemas";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import { kunciPenanda } from "../src/features/onboarding/identitas.js";

const SUB = "01912345-89ab-7def-8123-456789abcdef";

function tokenUji(sub: string = SUB): string {
  const b64 = btoa(JSON.stringify({ sub, role: "seeker", ver: 1 }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `header.${b64}.tanda`;
}

/** Permintaan yang benar-benar sampai ke jaringan — inti AC 5. */
interface Jejak {
  path: string;
  method: string;
  body: unknown;
}

type Hasil = "ok" | "gagal" | "menggantung";

function klienPalsu(jejak: Jejak[], hasil: Hasil): ApiClient {
  return {
    request: (path: string, opsi?: { method?: string; body?: unknown }) => {
      // Pemulihan sesi dibiarkan menggantung: statusnya sudah kita pasang
      // sendiri, dan jawaban apa pun akan menimpanya.
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;

      jejak.push({ path, method: opsi?.method ?? "GET", body: opsi?.body });

      if (path === "/me/accessibility") {
        if (hasil === "menggantung") return new Promise(() => {}) as Promise<never>;
        if (hasil === "gagal") {
          return Promise.reject(
            new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
          ) as Promise<never>;
        }
        return Promise.resolve({
          data: { ...ACCESSIBILITY_DEFAULTS, ...(opsi?.body as object) },
        }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function memori(): PenyimpananA11y {
  const isi: Record<string, string> = {};
  return {
    getItem: (k) => isi[k] ?? null,
    setItem: (k, v) => {
      isi[k] = v;
    },
    removeItem: (k) => {
      delete isi[k];
    },
  };
}

interface OpsiRender {
  hasil?: Hasil;
  /**
   * Simpan preferensi ke `localStorage` SUNGGUHAN, bukan ke memori.
   *
   * Dipakai test kebocoran data disabilitas: pemeriksaannya menyapu SELURUH
   * `localStorage`, dan store yang menulis ke memori akan membuat sapuan itu
   * lulus tanpa pernah melihat satu pun preferensi.
   */
  penyimpananNyata?: boolean;
  /**
   * Id pengguna dipakai token uji. Bawaannya `SUB` (dipakai hampir semua test
   * di berkas ini). Blok "QC-1" di bawah memakai id KHUSUS per test supaya
   * cadangan sesi `penandaSesiBawaan` (`identitas.ts`) milik satu test tidak
   * bocor ke test lain yang kebetulan memakai `SUB` yang sama.
   */
  sub?: string;
}

function renderWizard({ hasil = "ok", penyimpananNyata = false, sub = SUB }: OpsiRender = {}) {
  useStoreSesi.getState().masuk(tokenUji(sub));

  const a11y: A11yStore = createA11yStore({
    storage: penyimpananNyata ? globalThis.localStorage : memori(),
  });
  const jejak: Jejak[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/onboarding"] });

  const hasilRender = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienPalsu(jejak, hasil)}
      a11yStore={a11y}
    >
      <RouterProvider router={router} />
    </Providers>,
  );

  return { ...hasilRender, jejak, router, a11y };
}

const tombol = (nama: string) => screen.getByRole("button", { name: nama });

/** Menempuh wizard dari langkah 1 sampai langkah ringkasan. */
async function sampaiRingkasan() {
  await userEvent.click(tombol("Lanjut"));
  await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
  await userEvent.click(tombol("Lanjut"));
  await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
  await userEvent.click(tombol("Lanjut"));
  await screen.findByRole("heading", { name: "Ringkasan", level: 2 });
}

async function pilihRagam(...nama: string[]) {
  for (const n of nama) {
    await userEvent.click(screen.getByRole("checkbox", { name: n }));
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  useStoreSesi.setState({ status: "memulihkan" });
  globalThis.localStorage.clear();
  const el = document.documentElement;
  el.removeAttribute("style");
  for (const a of ["data-contrast", "data-motion", "data-lang-mode"]) el.removeAttribute(a);
});

describe("sakelar operasional (Rollback Strategy)", () => {
  it("mati → alamat `/onboarding` mengalihkan pulang tanpa memasang wizard", async () => {
    vi.stubEnv("VITE_ONBOARDING_WIZARD_ENABLED", "false");
    const { router } = renderWizard();

    await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByRole("heading", { name: "Atur kenyamanan Anda" })).toBeNull();
  });
});

describe("AC 1 — bisa diselesaikan DAN bisa dilewati seluruhnya", () => {
  it("empat langkah, ditempuh sampai ringkasan tanpa mengisi apa pun", async () => {
    const { jejak } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await sampaiRingkasan();

    // Tidak satu pun permintaan terkirim hanya karena wizard ditelusuri.
    expect(jejak).toEqual([]);
  });

  it("tombol lewati hadir di SETIAP langkah", async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    for (const judul of ["Ragam disabilitas", "Persetujuan", "Preferensi tampilan"]) {
      expect(
        screen.queryByRole("button", { name: "Lewati pengaturan ini" }),
        `tombol lewati hilang di langkah "${judul}"`,
      ).not.toBeNull();
      await userEvent.click(tombol("Lanjut"));
    }
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });
    expect(screen.queryByRole("button", { name: "Lewati pengaturan ini" })).not.toBeNull();
  });

  it("melewati dari langkah PERTAMA: penanda ditulis, tidak ada PUT sama sekali", async () => {
    const { jejak, router } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await userEvent.click(tombol("Lewati pengaturan ini"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(jejak, "melewati wizard tetap mengirim sesuatu").toEqual([]);
    expect(globalThis.localStorage.getItem(kunciPenanda(SUB))).toBe("1");
  });

  it("keluarnya `replace` — tombol kembali tidak mengembalikan ke wizard", async () => {
    const { router } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await userEvent.click(tombol("Lewati pengaturan ini"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("langkah pertama tidak bisa mundur, langkah terakhir tidak bisa maju", async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    expect(screen.queryByRole("button", { name: "Kembali" })).toBeNull();

    await sampaiRingkasan();
    expect(screen.queryByRole("button", { name: "Lanjut" })).toBeNull();
  });
});

describe("AC 2 — kemajuan diumumkan, bukan hanya diwarnai", () => {
  it('langkah yang sedang dibuka ditandai `aria-current="step"`', async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    const daftar = screen.getAllByRole("listitem");
    const aktif = daftar.filter((li) => li.getAttribute("aria-current") === "step");
    expect(aktif, "harus tepat SATU langkah yang ditandai sedang dibuka").toHaveLength(1);
    expect(aktif[0]).toHaveTextContent("Ragam disabilitas");
  });

  it("live region menyebut nomor langkah, dan ikut berganti", async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    const wilayah = screen.getByRole("status");
    expect(wilayah).toHaveTextContent("Langkah 1 dari 4: Ragam disabilitas");

    await userEvent.click(tombol("Lanjut"));

    await waitFor(() => {
      expect(wilayah).toHaveTextContent("Langkah 2 dari 4: Persetujuan");
    });
  });

  it("fokus berpindah ke judul langkah baru, bukan tertinggal di tombol", async () => {
    // Tanpa ini, Tab berikutnya melanjutkan dari kendali di BAWAH isi langkah
    // baru — pengguna keyboard melewati seluruh isinya tanpa tahu ia ada.
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await userEvent.click(tombol("Lanjut"));

    const judul = await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await waitFor(() => {
      expect(judul).toHaveFocus();
    });
  });
});

describe("AC 5 — data ragam disabilitas TIDAK PERNAH meninggalkan perangkat", () => {
  it("consent DITOLAK: tidak ada permintaan yang membawa data disabilitas", async () => {
    const { jejak } = renderWizard({ penyimpananNyata: true });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await pilihRagam("Tuli atau kurang dengar", "Netra atau penglihatan terbatas");
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    // Kotak persetujuan TIDAK disentuh — inilah jalur "melewati consent".
    expect(
      screen.getByRole("checkbox", {
        name: "Saya mengizinkan Nawasena memakai data ragam disabilitas saya",
      }),
    ).not.toBeChecked();

    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });
    await userEvent.click(tombol("Simpan dan mulai"));

    await waitFor(() => {
      expect(jejak.length).toBeGreaterThan(0);
    });
    // Satu-satunya alamat yang pernah dihubungi adalah endpoint preferensi.
    expect(new Set(jejak.map((j) => j.path))).toEqual(new Set(["/me/accessibility"]));
    for (const j of jejak) {
      expect(JSON.stringify(j.body)).not.toMatch(/tuli|netra|daksa|autisme|disabilit/i);
    }
  });

  it("consent DIBERIKAN: hasilnya sama persis — tetap tidak ada yang dikirim", async () => {
    // Kasus yang lebih sulit, dan justru ini yang membuktikan janjinya: pengguna
    // MEMILIH dua ragam DAN memberi izin, dan datanya tetap tidak ke mana-mana.
    // Endpoint penyimpanannya (PR-037) belum ada; memanggil yang belum ada
    // bukan "persiapan" melainkan cacat.
    const { jejak } = renderWizard({ penyimpananNyata: true });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await pilihRagam("Tuli atau kurang dengar", "Autisme atau disabilitas kognitif");
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Saya mengizinkan Nawasena memakai data ragam disabilitas saya",
      }),
    );
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });
    await userEvent.click(tombol("Simpan dan mulai"));

    await waitFor(() => {
      expect(jejak.length).toBeGreaterThan(0);
    });
    expect(new Set(jejak.map((j) => j.path))).toEqual(new Set(["/me/accessibility"]));
    for (const j of jejak) {
      expect(JSON.stringify(j.body)).not.toMatch(/tuli|netra|daksa|autisme|disabilit/i);
    }
  });

  it("tidak tertulis ke store preferensi maupun ke penyimpanan mana pun", async () => {
    const { a11y } = renderWizard({ penyimpananNyata: true });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await pilihRagam("Tuli atau kurang dengar", "Netra atau penglihatan terbatas");
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Saya mengizinkan Nawasena memakai data ragam disabilitas saya",
      }),
    );
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    // Satu preferensi disentuh, supaya store BENAR-BENAR menulis ke penyimpanan
    // — tanpa itu sapuan di bawah lulus atas penyimpanan yang masih kosong.
    await userEvent.click(screen.getByRole("checkbox", { name: "Kontras tinggi" }));

    expect(JSON.stringify(a11y.getState().pilihanPengguna)).not.toMatch(/tuli|netra/i);

    // SAPUAN SELURUH `localStorage`, bukan hanya kunci yang kita duga. Kebocoran
    // yang menulis ke kunci lain justru yang paling mungkin lolos.
    const isi = Object.keys(globalThis.localStorage).map(
      (k) => `${k}=${globalThis.localStorage.getItem(k) ?? ""}`,
    );
    expect(isi.length, "penyimpanan kosong — sapuan ini lulus secara hampa").toBeGreaterThan(0);
    expect(isi.join("\n")).not.toMatch(/tuli|netra|daksa|autisme/i);
  });

  it("dilewati LANGSUNG dari langkah 1 SESUDAH memilih ragam, sebelum consent tercapai", async () => {
    // Edge case dari rencana implementasi: menekan "Lewati" tanpa pernah
    // mencapai langkah persetujuan tidak boleh menuntut keadaan consent
    // (`setuju`) apa pun — dan pilihan ragam yang sudah ditandai tetap tidak
    // boleh menyeberang ke jaringan atau penyimpanan mana pun.
    const { jejak, router } = renderWizard({ penyimpananNyata: true });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    await pilihRagam("Tuli atau kurang dengar", "Daksa atau keterbatasan gerak");
    await userEvent.click(tombol("Lewati pengaturan ini"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(jejak, "melewati sesudah memilih ragam tetap mengirim sesuatu").toEqual([]);
    expect(globalThis.localStorage.getItem(kunciPenanda(SUB))).toBe("1");

    const isi = Object.keys(globalThis.localStorage).map(
      (k) => `${k}=${globalThis.localStorage.getItem(k) ?? ""}`,
    );
    expect(isi.join("\n")).not.toMatch(/tuli|daksa/i);
  });
});

describe("AC 2 — pratinjau langsung, sebelum apa pun disimpan", () => {
  it("mencentang kontras langsung mengubah `<html>` — tanpa satu pun permintaan", async () => {
    const { jejak } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });

    expect(document.documentElement.getAttribute("data-contrast")).toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: "Kontras tinggi" }));

    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
    expect(jejak, "pratinjau menunggu jaringan — ia bukan pratinjau").toEqual([]);
  });

  it("keenam saklar dan ukuran teks semuanya menggerakkan store", async () => {
    // KETUJUH field, bukan enam: SDD §4.3 menyebut enam, tabelnya punya tujuh.
    const { a11y } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await sampaiRingkasan();
    await userEvent.click(tombol("Kembali"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });

    // "Teks sederhana" DITEKAN TERAKHIR, dan itu bukan selera urutan:
    // menyalakannya mengganti seluruh teks layar ke varian sederhana seketika
    // (itulah pratinjaunya), sehingga label kotak-kotak sesudahnya berubah nama
    // di tengah perulangan ini.
    for (const nama of [
      "Kontras tinggi",
      "Kurangi animasi",
      "Tombol lebih besar",
      "Utamakan konten BISINDO",
      "Saya memakai pembaca layar",
      "Teks sederhana",
    ]) {
      await userEvent.click(screen.getByRole("checkbox", { name: nama }));
    }

    expect(a11y.getState().pilihanPengguna).toEqual({
      highContrast: true,
      reduceMotion: true,
      simpleLanguage: true,
      largeTouchTargets: true,
      prefersSignLanguage: true,
      screenReaderHint: true,
    });
    // Ukuran teks — kendali ketujuh, dan satu-satunya yang bukan saklar.
    expect(screen.getByRole("slider")).toHaveValue("100");
  });

  it("teks sederhana yang dinyalakan di sini langsung mengganti bahasa layar", async () => {
    // Pratinjau yang paling terasa: pengguna mencentang satu kotak dan seluruh
    // kalimat di sekelilingnya berganti — termasuk kalimat di wizard ini.
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });

    await userEvent.click(screen.getByRole("checkbox", { name: "Teks sederhana" }));

    expect(
      await screen.findByRole("heading", { name: "Tampilan aplikasi", level: 2 }),
    ).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-lang-mode")).toBe("simple");
  });

  it("pilihan tetap terpasang saat permintaan simpan MASIH menggantung", async () => {
    // Yang dijamin: layar pengguna tidak menunggu jaringan. Diuji dengan
    // permintaan yang tidak pernah selesai — tanpa itu, keadaan "sedang
    // mengirim" berlalu terlalu cepat untuk diamati.
    const { jejak } = renderWizard({ hasil: "menggantung" });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(screen.getByRole("checkbox", { name: "Kontras tinggi" }));
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });

    await userEvent.click(tombol("Simpan dan mulai"));

    await waitFor(() => {
      expect(jejak).toHaveLength(1);
    });
    // Permintaannya masih di udara, dan layarnya sudah lama benar.
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
    expect(screen.getByRole("button", { name: "Menyimpan pilihan Anda…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("skala teks di titik EKSTREM lalu wizard DILEWATI: pratinjau tetap berlaku, tidak dikembalikan", async () => {
    // Edge case dari rencana implementasi: "Lewati" hanya berarti tidak ada
    // PUT — bukan pembatalan perubahan pratinjau yang sudah ditulis langsung
    // ke store selama sesi ini. Mengembalikannya otomatis pada skip adalah
    // cacat yang secara sengaja TIDAK diimplementasikan (lihat komentar
    // `langkah-preferensi.tsx`), dan test ini menjaga keputusan itu.
    const { jejak, a11y, router } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });

    fireEvent.change(screen.getByRole("slider"), { target: { value: "200" } });
    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("2");

    await userEvent.click(tombol("Lewati pengaturan ini"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    // Tidak ada PUT — "Lewati" tetap berarti tidak ada penyimpanan ke akun.
    expect(jejak).toEqual([]);
    // Tetapi pratinjaunya TIDAK dikembalikan — store dan `<html>` masih
    // memegang nilai ekstrem yang sempat dipilih.
    expect(a11y.getState().pilihanPengguna.textScale).toBe(200);
    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("2");
  });
});

describe("penulisan ganda saat selesai", () => {
  it("mengirim PUT berisi TEPAT tujuh field dengan nilai yang dipilih", async () => {
    const { jejak, a11y, router } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(screen.getByRole("checkbox", { name: "Kontras tinggi" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Tombol lebih besar" }));
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });

    await userEvent.click(tombol("Simpan dan mulai"));

    await waitFor(() => {
      expect(jejak).toHaveLength(1);
    });
    expect(jejak[0]?.method).toBe("PUT");
    expect(jejak[0]?.path).toBe("/me/accessibility");
    expect(jejak[0]?.body).toEqual({
      ...ACCESSIBILITY_DEFAULTS,
      highContrast: true,
      largeTouchTargets: true,
    });

    // Sisi lokal: sudah tertulis sejak pratinjau, bukan sebagai akibat simpan.
    expect(a11y.getState().pilihanPengguna).toEqual({
      highContrast: true,
      largeTouchTargets: true,
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(globalThis.localStorage.getItem(kunciPenanda(SUB))).toBe("1");
  });

  it("PUT yang GAGAL tidak membatalkan pilihan lokal, dan penandanya tetap ditulis", async () => {
    // Keputusan yang diuji, bukan sekadar dicatat: preferensinya sudah berlaku
    // di perangkat ini dan TETAP berlaku. Mengembalikannya demi "konsisten
    // dengan server" berarti layar pengguna berubah sendiri karena jaringannya
    // buruk.
    const { a11y } = renderWizard({ hasil: "gagal" });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(screen.getByRole("checkbox", { name: "Kontras tinggi" }));
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });

    await userEvent.click(tombol("Simpan dan mulai"));

    const kabar = await screen.findByRole("alert");
    expect(kabar).toHaveTextContent(/belum bisa dikirim ke akun Anda/i);
    // Kalimat yang menjawab "lalu pilihan saya bagaimana".
    expect(kabar).toHaveTextContent(/tetap berlaku di perangkat ini/i);

    expect(a11y.getState().pilihanPengguna).toEqual({ highContrast: true });
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
    expect(globalThis.localStorage.getItem(kunciPenanda(SUB))).toBe("1");
  });

  it("sesudah gagal, jalan keluarnya tetap ada — dan tidak menyuruh mencoba lagi", async () => {
    // Pengguna yang melihat galat lalu menemukan tombol "Simpan" yang sama akan
    // mengira ia harus mengulang sampai berhasil. Penandanya sudah ditulis;
    // tidak ada yang perlu diulang.
    const { router } = renderWizard({ hasil: "gagal" });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await sampaiRingkasan();
    await userEvent.click(tombol("Simpan dan mulai"));
    await screen.findByRole("alert");

    expect(screen.queryByRole("button", { name: "Simpan dan mulai" })).toBeNull();
    await userEvent.click(tombol("Lanjutkan ke beranda"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });
});

describe("ringkasan", () => {
  it("mengulang pilihan ragam berikut penegasan bahwa ia tidak dikirim", async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await pilihRagam("Tuli atau kurang dengar");
    await sampaiRingkasan();

    expect(screen.getByText("Tuli atau kurang dengar")).toBeInTheDocument();
    expect(screen.getByText(/tidak ikut disimpan ke akun Anda/i)).toBeInTheDocument();
  });

  it("menyebut keadaan tiap preferensi dengan KATA, bukan hanya warna", async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(screen.getByRole("checkbox", { name: "Kontras tinggi" }));
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });

    // Kata, bukan ikon centang/silang: ikon tanpa teks tidak punya nama yang
    // bisa dibacakan, dan warna sendirian melanggar WCAG 1.4.1.
    expect(screen.getAllByRole("term").length).toBe(screen.getAllByRole("definition").length);
    expect(screen.getAllByText("Aktif").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tidak aktif").length).toBeGreaterThan(0);
  });

  it("persetujuan yang DICABUT sesudah diberikan tercermin apa adanya", async () => {
    // Tidak boleh ada penanda "tadi sudah setuju" yang selamat dari pencabutan.
    renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });

    const kotak = screen.getByRole("checkbox", {
      name: "Saya mengizinkan Nawasena memakai data ragam disabilitas saya",
    });
    await userEvent.click(kotak);
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(tombol("Kembali"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Saya mengizinkan Nawasena memakai data ragam disabilitas saya",
      }),
    );

    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });

    expect(screen.getByText(/tidak memberi izin/i)).toBeInTheDocument();
  });
});

describe("aksesibilitas struktural tiap langkah", () => {
  it("lolos axe di keempat langkah", async () => {
    const { container } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await harusLolosAksesibilitas(container);

    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Persetujuan", level: 2 });
    await harusLolosAksesibilitas(container);

    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Preferensi tampilan", level: 2 });
    await harusLolosAksesibilitas(container);

    await userEvent.click(tombol("Lanjut"));
    await screen.findByRole("heading", { name: "Ringkasan", level: 2 });
    await harusLolosAksesibilitas(container);
  });

  it("seluruh alur bisa ditempuh tanpa satu pun klik", async () => {
    // AC 3 (keyboard-only) untuk bagian yang bisa dijamin mesin. Urutan Tab
    // penuhnya ada di dokumen tab-order; yang diperiksa di sini adalah bahwa
    // setiap kendali benar-benar bisa diaktifkan dari papan ketik.
    const { jejak, router } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });

    screen.getByRole("checkbox", { name: "Tuli atau kurang dengar" }).focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "Tuli atau kurang dengar" })).toBeChecked();

    for (const judul of ["Persetujuan", "Preferensi tampilan", "Ringkasan"]) {
      tombol("Lanjut").focus();
      await userEvent.keyboard("{Enter}");
      await screen.findByRole("heading", { name: judul, level: 2 });
    }

    const simpan = tombol("Simpan dan mulai");
    simpan.focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(jejak).toHaveLength(1);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });
});

describe("penjaga tidak lulus secara hampa", () => {
  it("klien palsu benar-benar merekam permintaan", async () => {
    const { jejak } = renderWizard();
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await sampaiRingkasan();
    await userEvent.click(tombol("Simpan dan mulai"));

    await waitFor(() => {
      expect(jejak.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// QC-1 — penyimpanan yang gagal TIDAK BOLEH mengunci pengguna di wizard.
//
// LEVEL SISTEM DENGAN SENGAJA, bukan `identitas.ts` sendirian: bug aslinya
// tidak ada di fungsi pembaca/penulis penanda (keduanya sudah menelan galat
// dengan benar sejak sebelum QC-1) — bug-nya ada di INTERAKSI antara
// `Wizard.tutup()`/`selesaikan()` (yang memanggil `tandaiOnboardingSelesai`
// tanpa tahu apakah tulisannya berhasil) dan `TataLetak` (yang mengevaluasi
// ulang `sudahOnboarding` pada SETIAP pergantian lokasi). Test atas
// `identitas.ts` sendirian — lihat `onboarding-identitas.test.ts` — TERBUKTI
// tidak menangkap ini: ia berhenti di "tidak melempar", tanpa pernah bertanya
// apa yang terjadi sesudahnya di aplikasi sungguhan.
//
// DUA MODE KEGAGALAN, keduanya dipasang lewat `Storage.prototype`/`window`
// nyata — BUKAN lewat penyimpanan tiruan yang disuntik — karena `identitas.ts`
// memakai `globalThis.localStorage` langsung di jalur produksi (`bawaan()`),
// dan itulah yang harus rusak di sini:
//   1. `setItem` melempar — kuota penuh.
//   2. Properti `localStorage` ITU SENDIRI melempar saat diakses — mode privat
//      sebagian peramban (Chrome/Safari dengan situs diblokir).
//
// SETIAP TEST MEMAKAI `sub` UNIK (lihat `OpsiRender.sub`): cadangan sesi yang
// diperkenalkan perbaikan QC-1 hidup di memori modul `identitas.ts` sepanjang
// berkas test ini berjalan, dan id yang dipakai ulang antar test akan membuat
// satu test "meminjam" keberhasilan test lain tanpa sengaja.
describe("QC-1 — penyimpanan gagal tidak boleh mengunci pengguna di wizard", () => {
  // Dipulihkan SEBELUM `afterEach` global (yang memanggil
  // `globalThis.localStorage.clear()`) — hook di describe bersarang berjalan
  // lebih dulu daripada hook di scope luar. Tanpa urutan ini, `clear()` akan
  // dipanggil pada penyimpanan yang aksesnya masih dibuat melempar.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("`setItem` melempar (kuota penuh) + SELESAI: mendarat di beranda dan TETAP di sana", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Kuota penyimpanan penuh", "QuotaExceededError");
    });

    const { jejak, router } = renderWizard({ sub: "qc1-kuota-selesai" });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await sampaiRingkasan();
    await userEvent.click(tombol("Simpan dan mulai"));

    await waitFor(() => {
      expect(jejak).toHaveLength(1);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });

    // Bukti "tidak terkunci", bukan sekadar "lolos pada render pertama":
    // navigasi lanjutan ke alamat yang TIDAK dikecualikan
    // (`/pengaturan/aksesibilitas`) harus benar-benar sampai di sana. Sebelum
    // perbaikan QC-1, pergantian lokasi ini memicu `TataLetak` mengevaluasi
    // ulang `sudahOnboarding`, yang tetap menjawab "belum" karena `setItem`
    // melempar — hasilnya pengalihan balik ke `/onboarding`.
    await act(async () => {
      await router.navigate("/pengaturan/aksesibilitas");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/pengaturan/aksesibilitas");
    });
  });

  it("`setItem` melempar (kuota penuh) + LEWATI: mendarat di beranda dan TETAP di sana", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Kuota penyimpanan penuh", "QuotaExceededError");
    });

    const { jejak, router } = renderWizard({ sub: "qc1-kuota-lewati" });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lewati pengaturan ini"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(jejak, "melewati wizard tetap mengirim sesuatu").toEqual([]);

    await act(async () => {
      await router.navigate("/pengaturan/aksesibilitas");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/pengaturan/aksesibilitas");
    });
  });

  it("akses `localStorage` melempar (mode privat) + SELESAI: mendarat di beranda dan TETAP di sana", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Akses penyimpanan ditolak", "SecurityError");
    });

    const { jejak, router } = renderWizard({ sub: "qc1-diblokir-selesai" });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await sampaiRingkasan();
    await userEvent.click(tombol("Simpan dan mulai"));

    await waitFor(() => {
      expect(jejak).toHaveLength(1);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });

    await act(async () => {
      await router.navigate("/pengaturan/aksesibilitas");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/pengaturan/aksesibilitas");
    });
  });

  it("akses `localStorage` melempar (mode privat) + LEWATI: mendarat di beranda dan TETAP di sana", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Akses penyimpanan ditolak", "SecurityError");
    });

    const { jejak, router } = renderWizard({ sub: "qc1-diblokir-lewati" });
    await screen.findByRole("heading", { name: "Ragam disabilitas", level: 2 }, { timeout: 5000 });
    await userEvent.click(tombol("Lewati pengaturan ini"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(jejak, "melewati wizard tetap mengirim sesuatu").toEqual([]);

    await act(async () => {
      await router.navigate("/pengaturan/aksesibilitas");
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/pengaturan/aksesibilitas");
    });
  });
});
