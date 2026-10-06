import {
  getNotificationPrefs,
  notificationPrefsKeys,
  updateNotificationPrefs,
} from "@nawasena/api-client";
import { kanalBerlaku, type UpdateNotificationChannelPrefs } from "@nawasena/schemas";
import { KotakCentang, Tombol } from "@nawasena/ui-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api";
import { Judul, Paragraf, PesanStatus } from "../komponen/Layar";
import { useSub } from "../query";
import { AktifkanPush } from "../push/AktifkanPush";

export function PilihanKanal() {
  const sub = useSub();
  const cache = useQueryClient();
  const key = notificationPrefsKeys.me(sub);
  const prefs = useQuery({
    queryKey: key,
    queryFn: () => getNotificationPrefs(apiClient),
    enabled: sub !== null,
  });
  const simpan = useMutation({
    mutationFn: (input: UpdateNotificationChannelPrefs) =>
      updateNotificationPrefs(apiClient, input),
    onSuccess: (data) => cache.setQueryData(key, data),
  });
  const berlaku = kanalBerlaku(prefs.data);
  const disabled = !sub || !prefs.isSuccess || simpan.isPending;
  return (
    <>
      <Judul tingkat={2}>Notifikasi</Judul>
      <Paragraf>
        Kabar selalu tersedia di daftar Notifikasi. Pilih juga cara menerima kabar berikutnya.
      </Paragraf>
      <KotakCentang
        label="Kirim kabar lewat email"
        bantuan="Email dikirim ke alamat terverifikasi di akun Anda. Login Google memakai alamat terverifikasi."
        dicentang={berlaku.email}
        nonaktif={disabled}
        onUbah={(email) => simpan.mutate({ email })}
      />
      <KotakCentang
        label="Kirim kabar ke HP"
        bantuan="Pilihan ini berlaku untuk semua HP yang terdaftar di akun Anda."
        dicentang={berlaku.push}
        nonaktif={disabled}
        onUbah={(push) => simpan.mutate({ push })}
      />
      <PesanStatus
        pesan={
          prefs.isPending
            ? "Memuat pilihan notifikasi."
            : simpan.isPending
              ? "Menyimpan pilihan."
              : simpan.isError
                ? "Pilihan belum tersimpan. Periksa koneksi, lalu ubah lagi."
                : simpan.isSuccess
                  ? "Pilihan notifikasi tersimpan."
                  : undefined
        }
        galat={simpan.isError}
      />
      {prefs.isError ? (
        <>
          <PesanStatus pesan="Pilihan notifikasi belum bisa dimuat." galat />
          <Tombol
            label="Muat ulang pilihan notifikasi"
            onPress={() => {
              void prefs.refetch();
            }}
          />
        </>
      ) : null}
      <AktifkanPush />
    </>
  );
}
