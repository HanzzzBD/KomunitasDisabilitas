import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import {
  communityAdminKeys,
  getCommunityQueueReport,
  getCommunityContentAdmin,
  moderateCommunityContentAdmin,
  rejectCommunityReportAdmin,
} from "@nawasena/api-client";
import { communityIdParamsSchema } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useStatusJaringan } from "../shared/status-jaringan.js";
import { KeputusanCommunity } from "../features/admin/community-keputusan.js";
import {
  GalatAdminCommunity,
  tanggalCommunity,
  useIdentitasAdmin,
  useRefreshCommunity,
} from "../features/admin/community-shared.js";
export function AdminCommunityLaporan() {
  const klien = useKlienApi();
  const userId = useIdentitasAdmin(klien);
  const { id = "" } = useParams();
  return userId ? <IsiLaporan key={`${userId}:${id}`} id={id} userId={userId} /> : null;
}
function IsiLaporan({ id, userId }: { id: string; userId: string }) {
  const t = useTeks();
  const klien = useKlienApi();
  const { daring } = useStatusJaringan();
  const refresh = useRefreshCommunity();
  const [notice, setNotice] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.community.detail") }));
  const valid = communityIdParamsSchema.safeParse({ id }).success;
  const report = useQuery({
    queryKey: communityAdminKeys.report(userId, id),
    queryFn: ({ signal }) => getCommunityQueueReport(klien, id, signal),
    enabled: valid,
    retry: false,
  });
  const row = report.data;
  const target = useQuery({
    queryKey: communityAdminKeys.content(userId, row?.targetType ?? "post", row?.targetId ?? ""),
    queryFn: ({ signal }) =>
      getCommunityContentAdmin(klien, row!.targetType, row!.targetId, signal),
    enabled: !!row,
    retry: false,
  });
  const postId = target.data?.targetType === "comment" ? target.data.content.postId : undefined;
  const parent = useQuery({
    queryKey: communityAdminKeys.content(userId, "post", postId ?? ""),
    queryFn: ({ signal }) => getCommunityContentAdmin(klien, "post", postId!, signal),
    enabled: !!postId,
    retry: false,
  });
  const content = target.data?.content;
  function finished() {
    setNotice(t("admin.community.aksiBerhasil"));
    // Refresh the authoritative status/report set; never optimistic moderation.
    void refresh();
  }
  return (
    <div className="flex flex-col gap-5">
      <Link
        className="self-start min-h-sentuh inline-flex items-center underline"
        to="/admin/community/laporan"
      >
        {t("admin.community.kembali")}
      </Link>
      <h2 ref={title} tabIndex={-1} className="text-2xl font-semibold">
        {t("admin.community.detail")}
      </h2>
      <p>{t("admin.community.privacy")}</p>
      <p role="status">{notice}</p>
      <Tombol className="self-start" varian="sekunder" onClick={() => void refresh()}>
        {t("admin.community.coba")}
      </Tombol>
      {!valid ? (
        <p role="alert">{t("admin.community.galat")}</p>
      ) : report.isPending ? (
        <p role="status">{t("admin.community.memuat")}</p>
      ) : report.isError ? (
        <GalatAdminCommunity error={report.error} onCoba={() => void report.refetch()} />
      ) : row ? (
        <>
          <section
            className="page-panel flex flex-col gap-3"
            aria-label={t("admin.community.alasanLaporan")}
          >
            <p className="font-semibold">
              {t(`admin.community.${row.targetType}`)} · {t(`admin.community.${row.status}`)}
            </p>
            <p>
              {t("admin.community.dilaporkan")}:{" "}
              <time dateTime={row.createdAt}>{tanggalCommunity(row.createdAt)}</time>
            </p>
            {row.resolvedAt ? (
              <p>
                {t("admin.community.ditutup")}:{" "}
                <time dateTime={row.resolvedAt}>{tanggalCommunity(row.resolvedAt)}</time>
              </p>
            ) : null}
            <h3 className="text-lg font-semibold">{t("admin.community.alasanLaporan")}</h3>
            <p className="break-words whitespace-pre-wrap">{row.reason}</p>
          </section>
          {target.isPending ? (
            <p role="status">{t("admin.community.memuat")}</p>
          ) : target.isError ? (
            <GalatAdminCommunity error={target.error} onCoba={() => void target.refetch()} />
          ) : content ? (
            <article
              className="page-panel flex flex-col gap-3"
              aria-label={t("admin.community.target")}
            >
              <h3 className="text-xl font-semibold">{t("admin.community.target")}</h3>
              <p className="font-semibold">{t(`admin.community.${content.status}`)}</p>
              {content.status === "removed" && content.body ? (
                <p>{t("admin.community.retained")}</p>
              ) : null}
              <p className="break-words whitespace-pre-wrap">
                {content.body || t("admin.community.bodyKosong")}
              </p>
              {content.moderation ? (
                <div className="border-t border-gray-300 pt-3">
                  <p className="font-semibold">{t("admin.community.alasan")}</p>
                  <p className="break-words whitespace-pre-wrap">{content.moderation.reason}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {[
                  ...(content.status === "published" ||
                  (content.status === "hidden" && row.status === "open")
                    ? ["hide" as const]
                    : []),
                  ...(content.status === "hidden" ? ["restore" as const] : []),
                  ...(content.status !== "removed" || row.status === "open"
                    ? ["remove" as const]
                    : []),
                ].map((aksi) => (
                  <KeputusanCommunity
                    key={aksi}
                    aksi={aksi}
                    pemicu={
                      <Tombol
                        varian={aksi === "remove" ? "bahaya" : "sekunder"}
                        aria-disabled={!daring}
                      >
                        {t(`admin.community.${aksi}`)}
                      </Tombol>
                    }
                    onKirim={(reason) =>
                      moderateCommunityContentAdmin(
                        klien,
                        row.targetType,
                        row.targetId,
                        aksi,
                        reason,
                      )
                    }
                    onSelesai={finished}
                    fokusSelesai={() => {
                      title.current?.focus();
                      return !!title.current;
                    }}
                  />
                ))}
              </div>
            </article>
          ) : null}
          {postId ? (
            <section
              className="page-panel flex flex-col gap-3"
              aria-label={t("admin.community.induk")}
            >
              <h3 className="text-xl font-semibold">{t("admin.community.induk")}</h3>
              {parent.isPending ? (
                <p role="status">{t("admin.community.memuat")}</p>
              ) : parent.isError ? (
                <GalatAdminCommunity error={parent.error} onCoba={() => void parent.refetch()} />
              ) : parent.data ? (
                <>
                  <p>{t(`admin.community.${parent.data.content.status}`)}</p>
                  <p className="break-words whitespace-pre-wrap">
                    {parent.data.content.body || t("admin.community.bodyKosong")}
                  </p>
                </>
              ) : null}
            </section>
          ) : null}
          {row.status === "open" ? (
            <KeputusanCommunity
              aksi="reject"
              pemicu={
                <Tombol varian="sekunder" aria-disabled={!daring}>
                  {t("admin.community.reject")}
                </Tombol>
              }
              onKirim={(reason) => rejectCommunityReportAdmin(klien, row.id, reason)}
              onSelesai={finished}
              fokusSelesai={() => {
                title.current?.focus();
                return !!title.current;
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
