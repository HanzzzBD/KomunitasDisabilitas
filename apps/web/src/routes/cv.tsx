import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { deleteResume, listResumes, resumesKeys } from "@nawasena/api-client";
import { KeadaanKosong, Kartu, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { KontrolPdf, pesanGalatResume, useBuatCvDariProfil } from "../features/resume/index.js";
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

  const buat = useBuatCvDariProfil({
    klien,
    sub,
    judulBawaan: t("resume.daftar.judulBawaan"),
    onBerhasil: (resume) => {
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
    <div className="page-frame page-frame-wide page-panel flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-bold break-words text-gray-900">
            {t("resume.daftar.judul")}
          </h1>
          <p className="max-w-2xl text-base text-gray-700">{t("resume.daftar.deskripsi")}</p>
        </div>
        {/* Dua pintu SETARA (keputusan owner 2026-09-28): tidak ada yang
            disembunyikan di balik yang lain, dan formulir tetap satu klik. */}
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Link
            to="/cv/chat"
            className="inline-flex min-h-sentuh items-center justify-center rounded bg-gray-900 px-4 text-base font-semibold text-white"
          >
            {t("resume.daftar.buatChat")}
          </Link>
          <Tombol
            varian="sekunder"
            disabled={buat.isPending}
            aria-busy={buat.isPending}
            onClick={() => {
              buat.mutate();
            }}
          >
            {buat.isPending ? t("resume.daftar.membuat") : t("resume.daftar.buat")}
          </Tombol>
        </div>
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
