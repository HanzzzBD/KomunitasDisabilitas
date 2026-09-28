import { AreaTeks, KolomForm, Masukan, Tombol } from "@nawasena/ui";
import type { GalatKolom } from "./galat.js";

export interface KolomItem<T> {
  nama: string;
  label: string;
  jenis?: "teks" | "area" | "angka";
  maks?: number;
  wajib?: boolean;
  bantuan?: string;
  baca: (item: T) => string;
  tulis: (item: T, nilai: string) => T;
}

interface DaftarItemProps<T> {
  namaBagian: string;
  namaSatuan: string;
  nilai: readonly T[];
  itemKosong: T;
  kolom: readonly KolomItem<T>[];
  galat: GalatKolom;
  onUbah: (nilai: T[]) => void;
  onUmumkan: (pesan: string) => void;
  teks: {
    kosong: string;
    tambah: string;
    hapus: string;
    naik: string;
    turun: string;
    item: (nomor: number) => string;
    dihapus: (nomor: number) => string;
    dipindah: (dari: number, ke: number) => string;
  };
}

export function DaftarItem<T>({
  namaBagian,
  namaSatuan,
  nilai,
  itemKosong,
  kolom,
  galat,
  onUbah,
  onUmumkan,
  teks,
}: DaftarItemProps<T>) {
  function ubahItem(indeks: number, item: T): void {
    onUbah(nilai.map((lama, posisi) => (posisi === indeks ? item : lama)));
  }

  function pindah(indeks: number, arah: -1 | 1): void {
    const tujuan = indeks + arah;
    if (tujuan < 0 || tujuan >= nilai.length) return;
    const berikut = [...nilai];
    [berikut[indeks], berikut[tujuan]] = [berikut[tujuan] as T, berikut[indeks] as T];
    onUbah(berikut);
    onUmumkan(teks.dipindah(indeks + 1, tujuan + 1));
  }

  return (
    <div className="flex flex-col gap-3">
      {nilai.length === 0 ? <p className="text-sm text-gray-700">{teks.kosong}</p> : null}
      <ol className="flex list-none flex-col gap-4 p-0">
        {nilai.map((item, indeks) => (
          <li key={indeks} className="rounded-md border border-gray-300 bg-gray-50 p-3">
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="px-1 text-base font-semibold text-gray-900">
                {teks.item(indeks + 1)}
              </legend>
              {kolom.map((k) => {
                const pesan = galat[`${namaBagian}.${indeks}.${k.nama}`];
                const kontrol = {
                  value: k.baca(item),
                  maxLength: k.maks,
                  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                    ubahItem(indeks, k.tulis(item, e.target.value));
                  },
                };
                return (
                  <KolomForm
                    key={k.nama}
                    label={k.label}
                    bantuan={k.bantuan}
                    wajib={k.wajib}
                    galat={pesan}
                  >
                    {k.jenis === "area" ? (
                      <AreaTeks {...kontrol} />
                    ) : (
                      <Masukan
                        {...kontrol}
                        inputMode={k.jenis === "angka" ? "numeric" : undefined}
                      />
                    )}
                  </KolomForm>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <Tombol
                  varian="sekunder"
                  ukuran="kecil"
                  disabled={indeks === 0}
                  aria-label={`${teks.naik} ${namaSatuan} ${indeks + 1}`}
                  onClick={() => {
                    pindah(indeks, -1);
                  }}
                >
                  {teks.naik}
                </Tombol>
                <Tombol
                  varian="sekunder"
                  ukuran="kecil"
                  disabled={indeks === nilai.length - 1}
                  aria-label={`${teks.turun} ${namaSatuan} ${indeks + 1}`}
                  onClick={() => {
                    pindah(indeks, 1);
                  }}
                >
                  {teks.turun}
                </Tombol>
                <Tombol
                  varian="hening"
                  ukuran="kecil"
                  aria-label={`${teks.hapus} ${namaSatuan} ${indeks + 1}`}
                  onClick={() => {
                    onUbah(nilai.filter((_baris, posisi) => posisi !== indeks));
                    onUmumkan(teks.dihapus(indeks + 1));
                  }}
                >
                  {teks.hapus}
                </Tombol>
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <div>
        <Tombol
          varian="sekunder"
          onClick={() => {
            onUbah([...nilai, itemKosong]);
          }}
        >
          {teks.tambah}
        </Tombol>
      </div>
    </div>
  );
}
