// Satu slot unggah media kamus (PR-085b) — video, caption, atau thumbnail.
//
// Keputusan owner 2026-10-03: UNGGAH PER BERKAS. Memilih berkas langsung
// memulai: izin (presign) → PUT ke bucket dengan progres → simpan key lewat
// PUT entri. Tiap slot punya progres, pesan gagal, dan "Coba lagi" sendiri —
// video yang gagal di 90% tidak mengulang caption yang sudah berhasil.
//
// DUA PENGUMUMAN, DUA PERAN. `<progress>` memegang angka persis (bisa
// diperiksa kapan saja), `role="status"` mengumumkan kelipatan 25% + selesai
// (AC "progress diumumkan aria-live (persen)") tanpa membanjiri pembaca layar.
// Galat memakai `role="alert"` — admin harus tahu SEGERA, bukan saat giliran.
import { useEffect, useRef, useState } from "react";
import { presignSignVideoMedia, updateSignVideoAdmin, type ApiClient } from "@nawasena/api-client";
import type { SignVideoAdmin, SignVideoMediaKind } from "@nawasena/schemas";
import { KolomForm, Masukan, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import {
  acceptUntuk,
  periksaBerkas,
  persenDiumumkan,
  tipeBerkas,
  unggahKeStorage,
  UnggahGagal,
} from "./kamus-unggah.js";
import { pesanGalatKamus } from "./kamus-pesan-galat.js";

const KOLOM = { video: "videoKey", caption: "captionKey", thumbnail: "thumbnailKey" } as const;

type Tahap =
  | { nama: "diam" }
  | { nama: "mengunggah"; persen: number }
  | { nama: "menyimpan" }
  | { nama: "berhasil" }
  | { nama: "gagal"; pesan: string };

export interface SlotUnggahProps {
  kind: SignVideoMediaKind;
  entri: SignVideoAdmin;
  klien: ApiClient;
  onTersimpan: (entri: SignVideoAdmin) => void;
  /** Injeksi untuk test; bawaan `unggahKeStorage` (XHR). */
  unggah?: typeof unggahKeStorage;
}

/** Nama berkas di balik key (`sign-videos/{id}/video-….mp4` → `video-….mp4`). */
function namaDariKey(key: string): string {
  return key.split("/").pop() ?? key;
}

export function SlotUnggah({
  kind,
  entri,
  klien,
  onTersimpan,
  unggah = unggahKeStorage,
}: SlotUnggahProps) {
  const t = useTeks();
  const [tahap, setTahap] = useState<Tahap>({ nama: "diam" });
  const [kabar, setKabar] = useState("");
  const berkasRef = useRef<File | null>(null);
  const batalRef = useRef<AbortController | null>(null);
  const label = t(`admin.kamus.unggah.label.${kind}`);
  const keySekarang = entri[KOLOM[kind]];

  // Halaman ditinggal saat unggah berjalan → hentikan, jangan biarkan XHR yatim.
  useEffect(() => () => batalRef.current?.abort(), []);

  async function jalankan(berkas: File): Promise<void> {
    const galatDini = periksaBerkas(kind, berkas);
    if (galatDini !== null) {
      setTahap({ nama: "gagal", pesan: t(galatDini) });
      return;
    }
    const pengendali = new AbortController();
    batalRef.current = pengendali;
    setTahap({ nama: "mengunggah", persen: 0 });
    setKabar(t("admin.kamus.unggah.mulai", { label }));
    let diumumkan = 0;

    try {
      const izin = await presignSignVideoMedia(klien, {
        videoId: entri.id,
        kind,
        contentType: tipeBerkas(kind, berkas),
        size: berkas.size,
      });
      await unggah(izin, berkas, {
        signal: pengendali.signal,
        onProgres: (persen) => {
          setTahap({ nama: "mengunggah", persen });
          const bulat = persenDiumumkan(persen);
          if (bulat > diumumkan && bulat < 100) {
            diumumkan = bulat;
            setKabar(t("admin.kamus.unggah.progres", { label, persen: bulat }));
          }
        },
      });
      setTahap({ nama: "menyimpan" });
      setKabar(t("admin.kamus.unggah.menyimpan", { label }));
      const hasil = await updateSignVideoAdmin(klien, entri.id, { [KOLOM[kind]]: izin.key });
      onTersimpan(hasil);
      berkasRef.current = null;
      setTahap({ nama: "berhasil" });
      setKabar(t("admin.kamus.unggah.berhasil", { label }));
    } catch (galat) {
      setKabar("");
      const pesan =
        galat instanceof UnggahGagal
          ? t(`admin.kamus.unggah.gagal.${galat.jenis}`, { label })
          : pesanGalatKamus(galat, t);
      setTahap({ nama: "gagal", pesan });
    } finally {
      batalRef.current = null;
    }
  }

  const sibuk = tahap.nama === "mengunggah" || tahap.nama === "menyimpan";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-300 p-4">
      <KolomForm label={label} bantuan={t(`admin.kamus.unggah.bantuan.${kind}`)}>
        <Masukan
          type="file"
          accept={acceptUntuk(kind)}
          disabled={sibuk}
          className="file:mr-3 file:rounded file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-white"
          onChange={(e) => {
            const berkas = e.target.files?.[0];
            e.target.value = ""; // memilih berkas yang sama lagi tetap memicu onChange
            if (berkas === undefined) return;
            berkasRef.current = berkas;
            void jalankan(berkas);
          }}
        />
      </KolomForm>

      <p className="text-base text-gray-900">
        {keySekarang === null
          ? t("admin.kamus.unggah.belumAda")
          : t("admin.kamus.unggah.sudahAda", { nama: namaDariKey(keySekarang) })}
      </p>

      {tahap.nama === "mengunggah" && (
        <div className="flex flex-wrap items-center gap-3">
          <progress
            max={100}
            value={tahap.persen}
            aria-label={t("admin.kamus.unggah.progresLabel", { label })}
            className="h-3 w-full max-w-xs"
          />
          <span className="text-base text-gray-900" aria-hidden="true">
            {tahap.persen}%
          </span>
          <Tombol
            varian="sekunder"
            ukuran="kecil"
            aria-label={t("admin.kamus.unggah.batalLabel", { label })}
            onClick={() => batalRef.current?.abort()}
          >
            {t("admin.kamus.unggah.batal")}
          </Tombol>
        </div>
      )}

      {tahap.nama === "gagal" && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-base font-medium text-red-700">{tahap.pesan}</p>
          {berkasRef.current !== null && (
            <Tombol
              varian="sekunder"
              ukuran="kecil"
              aria-label={t("admin.kamus.unggah.cobaLagiLabel", { label })}
              onClick={() => {
                if (berkasRef.current !== null) void jalankan(berkasRef.current);
              }}
            >
              {t("admin.kamus.unggah.cobaLagi")}
            </Tombol>
          )}
        </div>
      )}

      <p role="status" className="text-base text-gray-900">
        {kabar}
      </p>
    </div>
  );
}
