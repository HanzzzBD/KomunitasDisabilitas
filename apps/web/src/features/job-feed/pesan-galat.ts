// Kalimat galat pencarian lowongan publik (PR-058) — pola sama
// `companies-publik/pesan-galat.ts`. Tidak ada kode khusus: `GET /jobs`
// publik hanya pernah menjawab 200 (bahkan untuk pencarian kosong) atau 400
// (cursor rusak, ditangani terpisah — lihat `browse-daftar.tsx`), jadi tidak
// ada kode bisnis yang butuh kalimat sendiri di sini.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
};

export function pesanGalatLowongan(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
