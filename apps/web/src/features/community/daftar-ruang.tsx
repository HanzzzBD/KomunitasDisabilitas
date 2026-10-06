import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { communityKeys, listCommunities, type ApiClient } from "@nawasena/api-client";
import { KeadaanKosong, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { FilterRuang } from "./filter-ruang.js";
import type { FilterCommunity } from "./filter-url.js";
import { GalatCommunity } from "./pesan-galat.js";

export function DaftarRuang({
  klien,
  filter,
  onTerapkan,
  asal,
  fokusId,
  onBuka,
}: {
  klien: ApiClient;
  filter: FilterCommunity;
  onTerapkan: (filter: FilterCommunity) => void;
  asal: string;
  fokusId: string | null;
  onBuka: (id: string) => void;
}) {
  const t = useTeks();
  const { daring } = useStatusJaringan();
  const daftar = useInfiniteQuery({
    queryKey: communityKeys.list(filter),
    queryFn: ({ pageParam, signal }) =>
      listCommunities(
        klien,
        {
          ...filter,
          limit: 20,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    retry: false,
  });
  const rooms = [
    ...new Map(daftar.data?.pages.flatMap((p) => p.data).map((r) => [r.id, r])).values(),
  ];
  const tautan = useRef(new Map<string, HTMLAnchorElement>());
  const dipulihkan = useRef<string | null>(null);
  useEffect(() => {
    if (!fokusId || dipulihkan.current === fokusId) return;
    const target = tautan.current.get(fokusId);
    if (target) {
      dipulihkan.current = fokusId;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
    }
  }, [fokusId, daftar.data]);
  const adaFilter = Boolean(filter.type || filter.city);
  const memuat = daftar.isPending && daring;

  return (
    <div className="community-browse-layout">
      <FilterRuang filter={filter} onTerapkan={onTerapkan} />
      <section aria-labelledby="community-hasil" className="flex min-w-0 flex-col gap-4">
        <h2 id="community-hasil" className="text-xl font-semibold">
          {t("community.hasil.judul")}
        </h2>
        {!daring && (
          <p role="status" className="text-base">
            {t(daftar.data ? "community.cacheLuring" : "community.luring")}
          </p>
        )}
        {daftar.isError && (
          <GalatCommunity
            error={daftar.error}
            onCoba={() => {
              if (daftar.isFetchNextPageError) void daftar.fetchNextPage();
              else void daftar.refetch();
            }}
          />
        )}
        <WilayahMemuat memuat={memuat} label={t("community.memuat")}>
          <p role="status" className="text-base">
            {daftar.data ? t("community.hasil.jumlah", { jumlah: rooms.length }) : ""}
          </p>
          {daftar.data && rooms.length === 0 ? (
            <KeadaanKosong
              tingkatJudul={3}
              judul={t(adaFilter ? "community.hasil.tidakCocok" : "community.hasil.kosong")}
            >
              {t(adaFilter ? "community.hasil.ubahFilter" : "community.hasil.kosongPenjelasan")}
            </KeadaanKosong>
          ) : (
            <ul className="flex list-none flex-col gap-4 p-0">
              {rooms.map((room) => (
                <li key={room.id} className="community-room page-panel flex flex-col gap-3">
                  <p className="text-sm font-semibold">
                    {t(`community.jenis.${room.type}`)}
                    {room.city ? ` · ${room.city}` : ""}
                  </p>
                  <h3 className="text-xl font-semibold">
                    <Link
                      to={`/community/${room.slug}`}
                      state={{ asal }}
                      ref={(el) => {
                        if (el) tautan.current.set(room.id, el);
                        else tautan.current.delete(room.id);
                      }}
                      onClick={() => onBuka(room.id)}
                      className="underline hover:no-underline"
                    >
                      {room.name}
                    </Link>
                  </h3>
                  <p className="community-room-description text-base">{room.description}</p>
                  <p className="text-base">
                    {t("community.anggota.jumlah", { jumlah: room.memberCount })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </WilayahMemuat>
        {rooms.length > 0 && (
          <Tombol
            varian="sekunder"
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            aria-disabled={!daring || !daftar.hasNextPage || daftar.isFetching}
            onClick={() => {
              if (daring && daftar.hasNextPage && !daftar.isFetching) void daftar.fetchNextPage();
            }}
          >
            {t(
              daftar.isFetchingNextPage
                ? "community.memuat"
                : daftar.hasNextPage
                  ? "community.muatLagi"
                  : "community.semuaDimuat",
            )}
          </Tombol>
        )}
      </section>
    </div>
  );
}
