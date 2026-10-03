// `useBuatCvDariProfil` — jalur NON-AI pembuatan CV (PR-061, diekstrak PR-068).
//
// Dipakai dua tempat: tombol "Buat dari profil" di `/cv`, dan mode formulir di
// halaman chat saat AI tidak tersedia (ADR-005, keputusan owner 2026-09-28:
// beralih di tempat). Satu hook supaya kedua jalur menghasilkan CV yang SAMA —
// prefill dari profil yang sama, judul bawaan yang sama.
//
// Tidak bergantung pada router: pemanggil memutuskan ke mana setelah berhasil
// (`onBerhasil`), sesuai aturan `features/` (dipakai ulang mobile).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createResume,
  educationsApi,
  experiencesApi,
  getMe,
  getProfile,
  profilesKeys,
  resumesKeys,
  skillsApi,
  usersKeys,
  type ApiClient,
} from "@nawasena/api-client";
import type { Resume } from "@nawasena/schemas";
import { track } from "../../shared/analitik.js";
import { buatPrefillResume } from "./prefill.js";

export function useBuatCvDariProfil(opsi: {
  klien: ApiClient;
  sub: string | null;
  judulBawaan: string;
  onBerhasil(resume: Resume): void;
}) {
  const { klien, sub } = opsi;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const [akun, profil, pengalaman, pendidikan, keahlian] = await Promise.all([
        queryClient.fetchQuery({ queryKey: usersKeys.me(), queryFn: () => getMe(klien) }),
        queryClient.fetchQuery({
          queryKey: profilesKeys.me(sub),
          queryFn: () => getProfile(klien),
        }),
        queryClient.fetchQuery({
          queryKey: profilesKeys.experiences(sub),
          queryFn: () => experiencesApi.list(klien),
        }),
        queryClient.fetchQuery({
          queryKey: profilesKeys.educations(sub),
          queryFn: () => educationsApi.list(klien),
        }),
        queryClient.fetchQuery({
          queryKey: profilesKeys.skills(sub),
          queryFn: () => skillsApi.list(klien),
        }),
      ]);
      return createResume(klien, {
        title: opsi.judulBawaan,
        content: buatPrefillResume({
          akun: akun.data,
          profil,
          pengalaman,
          pendidikan,
          keahlian,
        }),
      });
    },
    onSuccess: (resume) => {
      void queryClient.invalidateQueries({ queryKey: resumesKeys.list(sub) });
      // PR-082 — funnel "cv_dibuat" (jalur non-AI).
      track("cv_dibuat", { via: "profil" });
      opsi.onBerhasil(resume);
    },
  });
}
