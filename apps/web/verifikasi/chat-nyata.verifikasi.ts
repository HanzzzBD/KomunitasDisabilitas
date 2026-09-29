// Verifikasi AI CV Builder terhadap STACK NYATA + NVDA (PR-068c, U-28).
//
// Bukan test CI. Menuntut: Windows + NVDA terpasang; API (`pnpm --filter
// @nawasena/api dev`) dengan kunci AI sah, PostgreSQL & Redis hidup; web dev
// server (`pnpm --filter @nawasena/web dev`, port 5173, mem-proxy /api/v1).
// Token akses user uji dibaca dari berkas `VERIFIKASI_TOKEN_FILE` (JSON
// `{ token }`) — ditandatangani kunci server; SATU-SATUNYA yang dipalsukan
// adalah `/auth/refresh`, supaya halaman terlindungi menerima token itu.
//
// Yang diukur, per AC PR-068 / checklist `pr-068-nvda-checklist.md`:
//   A. NVDA mengucapkan "sedang mengetik" dan jawaban AI PER KALIMAT, tanpa
//      mengulang, dan TANPA ucapan perpindahan fokus sesudah pesan dikirim.
//   B. Slow 3G (throttling CDP): jawaban tetap sampai, fokus tetap di kotak ketik.
//   C. Putus di tengah (offline) → sambung ulang `/stream` + `Last-Event-Id`,
//      jawaban utuh, tanpa giliran/kalimat dobel.
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { nyalakanNvda, type SesiNvda } from "./nvda.js";

const TOKEN = (
  JSON.parse(readFileSync(process.env.VERIFIKASI_TOKEN_FILE ?? "", "utf8")) as { token: string }
).token;
const PAKAI_NVDA = process.env.VERIFIKASI_TANPA_NVDA !== "1";

let nvda: SesiNvda | null = null;
const laporan: Record<string, unknown> = {};

test.beforeAll(async () => {
  if (PAKAI_NVDA) nvda = await nyalakanNvda();
});

test.afterAll(() => {
  nvda?.hentikan();
  writeFileSync(
    process.env.VERIFIKASI_LAPORAN ?? "laporan-verifikasi.json",
    JSON.stringify(laporan, null, 2),
  );
});

/** Satu ucapan NVDA → teks yang diucapkan (tanpa perintah bahasa/callback). */
function teksUcapan(mentah: string): string {
  return [...mentah.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => m[1])
    .join(" ")
    .trim();
}

function kalimatDari(jawaban: string): string[] {
  return jawaban
    .split(/(?<=[.!?…])\s+/)
    .map((k) => k.replace(/\s+/g, " ").trim())
    .filter((k) => k !== "");
}

async function jumlahGiliran(page: Page): Promise<number> {
  return page
    .getByRole("list", { name: "Percakapan" })
    .locator(":scope > li:not([aria-hidden])")
    .count();
}

async function giliranTerakhir(page: Page): Promise<string> {
  return (
    await page
      .getByRole("list", { name: "Percakapan" })
      .locator(":scope > li:not([aria-hidden]) p:last-child")
      .last()
      .innerText()
  ).trim();
}

async function kirimDanTunggu(page: Page, pesan: string, sebelum: number): Promise<string> {
  const kotak = page.getByLabel("Jawaban Anda");
  await kotak.fill(pesan);
  await kotak.press("Control+Enter");
  await expect.poll(() => jumlahGiliran(page), { timeout: 90_000 }).toBe(sebelum + 2);
  return giliranTerakhir(page);
}

test("chat CV di stack nyata: NVDA, Slow 3G, putus-sambung", async ({ page, context }) => {
  test.setTimeout(300_000);
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { accessToken: TOKEN, expiresIn: 900 } }),
    }),
  );
  const permintaanStream: string[] = [];
  page.on("request", (r) => {
    if (/\/ai\/cv-chat\/[^/]+\/stream$/.test(new URL(r.url()).pathname)) {
      permintaanStream.push(r.headers()["last-event-id"] ?? "(tanpa)");
    }
  });

  await page.goto("/cv/chat");
  // User uji baru dialihkan ke onboarding — lewati lewat tombolnya sendiri
  // (jalur sah pengguna), lalu kembali ke halaman chat.
  const lewati = page.getByRole("button", { name: /^Lewati/ });
  const perluLewati = await lewati
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (perluLewati) {
    await lewati.first().click();
    await page.waitForTimeout(1_000);
    await page.goto("/cv/chat");
  }
  await page.bringToFront();
  await expect(page.getByRole("heading", { level: 1, name: "Buat CV lewat obrolan" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Jawaban Anda")).toBeVisible();
  await page.waitForTimeout(2_000);

  // --- A. Normal + NVDA -----------------------------------------------------
  const kotak = page.getByLabel("Jawaban Anda");
  await kotak.click();
  await page.waitForTimeout(1_500);
  const tandaA = nvda?.ucapan().length ?? 0;
  const n0 = await jumlahGiliran(page);
  const t0 = Date.now();
  const jawabanA = await kirimDanTunggu(
    page,
    "Saya kasir di Toko Roti Maju di Bandung dari 2022 sampai 2024.",
    n0,
  );
  laporan["A.detikSampaiJawabanTersimpan"] = (Date.now() - t0) / 1000;
  await page.waitForTimeout(4_000); // beri NVDA waktu menghabiskan antreannya
  laporan["A.fokusDiKotakKetik"] = await kotak.evaluate((el) => el === document.activeElement);
  laporan["A.jawaban"] = jawabanA;
  if (nvda !== null) {
    const ucapan = nvda
      .ucapan()
      .slice(tandaA)
      .map(teksUcapan)
      .filter((u) => u !== "");
    laporan["A.ucapanNvda"] = ucapan;
    const kalimat = kalimatDari(jawabanA);
    laporan["A.kalimatDiucapkan"] = kalimat.map((k) => ({
      kalimat: k,
      kali: ucapan.filter((u) => u.replace(/\s+/g, " ").includes(k)).length,
    }));
    laporan["A.mengetikDiucapkan"] = ucapan.some((u) => u.includes("Pewawancara sedang mengetik"));
    // Ucapan perpindahan fokus SESUDAH pesan dikirim (= sesudah ucapan kotak
    // ketik yang dipicu klik) berarti fokus dicuri. Yang sebelumnya adalah
    // akibat klik ke kotak ketik itu sendiri.
    const iKotak = ucapan.findIndex((u) => u.includes("Jawaban Anda edit"));
    laporan["A.ucapanPindahFokusSesudahKirim"] = ucapan
      .slice(iKotak + 1)
      .filter((u) => / button|document|window| edit/.test(u));
  }

  // --- B. Slow 3G -----------------------------------------------------------
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 2_000,
    downloadThroughput: ((500 * 1024) / 8) * 0.8,
    uploadThroughput: ((500 * 1024) / 8) * 0.8,
  });
  const n1 = await jumlahGiliran(page);
  const t1 = Date.now();
  const jawabanB = await kirimDanTunggu(
    page,
    "Tugas saya melayani pembeli dan menghitung uang di akhir hari.",
    n1,
  );
  laporan["B.detikSampaiJawabanTersimpan"] = (Date.now() - t1) / 1000;
  laporan["B.jawaban"] = jawabanB;
  laporan["B.fokusDiKotakKetik"] = await kotak.evaluate((el) => el === document.activeElement);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  // --- C. Putus di tengah ----------------------------------------------------
  const n2 = await jumlahGiliran(page);
  const tandaC = nvda?.ucapan().length ?? 0;
  // Putus DETERMINISTIK tetapi di atas server nyata: respons POST asli diambil
  // utuh (server menyelesaikan jawabannya), lalu browser hanya menerima DUA event
  // pertama — persis koneksi yang putus di tengah — sementara jaringan dimatikan
  // 2,5 dtk. Klien lalu harus menyambung ulang ke `/stream` NYATA dengan
  // `Last-Event-Id`, dan server memutar ulang sisanya dari cincinnya.
  // (Throttling CDP tidak memperlambat badan aliran per potongan secara andal:
  // jawaban Gemini ~1 dtk tiba utuh sebelum pemutusan sempat terjadi.)
  await page.route(
    "**/api/v1/ai/cv-chat",
    async (route) => {
      const asli = await route.fetch();
      const bingkai = (await asli.text()).split("\n\n").filter((b) => b.trim() !== "");
      laporan["C.bingkaiDariServer"] = bingkai.length;
      await context.setOffline(true);
      setTimeout(() => {
        void context.setOffline(false);
      }, 2_500);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `${bingkai.slice(0, 2).join("\n\n")}\n\n`,
      });
    },
    { times: 1 },
  );
  await kotak.fill("Saya pernah jadi karyawan teladan tahun 2023.");
  await kotak.press("Control+Enter");
  await expect.poll(() => jumlahGiliran(page), { timeout: 90_000 }).toBe(n2 + 2);
  const jawabanC = await giliranTerakhir(page);
  await page.waitForTimeout(4_000);
  laporan["C.jawaban"] = jawabanC;
  laporan["C.fokusDiKotakKetik"] = await kotak.evaluate((el) => el === document.activeElement);
  laporan["C.permintaanSambungUlang(LastEventId)"] = permintaanStream;
  const semuaGiliran = await page
    .getByRole("list", { name: "Percakapan" })
    .locator(":scope > li:not([aria-hidden]) p:last-child")
    .allInnerTexts();
  // Hanya giliran yang ditambahkan uji ini — sesi user uji bisa memuat riwayat lama.
  const giliranUji = semuaGiliran.slice(n0);
  laporan["C.giliranDitambahkan"] = giliranUji.length;
  laporan["C.giliranDobel"] = giliranUji.length - new Set(giliranUji).size;
  if (nvda !== null) {
    const ucapan = nvda
      .ucapan()
      .slice(tandaC)
      .map(teksUcapan)
      .filter((u) => u !== "");
    laporan["C.ucapanNvda"] = ucapan;
    laporan["C.kalimatDiucapkan"] = kalimatDari(jawabanC).map((k) => ({
      kalimat: k,
      kali: ucapan.filter((u) => u.replace(/\s+/g, " ").includes(k)).length,
    }));
  }

  // Pemeriksaan keras — sisanya dibaca manusia dari laporan.
  expect(laporan["A.fokusDiKotakKetik"]).toBe(true);
  expect(laporan["B.fokusDiKotakKetik"]).toBe(true);
  expect(laporan["C.fokusDiKotakKetik"]).toBe(true);
  expect(permintaanStream.length).toBeGreaterThan(0);
  expect(laporan["C.giliranDobel"]).toBe(0);
  expect(laporan["C.giliranDitambahkan"]).toBe(6);
});
