// Dialog moderasi akun (PR-083b) — KONFIRMASI DUA LANGKAH (AC PR-083).
//
//   Langkah 1 — alasan: teks bebas wajib (internal; masuk audit, tidak pernah
//               ditampilkan ke pengguna — keputusan owner 2026-10-03).
//   Langkah 2 — tinjau: ringkasan akibat + alasan yang akan dicatat, lalu
//               tombol final. "Kembali" ke langkah 1 tanpa kehilangan isian.
//
// Satu dialog, bukan dua: dialog bertumpuk dilarang `@nawasena/ui` (jerat fokus
// di dalam jerat fokus). Perpindahan langkah MEMINDAHKAN FOKUS ke judul langkah
// yang baru — tanpa itu tombol "Lanjut" lenyap di tangan pengguna keyboard dan
// fokus jatuh ke <body> di dalam dialog yang masih terbuka.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { suspendUserAdmin, unsuspendUserAdmin, type ApiClient } from "@nawasena/api-client";
import type { AdminUser } from "@nawasena/schemas";
import { AreaTeks, Dialog, KolomForm, Tombol } from "@nawasena/ui";
import { pesanGalatApi } from "../../shared/galat-api.js";
import { useTeks } from "../../shared/i18n/index.js";

export type AksiModerasi = "tangguhkan" | "pulihkan";

export interface DialogModerasiProps {
  klien: ApiClient;
  pengguna: AdminUser;
  aksi: AksiModerasi;
  pemicu: ReactNode;
  onSelesai(hasil: AdminUser): void;
}

const PETA_GALAT = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
  PENGGUNA_TIDAK_DITEMUKAN: "admin.pengguna.galat.tidakDitemukan",
  STATUS_PENGGUNA_TIDAK_BERUBAH: "admin.pengguna.galat.statusBerubah",
  PENGGUNA_TIDAK_BISA_DIMODERASI: "admin.pengguna.galat.tidakBisa",
} as const;

export function DialogModerasi({ klien, pengguna, aksi, pemicu, onSelesai }: DialogModerasiProps) {
  const t = useTeks();
  const idJudulLangkah = useId();
  const judulLangkah = useRef<HTMLHeadingElement>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [langkah, setLangkah] = useState<1 | 2>(1);
  const [alasan, setAlasan] = useState("");
  const [galatAlasan, setGalatAlasan] = useState<string | undefined>(undefined);
  const nama = pengguna.fullName.trim() === "" ? t("admin.pengguna.tanpaNama") : pengguna.fullName;
  const tangguhkan = aksi === "tangguhkan";

  const kirim = useMutation({
    mutationFn: () =>
      tangguhkan
        ? suspendUserAdmin(klien, pengguna.id, alasan.trim())
        : unsuspendUserAdmin(klien, pengguna.id, alasan.trim()),
    onSuccess: (hasil) => {
      setTerbuka(false);
      onSelesai(hasil);
    },
  });

  // Fokus ke judul langkah setiap kali langkah berganti (bukan saat dibuka:
  // Radix sudah memfokuskan isi dialog).
  const pertama = useRef(true);
  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    judulLangkah.current?.focus();
  }, [langkah]);

  function ubahTerbuka(b: boolean): void {
    setTerbuka(b);
    if (!b) {
      // Dialog ditutup = mulai dari awal lagi lain kali.
      setLangkah(1);
      setAlasan("");
      setGalatAlasan(undefined);
      kirim.reset();
      pertama.current = true;
    }
  }

  function lanjut(): void {
    if (alasan.trim() === "") {
      setGalatAlasan(t("admin.pengguna.galat.alasanKosong"));
      return;
    }
    setGalatAlasan(undefined);
    setLangkah(2);
  }

  return (
    <Dialog
      judul={t(tangguhkan ? "admin.pengguna.tangguhkan.judul" : "admin.pengguna.pulihkan.judul", {
        nama,
      })}
      deskripsi={t(
        tangguhkan ? "admin.pengguna.tangguhkan.akibat" : "admin.pengguna.pulihkan.akibat",
      )}
      terbuka={terbuka}
      onUbahTerbuka={ubahTerbuka}
      labelTutup={t("admin.pengguna.tutup")}
      pemicu={pemicu}
    >
      <div className="flex flex-col gap-4">
        <h3
          id={idJudulLangkah}
          ref={judulLangkah}
          tabIndex={-1}
          className="text-lg font-semibold text-gray-900 focus:outline-none"
        >
          {t(langkah === 1 ? "admin.pengguna.langkah1" : "admin.pengguna.langkah2")}
        </h3>

        {langkah === 1 ? (
          <>
            <KolomForm
              label={t("admin.pengguna.alasan")}
              bantuan={t("admin.pengguna.alasanBantuan")}
              wajib
              galat={galatAlasan}
            >
              <AreaTeks
                value={alasan}
                maxLength={200}
                rows={3}
                onChange={(e) => {
                  setAlasan(e.target.value);
                }}
              />
            </KolomForm>
            <div className="flex flex-wrap gap-3">
              <Tombol onClick={lanjut}>{t("admin.pengguna.lanjut")}</Tombol>
              <Tombol
                varian="sekunder"
                onClick={() => {
                  ubahTerbuka(false);
                }}
              >
                {t("admin.pengguna.batal")}
              </Tombol>
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-gray-900">
              {t(
                tangguhkan ? "admin.pengguna.tangguhkan.tinjau" : "admin.pengguna.pulihkan.tinjau",
                { nama },
              )}
            </p>
            <div className="rounded-md border border-gray-400 bg-gray-50 p-3">
              <p className="text-base font-semibold text-gray-900">
                {t("admin.pengguna.alasanDicatat")}
              </p>
              <p className="text-base break-words whitespace-pre-line text-gray-900">
                {alasan.trim()}
              </p>
            </div>
            {kirim.isError && (
              <p role="alert" className="text-base font-medium text-red-700">
                {pesanGalatApi(kirim.error, t, PETA_GALAT)}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Tombol
                varian={tangguhkan ? "bahaya" : "utama"}
                aria-disabled={kirim.isPending}
                aria-busy={kirim.isPending}
                onClick={() => {
                  if (!kirim.isPending) kirim.mutate();
                }}
              >
                {kirim.isPending
                  ? t("admin.pengguna.menyimpan")
                  : t(tangguhkan ? "admin.pengguna.tangguhkan.ya" : "admin.pengguna.pulihkan.ya")}
              </Tombol>
              <Tombol
                varian="sekunder"
                onClick={() => {
                  setLangkah(1);
                }}
              >
                {t("admin.pengguna.kembali")}
              </Tombol>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
