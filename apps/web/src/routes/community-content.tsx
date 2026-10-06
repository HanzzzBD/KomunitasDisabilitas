import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation, useSearchParams } from "react-router";
import {
  ApiError,
  communityContentKeys,
  communityKeys,
  getCommunityById,
  getCommunityPost,
  getCommunityComment,
} from "@nawasena/api-client";
import {
  communityTargetParamsSchema,
  communityIdParamsSchema,
  type CommunityPost,
  type CommunityComment,
} from "@nawasena/schemas";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { AksesDiskusi, useIzinTulis } from "../features/community/akses-diskusi.js";
import { KartuTulisan } from "../features/community/kartu-tulisan.js";
import { DaftarKomentar } from "../features/community/daftar-komentar.js";
import { GalatCommunity } from "../features/community/pesan-galat.js";
import { useStatusJaringan } from "../shared/status-jaringan.js";
import { useStoreSesi } from "../shared/sesi/store.js";

export function CommunityContent() {
  const t = useTeks();
  const klien = useKlienApi();
  const { pathname, search } = useLocation();
  const { targetType, id } = useParams();
  const parsed = communityTargetParamsSchema.safeParse({ targetType, targetId: id });
  useJudulHalaman(t("shell.judulDokumen", { halaman: t("community.diskusi.detail") }));
  return (
    <div className="page-frame flex flex-col gap-6">
      <Link className="self-start underline" to="/community">
        {t("community.detail.kembali")}
      </Link>
      <h1 className="text-3xl font-bold">{t("community.diskusi.detail")}</h1>
      {!parsed.success ? (
        <p role="alert">{t("community.diskusi.tidakAda")}</p>
      ) : (
        <AksesDiskusi klien={klien} tujuan={`${pathname}${search}`}>
          {(userId) => (
            <IsiDetail
              key={`${userId}:${targetType}:${id}`}
              userId={userId}
              jenis={parsed.data.targetType}
              id={parsed.data.targetId}
            />
          )}
        </AksesDiskusi>
      )}
    </div>
  );
}
function IsiDetail({
  userId,
  jenis,
  id,
}: {
  userId: string;
  jenis: "post" | "comment";
  id: string;
}) {
  const t = useTeks();
  const klien = useKlienApi();
  const cache = useQueryClient();
  const { daring } = useStatusJaringan();
  const key =
    jenis === "post"
      ? communityContentKeys.post(userId, id)
      : communityContentKeys.comment(userId, id);
  const target = useQuery<CommunityPost | CommunityComment>({
    queryKey: key,
    queryFn: async ({ signal }) =>
      jenis === "post"
        ? getCommunityPost(klien, id, signal)
        : getCommunityComment(klien, id, signal),
    retry: false,
  });
  const comment = jenis === "comment" ? (target.data as CommunityComment | undefined) : undefined;
  const postId = jenis === "post" ? id : comment?.postId;
  const parent = useQuery({
    queryKey: communityContentKeys.post(userId, postId ?? ""),
    queryFn: ({ signal }) => getCommunityPost(klien, postId!, signal),
    enabled: jenis === "comment" && !!postId,
    retry: false,
  });
  const post = jenis === "post" ? (target.data as CommunityPost | undefined) : parent.data;
  const [params] = useSearchParams();
  const roomHint = communityIdParamsSchema.safeParse({ id: params.get("room") });
  const communityId = post?.communityId ?? (roomHint.success ? roomHint.data.id : undefined);
  const room = useQuery({
    queryKey: communityKeys.byId(communityId ?? ""),
    queryFn: ({ signal }) => getCommunityById(klien, communityId!, signal),
    enabled: !!communityId,
    retry: false,
  });
  const { boleh } = useIzinTulis(klien, userId, room.data);
  async function ubah(content: CommunityPost | CommunityComment) {
    const sesi = useStoreSesi.getState();
    if (sesi.status !== "masuk") return;
    await cache.cancelQueries({ queryKey: key });
    if (useStoreSesi.getState() !== sesi) return;
    cache.setQueryData(key, content);
    if (communityId)
      void cache.invalidateQueries({ queryKey: communityContentKeys.feed(userId, communityId) });
  }
  const parentMissing =
    parent.error instanceof ApiError && parent.error.code === "KONTEN_KOMUNITAS_TIDAK_DITEMUKAN";
  return (
    <>
      {room.data && (
        <Link className="self-start underline" to={`/community/${room.data.slug}`}>
          {t("community.diskusi.kembali", { nama: room.data.name })}
        </Link>
      )}
      {!daring && <p role="status">{t("community.diskusi.luring")}</p>}
      {target.isPending && daring && <p role="status">{t("community.diskusi.memuat")}</p>}
      {target.isError && (
        <GalatCommunity error={target.error} onCoba={() => void target.refetch()} />
      )}
      {room.isError && <GalatCommunity error={room.error} onCoba={() => void room.refetch()} />}
      {parent.isError &&
        (parentMissing ? (
          <p>{t("community.diskusi.parentTidakAda")}</p>
        ) : (
          <GalatCommunity error={parent.error} onCoba={() => void parent.refetch()} />
        ))}
      {target.data && (
        <KartuTulisan
          klien={klien}
          content={target.data}
          tingkatJudul={2}
          userId={userId}
          bolehEdit={boleh}
          bolehLapor={jenis === "post" || parent.data?.status === "published"}
          onUbah={ubah}
        />
      )}
      {jenis === "comment" && post && (
        <Link className="self-start underline" to={`/community/content/post/${post.id}`}>
          {t("community.diskusi.baca", {
            nama: post.author?.fullName ?? t("community.diskusi.anonim"),
          })}
        </Link>
      )}
      {jenis === "post" && post?.status === "published" && (
        <DaftarKomentar
          klien={klien}
          post={post}
          userId={userId}
          boleh={boleh}
          roomClosed={room.data?.status === "archived"}
        />
      )}
    </>
  );
}
