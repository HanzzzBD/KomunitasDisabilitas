// Opt-out analytics (PR-082, AC "Opt-out tersedia di settings (toggle)").
//
// PER PERANGKAT (keputusan owner 2026-10-03): pilihan disimpan di peramban ini
// saja, dan kalimatnya mengatakan itu — pengguna tidak boleh mengira pilihannya
// ikut ke ponselnya. Bila peramban sudah meminta tidak dilacak (DNT/GPC),
// kotaknya tidak ditawarkan: tidak ada yang dikirim apa pun pilihannya, dan
// kotak yang tampak "menyala" padahal tidak berpengaruh adalah kebohongan kecil.
import { useState } from "react";
import { Kartu, KotakCentang } from "@nawasena/ui";
import {
  analitikDimatikanPengguna,
  aturAnalitikDimatikan,
  pelacakanDitolakPeramban,
} from "../../shared/analitik.js";
import { useTeks } from "../../shared/i18n/index.js";

export function PrivasiAnalitik() {
  const t = useTeks();
  const [mati, setMati] = useState(analitikDimatikanPengguna);
  const [baruDiubah, setBaruDiubah] = useState(false);
  const ditolakPeramban = pelacakanDitolakPeramban();

  return (
    <Kartu judul={t("pengaturan.analitik.judul")} tingkatJudul={3}>
      <div className="flex flex-col gap-3">
        <p className="text-base text-gray-900">{t("pengaturan.analitik.penjelasan")}</p>
        {ditolakPeramban ? (
          <p className="text-base text-gray-900">{t("pengaturan.analitik.dnt")}</p>
        ) : (
          <>
            <KotakCentang
              label={t("pengaturan.analitik.kotak")}
              bantuan={t("pengaturan.analitik.bantuan")}
              dicentang={!mati}
              onUbah={(aktif) => {
                aturAnalitikDimatikan(!aktif);
                setMati(!aktif);
                setBaruDiubah(true);
              }}
            />
            <p role="status" className="text-base text-gray-700">
              {baruDiubah
                ? t(mati ? "pengaturan.analitik.disimpanMati" : "pengaturan.analitik.disimpanNyala")
                : ""}
            </p>
          </>
        )}
      </div>
    </Kartu>
  );
}
