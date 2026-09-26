import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import type { ApiClient, RequestOptions } from "@nawasena/api-client";
import { createQueryClient } from "../src/app/query-client.js";
import { KontrolPdf } from "../src/features/resume/index.js";
import { PenyediaI18n } from "../src/shared/i18n/index.js";

const ID = "01912345-89ab-7def-8123-456789abcdef";

function renderKontrol(responses: unknown[], onDownload = vi.fn()) {
  const requests: Array<{ path: string; method: string }> = [];
  const klien: ApiClient = {
    request<T>(path: string, options?: RequestOptions<T>): Promise<T> {
      requests.push({ path, method: options?.method ?? "GET" });
      const response = responses.shift();
      return Promise.resolve(response as T);
    },
  };
  const hasil = render(
    <QueryClientProvider client={createQueryClient()}>
      <PenyediaI18n>
        <KontrolPdf klien={klien} resumeId={ID} sub="pengguna-a" onDownload={onDownload} />
      </PenyediaI18n>
    </QueryClientProvider>,
  );
  return { ...hasil, requests, onDownload };
}

describe("KontrolPdf", () => {
  it("meminta PDF dan mengumumkan status antre lewat aria-live", async () => {
    const { container, requests } = renderKontrol([
      { data: { status: "idle" } },
      { data: { status: "queued" } },
    ]);

    await userEvent.click(await screen.findByRole("button", { name: "Siapkan PDF" }));

    const status = await screen.findByText("PDF masuk antrean.");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(requests).toEqual([
      { path: `/me/resumes/${ID}/pdf`, method: "GET" },
      { path: `/me/resumes/${ID}/pdf`, method: "POST" },
    ]);
    await harusLolosAksesibilitas(container);
  });

  it("mengambil URL presigned baru tepat sebelum unduh", async () => {
    const onDownload = vi.fn();
    renderKontrol(
      [
        {
          data: {
            status: "ready",
            downloadUrl: "https://storage.test/url-lama",
            expiresAt: "2026-09-25T10:05:00.000Z",
          },
        },
        {
          data: {
            status: "ready",
            downloadUrl: "https://storage.test/url-baru",
            expiresAt: "2026-09-25T11:05:00.000Z",
          },
        },
      ],
      onDownload,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Unduh PDF" }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith("https://storage.test/url-baru"));
    expect(onDownload).not.toHaveBeenCalledWith("https://storage.test/url-lama");
  });

  it("render gagal memberi pesan sederhana dan tombol coba lagi", async () => {
    renderKontrol([
      { data: { status: "failed" } },
      { data: { status: "queued" } },
    ]);

    expect(await screen.findByText(/belum berhasil dibuat/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Coba buat PDF lagi" }));
    expect(await screen.findByText("PDF masuk antrean.")).toBeInTheDocument();
  });
});
