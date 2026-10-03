// Dasbor metrik admin (PR-081). Alur browser nyata + axe di
// `e2e/admin-metrik.spec.ts`; berkas ini menjaga cepat di jsdom:
//   - tiap tile = <dt> berlabel + PERIODE, <dd> angka + tren kalimat;
//   - "semua" tanpa tren; ganti periode mengirim `?periode=`;
//   - refresh tidak mencuri fokus dan tidak membuat live region di atas angka;
//   - tabel AI ber-caption + header baris/kolom.
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { AdminMetrics } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import { INTERVAL_SEGAR_MS } from "../src/features/admin/metrik-dasbor.js";

const ADMIN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Admin Uji",
  email: null,
  phone: "+6281234567890",
  role: "admin",
  createdAt: "2026-01-15T20:00:00.000Z",
};

function metrik(periode: AdminMetrics["period"], over: Partial<AdminMetrics> = {}): AdminMetrics {
  return {
    period: periode,
    from: periode === "semua" ? null : "2026-09-02T00:00:00.000Z",
    to: "2026-10-02T00:00:00.000Z",
    generatedAt: "2026-10-02T03:15:00.000Z",
    funnel: { registered: 15, profileReady: 9, applied: 6, interviewed: 3, hired: 1 },
    northStar: { confirmedInPeriod: 1, confirmedTotal: 4 },
    previous:
      periode === "semua"
        ? null
        : {
            from: "2026-08-03T00:00:00.000Z",
            to: "2026-09-02T00:00:00.000Z",
            funnel: { registered: 12, profileReady: 9, applied: 8, interviewed: 3, hired: 0 },
            confirmedInPeriod: 2,
          },
    aiUsage: {
      since: "2026-09-02T00:00:00.000Z",
      features: [{ feature: "cv_chat", requests: 1250, tokensIn: 40000, tokensOut: 52000 }],
    },
    dlqTotal: 0,
    ...over,
  };
}

function renderAdmin() {
  useStoreSesi.setState({ status: "masuk" });
  const diminta: string[] = [];
  const klien: ApiClient = {
    request: (path: string) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }
      if (path === "/me") return Promise.resolve({ data: ADMIN }) as Promise<never>;
      if (path.startsWith("/admin/metrics?")) {
        diminta.push(path);
        const periode = new URLSearchParams(path.split("?")[1]).get("periode") as
          | AdminMetrics["period"]
          | null;
        return Promise.resolve({ data: metrik(periode ?? "30d") }) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
  const queryClient = createQueryClient();
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/admin"] });
  render(
    <Providers queryClient={queryClient} klienApi={klien}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { diminta, queryClient };
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

async function seksiMetrik() {
  return (await screen.findByRole("heading", { level: 2, name: "Kesehatan pilot" })).closest(
    "section",
  ) as HTMLElement;
}

describe("dasbor metrik /admin", () => {
  it("tile: label + periode di <dt>, angka + tren KALIMAT di <dd>", async () => {
    renderAdmin();
    const seksi = await seksiMetrik();
    const dt = await within(seksi).findByText("Pendaftar baru, 30 hari terakhir");
    expect(dt.tagName).toBe("DT");
    const dd = dt.nextElementSibling as HTMLElement;
    expect(dd.tagName).toBe("DD");
    expect(dd).toHaveTextContent("15");
    expect(dd).toHaveTextContent("Naik 3 dibanding 30 hari sebelumnya (12)");
    // Angka dan tren TIDAK menempel bagi screen reader (temuan NVDA).
    expect(dd.textContent).toMatch(/^15\. ↑ Naik 3/);
    // Panah hanya penguat visual.
    expect(within(dd).getByText("↑", { exact: false })).toHaveAttribute("aria-hidden", "true");

    const melamar = within(seksi).getByText("Sudah melamar, 30 hari terakhir")
      .nextElementSibling as HTMLElement;
    expect(melamar).toHaveTextContent("Turun 2 dibanding 30 hari sebelumnya (8)");
    const profil = within(seksi).getByText("Profil siap dicocokkan, 30 hari terakhir")
      .nextElementSibling as HTMLElement;
    expect(profil).toHaveTextContent("Sama dengan 30 hari sebelumnya (9)");
  });

  it("ganti periode → ?periode=7d; 'Sepanjang waktu' tanpa kalimat tren", async () => {
    const { diminta } = renderAdmin();
    const seksi = await seksiMetrik();
    await within(seksi).findByText("Pendaftar baru, 30 hari terakhir");
    const user = userEvent.setup();

    await user.click(within(seksi).getByRole("radio", { name: "7 hari terakhir" }));
    await within(seksi).findByText("Pendaftar baru, 7 hari terakhir");
    expect(diminta).toContain("/admin/metrics?periode=7d");

    await user.click(within(seksi).getByRole("radio", { name: "Sepanjang waktu" }));
    const dt = await within(seksi).findByText("Pendaftar baru, Sepanjang waktu");
    expect(dt.nextElementSibling).not.toHaveTextContent(/Naik|Turun|Sama dengan/);
  });

  it("auto-refresh 5 menit: tidak mencuri fokus, tanpa live region di atas angka", async () => {
    const { diminta, queryClient } = renderAdmin();
    const seksi = await seksiMetrik();
    await within(seksi).findByText("Pendaftar baru, 30 hari terakhir");
    expect(INTERVAL_SEGAR_MS).toBe(5 * 60 * 1000);

    const radio = within(seksi).getByRole("radio", { name: "30 hari terakhir" });
    radio.focus();
    const sebelum = diminta.length;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["admin-metrics"] });
    });
    await waitFor(() => expect(diminta.length).toBeGreaterThan(sebelum));
    expect(radio).toHaveFocus();
    // Satu-satunya wilayah status di seksi milik `WilayahMemuat` (pemuatan
    // PERTAMA). Refresh latar tidak mengisinya: tidak ada yang diumumkan.
    const wilayah = [...seksi.querySelectorAll('[aria-live], [role="status"], [role="alert"]')];
    expect(wilayah.map((w) => w.textContent)).toEqual(wilayah.map(() => ""));
    expect(within(seksi).getByText("15").closest('[aria-live], [role="status"]')).toBeNull();
  });

  it("pemakaian AI = tabel ber-caption, header kolom & baris", async () => {
    renderAdmin();
    const seksi = await seksiMetrik();
    const tabel = await within(seksi).findByRole("table", { name: /Pemakaian AI per fitur/ });
    expect(
      within(tabel)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Fitur", "Permintaan", "Token masuk", "Token keluar"]);
    expect(within(tabel).getByRole("rowheader", { name: "Obrolan CV" })).toBeInTheDocument();
    expect(within(tabel).getByText("1.250")).toBeInTheDocument();
  });
});
