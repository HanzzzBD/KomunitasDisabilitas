// Hapus akun — konfirmasi dua langkah + pembuktian ulang (PR-033c-1).
// AC PR-033 nomor 2 dan 3.
//
// TIGA LANGKAH, BUKAN SATU TOMBOL, dan tiap langkah menahan kesalahan yang
// berbeda:
//
//   1. AKIBAT   — menahan yang salah paham. Ia menekan "hapus akun" mengira
//                 itu berarti "keluar" atau "sembunyikan profil sementara".
//   2. KODE     — menahan yang bukan pemiliknya. Access token berumur 15 menit
//                 dan diperbarui diam-diam, jadi "punya sesi" hanya
//                 membuktikan perangkat ini PERNAH dipakai masuk — bukan bahwa
//                 orang yang menekan tombol sekarang adalah pemiliknya.
//   3. SELESAI  — memberi tahu jendela 30 hari. Jendela itu tidak berguna sama
//                 sekali bagi orang yang tidak tahu ia ada.
//
// SATU DIALOG YANG ISINYA BERGANTI, bukan tiga dialog bertumpuk. `Dialog`
// (PR-028) melarang penumpukan secara struktural: dua jerat fokus bersarang
// mengurung pengguna keyboard DI DALAM kurungan.
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { deleteAccount, requestOtp } from "@nawasena/api-client";
import { HARI_SEBELUM_PURGE } from "@nawasena/schemas";
import { Dialog, KolomForm, Masukan, Tombol, TutupDialog } from "@nawasena/ui";
import type { ApiClient } from "@nawasena/api-client";
import { useTeks } from "../../shared/i18n/index.js";
import { pesanGalatHapus } from "./hapus-akun.js";

type Langkah = "akibat" | "kode" | "selesai";

export interface DialogHapusAkunProps {
  klien: ApiClient;
  /** Nomor HP terdaftar (E.164). Jalur ini hanya untuk akun yang punya nomor. */
  nomor: string;
  /**
   * Dipanggil setelah akun BENAR-BENAR terhapus dan pengguna menutup layar
   * terakhir. Pemanggillah yang mengakhiri sesi dan memindahkan halaman —
   * bukan dialog ini, yang tidak boleh tahu soal router.
   */
  onSelesai: () => void;
}

/**
 * Gaya tombol perusak.
 *
 * Warnanya penguat, BUKAN penanda utama: WCAG 1.4.1 melarang menyandarkan
 * makna pada warna saja, dan yang benar-benar membedakan tombol ini adalah
 * labelnya — "Hapus akun saya sekarang", bukan "OK". Varian `bahaya` di
 * `packages/ui` menunggu pemakai kedua; satu pemakai belum cukup untuk
 * menetapkan bentuknya (alasan yang sama dengan pemindahan `galat-api`).
 */
const GAYA_HAPUS = "bg-red-700 text-white hover:bg-red-800";

export function DialogHapusAkun({ klien, nomor, onSelesai }: DialogHapusAkunProps) {
  const t = useTeks();
  const [terbuka, setTerbuka] = useState(false);
  const [langkah, setLangkah] = useState<Langkah>("akibat");
  const [kode, setKode] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState("");

  const kotakKode = useRef<HTMLInputElement>(null);

  const kirimKode = useMutation({
    mutationFn: () => requestOtp(klien, { phone: nomor }),
    onMutate: () => {
      setGalat(null);
      setKabar("");
    },
    onSuccess: () => setKabar(t("pengaturan.hapus.kode.terkirim", { nomor })),
    onError: (e: unknown) => setGalat(pesanGalatHapus(e, t)),
  });

  const hapus = useMutation({
    mutationFn: () => deleteAccount(klien, { otpCode: kode }),
    onMutate: () => setGalat(null),
    onSuccess: () => setLangkah("selesai"),
    onError: (e: unknown) => setGalat(pesanGalatHapus(e, t)),
  });

  // Fokus mengikuti kotak kode begitu ia muncul. Tanpa ini, pengguna keyboard
  // menekan "Kirim kode" lalu fokusnya tertinggal di tombol itu sementara yang
  // harus ia isi berada di bawahnya — dan pengguna screen reader tidak diberi
  // tahu bahwa ada kotak baru sama sekali.
  useEffect(() => {
    if (kirimKode.isSuccess && !hapus.isPending) kotakKode.current?.focus();
  }, [kirimKode.isSuccess, hapus.isPending]);

  /** Kembali ke keadaan awal tiap kali dialog dibuka — bukan saat ditutup. */
  function ubahTerbuka(nilai: boolean) {
    setTerbuka(nilai);
    if (nilai) {
      setLangkah("akibat");
      setKode("");
      setGalat(null);
      setKabar("");
      kirimKode.reset();
      hapus.reset();
    } else if (langkah === "selesai") {
      // Ditutup SESUDAH terhapus: sesi sudah mati di server, jadi pemanggil
      // harus membuangnya di klien juga. Menutup dialog tanpa ini meninggalkan
      // pengguna di halaman terlindungi dengan sesi hantu — yang baru ambruk
      // pada permintaan berikutnya, sebagai pengalihan tanpa penjelasan.
      onSelesai();
    }
  }

  const sibuk = hapus.isPending;

  return (
    <Dialog
      terbuka={terbuka}
      onUbahTerbuka={ubahTerbuka}
      pemicu={
        <Tombol varian="sekunder">{t("pengaturan.hapus.tombol")}</Tombol>
      }
      judul={t(
        langkah === "akibat"
          ? "pengaturan.hapus.dialog.judul"
          : langkah === "kode"
            ? "pengaturan.hapus.kode.judul"
            : "pengaturan.hapus.selesai.judul",
      )}
      deskripsi={
        langkah === "akibat"
          ? t("pengaturan.hapus.dialog.deskripsi")
          : langkah === "kode"
            ? t("pengaturan.hapus.kode.deskripsi")
            : undefined
      }
      labelTutup={t("pengaturan.hapus.batal")}
      aksi={
        langkah === "akibat" ? (
          <>
            {/* "Batal" DIDAHULUKAN dalam urutan baca dan urutan fokus. Pada
                layar yang menawarkan tindakan tak-terbalikkan, jalan keluar
                harus lebih mudah ditemukan daripada jalan lanjut. */}
            <TutupDialog asChild>
              <Tombol varian="sekunder">{t("pengaturan.hapus.batal")}</Tombol>
            </TutupDialog>
            <Tombol onClick={() => setLangkah("kode")}>{t("pengaturan.hapus.lanjut")}</Tombol>
          </>
        ) : langkah === "kode" ? (
          <>
            <TutupDialog asChild>
              <Tombol varian="sekunder">{t("pengaturan.hapus.batal")}</Tombol>
            </TutupDialog>
            {kirimKode.isSuccess ? (
              <Tombol
                className={GAYA_HAPUS}
                // `aria-disabled`, bukan `disabled`: tombol yang dinonaktifkan
                // saat memegang fokus melemparkan fokus ke awal dokumen — dan
                // di dalam dialog itu berarti keluar dari jerat fokusnya.
                aria-disabled={sibuk || kode.trim() === ""}
                aria-busy={sibuk}
                onClick={() => {
                  if (sibuk || kode.trim() === "") return;
                  hapus.mutate();
                }}
              >
                {sibuk
                  ? t("pengaturan.hapus.kode.menghapus")
                  : t("pengaturan.hapus.kode.konfirmasi")}
              </Tombol>
            ) : (
              <Tombol
                aria-disabled={kirimKode.isPending}
                aria-busy={kirimKode.isPending}
                onClick={() => {
                  if (kirimKode.isPending) return;
                  kirimKode.mutate();
                }}
              >
                {kirimKode.isPending
                  ? t("pengaturan.hapus.kode.mengirim")
                  : t("pengaturan.hapus.kode.kirim")}
              </Tombol>
            )}
          </>
        ) : (
          <TutupDialog asChild>
            <Tombol>{t("pengaturan.hapus.selesai.tutup")}</Tombol>
          </TutupDialog>
        )
      }
    >
      {langkah === "akibat" ? (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">{t("pengaturan.hapus.akibat.judul")}</p>
          {/* <ul>: screen reader mengumumkan "daftar, 4 item" lalu memberi nomor
              tiap butirnya — pengguna tahu ada berapa akibat dan di mana ia
              berada, alih-alih menerima satu paragraf panjang. */}
          <ul className="flex list-disc flex-col gap-2 pl-6">
            <li>{t("pengaturan.hapus.akibat.profil")}</li>
            <li>{t("pengaturan.hapus.akibat.sesi")}</li>
            <li>{t("pengaturan.hapus.akibat.tunggu", { hari: HARI_SEBELUM_PURGE })}</li>
            <li>{t("pengaturan.hapus.akibat.pulihkan", { hari: HARI_SEBELUM_PURGE })}</li>
          </ul>
        </div>
      ) : langkah === "kode" ? (
        <div className="flex flex-col gap-3">
          {/* Live region yang SUDAH ADA sebelum kodenya terkirim: region yang
              lahir bersama pesannya kerap tidak terbaca sama sekali. */}
          <p role="status">{kabar}</p>

          {kirimKode.isSuccess ? (
            <KolomForm
              label={t("pengaturan.hapus.kode.label")}
              bantuan={t("pengaturan.hapus.kode.bantuan")}
              galat={galat ?? undefined}
            >
              <Masukan
                ref={kotakKode}
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                inputMode="numeric"
                // Satu kotak, bukan enam. Pola enam kotak memecah satu nilai
                // menjadi enam label, memindahkan fokus di tengah pengetikan,
                // dan membuat tempel-satu-kode gagal (alasan sama, PR-030b).
                autoComplete="one-time-code"
                maxLength={6}
              />
            </KolomForm>
          ) : null}

          {galat !== null && !kirimKode.isSuccess ? <p role="alert">{galat}</p> : null}
        </div>
      ) : (
        <p>{t("pengaturan.hapus.selesai.penjelasan", { hari: HARI_SEBELUM_PURGE })}</p>
      )}
    </Dialog>
  );
}
