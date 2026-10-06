import {
  aiKeys,
  finalizeAiChatSession,
  getAiChatSession,
  getAiQuota,
  resumesKeys,
  startAiChatSession,
} from "@nawasena/api-client";
import { AI_CHAT_LIMITS, type AiChatSession } from "@nawasena/schemas";
import { Kartu, Masukan, Tombol } from "@nawasena/ui-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "../../api";
import { kirimPesanCv } from "../../cv/chat";
import { useBuatCvDariProfil } from "../../cv/use-buat-cv";
import { GagalMuat } from "../../komponen/GagalMuat";
import { Judul, LayarGulir, Memuat, Paragraf, PesanStatus } from "../../komponen/Layar";
import type { RootStackParamList } from "../../navigation/types";
import { useSub } from "../../query";

type Props = NativeStackScreenProps<RootStackParamList, "CvChat">;

export function CvChatScreen({ navigation }: Props) {
  const sub = useSub();
  const qc = useQueryClient();
  const key = aiKeys.sesiChat(sub);
  const [pesan, setPesan] = useState("");
  const [draf, setDraf] = useState("");
  const [pengumuman, setPengumuman] = useState<string>();
  const batal = useRef<AbortController | null>(null);
  const sesi = useQuery({
    queryKey: key,
    queryFn: () => startAiChatSession(apiClient),
    retry: false,
    staleTime: Infinity,
  });
  const kuota = useQuery({ queryKey: aiKeys.kuota(sub), queryFn: () => getAiQuota(apiClient) });
  const sessionId = sesi.data?.id;

  const muatUlang = useCallback(async () => {
    if (sessionId)
      qc.setQueryData(aiKeys.sesiChat(sub), await getAiChatSession(apiClient, sessionId));
  }, [qc, sessionId, sub]);
  useFocusEffect(
    useCallback(() => {
      void muatUlang().catch(() => undefined);
      return () => batal.current?.abort();
    }, [muatUlang]),
  );

  const kirim = useMutation({
    mutationFn: async (message: string) => {
      if (!sessionId) return;
      const controller = new AbortController();
      batal.current = controller;
      setDraf("");
      setPengumuman("AI sedang menulis jawaban.");
      try {
        await kirimPesanCv({
          klien: apiClient,
          sessionId,
          message,
          signal: controller.signal,
          muatUlang,
          onTurn: (turn) => {
            qc.setQueryData<AiChatSession>(aiKeys.sesiChat(sub), (lama) =>
              lama
                ? {
                    ...lama,
                    turns: [...lama.turns.filter((t) => t.seq !== turn.seq), turn].sort(
                      (a, b) => a.seq - b.seq,
                    ),
                  }
                : lama,
            );
            if (turn.role === "user") setPesan("");
            else {
              setDraf("");
              setPengumuman(turn.content);
            }
          },
          onToken: (token) => setDraf((lama) => lama + token),
        });
      } finally {
        setDraf("");
        void qc.invalidateQueries({ queryKey: aiKeys.kuota(sub) });
      }
    },
  });
  const finalisasi = useMutation({
    mutationFn: () => finalizeAiChatSession(apiClient, sessionId ?? ""),
    onSuccess: () => {
      void muatUlang();
    },
  });
  const pantau = useQuery({
    queryKey: [...key, "pantau", sessionId],
    queryFn: () => getAiChatSession(apiClient, sessionId ?? ""),
    enabled: sesi.data?.status === "finalizing",
    refetchInterval: 3000,
  });
  useEffect(() => {
    if (pantau.data && pantau.data.status !== "finalizing") {
      qc.setQueryData(aiKeys.sesiChat(sub), pantau.data);
      void qc.invalidateQueries({ queryKey: resumesKeys.list(sub) });
      void qc.invalidateQueries({ queryKey: aiKeys.kuota(sub) });
    }
  }, [pantau.data, qc, sub]);

  const manual = useBuatCvDariProfil(sub, (cv) => navigation.navigate("CvEditor", { id: cv.id }));
  const galat = sesi.error ?? kirim.error ?? finalisasi.error ?? pantau.error ?? manual.error;
  const s = sesi.data;
  const chatKuota = kuota.data?.fitur.find((f) => f.fitur === "cv_chat");
  const aktif = s?.status === "active";

  return (
    <LayarGulir testID="layar-cv-chat">
      <Judul>Buat CV dengan AI</Judul>
      <Paragraf>
        Ceritakan pendidikan, pengalaman, dan kemampuan Anda. AI membantu menyusunnya. Periksa
        hasilnya sebelum memakai CV.
      </Paragraf>
      {chatKuota ? (
        <Paragraf lemah>
          Sisa pesan AI hari ini: {chatKuota.sisa} dari {chatKuota.batas}.
        </Paragraf>
      ) : null}
      {sesi.isPending ? <Memuat label="Memuat percakapan CV" /> : null}
      <PesanStatus pesan={pengumuman} />
      {galat ? (
        <GagalMuat
          galat={galat}
          ulang={() => {
            kirim.reset();
            finalisasi.reset();
            manual.reset();
            if (sesi.isError) void sesi.refetch();
            else void muatUlang();
          }}
        />
      ) : null}
      {s?.turns.map((turn) => (
        <Kartu key={turn.seq}>
          <Paragraf tebal>{turn.role === "user" ? "Anda" : "Asisten CV"}</Paragraf>
          <Paragraf>{turn.content}</Paragraf>
        </Kartu>
      ))}
      {draf ? (
        <Kartu>
          <Paragraf tebal>Asisten CV sedang menulis</Paragraf>
          <Paragraf>{draf}</Paragraf>
        </Kartu>
      ) : null}
      {aktif ? (
        <>
          <Masukan
            label="Pesan untuk AI"
            nilai={pesan}
            ubahNilai={setPesan}
            multiline
            maxLength={AI_CHAT_LIMITS.maxContentChars}
            petunjuk="Contoh: Saya pernah membantu mencatat penjualan di toko."
          />
          <Tombol
            label="Kirim pesan"
            sibuk={kirim.isPending}
            nonaktif={!pesan.trim() || finalisasi.isPending}
            onPress={() => kirim.mutate(pesan.trim())}
          />
          <Tombol
            label={s.extractionFailedAt ? "Coba susun CV lagi" : "Susun draft CV"}
            varian="sekunder"
            sibuk={finalisasi.isPending}
            nonaktif={kirim.isPending || !s.turns.some((turn) => turn.role === "user")}
            onPress={() => finalisasi.mutate()}
          />
          {s.extractionFailedAt ? (
            <PesanStatus
              pesan="Draft belum berhasil dibuat. Percakapan Anda tersimpan. Coba susun lagi."
              galat
            />
          ) : null}
        </>
      ) : null}
      {s?.status === "finalizing" ? (
        <PesanStatus pesan="AI sedang menyusun draft CV. Tunggu sebentar." />
      ) : null}
      {s?.status === "finalized" ? (
        <>
          <PesanStatus
            pesan={
              s.resumeId
                ? "Draft CV siap. Periksa dan ubah isinya, lalu buat PDF."
                : "Draft ini sudah dihapus."
            }
          />
          {s.resumeId ? (
            <Tombol
              label="Periksa CV dan buat PDF"
              onPress={() => navigation.navigate("CvEditor", { id: s.resumeId! })}
            />
          ) : null}
          <Tombol
            label="Mulai percakapan baru"
            varian="sekunder"
            onPress={() => {
              setPengumuman(undefined);
              void sesi.refetch();
            }}
          />
        </>
      ) : null}
      <Tombol
        label="Buat CV dari profil"
        varian="sekunder"
        sibuk={manual.isPending}
        nonaktif={kirim.isPending || finalisasi.isPending || s?.status === "finalizing"}
        onPress={() => manual.mutate()}
      />
    </LayarGulir>
  );
}
