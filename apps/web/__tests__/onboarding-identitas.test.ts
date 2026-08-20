// Identitas & penanda selesai onboarding (PR-035).
//
// DUA HAL DIUJI DI SINI, dan keduanya soal "gagal dengan tenang":
//
//   1. `idPenggunaSaatIni()` membaca klaim dari token yang TIDAK diverifikasi.
//      Ia dipanggil dari `TataLetak`, yang merender SETIAP halaman — satu
//      lemparan dari sana meruntuhkan seluruh aplikasi, bukan hanya
//      onboarding. Jadi setiap bentuk yang tidak dikenali harus berakhir
//      `null`, bukan galat.
//   2. Penandanya hidup di `localStorage`, yang bisa penuh atau diblokir (mode
//      privat). Gagal menulis TIDAK berarti "wizard tampil lagi lain kali" —
//      `TataLetak` mengevaluasi ulang pada SETIAP pergantian lokasi, jadi
//      penanda yang tidak pernah tertulis berarti pengalihan yang berulang
//      SEKARANG JUGA dan selamanya (QC-1, PR-035). `tandaiOnboardingSelesai`
//      karena itu mencatat keberhasilan sesi di memori (`penandaSesiBawaan`)
//      untuk jalur penyimpanan bawaan, supaya `sudahOnboarding` tidak terus
//      menjawab "belum" untuk sesuatu yang sudah dilakukan pengguna di tab
//      ini. Yang diterima di sini tetap degradasi — bukan aplikasi yang gagal
//      terbuka — tetapi degradasinya adalah "wizard bisa tampil lagi sesudah
//      MUAT ULANG", bukan "tidak pernah bisa ditinggalkan".
import { afterEach, describe, expect, it } from "vitest";
import {
  idPenggunaSaatIni,
  kunciPenanda,
  sudahOnboarding,
  tandaiOnboardingSelesai,
  type PenyimpananPenanda,
} from "../src/features/onboarding/identitas.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

/**
 * Token JWT tiga segmen dengan payload yang bisa ditentukan; TIDAK
 * ditandatangani — yang diuji memang pembacaannya, bukan keabsahannya.
 *
 * Byte-nya dikodekan UTF-8 lebih dulu: `btoa` menolak karakter di atas U+00FF,
 * dan server sungguhan (`jsonwebtoken`) juga mengeluarkan UTF-8. Pembuat token
 * uji yang hanya bisa ASCII akan diam-diam menutup satu kelas cacat.
 */
function tokenDengan(payload: unknown): string {
  const byte = new TextEncoder().encode(JSON.stringify(payload));
  const biner = String.fromCharCode(...byte);
  const b64 = btoa(biner).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `bagian-header.${b64}.tanda-tangan-palsu`;
}

function memori(): PenyimpananPenanda {
  const isi = new Map<string, string>();
  return {
    getItem: (k) => isi.get(k) ?? null,
    setItem: (k, v) => {
      isi.set(k, v);
    },
  };
}

/** Penyimpanan yang MELEMPAR — mode privat sebagian peramban berperilaku begini. */
const DIBLOKIR: PenyimpananPenanda = {
  getItem: () => {
    throw new Error("akses penyimpanan ditolak");
  },
  setItem: () => {
    throw new Error("akses penyimpanan ditolak");
  },
};

afterEach(() => {
  useStoreSesi.setState({ status: "memulihkan" });
  useStoreSesi.getState().keluar();
  useStoreSesi.setState({ status: "memulihkan" });
  globalThis.localStorage?.clear();
});

describe("idPenggunaSaatIni — bentuk yang dikenali", () => {
  it("mengembalikan `sub` dari token tiga segmen", () => {
    useStoreSesi.getState().masuk(tokenDengan({ sub: "user-1", role: "seeker", ver: 1 }));
    expect(idPenggunaSaatIni()).toBe("user-1");
  });

  it("membaca `sub` yang memuat huruf non-ASCII tanpa merusaknya", () => {
    // `atob` mengembalikan BYTE, bukan teks. Tanpa dekode UTF-8, id yang memuat
    // huruf beraksen terbaca rusak — dan penandanya tersimpan di bawah kunci
    // yang tidak akan pernah cocok saat dibaca lagi.
    useStoreSesi.getState().masuk(tokenDengan({ sub: "pengguna-café-日本" }));
    expect(idPenggunaSaatIni()).toBe("pengguna-café-日本");
  });
});

describe("idPenggunaSaatIni — SEMUA bentuk lain berakhir null, bukan galat", () => {
  const kasus: readonly [string, string | null][] = [
    ["tidak ada token sama sekali", null],
    ["token dua segmen", "header.payload"],
    ["token satu segmen", "sekadar-teks"],
    ["segmen payload bukan base64 yang sah", "header.@@@@.tanda"],
    ["payload base64 tetapi bukan JSON", `header.${btoa("bukan json")}.tanda`],
    ["payload kosong", "header..tanda"],
  ];

  for (const [nama, token] of kasus) {
    it(nama, () => {
      if (token !== null) useStoreSesi.getState().masuk(token);
      expect(idPenggunaSaatIni()).toBeNull();
    });
  }

  it("payload JSON tanpa `sub`", () => {
    useStoreSesi.getState().masuk(tokenDengan({ role: "seeker" }));
    expect(idPenggunaSaatIni()).toBeNull();
  });

  it("`sub` bukan string", () => {
    useStoreSesi.getState().masuk(tokenDengan({ sub: 123 }));
    expect(idPenggunaSaatIni()).toBeNull();
  });

  it("`sub` string kosong", () => {
    // Kosong bukan id. Dipakai apa adanya, ia menghasilkan kunci penanda
    // "nawasena-onboarding-selesai:" yang DIBAGI oleh setiap pengguna yang
    // tokennya rusak dengan cara yang sama.
    useStoreSesi.getState().masuk(tokenDengan({ sub: "" }));
    expect(idPenggunaSaatIni()).toBeNull();
  });

  it("payload JSON yang bukan objek (mis. angka)", () => {
    useStoreSesi.getState().masuk(tokenDengan(42));
    expect(idPenggunaSaatIni()).toBeNull();
  });
});

describe("penanda selesai", () => {
  it("bolak-balik lewat penyimpanan sungguhan", () => {
    const simpanan = memori();
    expect(sudahOnboarding("user-1", simpanan)).toBe(false);

    tandaiOnboardingSelesai("user-1", simpanan);

    expect(sudahOnboarding("user-1", simpanan)).toBe(true);
  });

  it("terpisah per pengguna — perangkat bersama tidak boleh saling menutupi", () => {
    // Satu peramban dipakai dua akun (warnet, perangkat keluarga). Penanda yang
    // tidak ber-cakupan id akan membuat akun kedua melewati onboarding yang
    // tidak pernah ia jalani.
    const simpanan = memori();
    tandaiOnboardingSelesai("user-1", simpanan);

    expect(sudahOnboarding("user-2", simpanan)).toBe(false);
  });

  it("kuncinya persis `nawasena-onboarding-selesai:{id}`", () => {
    // Bentuk kuncinya bagian dari kontrak yang dibaca test E2E dan, kelak, alat
    // dukungan. Mengubahnya diam-diam membuat setiap pengguna lama melihat
    // wizard sekali lagi.
    expect(kunciPenanda("user-1")).toBe("nawasena-onboarding-selesai:user-1");
  });

  it("memakai `localStorage` bila penyimpanan tidak disebutkan", () => {
    tandaiOnboardingSelesai("user-3");
    expect(globalThis.localStorage.getItem("nawasena-onboarding-selesai:user-3")).toBe("1");
    expect(sudahOnboarding("user-3")).toBe(true);
  });

  it("penyimpanan yang MELEMPAR tidak menjatuhkan apa pun", () => {
    // Mode privat sebagian peramban. Melempar dari sini TIDAK boleh
    // meruntuhkan `TataLetak` (yang merender setiap halaman) — itulah yang
    // dibuktikan `not.toThrow()`.
    //
    // Baris kedua BUKAN menguji "wizard tampil lagi lain kali": pada jalur
    // BAWAAN (`simpanan` tidak disebutkan), kegagalan yang sama justru
    // mengunci pengguna di `/onboarding` selamanya — `TataLetak` mengevaluasi
    // ulang pada SETIAP pergantian lokasi, dan penanda yang tidak pernah
    // tertulis membuatnya menjawab "belum" tanpa henti (QC-1, PR-035). Yang
    // mencegahnya adalah `penandaSesiBawaan` — cadangan sesi yang HANYA aktif
    // saat `simpanan === undefined` (lihat komentar di `identitas.ts`). Test
    // ini menyuntikkan `DIBLOKIR` secara eksplisit justru untuk MENGHINDARI
    // cadangan itu, sehingga hasilnya deterministik `false` di sini — jaminan
    // "tidak terkunci" untuk jalur bawaan diuji terpisah, di level
    // `TataLetak` + keluar wizard (`onboarding.test.tsx`, blok "QC-1"),
    // karena unit test atas `identitas.ts` sendirian TERBUKTI tidak
    // menangkapnya.
    expect(() => {
      tandaiOnboardingSelesai("user-1", DIBLOKIR);
    }).not.toThrow();
    expect(sudahOnboarding("user-1", DIBLOKIR)).toBe(false);
  });

  it('nilai selain "1" dibaca sebagai BELUM', () => {
    // `localStorage` bisa disunting tangan atau ditinggalkan versi lain
    // aplikasi. Apa pun yang tidak persis penanda kita berarti belum.
    const simpanan = memori();
    simpanan.setItem(kunciPenanda("user-1"), "true");
    expect(sudahOnboarding("user-1", simpanan)).toBe(false);
  });
});

describe("cadangan sesi bawaan (QC-1) — pengerasan & isolasi", () => {
  it("penanda sesi ditulis TANPA SYARAT pada jalur bawaan, bukan hanya saat tulis gagal", () => {
    // Pengerasan yang dicatat QC PR-035 sebagai celah tersisa: penyimpanan yang
    // MENERIMA tulisan lalu membuangnya diam-diam membuat "tidak melempar"
    // menjadi bukti palsu, Set tetap kosong, dan pengguna terkunci di
    // `/onboarding`. Di sini `setItem` sengaja berhasil tanpa efek.
    const berpura: PenyimpananPenanda = {
      getItem: () => null,
      setItem: () => {
        /* diterima, lalu dibuang — persis kasus yang dikhawatirkan */
      },
    };
    const asli = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: berpura, configurable: true });

    try {
      tandaiOnboardingSelesai("user-hantu");
      // Penyimpanannya tidak menyimpan apa pun, tetapi pengguna TIDAK terkunci.
      expect(sudahOnboarding("user-hantu")).toBe(true);
    } finally {
      if (asli !== undefined) Object.defineProperty(globalThis, "localStorage", asli);
    }
  });

  it("cadangan sesi TIDAK bocor ke pengguna berikutnya di tab yang sama", () => {
    // Celah kedua yang dicatat QC PR-035: dijamin oleh konstruksi (Set dikunci
    // per `userId`) tetapi tidak dijepit satu test pun. Perangkat bersama —
    // pengguna A selesai dengan penyimpanan rusak, keluar, pengguna B masuk di
    // tab yang sama. B belum pernah melihat wizard, jadi B HARUS melihatnya.
    // Kalau ini bocor, B melewatkan seluruh pengaturan aksesibilitasnya.
    const asli = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const diblokir: PenyimpananPenanda = {
      getItem: () => {
        throw new Error("diblokir");
      },
      setItem: () => {
        throw new Error("diblokir");
      },
    };
    Object.defineProperty(globalThis, "localStorage", { value: diblokir, configurable: true });

    try {
      tandaiOnboardingSelesai("pengguna-A");
      expect(sudahOnboarding("pengguna-A")).toBe(true);
      expect(sudahOnboarding("pengguna-B")).toBe(false);
    } finally {
      if (asli !== undefined) Object.defineProperty(globalThis, "localStorage", asli);
    }
  });
});
