import { tujuanDeepLink, type TujuanTautan } from "./deep-link";
import { tujuanPush } from "../push/tujuan";

/** Menahan cold start sampai sesi DAN wizard DAN navigator siap. Tanpa disk. */
export function createAntreanTautan(buka: (tujuan: TujuanTautan) => void) {
  let siap = false;
  let menunggu: TujuanTautan | null = null;
  const dibaca = new Set<string>();
  function teruskan() {
    if (!siap || menunggu === null) return;
    const tujuan = menunggu;
    menunggu = null;
    buka(tujuan);
  }
  return {
    aturSiap(nilai: boolean) {
      siap = nilai;
      teruskan();
    },
    url(url: string) {
      const tujuan = tujuanDeepLink(url);
      if (tujuan) {
        menunggu = tujuan;
        teruskan();
      }
    },
    push(kunciRespons: string, data: unknown) {
      const tujuan = tujuanPush(data);
      if (!tujuan || dibaca.has(kunciRespons)) return;
      // Batas memori untuk proses app yang lama hidup.
      if (dibaca.size >= 100) dibaca.delete(dibaca.values().next().value ?? "");
      dibaca.add(kunciRespons);
      menunggu = tujuan;
      teruskan();
    },
    hapus() {
      menunggu = null;
      siap = false;
    },
  };
}
