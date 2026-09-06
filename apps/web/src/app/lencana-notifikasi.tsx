// Lencana notifikasi di kerangka aplikasi (PR-050) — AC-1 dan AC-2.
//
// HIDUP DI `app/`, BUKAN DI `features/`: ia bagian kerangka, dipasang
// `TataLetak`, dan memakai hook lapisan `app/` (`useKlienApi`). Teksnya pun
// datang dari katalog SHELL yang eager — lencana yang membacakan kunci mentahnya
// sendiri di halaman yang belum memuat katalog notifikasi adalah lencana yang
// rusak justru pada pengguna screen reader.
//
// SATU ANGKA, BUKAN SATU HALAMAN. Query di sini meminta `limit=1` dan hanya
// memakai `meta.unreadCount`; halaman center punya query-nya sendiri
// (`useInfiniteQuery`). Menyatukan keduanya berarti kerangka aplikasi ikut
// mengunduh dan menyimpan seluruh riwayat yang tidak pernah ia tampilkan — di
// SETIAP halaman.
//
// Konsistensi kedua angka dijaga di satu arah: setiap mutasi di halaman center
// menulis `unreadCount` jawaban server ke cache lencana ini. Angkanya karena itu
// selalu berasal dari server, tidak pernah dihitung sendiri di dua tempat.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { listNotifications, notificationsKeys } from "@nawasena/api-client";
import { useKlienApi } from "./klien-api.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { useTeks } from "../shared/i18n/index.js";

export function LencanaNotifikasi() {
  const t = useTeks();
  const klien = useKlienApi();
  const sub = idPenggunaSaatIni();

  const belumDibaca = useQuery({
    queryKey: notificationsKeys.lencana(sub),
    queryFn: async () => (await listNotifications(klien, { limit: 1 })).meta.unreadCount,
    // MENIMPA bawaan `refetchOnWindowFocus: false` (query-client.ts), dan
    // hanya di sini. Alasan bawaan itu — "konten yang berubah sendiri di bawah
    // kursor menghilangkan konteks yang sedang dibaca" — tidak berlaku bagi
    // satu angka di navigasi yang tidak sedang dibaca siapa pun; sementara AC-1
    // menuntut lencananya akurat TANPA muat ulang. Daftar notifikasinya sendiri
    // tetap memakai bawaan: ia justru konten yang sedang dibaca.
    refetchOnWindowFocus: true,
  });

  const jumlah = belumDibaca.data ?? 0;

  return (
    <>
      <Link
        to="/notifikasi"
        // Nama aksesibelnya kalimat utuh ("Notifikasi, 3 belum dibaca"), bukan
        // kata "Notifikasi" bersebelahan dengan angka: yang terakhir dibacakan
        // sebagai dua hal terpisah dan angkanya kehilangan artinya.
        aria-label={
          jumlah > 0
            ? t("shell.notifikasi.lencana", { jumlah })
            : t("shell.notifikasi.lencanaKosong")
        }
        className="inline-flex min-h-sentuh items-center gap-2 rounded-md border border-gray-400 px-4 text-base text-gray-900"
      >
        <span aria-hidden="true">{t("shell.notifikasi.lencanaKosong")}</span>
        {jumlah > 0 ? (
          // `aria-hidden`: angkanya sudah ikut di `aria-label` tautan. Tanpa
          // ini screen reader membacakannya dua kali.
          //
          // Angka BESAR dibatasi "99+": lencana tiga digit memaksa navigasinya
          // membungkus baris pada 320 px dengan teks 200% (WCAG 1.4.10 diukur
          // di sana), dan jumlah persisnya tidak menambah apa pun — yang
          // dijawab lencana adalah "banyak", bukan "berapa".
          <span
            aria-hidden="true"
            className="inline-flex min-w-6 justify-center rounded-full bg-gray-900 px-2 text-sm font-semibold text-white"
          >
            {jumlah > 99 ? "99+" : jumlah}
          </span>
        ) : null}
      </Link>
      <PengumumanNotifikasiBaru jumlah={belumDibaca.isSuccess ? jumlah : null} />
    </>
  );
}

/**
 * Umumkan notifikasi baru TANPA mencuri fokus (AC-2).
 *
 * `role="status"` (polite), bukan `alert`: kabar baru tidak boleh menyela
 * kalimat yang sedang dibaca pengguna. Fokus tidak pernah disentuh — pengguna
 * yang sedang mengisi formulir tetap di kolomnya.
 *
 * BATCHED, dan itulah mitigasi risiko "aria-live spam saat burst" yang ditulis
 * dokumen phase: yang diumumkan adalah SELISIH sebagai satu kalimat ("3
 * notifikasi baru"), bukan satu pengumuman per notifikasi. Lima notifikasi yang
 * tiba bersamaan terdengar sekali.
 *
 * TIDAK mengumumkan saat pemuatan PERTAMA. Nilai awal tidak punya "sebelumnya",
 * dan mengumumkannya berarti setiap perpindahan halaman membacakan ulang jumlah
 * yang sudah lama diketahui pengguna.
 */
function PengumumanNotifikasiBaru({ jumlah }: { jumlah: number | null }) {
  const t = useTeks();
  const sebelumnya = useRef<number | null>(null);
  const [kalimat, setKalimat] = useState("");

  useEffect(() => {
    if (jumlah === null) return;
    const lalu = sebelumnya.current;
    sebelumnya.current = jumlah;

    // Pemuatan pertama, dan penurunan (pengguna menandai dibaca) sama-sama
    // diam. Yang kedua penting: "0 notifikasi baru" bukan kabar, dan
    // mengumumkannya membuat setiap penandaan berbunyi.
    if (lalu === null || jumlah <= lalu) return;
    setKalimat(t("shell.notifikasi.baru", { jumlah: jumlah - lalu }));
  }, [jumlah, t]);

  // Selalu dirender, juga saat kosong: live region yang lahir BERSAMA pesannya
  // kerap tidak terbaca sama sekali (pola yang sama dengan `WilayahMemuat` dan
  // panel aksesibilitas).
  //
  // `sr-only` — ia pengumuman, bukan tampilan. Yang terlihat sudah berubah
  // sendiri: angka di lencana.
  return (
    <p role="status" className="sr-only">
      {kalimat}
    </p>
  );
}
