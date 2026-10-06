import { useQuery } from "@tanstack/react-query";
import { communityAdminKeys, getCommunityMetrics, type ApiClient } from "@nawasena/api-client";
import { useTeks } from "../../shared/i18n/index.js";
import { GalatAdminCommunity } from "./community-shared.js";
export function MetrikCommunity({ klien, userId }: { klien: ApiClient; userId: string }) {
  const t = useTeks();
  const query = useQuery({
    queryKey: communityAdminKeys.metrics(userId),
    queryFn: ({ signal }) => getCommunityMetrics(klien, signal),
    retry: false,
  });
  const data = query.data;
  return (
    <section aria-labelledby="community-metrik" className="page-panel flex flex-col gap-3">
      <h3 id="community-metrik" className="text-xl font-semibold">
        {t("admin.community.metrik")}
      </h3>
      {query.isPending ? (
        <p role="status">{t("admin.community.memuat")}</p>
      ) : query.isError ? (
        <GalatAdminCommunity error={query.error} onCoba={() => void query.refetch()} />
      ) : data ? (
        <>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["admin.community.newMembers", String(data.newMemberships)],
                ["admin.community.posts", String(data.posts)],
                ["admin.community.openReports", String(data.openReports)],
                [
                  "admin.community.resolution",
                  data.averageResolutionSeconds === null
                    ? t("admin.community.noResolution")
                    : t("admin.community.jam", {
                        jumlah: (data.averageResolutionSeconds / 3600).toLocaleString("id-ID", {
                          maximumFractionDigits: 2,
                        }),
                      }),
                ],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt className="text-base">{t(key)}</dt>
                <dd className="mt-1 text-xl font-semibold break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">{t("admin.community.metrikHelp")}</p>
        </>
      ) : null}
    </section>
  );
}
