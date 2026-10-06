import { useMutation } from "@tanstack/react-query";
import { logout } from "@nawasena/api-client";
import { useStoreSesi } from "../shared/sesi/store.js";
import { useTeks } from "../shared/i18n/index.js";
import { useKlienApi } from "./klien-api.js";

export function KeluarAkun({ className = "shell-tool" }: { className?: string }) {
  const t = useTeks();
  const klien = useKlienApi();
  const keluar = useMutation({
    mutationFn: () => logout(klien),
    onSuccess: () => useStoreSesi.getState().keluar(),
  });
  return (
    <>
      <button
        type="button"
        className={className}
        aria-disabled={keluar.isPending}
        aria-busy={keluar.isPending}
        onClick={() => {
          if (!keluar.isPending) keluar.mutate();
        }}
      >
        {t("shell.nav.keluar")}
      </button>
      {keluar.isError && <p role="alert">{t("shell.nav.keluarGagal")}</p>}
    </>
  );
}
