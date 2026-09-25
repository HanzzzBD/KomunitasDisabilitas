import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { getResume, resumesKeys } from "@nawasena/api-client";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { EditorResume, pesanGalatResume } from "../features/resume/index.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";

export function CvEditor() {
  return (
    <Terlindungi>
      <IsiCvEditor />
    </Terlindungi>
  );
}

function IsiCvEditor() {
  const t = useTeks();
  const klien = useKlienApi();
  const queryClient = useQueryClient();
  const sub = idPenggunaSaatIni();
  const id = useParams().id ?? "";
  useJudulHalaman(t("resume.editor.judul"));

  const resume = useQuery({
    queryKey: resumesKeys.detail(sub, id),
    queryFn: () => getResume(klien, id),
    enabled: id !== "",
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4">
      <Link
        to="/cv"
        className="inline-flex min-h-sentuh items-center self-start rounded text-base font-semibold text-gray-900 underline"
      >
        {t("resume.editor.kembali")}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold break-words text-gray-900">{t("resume.editor.judul")}</h1>
        <p className="text-base text-gray-700">{t("resume.editor.deskripsi")}</p>
      </div>

      <WilayahMemuat memuat={resume.isPending} label={t("resume.editor.memuat")}>
        {resume.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-base font-medium text-red-700">
              {pesanGalatResume(resume.error, t)}
            </p>
            <Tombol
              varian="sekunder"
              onClick={() => {
                void resume.refetch();
              }}
            >
              {t("resume.aksi.cobaLagi")}
            </Tombol>
          </div>
        ) : null}
        {resume.data !== undefined ? (
          <div className="flex flex-col gap-5">
            <EditorResume
              resume={resume.data}
              klien={klien}
              onDiperbarui={(hasil) => {
                queryClient.setQueryData(resumesKeys.detail(sub, id), hasil);
                void queryClient.invalidateQueries({ queryKey: resumesKeys.list(sub) });
              }}
            />
          </div>
        ) : null}
      </WilayahMemuat>
    </div>
  );
}
