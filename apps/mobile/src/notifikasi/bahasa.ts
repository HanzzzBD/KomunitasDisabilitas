import { rekonsiliasi } from "@nawasena/a11y";
import { a11yStore } from "../a11y/store";

export function useBahasaNotifikasi(): "id" | "id-simple" {
  return a11yStore((s) =>
    rekonsiliasi(s.pilihanPengguna, s.os).simpleLanguage ? "id-simple" : "id",
  );
}
