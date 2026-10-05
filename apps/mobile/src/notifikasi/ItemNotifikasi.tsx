import type { Notification } from "@nawasena/schemas";
import { Kartu, Tombol } from "@nawasena/ui-native";
import { View } from "react-native";
import { Judul, Paragraf } from "../komponen/Layar";
import { antreanTautan } from "../navigation/PantauTautan";
import { labelItem, WAKTU_NOTIFIKASI } from "./teks";
import { tujuanNotifikasi } from "./tujuan";

export function ItemNotifikasi(props: {
  item: Notification;
  bahasa: "id" | "id-simple";
  sibuk: boolean;
  tandai: () => void;
}) {
  const { item: n, bahasa } = props;
  const judul = n.title[bahasa];
  const tujuan = tujuanNotifikasi(n);
  return (
    <Kartu testID={`notifikasi-${n.id}`}>
      <View accessible accessibilityLabel={labelItem(n, bahasa)} testID={`isi-notifikasi-${n.id}`}>
        <Judul tingkat={2}>{judul}</Judul>
        <Paragraf>{n.body[bahasa]}</Paragraf>
        <Paragraf lemah>{WAKTU_NOTIFIKASI.format(new Date(n.createdAt))} WIB</Paragraf>
        <Paragraf tebal>{n.readAt ? "Sudah dibaca" : "Belum dibaca"}</Paragraf>
      </View>
      {tujuan ? (
        <Tombol
          label={`${tujuan.layar === "LamaranDetail" ? "Lihat lamaran" : "Lihat CV"}: ${judul}`}
          varian="sekunder"
          nonaktif={props.sibuk}
          onPress={() => antreanTautan.tujuan(tujuan)}
        />
      ) : null}
      <Tombol
        testID={`tandai-notifikasi-${n.id}`}
        label={`${n.readAt ? "Sudah dibaca" : "Tandai dibaca"}: ${judul}`}
        varian="sekunder"
        nonaktif={n.readAt !== null || props.sibuk}
        onPress={props.tandai}
      />
    </Kartu>
  );
}
