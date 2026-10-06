import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  getMe,
  usersKeys,
  communityKeys,
  getMyCommunityMembership,
  type ApiClient,
} from "@nawasena/api-client";
import type { Community } from "@nawasena/schemas";
import { useStoreSesi } from "../../shared/sesi/store.js";
import { useTeks } from "../../shared/i18n/index.js";
import { tautanMasuk } from "../../shared/rute/tujuan.js";
import { GalatCommunity } from "./pesan-galat.js";

export function usePembacaCommunity(klien: ApiClient) {
  const status = useStoreSesi((s) => s.status);
  const me = useQuery({
    queryKey: usersKeys.me(),
    queryFn: () => getMe(klien),
    enabled: status === "masuk",
    retry: false,
  });
  return { status, me, userId: status === "masuk" ? me.data?.data.id : undefined };
}
export function AksesDiskusi({
  klien,
  tujuan,
  children,
}: {
  klien: ApiClient;
  tujuan: string;
  children: (userId: string) => ReactNode;
}) {
  const t = useTeks();
  const { status, me, userId } = usePembacaCommunity(klien);
  if (status === "keluar")
    return (
      <div className="page-panel flex flex-col gap-3">
        <p>{t("community.diskusi.tamu")}</p>
        <Link className="self-start underline" to={tautanMasuk({ pathname: tujuan })}>
          {t("community.diskusi.masuk")}
        </Link>
      </div>
    );
  if (me.isError) return <GalatCommunity error={me.error} onCoba={() => void me.refetch()} />;
  if (!userId) return <p role="status">{t("community.diskusi.memuat")}</p>;
  return children(userId);
}
export function useIzinTulis(klien: ApiClient, userId: string, room?: Community) {
  const member = useQuery({
    queryKey: communityKeys.membership(userId, room?.id ?? ""),
    queryFn: ({ signal }) => getMyCommunityMembership(klien, room!.id, signal),
    enabled: !!room,
    retry: false,
  });
  return {
    member,
    boleh: room?.status === "active" && member.data?.status === "active" && !member.isError,
  };
}
