// Bagian 1 — data dasar profil (PR-040).
//
// TIDAK ADA SATU PUN FIELD SENSITIF DI SINI, dan itu bukan kebetulan penataan.
// Bagian ini memetakan `safeProfileSchema` (packages/schemas) satu lawan satu:
// yang di sini boleh dilihat perusahaan yang menerima lamaran, yang sensitif
// tinggal di bagian tersendiri dengan penanda dan gerbang consent-nya sendiri.
// Mencampur keduanya dalam satu kartu akan membuat pengguna kehilangan satu-
// satunya petunjuk visual tentang data mana yang berbeda perlakuannya.
//
// `disclosureDefault` ADA DI SINI meski namanya menyebut disabilitas: ia setelan
// PERILAKU (beri tahu atau tidak saat melamar), bukan kondisi seseorang, jadi
// ia tidak butuh consent dan tidak ikut terenkripsi. Menaruhnya di bagian
// sensitif akan menyembunyikannya dari pengguna yang belum memberi consent —
// padahal justru merekalah yang paling perlu melihat bahwa bawaannya "tanya
// saya dulu".
import { AreaTeks, KolomForm, KotakCentang, Masukan, Pilihan } from "@nawasena/ui";
import type { SeekerProfile, UpdateSeekerProfile } from "@nawasena/schemas";
import { useTeks, type FungsiTeks } from "../../shared/i18n/index.js";
import type { GalatKolom } from "./pesan-galat.js";

/** Nilai formulir bagian dasar — teks selalu string, tidak pernah null. */
export interface NilaiDasar {
  headline: string;
  summary: string;
  city: string;
  province: string;
  openToRemote: boolean;
  disclosureDefault: SeekerProfile["disclosureDefault"];
}

/**
 * Profil dari server → nilai formulir.
 *
 * `null` menjadi string kosong, dan itu perlu dinyatakan: `<input value={null}>`
 * membuat React memindahkan kolomnya dari terkendali ke tak terkendali di
 * tengah jalan, dan isian pengguna hilang tanpa satu pun galat.
 */
export function keNilaiDasar(profil: SeekerProfile): NilaiDasar {
  return {
    headline: profil.headline ?? "",
    summary: profil.summary ?? "",
    city: profil.city ?? "",
    province: profil.province ?? "",
    openToRemote: profil.openToRemote,
    disclosureDefault: profil.disclosureDefault,
  };
}

/**
 * Nilai formulir → badan permintaan.
 *
 * Keenamnya SELALU disebut, termasuk yang kosong. Skema membedakan tiga
 * keadaan — tidak disebut = jangan sentuh, bernilai = simpan, `null` =
 * kosongkan — dan formulir yang menghilangkan kolom kosongnya akan membuat
 * pengguna TIDAK BISA menghapus judul profil yang terlanjur ia tulis. String
 * kosong diubah menjadi `null` oleh skemanya sendiri, jadi "kosongkan" cukup
 * dikirim apa adanya.
 */
export function keBadanDasar(nilai: NilaiDasar): UpdateSeekerProfile {
  return {
    headline: nilai.headline,
    summary: nilai.summary,
    city: nilai.city,
    province: nilai.province,
    openToRemote: nilai.openToRemote,
    disclosureDefault: nilai.disclosureDefault,
  };
}

/** Ketiga pilihan disclosure sebagai data — teksnya diambil saat render. */
function opsiDisclosure(t: FungsiTeks) {
  return [
    { nilai: "never", label: t("profil.dasar.disclosureNever") },
    { nilai: "ask_each_time", label: t("profil.dasar.disclosureTanya") },
    { nilai: "always", label: t("profil.dasar.disclosureSelalu") },
  ];
}

export interface BagianDasarProps {
  nilai: NilaiDasar;
  onUbah: (nilai: NilaiDasar) => void;
  galat: GalatKolom;
}

export function BagianDasar({ nilai, onUbah, galat }: BagianDasarProps) {
  const t = useTeks();
  const ubah = <K extends keyof NilaiDasar>(kunci: K, isi: NilaiDasar[K]): void => {
    onUbah({ ...nilai, [kunci]: isi });
  };

  return (
    <>
      <KolomForm
        label={t("profil.dasar.headline")}
        bantuan={t("profil.dasar.headlineBantuan")}
        galat={galat.headline}
      >
        <Masukan
          value={nilai.headline}
          maxLength={120}
          onChange={(e) => {
            ubah("headline", e.target.value);
          }}
        />
      </KolomForm>

      <KolomForm
        label={t("profil.dasar.ringkasan")}
        bantuan={t("profil.dasar.ringkasanBantuan")}
        galat={galat.summary}
      >
        <AreaTeks
          value={nilai.summary}
          rows={5}
          maxLength={2000}
          onChange={(e) => {
            ubah("summary", e.target.value);
          }}
        />
      </KolomForm>

      {/*
        Kota dan provinsi berdampingan di layar lebar, bertumpuk di ponsel.
        `sm:` — bukan lebar tetap — supaya pada 320px dengan teks 200% keduanya
        tetap satu kolom penuh (WCAG 1.4.10 Reflow diukur di sana).
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <KolomForm label={t("profil.dasar.kota")} galat={galat.city}>
          <Masukan
            value={nilai.city}
            maxLength={80}
            autoComplete="address-level2"
            onChange={(e) => {
              ubah("city", e.target.value);
            }}
          />
        </KolomForm>

        <KolomForm label={t("profil.dasar.provinsi")} galat={galat.province}>
          <Masukan
            value={nilai.province}
            maxLength={80}
            autoComplete="address-level1"
            onChange={(e) => {
              ubah("province", e.target.value);
            }}
          />
        </KolomForm>
      </div>

      <KotakCentang
        label={t("profil.dasar.remote")}
        bantuan={t("profil.dasar.remoteBantuan")}
        dicentang={nilai.openToRemote}
        onUbah={(dicentang) => {
          ubah("openToRemote", dicentang);
        }}
      />

      <KolomForm
        label={t("profil.dasar.disclosure")}
        bantuan={t("profil.dasar.disclosureBantuan")}
        galat={galat.disclosureDefault}
      >
        <Pilihan
          opsi={opsiDisclosure(t)}
          nilai={nilai.disclosureDefault}
          onUbah={(dipilih) => {
            ubah("disclosureDefault", dipilih as NilaiDasar["disclosureDefault"]);
          }}
        />
      </KolomForm>
    </>
  );
}
