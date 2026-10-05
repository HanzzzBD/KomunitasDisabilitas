// Label taksonomi akomodasi & ragam disabilitas di mobile (PR-092/093) — teks
// sederhana (U-37). Satu tempat untuk profil dan detail lowongan.
import type { AccommodationNeed, DisabilityType } from "@nawasena/schemas";

import { RAGAM } from "../onboarding/Langkah";

export const LABEL_AKOMODASI: Readonly<Record<AccommodationNeed, string>> = {
  akses_kursi_roda: "Akses kursi roda",
  ramah_screen_reader: "Aplikasi kerja bisa dipakai pembaca layar",
  wawancara_via_teks: "Wawancara lewat tulisan",
  jam_kerja_fleksibel: "Jam kerja fleksibel",
  ruang_kerja_tenang: "Ruang kerja yang tenang",
  juru_bahasa_isyarat: "Juru bahasa isyarat",
};

export const LABEL_RAGAM: Readonly<Record<DisabilityType, string>> = Object.fromEntries(
  RAGAM.map((r) => [r.nilai, r.label]),
) as Record<DisabilityType, string>;
