// Panel "/pengaturan/aksesibilitas" — Scope PR-036: "Panel preferensi permanen".
//
// SLOT-nya SUDAH DIISI. Sampai PR-035 halaman ini menampilkan `KeadaanKosong`
// yang mengakui apa adanya bahwa kendalinya belum ada (PR-033a); kendalinya
// kini ada, jadi pengakuan itu ikut hilang bersama slotnya — keadaan kosong
// yang tertinggal di halaman berisi adalah kalimat yang berbohong.
//
// KALIMAT PENGANTAR YANG LAMA TETAP: preferensi perangkat memang SUDAH diikuti
// sejak PR-026, dan panel ini tidak menggantikannya melainkan menimpanya bila
// pengguna memilih lain (urutan menang ADR-008). Keterangan per sakelar yang
// menyebut "mengikuti setelan perangkat" ditulis panel itu sendiri.
//
// BERKAS INI TIPIS DENGAN SENGAJA: ia menghubungkan hook lapisan `app/`
// (`useA11yStoreWeb`, `useKlienApi`) ke komponen fitur yang tidak boleh
// memanggilnya sendiri — lihat catatan lapisan di `features/README.md`.
import { PanelAksesibilitas } from "../features/aksesibilitas-panel/index.js";
import { useA11yStoreWeb } from "../app/penyedia-a11y.js";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";

export function PengaturanAksesibilitas() {
  const t = useTeks();
  const store = useA11yStoreWeb();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("pengaturan.aksesibilitas.judul") }));

  return (
    <section aria-labelledby="aksesibilitas-judul" className="flex flex-col gap-4">
      <h2 id="aksesibilitas-judul" className="text-2xl font-semibold text-gray-900">
        {t("pengaturan.aksesibilitas.judul")}
      </h2>
      <p className="text-base text-gray-900">{t("pengaturan.aksesibilitas.penjelasan")}</p>

      <PanelAksesibilitas store={store} klien={klien} />
    </section>
  );
}
