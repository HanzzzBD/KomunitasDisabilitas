// Panel indeks "/pengaturan" — Akun & Data Saya (PR-033a).
//
// APA YANG ADA DI SINI, DAN APA YANG MENYUSUL. PR-033a memasang panelnya dan
// menjawab pertanyaan "data apa yang kalian simpan tentang saya". Dua kendali
// hak PDP menyusul di atas panel yang sama: unduh salinan data (PR-033b) dan
// hapus akun (PR-033c).
//
// KENAPA IDENTITAS DITAMPILKAN, DAN BUKAN SEKADAR KERANGKA KOSONG. Halaman
// bernama "Data Saya" yang tidak menampilkan satu pun data adalah halaman yang
// mengingkari namanya. Ia juga menjawab pertanyaan yang sengaja ditunda
// PR-030a: store sesi tahu BAHWA pengguna masuk tetapi tidak tahu SIAPA, dan
// catatannya menyebut bahwa jawabannya lahir "bersama halaman pertama yang
// menampilkan identitas". Inilah halaman itu.
import { useQuery } from "@tanstack/react-query";
import { getMe, usersKeys } from "@nawasena/api-client";
import { Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useKlienApi } from "../app/klien-api.js";

/**
 * Tanggal dalam zona WIB, ditulis EKSPLISIT.
 *
 * Tanpa `timeZone`, tanggal yang sama tampil berbeda di perangkat dengan zona
 * berbeda — dan "bergabung sejak 9 Agustus" yang berubah menjadi "8 Agustus"
 * membuat pengguna mempertanyakan data yang lain juga. Zona produk ini Indonesia;
 * menuliskannya juga membuat test tidak bergantung pada zona mesin CI.
 */
const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

interface BarisProps {
  label: string;
  /** null = memang belum diisi; dibedakan dari "gagal dimuat". */
  nilai: string | null;
  kosong: string;
}

/**
 * Satu baris identitas sebagai pasangan `<dt>`/`<dd>`.
 *
 * `<dl>`, bukan tabel dan bukan deret `<p>`: hubungan label→nilai itulah
 * seluruh isi bagian ini, dan hanya daftar deskripsi yang menyatakannya secara
 * semantik. Pada deret `<p>`, screen reader membacakan "Nama Rina Pratiwi
 * Email rina@contoh.id" sebagai satu aliran tanpa batas yang jelas.
 */
function Baris({ label, nilai, kosong }: BarisProps) {
  return (
    // `<dt>`/`<dd>` sebagai anak LANGSUNG `<dl>`, tanpa `<div>` pembungkus.
    // Pembungkus itu sah menurut HTML, tetapi ia melunturkan peran `term` dan
    // `definition` pada sebagian mesin pembaca peran — termasuk yang dipakai
    // gerbang test — sehingga hubungan label→nilai yang menjadi seluruh guna
    // bagian ini berhenti dinyatakan. Jaraknya diatur `<dl>` lewat grid.
    <>
      <dt className="pt-2 text-sm font-semibold text-gray-700">{label}</dt>
      <dd
        className={
          nilai === null
            ? "border-b border-gray-200 pb-2 text-base italic text-gray-700"
            : "border-b border-gray-200 pb-2 text-base text-gray-900"
        }
      >
        {nilai ?? kosong}
      </dd>
    </>
  );
}

export function PengaturanAkun() {
  const t = useTeks();
  const klien = useKlienApi();

  useJudulHalaman(t("shell.judulDokumen", { halaman: t("pengaturan.akun.judul") }));

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: usersKeys.me(),
    queryFn: () => getMe(klien),
  });

  const akun = data?.data;
  // String kosong dianggap "belum diisi": akun hasil login OTP lahir dengan
  // `fullName` kosong (lihat catatan `meSchema`), dan menampilkannya apa adanya
  // menghasilkan baris berlabel tanpa nilai — tidak bisa dibedakan dari cacat.
  const nama = akun === undefined || akun.fullName.trim() === "" ? null : akun.fullName;

  return (
    <section aria-labelledby="akun-judul" className="flex flex-col gap-4">
      <h2 id="akun-judul" className="text-2xl font-semibold text-gray-900">
        {t("pengaturan.akun.judul")}
      </h2>
      <p className="text-base text-gray-900">{t("pengaturan.akun.penjelasan")}</p>

      <h3 className="text-lg font-semibold text-gray-900">{t("pengaturan.akun.identitas")}</h3>

      {isError ? (
        // `role="alert"`: kegagalan ini menggantikan isi yang diharapkan
        // pengguna tanpa ia meminta apa pun, jadi ia harus terdengar — bukan
        // hanya terlihat oleh yang menatap layar.
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-gray-400 bg-white p-4"
        >
          <p className="text-base font-semibold text-gray-900">{t("pengaturan.akun.gagal")}</p>
          <p className="text-base text-gray-900">{t("pengaturan.akun.gagalPenjelasan")}</p>
          {/*
            Tombol coba lagi, BUKAN muat ulang halaman: yang gagal hanya satu
            permintaan, dan memuat ulang seluruh halaman membuang posisi gulir
            serta memaksa seluruh aplikasi diunduh lagi di jaringan yang barusan
            terbukti bermasalah.
          */}
          <Tombol
            onClick={() => {
              void refetch();
            }}
            disabled={isFetching}
          >
            {t("pengaturan.akun.cobaLagi")}
          </Tombol>
        </div>
      ) : (
        <WilayahMemuat memuat={isPending} label={t("pengaturan.akun.memuat")}>
          <dl className="flex flex-col gap-0">
            <Baris
              label={t("pengaturan.akun.nama")}
              nilai={nama}
              kosong={t("pengaturan.akun.belumDiisi")}
            />
            <Baris
              label={t("pengaturan.akun.email")}
              nilai={akun?.email ?? null}
              kosong={t("pengaturan.akun.belumDiisi")}
            />
            <Baris
              label={t("pengaturan.akun.nomor")}
              nilai={akun?.phone ?? null}
              kosong={t("pengaturan.akun.belumDiisi")}
            />
            <Baris
              label={t("pengaturan.akun.bergabung")}
              nilai={akun === undefined ? null : TANGGAL.format(new Date(akun.createdAt))}
              kosong={t("pengaturan.akun.belumDiisi")}
            />
          </dl>
        </WilayahMemuat>
      )}
    </section>
  );
}
