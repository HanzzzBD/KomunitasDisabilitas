// Panel indeks "/pengaturan" — Akun & Data Saya (PR-033a, PR-033b).
//
// APA YANG ADA DI SINI, DAN APA YANG MENYUSUL. PR-033a memasang panelnya dan
// menjawab "data apa yang kalian simpan tentang saya"; PR-033b menambahkan hak
// mengambil salinannya. Hapus akun menyusul di PR-033c.
//
// KENAPA IDENTITAS DITAMPILKAN, DAN BUKAN SEKADAR KERANGKA KOSONG. Halaman
// bernama "Data Saya" yang tidak menampilkan satu pun data adalah halaman yang
// mengingkari namanya. Ia juga menjawab pertanyaan yang sengaja ditunda
// PR-030a: store sesi tahu BAHWA pengguna masuk tetapi tidak tahu SIAPA, dan
// catatannya menyebut bahwa jawabannya lahir "bersama halaman pertama yang
// menampilkan identitas". Inilah halaman itu.
import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { exportMe, getMe, usersKeys } from "@nawasena/api-client";
import { Kartu, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { useKlienApi } from "../app/klien-api.js";
import { berkasJson, unduhBerkas } from "../shared/unduh-berkas.js";
import { namaBerkasEkspor, pesanGalatEkspor } from "../features/akun/ekspor.js";
import { DialogHapusAkun } from "../features/akun/dialog-hapus-akun.js";
import { useStoreSesi } from "../shared/sesi/store.js";

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

/**
 * Bagian "Unduh salinan data Anda" — AC PR-033 nomor 1.
 *
 * `useMutation`, BUKAN `useQuery`, meski endpoint-nya `GET`. Tiap panggilan
 * memakan kuota (3× per 24 jam) dan tercatat di audit; sebagai query ia akan
 * berjalan sendiri saat komponen dipasang dan berpotensi berjalan lagi saat
 * datanya dianggap basi — menghabiskan jatah pengguna tanpa ia menekan apa pun.
 * `@nawasena/api-client` sengaja tidak menyediakan query key untuk endpoint ini
 * supaya jalan yang salah itu tidak tersedia.
 */
function UnduhData() {
  const t = useTeks();
  const klien = useKlienApi();
  const [kabar, setKabar] = useState("");

  const ekspor = useMutation({
    mutationFn: () => exportMe(klien),
    onMutate: () => {
      // Dikosongkan lebih dulu supaya unduhan KEDUA pada hari yang sama ikut
      // terdengar: live region hanya mengumumkan PERUBAHAN, dan menulis kalimat
      // yang sama persis dua kali bukan perubahan.
      setKabar("");
    },
    onSuccess: ({ data: berkas }) => {
      const nama = namaBerkasEkspor(berkas.exportedAt);
      unduhBerkas(nama, berkasJson(berkas));
      setKabar(t("pengaturan.ekspor.selesai", { nama }));
    },
  });

  const sibuk = ekspor.isPending;

  return (
    <Kartu
      judul={t("pengaturan.ekspor.judul")}
      // Tingkat 3: bersarang di bawah <h2> panel, yang bersarang di bawah <h1>
      // "Pengaturan" milik kerangka.
      tingkatJudul={3}
      aksi={
        <Tombol
          // `aria-disabled`, BUKAN `disabled`. Tombol yang dinonaktifkan saat ia
          // sedang MEMEGANG fokus melepaskan fokus itu ke awal dokumen di
          // beberapa peramban — pengguna keyboard yang baru menekan Enter
          // terdampar dan harus menyusuri halaman lagi untuk kembali. Dengan
          // `aria-disabled` tombolnya tetap terfokus dan tetap diumumkan
          // sebagai nonaktif; yang menahan klik kedua adalah penjaga di bawah.
          aria-disabled={sibuk}
          aria-busy={sibuk}
          onClick={() => {
            if (sibuk) return;
            ekspor.mutate();
          }}
        >
          {sibuk ? t("pengaturan.ekspor.menyiapkan") : t("pengaturan.ekspor.tombol")}
        </Tombol>
      }
    >
      <p className="text-base text-gray-900">{t("pengaturan.ekspor.penjelasan")}</p>
      {/* Batasnya disebutkan SEBELUM ditekan, bukan baru muncul sebagai galat. */}
      <p className="text-sm text-gray-700">{t("pengaturan.ekspor.batas")}</p>

      {/*
        Selalu dirender, juga saat kosong. Live region hanya mengumumkan
        perubahan DI DALAM region yang sudah ada; region yang lahir bersama
        pesannya kerap tidak terbaca sama sekali (pola yang sama dengan
        `WilayahMemuat`, PR-028b).

        Ini satu-satunya tanda bahwa unduhan berhasil: berkas yang turun tidak
        mengubah apa pun di halaman, jadi tanpa pengumuman ini pengguna screen
        reader menekan tombol lalu tidak mendengar apa pun sama sekali.
      */}
      <p role="status" className="text-base text-gray-900">
        {kabar}
      </p>

      {ekspor.isError ? (
        <p role="alert" className="text-base font-semibold text-gray-900">
          {pesanGalatEkspor(ekspor.error, t)}
        </p>
      ) : null}
    </Kartu>
  );
}

/**
 * Bagian "Hapus akun" — AC PR-033 nomor 2 & 3.
 *
 * PR-033c-1 hanya membangun jalur konfirmasi lewat kode OTP. Akun yang masuk
 * lewat Google (tanpa nomor HP) diberi tahu APA ADANYA bahwa jalurnya belum
 * ada, bukan tombol yang akan ditolak server pada langkah terakhir: pengguna
 * yang ditolak sesudah membaca seluruh peringatan akan mengira dirinya yang
 * salah. Jalur Google lahir di PR-033c-2.
 */
function HapusAkun({ nomor }: { nomor: string | null }) {
  const t = useTeks();
  const klien = useKlienApi();
  const navigate = useNavigate();
  const keluar = useStoreSesi((s) => s.keluar);

  return (
    <Kartu judul={t("pengaturan.hapus.judul")} tingkatJudul={3}>
      <p className="text-base text-gray-900">{t("pengaturan.hapus.penjelasan")}</p>

      {nomor === null ? (
        <p className="text-base text-gray-900">{t("pengaturan.hapus.tanpaNomor")}</p>
      ) : (
        <DialogHapusAkun
          klien={klien}
          nomor={nomor}
          onSelesai={() => {
            // BERPINDAH DULU — DAN PERPINDAHANNYA HARUS SUDAH TER-COMMIT —
            // baru sesinya dibuang.
            //
            // Membuang sesi lebih dulu berarti `Terlindungi`, yang masih
            // merender halaman ini, langsung melihat status "keluar" lalu
            // mengalihkan ke `/masuk?tujuan=%2Fpengaturan`. Pengguna yang baru
            // saja menghapus akunnya mendarat di halaman MASUK, membawa tujuan
            // kembali ke pengaturan akun yang sudah tidak ada.
            //
            // Menukar urutannya saja TIDAK cukup, dan itu yang ditemukan test:
            // pada data router (`createBrowserRouter`), `navigate` ASINKRON —
            // ia menjalankan transisi lebih dulu, sehingga baris sesudahnya
            // berjalan ketika halaman ini MASIH terpasang. `flushSync` juga
            // tidak menolong; ia tidak bisa memaksa transisi router selesai.
            //
            // Karena itu perpindahannya DITUNGGU. Bentuk ini sekaligus menyatakan
            // maksudnya: sesi baru boleh dibuang setelah kita benar-benar keluar
            // dari halaman terlindungi.
            void Promise.resolve(navigate("/", { replace: true })).then(() => keluar());
          }}
        />
      )}
    </Kartu>
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
          {/* `aria-disabled`, bukan `disabled` — alasannya sama seperti tombol
              unduh di bawah, dan justru paling menyakitkan di sini: tombol ini
              PASTI sedang memegang fokus saat ditekan, sebab ia satu-satunya
              kendali di layar galat. Diseragamkan di PR-033b. */}
          <Tombol
            aria-disabled={isFetching}
            aria-busy={isFetching}
            onClick={() => {
              if (isFetching) return;
              void refetch();
            }}
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

      {/*
        Hak mengunduh berdiri SENDIRI dari keberhasilan memuat identitas.
        Dirender di luar percabangan di atas dengan sengaja: pengguna yang
        `GET /me`-nya gagal tetap berhak mengambil salinan datanya, dan
        menyembunyikan tombolnya pada saat itu berarti hak PDP hilang justru
        karena kegagalan yang tidak ada hubungannya.
      */}
      <UnduhData />

      {/*
        Hapus akun, SEBALIKNYA, menunggu identitas termuat — dan itu bukan
        ketidakkonsistenan. Jalur konfirmasinya ditentukan oleh apa yang dimiliki
        akun ini (nomor HP atau Google), jadi menawarkannya sebelum tahu berarti
        menebak. Menebak salah di sini menghasilkan tombol yang menolak pengguna
        pada langkah terakhir, sesudah ia membaca seluruh peringatan.
      */}
      {akun === undefined ? null : <HapusAkun nomor={akun.phone} />}
    </section>
  );
}
