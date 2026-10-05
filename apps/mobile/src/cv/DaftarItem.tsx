// Daftar item CV yang bisa diubah (PR-092; paritas `DaftarItem` web, PR-061).
//
// Urutan diubah lewat TOMBOL "Naik"/"Turun" (AC PR-092: tanpa drag-only).
// Setiap tombol menyebut item yang dikenainya ("Naikkan pengalaman 2"), dan
// hasil pindah/hapus diumumkan lewat `onUmumkan` — tanpa itu pengguna TalkBack
// tidak tahu bahwa daftar di sekitarnya baru saja berubah urutan.
import {
  hapusItem,
  pindahItem,
  ubahItem,
  type GalatKolom,
  type KolomItem,
} from "@nawasena/formulir";
import { Kartu, Masukan, Tombol, UKURAN_HURUF, useTokenA11y } from "@nawasena/ui-native";
import { Text, View } from "react-native";

import { Paragraf } from "../komponen/Layar";

export interface DaftarItemProps<T> {
  /** Awalan path galat zod, mis. `experiences` → `experiences.0.title`. */
  awalanGalat: string;
  satuan: string;
  kosong: string;
  nilai: readonly T[];
  itemKosong: T;
  kolom: readonly KolomItem<T>[];
  galat: GalatKolom;
  onUbah: (nilai: T[]) => void;
  onUmumkan: (pesan: string) => void;
  batas?: number;
}

export function DaftarItem<T>(props: DaftarItemProps<T>) {
  const { nilai, satuan, kolom, galat, onUbah, onUmumkan, awalanGalat } = props;
  const { warna, skalaTeks } = useTokenA11y();

  return (
    <View style={{ gap: 12 }}>
      {nilai.length === 0 ? <Paragraf>{props.kosong}</Paragraf> : null}
      {nilai.map((item, indeks) => {
        const nomor = indeks + 1;
        return (
          // Indeks sebagai key disengaja: item CV tidak punya id, dan isi kolom
          // dipegang induk (terkendali), jadi tidak ada state lokal yang tertukar.
          <Kartu key={indeks} testID={`item-${awalanGalat}-${indeks}`}>
            <Text
              accessibilityRole="header"
              style={{
                color: warna.teks,
                fontSize: UKURAN_HURUF.isi * skalaTeks,
                fontWeight: "700",
              }}
            >
              {`${satuan[0]?.toUpperCase() ?? ""}${satuan.slice(1)} ${nomor}`}
            </Text>
            {kolom.map((k) => (
              <Masukan
                key={k.nama}
                testID={`kolom-${awalanGalat}-${indeks}-${k.nama}`}
                label={k.wajib ? `${k.label} (wajib)` : k.label}
                petunjuk={k.bantuan}
                nilai={k.baca(item)}
                ubahNilai={(v) => onUbah(ubahItem(nilai, indeks, k.tulis(item, v)))}
                galat={galat[`${awalanGalat}.${indeks}.${k.nama}`]}
                maxLength={k.maks}
                multiline={k.jenis === "area"}
                keyboardType={k.jenis === "angka" ? "number-pad" : "default"}
              />
            ))}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Tombol
                label={`Naikkan ${satuan} ${nomor}`}
                varian="sekunder"
                nonaktif={indeks === 0}
                onPress={() => {
                  const hasil = pindahItem(nilai, indeks, -1);
                  if (!hasil) return;
                  onUbah(hasil.daftar);
                  onUmumkan(`${satuan} ${nomor} dipindah ke urutan ${hasil.ke + 1}.`);
                }}
              />
              <Tombol
                label={`Turunkan ${satuan} ${nomor}`}
                varian="sekunder"
                nonaktif={indeks === nilai.length - 1}
                onPress={() => {
                  const hasil = pindahItem(nilai, indeks, 1);
                  if (!hasil) return;
                  onUbah(hasil.daftar);
                  onUmumkan(`${satuan} ${nomor} dipindah ke urutan ${hasil.ke + 1}.`);
                }}
              />
              <Tombol
                label={`Hapus ${satuan} ${nomor}`}
                varian="bahaya"
                onPress={() => {
                  onUbah(hapusItem(nilai, indeks));
                  onUmumkan(`${satuan} ${nomor} dihapus. Simpan untuk menyimpan perubahan.`);
                }}
              />
            </View>
          </Kartu>
        );
      })}
      <Tombol
        testID={`tambah-${awalanGalat}`}
        label={`Tambah ${satuan}`}
        varian="sekunder"
        nonaktif={props.batas !== undefined && nilai.length >= props.batas}
        onPress={() => {
          onUbah([...nilai, props.itemKosong]);
          onUmumkan(`${satuan} ${nilai.length + 1} ditambahkan di akhir daftar.`);
        }}
      />
    </View>
  );
}
