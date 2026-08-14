// Layar kembalian dari Google untuk HAPUS AKUN (PR-033c-2).
//
// KENAPA MASIH ADA SATU KONFIRMASI LAGI DI SINI, padahal pengguna sudah membaca
// seluruh akibatnya sebelum berangkat. Tiga alasan, dan ketiganya soal jarak:
//
//   1. Yang terakhir ia tekan sebelum sampai di sini adalah tombol milik
//      GOOGLE, yang berbunyi "Lanjutkan" dan tidak menyebut penghapusan apa
//      pun. Prinsip yang dipegang seluruh alur ini — teks terakhir sebelum akun
//      hilang harus menyebut persis apa yang akan terjadi — akan patah tanpa
//      layar ini.
//   2. Perhatiannya sudah menyeberangi satu situs lain. Sebagian orang tiba di
//      sini beberapa menit kemudian.
//   3. Alamat ini bisa dibuka ulang (tombol kembali, riwayat, tab dipulihkan).
//      Menghapus akun otomatis begitu halaman dimuat berarti satu tekan tombol
//      kembali bisa menghapus akun seseorang. Titipan memang sekali pakai,
//      tetapi jarak antara "hampir aman" dan "aman" pada tindakan ini terlalu
//      mahal untuk ditawar.
//
// Layar ini juga MENUNGGU pemulihan sesi. Ia dimuat dari nol sesudah pengalihan,
// dan `DELETE /auth/account` butuh access token — yang baru ada setelah cookie
// refresh ditukarkan. Menghapus sebelum itu selalu gagal 401.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { deleteAccount, type ApiClient } from "@nawasena/api-client";
import { HARI_SEBELUM_PURGE } from "@nawasena/schemas";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { pesanGalatHapus } from "./hapus-akun.js";

/** Sama dengan gaya tombol perusak di dialog — lihat catatannya di sana. */
const GAYA_HAPUS = "bg-red-700 text-white hover:bg-red-800";

export interface KonfirmasiHapusGoogleProps {
  klien: ApiClient;
  /** `code` dari Google, sekali pakai dan berumur pendek. */
  code: string;
  codeVerifier: string;
  redirectUri: string;
  /** Batal — kembali ke tempat yang aman tanpa menghapus apa pun. */
  onBatal: () => void;
  /** Dipanggil sesudah akun terhapus DAN pengguna menutup layar terakhir. */
  onSelesai: () => void;
}

export function KonfirmasiHapusGoogle({
  klien,
  code,
  codeVerifier,
  redirectUri,
  onBatal,
  onSelesai,
}: KonfirmasiHapusGoogleProps) {
  const t = useTeks();
  const status = useStoreSesi((s) => s.status);
  const [selesai, setSelesai] = useState(false);

  const hapus = useMutation({
    mutationFn: () => deleteAccount(klien, { google: { code, codeVerifier, redirectUri } }),
    onSuccess: () => setSelesai(true),
  });

  if (selesai) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 p-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("pengaturan.hapus.selesai.judul")}
        </h1>
        <p className="text-base text-gray-900">
          {t("pengaturan.hapus.selesai.penjelasan", { hari: HARI_SEBELUM_PURGE })}
        </p>
        <Tombol onClick={onSelesai}>{t("pengaturan.hapus.selesai.tutup")}</Tombol>
      </div>
    );
  }

  // Pemulihan sesi belum selesai. Bukan layar kosong: pada jaringan lambat ini
  // bisa memakan beberapa detik, dan halaman diam tanpa keterangan terbaca
  // sebagai halaman yang rusak — apalagi di titik ini.
  if (status === "memulihkan") {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        <WilayahMemuat memuat label={t("pengaturan.hapus.kembali.memeriksaSesi")}>
          {null}
        </WilayahMemuat>
      </div>
    );
  }

  // Sesinya sudah mati sebelum sempat mengonfirmasi (mis. terlalu lama di
  // halaman Google). Tidak ada yang bisa dihapus tanpa access token, dan
  // menyembunyikan sebabnya hanya membuat pengguna menekan tombol yang pasti
  // gagal.
  if (status === "keluar") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 p-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("pengaturan.hapus.kembali.judul")}
        </h1>
        <p role="alert" className="text-base text-gray-900">
          {t("pengaturan.hapus.kembali.sesiHabis")}
        </p>
        <Tombol onClick={onBatal}>{t("pengaturan.hapus.kembali.masuk")}</Tombol>
      </div>
    );
  }

  const sibuk = hapus.isPending;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 p-4">
      <h1 className="text-2xl font-bold text-gray-900">{t("pengaturan.hapus.kembali.judul")}</h1>
      <p className="text-base text-gray-900">{t("pengaturan.hapus.kembali.penjelasan")}</p>

      {hapus.isError ? (
        <p role="alert" className="text-base font-semibold text-gray-900">
          {pesanGalatHapus(hapus.error, t)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/* Jalan keluar DIDAHULUKAN, sama seperti di dialog: pada layar yang
            menawarkan tindakan tak-terbalikkan, membatalkan harus lebih mudah
            ditemukan daripada melanjutkan. */}
        <Tombol varian="sekunder" onClick={onBatal}>
          {t("pengaturan.hapus.kembali.batal")}
        </Tombol>
        <Tombol
          className={GAYA_HAPUS}
          // `aria-disabled`, bukan `disabled` — tombol yang dinonaktifkan saat
          // memegang fokus melemparkan fokus itu ke awal dokumen.
          aria-disabled={sibuk}
          aria-busy={sibuk}
          onClick={() => {
            if (sibuk) return;
            hapus.mutate();
          }}
        >
          {sibuk ? t("pengaturan.hapus.kode.menghapus") : t("pengaturan.hapus.kode.konfirmasi")}
        </Tombol>
      </div>
    </div>
  );
}
