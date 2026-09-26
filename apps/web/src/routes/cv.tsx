import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  createResume,
  deleteResume,
  educationsApi,
  experiencesApi,
  getMe,
  getProfile,
  listResumes,
  profilesKeys,
  resumesKeys,
  skillsApi,
  usersKeys,
} from "@nawasena/api-client";
import { KeadaanKosong, Kartu, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { buatPrefillResume, KontrolPdf, pesanGalatResume } from "../features/resume/index.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";

export function DaftarCv() {
  return (
    <Terlindungi>
      <IsiDaftarCv />
    </Terlindungi>
  );
}

function IsiDaftarCv() {
  const t = useTeks();
  const klien = useKlienApi();
  const sub = idPenggunaSaatIni();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useJudulHalaman(t("resume.daftar.judul"));

  const daftar = useQuery({
    queryKey: resumesKeys.list(sub),
    queryFn: () => listResumes(klien),
  });

  const buat = useMutation({
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
        title: t("resume.daftar.judulBawaan"),
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
      void navigate(`/cv/${resume.id}`);
    },
  });

  const hapus = useMutation({
    mutationFn: (id: string) => deleteResume(klien, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: resumesKeys.list(sub) });
    },
  });

  const galat = buat.error ?? hapus.error ?? daftar.error;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-bold break-words text-gray-900">
            {t("resume.daftar.judul")}
          </h1>
          <p className="max-w-2xl text-base text-gray-700">{t("resume.daftar.deskripsi")}</p>
        </div>
        <Tombol
          className="shrink-0"
          disabled={buat.isPending}
          aria-busy={buat.isPending}
          onClick={() => {
            buat.mutate();
          }}
        >
          {buat.isPending ? t("resume.daftar.membuat") : t("resume.daftar.buat")}
        </Tombol>
      </div>

      {galat !== null ? (
        <p role="alert" className="text-base font-medium text-red-700">
          {pesanGalatResume(galat, t)}
        </p>
      ) : null}

      <WilayahMemuat memuat={daftar.isPending} label={t("resume.daftar.memuat")}>
        {daftar.isError ? (
          <Tombol
            varian="sekunder"
            onClick={() => {
              void daftar.refetch();
            }}
          >
            {t("resume.aksi.cobaLagi")}
          </Tombol>
        ) : null}

        {daftar.data?.length === 0 ? (
          <KeadaanKosong judul={t("resume.daftar.kosongJudul")} tingkatJudul={2}>
            <p>{t("resume.daftar.kosongDeskripsi")}</p>
          </KeadaanKosong>
        ) : null}

        {daftar.data !== undefined && daftar.data.length > 0 ? (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
            {daftar.data.map((resume) => (
              <li key={resume.id}>
                <Kartu
                  judul={resume.title}
                  tingkatJudul={2}
                  aksi={
                    <>
                      <Link
                        to={`/cv/${resume.id}`}
                        className="inline-flex min-h-sentuh items-center rounded border border-gray-900 px-4 text-base font-semibold text-gray-900"
                      >
                        {t("resume.daftar.ubah")}
                      </Link>
                      <Tombol
                        varian="hening"
                        disabled={hapus.isPending}
                        aria-label={t("resume.daftar.hapusLabel", { judul: resume.title })}
                        onClick={() => {
                          hapus.mutate(resume.id);
                        }}
                      >
                        {t("resume.aksi.hapus")}
                      </Tombol>
                    </>
                  }
                >
                  <p className="text-sm text-gray-700">
                    {t("resume.daftar.diperbarui", {
                      tanggal: new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
                        new Date(resume.updatedAt),
                      ),
                    })}
                  </p>
                  <KontrolPdf klien={klien} resumeId={resume.id} sub={sub} />
                </Kartu>
              </li>
            ))}
          </ul>
        ) : null}
      </WilayahMemuat>
    </div>
  );
}
