import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  communityKeys,
  getMe,
  getMyCommunityMembership,
  joinCommunity,
  leaveCommunity,
  usersKeys,
  type ApiClient,
} from "@nawasena/api-client";
import type { Community } from "@nawasena/schemas";
import { Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useStatusJaringan } from "../../shared/status-jaringan.js";
import { tautanMasuk } from "../../shared/rute/tujuan.js";
import { GalatCommunity, pesanGalatCommunity } from "./pesan-galat.js";

export function Keanggotaan({ klien, room }: { klien: ApiClient; room: Community }) {
  const t = useTeks();
  const status = useStoreSesi((s) => s.status);
  const { daring } = useStatusJaringan();
  const me = useQuery({
    queryKey: usersKeys.me(),
    queryFn: () => getMe(klien),
    enabled: status === "masuk",
    retry: false,
  });
  const masuk = tautanMasuk({ pathname: `/community/${room.slug}` });

  return (
    <section
      className="page-panel flex flex-col items-start gap-4"
      aria-labelledby="community-member"
    >
      <h2 id="community-member" className="text-xl font-semibold">
        {t("community.member.judul")}
      </h2>
      {status === "keluar" ? (
        <>
          <p className="text-base">{t("community.member.tamu")}</p>
          {room.status === "active" && (
            <Link to={masuk} className="shell-login text-base font-semibold">
              {t("community.member.masuk")}
            </Link>
          )}
        </>
      ) : status === "memulihkan" ? (
        <p role="status" className="text-base">
          {t(daring ? "community.member.memuat" : "community.luring")}
        </p>
      ) : me.isError ? (
        <GalatCommunity error={me.error} onCoba={() => void me.refetch()} />
      ) : me.data ? (
        <Anggota
          key={`${room.id}:${me.data.data.id}`}
          klien={klien}
          room={room}
          userId={me.data.data.id}
        />
      ) : (
        <p role="status" className="text-base">
          {t(daring ? "community.member.memuat" : "community.luring")}
        </p>
      )}
    </section>
  );
}

function Anggota({ klien, room, userId }: { klien: ApiClient; room: Community; userId: string }) {
  const t = useTeks();
  const { daring } = useStatusJaringan();
  const cache = useQueryClient();
  const key = communityKeys.membership(userId, room.id);
  const member = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getMyCommunityMembership(klien, room.id, signal),
    retry: false,
  });
  const change = useMutation({
    mutationFn: (action: "join" | "leave") =>
      action === "join" ? joinCommunity(klien, room.id) : leaveCommunity(klien, room.id),
    // Offline actions never become a queued join/leave on reconnection.
    networkMode: "always",
    onMutate: () => cache.cancelQueries({ queryKey: key }),
    onSuccess: (result) => {
      cache.setQueryData(key, result);
      void cache.invalidateQueries({ queryKey: communityKeys.detail(room.slug) });
      void cache.invalidateQueries({ queryKey: communityKeys.lists() });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: key });
      void cache.invalidateQueries({ queryKey: communityKeys.detail(room.slug) });
    },
  });
  const blocked = member.data?.status === "blocked";
  const active = member.data?.status === "active";
  const closed = room.status === "archived";
  const cannotChange =
    !daring ||
    change.isPending ||
    member.isPending ||
    member.isError ||
    blocked ||
    (closed && !active);

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-4">
      {!daring && (
        <p role="status" className="text-base">
          {t("community.luring")}
        </p>
      )}
      {member.isPending ? (
        <p role="status" className="text-base">
          {t(daring ? "community.member.memuat" : "community.luring")}
        </p>
      ) : member.isError ? (
        <GalatCommunity error={member.error} onCoba={() => void member.refetch()} />
      ) : (
        <p className="text-base font-semibold">
          {t(
            blocked
              ? "community.member.blocked"
              : active
                ? "community.member.aktif"
                : "community.member.belum",
          )}
        </p>
      )}
      {blocked && <p className="text-base">{t("community.member.blockedPenjelasan")}</p>}
      <Tombol
        varian={active ? "sekunder" : "utama"}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        aria-disabled={cannotChange}
        onClick={() => {
          if (cannotChange || !navigator.onLine) return;
          change.mutate(active ? "leave" : "join");
        }}
      >
        {t(active ? "community.member.leave" : "community.member.join")}
      </Tombol>
      <p role="status" className="text-base">
        {change.isPending
          ? t("community.member.menyimpan")
          : change.isSuccess
            ? t(
                change.variables === "join"
                  ? "community.member.berhasilJoin"
                  : "community.member.berhasilLeave",
              )
            : ""}
      </p>
      {change.isError && (
        <p role="alert" className="text-base text-red-700">
          {pesanGalatCommunity(change.error, t)}
        </p>
      )}
    </div>
  );
}
