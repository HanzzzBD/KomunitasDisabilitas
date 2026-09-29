// Verifikasi editor CV dengan NVDA (PR-068c, utang U-24 / checklist PR-061).
//
// Keyboard dikirim lewat Playwright (CDP) — NVDA tidak melihat tombolnya, tetapi
// MELIHAT akibatnya: setiap perpindahan fokus, perubahan keadaan buka/tutup, dan
// wilayah live diumumkan dari peristiwa aksesibilitas Chrome yang nyata. Yang
// dicatat per langkah adalah ucapan NVDA sesudah langkah itu.
//
// Prasyarat sama dengan `chat-nyata.verifikasi.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { judulJendelaDepan, nyalakanNvda, type SesiNvda } from "./nvda.js";

const TOKEN = (
  JSON.parse(readFileSync(process.env.VERIFIKASI_TOKEN_FILE ?? "", "utf8")) as { token: string }
).token;

let nvda: SesiNvda | null = null;
const langkah: Array<{ langkah: string; jendelaUjiDiDepan: boolean; ucapan: string[] }> = [];

test.beforeAll(async () => {
  nvda = await nyalakanNvda();
});

test.afterAll(() => {
  nvda?.hentikan();
  writeFileSync(
    process.env.VERIFIKASI_LAPORAN ?? "laporan-editor.json",
    JSON.stringify(langkah, null, 2),
  );
});

function teksUcapan(mentah: string): string {
  return [...mentah.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => m[1])
    .join(" ")
    .trim();
}

/** Jalankan satu langkah, tunggu NVDA, catat ucapannya. */
async function catat(
  page: Page,
  nama: string,
  aksi: () => Promise<void>,
  jedaMs = 1_200,
): Promise<string[]> {
  // Jendela lain di desktop bisa merebut fokus OS (terbukti 2026-09-29); ucapan
  // NVDA lalu berasal dari jendela itu. Bawa jendela uji ke depan dulu, dan
  // tandai langkah yang tetap tidak bisa dipastikan.
  if (!judulJendelaDepan().includes("Editor CV")) {
    await page.bringToFront();
    await page.waitForTimeout(800);
  }
  const jendelaUjiDiDepan = judulJendelaDepan().includes("Editor CV");
  const tanda = nvda!.ucapan().length;
  await aksi();
  await page.waitForTimeout(jedaMs);
  const ucapan = nvda!
    .ucapan()
    .slice(tanda)
    .map(teksUcapan)
    .filter((u) => u !== "");
  langkah.push({ langkah: nama, jendelaUjiDiDepan, ucapan });
  return ucapan;
}

test("editor CV dengan NVDA: struktur, Tab, buka bagian, reorder, simpan", async ({ page }) => {
  test.setTimeout(300_000);
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { accessToken: TOKEN, expiresIn: 900 } }),
    }),
  );
  const buat = await page.request.post("/api/v1/me/resumes", {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: { title: "CV Uji Editor NVDA", content: {} },
  });
  expect(buat.status()).toBe(201);
  const { data: cv } = (await buat.json()) as { data: { id: string } };

  await page.goto(`/cv/${cv.id}`);
  const lewati = page.getByRole("button", { name: /^Lewati/ });
  if (
    await lewati
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await lewati.first().click();
    await page.goto(`/cv/${cv.id}`);
  }
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // 1. Halaman dimuat ulang saat jendela sudah di depan: NVDA membaca otomatis
  //    (say all) — urutan heading dan landmark.
  await page.bringToFront();
  await catat(page, "halaman dibuka (say all)", () => page.reload().then(() => undefined), 15_000);

  // 2. Tab dari awal konten: label, keadaan buka/tutup. Berhenti di bagian
  //    terakhir — satu Tab lagi keluar ke UI Chrome (tanpa perangkap fokus,
  //    terbukti di run sebelumnya), dan fokus OS lalu tidak kembali ke halaman.
  await page.getByRole("link", { name: "Kembali ke daftar CV" }).focus();
  for (let i = 1; i <= 9; i += 1) {
    await catat(page, `Tab ke-${String(i)}`, () => page.keyboard.press("Tab"), 900);
  }

  // 3. Bagian "Pengalaman kerja": fokus ringkasan, buka dengan Enter.
  const ringkasan = page.locator("summary").filter({ hasText: "Pengalaman kerja" });
  await catat(page, "fokus ringkasan Pengalaman kerja", () => ringkasan.focus());
  await catat(page, "Enter membuka bagian", () => page.keyboard.press("Enter"));

  // 4. Tambah dua item lewat keyboard, isi nama posisi.
  const tambah = page.getByRole("button", { name: "Tambah pengalaman kerja" });
  await catat(page, "fokus Tambah pengalaman kerja", () => tambah.focus());
  await catat(page, "Enter tambah item 1", () => page.keyboard.press("Enter"));
  await tambah.focus();
  await catat(page, "Enter tambah item 2", () => page.keyboard.press("Enter"));
  const form = page.getByRole("form", { name: "Pengalaman kerja" });
  await catat(page, "fokus input Nama posisi item 1 (label, wajib)", () =>
    form.getByLabel("Nama posisi").nth(0).focus(),
  );
  await catat(page, "Tab ke input berikutnya", () => page.keyboard.press("Tab"));
  await form.getByLabel("Nama posisi").nth(0).fill("Staf Admin");
  await form.getByLabel("Nama posisi").nth(1).fill("Relawan Data");

  // 5. Tombol reorder: yang tak berlaku diumumkan nonaktif; pindah diumumkan live.
  await catat(page, "fokus Pindah ke atas item 1 (harus nonaktif)", () =>
    form.getByRole("button", { name: "Pindah ke atas pengalaman kerja 1" }).focus(),
  );
  await catat(page, "fokus Pindah ke bawah item 1", () =>
    form.getByRole("button", { name: "Pindah ke bawah pengalaman kerja 1" }).focus(),
  );
  await catat(page, "Enter pindahkan item 1 ke bawah", () => page.keyboard.press("Enter"), 2_500);

  // 6. Simpan bagian lewat keyboard — pengumuman berhasil.
  await catat(page, "fokus Simpan bagian", () =>
    form.getByRole("button", { name: "Simpan bagian" }).focus(),
  );
  await catat(page, "Enter simpan bagian", () => page.keyboard.press("Enter"), 3_000);

  await page.request.delete(`/api/v1/me/resumes/${cv.id}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
});
