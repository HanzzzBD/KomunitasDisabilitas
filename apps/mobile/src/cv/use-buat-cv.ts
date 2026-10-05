// Buat CV dari profil (PR-092; paritas `useBuatCvDariProfil` web). Isinya dirakit
// `buatPrefillResume` dari `@nawasena/formulir` — aturan yang sama dengan web.
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
} from "@nawasena/api-client";
import { buatPrefillResume } from "@nawasena/formulir";
import type { Resume } from "@nawasena/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../api";
import { track } from "../analitik/instans";

export const JUDUL_CV_BAWAAN = "CV Baru Saya";

export function useBuatCvDariProfil(sub: string | null, onBerhasil: (r: Resume) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const [akun, profil, pengalaman, pendidikan, keahlian] = await Promise.all([
        qc.fetchQuery({ queryKey: usersKeys.me(), queryFn: () => getMe(apiClient) }),
        qc.fetchQuery({ queryKey: profilesKeys.me(sub), queryFn: () => getProfile(apiClient) }),
        qc.fetchQuery({
          queryKey: profilesKeys.experiences(sub),
          queryFn: () => experiencesApi.list(apiClient),
        }),
        qc.fetchQuery({
          queryKey: profilesKeys.educations(sub),
          queryFn: () => educationsApi.list(apiClient),
        }),
        qc.fetchQuery({
          queryKey: profilesKeys.skills(sub),
          queryFn: () => skillsApi.list(apiClient),
        }),
      ]);
      return createResume(apiClient, {
        title: JUDUL_CV_BAWAAN,
        content: buatPrefillResume({ akun: akun.data, profil, pengalaman, pendidikan, keahlian }),
      });
    },
    onSuccess: (resume) => {
      track("cv_dibuat", { via: "profil" });
      qc.setQueryData(resumesKeys.detail(sub, resume.id), resume);
      void qc.invalidateQueries({ queryKey: resumesKeys.list(sub) });
      onBerhasil(resume);
    },
  });
}
