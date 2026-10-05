// Gagal memuat data layar (PR-092): pesan + Coba lagi, bukan layar kosong.
import { Tombol } from "@nawasena/ui-native";

import { pesanGalat } from "../auth/alur-masuk";
import { PesanStatus } from "./Layar";

export function GagalMuat(props: { galat: unknown; ulang: () => void }) {
  return (
    <>
      <PesanStatus galat pesan={pesanGalat(props.galat)} />
      <Tombol label="Coba lagi" varian="sekunder" onPress={props.ulang} />
    </>
  );
}
