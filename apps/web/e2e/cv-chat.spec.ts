// AI CV Builder — e2e (PR-068). API dipalsukan (`palsukan-api.ts`); cabang AI
// ditimpa per test dengan `page.route` yang didaftarkan SESUDAH `palsukanApi`.
//
// AC phase-10 PR-068 yang dijaga:
//   - chat → finalize → draft (tautan ke editor)
//   - kuota habis → beralih ke formulir dengan pesan jujur (bukan error)
//   - putus koneksi → sambung ulang tanpa kehilangan percakapan
//   - giliran AI diumumkan lewat aria-live TANPA mencuri fokus kotak ketik
//   - sisa kuota tampil
import { expect, test, type Page } from "@playwright/test";
import { HALAMAN } from "./halaman.js";
import {
  badanSse,
  CV_UJI_ID,
  harusTidakBerpindah,
  JAWABAN_CHAT_UJI,
  palsukanApi,
  SALAM_CHAT_UJI,
  SESI_CHAT_UJI_ID,
  sesiChatUji,
} from "./palsukan-api.js";

const CHAT = HALAMAN.find((h) => h.nama === "CV - chat AI");

async function buka(page: Page): Promise<void> {
  await page.goto("/cv/chat");
  await harusTidakBerpindah(page, CHAT!);
  await expect(page.getByText(SALAM_CHAT_UJI)).toBeVisible();
}

const giliranUser = (isi: string) =>
  JSON.stringify({ seq: 2, role: "user", content: isi, at: "2026-01-15T20:01:00.000Z" });
const giliranAi = JSON.stringify({
  seq: 3,
  role: "assistant",
  content: JAWABAN_CHAT_UJI,
  at: "2026-01-15T20:01:05.000Z",
});

test.beforeEach(async ({ page }) => {
  expect(CHAT, "entri registry chat CV hilang").toBeDefined();
  await palsukanApi(page, CHAT);
});

test("jawaban mengalir, diumumkan per kalimat, dan fokus tetap di kotak ketik", async ({
  page,
}) => {
  await buka(page);
  await expect(
    page.getByText("Sisa pesan hari ini: 29 dari 30. Sisa pembuatan draft: 5."),
  ).toBeVisible();

  const kotak = page.getByLabel("Jawaban Anda");
  await kotak.fill("Saya kasir di toko roti.");
  await kotak.press("Control+Enter");

  const transkrip = page.getByRole("list", { name: "Percakapan" });
  await expect(transkrip.getByText("Saya kasir di toko roti.")).toBeVisible();
  await expect(transkrip.getByText(JAWABAN_CHAT_UJI)).toBeVisible();
  // Wilayah live memuat kalimat, bukan serpihan token.
  const live = page.locator('[aria-live="polite"]').filter({ hasText: "Terima kasih." });
  await expect(live).toContainText("Berapa lama Anda bekerja di sana?");
  // AC: tanpa mencuri fokus input.
  await expect(kotak).toBeFocused();
  await expect(kotak).toHaveValue("");
});

test("kuota habis di tengah → beralih ke formulir di tempat; transkrip tetap terlihat", async ({
  page,
}) => {
  await page.route("**/api/v1/ai/cv-chat", (route) =>
    route.fulfill(
      badanSse([
        { event: "giliran", data: giliranUser("Halo") },
        {
          event: "error",
          data: JSON.stringify({
            code: "KUOTA_AI_HABIS",
            message: "Jatah AI hari ini sudah habis",
            hint: "Coba lagi besok",
            degraded: true,
            retryAfterSeconds: 7_200,
          }),
        },
      ]),
    ),
  );
  await buka(page);
  await page.getByLabel("Jawaban Anda").fill("Halo");
  await page.getByRole("button", { name: "Kirim" }).click();

  await expect(
    page.getByRole("heading", { name: "Chat AI sedang tidak bisa dipakai" }),
  ).toBeVisible();
  await expect(page.getByText(/Jatah AI hari ini sudah habis/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Isi CV lewat formulir" })).toBeVisible();
  // Pesan jujur, bukan galat: tidak ada role=alert merah.
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Percakapan" }).getByText("Halo", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Jawaban Anda")).toHaveCount(0);
});

test("fitur chat dimatikan operator → mode formulir sejak halaman dibuka", async ({ page }) => {
  await page.route("**/api/v1/ai/cv-chat/sessions", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "AI_CHAT_DIMATIKAN", message: "Chat AI sedang tidak tersedia" }),
    }),
  );
  await page.goto("/cv/chat");
  await harusTidakBerpindah(page, CHAT!);
  await expect(page.getByRole("button", { name: "Isi CV lewat formulir" })).toBeVisible();
});

test("putus di tengah jawaban → sambung ulang dengan Last-Event-Id, jawaban utuh", async ({
  page,
}) => {
  // POST: giliran pengguna + kalimat pertama, lalu aliran berakhir TANPA penutup.
  await page.route("**/api/v1/ai/cv-chat", (route) =>
    route.fulfill(
      badanSse([
        { event: "giliran", data: giliranUser("Kasir.") },
        { event: "token", data: "Terima kasih. " },
      ]),
    ),
  );
  let lastEventId: string | undefined;
  await page.route(`**/api/v1/ai/cv-chat/${SESI_CHAT_UJI_ID}/stream`, (route) => {
    lastEventId = route.request().headers()["last-event-id"];
    return route.fulfill(
      badanSse(
        [
          { event: "token", data: "Berapa lama Anda bekerja di sana?" },
          { event: "giliran", data: giliranAi },
          { event: "selesai", data: "" },
        ],
        3,
      ),
    );
  });
  await buka(page);
  await page.getByLabel("Jawaban Anda").fill("Kasir.");
  await page.getByRole("button", { name: "Kirim" }).click();

  const transkrip = page.getByRole("list", { name: "Percakapan" });
  await expect(transkrip.getByText(JAWABAN_CHAT_UJI)).toBeVisible();
  expect(lastEventId).toBe("2");
  await expect(transkrip.getByText("Kasir.")).toBeVisible();
});

test("selesai → draft dibuat di latar → tautan ke editor draft", async ({ page }) => {
  let difinalisasi = false;
  await page.route(`**/api/v1/ai/cv-chat/${SESI_CHAT_UJI_ID}/finalize`, (route) => {
    difinalisasi = true;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        data: { sessionId: SESI_CHAT_UJI_ID, status: "finalizing", resumeId: null },
      }),
    });
  });
  await page.route(`**/api/v1/ai/cv-chat/${SESI_CHAT_UJI_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          ...sesiChatUji([
            { role: "user", content: "Kasir." },
            { role: "assistant", content: JAWABAN_CHAT_UJI },
          ]),
          status: difinalisasi ? "finalized" : "active",
          finalizedAt: difinalisasi ? "2026-01-15T20:02:00.000Z" : null,
          resumeId: difinalisasi ? CV_UJI_ID : null,
        },
      }),
    }),
  );
  await buka(page);
  await page.getByLabel("Jawaban Anda").fill("Kasir.");
  await page.getByRole("button", { name: "Kirim" }).click();
  await expect(
    page.getByRole("list", { name: "Percakapan" }).getByText(JAWABAN_CHAT_UJI),
  ).toBeVisible();

  await page.getByRole("button", { name: "Selesai dan buat draf CV" }).click();
  // Keadaan "sedang dibuat" hanya sekejap di sini (poll pertama sudah `finalized`);
  // yang dijaga: finalize benar-benar diminta, lalu tautan draft muncul.
  await expect.poll(() => difinalisasi).toBe(true);
  const tautan = page.getByRole("link", { name: "Buka draft CV" });
  await expect(tautan).toBeVisible({ timeout: 10_000 });
  await expect(tautan).toHaveAttribute("href", `/cv/${CV_UJI_ID}`);
});

test("halaman /cv menawarkan dua pintu setara: chat AI dan formulir", async ({ page }) => {
  await page.goto("/cv");
  await page.getByRole("link", { name: "Buat dengan chat AI" }).click();
  await expect(page).toHaveURL(/\/cv\/chat$/);
  await expect(page.getByText(SALAM_CHAT_UJI)).toBeVisible();
});
