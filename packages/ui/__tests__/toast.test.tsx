// AC PR-028 nomor 2: "Toast diumumkan `aria-live="polite"` tanpa mencuri
// fokus" — dan nomor 5 (lolos axe).
//
// Kedua tuntutan itu diuji TERPISAH dan sengaja: memenuhi salah satunya sambil
// melanggar yang lain adalah kegagalan yang paling mudah terjadi, sebab cara
// termudah membuat toast "terdengar" adalah memindahkan fokus ke sana.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { PenyediaToast, Toast, type AksiToast } from "../src/toast.js";

function Contoh({
  aksi,
  mendesak,
  deskripsi,
  terbuka = true,
}: {
  aksi?: AksiToast;
  mendesak?: boolean;
  deskripsi?: string;
  terbuka?: boolean;
} = {}) {
  return (
    <PenyediaToast>
      <button type="button">Kirim lamaran</button>
      <Toast
        judul="Lamaran terkirim"
        deskripsi={deskripsi}
        aksi={aksi}
        mendesak={mendesak}
        terbuka={terbuka}
      />
    </PenyediaToast>
  );
}

/** Toast yang TERLIHAT — sebuah <li> di dalam viewport. */
function toastTerlihat() {
  return screen.getByRole("listitem");
}

/**
 * Salinan pengumuman, DITUNGGU sampai berisi.
 *
 * Radix merender region-nya lebih dulu dan mengisinya satu frame kemudian —
 * justru supaya region-nya sudah ada sebelum teksnya masuk (live region hanya
 * mengumumkan PERUBAHAN). Menguji `findByRole` saja akan lolos atas region
 * kosong, yaitu keadaan di mana tidak ada yang terdengar.
 */
async function pengumumanBerisi(): Promise<HTMLElement> {
  const el = await screen.findByRole("status");
  await waitFor(() => expect(el.textContent).not.toBe(""));
  return el;
}

describe("AC-2a: diumumkan lewat live region", () => {
  it("salinan pengumuman memakai aria-live=polite, BUKAN assertive", async () => {
    render(<Contoh />);

    const pengumuman = await screen.findByRole("status");
    expect(pengumuman).toHaveAttribute("aria-live", "polite");
  });

  it("isi toast benar-benar masuk ke pengumuman", async () => {
    // Region yang ada tetapi kosong adalah kegagalan yang paling sering lolos
    // dari test: atributnya benar, tetapi tidak ada yang terdengar.
    render(<Contoh deskripsi="Perusahaan akan menghubungi Anda." />);

    const pengumuman = await pengumumanBerisi();
    expect(pengumuman.textContent).toContain("Lamaran terkirim");
    expect(pengumuman.textContent).toContain("Perusahaan akan menghubungi Anda.");
  });

  it("pengumuman dibuka kata Indonesia, bukan bawaan Radix 'Notification'", async () => {
    render(<Contoh />);

    const pengumuman = await pengumumanBerisi();
    expect(pengumuman.textContent).toContain("Pemberitahuan");
    expect(pengumuman.textContent).not.toContain("Notification");
  });

  it("mendesak menaikkannya jadi assertive — hanya bila diminta eksplisit", async () => {
    render(<Contoh mendesak />);

    const pengumuman = await screen.findByRole("status");
    expect(pengumuman).toHaveAttribute("aria-live", "assertive");
  });
});

describe("AC-2b: TANPA mencuri fokus", () => {
  it("fokus tetap di tempat pengguna bekerja saat toast muncul", async () => {
    // Susunan pohonnya SENGAJA tidak berubah antara dua render; hanya
    // `terbuka` yang berpindah. React membongkar-pasang ulang anaknya bila
    // sebuah anak tunggal berganti menjadi larik — dan tombol yang dipasang
    // ulang kehilangan fokus tanpa ada yang mencurinya. Test yang disusun
    // begitu akan merah atas komponen yang benar.
    const { rerender } = render(<Contoh terbuka={false} />);

    const tombol = screen.getByRole("button", { name: "Kirim lamaran" });
    tombol.focus();
    expect(tombol).toHaveFocus();

    rerender(<Contoh terbuka />);
    await pengumumanBerisi();

    // Inti AC-nya: pengguna tidak boleh terlempar dari tempatnya bekerja.
    expect(tombol).toHaveFocus();
  });

  it("toast tetap BISA dijangkau keyboard meski tidak merebut fokus", async () => {
    // Tidak mencuri fokus tidak boleh berarti tidak terjangkau: tombol di
    // dalam toast yang tak bisa dicapai keyboard adalah hiasan (persona Sari).
    render(<Contoh />);
    await screen.findByRole("status");

    expect(toastTerlihat()).toHaveAttribute("tabindex", "0");
  });
});

describe("toast beraksi tidak hilang sendiri (WCAG 2.2 §2.2.1)", () => {
  const aksi: AksiToast = {
    label: "Urungkan",
    onKlik: () => {},
    alternatif: "Buka Lamaran Saya untuk mengurungkan",
  };

  it("toast BIASA berhitung mundur dan menutup sendiri", async () => {
    vi.useFakeTimers();
    try {
      const ubah = vi.fn();
      render(
        <PenyediaToast>
          <Toast judul="Tersimpan" terbuka onUbahTerbuka={ubah} />
        </PenyediaToast>,
      );

      act(() => {
        vi.advanceTimersByTime(8500);
      });
      expect(ubah).toHaveBeenCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("toast BERAKSI tidak pernah menutup sendiri, berapa lama pun", async () => {
    // Menghilangkan tombol karena waktu berarti fungsinya lenyap bagi yang
    // paling lambat menjangkaunya.
    vi.useFakeTimers();
    try {
      const ubah = vi.fn();
      render(
        <PenyediaToast>
          <Toast judul="Lamaran terkirim" aksi={aksi} terbuka onUbahTerbuka={ubah} />
        </PenyediaToast>,
      );

      act(() => {
        vi.advanceTimersByTime(120000);
      });
      expect(ubah).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aksi punya teks alternatif yang ikut diumumkan menggantikan tombolnya", async () => {
    // Pengguna screen reader belum tentu sempat menjangkau tombolnya, jadi
    // pengumumannya harus menyebut jalan lain — bukan mengulang nama tombol.
    render(<Contoh aksi={aksi} />);

    const pengumuman = await pengumumanBerisi();
    expect(pengumuman.textContent).toContain("Buka Lamaran Saya untuk mengurungkan");
    expect(pengumuman.textContent).not.toContain("Urungkan");
  });

  it("menekan aksi menjalankan fungsinya", async () => {
    const onKlik = vi.fn();
    render(<Contoh aksi={{ ...aksi, onKlik }} />);
    await screen.findByRole("status");

    await userEvent.click(within(toastTerlihat()).getByRole("button", { name: "Urungkan" }));
    expect(onKlik).toHaveBeenCalledOnce();
  });
});

describe("selalu ada jalan menutup dengan satu penunjuk (WCAG 2.2 §2.5.7)", () => {
  it("tombol tutup punya nama yang bisa dibaca, bukan hanya ×", async () => {
    render(<Contoh />);
    await screen.findByRole("status");

    const tutup = within(toastTerlihat()).getByRole("button", { name: "Tutup" });
    expect(tutup).toHaveAccessibleName("Tutup");
    expect(tutup.textContent).toBe("×");
  });

  it("menekan tutup benar-benar menutup", async () => {
    const ubah = vi.fn();
    render(
      <PenyediaToast>
        <Toast judul="Tersimpan" terbuka onUbahTerbuka={ubah} />
      </PenyediaToast>,
    );
    await screen.findByRole("status");

    await userEvent.click(within(toastTerlihat()).getByRole("button", { name: "Tutup" }));
    expect(ubah).toHaveBeenCalledWith(false);
  });

  it("tombol tutup memakai Tombol, jadi ikut aturan target sentuh", async () => {
    render(<Contoh />);
    await screen.findByRole("status");

    const tutup = within(toastTerlihat()).getByRole("button", { name: "Tutup" });
    expect(tutup.className).toContain("min-h-sentuh");
  });
});

describe("daftar toast bisa ditemukan keyboard", () => {
  it("viewport diberi nama yang menyebut pintasannya", async () => {
    render(<Contoh />);
    await screen.findByRole("status");

    // Toast muncul di ujung DOM; tanpa pintasan yang disebutkan namanya,
    // pengguna keyboard tidak punya cara menemukannya.
    expect(screen.getByRole("region")).toHaveAccessibleName(/Pemberitahuan \(F8\)/);
  });
});

describe("gerbang aksesibilitas", () => {
  it("toast terbuka lolos axe", async () => {
    render(
      <Contoh
        deskripsi="Perusahaan akan menghubungi Anda."
        aksi={{
          label: "Urungkan",
          onKlik: () => {},
          alternatif: "Buka Lamaran Saya untuk mengurungkan",
        }}
      />,
    );
    await screen.findByRole("status");

    // Viewport dan salinan pengumuman hidup di portal pada `document.body`,
    // BUKAN di `container` milik render. Memeriksa `container` akan lolos atas
    // markup yang nyaris kosong — penjaga yang selalu hijau.
    await harusLolosAksesibilitas(document.body);
  });

  it("penjaga ini tidak lulus hampa — tombol tanpa nama tertangkap", async () => {
    // Cacat yang persis mengintai di sini: tombol "×" yang kehilangan
    // `aria-label` tidak punya nama sama sekali, dan pengguna screen reader
    // mendengar "tombol" tanpa tahu apa yang akan terjadi.
    const palsu = document.createElement("div");
    palsu.innerHTML = '<button type="button"><span aria-hidden="true">×</span></button>';
    document.body.append(palsu);

    try {
      await expect(harusLolosAksesibilitas(document.body)).rejects.toThrow(/button-name/);
    } finally {
      // `cleanup()` hanya menyapu kontainer milik RTL. Tanpa ini, markup cacat
      // bertahan dan membuat test axe LAIN merah — kegagalan yang menuduh
      // berkas yang salah.
      palsu.remove();
    }
  });
});
