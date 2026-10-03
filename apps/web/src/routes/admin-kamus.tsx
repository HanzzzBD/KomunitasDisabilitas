// Halaman "/admin/kamus" — daftar kamus BISINDO (PR-085b). Pola sama
// `routes/admin-jobs.tsx`: penjagaan sesi+peran dipasang `Admin` (induk).
import { useKlienApi } from "../app/klien-api.js";
import { DaftarKamus } from "../features/admin/kamus-daftar.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function AdminKamusDaftar() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.kamus.judul") }));

  return <DaftarKamus klien={klien} />;
}
