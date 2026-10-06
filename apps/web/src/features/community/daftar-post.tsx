import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  listCommunityPosts,
  createCommunityPost,
  communityContentKeys,
  type ApiClient,
} from "@nawasena/api-client";
import type { Community, CommunityFeedResponse } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { AksesDiskusi, useIzinTulis } from "./akses-diskusi.js";
import { FormTeks } from "./form-teks.js";
import { KartuTulisan } from "./kartu-tulisan.js";
import { GalatCommunity } from "./pesan-galat.js";
import { kunciDrafCommunity } from "./draf.js";

export function DaftarPost({ klien, room }: { klien: ApiClient; room: Community }) {
  const t = useTeks();
  return (
    <section className="min-w-0 flex flex-col gap-5" aria-labelledby="community-diskusi">
      <div>
        <h2 id="community-diskusi" className="text-2xl font-semibold">
          {t("community.diskusi.judul")}
        </h2>
        <p className="mt-2 text-gray-700">{t("community.diskusi.urutan")}</p>
      </div>
      <AksesDiskusi klien={klien} tujuan={`/community/${room.slug}`}>
        {(userId) => (
          <Feed key={`${room.id}:${userId}`} klien={klien} room={room} userId={userId} />
        )}
      </AksesDiskusi>
    </section>
  );
}
function Feed({ klien, room, userId }: { klien: ApiClient; room: Community; userId: string }) {
  const t = useTeks();
  const cache = useQueryClient();
  const { daring } = useStatusJaringan();
  const { boleh, member } = useIzinTulis(klien, userId, room);
  const key = communityContentKeys.feed(userId, room.id);
  const feed = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listCommunityPosts(klien, room.id, { cursor: pageParam }, signal),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    retry: false,
  });
  const posts = [
    ...new Map(feed.data?.pages.flatMap((p) => p.data).map((p) => [p.id, p]) ?? []).values(),
  ];
  async function kirim(body: string) {
    const sesi = useStoreSesi.getState();
    const result = await createCommunityPost(klien, room.id, { body });
    await cache.cancelQueries({ queryKey: key });
    if (useStoreSesi.getState() !== sesi) return;
    cache.setQueryData<InfiniteData<CommunityFeedResponse>>(key, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p, i) => ({
              ...p,
              data:
                i === 0
                  ? [result, ...p.data.filter((v) => v.id !== result.id)]
                  : p.data.filter((v) => v.id !== result.id),
            })),
          }
        : { pages: [{ data: [result], meta: { nextCursor: null } }], pageParams: [undefined] },
    );
    cache.setQueryData(communityContentKeys.post(userId, result.id), result);
  }
  return (
    <>
      {boleh ? (
        <div className="page-panel">
          <FormTeks
            jenis="post"
            drafKey={kunciDrafCommunity(userId, "post", room.id)}
            onKirim={kirim}
          />
        </div>
      ) : (
        <p className="page-panel">
          {t(
            room.status === "archived"
              ? "community.arsip.penjelasan"
              : member.data?.status === "blocked"
                ? "community.member.blockedPenjelasan"
                : "community.diskusi.gabung",
          )}
        </p>
      )}
      {!daring && <p role="status">{t("community.diskusi.luring")}</p>}
      {feed.isError && <GalatCommunity error={feed.error} onCoba={() => void feed.refetch()} />}
      {feed.isPending && daring && <p role="status">{t("community.diskusi.memuat")}</p>}
      {feed.isSuccess && posts.length === 0 && (
        <p className="page-panel">{t("community.diskusi.kosong")}</p>
      )}
      {posts.length > 0 && (
        <ol className="flex flex-col gap-4" aria-label={t("community.diskusi.judul")}>
          {posts.map((post) => (
            <li key={post.id}>
              <KartuTulisan
                klien={klien}
                content={post}
                userId={userId}
                bolehEdit={boleh}
                ringkas
                onUbah={async () => {}}
              />
            </li>
          ))}
        </ol>
      )}
      {posts.length > 0 && (
        <Tombol
          varian="sekunder"
          className="self-start"
          aria-disabled={!daring || !feed.hasNextPage || feed.isFetching}
          onClick={() => {
            if (daring && navigator.onLine && feed.hasNextPage && !feed.isFetching)
              void feed.fetchNextPage();
          }}
        >
          {t(feed.hasNextPage ? "community.diskusi.muatLagi" : "community.diskusi.selesai")}
        </Tombol>
      )}
      <p role="status">{feed.isFetchingNextPage ? t("community.diskusi.memuat") : ""}</p>
    </>
  );
}
