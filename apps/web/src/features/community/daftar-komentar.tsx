import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  communityContentKeys,
  listCommunityComments,
  createCommunityComment,
  type ApiClient,
} from "@nawasena/api-client";
import type {
  CommunityCommentListResponse,
  CommunityComment,
  CommunityPost,
} from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { FormTeks } from "./form-teks.js";
import { KartuTulisan } from "./kartu-tulisan.js";
import { GalatCommunity } from "./pesan-galat.js";
import { kunciDrafCommunity } from "./draf.js";

export function DaftarKomentar({
  klien,
  post,
  userId,
  boleh,
  roomClosed,
}: {
  klien: ApiClient;
  post: CommunityPost;
  userId: string;
  boleh: boolean;
  roomClosed: boolean;
}) {
  const t = useTeks();
  const cache = useQueryClient();
  const { daring } = useStatusJaringan();
  const key = communityContentKeys.comments(userId, post.id);
  const comments = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listCommunityComments(klien, post.id, { cursor: pageParam }, signal),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    retry: false,
  });
  const items = [
    ...new Map(comments.data?.pages.flatMap((p) => p.data).map((p) => [p.id, p]) ?? []).values(),
  ];
  async function kirim(body: string) {
    const sesi = useStoreSesi.getState();
    await createCommunityComment(klien, post.id, { body });
    if (useStoreSesi.getState() !== sesi) return;
    // Refetch loaded pages; never append to an unfinished chronological list.
    await cache.invalidateQueries({ queryKey: key });
    if (useStoreSesi.getState() !== sesi) return;
    await cache.invalidateQueries({ queryKey: communityContentKeys.post(userId, post.id) });
    await cache.invalidateQueries({
      queryKey: communityContentKeys.feed(userId, post.communityId),
    });
  }
  async function ubah(comment: CommunityComment) {
    const sesi = useStoreSesi.getState();
    if (sesi.status !== "masuk") return;
    await cache.cancelQueries({ queryKey: key });
    if (useStoreSesi.getState() !== sesi) return;
    cache.setQueryData<InfiniteData<CommunityCommentListResponse>>(
      key,
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            data: p.data.map((c) => (c.id === comment.id ? comment : c)),
          })),
        },
    );
    cache.setQueryData(communityContentKeys.comment(userId, comment.id), comment);
    void cache.invalidateQueries({ queryKey: communityContentKeys.post(userId, post.id) });
    void cache.invalidateQueries({ queryKey: communityContentKeys.feed(userId, post.communityId) });
  }
  return (
    <section aria-labelledby="community-komentar" className="flex flex-col gap-5">
      <div>
        <h2 id="community-komentar" className="text-2xl font-semibold">
          {t("community.komentar.judul")}
        </h2>
        <p className="mt-2 text-gray-700">{t("community.komentar.urutan")}</p>
      </div>
      {!daring && <p role="status">{t("community.diskusi.luring")}</p>}
      {comments.isError && (
        <GalatCommunity error={comments.error} onCoba={() => void comments.refetch()} />
      )}
      {comments.isPending && daring && <p role="status">{t("community.diskusi.memuat")}</p>}
      {comments.isSuccess && items.length === 0 && (
        <p className="page-panel">{t("community.komentar.kosong")}</p>
      )}
      {items.length > 0 && (
        <ol className="flex flex-col gap-4" aria-label={t("community.komentar.judul")}>
          {items.map((c) => (
            <li key={c.id}>
              <KartuTulisan
                klien={klien}
                userId={userId}
                content={c}
                bolehEdit={boleh}
                onUbah={async (value) => ubah(value as CommunityComment)}
              />
            </li>
          ))}
        </ol>
      )}
      {items.length > 0 && (
        <Tombol
          varian="sekunder"
          className="self-start"
          aria-disabled={!daring || !comments.hasNextPage || comments.isFetching}
          onClick={() => {
            if (daring && navigator.onLine && comments.hasNextPage && !comments.isFetching)
              void comments.fetchNextPage();
          }}
        >
          {t(comments.hasNextPage ? "community.komentar.muatLagi" : "community.komentar.selesai")}
        </Tombol>
      )}
      <p role="status">{comments.isFetchingNextPage ? t("community.diskusi.memuat") : ""}</p>
      {boleh ? (
        <div className="page-panel">
          <FormTeks
            jenis="comment"
            drafKey={kunciDrafCommunity(userId, "comment", post.id)}
            onKirim={kirim}
          />
        </div>
      ) : (
        <p className="page-panel">
          {t(roomClosed ? "community.arsip.penjelasan" : "community.diskusi.gabung")}
        </p>
      )}
    </section>
  );
}
