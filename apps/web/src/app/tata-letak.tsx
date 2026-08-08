// Kerangka yang membungkus SETIAP halaman.
//
// Dipasang sebagai route induk, bukan disalin ke tiap halaman: banner luring
// yang harus diingat setiap halaman adalah banner yang suatu saat akan
// terlupakan di salah satunya.
import { Outlet, useNavigation } from "react-router";
import { BannerLuring } from "./banner-luring.js";
import { useTeks } from "../shared/i18n/index.js";

export function TataLetak() {
  const t = useTeks();

  // Route dimuat lazy, jadi berpindah halaman memakan waktu yang bisa terasa
  // di jaringan lambat. Tanpa penanda, layar tampak beku dan pengguna menekan
  // tautannya berulang kali.
  const sedangMemuat = useNavigation().state !== "idle";

  return (
    <>
      <BannerLuring />

      {/*
        `aria-busy` pada wilayah yang SEDANG berubah — bukan pada <body> dan
        bukan pada elemen terpisah. Ia memberi tahu screen reader bahwa isi di
        dalamnya belum final, sehingga pembacaannya tidak dimulai di tengah
        pergantian konten.

        Skeleton visual (bentuk abu-abu yang meniru tata letak) adalah komponen
        `packages/ui` dan lahir di PR-028. Yang wajib ada SEKARANG adalah
        penandanya, sebab tanpa itu setiap halaman berikutnya lahir dengan
        transisi yang bisu.
      */}
      <div aria-busy={sedangMemuat}>
        {sedangMemuat ? (
          // Teks, bukan animasi berputar: pengguna dengan `prefers-reduced-motion`
          // tetap terlayani, dan teksnya terbaca screen reader apa adanya.
          <p>{t("shell.memuat")}</p>
        ) : null}
        <Outlet />
      </div>
    </>
  );
}
