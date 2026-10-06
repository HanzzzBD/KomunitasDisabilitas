import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";
import { COMMUNITY_UJI as ROOM, COMMUNITY_KOTA_UJI as CITY } from "./community-fixture.js";

async function axe(page: Page) {
  await tungguGayaTenang(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}
function json(data: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(data) };
}

test("keyboard filter and pagination keep focus; back from a later page restores the room", async ({
  page,
}) => {
  await palsukanApi(page);
  await page.route("**/api/v1/communities?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill(
      json({
        data: params.get("cursor") ? [CITY] : [ROOM],
        meta: { nextCursor: params.get("cursor") ? null : "page-2" },
      }),
    );
  });
  await page.goto("/community");
  await expect(page.getByRole("link", { name: ROOM.name })).toBeVisible();
  const city = page.getByRole("textbox", { name: "Nama kota" });
  await city.focus();
  await page.keyboard.type("Jakarta");
  await page.keyboard.press("Tab");
  const apply = page.getByRole("button", { name: "Terapkan filter" });
  await expect(apply).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/kota=Jakarta/);
  await expect(apply).toBeFocused();
  const more = page.getByRole("button", { name: "Muat ruang lainnya" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: CITY.name })).toBeVisible();
  const selesai = page.getByRole("button", { name: "Semua ruang sudah ditampilkan" });
  await expect(selesai).toBeFocused();
  await expect(selesai).toHaveAttribute("aria-disabled", "true");
  await axe(page);
  await page.getByRole("link", { name: CITY.name }).click();
  await expect(page.getByRole("heading", { level: 1, name: CITY.name })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("link", { name: CITY.name })).toBeFocused();
  await expect(city).toHaveValue("Jakarta");
});

test("guest reads descriptions and goes to login with its destination; no join is sent", async ({
  page,
}) => {
  await palsukanApi(page);
  let mutations = 0;
  page.on("request", (r) => {
    if (r.url().includes("/communities/") && r.method() !== "GET") mutations += 1;
  });
  await page.goto(`/community/${ROOM.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: ROOM.name })).toBeVisible();
  const login = page.getByRole("link", { name: "Masuk untuk bergabung" });
  await expect(login).toHaveAttribute(
    "href",
    `/masuk?tujuan=${encodeURIComponent(`/community/${ROOM.slug}`)}`,
  );
  await axe(page);
  await login.click();
  await expect(page.getByRole("heading", { level: 1, name: "Masuk ke Nawasena" })).toBeVisible();
  expect(mutations).toBe(0);
});

test("new seeker's login returns to the room; joining remains an explicit action", async ({
  page,
}) => {
  await palsukanApi(page);
  const sub = "01912345-89ab-7def-8123-456789abcdef";
  const token = `header.${Buffer.from(JSON.stringify({ sub, role: "seeker" })).toString("base64url")}.signature`;
  await page.route("**/api/v1/auth/otp/verify", (route) =>
    route.fulfill(
      json({ data: { userId: sub, accessToken: token, expiresIn: 900, isNewUser: true } }),
    ),
  );
  let joins = 0;
  page.on("request", (request) => {
    if (request.url().endsWith(`/communities/${ROOM.id}/join`)) joins += 1;
  });
  await page.goto(`/community/${ROOM.slug}`);
  await page.getByRole("link", { name: "Masuk untuk bergabung" }).click();
  await page.getByRole("textbox", { name: /Nomor HP/ }).fill("081234567890");
  await page.getByRole("button", { name: "Kirim kode", exact: true }).click();
  await page.getByRole("textbox", { name: /Kode/ }).fill("111222");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(`/community/${ROOM.slug}`);
  await expect(page.getByText("Anda belum bergabung", { exact: true })).toBeVisible();
  const join = page.getByRole("button", { name: "Gabung ruang" });
  await expect(join).toHaveAttribute("aria-disabled", "false");
  expect(joins).toBe(0);
  expect(
    await page.evaluate((id) => localStorage.getItem(`nawasena-onboarding-selesai:${id}`), sub),
  ).toBeNull();
  await join.click();
  await expect(page.getByText("Anda berhasil bergabung.", { exact: true })).toBeVisible();
  expect(joins).toBe(1);
  await axe(page);
});

for (const role of ["seeker", "employer", "admin"] as const) {
  test(`${role}: leave then join with keyboard, persistent focus and live confirmation`, async ({
    page,
  }) => {
    await palsukanApi(page, {
      nama: "community-member",
      jalur: `/community/${ROOM.slug}`,
      butuhSesi: true,
      ...(role === "admin" ? { butuhAdmin: true } : {}),
    });
    if (role === "employer")
      await page.route("**/api/v1/me", (route) =>
        route.fulfill(
          json({
            data: {
              id: "01912345-89ab-7def-8123-456789abcdef",
              fullName: "Pengguna Uji",
              email: null,
              phone: null,
              role,
              createdAt: ROOM.createdAt,
            },
          }),
        ),
      );
    await page.goto(`/community/${ROOM.slug}`);
    await expect(page.getByText("Anda sudah bergabung", { exact: true })).toBeVisible();
    const button = page.getByRole("button", { name: "Keluar dari ruang" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Anda sudah keluar dari ruang.", { exact: true })).toBeVisible();
    const join = page.getByRole("button", { name: "Gabung ruang" });
    await expect(join).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByText("Anda berhasil bergabung.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keluar dari ruang" })).toBeFocused();
    await axe(page);
  });
}

test("offline retains room data and never queues a membership change", async ({
  page,
  context,
}) => {
  await palsukanApi(page, {
    nama: "community-member",
    jalur: `/community/${ROOM.slug}`,
    butuhSesi: true,
  });
  await page.goto(`/community/${ROOM.slug}`);
  const leave = page.getByRole("button", { name: "Keluar dari ruang" });
  await expect(leave).toHaveAttribute("aria-disabled", "false");
  let writes = 0;
  page.on("request", (r) => {
    if (r.url().includes("/communities/") && r.method() !== "GET") writes += 1;
  });
  await context.setOffline(true);
  await expect(leave).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/Anda melihat data yang sudah dimuat/)).toBeVisible();
  await leave.focus();
  await page.keyboard.press("Enter");
  await context.setOffline(false);
  await expect(leave).toHaveAttribute("aria-disabled", "false");
  await expect(page.getByText("Anda sudah bergabung", { exact: true })).toBeVisible();
  expect(writes).toBe(0);
});

for (const width of [320, 768, 1024, 1440]) {
  test(`browse and detail reflow at ${width}px with 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await palsukanApi(page);
    for (const path of ["/community", `/community/${ROOM.slug}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({
        content: ":root { --font-scale: 2 !important; font-size: 16px !important; }",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await axe(page);
    }
  });
}

test("archived active member may leave; blocked member cannot join or leave", async ({ page }) => {
  await palsukanApi(page, {
    nama: "community-member",
    jalur: `/community/${ROOM.slug}`,
    butuhSesi: true,
  });
  await page.route(`**/api/v1/communities/${ROOM.slug}`, (route) =>
    route.fulfill(json({ data: { ...ROOM, status: "archived" } })),
  );
  await page.goto(`/community/${ROOM.slug}`);
  await expect(page.getByRole("heading", { name: "Ruang diarsipkan" })).toBeVisible();
  await page.getByRole("button", { name: "Keluar dari ruang" }).click();
  await expect(page.getByText("Anda sudah keluar dari ruang.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gabung ruang" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await axe(page);
  await page.route(`**/api/v1/communities/${ROOM.id}/membership`, (route) =>
    route.fulfill(
      json({ data: { communityId: ROOM.id, status: "blocked", joinedAt: ROOM.createdAt } }),
    ),
  );
  await page.reload();
  await expect(page.getByText("Keanggotaan Anda diblokir", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gabung ruang" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await axe(page);
});
