// Panel preferensi kanal notifikasi (PR-049b) — isi `/pengaturan/notifikasi`.
//
// TIDAK TAHU APA PUN TENTANG ROUTER MAUPUN DOM, syarat lapisan `features/`
// (features/README.md): klien diterima sebagai PROP, sama seperti
// `PanelAksesibilitas`.
//
// BEDA MENDASAR DARI PANEL AKSESIBILITAS, dan ini yang membentuk seluruh
// berkas: preferensi aksesibilitas berlaku SEKETIKA di layar (store menulis
// token `<html>`), sedangkan preferensi kanal tidak mengubah apa pun yang
// terlihat — akibatnya baru muncul berhari-hari kemudian, di kotak masuk
// seseorang. Karena itu di sini tidak ada store lokal, tidak ada penerapan
// optimistik, dan keadaan "tersimpan" harus dikatakan dengan kata-kata: ia
// satu-satunya umpan balik yang ada.
//
// SIMPAN OTOMATIS PER SAKELAR, tanpa tombol "Simpan" — mengikuti panel
// aksesibilitas, dan alasannya di sini bahkan lebih kuat: tombol simpan yang
// belum ditekan pada panel yang tidak berubah tampilannya berarti pengguna
// tidak punya satu pun cara mengetahui bahwa pilihannya belum berlaku.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationPrefs,
  notificationPrefsKeys,
  updateNotificationPrefs,
  type ApiClient,
} from "@nawasena/api-client";
import {
  kanalBerlaku,
  type NotificationChannelPrefs,
  type UpdateNotificationChannelPrefs,
} from "@nawasena/schemas";
import { KotakCentang } from "@nawasena/ui";
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";

/** Kedua kanal yang bisa diatur. In-app tidak ada di sini — lihat katalognya. */
const KANAL: readonly {
  kunci: keyof NotificationChannelPrefs;
  label: KunciTeks;
  bantuan: KunciTeks;
}[] = [
  {
    kunci: "email",
    label: "pengaturan.notifikasi.email",
    bantuan: "pengaturan.notifikasi.emailBantuan",
  },
  {
    kunci: "push",
    label: "pengaturan.notifikasi.push",
    bantuan: "pengaturan.notifikasi.pushBantuan",
  },
];

/**
 * Satu kode yang perlu kalimat sendiri — alasannya sama dengan panel
 * aksesibilitas: server sudah mengirim Bahasa Indonesia untuk sisanya
 * (`ERROR_CATALOG`, SDD §11), sedangkan `JARINGAN_GAGAL` lahir di klien.
 */
const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "pengaturan.notifikasi.galat",
};

export interface PanelKanalNotifikasiProps {
  klien: ApiClient;
  /** Klaim `sub` sesi — pelingkup key cache. Lihat `notificationPrefsKeys`. */
  sub: string | null;
}

export function PanelKanalNotifikasi({ klien, sub }: PanelKanalNotifikasiProps) {
  const t = useTeks();
  const queryClient = useQueryClient();
  const kunciCache = notificationPrefsKeys.me(sub);

  const prefs = useQuery({
    queryKey: kunciCache,
    queryFn: () => getNotificationPrefs(klien),
  });

  const simpan = useMutation({
    mutationFn: (perubahan: UpdateNotificationChannelPrefs) =>
      updateNotificationPrefs(klien, perubahan),
    // Jawaban server ditulis LANGSUNG ke cache, bukan lewat invalidasi.
    // Invalidasi memicu pembacaan kedua yang, selama ia berjalan, membuat
    // sakelarnya kembali sejenak ke nilai lama — kedipan yang pada sakelar
    // justru terbaca sebagai "pilihan saya tidak jadi".
    onSuccess: (baru) => {
      queryClient.setQueryData(kunciCache, baru);
    },
  });

  // TIDAK ada penerapan optimistik. Panel ini tidak mengubah apa pun yang
  // terlihat, jadi sakelar yang bergerak duluan lalu kembali saat gagal hanya
  // membuat pengguna ragu apakah ia benar-benar menekannya. Yang benar: sakelar
  // mengikuti keadaan yang BENAR-BENAR tersimpan, dan kalimat status di bawah
  // menjelaskan yang sedang berjalan.
  const berlaku = kanalBerlaku(prefs.data);

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2 border-0 p-0" disabled={prefs.isPending}>
        <legend className="mb-2 text-base font-semibold text-gray-900">
          {t("pengaturan.notifikasi.legenda")}
        </legend>

        {KANAL.map(({ kunci, label, bantuan }) => (
          <KotakCentang
            key={kunci}
            label={t(label)}
            bantuan={t(bantuan)}
            dicentang={berlaku[kunci]}
            onUbah={(dicentang) => {
              simpan.mutate({ [kunci]: dicentang });
            }}
          />
        ))}
      </fieldset>

      {/*
        Selalu dirender, juga saat isinya kosong: live region yang lahir BERSAMA
        pesannya kerap tidak terbaca sama sekali (pola yang sama dengan panel
        aksesibilitas dan `WilayahMemuat`).

        `status` (polite), bukan `alert`: menyimpan adalah akibat yang DIMINTA
        pengguna.
      */}
      <p role="status" className="text-base text-gray-900">
        {prefs.isPending
          ? t("pengaturan.notifikasi.memuat")
          : simpan.isPending
            ? t("pengaturan.notifikasi.menyimpan")
            : simpan.isSuccess
              ? t("pengaturan.notifikasi.tersimpan")
              : ""}
      </p>

      {prefs.isError ? (
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-base font-semibold text-gray-900">
            {pesanGalatApi(prefs.error, t, PER_KODE)}
          </p>
          <p className="text-base text-gray-900">{t("pengaturan.notifikasi.gagalMuat")}</p>
        </div>
      ) : null}

      {simpan.isError ? (
        // `role="alert"`: kegagalan ini tidak diminta siapa pun, jadi ia harus
        // TERDENGAR — bukan hanya terlihat.
        //
        // KALIMAT KEDUA-nya berbeda dari panel aksesibilitas, dan bedanya
        // penting: di sana pilihan pengguna TETAP berlaku di perangkatnya meski
        // gagal terkirim. Di sini tidak ada "perangkat ini" — kanal notifikasi
        // hanya hidup di akun, jadi gagal berarti benar-benar belum berubah.
        // Mengatakan sebaliknya akan membuat seseorang mengira ia sudah berhenti
        // menerima email padahal belum.
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-base font-semibold text-gray-900">
            {pesanGalatApi(simpan.error, t, PER_KODE)}
          </p>
          <p className="text-base text-gray-900">{t("pengaturan.notifikasi.belumBerubah")}</p>
        </div>
      ) : null}
    </div>
  );
}
