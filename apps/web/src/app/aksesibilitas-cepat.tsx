import { lazy, Suspense, useState } from "react";
import { Dialog, Tombol } from "@nawasena/ui";
import { muatKatalog, useTeks } from "../shared/i18n/index.js";
import { useA11yStoreWeb } from "./penyedia-a11y.js";
import { useKlienApi } from "./klien-api.js";
import { IkonNavigasi } from "./ikon-navigasi.js";

const Panel = lazy(async () => {
  const [modul] = await Promise.all([
    import("../features/aksesibilitas-panel/index.js"),
    muatKatalog("pengaturan", "onboarding"),
  ]);
  return { default: modul.PanelAksesibilitas };
});

export function AksesibilitasCepat() {
  const t = useTeks();
  const store = useA11yStoreWeb();
  const klien = useKlienApi();
  const [terbuka, setTerbuka] = useState(false);
  return (
    <Dialog
      judul={t("shell.cepat.judul")}
      terbuka={terbuka}
      onUbahTerbuka={setTerbuka}
      pemicu={
        <Tombol varian="hening" className="shell-tool" aria-label={t("shell.cepat.judul")}>
          <IkonNavigasi nama="aksesibilitas" />
          <span className="shell-quick-label">{t("shell.nav.aksesibilitas")}</span>
        </Tombol>
      }
    >
      <Suspense fallback={<p role="status">{t("shell.memuat")}</p>}>
        {terbuka && <Panel store={store} klien={klien} />}
      </Suspense>
    </Dialog>
  );
}
