// Halaman "/admin/lamaran" — daftar lamaran (PR-077b).
//
// Penjagaan sesi+peran sudah dipasang `Admin` (route induk). Murni delegasi ke
// `DaftarLamaran`, pola sama `routes/admin-jobs.tsx` — termasuk impor langsung
// ke berkasnya, bukan barrel `features/admin/index.js`.
import { useKlienApi } from "../app/klien-api.js";
import { DaftarLamaran } from "../features/admin/lamaran-daftar.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function AdminLamaranDaftar() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.lamaran.judul") }));

  return <DaftarLamaran klien={klien} />;
}
