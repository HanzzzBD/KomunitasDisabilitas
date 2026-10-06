import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  communityAdminKeys,
  communityContentKeys,
  communityKeys,
  getMe,
  usersKeys,
} from "@nawasena/api-client";
import { Tombol } from "@nawasena/ui";
import { pesanGalatApi } from "../../shared/galat-api.js";
import { useTeks, type FungsiTeks } from "../../shared/i18n/index.js";
import { useStoreSesi } from "../../shared/sesi/store.js";
export function useRefreshCommunity() {
  const cache = useQueryClient();
  return async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: communityAdminKeys.all() }),
      cache.invalidateQueries({ queryKey: communityKeys.lists() }),
      cache.invalidateQueries({ queryKey: ["community"] }),
      cache.invalidateQueries({ queryKey: ["community-by-id"] }),
      cache.invalidateQueries({ queryKey: communityContentKeys.all() }),
    ]);
  };
}
export function useIdentitasAdmin(klien: Parameters<typeof getMe>[0]) {
  const status = useStoreSesi((s) => s.status);
  const user = useQuery({
    queryKey: usersKeys.me(),
    queryFn: () => getMe(klien),
    enabled: status === "masuk",
  });
  return status === "masuk" && user.data?.data.role === "admin" ? user.data.data.id : undefined;
}
export const tanggalCommunity = (value: string) =>
  new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
export function galatAdminCommunity(error: unknown, t: FungsiTeks) {
  return pesanGalatApi(error, t, {
    SLUG_KOMUNITAS_DIPAKAI: "admin.community.slugDipakai",
    LAPORAN_KOMUNITAS_DITUTUP: "admin.community.konflik",
    KONTEN_KOMUNITAS_DIHAPUS: "admin.community.konflik",
    JARINGAN_GAGAL: "shell.galat.jaringan",
    TERLALU_BANYAK_PERMINTAAN: "community.galat.batas",
  });
}
export function GalatAdminCommunity({ error, onCoba }: { error: unknown; onCoba: () => void }) {
  const t = useTeks();
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p>{galatAdminCommunity(error, t)}</p>
      <Tombol varian="sekunder" onClick={onCoba}>
        {t("admin.community.coba")}
      </Tombol>
    </div>
  );
}
