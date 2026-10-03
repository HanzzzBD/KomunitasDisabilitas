// Halaman "/admin/pengguna" — moderasi akun (PR-083b).
//
// Penjagaan sesi+peran sudah dipasang `Admin` (route induk). Murni delegasi,
// pola sama `routes/admin-lamaran.tsx`.
import { useKlienApi } from "../app/klien-api.js";
import { DaftarPengguna } from "../features/admin/pengguna-daftar.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useTeks } from "../shared/i18n/index.js";

export function AdminPengguna() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("admin.pengguna.judul") }));

  return <DaftarPengguna klien={klien} />;
}
