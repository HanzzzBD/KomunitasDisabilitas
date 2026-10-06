import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  communityAdminKeys,
  listCommunitiesAdmin,
  listCommunityQueue,
  type ApiClient,
} from "@nawasena/api-client";
import { communityStatusSchema, communityReportStatusSchema } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { GalatAdminCommunity, tanggalCommunity } from "./community-shared.js";

export function DaftarCommunityAdmin({
  klien,
  userId,
  laporan = false,
}: {
  klien: ApiClient;
  userId: string;
  laporan?: boolean;
}) {
  const t = useTeks();
  const { daring } = useStatusJaringan();
  const [params, setParams] = useSearchParams();
  const raw = params.get("status") ?? (laporan ? "open" : "all");
  const roomStatus = communityStatusSchema.safeParse(raw);
  const reportStatus = communityReportStatusSchema.safeParse(raw);
  const selected =
    raw === "all"
      ? "all"
      : laporan
        ? reportStatus.success
          ? reportStatus.data
          : "open"
        : roomStatus.success
          ? roomStatus.data
          : "all";
  const rooms = useInfiniteQuery({
    queryKey: communityAdminKeys.rooms(userId, {
      status: roomStatus.success ? roomStatus.data : undefined,
    }),
    queryFn: ({ signal, pageParam }) =>
      listCommunitiesAdmin(
        klien,
        { limit: 20, status: roomStatus.success ? roomStatus.data : undefined, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !laporan,
    retry: false,
  });
  const reports = useInfiniteQuery({
    queryKey: communityAdminKeys.queue(userId, {
      status: selected === "all" ? undefined : reportStatus.success ? reportStatus.data : "open",
    }),
    queryFn: ({ signal, pageParam }) =>
      listCommunityQueue(
        klien,
        {
          limit: 20,
          status:
            selected === "all" ? undefined : reportStatus.success ? reportStatus.data : "open",
          cursor: pageParam,
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: laporan,
    retry: false,
  });
  const query = laporan ? reports : rooms;
  const roomRows = rooms.data?.pages.flatMap((p) => p.data) ?? [];
  const reportRows = reports.data?.pages.flatMap((p) => p.data) ?? [];
  const count = laporan ? reportRows.length : roomRows.length;
  return (
    <section
      className="flex flex-col gap-4"
      aria-label={t(laporan ? "admin.community.queue" : "admin.community.judul")}
    >
      <label className="flex flex-col items-start gap-2 font-semibold">
        {t("admin.community.status")}
        <select
          className="min-h-sentuh max-w-full rounded-md border border-gray-500 bg-white p-2 text-base"
          value={selected}
          onChange={(e) =>
            setParams({ status: e.target.value }, { replace: true, preventScrollReset: true })
          }
        >
          <option value="all">{t("admin.community.semua")}</option>
          {(laporan ? communityReportStatusSchema.options : communityStatusSchema.options).map(
            (s) => (
              <option key={s} value={s}>
                {t(`admin.community.${s}`)}
              </option>
            ),
          )}
        </select>
      </label>
      {laporan ? <p>{t("admin.community.urutan")}</p> : null}
      {query.isPending ? <p role="status">{t("admin.community.memuat")}</p> : null}
      {query.isError ? (
        <GalatAdminCommunity error={query.error} onCoba={() => void query.refetch()} />
      ) : null}
      {!query.isPending && !query.isError && count === 0 ? (
        <p role="status">{t("admin.community.kosong")}</p>
      ) : null}
      <ul
        className="flex flex-col gap-3"
        aria-label={t(laporan ? "admin.community.queue" : "admin.community.judul")}
      >
        {laporan
          ? reportRows.map((row) => (
              <li key={row.id} className="page-panel flex flex-col gap-2 break-words">
                <p className="font-semibold">
                  {t(`admin.community.${row.targetType}`)} · {t(`admin.community.${row.status}`)}
                </p>
                <p>
                  {t("admin.community.dilaporkan")}:{" "}
                  <time dateTime={row.createdAt}>{tanggalCommunity(row.createdAt)}</time>
                </p>
                <p className="whitespace-pre-wrap break-words">{row.reason}</p>
                <Link
                  className="self-start min-h-sentuh inline-flex items-center underline"
                  to={`/admin/community/laporan/${row.id}`}
                >
                  {t("admin.community.buka")}
                </Link>
              </li>
            ))
          : roomRows.map((row) => (
              <li key={row.id} className="page-panel flex flex-col gap-2 break-words">
                <h3 className="text-xl font-semibold">{row.name}</h3>
                <p>
                  {t(`admin.community.${row.type}`)}
                  {row.city ? ` · ${row.city}` : ""} · {t(`admin.community.${row.status}`)}
                </p>
                <p>{t("admin.community.anggota", { jumlah: String(row.memberCount) })}</p>
                <Link
                  className="self-start min-h-sentuh inline-flex items-center underline"
                  to={`/admin/community/ruang/${row.id}`}
                >
                  {t("admin.community.edit")}
                </Link>
              </li>
            ))}
      </ul>
      {count > 0 ? (
        <Tombol
          className="self-start"
          varian="sekunder"
          aria-disabled={!daring || !query.hasNextPage || query.isFetching}
          aria-busy={query.isFetching}
          onClick={() => {
            if (daring && navigator.onLine && query.hasNextPage && !query.isFetching)
              void query.fetchNextPage();
          }}
        >
          {t(query.isFetching ? "admin.community.memuat" : "admin.community.lagi")}
        </Tombol>
      ) : null}
    </section>
  );
}
