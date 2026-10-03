// Pemutar video kamus BISINDO (PR-086). Keputusan owner 2026-10-03: KONTROL
// SENDIRI, bukan `<video controls>` bawaan — label berbahasa Indonesia, target
// sentuh mengikuti preferensi, perilaku keyboard sama di semua peramban, dan
// KECEPATAN 0,5×/0,75×/1× (memperlambat isyarat membantu orang belajar).
//
// AC yang dijaga di sini:
// - Caption DEFAULT MENYALA: `<track default>` + mode "showing" saat metadata
//   termuat (sebagian peramban mengabaikan `default` pada track lintas asal).
// - TANPA autoplay & tanpa loop — video baru berjalan saat pengguna memintanya
//   (reduce-motion dihormati dengan tidak pernah memulai gerak sendiri).
// - Seluruh kontrol elemen natif (button, input range, select): Tab, Enter,
//   Spasi, dan panah bekerja tanpa satu pun penangan keyboard buatan.
//
// URL MEDIA BERUMUR PENDEK (presigned ≤ 15 menit). Bila pengguna menekan Putar
// setelah `mediaExpiresAt`, atau video gagal dimuat, entri diambil ulang lalu
// pemutaran dilanjutkan — permintaan Putar tetap milik pengguna, bukan autoplay.
import { useEffect, useId, useRef, useState } from "react";
import type { SignVideoPublic } from "@nawasena/schemas";
import { KolomForm, Pilihan, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { formatWaktu } from "./filter-url.js";

const KECEPATAN = ["0.5", "0.75", "1"] as const;
type Kecepatan = (typeof KECEPATAN)[number];
const LOMPAT_DETIK = 2;

function durasiAman(detik: number): number {
  return Number.isFinite(detik) && detik > 0 ? detik : 0;
}

export interface PemutarProps {
  entri: SignVideoPublic;
  /** id elemen transkrip — dirujuk `aria-describedby` video. */
  idTranskrip: string;
  /** Ambil ulang entri (URL media segar). Resolve setelah `entri` baru dirender. */
  onPerbarui: () => Promise<unknown>;
}

export function PemutarKamus({ entri, idTranskrip, onPerbarui }: PemutarProps) {
  const t = useTeks();
  const dasar = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const putarSetelahMuat = useRef(false);
  const [berjalan, setBerjalan] = useState(false);
  const [waktu, setWaktu] = useState(0);
  const [durasi, setDurasi] = useState(0);
  const [volume, setVolume] = useState(100);
  const [kecepatan, setKecepatan] = useState<Kecepatan>("1");
  const [captionNyala, setCaptionNyala] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [memperbarui, setMemperbarui] = useState(false);

  const video = () => videoRef.current;

  function terapkanCaption(nyala: boolean): void {
    const track = video()?.textTracks?.[0];
    if (track !== undefined) track.mode = nyala ? "showing" : "hidden";
  }

  useEffect(() => {
    const v = video();
    if (v !== null) v.playbackRate = Number(kecepatan);
  }, [kecepatan, entri.videoUrl]);

  async function putar(): Promise<void> {
    const v = video();
    if (v === null) return;
    setGalat(null);
    if (Date.now() >= Date.parse(entri.mediaExpiresAt)) {
      await perbarui(true);
      return;
    }
    try {
      await v.play();
    } catch {
      setGalat(t("kamus.pemutar.galat"));
    }
  }

  async function perbarui(laluPutar: boolean): Promise<void> {
    setMemperbarui(true);
    putarSetelahMuat.current = laluPutar;
    try {
      await onPerbarui();
    } catch {
      putarSetelahMuat.current = false;
      setGalat(t("kamus.pemutar.galat"));
    } finally {
      setMemperbarui(false);
    }
  }

  function geser(selisih: number): void {
    const v = video();
    if (v === null) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + selisih), durasi || v.duration || 0);
  }

  const labelWaktu = t("kamus.pemutar.posisiTeks", {
    sekarang: formatWaktu(waktu),
    total: formatWaktu(durasi),
  });

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        // Lintas asal (bucket) — tanpa ini `<track>` caption dari bucket diblokir.
        crossOrigin="anonymous"
        preload="metadata"
        playsInline
        src={entri.videoUrl}
        poster={entri.thumbnailUrl ?? undefined}
        aria-label={t("kamus.pemutar.videoLabel", { frasa: entri.phrase })}
        aria-describedby={idTranskrip}
        className="aspect-video w-full rounded-md bg-gray-900"
        // WebM dari perekam browser kadang tanpa durasi (`Infinity`) sampai
        // diputar habis — slider posisi menunggu angka yang terbatas.
        onDurationChange={(e) => setDurasi(durasiAman(e.currentTarget.duration))}
        onLoadedMetadata={(e) => {
          setDurasi(durasiAman(e.currentTarget.duration));
          e.currentTarget.playbackRate = Number(kecepatan);
          terapkanCaption(captionNyala);
        }}
        onLoadedData={(e) => {
          if (putarSetelahMuat.current) {
            putarSetelahMuat.current = false;
            e.currentTarget.play().catch(() => setGalat(t("kamus.pemutar.galat")));
          }
        }}
        onPlay={() => setBerjalan(true)}
        onPause={() => setBerjalan(false)}
        onEnded={() => setBerjalan(false)}
        onTimeUpdate={(e) => setWaktu(e.currentTarget.currentTime)}
        onError={() => {
          // URL kedaluwarsa adalah sebab terlazim — ambil ulang SEKALI.
          if (Date.now() >= Date.parse(entri.mediaExpiresAt)) void perbarui(false);
          else setGalat(t("kamus.pemutar.galat"));
        }}
      >
        <track
          kind="captions"
          srcLang="id"
          label={t("kamus.pemutar.captionBahasa")}
          src={entri.captionUrl}
          default
        />
      </video>

      <div
        role="group"
        aria-label={t("kamus.pemutar.kontrolLabel", { frasa: entri.phrase })}
        className="flex flex-col gap-3 rounded-md border border-gray-300 p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tombol
            aria-busy={memperbarui}
            onClick={() => {
              const v = video();
              if (v !== null && !v.paused) v.pause();
              else void putar();
            }}
          >
            {berjalan ? t("kamus.pemutar.jeda") : t("kamus.pemutar.putar")}
          </Tombol>
          <Tombol varian="sekunder" onClick={() => geser(-LOMPAT_DETIK)}>
            {t("kamus.pemutar.mundur", { detik: LOMPAT_DETIK })}
          </Tombol>
          <Tombol varian="sekunder" onClick={() => geser(LOMPAT_DETIK)}>
            {t("kamus.pemutar.maju", { detik: LOMPAT_DETIK })}
          </Tombol>
          <Tombol
            varian="sekunder"
            aria-pressed={captionNyala}
            onClick={() => {
              setCaptionNyala(!captionNyala);
              terapkanCaption(!captionNyala);
            }}
          >
            {t("kamus.pemutar.caption")}
          </Tombol>
          <span className="text-base text-gray-900" aria-hidden="true">
            {formatWaktu(waktu)} / {formatWaktu(durasi)}
          </span>
        </div>

        <label htmlFor={`${dasar}-posisi`} className="flex flex-col gap-1 text-base text-gray-900">
          {t("kamus.pemutar.posisi")}
          <input
            id={`${dasar}-posisi`}
            type="range"
            min={0}
            max={durasi > 0 ? durasi : 0}
            step={0.1}
            value={Math.min(waktu, durasi)}
            aria-valuetext={labelWaktu}
            disabled={durasi === 0}
            className="min-h-sentuh w-full"
            onChange={(e) => {
              const v = video();
              if (v !== null) v.currentTime = Number(e.target.value);
            }}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label
            htmlFor={`${dasar}-volume`}
            className="flex flex-col gap-1 text-base text-gray-900"
          >
            {t("kamus.pemutar.volume")}
            <input
              id={`${dasar}-volume`}
              type="range"
              min={0}
              max={100}
              step={10}
              value={volume}
              aria-valuetext={t("kamus.pemutar.volumeTeks", { persen: volume })}
              className="min-h-sentuh w-full"
              onChange={(e) => {
                const nilai = Number(e.target.value);
                setVolume(nilai);
                const v = video();
                if (v !== null) v.volume = nilai / 100;
              }}
            />
          </label>
          <KolomForm label={t("kamus.pemutar.kecepatan")}>
            <Pilihan
              opsi={KECEPATAN.map((k) => ({ nilai: k, label: t(`kamus.pemutar.kecepatan.${k}`) }))}
              nilai={kecepatan}
              onUbah={(dipilih) => setKecepatan(dipilih as Kecepatan)}
            />
          </KolomForm>
        </div>
      </div>

      {galat !== null && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{galat}</p>
          <Tombol varian="sekunder" onClick={() => void perbarui(true)}>
            {t("kamus.pemutar.cobaLagi")}
          </Tombol>
        </div>
      )}
    </div>
  );
}
