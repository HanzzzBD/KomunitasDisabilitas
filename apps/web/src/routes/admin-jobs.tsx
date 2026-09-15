// Halaman "/admin/jobs" — daftar lowongan (PR-057).
//
// Penjagaan sesi+peran sudah dipasang oleh `Admin` (route induk, `admin.tsx`);
// halaman ini murni delegasi ke `DaftarLowongan` (features/admin), yang
// memegang query, filter status, pengurutan, dan duplikasi sendiri. Pola
// sama persis `routes/admin-companies.tsx`.
import { useKlienApi } from "../app/klien-api.js";
// Impor LANGSUNG ke berkasnya, BUKAN barrel `features/admin/index.js` —
// alasan yang sama dengan `routes/admin-companies.tsx`: barrel itu juga
// mengekspor `FormulirLowongan`, yang memakai katalog `profil`/`onboarding`
// (label akomodasi + ragam disabilitas). Halaman daftar ini tidak menyentuh
// formulir sama sekali.
import { DaftarLowongan } from "../features/admin/jobs-daftar.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function AdminJobsDaftar() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.jobs.judul") }));

  return <DaftarLowongan klien={klien} />;
}
