// Halaman "/onboarding" (PR-035) — wizard aksesibilitas untuk pengguna baru.
//
// TIGA HAL DIPUTUSKAN DI BERKAS INI, dan wizard-nya sendiri tidak tahu satu pun
// dari ketiganya — itulah yang membuat `features/onboarding/` tetap bisa
// dipakai ulang mobile (features/README.md):
//
//   1. SAKELAR OPERASIONAL. Diperiksa PALING DULU, sebelum guard sesi dan
//      sebelum satu baris logika wizard berjalan. Ini titik kedua dari dua
//      (yang pertama di `app/tata-letak.tsx`); keduanya memanggil fungsi yang
//      SAMA, sehingga tidak ada nama env var yang bisa menyimpang.
//   2. PENJAGAAN SESI. `<Terlindungi>` dipasang di dalam komponen, bukan di
//      `routes.ts` — berkas itu sengaja `.ts` murni data (pola yang sama dengan
//      `Pengaturan`, PR-033a).
//   3. PERPINDAHAN HALAMAN sesudah wizard ditutup. `replace`, BUKAN push:
//      menekan tombol kembali sesudah selesai tidak boleh mengembalikan
//      pengguna ke wizard yang barusan ia tinggalkan — jebakan yang terasa
//      seperti tombol kembali yang rusak (alasan yang sama dengan
//      `Terlindungi` dan dengan alur hapus akun di `pengaturan-akun.tsx`).
import { Navigate, useNavigate } from "react-router";
import { Terlindungi } from "../shared/rute/terlindungi.js";
import { Wizard, wizardOnboardingAktif } from "../features/onboarding/index.js";
import { useA11yStoreWeb } from "../app/penyedia-a11y.js";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";

export function Onboarding() {
  const t = useTeks();
  const navigate = useNavigate();
  const store = useA11yStoreWeb();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("onboarding.judul") }));

  // Hook dipanggil LEBIH DULU, baru sakelarnya diperiksa: percabangan sebelum
  // hook akan melanggar Rules of Hooks pada render berikutnya. Tidak ada logika
  // wizard yang berjalan di jalur ini — `Wizard` tidak pernah dipasang.
  if (!wizardOnboardingAktif()) return <Navigate to="/" replace />;

  return (
    <Terlindungi>
      <Wizard
        store={store}
        klien={klien}
        onKeluar={() => {
          void navigate("/", { replace: true });
        }}
      />
    </Terlindungi>
  );
}
