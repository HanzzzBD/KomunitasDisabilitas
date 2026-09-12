// Penjaga PERAN — AC PR-052: "Seeker membuka /admin → ditolak (redirect +
// pesan)". Terpisah dari `Terlindungi` (yang menjaga SESI) dengan sengaja: dua
// pertanyaan berbeda, "apakah ada sesi yang sah" dan "apakah sesi ini boleh
// masuk ke bagian ini". Dipasang DI ATAS `Terlindungi` di `routes/admin.tsx`,
// tidak menggantikannya — by the time komponen ini merender, sesi sudah pasti
// ada.
//
// GUARD FE INI ADALAH UX, BUKAN KEAMANAN (Security Considerations PR-052).
// Keamanan sesungguhnya ada di RBAC backend (`access.role("admin")`, PR-019):
// server menolak 403 apa pun yang dikirim klien, terlepas dari apakah guard
// ini terpasang, dilewati, atau dirusak lewat DevTools. Yang dicegah guard ini
// hanyalah pengalaman buruk — seeker yang menebak alamat `/admin` melihat
// layar kosong/galat yang membingungkan alih-alih pesan yang jelas.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { getMe, usersKeys } from "@nawasena/api-client";
import { WilayahMemuat } from "@nawasena/ui";
import { useKlienApi } from "../../app/klien-api.js";
import { useTeks } from "../i18n/index.js";

export interface PenjagaAdminProps {
  children: ReactNode;
}

/** Dibaca `TataLetak` di halaman tujuan pengalihan — lihat catatannya di sana. */
export interface StatePengalihanAdmin {
  pesanAkses: string;
}

export function PenjagaAdmin({ children }: PenjagaAdminProps) {
  const klien = useKlienApi();
  const t = useTeks();

  // `Terlindungi` sudah menjamin status "masuk" sebelum komponen ini
  // dipasang, jadi `/me` semestinya berhasil. Query ini TIDAK mendaftarkan
  // penanganan error tersendiri: baris di bawah memperlakukan galat SAMA
  // dengan "bukan admin" (fail-closed) — pengguna yang perannya gagal
  // dipastikan tidak boleh melihat isi admin hanya karena jaringan bermasalah.
  const { data, isPending, isError } = useQuery({
    queryKey: usersKeys.me(),
    queryFn: () => getMe(klien),
  });

  if (isPending) {
    return (
      <WilayahMemuat memuat label={t("admin.memuat")}>
        {null}
      </WilayahMemuat>
    );
  }

  const admin = !isError && data?.data.role === "admin";
  if (!admin) {
    const state: StatePengalihanAdmin = { pesanAkses: t("admin.ditolak") };
    // `replace`: alasan yang sama dengan `Terlindungi` — halaman yang ditolak
    // tidak boleh tertinggal di riwayat sebagai jebakan tombol kembali.
    return <Navigate to="/" replace state={state} />;
  }

  return <>{children}</>;
}
