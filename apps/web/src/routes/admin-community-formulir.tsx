import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { communityAdminKeys, getCommunityAdmin } from "@nawasena/api-client";
import { communityIdParamsSchema } from "@nawasena/schemas";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import {
  GalatAdminCommunity,
  useIdentitasAdmin,
  useRefreshCommunity,
} from "../features/admin/community-shared.js";
import { FormulirCommunity } from "../features/admin/community-formulir.js";
export function AdminCommunityFormulir() {
  const klien = useKlienApi();
  const userId = useIdentitasAdmin(klien);
  const { id } = useParams();
  return userId ? <IsiForm key={`${userId}:${id ?? "baru"}`} userId={userId} id={id} /> : null;
}
function IsiForm({ userId, id }: { userId: string; id?: string }) {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const refresh = useRefreshCommunity();
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: communityAdminKeys.room(userId, id ?? ""),
    queryFn: ({ signal }) => getCommunityAdmin(klien, id!, signal),
    enabled: !!id && communityIdParamsSchema.safeParse({ id }).success,
    retry: false,
  });
  useJudulHalaman(
    t("shell.judulDokumen", { halaman: t(id ? "admin.community.edit" : "admin.community.baru") }),
  );
  return (
    <div className="flex flex-col gap-4">
      <Link
        className="self-start inline-flex min-h-sentuh items-center underline"
        to="/admin/community"
      >
        {t("admin.community.kembali")}
      </Link>
      <h2 className="text-2xl font-semibold">
        {t(id ? "admin.community.edit" : "admin.community.baru")}
      </h2>
      <p role="status">{notice}</p>
      {id && !communityIdParamsSchema.safeParse({ id }).success ? (
        <p role="alert">{t("admin.community.galat")}</p>
      ) : id && query.isPending ? (
        <p role="status">{t("admin.community.memuat")}</p>
      ) : query.isError ? (
        <GalatAdminCommunity error={query.error} onCoba={() => void query.refetch()} />
      ) : !id || query.data ? (
        <FormulirCommunity
          klien={klien}
          room={query.data}
          onSelesai={(room) => {
            if (!id) {
              void refresh();
              navigate(`/admin/community/ruang/${room.id}`, { replace: true });
            } else {
              setNotice(t("admin.community.berhasil"));
              void refresh();
            }
          }}
        />
      ) : null}
    </div>
  );
}
