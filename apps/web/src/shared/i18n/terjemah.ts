// Inti i18n: pencarian, fallback, interpolasi. Fungsi MURNI — tanpa React,
// tanpa konteks, tanpa efek samping. Bisa diuji tanpa merender apa pun, dan
// kelak bisa dipakai ulang di mobile (SDD §4.2) tanpa membawa DOM.
import type { KatalogFitur, ModeBahasa, ParamTeks } from "./tipe.js";

/**
 * `{nama}` — satu pasang kurung kurawal, isinya nama parameter.
 *
 * Sengaja sesederhana ini. Sintaks yang lebih kaya (pluralisasi, format
 * tanggal) menggoda, tetapi setiap kemampuan tambahan harus ditulis DUA KALI
 * oleh penerjemah, dan setiap yang salah tulis menjadi teks rusak di layar
 * pengguna. Kebutuhan yang lebih rumit ditangani pemanggil dengan menyiapkan
 * nilainya lebih dulu.
 */
const POLA_PARAM = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

/**
 * Sisipkan parameter ke dalam pola.
 *
 * KEAMANAN (AC PR-029 "interpolasi aman, tanpa injeksi HTML"): fungsi ini
 * mengembalikan STRING BIASA dan tidak pernah menyentuh HTML. Nilai `<b>` tetap
 * menjadi empat karakter `<`, `b`, `>` — React yang merendernya akan meng-escape
 * apa adanya. Tidak ada jalan dari sini menuju `dangerouslySetInnerHTML`, dan
 * itulah alasan modul ini tidak menyediakan varian "rich text": begitu ada,
 * seseorang akan memakainya untuk teks yang berasal dari pengguna.
 *
 * Placeholder tanpa nilai DIBIARKAN apa adanya (`{nama}` tetap terlihat), bukan
 * dikosongkan. Kalimat yang kehilangan satu kata diam-diam terbaca wajar tetapi
 * salah; `{nama}` yang muncul di layar langsung memberi tahu bahwa ada yang
 * lupa dikirim.
 */
export function interpolasi(pola: string, params?: ParamTeks): string {
  if (params === undefined) return pola;

  return pola.replace(POLA_PARAM, (utuh, nama: string) => {
    // `Object.hasOwn`, bukan `params[nama] !== undefined`: yang kedua akan
    // ikut membaca rantai prototipe, sehingga `{constructor}` menghasilkan
    // teks fungsi di layar pengguna.
    if (!Object.hasOwn(params, nama)) return utuh;
    return String(params[nama]);
  });
}

export interface HasilTerjemah {
  teks: string;
  /** true bila kunci tidak ada di katalog — pemanggil yang memutuskan cara melapor. */
  hilang: boolean;
}

/**
 * Cari satu kunci dan sisipkan parameternya.
 *
 * Fallback berlapis, dari yang paling diinginkan ke yang paling darurat:
 *
 *   1. varian yang diminta;
 *   2. varian `id` — `id-simple` yang belum ditulis lebih baik ditutupi kalimat
 *      panjang yang BENAR daripada oleh kekosongan (tipe seharusnya mencegah
 *      keadaan ini, tetapi katalog bisa datang dari bundel lama);
 *   3. kunci itu sendiri.
 *
 * Langkah 3 memenuhi AC "fallback key hilang → tampil key, bukan blank". Layar
 * kosong tidak bisa dilaporkan pengguna; `shell.luring.judul` yang muncul di
 * layar bisa langsung dicari di kode.
 */
export function terjemah(
  katalog: KatalogFitur,
  mode: ModeBahasa,
  kunci: string,
  params?: ParamTeks,
): HasilTerjemah {
  const entri = katalog[kunci];
  if (entri === undefined) return { teks: kunci, hilang: true };

  const pola = entri[mode] || entri.id || kunci;
  return { teks: interpolasi(pola, params), hilang: false };
}
