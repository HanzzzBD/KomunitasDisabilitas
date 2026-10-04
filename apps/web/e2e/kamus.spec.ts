// Kamus BISINDO publik sungguhan (PR-086) — AC "cari→tonton end-to-end",
// "caption default menyala; transkrip di bawah", "player operable penuh
// keyboard (play/pause/seek/volume)", "axe pass + tanpa autoplay". Registry
// `HALAMAN` memeriksa kedua halamannya diam; yang di sini alurnya.
//
// MEDIA YANG BENAR-BENAR DIPUTAR: WAV hening 3 detik dibuat di sini. WebM dari
// MediaRecorder tidak menyimpan durasi, dan tanpa durasi slider posisi tidak
// bisa diuji; `<video>` memutar audio saja tanpa masalah. Caption dari
// `CAPTION_UJI` (bucket palsu `palsukanApi`).
//
// KEYBOARD-ONLY: tidak satu klik pun.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { STORAGE_UJI, palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axeBersih(page: Page): Promise<void> {
  await tungguGayaTenang(page);
  expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
}

/** WAV PCM 8 kHz mono 16-bit, hening, `detik` panjangnya. */
function wavHening(detik: number): Buffer {
  const laju = 8000;
  const data = laju * detik * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + data, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(laju, 24);
  b.writeUInt32LE(laju * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(data, 40);
  return b;
}

async function tekan(page: Page, nama: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: nama }).focus();
  await page.keyboard.press("Enter");
}

test("cari → tonton: caption menyala, tanpa autoplay, kontrol keyboard penuh, axe pass", async ({
  page,
}) => {
  await palsukanApi(page);
  // Didaftarkan SESUDAH `palsukanApi` → diperiksa lebih dulu (Playwright LIFO).
  // Range request dijawab 206 seperti bucket sungguhan (B2/MinIO) — tanpa itu
  // Chrome menganggap media tidak bisa di-seek dan slider posisi tidak berarti.
  const media = wavHening(3);
  await page.route(`${STORAGE_UJI}/**/*.mp4*`, (route) => {
    const dasar = {
      "content-type": "audio/wav",
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "content-range, accept-ranges, content-length",
    };
    const rentang = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
    if (rentang === null) return route.fulfill({ status: 200, headers: dasar, body: media });
    const awal = Number(rentang[1]);
    const akhir = rentang[2] === "" ? media.length - 1 : Number(rentang[2]);
    return route.fulfill({
      status: 206,
      headers: { ...dasar, "content-range": `bytes ${awal}-${akhir}/${media.length}` },
      body: media.subarray(awal, akhir + 1),
    });
  });

  await page.goto("/kamus");
  await page.getByRole("heading", { level: 1, name: "Kamus BISINDO" }).waitFor();
  await page.getByRole("searchbox", { name: "Kata atau kalimat" }).focus();
  await page.keyboard.type("pagi");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/kamus\?q=pagi$/);
  await expect(page.getByText("1 entri ditemukan.")).toBeVisible();
  await axeBersih(page);

  await page.getByRole("link", { name: "Selamat pagi" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { level: 1, name: "Selamat pagi" }).waitFor();

  const video = page.locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration)).toBeCloseTo(3, 0);
  // Tanpa autoplay; caption track default dan menyala.
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => v.textTracks[0]?.mode)).toBe("showing");
  await expect(page.getByRole("heading", { level: 2, name: "Transkrip" })).toBeVisible();
  await axeBersih(page);

  // Putar / jeda.
  await tekan(page, "Putar");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await tekan(page, "Jeda");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  // Seek lewat slider (panah) dan tombol.
  await video.evaluate((v: HTMLVideoElement) => (v.currentTime = 0));
  await page.getByRole("slider", { name: "Posisi video" }).focus();
  await page.keyboard.press("End");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(2.5);
  await tekan(page, "Mundur 2 detik");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(1.5);

  // Volume lewat slider.
  await page.getByRole("slider", { name: "Volume" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.volume)).toBeCloseTo(0.9, 2);

  // Caption mati.
  await tekan(page, "Caption");
  expect(await video.evaluate((v: HTMLVideoElement) => v.textTracks[0]?.mode)).toBe("hidden");
  await axeBersih(page);

  // Kembali → pencarian & fokus kartu pulih.
  await page.getByRole("link", { name: "Kembali ke kamus" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/kamus\?q=pagi$/);
});
