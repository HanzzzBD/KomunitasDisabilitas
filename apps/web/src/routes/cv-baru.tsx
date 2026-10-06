import { useNavigate } from "react-router";
import { Tombol } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { useBuatCvDariProfil, pesanGalatResume } from "../features/resume/index.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";

export function CvBaru() {
  return (
    <Terlindungi>
      <Isi />
    </Terlindungi>
  );
}
function Isi() {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  useJudulHalaman(t("resume.daftar.buat"));
  const buat = useBuatCvDariProfil({
    klien,
    sub: idPenggunaSaatIni(),
    judulBawaan: t("resume.daftar.judulBawaan"),
    onBerhasil: (r) => {
      void navigate(`/cv/${r.id}/edit`);
    },
  });
  return (
    <div className="page-frame page-panel flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("resume.daftar.buat")}</h1>
      <p className="text-base">{t("resume.daftar.deskripsi")}</p>
      <Tombol disabled={buat.isPending} onClick={() => buat.mutate()}>
        {t(buat.isPending ? "resume.daftar.membuat" : "resume.daftar.buat")}
      </Tombol>
      {buat.isError && <p role="alert">{pesanGalatResume(buat.error, t)}</p>}
    </div>
  );
}
