// Titipan OAuth yang menyeberangi pengalihan (PR-030c).
//
// Pengalihan ke Google membuang seluruh memori halaman. Yang diuji di sini
// adalah tiga hal yang harus selamat menyeberang — dan apa yang terjadi bila
// salah satunya dipalsukan.
import { beforeEach, describe, expect, it } from "vitest";
import { alamatKembali, ambilTitipan, siapkanMasukGoogle } from "../src/features/auth/google.js";

/** Penyimpanan palsu — test tidak boleh bergantung pada sisa test lain. */
function simpananPalsu(): Storage {
  const isi = new Map<string, string>();
  return {
    get length() {
      return isi.size;
    },
    clear: () => isi.clear(),
    getItem: (k: string) => isi.get(k) ?? null,
    key: (i: number) => [...isi.keys()][i] ?? null,
    removeItem: (k: string) => void isi.delete(k),
    setItem: (k: string, v: string) => void isi.set(k, v),
  };
}

let simpanan: Storage;
beforeEach(() => {
  simpanan = simpananPalsu();
});

async function siapkan(tujuan = "/lamaran") {
  return siapkanMasukGoogle({
    clientId: "klien-uji.apps.googleusercontent.com",
    asal: "https://nawasena.id",
    tujuan,
    simpanan,
  });
}

/** State yang benar-benar dititipkan — test tidak boleh menebaknya. */
function stateTersimpan(): string {
  const mentah = simpanan.getItem("nawasena-google-oauth");
  return (JSON.parse(mentah ?? "{}") as { state: string }).state;
}

describe("alamat Google yang dibuka", () => {
  it("membawa PKCE S256, bukan plain", async () => {
    const url = new URL(await siapkan());

    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9\-_]+$/);
    // Challenge, BUKAN verifier: verifier tidak boleh menyeberangi jaringan
    // sampai penukaran.
    expect(url.toString()).not.toContain(
      (JSON.parse(simpanan.getItem("nawasena-google-oauth") ?? "{}") as { verifier: string })
        .verifier,
    );
  });

  it("memakai alur authorization code", async () => {
    const url = new URL(await siapkan());
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("redirect_uri sama persis dengan yang terdaftar", async () => {
    const url = new URL(await siapkan());
    expect(url.searchParams.get("redirect_uri")).toBe("https://nawasena.id/masuk/google");
    expect(alamatKembali("https://nawasena.id")).toBe("https://nawasena.id/masuk/google");
  });

  it("meminta izin seminimal mungkin", async () => {
    const url = new URL(await siapkan());
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });

  it("membawa state yang ikut dititipkan", async () => {
    const url = new URL(await siapkan());
    expect(url.searchParams.get("state")).toBe(stateTersimpan());
  });

  it("dua percobaan memakai state dan challenge yang berbeda", async () => {
    const a = new URL(await siapkan());
    const b = new URL(await siapkan());

    expect(a.searchParams.get("state")).not.toBe(b.searchParams.get("state"));
    expect(a.searchParams.get("code_challenge")).not.toBe(b.searchParams.get("code_challenge"));
  });
});

describe("state DIPERIKSA saat kembali", () => {
  it("state yang cocok → titipan diserahkan", async () => {
    await siapkan();
    const hasil = ambilTitipan(stateTersimpan(), simpanan);

    expect(hasil.ok).toBe(true);
  });

  it("state yang TIDAK cocok ditolak", async () => {
    // Tanpa pemeriksaan ini, penyerang bisa memancing korban membuka alamat
    // kembalian yang membawa authorization code MILIK PENYERANG: korban
    // mendarat di aplikasi yang benar, tampak sudah masuk, tetapi ke akun
    // penyerang — dan semua yang ia tulis sesudahnya masuk ke sana.
    await siapkan();
    const hasil = ambilTitipan("state-karangan-penyerang", simpanan);

    expect(hasil).toEqual({ ok: false, sebab: "state-tidak-cocok" });
  });

  it("state yang HILANG dari URL juga ditolak", async () => {
    await siapkan();
    expect(ambilTitipan(null, simpanan)).toEqual({ ok: false, sebab: "state-tidak-cocok" });
  });

  it("tanpa titipan sama sekali → 'hilang', bukan lolos", async () => {
    expect(ambilTitipan("apa-saja", simpanan)).toEqual({ ok: false, sebab: "hilang" });
  });

  it("titipan yang rusak tidak menjatuhkan halaman", () => {
    simpanan.setItem("nawasena-google-oauth", "{bukan json");
    expect(ambilTitipan("apa-saja", simpanan)).toEqual({ ok: false, sebab: "hilang" });
  });

  it("titipan tanpa verifier ditolak", () => {
    simpanan.setItem("nawasena-google-oauth", JSON.stringify({ state: "s", tujuan: "/" }));
    expect(ambilTitipan("s", simpanan)).toEqual({ ok: false, sebab: "hilang" });
  });
});

describe("titipan SEKALI PAKAI", () => {
  it("terhapus sesudah dibaca, meski berhasil", async () => {
    await siapkan();
    const state = stateTersimpan();

    expect(ambilTitipan(state, simpanan).ok).toBe(true);
    // Alamat kembalian bisa dibuka ulang — tombol kembali, riwayat, tab yang
    // dipulihkan. Verifier yang masih tersimpan berarti percobaan kedua
    // memakai rahasia yang sama.
    expect(ambilTitipan(state, simpanan)).toEqual({ ok: false, sebab: "hilang" });
  });

  it("terhapus juga saat state-nya tidak cocok", async () => {
    await siapkan();
    ambilTitipan("salah", simpanan);

    expect(simpanan.getItem("nawasena-google-oauth")).toBeNull();
  });
});

describe("tujuan ikut menyeberang, dan tetap dibersihkan", () => {
  it("tujuan internal kembali utuh", async () => {
    await siapkan("/lamaran?halaman=2");
    const hasil = ambilTitipan(stateTersimpan(), simpanan);

    expect(hasil.ok && hasil.tujuan).toBe("/lamaran?halaman=2");
  });

  it("tujuan ke luar situs dibuang saat DITULIS", async () => {
    await siapkan("https://jahat.example");
    const titipan = JSON.parse(simpanan.getItem("nawasena-google-oauth") ?? "{}") as {
      tujuan: string;
    };

    expect(titipan.tujuan).toBe("/");
  });

  it("tujuan jahat yang disusupkan ke penyimpanan dibuang saat DIBACA", async () => {
    // `sessionStorage` bisa disunting lewat devtools; pembersihan yang hanya
    // terjadi di satu sisi adalah pembersihan yang bisa dilewati.
    await siapkan("/aman");
    const mentah = JSON.parse(simpanan.getItem("nawasena-google-oauth") ?? "{}") as Record<
      string,
      string
    >;
    simpanan.setItem(
      "nawasena-google-oauth",
      JSON.stringify({ ...mentah, tujuan: "//jahat.example" }),
    );

    const hasil = ambilTitipan(mentah.state ?? "", simpanan);
    expect(hasil.ok && hasil.tujuan).toBe("/");
  });
});
