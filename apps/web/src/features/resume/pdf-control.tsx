import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getResumePdfStatus,
  requestResumePdf,
  resumesKeys,
  type ApiClient,
} from "@nawasena/api-client";
import type { ResumePdfStatus } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";

const INTERVAL_STATUS_MS = 1_500;

function mulaiUnduh(url: string): void {
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.rel = "noopener";
  document.body.append(tautan);
  tautan.click();
  tautan.remove();
}

export interface KontrolPdfProps {
  klien: ApiClient;
  resumeId: string;
  sub: string | null;
  onDownload?: (url: string) => void;
}

/** Kontrol yang sama dipakai daftar dan editor agar state PDF tidak menyimpang. */
export function KontrolPdf({ klien, resumeId, sub, onDownload = mulaiUnduh }: KontrolPdfProps) {
  const t = useTeks();
  const queryClient = useQueryClient();
  const key = resumesKeys.pdf(sub, resumeId);

  const status = useQuery({
    queryKey: key,
    queryFn: () => getResumePdfStatus(klien, resumeId),
    refetchInterval: (query) => {
      const current = query.state.data;
      return current?.status === "queued" || current?.status === "processing"
        ? INTERVAL_STATUS_MS
        : false;
    },
  });

  const minta = useMutation({
    mutationFn: () => requestResumePdf(klien, resumeId),
    onSuccess: (hasil) => {
      queryClient.setQueryData(key, hasil);
    },
  });

  // URL diambil ULANG saat tombol ditekan. Dengan begitu URL yang sempat
  // kedaluwarsa selama pengguna menyunting CV tidak pernah dipakai kembali.
  const unduh = useMutation({
    mutationFn: () => getResumePdfStatus(klien, resumeId),
    onSuccess: (hasil) => {
      queryClient.setQueryData(key, hasil);
      if (hasil.status === "ready") onDownload(hasil.downloadUrl);
    },
  });

  // Hasil mutation langsung ditanam ke cache query. Query harus tetap menjadi
  // sumber tunggal agar hasil polling `ready` tidak tertutup oleh respons POST
  // lama yang masih berstatus `queued`.
  const current: ResumePdfStatus | undefined = status.data;
  const gagalJaringan = status.isError || minta.isError || unduh.isError;
  const menunggu = current?.status === "queued" || current?.status === "processing";

  const ulangJaringan = () => {
    if (minta.isError) {
      minta.reset();
      minta.mutate();
      return;
    }
    if (unduh.isError) {
      unduh.reset();
      unduh.mutate();
      return;
    }
    void status.refetch();
  };

  let pesan = t("resume.pdf.status.memeriksa");
  if (gagalJaringan) pesan = t("resume.pdf.status.gagalJaringan");
  else if (current?.status === "idle") pesan = t("resume.pdf.status.idle");
  else if (current?.status === "queued") pesan = t("resume.pdf.status.queued");
  else if (current?.status === "processing") pesan = t("resume.pdf.status.processing");
  else if (current?.status === "ready") pesan = t("resume.pdf.status.ready");
  else if (current?.status === "failed") pesan = t("resume.pdf.status.failed");

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <p aria-live="polite" aria-atomic="true" className="text-sm text-gray-700">
        {pesan}
      </p>

      {gagalJaringan ? (
        <Tombol
          varian="sekunder"
          onClick={ulangJaringan}
        >
          {t("resume.aksi.cobaLagi")}
        </Tombol>
      ) : current?.status === "ready" ? (
        <Tombol
          varian="utama"
          disabled={unduh.isPending}
          aria-busy={unduh.isPending}
          onClick={() => {
            unduh.mutate();
          }}
        >
          {unduh.isPending ? t("resume.pdf.aksi.menyiapkanUnduh") : t("resume.pdf.aksi.unduh")}
        </Tombol>
      ) : current?.status === "idle" || current?.status === "failed" ? (
        <Tombol
          varian="sekunder"
          disabled={minta.isPending}
          aria-busy={minta.isPending}
          onClick={() => {
            minta.mutate();
          }}
        >
          {minta.isPending
            ? t("resume.pdf.aksi.meminta")
            : current.status === "failed"
              ? t("resume.pdf.aksi.cobaRenderLagi")
              : t("resume.pdf.aksi.siapkan")}
        </Tombol>
      ) : (
        <Tombol varian="sekunder" disabled aria-busy={menunggu}>
          {t("resume.pdf.aksi.menunggu")}
        </Tombol>
      )}
    </div>
  );
}
