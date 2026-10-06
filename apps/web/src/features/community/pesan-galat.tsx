import { Tombol } from "@nawasena/ui";
import { useTeks, type FungsiTeks } from "../../shared/i18n/index.js";
import { pesanGalatApi } from "../../shared/galat-api.js";

export function pesanGalatCommunity(error: unknown, t: FungsiTeks) {
  return pesanGalatApi(error, t, {
    JARINGAN_GAGAL: "shell.galat.jaringan",
    BELUM_SIAP: "community.galat.umum",
    TERLALU_BANYAK_PERMINTAAN: "community.galat.batas",
    SESI_TIDAK_VALID: "community.galat.sesi",
    SESI_KEDALUWARSA: "community.galat.sesi",
    KEANGGOTAAN_DIBLOKIR: "community.member.blockedPenjelasan",
    KOMUNITAS_DIARSIPKAN: "community.arsip.penjelasan",
  });
}

export function GalatCommunity({ error, onCoba }: { error: unknown; onCoba: () => void }) {
  const t = useTeks();
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-base text-red-700">{pesanGalatCommunity(error, t)}</p>
      <Tombol varian="sekunder" onClick={onCoba}>
        {t("community.cobaLagi")}
      </Tombol>
    </div>
  );
}
