import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiError, communityKeys, getCommunity, type ApiClient } from "@nawasena/api-client";
import { communitySlugParamsSchema } from "@nawasena/schemas";
import { useTeks } from "../../shared/i18n/index.js";
import { useJudulHalaman } from "../../shared/judul-halaman.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { GalatCommunity } from "./pesan-galat.js";
import { Keanggotaan } from "./keanggotaan.js";

export function DetailRuang({
  klien,
  slug,
  asal,
}: {
  klien: ApiClient;
  slug: string;
  asal: string;
}) {
  const t = useTeks();
  const { daring } = useStatusJaringan();
  const valid = communitySlugParamsSchema.safeParse({ slug }).success;
  const query = useQuery({
    queryKey: communityKeys.detail(slug),
    queryFn: ({ signal }) => getCommunity(klien, slug, signal),
    enabled: valid,
    retry: false,
  });
  const missing =
    !valid || (query.error instanceof ApiError && query.error.code === "KOMUNITAS_TIDAK_DITEMUKAN");
  const room = query.data;
  useJudulHalaman(
    t("shell.judulDokumen", {
      halaman: missing ? t("community.detail.tidakAda") : (room?.name ?? t("community.judul")),
    }),
  );

  return (
    <div className="page-frame page-frame-wide flex flex-col gap-6">
      <Link to={`/community${asal}`} className="self-start text-base underline">
        {t("community.detail.kembali")}
      </Link>
      {missing ? (
        <div className="page-panel flex flex-col gap-3" role="alert">
          <h1 className="text-3xl font-bold">{t("community.detail.tidakAda")}</h1>
          <p className="text-base">{t("community.detail.tidakAdaPenjelasan")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold">{room?.name ?? t("community.judul")}</h1>
            {room && (
              <p className="text-base">
                {t(`community.jenis.${room.type}`)}
                {room.city ? ` · ${room.city}` : ""} ·{" "}
                {t("community.anggota.jumlah", { jumlah: room.memberCount })}
              </p>
            )}
          </div>
          {!daring && (
            <p role="status" className="text-base">
              {t(room ? "community.cacheLuring" : "community.luring")}
            </p>
          )}
          {query.isError && (
            <GalatCommunity error={query.error} onCoba={() => void query.refetch()} />
          )}
          {!room && query.isPending && daring && (
            <p role="status" className="page-panel text-base">
              {t("community.memuat")}
            </p>
          )}
          {room && (
            <>
              {room.status === "archived" && (
                <div className="page-panel flex flex-col gap-2">
                  <h2 className="text-xl font-semibold">{t("community.arsip.judul")}</h2>
                  <p className="text-base">{t("community.arsip.penjelasan")}</p>
                </div>
              )}
              <div className="community-detail-layout">
                <section
                  className="page-panel flex flex-col gap-4"
                  aria-labelledby="community-tentang"
                >
                  <h2 id="community-tentang" className="text-xl font-semibold">
                    {t("community.detail.tentang")}
                  </h2>
                  <p className="whitespace-pre-wrap text-base">{room.description}</p>
                </section>
                <Keanggotaan klien={klien} room={room} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
