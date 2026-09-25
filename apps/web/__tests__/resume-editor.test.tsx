import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import type { ApiClient, RequestOptions } from "@nawasena/api-client";
import type { Resume } from "@nawasena/schemas";
import { createQueryClient } from "../src/app/query-client.js";
import { EditorResume } from "../src/features/resume/editor.js";
import { PenyediaI18n } from "../src/shared/i18n/index.js";

const RESUME: Resume = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  title: "CV Utama",
  content: {
    schemaVersion: 1,
    headline: "Staf administrasi",
    summary: "Ringkasan lama",
    contact: {
      email: "rina@contoh.id",
      phone: null,
      city: "Bandung",
      province: "Jawa Barat",
      links: [],
    },
    experiences: [],
    educations: [],
    skills: [
      { name: "Excel", level: "Mahir" },
      { name: "Administrasi", level: null },
    ],
    certifications: [],
    organizations: [],
  },
  pdfUrl: null,
  createdVia: "manual",
  createdAt: "2026-09-25T00:00:00.000Z",
  updatedAt: "2026-09-25T00:00:00.000Z",
};

interface Kiriman {
  path: string;
  body: unknown;
}

function renderEditor() {
  const kiriman: Kiriman[] = [];
  const klien: ApiClient = {
    async request<T>(path: string, options?: RequestOptions<T>): Promise<T> {
      kiriman.push({ path, body: options?.body });
      const perubahan = options?.body as { title?: string; content?: Resume["content"] };
      return {
        data: {
          ...RESUME,
          title: perubahan.title ?? RESUME.title,
          content: perubahan.content ?? RESUME.content,
        },
      } as T;
    },
  };
  const hasil = render(
    <QueryClientProvider client={createQueryClient()}>
      <PenyediaI18n>
        <EditorResume resume={RESUME} klien={klien} />
      </PenyediaI18n>
    </QueryClientProvider>,
  );
  return { ...hasil, kiriman };
}

describe("EditorResume", () => {
  it("reorder memakai tombol dan diumumkan ke screen reader", async () => {
    renderEditor();
    await userEvent.click(screen.getByText("Keahlian", { selector: "summary" }));
    await userEvent.click(screen.getByRole("button", { name: "Pindah ke bawah keahlian 1" }));

    expect(screen.getByText("Item 1 dipindahkan ke posisi 2.")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Keahlian" });
    expect(within(form).getAllByRole("textbox", { name: /Nama keahlian/ })[0]).toHaveValue(
      "Administrasi",
    );
  });

  it("menyimpan satu bagian tanpa ikut menyimpan draf bagian lain", async () => {
    const { kiriman } = renderEditor();

    await userEvent.click(screen.getByText("Profil singkat", { selector: "summary" }));
    const ringkasan = screen.getByRole("textbox", { name: "Ringkasan profesional" });
    await userEvent.clear(ringkasan);
    await userEvent.type(ringkasan, "Belum ingin saya simpan");

    await userEvent.click(screen.getByText("Keahlian", { selector: "summary" }));
    await userEvent.click(screen.getByRole("button", { name: "Pindah ke bawah keahlian 1" }));
    const form = screen.getByRole("form", { name: "Keahlian" });
    await userEvent.click(within(form).getByRole("button", { name: "Simpan bagian" }));

    await waitFor(() => {
      expect(kiriman).toHaveLength(1);
    });
    const body = kiriman[0]?.body as { content: Resume["content"] };
    expect(body.content.summary).toBe("Ringkasan lama");
    expect(body.content.skills.map((item) => item.name)).toEqual(["Administrasi", "Excel"]);
  });

  it("menolak item wajib yang kosong sebelum request dikirim", async () => {
    const { kiriman } = renderEditor();
    await userEvent.click(screen.getByText("Keahlian", { selector: "summary" }));
    await userEvent.click(screen.getByRole("button", { name: "Tambah keahlian" }));
    const form = screen.getByRole("form", { name: "Keahlian" });
    await userEvent.click(within(form).getByRole("button", { name: "Simpan bagian" }));

    expect(await screen.findByText("Nama keahlian tidak boleh kosong")).toBeInTheDocument();
    expect(kiriman).toHaveLength(0);
  });

  it("lolos pemeriksaan axe pada seluruh bagian", async () => {
    const { container } = renderEditor();
    await harusLolosAksesibilitas(container);
  });
});
