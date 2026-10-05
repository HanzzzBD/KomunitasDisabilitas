import type { Device } from "@nawasena/schemas";

/** Registrasi single-flight per akun/token. Jawaban akun lama tidak dipakai. */
export function createRegistrasiPush(deps: {
  token: (mintaIzin: boolean) => Promise<string | null>;
  daftar: (token: string) => Promise<Device>;
  lepas?: (id: string) => Promise<void>;
  cabutToken?: () => Promise<void>;
}) {
  let sub: string | null = null;
  let generasi = 0;
  let terdaftar: { token: string; perangkat: Device } | null = null;
  let berjalan: Promise<Device | null> | null = null;
  let mintaIzinBerjalan = false;
  let ditutup = false;
  let pelepasan: Promise<void> | null = null;
  const aksi = {
    akun(baru: string | null) {
      if (baru === sub) return;
      sub = baru;
      generasi++;
      terdaftar = null;
      berjalan = null;
      ditutup = false;
    },
    async daftarkan(mintaIzin: boolean): Promise<Device | null> {
      if (!sub || ditutup) return null;
      if (pelepasan) await pelepasan;
      if (!sub || ditutup) return null;
      if (berjalan) {
        const versiAwal = generasi;
        const izinDalamProses = mintaIzinBerjalan;
        const hasil = await berjalan;
        // Klik eksplisit tidak boleh hilang di balik pemeriksaan izin otomatis.
        if (mintaIzin && !izinDalamProses && !hasil && versiAwal === generasi)
          return aksi.daftarkan(true);
        return hasil;
      }
      const versi = generasi;
      mintaIzinBerjalan = mintaIzin;
      const kerja = (async () => {
        const token = await deps.token(mintaIzin);
        if (!token || versi !== generasi) return null;
        if (terdaftar?.token === token) return terdaftar.perangkat;
        const perangkat = await deps.daftar(token);
        if (versi !== generasi) return null;
        terdaftar = { token, perangkat };
        return perangkat;
      })();
      berjalan = kerja;
      try {
        return await kerja;
      } finally {
        if (versi === generasi) berjalan = null;
      }
    },
    perangkat: () => terdaftar?.perangkat ?? null,
    async lepas() {
      if (pelepasan) return pelepasan;
      ditutup = true;
      const versi = generasi;
      const kerja = (async () => {
        // Tunggu pendaftaran yang sudah berangkat agar tidak menulis SETELAH DELETE.
        await berjalan?.catch(() => undefined);
        const id = terdaftar?.perangkat.id;
        await Promise.allSettled([
          id && deps.lepas ? deps.lepas(id) : Promise.resolve(),
          deps.cabutToken?.() ?? Promise.resolve(),
        ]);
        if (versi === generasi) terdaftar = null;
      })();
      pelepasan = kerja;
      try {
        await kerja;
      } finally {
        pelepasan = null;
      }
    },
  };
  return aksi;
}
