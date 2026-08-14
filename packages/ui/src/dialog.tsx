// Dialog — AC PR-028 nomor 1: "fokus masuk saat buka, kembali ke pemicu saat
// tutup".
//
// DI ATAS RADIX, dan di sini alasannya paling kuat dari seluruh komponen sejauh
// ini. Manajemen fokus adalah satu-satunya bagian aksesibilitas yang cacatnya
// MENJEBAK pengguna alih-alih sekadar menyulitkannya: fokus yang lolos ke
// belakang dialog membuat pengguna keyboard menjelajah halaman yang tidak bisa
// ia lihat sedang tertutup, dan fokus yang tidak kembali saat dialog ditutup
// membuatnya mendarat di awal dokumen tanpa tahu ke mana perginya.
//
// Radix menangani jerat fokus, pengembalian fokus, Escape, klik di luar, dan
// `aria-hidden` pada sisa halaman. Berkas ini menata tampilan dan menegakkan
// satu hal yang TIDAK dijamin pustaka mana pun: bahwa dialognya punya judul.
import { createContext, useContext, type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { gabungKelas } from "./gabung-kelas.js";
import { Tombol } from "./tombol.js";

/**
 * Penanda "kita sedang di dalam dialog", untuk melarang dialog bertumpuk.
 *
 * Risks PR-028 menulis larangan ini sebagai *by-convention*. Konvensi tidak
 * menahan apa pun: yang menumpuk dialog biasanya tidak sadar sedang
 * melakukannya, sebab dialog kedua lahir dari komponen yang dipakai ulang di
 * tempat lain. Jadi larangannya dijadikan STRUKTURAL.
 *
 * Sebabnya bukan kerapian. Dua jerat fokus bersarang berarti pengguna keyboard
 * terkurung DI DALAM kurungan: menutup dialog dalam mengembalikan fokus ke
 * pemicu yang mungkin sudah tidak ada, dan `aria-hidden` yang dipasang dua kali
 * bisa menyembunyikan dialog luar dari screen reader sementara ia masih tampak
 * di layar.
 *
 * Melempar galat memang keras. Tetapi `apps/web` punya `ErrorBoundary` di akar
 * rute (`LayarKesalahan`), jadi yang muncul adalah layar galat berbahasa
 * Indonesia — bukan halaman putih. Dan gagal saat pengembangan jauh lebih murah
 * daripada mengurung pengguna di produksi.
 */
const DiDalamDialog = createContext(false);

export interface DialogProps {
  /**
   * Judul dialog. WAJIB, dan bukan karena rapi.
   *
   * Saat dialog terbuka, screen reader mengumumkan namanya — dan nama itu
   * datang dari judul ini. Dialog tanpa judul terumumkan sebagai "dialog"
   * saja: pengguna tahu sesuatu terbuka, tetapi tidak tahu apa. Karena itu ia
   * prop wajib, bukan komponen anak opsional yang bisa lupa dipasang.
   */
  judul: ReactNode;
  children: ReactNode;
  terbuka?: boolean;
  onUbahTerbuka?: (terbuka: boolean) => void;
  /** Pemicu. Boleh kosong bila dialog dikendalikan `terbuka` dari luar. */
  pemicu?: ReactNode;
  /** Penjelasan singkat, ikut diumumkan sesudah judul. */
  deskripsi?: ReactNode;
  /** Baris aksi di bawah (mis. Simpan / Batal). */
  aksi?: ReactNode;
  /** Teks tombol tutup di pojok — dibaca screen reader, bukan hanya "×". */
  labelTutup?: string;
  className?: string;
}

export function Dialog({
  judul,
  children,
  terbuka,
  onUbahTerbuka,
  pemicu,
  deskripsi,
  aksi,
  labelTutup = "Tutup",
  className,
}: DialogProps) {
  if (useContext(DiDalamDialog)) {
    throw new Error(
      "Dialog bertumpuk tidak diizinkan: dialog kedua mengurung pengguna keyboard " +
        "di dalam kurungan. Tutup dialog pertama lebih dahulu, atau gabungkan " +
        "keduanya menjadi satu alur.",
    );
  }

  return (
    <RadixDialog.Root open={terbuka} onOpenChange={onUbahTerbuka}>
      {pemicu != null && <RadixDialog.Trigger asChild>{pemicu}</RadixDialog.Trigger>}

      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={gabungKelas(
            "fixed inset-0 z-40 bg-black/50",
            // Tanpa transisi saat pengguna meminta pengurangan gerak. Lapisan
            // yang memudar termasuk gerak yang paling sering memicu mual pada
            // gangguan vestibular.
            "gerak-minimal:transition-none",
          )}
        />

        <RadixDialog.Content
          className={gabungKelas(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            // `max-h` + `overflow-y-auto`: pada zoom 200% (WCAG 2.2 §1.4.4)
            // dialog yang tingginya tidak dibatasi akan memanjang melewati
            // layar, dan karena ia `fixed`, isinya tidak bisa digulir sama
            // sekali — bagian bawahnya, termasuk tombol aksi, jadi mustahil
            // dijangkau.
            "max-h-[90vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto",
            "rounded-lg border border-gray-400 bg-white p-6 shadow-lg",
            "flex flex-col gap-4",
            "gerak-minimal:transition-none",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="text-xl font-semibold text-gray-900">
                {judul}
              </RadixDialog.Title>
              {deskripsi != null ? (
                <RadixDialog.Description className="text-base text-gray-700">
                  {deskripsi}
                </RadixDialog.Description>
              ) : (
                // Radix memperingatkan bila `Description` tidak ada. Menyatakan
                // ketiadaannya secara eksplisit lebih jujur daripada memaksa
                // setiap dialog punya deskripsi basa-basi yang justru menambah
                // kebisingan bagi pengguna screen reader.
                <RadixDialog.Description />
              )}
            </div>

            <RadixDialog.Close asChild>
              {/* Tombol tutup memakai Tombol (PR-027b), jadi target sentuh dan
                  cincin fokusnya ikut aturan yang sama dengan tombol lain.
                  `aria-label` wajib: "×" tidak punya arti yang bisa dibacakan. */}
              <Tombol varian="hening" ukuran="kecil" aria-label={labelTutup}>
                <span aria-hidden="true">×</span>
              </Tombol>
            </RadixDialog.Close>
          </div>

          <DiDalamDialog.Provider value={true}>
            <div className="text-base text-gray-900">{children}</div>

            {aksi != null && <div className="flex flex-wrap justify-end gap-2">{aksi}</div>}
          </DiDalamDialog.Provider>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * Penutup dialog dari dalam isinya — untuk tombol "Batal" di baris aksi.
 *
 * Ada supaya pemakai tidak perlu mengangkat keadaan terbuka ke luar hanya
 * untuk menutup dialog dari sebuah tombol. Yang diangkat ke luar tanpa alasan
 * cenderung menyimpang dari yang di dalam.
 */
export const TutupDialog = RadixDialog.Close;
