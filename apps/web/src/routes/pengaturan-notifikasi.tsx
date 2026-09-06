// Panel "/pengaturan/notifikasi" (PR-049b).
//
// BERKAS INI TIPIS DENGAN SENGAJA: ia menghubungkan hook lapisan `app/`
// (`useKlienApi`) dan identitas sesi ke komponen fitur yang tidak boleh
// memanggilnya sendiri — lihat catatan lapisan di `features/README.md`.
//
// KENAPA PANEL TERSENDIRI, BUKAN BAGIAN DARI "Akun & Data Saya". Preferensi
// kanal menjawab pertanyaan yang berbeda dari panel akun ("siapa saya" vs
// "bagaimana saya dikabari"), dan menumpuknya di panel akun akan menaruh
// sakelar yang mengubah perilaku sistem tepat di sebelah tombol hapus akun.
import { PanelKanalNotifikasi } from "../features/notifikasi-kanal/index.js";
// DIIMPOR DARI BERKASNYA LANGSUNG, bukan dari barrel `features/onboarding`.
// Barrel itu ikut membawa komponen wizard, dan penjaga `i18n-lazy.test.ts`
// membaca graf impor sebuah rute untuk menentukan katalog yang wajib dimuatnya
// — halaman ini akan dipaksa mengunduh katalog `onboarding` yang tidak pernah
// ia sentuh, yaitu bobot bundel yang dibayar setiap pembuka halaman ini.
//
// `idPenggunaSaatIni` sendiri bukan milik onboarding secara konseptual: ia
// membaca klaim `sub` dari access token. Ia tinggal di sana karena onboarding
// pemakai pertamanya, dan memindahkannya adalah perubahan lintas-berkas yang
// tidak pantas ditumpangkan ke PR ini.
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";

export function PengaturanNotifikasi() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("pengaturan.notifikasi.judul") }));

  return (
    <section aria-labelledby="notifikasi-judul" className="flex flex-col gap-4">
      <h2 id="notifikasi-judul" className="text-2xl font-semibold text-gray-900">
        {t("pengaturan.notifikasi.judul")}
      </h2>
      <p className="text-base text-gray-900">{t("pengaturan.notifikasi.penjelasan")}</p>

      {/* Halaman ini hidup di bawah `Terlindungi`, jadi `sub` selalu ada di
          jalur nyata. `null` tetap ditangani `notificationPrefsKeys` sebagai
          laci terpisah — bukan sebagai kesalahan. */}
      <PanelKanalNotifikasi klien={klien} sub={idPenggunaSaatIni()} />
    </section>
  );
}
