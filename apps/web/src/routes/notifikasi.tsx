// Halaman "/notifikasi" (PR-050) — notification center.
//
// HALAMAN, BUKAN DROPDOWN. Dokumen phase menulis "Halaman/dropdown center";
// yang dipilih halaman, dan alasannya aksesibilitas: menu melayang menuntut
// perangkap fokus, pengelolaan Escape, dan penempatan yang tidak menutupi isi
// pada teks 200% — tiga hal yang sama-sama gagal senyap. Halaman ber-alamat
// juga bisa dibagikan, di-bookmark, dan dibuka di tab baru; dropdown tidak.
//
// BERKAS INI TIPIS DENGAN SENGAJA: ia menghubungkan hook lapisan `app/`
// (`useKlienApi`) dan `Link` react-router ke komponen fitur yang tidak boleh
// memanggil keduanya sendiri — lihat catatan lapisan di `features/README.md`.
import { Link } from "react-router";
import { DaftarNotifikasi } from "../features/notifikasi/index.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import { useKlienApi } from "../app/klien-api.js";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";

/**
 * Adaptor `Link` untuk lapisan fitur.
 *
 * Didefinisikan DI LUAR komponen: komponen yang dibuat ulang tiap render adalah
 * tipe elemen yang berbeda bagi React, sehingga seluruh subpohonnya dilepas dan
 * dipasang ulang — fokus yang sedang berada di dalamnya hilang, dan itu persis
 * kegagalan yang paling mahal di halaman ini.
 */
function TautanRute({ ke, children }: { ke: string; children: React.ReactNode }) {
  return (
    <Link to={ke} className="text-base font-semibold text-gray-900 underline">
      {children}
    </Link>
  );
}

export function Notifikasi() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("notifikasi.judul") }));

  return (
    <Terlindungi>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
        {/* `break-words`: alasan yang sama dengan halaman pengaturan — pada
            320 px dengan skala teks 200%, judul panjang memaksa gulir mendatar
            (WCAG 1.4.10 diukur di lebar itu). */}
        <h1 className="text-3xl font-bold break-words text-gray-900">{t("notifikasi.judul")}</h1>
        <p className="text-base text-gray-900">{t("notifikasi.penjelasan")}</p>

        <DaftarNotifikasi klien={klien} sub={idPenggunaSaatIni()} Tautan={TautanRute} />
      </div>
    </Terlindungi>
  );
}
