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
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { pesanGalatHapus } from "./hapus-akun.js";

type Langkah = "akibat" | "kode" | "google" | "selesai";

/**
 * Cara konfirmasi yang tersedia untuk akun ini.
 *
 * DITENTUKAN PEMANGGIL, bukan ditebak di sini. Aturannya sederhana dan lengkap:
 * akun yang punya nomor HP memakai kode OTP; yang tidak punya nomor pasti
 * masuk lewat Google (platform ini tidak punya password, jadi setiap akun
 * memegang setidaknya satu dari keduanya).
 */
export type CaraKonfirmasi =
  | { jenis: "otp"; nomor: string }
  | {
      jenis: "google";
      /**
       * Membawa pengguna ke Google. Disediakan pemanggil karena pengalihan
       * menyentuh `window.location` — dan `features/` adalah lapisan yang
       * dipakai ulang mobile, sehingga ia tidak boleh menyentuh DOM langsung
       * (features/README.md).
       */
      mulai: () => Promise<void>;
    };

export interface DialogHapusAkunProps {
  klien: ApiClient;
  cara: CaraKonfirmasi;
  /**
   * Dipanggil setelah akun BENAR-BENAR terhapus dan pengguna menutup layar
   * terakhir. Pemanggillah yang mengakhiri sesi dan memindahkan halaman —
   * bukan dialog ini, yang tidak boleh tahu soal router.
   *
   * Pada jalur Google ia tidak pernah terpanggil: penghapusannya selesai di
   * halaman kembalian, bukan di sini.
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

/**
 * Judul & deskripsi per langkah sebagai DATA.
 *
 * Bukan rantai ternary: dengan empat langkah ia sudah tidak terbaca, dan
 * langkah kelima nanti akan ditambahkan ke salah satunya saja — sehingga
 * dialognya punya judul yang benar tetapi deskripsi milik langkah lain.
 */
const JUDUL: Readonly<Record<Langkah, KunciTeks>> = {
  akibat: "pengaturan.hapus.dialog.judul",
  kode: "pengaturan.hapus.kode.judul",
  google: "pengaturan.hapus.google.judul",
  selesai: "pengaturan.hapus.selesai.judul",
};

const DESKRIPSI: Readonly<Record<Langkah, KunciTeks | undefined>> = {
  akibat: "pengaturan.hapus.dialog.deskripsi",
  kode: "pengaturan.hapus.kode.deskripsi",
  google: "pengaturan.hapus.google.deskripsi",
  selesai: undefined,
};

export function DialogHapusAkun({ klien, cara, onSelesai }: DialogHapusAkunProps) {
  const t = useTeks();
  const [terbuka, setTerbuka] = useState(false);
  const [langkah, setLangkah] = useState<Langkah>("akibat");
  const [kode, setKode] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState("");

  const kotakKode = useRef<HTMLInputElement>(null);
  const nomor = cara.jenis === "otp" ? cara.nomor : "";

  const kirimKode = useMutation({
    mutationFn: () => requestOtp(klien, { phone: nomor }),
    onMutate: () => {
      setGalat(null);
      setKabar("");
    },
    onSuccess: () => setKabar(t("pengaturan.hapus.kode.terkirim", { nomor })),
    onError: (e: unknown) => setGalat(pesanGalatHapus(e, t)),
  });

  /**
   * Berangkat ke Google. Kegagalannya ditampilkan, bukan dibiarkan senyap:
   * menyiapkan PKCE bisa gagal di konteks tidak aman (`crypto.subtle` hanya
   * ada di HTTPS dan localhost), dan tombol yang tidak melakukan apa pun
   * membuat pengguna mengira dirinya salah menekan.
   */
  const keGoogle = useMutation({
    mutationFn: () => (cara.jenis === "google" ? cara.mulai() : Promise.resolve()),
    onMutate: () => setGalat(null),
    onError: () => setGalat(t("pengaturan.hapus.google.gagalSiap")),
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
      judul={t(JUDUL[langkah])}
      deskripsi={DESKRIPSI[langkah] === undefined ? undefined : t(DESKRIPSI[langkah]!)}
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
            <Tombol onClick={() => setLangkah(cara.jenis === "otp" ? "kode" : "google")}>
              {t("pengaturan.hapus.lanjut")}
            </Tombol>
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
        ) : langkah === "google" ? (
          <>
            <TutupDialog asChild>
              <Tombol varian="sekunder">{t("pengaturan.hapus.batal")}</Tombol>
            </TutupDialog>
            <Tombol
              aria-disabled={keGoogle.isPending}
              aria-busy={keGoogle.isPending}
              onClick={() => {
                if (keGoogle.isPending) return;
                keGoogle.mutate();
              }}
            >
              {t("pengaturan.hapus.google.lanjut")}
            </Tombol>
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
      ) : langkah === "google" ? (
        <div className="flex flex-col gap-3">
          {/* Tidak ada tombol perusak di layar ini, dan itu disengaja: yang
              ditekan di sini hanya membawa pengguna ke Google. Penghapusannya
              diputuskan sekali lagi di halaman kembalian, dengan tombol yang
              menyebut akibatnya. */}
          {galat !== null ? <p role="alert">{galat}</p> : null}
        </div>
      ) : (
        <p>{t("pengaturan.hapus.selesai.penjelasan", { hari: HARI_SEBELUM_PURGE })}</p>
      )}
    </Dialog>
  );
}
