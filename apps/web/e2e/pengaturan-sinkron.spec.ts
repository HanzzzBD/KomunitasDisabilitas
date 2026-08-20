// Sinkron preferensi lintas perangkat (PR-036) — AC-1.
//
// DUA KONTEKS PERAMBAN, bukan dua tab. Konteks Playwright punya cookie,
// `localStorage`, dan cache sendiri-sendiri; yang dibagi hanyalah keadaan di
// sisi server (`buatAkunPalsu`). Itulah definisi "perangkat lain" yang bisa
// dibuktikan tanpa dua mesin sungguhan — dan dua tab TIDAK bisa membuktikannya,
// sebab keduanya membaca `localStorage` yang sama dan akan lulus meski tidak
// ada satu pun byte yang pernah menyeberangi jaringan.
//
// PERMINTAANNYA IKUT DICATAT. AC-nya menuntut "network calls logged": tanpa itu
// test ini masih akan hijau bila nilainya kebetulan sampai lewat jalur lain.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { buatAkunPalsu } from "./preferensi-akun.js";

const PANEL = "/pengaturan/aksesibilitas";

async function bukaPanel(page: Page): Promise<void> {
  await page.goto(PANEL);
  await page.waitForSelector("h1");
  await expect(page.getByRole("heading", { name: "Aksesibilitas", level: 2 })).toBeVisible();
}

const kontras = (page: Page) => page.getByRole("checkbox", { name: "Kontras tinggi" });

test("perangkat kedua membuka panel dengan preferensi yang disimpan perangkat pertama", async ({
  browser,
}) => {
  const akun = buatAkunPalsu();

  const konteksA: BrowserContext = await browser.newContext();
  const konteksB: BrowserContext = await browser.newContext();

  try {
    // --- Perangkat A: menyalakan kontras tinggi ---
    const a = await konteksA.newPage();
    await akun.pasang(a);

    const terkirim: { method: string; body: unknown }[] = [];
    a.on("request", (r) => {
      if (r.url().includes("/me/accessibility")) {
        terkirim.push({ method: r.method(), body: r.postDataJSON() as unknown });
      }
    });

    await bukaPanel(a);
    await expect(kontras(a)).not.toBeChecked();
    await kontras(a).click();

    // Menunggu JAWABANNYA, bukan sekadar klik: sampai server membalas, "akun"
    // belum berubah — dan perangkat kedua yang dibuka lebih cepat akan membaca
    // keadaan lama lalu gagal karena perlombaan, bukan karena cacat.
    await expect(a.getByText("Pilihan Anda sudah tersimpan ke akun.")).toBeVisible();
    expect(akun.nilai().highContrast).toBe(true);

    // Yang berangkat memang PUT berisi field itu — bukan efek samping lain.
    expect(terkirim.filter((p) => p.method === "PUT")).toEqual([
      { method: "PUT", body: { highContrast: true } },
    ]);

    // --- Perangkat B: akun yang sama, penyimpanan lokal yang berbeda ---
    const b = await konteksB.newPage();
    await akun.pasang(b);

    const diterima: string[] = [];
    b.on("request", (r) => {
      if (r.url().includes("/me/accessibility")) diterima.push(r.method());
    });

    await bukaPanel(b);

    await expect(kontras(b)).toBeChecked();
    // Token `<html>` ikut diperiksa: sakelar yang tercentang tanpa token berarti
    // panelnya jujur sementara seluruh sisa aplikasi tidak ikut berubah.
    await expect(b.locator("html")).toHaveAttribute("data-contrast", "high");
    expect(diterima, "perangkat kedua tidak pernah menanyakan preferensi akun").toContain("GET");
  } finally {
    await konteksA.close();
    await konteksB.close();
  }
});

test("perubahan di perangkat kedua kembali terlihat di akun", async ({ browser }) => {
  // Arah sebaliknya, dan ia bukan pengulangan: sinkron satu arah lulus test di
  // atas dengan mulus. Yang membedakannya adalah perangkat yang MEMULAI dengan
  // nilai bukan-bawaan lalu mematikannya — jalur "kembali ke tidak" yang paling
  // mudah hilang bila kode hanya mengirim yang menyala.
  const akun = buatAkunPalsu({ highContrast: true });
  const konteks = await browser.newContext();

  try {
    const page = await konteks.newPage();
    await akun.pasang(page);
    await bukaPanel(page);

    await expect(kontras(page)).toBeChecked();
    await kontras(page).click();

    await expect(page.getByText("Pilihan Anda sudah tersimpan ke akun.")).toBeVisible();
    expect(akun.nilai().highContrast).toBe(false);
  } finally {
    await konteks.close();
  }
});
