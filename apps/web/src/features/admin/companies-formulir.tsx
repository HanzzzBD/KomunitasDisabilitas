// Formulir tambah/ubah perusahaan — AC PR-053: "Editor taksonomi valid (nilai
// liar tak terkirim)", "Form keyboard-only + axe pass".
//
// TAKSONOMI AKOMODASI TIDAK PERNAH BISA MEMUAT NILAI LIAR SECARA STRUKTURAL:
// kotak centangnya dirakit dari `ACCOMMODATION_NEEDS` (satu-satunya sumber
// taksonomi, dipakai juga sisi server dan panel profil pencari kerja), bukan
// dari teks bebas — pengguna tidak pernah punya jalan mengetik nilai yang
// bukan salah satu dari enam itu.
//
// LABEL AKOMODASI DIPINJAM dari katalog `profil`, tidak ditulis ulang. Admin
// dan pencari kerja harus membaca nama akomodasi yang SAMA PERSIS — dua
// salinan teks untuk satu taksonomi adalah dua salinan yang cepat atau lambat
// berbeda bunyinya (alasan yang sama dengan `bagian-sensitif.tsx` meminjam
// label ragam disabilitas dari onboarding).
import { ACCOMMODATION_NEEDS, type AccommodationNeed } from "@nawasena/schemas";
import { AreaTeks, KolomForm, KotakCentang, Masukan, Tombol } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import type { NilaiPerusahaan } from "./companies-badan.js";
import type { GalatKolom } from "./companies-pesan-galat.js";

/** Sama persis dengan `KUNCI_AKOMODASI` di `features/profil/bagian-sensitif.tsx`. */
const KUNCI_AKOMODASI: Readonly<Record<AccommodationNeed, KunciTeks>> = {
  akses_kursi_roda: "profil.akomodasi.akses_kursi_roda",
  ramah_screen_reader: "profil.akomodasi.ramah_screen_reader",
  wawancara_via_teks: "profil.akomodasi.wawancara_via_teks",
  jam_kerja_fleksibel: "profil.akomodasi.jam_kerja_fleksibel",
  ruang_kerja_tenang: "profil.akomodasi.ruang_kerja_tenang",
  juru_bahasa_isyarat: "profil.akomodasi.juru_bahasa_isyarat",
};

export interface FormulirPerusahaanProps {
  nilai: NilaiPerusahaan;
  onUbah: (nilai: NilaiPerusahaan) => void;
  galat: GalatKolom;
  sedangMenyimpan: boolean;
  onSimpan: () => void;
  onBatal: () => void;
  /** Id untuk `aria-labelledby` — form ini dipasang di bawah `<h1>` halaman. */
  namaForm: string;
}

export function FormulirPerusahaan({
  nilai,
  onUbah,
  galat,
  sedangMenyimpan,
  onSimpan,
  onBatal,
  namaForm,
}: FormulirPerusahaanProps) {
  const t = useTeks();

  return (
    <form
      aria-label={namaForm}
      // `noValidate` — bukan mematikan validasi, melainkan memilih validasi
      // yang mana. Kolom nama wajib menulis atribut `required` (lewat
      // `KolomForm`, dipertahankan supaya screen reader mengumumkan "wajib
      // diisi"), tetapi `required` juga membuat peramban MEMBLOKIR submit dan
      // menampilkan gelembung bawaannya sendiri — bukan Bahasa Indonesia,
      // tidak tersambung `aria-describedby` ke kolomnya, dan membuat
      // `onSubmit` di bawah TIDAK PERNAH terpanggil. Pola sama persis dengan
      // `profil/daftar-karier.ts` (FormBaris), yang komentarnya mencatat ini
      // "terbukti, bukan diduga".
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (sedangMenyimpan) return;
        onSimpan();
      }}
    >
      <KolomForm label={t("admin.companies.form.nama")} wajib galat={galat.name}>
        <Masukan
          value={nilai.name}
          maxLength={160}
          onChange={(e) => {
            onUbah({ ...nilai, name: e.target.value });
          }}
        />
      </KolomForm>

      <KolomForm label={t("admin.companies.form.deskripsi")} galat={galat.description}>
        <AreaTeks
          value={nilai.description}
          maxLength={2000}
          onChange={(e) => {
            onUbah({ ...nilai, description: e.target.value });
          }}
        />
      </KolomForm>

      <KolomForm
        label={t("admin.companies.form.website")}
        bantuan={t("admin.companies.form.websiteBantuan")}
        galat={galat.website}
      >
        <Masukan
          value={nilai.website}
          maxLength={300}
          inputMode="url"
          placeholder="https://contoh.id"
          onChange={(e) => {
            onUbah({ ...nilai, website: e.target.value });
          }}
        />
      </KolomForm>

      <KolomForm label={t("admin.companies.form.kota")} galat={galat.city}>
        <Masukan
          value={nilai.city}
          maxLength={100}
          onChange={(e) => {
            onUbah({ ...nilai, city: e.target.value });
          }}
        />
      </KolomForm>

      {/*
        `<fieldset>` + `<legend>`: pola yang sama dengan `bagian-sensitif.tsx`
        — sekumpulan kotak centang yang menjawab SATU pertanyaan harus punya
        nama bersama, kalau tidak screen reader membacakan enam kotak lepas
        tanpa pernah menyebut pertanyaannya.
      */}
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-base font-semibold text-gray-900">
          {t("admin.companies.form.akomodasiLegenda")}
        </legend>
        {ACCOMMODATION_NEEDS.map((akomodasi) => (
          <KotakCentang
            key={akomodasi}
            label={t(KUNCI_AKOMODASI[akomodasi])}
            dicentang={nilai.accommodationsAvailable.includes(akomodasi)}
            onUbah={(dicentang) => {
              onUbah({
                ...nilai,
                accommodationsAvailable: dicentang
                  ? [...nilai.accommodationsAvailable, akomodasi]
                  : nilai.accommodationsAvailable.filter((a) => a !== akomodasi),
              });
            }}
          />
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Tombol type="submit" aria-disabled={sedangMenyimpan} aria-busy={sedangMenyimpan}>
          {sedangMenyimpan ? t("admin.companies.form.menyimpan") : t("admin.companies.form.simpan")}
        </Tombol>
        <Tombol type="button" varian="sekunder" onClick={onBatal}>
          {t("admin.companies.form.batal")}
        </Tombol>
      </div>
    </form>
  );
}
