// Halaman "/admin/companies" — daftar perusahaan (PR-053).
//
// Penjagaan sesi+peran sudah dipasang oleh `Admin` (route induk, `admin.tsx`);
// halaman ini murni delegasi ke `DaftarPerusahaan` (features/admin), yang
// memegang query, pengurutan, dan keadaan galat/kosongnya sendiri.
import { useKlienApi } from "../app/klien-api.js";
// Impor LANGSUNG ke berkasnya, BUKAN barrel `features/admin/index.js`: barrel
// itu juga mengekspor `FormulirPerusahaan`, yang memakai katalog `profil`
// (label taksonomi akomodasi). Halaman daftar ini tidak menyentuh formulir
// sama sekali — mengimpor lewat barrel membuat penjaga pemuatan malas
// (`i18n-lazy.test.ts`) mengira halaman ini butuh katalog yang tidak pernah
// ia pakai, dan menuntutnya dimuat sia-sia.
import { DaftarPerusahaan } from "../features/admin/companies-daftar.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function AdminCompaniesDaftar() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.companies.judul") }));

  return <DaftarPerusahaan klien={klien} />;
}
