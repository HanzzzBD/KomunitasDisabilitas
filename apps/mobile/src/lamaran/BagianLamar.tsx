import { applicationsKeys, listMyApplications } from "@nawasena/api-client";
import type { Application } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { View } from "react-native";

import { apiClient } from "../api";
import { track } from "../analitik/instans";
import { Judul, Memuat, Paragraf, PesanStatus } from "../komponen/Layar";
import type { RootStackParamList } from "../navigation/types";
import { useSub } from "../query";
import { DialogLamar } from "./DialogLamar";
import { STATUS } from "./teks";

export function BagianLamar({ jobId, judul }: { jobId: string; judul: string }) {
  const sub = useSub();
  const qc = useQueryClient();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const pemicu = useRef<View>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [hasil, setHasil] = useState<Application>();
  const [pesan, setPesan] = useState<string>();
  const sudah = useQuery({
    queryKey: applicationsKeys.myList(sub, { jobId }),
    queryFn: () => listMyApplications(apiClient, { jobId, limit: 1 }),
    retry: false,
  });
  const lamaran = sudah.data?.data[0] ?? hasil;
  return (
    <>
      <Judul tingkat={2}>Cara melamar</Judul>
      <PesanStatus pesan={pesan} />
      {sudah.isPending ? (
        <Memuat label="Memeriksa lamaran Anda" />
      ) : lamaran ? (
        <>
          <Paragraf>Anda sudah melamar lowongan ini. Status: {STATUS[lamaran.status]}.</Paragraf>
          <Tombol
            ref={pemicu}
            label="Lihat lamaran"
            onPress={() =>
              nav.navigate("Utama", {
                screen: "Lamaran",
                params: { screen: "LamaranDetail", params: { id: lamaran.id }, initial: false },
              })
            }
          />
        </>
      ) : (
        <Tombol
          ref={pemicu}
          label="Lamar lowongan ini"
          testID="tombol-lamar"
          onPress={() => setTerbuka(true)}
        />
      )}
      <DialogLamar
        terbuka={terbuka}
        jobId={jobId}
        judul={judul}
        pemicu={pemicu}
        tutup={() => setTerbuka(false)}
        selesai={(a) => {
          setHasil(a);
          setTerbuka(false);
          setPesan("Lamaran berhasil dikirim.");
          void qc.invalidateQueries({ queryKey: ["my-applications"] });
          track("lamar");
          nav.navigate("Utama", {
            screen: "Lamaran",
            params: { screen: "LamaranDetail", params: { id: a.id }, initial: false },
          });
        }}
        sudahAda={() => {
          setTerbuka(false);
          setPesan("Anda sudah melamar lowongan ini.");
          void sudah.refetch();
        }}
      />
    </>
  );
}
