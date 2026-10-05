// Operasi daftar item CV (PR-092; logikanya dari `DaftarItem` web, PR-061).
//
// Urutan diubah lewat TOMBOL naik/turun, tidak pernah lewat seret saja (AC
// PR-092, WCAG 2.5.7): seret menuntut gerakan presisi yang mustahil bagi
// sebagian pengguna motorik terbatas dan pembaca layar.

/** Tukar item ke atas (-1) atau ke bawah (+1). Di luar batas → null (tidak berubah). */
export function pindahItem<T>(
  daftar: readonly T[],
  indeks: number,
  arah: -1 | 1,
): { daftar: T[]; ke: number } | null {
  const tujuan = indeks + arah;
  if (indeks < 0 || indeks >= daftar.length || tujuan < 0 || tujuan >= daftar.length) return null;
  const berikut = [...daftar];
  [berikut[indeks], berikut[tujuan]] = [berikut[tujuan] as T, berikut[indeks] as T];
  return { daftar: berikut, ke: tujuan };
}

export function ubahItem<T>(daftar: readonly T[], indeks: number, item: T): T[] {
  return daftar.map((lama, posisi) => (posisi === indeks ? item : lama));
}

export function hapusItem<T>(daftar: readonly T[], indeks: number): T[] {
  return daftar.filter((_, posisi) => posisi !== indeks);
}
