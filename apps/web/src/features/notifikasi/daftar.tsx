// Notification center — daftar notifikasi (PR-050).
//
// TIDAK TAHU APA PUN TENTANG ROUTER MAUPUN DOM, syarat lapisan `features/`
// (features/README.md): klien dan identitas sesi diterima sebagai PROP.
//
// KALIMATNYA DATANG DARI SERVER, bukan dari katalog i18n. Setiap notifikasi
// membawa `title` dan `body` dalam KEDUA varian bahasa sekaligus, dan komponen
// ini memilih varian yang sedang berlaku (`useModeBahasa`). Itulah yang membuat
// mode teks sederhana bisa dinyalakan kapan saja dan daftar yang SUDAH terbuka
// ikut berubah seketika — tanpa satu permintaan pun (alasan lengkapnya di
// `packages/schemas/src/notifications.ts`).
//
// MARK-READ OPTIMISTIK DENGAN ROLLBACK (AC-3). Menandai dibaca adalah tindakan
// yang akibatnya harus terlihat SEKETIKA — jeda satu perjalanan jaringan pada
// tombol yang ditekan berulang kali membuat pengguna menekannya lagi. Yang
// dikembalikan saat gagal bukan hanya barisnya, melainkan juga lencananya:
// keduanya berubah bersama, jadi keduanya harus kembali bersama.
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsKeys,
  type ApiClient,
} from "@nawasena/api-client";
import type { Notification, NotificationListResponse } from "@nawasena/schemas";
import { KeadaanKosong, Tombol, WilayahMemuat } from "@nawasena/ui";
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import { useModeBahasa, useTeks } from "../../shared/i18n/index.js";
import { tautanNotifikasi } from "./tautan.js";

/** Satu halaman = 20. Cukup untuk mengisi layar, cukup kecil untuk cepat tiba. */
const PER_HALAMAN = 20;

const PER_KODE: PetaGalat = { JARINGAN_GAGAL: "notifikasi.galat" };
const PER_KODE_TANDAI: PetaGalat = { JARINGAN_GAGAL: "notifikasi.galatTandai" };

type Halaman = NotificationListResponse;

/**
 * Tanggal yang dibacakan utuh, bukan "2026-09-06".
 *
 * `toLocaleString` dengan zona WIB: server menyimpan UTC, dan tanggal yang
 * bergeser satu hari bagi pengguna Indonesia adalah kesalahan yang tidak pernah
 * terlihat oleh yang menulisnya (alasan yang sama dengan nama berkas ekspor,
 * PR-033b).
 */
function waktuTerbaca(iso: string, mode: string): string {
  return new Date(iso).toLocaleString(mode === "id-simple" ? "id-ID" : "id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}

export interface DaftarNotifikasiProps {
  klien: ApiClient;
  /** Klaim `sub` sesi — pelingkup key cache. Lihat `notificationsKeys`. */
  sub: string | null;
  /**
   * Komponen tautan. Disuntik supaya lapisan `features/` tidak menyentuh
   * react-router (features/README.md) — dan supaya test bisa merendernya tanpa
   * memasang router sama sekali.
   */
  Tautan: (props: { ke: string; children: React.ReactNode }) => React.ReactElement;
}

export function DaftarNotifikasi({ klien, sub, Tautan }: DaftarNotifikasiProps) {
  const t = useTeks();
  const { mode } = useModeBahasa();
  const queryClient = useQueryClient();
  const [hanyaBelumDibaca, setHanyaBelumDibaca] = useState(false);

  const kunci = notificationsKeys.daftar(sub, hanyaBelumDibaca);

  const daftar = useInfiniteQuery({
    queryKey: kunci,
    queryFn: ({ pageParam }) =>
      listNotifications(klien, {
        limit: PER_HALAMAN,
        unreadOnly: hanyaBelumDibaca,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (terakhir: Halaman) => terakhir.meta.nextCursor ?? undefined,
  });

  /** Tulis `unreadCount` server ke cache lencana — SELALU dari server. */
  function segarkanLencana(unreadCount: number) {
    queryClient.setQueryData(notificationsKeys.lencana(sub), unreadCount);
  }

  const tandai = useMutation({
    mutationFn: (id: string) => markNotificationRead(klien, id),
    /**
     * Optimistik: barisnya ditandai dibaca SEBELUM server menjawab.
     *
     * Yang dikembalikan sebagai konteks adalah SELURUH isi cache kedua kunci
     * (semua + belum dibaca) apa adanya, bukan hanya baris yang disentuh. Cukup
     * mengembalikan barisnya saja akan meninggalkan `unreadCount` di halaman
     * lain pada nilai yang sudah dikurangi — dan lencana yang salah setelah
     * kegagalan justru lebih membingungkan daripada baris yang salah.
     */
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: kunci });
      const sebelum = queryClient.getQueryData<{ pages: Halaman[]; pageParams: unknown[] }>(kunci);
      const lencanaSebelum = queryClient.getQueryData<number>(notificationsKeys.lencana(sub));

      queryClient.setQueryData<{ pages: Halaman[]; pageParams: unknown[] }>(kunci, (lama) => {
        if (lama === undefined) return lama;
        return {
          ...lama,
          pages: lama.pages.map((halaman) => ({
            ...halaman,
            data: halaman.data.map((n) =>
              n.id === id && n.readAt === null
                ? { ...n, readAt: new Date().toISOString() }
                : n,
            ),
            meta: { ...halaman.meta, unreadCount: Math.max(0, halaman.meta.unreadCount - 1) },
          })),
        };
      });
      if (lencanaSebelum !== undefined) segarkanLencana(Math.max(0, lencanaSebelum - 1));

      return { sebelum, lencanaSebelum };
    },
    onError: (_err, _id, konteks) => {
      // Dikembalikan APA ADANYA ke keadaan sebelum tindakan — bukan dihitung
      // mundur. Perhitungan mundur akan salah bila jawaban lain tiba di antara
      // keduanya, dan salahnya tidak akan pernah terlihat sampai seseorang
      // menandai dua notifikasi pada saat yang hampir sama.
      if (konteks?.sebelum !== undefined) queryClient.setQueryData(kunci, konteks.sebelum);
      if (konteks?.lencanaSebelum !== undefined) segarkanLencana(konteks.lencanaSebelum);
    },
    onSuccess: (jawaban) => {
      segarkanLencana(jawaban.meta.unreadCount);
    },
    onSettled: () => {
      // Kedua saringan dibatalkan, bukan hanya yang sedang tampil: baris yang
      // baru dibaca harus hilang dari daftar "belum dibaca" meski pengguna
      // sedang melihat "semua".
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.daftar(sub, true) });
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.daftar(sub, false) });
    },
  });

  const tandaiSemua = useMutation({
    mutationFn: () => markAllNotificationsRead(klien),
    // TIDAK optimistik, berbeda dari `tandai`. "Tandai semua" menyentuh baris
    // yang belum tentu ada di cache (halaman yang belum diunduh), jadi keadaan
    // optimistiknya akan berbohong tentang bagian yang tidak terlihat. Yang
    // dikerjakan justru sebaliknya: tunggu jawabannya, lalu pakai angka server.
    onSuccess: (jawaban) => {
      segarkanLencana(jawaban.meta.unreadCount);
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.daftar(sub, true) });
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.daftar(sub, false) });
    },
  });

  const halaman = daftar.data?.pages ?? [];
  const items = halaman.flatMap((h) => h.data);
  const belumDibaca = halaman[0]?.meta.unreadCount ?? 0;

  // Lencana kerangka aplikasi ikut disegarkan begitu daftar terbaca: keduanya
  // membaca sumber yang sama, dan membiarkannya menunggu refetch sendiri berarti
  // pengguna melihat dua angka berbeda di satu layar.
  const lencanaTerakhir = useRef<number | null>(null);
  useEffect(() => {
    if (halaman.length === 0) return;
    if (lencanaTerakhir.current === belumDibaca) return;
    lencanaTerakhir.current = belumDibaca;
    segarkanLencana(belumDibaca);
    // `segarkanLencana` stabil sepanjang render ini; hanya angkanya yang berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belumDibaca, halaman.length]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/*
          Saringan sebagai dua tombol ber-`aria-pressed`, bukan dropdown:
          keduanya terlihat sekaligus, keduanya terjangkau satu Tab, dan
          keadaannya terbaca tanpa harus dibuka lebih dulu.
        */}
        <div role="group" aria-label={t("notifikasi.saring.label")} className="flex gap-2">
          <Tombol
            varian={hanyaBelumDibaca ? "sekunder" : "utama"}
            aria-pressed={!hanyaBelumDibaca}
            onClick={() => {
              setHanyaBelumDibaca(false);
            }}
          >
            {t("notifikasi.saring.semua")}
          </Tombol>
          <Tombol
            varian={hanyaBelumDibaca ? "utama" : "sekunder"}
            aria-pressed={hanyaBelumDibaca}
            onClick={() => {
              setHanyaBelumDibaca(true);
            }}
          >
            {t("notifikasi.saring.belumDibaca")}
          </Tombol>
        </div>

        <Tombol
          varian="sekunder"
          // Dimatikan saat tidak ada yang belum dibaca: tombol yang bisa ditekan
          // tetapi tidak mengubah apa pun adalah tombol yang membuat orang
          // meragukan apakah tekanannya terdaftar.
          disabled={belumDibaca === 0 || tandaiSemua.isPending}
          onClick={() => {
            tandaiSemua.mutate();
          }}
        >
          {t("notifikasi.tandaiSemua")}
        </Tombol>
      </div>

      {daftar.isError ? (
        <div role="alert">
          <p className="text-base font-semibold text-gray-900">
            {pesanGalatApi(daftar.error, t, PER_KODE)}
          </p>
        </div>
      ) : null}

      {tandai.isError ? (
        <div role="alert">
          <p className="text-base font-semibold text-gray-900">
            {pesanGalatApi(tandai.error, t, PER_KODE_TANDAI)}
          </p>
        </div>
      ) : null}

      <WilayahMemuat memuat={daftar.isPending} label={t("notifikasi.memuat")}>
        {items.length === 0 ? (
          <KeadaanKosong
            judul={t(
              hanyaBelumDibaca ? "notifikasi.kosongBelumDibaca.judul" : "notifikasi.kosong.judul",
            )}
            tingkatJudul={2}
          >
            {t(hanyaBelumDibaca ? "notifikasi.kosongBelumDibaca.isi" : "notifikasi.kosong.isi")}
          </KeadaanKosong>
        ) : (
          // <ul>: jumlahnya diumumkan lebih dulu ("daftar, 12 item"), sehingga
          // pengguna tahu seberapa panjang daftarnya sebelum menyusurinya.
          <ul className="flex list-none flex-col gap-3 p-0">
            {items.map((n) => (
              <ItemNotifikasi
                key={n.id}
                notifikasi={n}
                mode={mode}
                Tautan={Tautan}
                sedangDitandai={tandai.isPending && tandai.variables === n.id}
                onTandai={() => {
                  tandai.mutate(n.id);
                }}
              />
            ))}
          </ul>
        )}
      </WilayahMemuat>

      {daftar.hasNextPage ? (
        <Tombol
          varian="sekunder"
          disabled={daftar.isFetchingNextPage}
          onClick={() => {
            void daftar.fetchNextPage();
          }}
        >
          {t("notifikasi.muatLagi")}
        </Tombol>
      ) : null}
    </div>
  );
}

interface ItemProps {
  notifikasi: Notification;
  mode: string;
  Tautan: DaftarNotifikasiProps["Tautan"];
  sedangDitandai: boolean;
  onTandai: () => void;
}

function ItemNotifikasi({ notifikasi, mode, Tautan, sedangDitandai, onTandai }: ItemProps) {
  const t = useTeks();
  const varian = mode === "id-simple" ? "id-simple" : "id";
  const judul = notifikasi.title[varian];
  const isi = notifikasi.body[varian];
  const belumDibaca = notifikasi.readAt === null;
  const ke = tautanNotifikasi(notifikasi);

  return (
    <li className="flex flex-col gap-2 rounded-md border border-gray-400 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {/*
          `h2`, BUKAN `h3`. Judul halaman adalah `h1` dan tidak ada judul
          bagian di antaranya, jadi `h3` melompati satu tingkat — peta halaman
          bagi pengguna screen reader menjadi berbohong tentang kedalaman.
          Ditemukan axe (`heading-order`), bukan oleh mata yang membaca kodenya.
        */}
        <h2 className="text-base font-semibold text-gray-900">{judul}</h2>
        {belumDibaca ? (
          // TEKS, bukan titik berwarna. Penanda yang hanya berupa warna
          // melanggar WCAG 1.4.1 dan tidak ada sama sekali bagi screen reader.
          <span className="rounded-full border border-gray-900 px-2 text-sm font-semibold text-gray-900">
            {t("notifikasi.belumDibacaTanda")}
          </span>
        ) : null}
      </div>

      <p className="text-base text-gray-900">{isi}</p>

      {/*
        `<time>` ber-`dateTime`: nilai mesinnya tetap ISO sementara yang
        dibacakan adalah kalimat WIB yang bisa dipahami.
      */}
      <time dateTime={notifikasi.createdAt} className="text-sm text-gray-700">
        {waktuTerbaca(notifikasi.createdAt, mode)}
      </time>

      <div className="flex flex-wrap gap-2">
        {ke === null ? null : (
          // Hanya muncul bila entitasnya PUNYA halaman — lihat `tautan.ts`.
          <Tautan ke={ke}>{judul}</Tautan>
        )}
        {belumDibaca ? (
          <Tombol
            varian="sekunder"
            disabled={sedangDitandai}
            // Nama aksesibelnya menyebut notifikasi MANA. Sepuluh tombol
            // bernama "Tandai dibaca" di satu halaman tidak bisa dibedakan
            // dalam daftar tombol milik screen reader.
            aria-label={`${t("notifikasi.tandaiDibaca")}: ${judul}`}
            onClick={onTandai}
          >
            {t("notifikasi.tandaiDibaca")}
          </Tombol>
        ) : null}
      </div>
    </li>
  );
}
