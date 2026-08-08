// AC PR-025: "Offline → banner alert; mutasi tertahan, tidak gagal senyap."
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { BannerLuring } from "../src/app/banner-luring.js";
import { createQueryClient } from "../src/app/query-client.js";

/**
 * jsdom melaporkan `onLine: true`; nilainya harus disetel manual.
 *
 * Dispatch dibungkus `act()` — tanpa itu pembaruan state React tidak ter-flush
 * sebelum assertion, dan test gagal karena alasan yang tidak ada hubungannya
 * dengan komponennya.
 */
function setDaring(nilai: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: nilai, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(nilai ? "online" : "offline"));
  });
}

function renderBanner(queryClient = createQueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <BannerLuring />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  setDaring(true);
});

describe("BannerLuring", () => {
  it("tidak menampilkan apa pun saat daring", () => {
    setDaring(true);
    renderBanner();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("muncul sebagai role=alert saat luring", () => {
    setDaring(false);
    renderBanner();

    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    // Bahasa sederhana tanpa istilah teknis — dibacakan screen reader apa adanya.
    expect(banner).toHaveTextContent(/tidak terhubung ke internet/i);
  });

  it("menjelaskan bahwa perubahan DITAHAN, bukan hilang", () => {
    // Ini setengah AC yang lain: `networkMode: "online"` menahan mutasi, dan
    // penantian yang tidak dijelaskan tidak bisa dibedakan dari aplikasi macet.
    setDaring(false);
    renderBanner();
    expect(screen.getByRole("alert")).toHaveTextContent(/dikirim setelah terhubung kembali/i);
  });

  it("menyediakan tombol 'Coba lagi' — tombol, bukan tautan", () => {
    setDaring(false);
    renderBanner();
    // getByRole("button") gagal bila kelak diganti <a>: itu menjalankan aksi,
    // bukan berpindah alamat, dan bedanya nyata bagi screen reader.
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });

  it("'Coba lagi' melepas mutasi yang tertahan lebih dulu, lalu menyegarkan", async () => {
    setDaring(false);
    const queryClient = createQueryClient();
    const resume = vi.spyOn(queryClient, "resumePausedMutations").mockResolvedValue(undefined);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    renderBanner(queryClient);
    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    expect(resume).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    // Urutannya disengaja: mutasi adalah niat pengguna yang sudah dinyatakan.
    expect(resume.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0]!);
  });

  it("hilang lagi begitu koneksi kembali", () => {
    setDaring(false);
    renderBanner();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    setDaring(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dirender bersyarat, BUKAN disembunyikan CSS", () => {
    // role="alert" hanya diumumkan saat elemennya MASUK ke DOM. Elemen yang
    // selalu ada lalu di-display:none tidak pernah memicu pengumuman, dan
    // pengguna screen reader tidak akan pernah tahu koneksinya putus.
    setDaring(true);
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });
});
