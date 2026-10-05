// Pemetaan profil seeker ↔ formulir (dipindah dari apps/web, PR-092).
//
// Dua bagian, dua perlakuan (PR-040):
// - DASAR memetakan `safeProfileSchema` satu lawan satu. `disclosureDefault`
//   ada di sini: ia setelan PERILAKU, bukan kondisi seseorang, jadi tidak butuh
//   consent — dan pengguna yang belum memberi consent justru paling perlu
//   melihat bahwa bawaannya "tanya saya dulu".
// - SENSITIF (ragam disabilitas + akomodasi) hanya ada bila consent berlaku.
//   `profil.sensitive === null` berarti platform TIDAK memegang datanya sama
//   sekali — UI harus menampilkan langkah consent, bukan formulir kosong.
import type {
  AccommodationNeed,
  DisabilityType,
  SeekerProfile,
  UpdateSeekerProfile,
} from "@nawasena/schemas";

export interface NilaiDasar {
  headline: string;
  summary: string;
  city: string;
  province: string;
  openToRemote: boolean;
  disclosureDefault: SeekerProfile["disclosureDefault"];
}

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

/** Teks kosong dikirim apa adanya — skema mengubah "" menjadi null ("kosongkan"). */
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

export interface NilaiSensitif {
  /** Kotak consent di formulir — TIDAK PERNAH tercentang di awal (UU PDP). */
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
 * Badan PUT bagian sensitif. Consent ikut dikirim HANYA bila belum berlaku:
 * mengirimnya ulang akan memperbarui `consentSensitiveAt`, dan tanggal yang
 * bergeser setiap kali pengguna mengubah catatan bukan bukti persetujuan.
 */
export function keBadanSensitif(nilai: NilaiSensitif, sudahBerizin: boolean): UpdateSeekerProfile {
  return {
    ...(sudahBerizin ? {} : { consentSensitive: true }),
    disabilityTypes: [...nilai.ragam],
    accommodationNeeds: { tags: [...nilai.akomodasi], notes: nilai.catatan },
  };
}

/** Cabut consent — server SELALU menghapus data sensitif yang tersimpan. */
export const BADAN_CABUT: UpdateSeekerProfile = { consentSensitive: false };

/** Centang/lepas satu anggota daftar pilihan ganda. */
export function alihkan<T>(daftar: readonly T[], item: T, dicentang: boolean): T[] {
  return dicentang ? [...daftar, item] : daftar.filter((x) => x !== item);
}
