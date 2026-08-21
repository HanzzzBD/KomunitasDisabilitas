// Halaman "/profil" — profil karier lengkap (PR-040).
//
// TIGA BAGIAN, TIGA TOMBOL SIMPAN, TIGA JALUR KEGAGALAN YANG TERPISAH. Itulah
// seluruh bentuk halaman ini, dan alasannya ada di `features/profil/bagian.tsx`:
// formulir sepanjang ini yang hangus seluruhnya karena satu kolom salah tidak
// akan diisi untuk kedua kalinya.
//
// KENAPA `/profil` DAN BUKAN `/pengaturan/profil`. Panel pengaturan menjawab
// "bagaimana aplikasi ini berperilaku untuk saya" — akun, data saya,
// aksesibilitas. Profil karier bukan setelan: ia ISI yang dipakai mencarikan
// pekerjaan (US-02/US-06), dan ia akan menjadi tujuan tautan dari beranda,
// dari hasil pencocokan, dan dari alur melamar. Menyarangkannya di bawah
// pengaturan berarti setiap tautan itu mengantar pengguna ke layar bernavigasi
// setelan, di tengah pekerjaan yang sama sekali bukan menyetel apa pun.
//
// KEADAAN FORMULIR DIPEGANG DI SINI, bukan di tiap bagian. Bagian-bagiannya
// sengaja tanpa keadaan sendiri supaya bisa diuji dengan nilai apa pun tanpa
// jaringan — dan supaya jawaban server sesudah menyimpan bisa langsung menjadi
// keadaan berikutnya, bukan disalin ulang lewat pemuatan kedua.
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getProfile, profilesKeys, updateProfile } from "@nawasena/api-client";
import type { SeekerProfile } from "@nawasena/schemas";
import { updateSeekerProfileSchema } from "@nawasena/schemas";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useKlienApi } from "../app/klien-api.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import {
  BADAN_CABUT,
  BagianDasar,
  BagianProfil,
  BagianSensitif,
  DaftarKarier,
  keBadanDasar,
  keBadanSensitif,
  keNilaiDasar,
  keNilaiSensitif,
  konfigKeahlian,
  konfigPendidikan,
  konfigPengalaman,
  periksa,
  pesanGalatSimpan,
  type GalatKolom,
  type NilaiDasar,
  type NilaiSensitif,
} from "../features/profil/index.js";

export function Profil() {
  // Penjaga sesi DI DALAM komponen, bukan di `routes.ts` — berkas itu sengaja
  // `.ts` murni data (lihat catatannya), dan membungkus route dengan elemen JSX
  // akan memaksanya menjadi `.tsx`.
  return (
    <Terlindungi>
      <IsiProfil />
    </Terlindungi>
  );
}

function IsiProfil() {
  const t = useTeks();
  const klien = useKlienApi();
  useJudulHalaman(t("profil.judul"));

  // `sub` melingkupi kunci cache — alasannya di `profilesKeys`. Dibaca dengan
  // fungsi yang sama seperti `PenyediaA11y`, yang menyelesaikan persoalan yang
  // sama persis.
  const sub = idPenggunaSaatIni();

  const profil = useQuery({
    queryKey: profilesKeys.me(sub),
    queryFn: () => getProfile(klien),
  });

  const [dasar, setDasar] = useState<NilaiDasar | null>(null);
  const [sensitif, setSensitif] = useState<NilaiSensitif | null>(null);
  const [berizinSejak, setBerizinSejak] = useState<string | null>(null);
  const [galatDasar, setGalatDasar] = useState<GalatKolom>({});
  const [galatSensitif, setGalatSensitif] = useState<GalatKolom>({});

  /**
   * Isi keadaan formulir SEKALI, saat data pertama tiba.
   *
   * Sengaja tidak menyalin ulang pada setiap perubahan `profil.data`: pemuatan
   * ulang di latar belakang (mis. setelah jaringan pulih) akan menimpa isian
   * yang sedang diketik seseorang, dan kehilangan seperti itu tidak
   * meninggalkan satu pun pesan yang bisa ia mengerti. Sesudah menyimpan,
   * keadaan diperbarui dari JAWABAN mutasinya — sumber yang sama, tanpa
   * kejutan.
   */
  useEffect(() => {
    if (profil.data === undefined || dasar !== null) return;
    pasang(profil.data);
    // `dasar` sengaja ikut dibaca sebagai penjaga "sekali saja"; menaruhnya di
    // daftar dependensi membuat efek ini berhenti dijalankan begitu terisi.
  }, [profil.data, dasar]);

  function pasang(isi: SeekerProfile): void {
    setDasar(keNilaiDasar(isi));
    setSensitif(keNilaiSensitif(isi));
    setBerizinSejak(isi.consentSensitiveAt);
  }

  const simpanDasar = useMutation({
    mutationFn: (badan: Parameters<typeof updateProfile>[1]) => updateProfile(klien, badan),
    onSuccess: pasang,
  });

  const simpanSensitif = useMutation({
    mutationFn: (badan: Parameters<typeof updateProfile>[1]) => updateProfile(klien, badan),
    onSuccess: pasang,
  });

  const cabut = useMutation({
    mutationFn: () => updateProfile(klien, BADAN_CABUT),
    onSuccess: pasang,
  });

  function kirimDasar(): void {
    if (dasar === null) return;
    const hasil = periksa(updateSeekerProfileSchema, keBadanDasar(dasar));
    if (!hasil.ok) {
      setGalatDasar(hasil.galat);
      return;
    }
    setGalatDasar({});
    simpanDasar.mutate(hasil.nilai);
  }

  function kirimSensitif(): void {
    if (sensitif === null) return;
    const hasil = periksa(
      updateSeekerProfileSchema,
      keBadanSensitif(sensitif, berizinSejak !== null),
    );
    if (!hasil.ok) {
      setGalatSensitif(hasil.galat);
      return;
    }
    setGalatSensitif({});
    simpanSensitif.mutate(hasil.nilai);
  }

  /** Kalimat kegagalan satu bagian — validasi dulu, baru kegagalan kirim. */
  function galatBagian(
    mutasi: { isError: boolean; error: unknown },
    perKolom: GalatKolom,
  ): string | null {
    if (Object.keys(perKolom).length > 0) return t("profil.galat.periksaKolom");
    return mutasi.isError ? pesanGalatSimpan(mutasi.error, t) : null;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      {/*
        `break-words`: pada 320 px dengan teks 200%, judul panjang memaksa
        seluruh halaman menggeser mendatar (WCAG 1.4.10). Alasan yang sama
        dengan judul halaman pengaturan.
      */}
      <h1 className="text-3xl font-bold break-words text-gray-900">{t("profil.judul")}</h1>
      <p className="text-base text-gray-900">{t("profil.deskripsi")}</p>

      <WilayahMemuat memuat={profil.isPending} label={t("profil.memuat")}>
        {profil.isError && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-base font-medium text-red-700">{t("profil.gagal")}</p>
            <Tombol
              varian="sekunder"
              onClick={() => {
                void profil.refetch();
              }}
            >
              {t("profil.cobaLagi")}
            </Tombol>
          </div>
        )}

        {dasar !== null && sensitif !== null && (
          <div className="flex flex-col gap-6">
            <BagianProfil
              judul={t("profil.dasar.judul")}
              namaPengumuman={t("profil.dasar.judul")}
              deskripsi={t("profil.dasar.deskripsi")}
              onSimpan={kirimDasar}
              sedangMenyimpan={simpanDasar.isPending}
              galat={galatBagian(simpanDasar, galatDasar)}
              tersimpan={simpanDasar.isSuccess}
            >
              <BagianDasar
                nilai={dasar}
                onUbah={(baru) => {
                  setDasar(baru);
                  // Keberhasilan sebelumnya tidak lagi menggambarkan isi layar
                  // begitu satu huruf berubah. Membiarkannya berarti live region
                  // menyatakan "sudah disimpan" atas perubahan yang belum.
                  simpanDasar.reset();
                }}
                galat={galatDasar}
              />
            </BagianProfil>

            <BagianProfil
              judul={t("profil.sensitif.judul")}
              namaPengumuman={t("profil.sensitif.judul")}
              penanda={
                // Penanda data sensitif: teks, bukan warna saja (WCAG 1.4.1),
                // dan ikut dibacakan screen reader.
                <span className="rounded-full border border-amber-700 px-2 py-0.5 text-sm font-medium text-amber-800">
                  {t("profil.sensitif.penanda")}
                </span>
              }
              onSimpan={kirimSensitif}
              sedangMenyimpan={simpanSensitif.isPending}
              galat={galatBagian(simpanSensitif, galatSensitif) ?? galatBagian(cabut, {})}
              tersimpan={simpanSensitif.isSuccess}
              // Tanpa izin, tidak ada satu pun kolom sensitif di layar — jadi
              // tidak ada yang bisa disimpan, dan tombol simpan yang tetap ada
              // hanya menawarkan tindakan yang tidak melakukan apa pun.
              tanpaTombolSimpan={berizinSejak === null && !sensitif.setuju}
            >
              <BagianSensitif
                nilai={sensitif}
                onUbah={(baru) => {
                  setSensitif(baru);
                  simpanSensitif.reset();
                }}
                berizinSejak={berizinSejak}
                galat={galatSensitif}
                onCabut={() => {
                  cabut.mutate();
                }}
                sedangMencabut={cabut.isPending}
              />
              {cabut.isSuccess && berizinSejak === null && (
                <p role="status" className="text-base font-medium text-gray-900">
                  {t("profil.sensitif.dicabut")}
                </p>
              )}
            </BagianProfil>

            <BagianProfil
              judul={t("profil.karier.judul")}
              namaPengumuman={t("profil.karier.judul")}
              deskripsi={t("profil.karier.deskripsi")}
              onSimpan={() => {
                // Tidak terpakai: bagian ini menyimpan PER BARIS.
              }}
              sedangMenyimpan={false}
              galat={null}
              tersimpan={false}
              tanpaTombolSimpan
            >
              <DaftarKarier konfig={konfigPengalaman(sub)} klien={klien} />
              <DaftarKarier konfig={konfigPendidikan(sub)} klien={klien} />
              <DaftarKarier konfig={konfigKeahlian(sub)} klien={klien} />
            </BagianProfil>
          </div>
        )}
      </WilayahMemuat>
    </div>
  );
}
