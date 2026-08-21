// modules/profiles — kontributor ekspor PDP (PR-038, hak portabilitas §8.7).
//
// UTANG YANG DITINGGALKAN PR-037, DIBAYAR DI SINI. Modul profil lahir di PR-037
// tanpa bagian ekspornya, dan itu keputusan sadar: berkas ekspor yang memuat
// "profil" tanpa riwayat kerja, pendidikan, dan keahlian adalah berkas yang
// TAMPAK lengkap padahal bukan — kegagalan yang justru paling sulit dilaporkan
// pengguna, sebab tidak ada cara ia mengetahui apa yang seharusnya ada. Keempat
// tabelnya karena itu masuk sekaligus, sekarang, saat sub-entitasnya lahir.
//
// BAGIAN SENSITIF IKUT, TERDEKRIPSI. Itu bukan kelonggaran melainkan inti
// haknya: data yang paling dilindungi adalah data yang paling berhak dibawa
// pemiliknya. Yang menjaganya tetap milik pemilik adalah endpoint-nya
// (`/me/export`, sesi sendiri) dan gerbang consent yang sudah ada di
// `snapshotFor` — bila consent dicabut, `sensitive` bernilai null tanpa
// ciphertext-nya pernah disentuh.
import type {
  Education,
  Experience,
  ExportProfile,
  SeekerProfile,
  Skill,
} from "@nawasena/schemas";
// Impor LINTAS MODUL yang sah: service → service (aturan boundaries PR-002).
// Yang dilarang adalah menyentuh repository modul lain; tipe kontributor adalah
// bagian dari permukaan service `users`, dan justru itu gunanya.
import type { ExportContributor } from "../../users/services/export.service.js";

/** Sumber daftar sub-entitas — bentuk minimum yang dibutuhkan berkas ekspor. */
interface SumberDaftar<Item> {
  listFor(userId: string): Promise<Item[]>;
}

export interface ProfileExportDeps {
  profiles: { snapshotFor(userId: string): Promise<SeekerProfile> };
  experiences: SumberDaftar<Experience>;
  educations: SumberDaftar<Education>;
  skills: SumberDaftar<Skill>;
}

/**
 * Kontributor bagian `profile`.
 *
 * Pemetaannya EKSPLISIT, bukan spread atas `SeekerProfile`. Bentuknya kebetulan
 * sama hari ini, dan justru itulah alasan spread berbahaya: field apa pun yang
 * kelak ditambahkan ke kontrak profil akan ikut mengalir ke berkas yang beredar
 * lewat email dan penyimpanan awan, tanpa satu pun keputusan diambil.
 */
export function createProfileExportContributor(deps: ProfileExportDeps): ExportContributor {
  return {
    bagian: "profile",
    async kumpulkan(userId): Promise<ExportProfile> {
      // Berurutan, bukan Promise.all — alasan yang sama dengan agregatornya:
      // kegagalan pertama menghentikan sisanya alih-alih menyisakan query yang
      // masih berjalan tanpa ada yang menunggunya.
      const profil = await deps.profiles.snapshotFor(userId);
      const experiences = await deps.experiences.listFor(userId);
      const educations = await deps.educations.listFor(userId);
      const skills = await deps.skills.listFor(userId);

      return {
        headline: profil.headline,
        summary: profil.summary,
        city: profil.city,
        province: profil.province,
        openToRemote: profil.openToRemote,
        disclosureDefault: profil.disclosureDefault,
        consentSensitiveAt: profil.consentSensitiveAt,
        sensitive: profil.sensitive,
        experiences,
        educations,
        skills,
      };
    },
  };
}
