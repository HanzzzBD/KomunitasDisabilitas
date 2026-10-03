// Kamus BISINDO publik (PR-086). Alur browser nyata + pemutaran video
// sungguhan + axe di `e2e/kamus.spec.ts`; berkas ini menjaga cepat di jsdom:
//   - kartu berlabel (judul + tautan bernama frasa), jumlah hasil diumumkan;
//   - cari lewat tombol, filter masuk URL;
//   - pemutar: caption default menyala, TANPA autoplay, transkrip di bawah dan
//     dirujuk aria-describedby; kontrol putar/jeda/geser/caption/kecepatan;
//   - URL media kedaluwarsa → ambil ulang, lalu putar setelah termuat.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import type { SignVideoPublic } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const ID = "01912345-89ab-7def-8123-4567890aac02";
const ENTRI: SignVideoPublic = {
  id: ID,
  phrase: "Selamat pagi",
  category: "salam",
  transcript: "Tangan kanan terbuka di depan dahi, lalu bergerak ke depan.",
  durationS: null,
  videoUrl: "https://storage.uji.test/v.webm?sig=1",
  captionUrl: "https://storage.uji.test/c.vtt?sig=1",
  thumbnailUrl: null,
  mediaExpiresAt: "2099-01-01T00:00:00.000Z",
};

function renderKamus(jalur: string, jawabDetail: () => SignVideoPublic = () => ENTRI) {
  const jejak: string[] = [];
  const klien: ApiClient = {
    request: (path: string) => {
      if (path === "/auth/refresh")
        return Promise.reject(new Error("tanpa sesi")) as Promise<never>;
      jejak.push(path);
      if (path.startsWith("/sign-videos?") || path === "/sign-videos") {
        return Promise.resolve({ data: [ENTRI] }) as Promise<never>;
      }
      if (path === `/sign-videos/${ID}`)
        return Promise.resolve({ data: jawabDetail() }) as Promise<never>;
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  render(
    <Providers queryClient={createQueryClient()} klienApi={klien}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { jejak, router };
}

/** jsdom tidak memutar media: play/pause & textTracks dipalsukan per elemen. */
function siapkanVideo(video: HTMLVideoElement) {
  const track = { mode: "disabled" as TextTrackMode };
  const play = vi.fn(() => {
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    fireEvent.play(video);
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    Object.defineProperty(video, "paused", { configurable: true, value: true });
    fireEvent.pause(video);
  });
  Object.defineProperty(video, "paused", { configurable: true, value: true });
  Object.defineProperty(video, "duration", { configurable: true, value: 4 });
  Object.defineProperty(video, "textTracks", { configurable: true, value: [track] });
  Object.defineProperty(video, "play", { configurable: true, value: play });
  Object.defineProperty(video, "pause", { configurable: true, value: pause });
  fireEvent.loadedMetadata(video);
  return { track, play, pause };
}

afterEach(() => cleanup());

describe("/kamus", () => {
  it("kartu berlabel + jumlah hasil; cari lewat tombol menulis filter ke URL", async () => {
    const { jejak, router } = renderKamus("/kamus");
    const tautan = await screen.findByRole("link", { name: "Selamat pagi" });
    expect(tautan.closest("h3")).not.toBeNull();
    expect(tautan).toHaveAttribute("href", `/kamus/${ID}`);
    expect(
      screen.getAllByRole("status").some((el) => el.textContent === "1 entri ditemukan."),
    ).toBe(true);

    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: "Kata atau kalimat" }), "pagi");
    expect(jejak.filter((p) => p.includes("query="))).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Cari" }));
    await waitFor(() => expect(router.state.location.search).toBe("?q=pagi"));
    await waitFor(() => expect(jejak).toContain("/sign-videos?query=pagi&limit=50"));
  });
});

describe("/kamus/:id — pemutar", () => {
  it("caption default menyala, tanpa autoplay, transkrip di bawah & dirujuk video", async () => {
    renderKamus(`/kamus/${ID}`);
    await screen.findByRole("heading", { level: 1, name: "Selamat pagi" });
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).not.toHaveAttribute("loop");
    expect(video.getAttribute("crossorigin")).toBe("anonymous");
    const track = video.querySelector("track") as HTMLTrackElement;
    expect(track).toHaveAttribute("kind", "captions");
    expect(track).toHaveAttribute("default");
    expect(video).toHaveAccessibleDescription(ENTRI.transcript);
    expect(screen.getByRole("heading", { level: 2, name: "Transkrip" })).toBeInTheDocument();

    const { track: tt } = siapkanVideo(video);
    expect(tt.mode).toBe("showing");
    expect(screen.getByRole("button", { name: "Caption" })).toHaveAttribute("aria-pressed", "true");
  });

  it("putar/jeda, mundur/maju 2 detik, caption mati, kecepatan 0,5×", async () => {
    renderKamus(`/kamus/${ID}`);
    await screen.findByRole("heading", { level: 1, name: "Selamat pagi" });
    const video = document.querySelector("video") as HTMLVideoElement;
    const { track, play, pause } = siapkanVideo(video);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Putar" }));
    expect(play).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole("button", { name: "Jeda" }));
    expect(pause).toHaveBeenCalledTimes(1);

    video.currentTime = 1;
    await user.click(screen.getByRole("button", { name: "Maju 2 detik" }));
    expect(video.currentTime).toBe(3);
    await user.click(screen.getByRole("button", { name: "Mundur 2 detik" }));
    expect(video.currentTime).toBe(1);

    await user.click(screen.getByRole("button", { name: "Caption" }));
    expect(track.mode).toBe("hidden");
    expect(screen.getByRole("button", { name: "Caption" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("combobox", { name: "Kecepatan" }));
    await user.click(await screen.findByRole("option", { name: "0,5× (lambat)" }));
    await waitFor(() => expect(video.playbackRate).toBe(0.5));

    const posisi = screen.getByRole("slider", { name: "Posisi video" });
    expect(posisi).toHaveAttribute("aria-valuetext", "0:00 dari 0:04");
  });

  it("URL kedaluwarsa saat Putar → entri diambil ulang, lalu diputar setelah termuat", async () => {
    let panggilan = 0;
    const { jejak } = renderKamus(`/kamus/${ID}`, () => {
      panggilan += 1;
      return panggilan === 1
        ? { ...ENTRI, mediaExpiresAt: "2000-01-01T00:00:00.000Z" }
        : { ...ENTRI, videoUrl: "https://storage.uji.test/v.webm?sig=2" };
    });
    await screen.findByRole("heading", { level: 1, name: "Selamat pagi" });
    const video = document.querySelector("video") as HTMLVideoElement;
    const { play } = siapkanVideo(video);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Putar" }));
    await waitFor(() => expect(jejak.filter((p) => p === `/sign-videos/${ID}`)).toHaveLength(2));
    await waitFor(() =>
      expect(video.getAttribute("src")).toBe("https://storage.uji.test/v.webm?sig=2"),
    );
    expect(play).not.toHaveBeenCalled();
    act(() => {
      fireEvent.loadedData(video);
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("entri tidak ada → pesan + tautan kembali", async () => {
    const router = createMemoryRouter(ruteApp, { initialEntries: [`/kamus/${ID}`] });
    const klien: ApiClient = {
      request: (path: string) =>
        (path === "/auth/refresh"
          ? Promise.reject(new Error("tanpa sesi"))
          : Promise.reject(
              new ApiError(
                { code: "VIDEO_ISYARAT_TIDAK_DITEMUKAN", message: "Video isyarat tidak ditemukan" },
                404,
              ),
            )) as Promise<never>,
    };
    render(
      <Providers queryClient={createQueryClient()} klienApi={klien}>
        <RouterProvider router={router} />
      </Providers>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Entri ini tidak ditemukan.");
    expect(screen.getByRole("link", { name: "Kembali ke kamus" })).toHaveAttribute(
      "href",
      "/kamus",
    );
  });
});
