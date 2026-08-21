// Bagian 2 — data disabilitas dan kebutuhan akomodasi (PR-040).
//
// SATU-SATUNYA TEMPAT DI SELURUH APLIKASI INI YANG MEMINTA DATA PRIBADI
// SPESIFIK (UU PDP 27/2022), dan bentuknya ditentukan oleh tiga aturan yang
// tidak boleh dilanggar demi kerapian:
//
//   1. CONSENT TIDAK PERNAH TERCENTANG LEBIH DULU. Persetujuan yang sudah
//      tercentang saat layar dibuka bukan persetujuan — dan bagi pengguna yang
//      menjelajah dengan screen reader, kotak yang sudah tercentang itu bahkan
//      mungkin tak pernah ia sadari ada.
//   2. KOLOMNYA TIDAK ADA SEBELUM IZIN DIBERIKAN. Formulir yang siap diisi di
//      bawah kotak consent yang belum dicentang mengundang orang mengisinya
//      lebih dulu — lalu izin menjadi formalitas yang ia klik agar isiannya
//      tidak terbuang.
//   3. PENCABUTAN ADA DI HALAMAN YANG SAMA, bukan di menu lain. Hak menarik
//      kembali yang harus dicari dulu adalah hak yang secara praktis tidak ada.
//
// KENAPA KOTAK CONSENT HILANG SETELAH IZIN DIBERIKAN. Setelah izin ada, satu-
// satunya jalan mencabutnya adalah tombol pencabutan berkonfirmasi di bawah.
// Membiarkan kotaknya tetap ada berarti dua jalan menuju tindakan yang sama:
// satu yang menghapus data seketika tanpa peringatan (membuka centang), dan
// satu lagi yang bertanya dulu. Yang tanpa peringatan pasti akan tertekan tidak
// sengaja oleh seseorang.
import { useState } from "react";
import { AreaTeks, Dialog, KolomForm, KotakCentang, Tombol } from "@nawasena/ui";
import {
  ACCOMMODATION_NEEDS,
  DISABILITY_TYPES,
  type AccommodationNeed,
  type DisabilityType,
  type SeekerProfile,
  type UpdateSeekerProfile,
} from "@nawasena/schemas";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { RAGAM } from "../onboarding/langkah-ragam-disabilitas.js";
import type { GalatKolom } from "./pesan-galat.js";

/** Nilai formulir bagian sensitif. */
export interface NilaiSensitif {
  /** Kotak consent — HANYA berarti saat izin belum pernah diberikan. */
  setuju: boolean;
  ragam: readonly DisabilityType[];
  akomodasi: readonly AccommodationNeed[];
  catatan: string;
}

export const SENSITIF_KOSONG: NilaiSensitif = {
  setuju: false,
  ragam: [],
  akomodasi: [],
  catatan: "",
};

/**
 * Profil dari server → nilai formulir.
 *
 * `sensitive === null` berarti platform tidak sedang memegang data disabilitas
 * orang ini SAMA SEKALI — bukan "datanya kosong". Keduanya menghasilkan
 * formulir yang terlihat sama, dan itulah kenapa perbedaannya harus dibaca dari
 * `consentSensitiveAt`, bukan dari isinya.
 */
export function keNilaiSensitif(profil: SeekerProfile): NilaiSensitif {
  if (profil.sensitive === null) return { ...SENSITIF_KOSONG };
  return {
    setuju: true,
    ragam: profil.sensitive.disabilityTypes,
    akomodasi: profil.sensitive.accommodationNeeds.tags,
    catatan: profil.sensitive.accommodationNeeds.notes ?? "",
  };
}

/**
 * Nilai formulir → badan permintaan penyimpanan.
 *
 * `consentSensitive: true` HANYA disertakan bila izinnya baru diberikan di
 * layar ini. Mengirimkannya setiap kali menyimpan akan menulis ulang
 * `consent_sensitive_at` di server pada tiap penyuntingan — dan tanggal
 * persetujuan yang bergeser setiap kali seseorang memperbaiki catatannya bukan
 * bukti persetujuan lagi, padahal justru sebagai bukti ia disimpan (UU PDP).
 */
export function keBadanSensitif(nilai: NilaiSensitif, sudahBerizin: boolean): UpdateSeekerProfile {
  return {
    ...(sudahBerizin ? {} : { consentSensitive: true }),
    disabilityTypes: [...nilai.ragam],
    accommodationNeeds: { tags: [...nilai.akomodasi], notes: nilai.catatan },
  };
}

/** Badan permintaan PENCABUTAN — sengaja tidak memuat apa pun selain sakelarnya. */
export const BADAN_CABUT: UpdateSeekerProfile = { consentSensitive: false };

/** Label taksonomi akomodasi; nilainya dari `@nawasena/schemas`. */
const KUNCI_AKOMODASI: Readonly<Record<AccommodationNeed, KunciTeks>> = {
  akses_kursi_roda: "profil.akomodasi.akses_kursi_roda",
  ramah_screen_reader: "profil.akomodasi.ramah_screen_reader",
  wawancara_via_teks: "profil.akomodasi.wawancara_via_teks",
  jam_kerja_fleksibel: "profil.akomodasi.jam_kerja_fleksibel",
  ruang_kerja_tenang: "profil.akomodasi.ruang_kerja_tenang",
  juru_bahasa_isyarat: "profil.akomodasi.juru_bahasa_isyarat",
};

/**
 * Label ragam disabilitas DIPINJAM dari wizard onboarding, tidak ditulis ulang.
 *
 * Pengguna melihat daftar yang sama dua kali — sekali saat pertama masuk, sekali
 * di sini — dan dua salinan teks yang sama adalah dua salinan yang cepat atau
 * lambat berbeda bunyinya. Yang membaca perbedaan itu sebagai "pilihannya
 * berubah" adalah orang yang paling tidak boleh dibuat ragu tentang apa yang
 * sudah ia tandai mengenai dirinya sendiri.
 */
const KUNCI_RAGAM: Readonly<Record<string, KunciTeks>> = Object.fromEntries(
  RAGAM.map((r) => [r.nilai, r.kunci]),
);

/** Tanggal WIB eksplisit — alasan sama dengan `pengaturan-akun.tsx`. */
const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export interface BagianSensitifProps {
  nilai: NilaiSensitif;
  onUbah: (nilai: NilaiSensitif) => void;
  /** Kapan izin diberikan; null = belum pernah. */
  berizinSejak: string | null;
  galat: GalatKolom;
  onCabut: () => void;
  sedangMencabut: boolean;
}

export function BagianSensitif({
  nilai,
  onUbah,
  berizinSejak,
  galat,
  onCabut,
  sedangMencabut,
}: BagianSensitifProps) {
  const t = useTeks();
  const [dialogCabut, setDialogCabut] = useState(false);
  const sudahBerizin = berizinSejak !== null;
  // Kolom sensitif muncul bila izinnya SUDAH ada, atau baru saja dicentang di
  // layar ini. Aturan 2 di atas.
  const kolomTampak = sudahBerizin || nilai.setuju;

  function alihkan<T extends string>(daftar: readonly T[], nilaiItem: T, dicentang: boolean): T[] {
    return dicentang ? [...daftar, nilaiItem] : daftar.filter((x) => x !== nilaiItem);
  }

  return (
    <>
      <p className="text-base text-gray-900">{t("profil.sensitif.penjelasan")}</p>
      <p className="text-base font-semibold text-gray-900">{t("profil.sensitif.siapaMelihat")}</p>

      {sudahBerizin ? (
        <p className="text-base text-gray-900">
          {t("profil.sensitif.consentSejak", {
            tanggal: TANGGAL.format(new Date(berizinSejak)),
          })}
        </p>
      ) : (
        <>
          <p className="text-base text-gray-900">{t("profil.sensitif.belumDiizinkan")}</p>
          <KotakCentang
            label={t("profil.sensitif.consentLabel")}
            bantuan={t("profil.sensitif.consentBantuan")}
            dicentang={nilai.setuju}
            onUbah={(dicentang) => {
              // Membuka centang SEBELUM menyimpan membuang isian yang terlanjur
              // ditulis. Itu disengaja: yang tersisa di layar setelah izin
              // ditarik kembali tidak boleh berupa data disabilitas yang siap
              // terkirim pada penyimpanan berikutnya.
              onUbah(dicentang ? { ...nilai, setuju: true } : { ...SENSITIF_KOSONG });
            }}
          />
        </>
      )}

      {kolomTampak && (
        <>
          {/*
            `<fieldset>` + `<legend>`: sekumpulan kotak centang yang menjawab
            SATU pertanyaan harus punya nama bersama. Tanpa itu, screen reader
            membacakan lima kotak lepas tanpa pernah menyebut pertanyaannya.
          */}
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-base font-semibold text-gray-900">
              {t("profil.sensitif.ragamLegenda")}
            </legend>
            {DISABILITY_TYPES.map((ragam) => (
              <KotakCentang
                key={ragam}
                label={t(KUNCI_RAGAM[ragam] ?? "profil.sensitif.ragamLegenda")}
                dicentang={nilai.ragam.includes(ragam)}
                onUbah={(dicentang) => {
                  onUbah({ ...nilai, ragam: alihkan(nilai.ragam, ragam, dicentang) });
                }}
              />
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-base font-semibold text-gray-900">
              {t("profil.sensitif.akomodasiLegenda")}
            </legend>
            {ACCOMMODATION_NEEDS.map((akomodasi) => (
              <KotakCentang
                key={akomodasi}
                label={t(KUNCI_AKOMODASI[akomodasi])}
                dicentang={nilai.akomodasi.includes(akomodasi)}
                onUbah={(dicentang) => {
                  onUbah({
                    ...nilai,
                    akomodasi: alihkan(nilai.akomodasi, akomodasi, dicentang),
                  });
                }}
              />
            ))}
          </fieldset>

          <KolomForm
            label={t("profil.sensitif.catatan")}
            bantuan={t("profil.sensitif.catatanBantuan")}
            // Nama kolomnya bersarang di badan permintaan, jadi kunci galatnya
            // ikut bersarang — dirakit `galatPerKolom` dari `path` zod apa adanya.
            galat={galat["accommodationNeeds.notes"]}
          >
            <AreaTeks
              value={nilai.catatan}
              rows={3}
              maxLength={500}
              onChange={(e) => {
                onUbah({ ...nilai, catatan: e.target.value });
              }}
            />
          </KolomForm>
        </>
      )}

      {sudahBerizin && (
        <div className="flex flex-col gap-1 border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-700">{t("profil.sensitif.cabutBantuan")}</p>
          <div>
            <Tombol
              varian="sekunder"
              onClick={() => {
                setDialogCabut(true);
              }}
            >
              {t("profil.sensitif.cabut")}
            </Tombol>
          </div>
        </div>
      )}

      <Dialog
        judul={t("profil.sensitif.cabutKonfirmasi")}
        deskripsi={t("profil.sensitif.cabutAkibat")}
        terbuka={dialogCabut}
        onUbahTerbuka={setDialogCabut}
        labelTutup={t("profil.sensitif.cabutBatal")}
        aksi={
          <>
            <Tombol
              varian="bahaya"
              aria-disabled={sedangMencabut}
              aria-busy={sedangMencabut}
              onClick={() => {
                if (sedangMencabut) return;
                setDialogCabut(false);
                onCabut();
              }}
            >
              {t("profil.sensitif.cabutYa")}
            </Tombol>
            <Tombol
              varian="sekunder"
              onClick={() => {
                setDialogCabut(false);
              }}
            >
              {t("profil.sensitif.cabutBatal")}
            </Tombol>
          </>
        }
      >
        {/*
          Isi dialog menyebut apa yang TIDAK terjadi. Akibatnya sendiri sudah
          ada di `deskripsi` di atas — yang dirender Radix sebagai
          `Dialog.Description` dan diumumkan bersama judulnya saat dialog
          terbuka. Mengulanginya di sini membuat screen reader membacakan
          kalimat yang sama dua kali berturut-turut.
        */}
        <p className="text-base text-gray-900">{t("profil.sensitif.cabutSetelah")}</p>
      </Dialog>
    </>
  );
}
