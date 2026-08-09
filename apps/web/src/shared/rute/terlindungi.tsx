// Route guard — AC PR-030 nomor 5: "Route terlindungi redirect ke login dengan
// kembali ke tujuan awal".
//
// TIGA KEADAAN, BUKAN DUA, dan keadaan ketigalah yang membuat guard ini benar.
// Guard yang hanya mengenal "masuk" atau "keluar" akan membaca "keluar" pada
// milidetik pertama setiap kali halaman dimuat — sebelum jawaban dari
// `/auth/refresh` tiba — lalu melempar pengguna yang SEDANG login ke halaman
// masuk. Cacatnya tidak muncul saat mengembangkan (kita jarang me-reload
// setelah login) dan muncul pada setiap pengguna sungguhan.
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { WilayahMemuat } from "@nawasena/ui";
import { useStoreSesi } from "../sesi/store.js";
import { useTeks } from "../i18n/index.js";
import { tautanMasuk } from "./tujuan.js";

export interface TerlindungiProps {
  children: ReactNode;
}

export function Terlindungi({ children }: TerlindungiProps) {
  // Berlangganan HANYA `status`. Berlangganan seluruh store berarti ikut
  // dirender ulang oleh perubahan yang tidak ada hubungannya dengan guard.
  const status = useStoreSesi((s) => s.status);
  const lokasi = useLocation();
  const t = useTeks();

  if (status === "memulihkan") {
    // Bukan layar kosong: pemulihan bisa memakan waktu di jaringan lambat, dan
    // halaman yang diam tanpa keterangan terbaca sebagai halaman yang rusak.
    // `WilayahMemuat` (PR-028b) menandai wilayahnya `aria-busy` dan
    // mengumumkan sebabnya lewat teks, bukan lewat animasi.
    return (
      <WilayahMemuat memuat label={t("shell.sesi.memulihkan")}>
        {null}
      </WilayahMemuat>
    );
  }

  if (status === "keluar") {
    // `replace`, BUKAN push. Tanpa itu, halaman terlindungi tetap tertinggal di
    // riwayat: menekan tombol kembali sesudah masuk akan mengembalikan pengguna
    // ke sini, yang mengalihkannya lagi — jebakan yang terasa seperti tombol
    // kembali yang rusak.
    return <Navigate to={tautanMasuk(lokasi)} replace />;
  }

  return <>{children}</>;
}
