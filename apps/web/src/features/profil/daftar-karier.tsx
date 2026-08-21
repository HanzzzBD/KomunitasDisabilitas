// Bagian 3 — daftar karier yang bisa disunting (PR-040).
//
// SATU KOMPONEN UNTUK KETIGA SUB-ENTITAS — pengalaman kerja, pendidikan, dan
// keahlian. Alasannya sama persis dengan `career.service.ts` di sisi server dan
// `bagianKarier` di `@nawasena/api-client`: alurnya identik (daftar, tambah,
// ubah, hapus), dan salinan ketiga adalah tempat seseorang kelak lupa memasang
// `aria-label` pada tombol Hapus — cacat yang tidak terlihat sama sekali oleh
// yang menatap layar.
//
// KENAPA SETIAP BARIS DISIMPAN SENDIRI, BUKAN SELURUH DAFTAR SEKALIGUS. Server
// memang menyediakan endpoint per baris (PR-038), tetapi bukan itu alasannya.
// Alasannya: daftar yang disimpan sekaligus menuntut pengguna menyelesaikan
// SEMUA barisnya sebelum satu pun aman. Pada formulir sepanjang ini — dan bagi
// pengguna yang mengetik dengan satu tangan, dengan tombol saklar, atau dengan
// suara — itu berarti setiap gangguan di tengah jalan menghapus seluruh
// pekerjaan.
//
// TENTANG `aria-label` PADA TOMBOL BARIS. Tombol "Ubah" dan "Hapus" berulang
// sekali per baris. Tanpa nama yang menyebut barisnya, screen reader
// membacakan "Ubah, Ubah, Ubah" — dan pengguna tidak punya cara mengetahui yang
// mana. Karena tombol Hapus di sini MENGHAPUS SUNGGUHAN, salah tekan berarti
// kehilangan data.
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient, BagianKarierApi } from "@nawasena/api-client";
import type { QueryKey } from "@nawasena/api-client";
import type { z } from "zod";
import { AreaTeks, KolomForm, Masukan, Tombol, WilayahMemuat } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { periksa, pesanGalatSimpan, type GalatKolom } from "./pesan-galat.js";

/** Nilai formulir satu baris — SELALU string, konversinya di `keBadan`. */
export type NilaiBaris = Readonly<Record<string, string>>;

export interface KolomKarier {
  nama: string;
  label: KunciTeks;
  bantuan?: KunciTeks;
  /**
   * `area` = teks panjang; `tanggal` = YYYY-MM-DD; `angka` = tahun.
   *
   * `tanggal` sengaja BUKAN `<input type="date">`. Pemilih tanggal bawaan
   * peramban berbeda-beda perilakunya dengan screen reader dan sebagian besar
   * menuntut interaksi kalender yang sulit dijangkau keyboard — sementara yang
   * diminta di sini hanyalah bulan dan tahun sebuah pekerjaan. Kolom teks
   * dengan format yang dijelaskan (`profil.karier.tanggalBantuan`) bisa
   * dijangkau siapa pun, dan skema zod yang sama dengan server menolak yang
   * salah bentuk.
   */
  jenis: "teks" | "area" | "tanggal" | "angka";
  maks?: number;
  wajib?: boolean;
}

export interface KonfigKarier<Item> {
  /** Nama bagian untuk judul kartu. */
  judul: KunciTeks;
  /** Nama satuan untuk label tombol & pengumuman ("pengalaman kerja"). */
  satuan: KunciTeks;
  kosong: KunciTeks;
  kolom: readonly KolomKarier[];
  /** Skema pembuatan — dipakai memvalidasi SEBELUM kirim (pesan per kolom). */
  skemaBuat: z.ZodType<unknown, z.ZodTypeDef, unknown>;
  api: BagianKarierApi<Item, never, never>;
  kunciQuery: QueryKey;
  /** Item → nilai formulir saat tombol Ubah ditekan. */
  keNilai: (item: Item) => NilaiBaris;
  /** Nilai formulir → badan permintaan (di sinilah "" menjadi null/angka). */
  keBadan: (nilai: NilaiBaris) => Record<string, unknown>;
  /** Judul baris — dipakai di layar, di `aria-label`, dan di pengumuman. */
  judulItem: (item: Item) => string;
  /** Baris kedua (opsional) — keterangan ringkas. */
  ringkas: (item: Item) => string | null;
  idItem: (item: Item) => string;
}

/** Nilai formulir kosong, diturunkan dari daftar kolomnya sendiri. */
function nilaiKosong(kolom: readonly KolomKarier[]): NilaiBaris {
  return Object.fromEntries(kolom.map((k) => [k.nama, ""]));
}

/** Teks "" → null; sisanya apa adanya. Dipakai seluruh konfigurasi. */
export function teksAtauNull(nilai: string | undefined): string | null {
  const bersih = (nilai ?? "").trim();
  return bersih === "" ? null : bersih;
}

/** Tahun "" → null, selain itu angka. Nilai bukan angka dibiarkan lewat sebagai NaN
 * supaya skema zod yang menolaknya, bukan kode ini — pesannya sudah ditulis di sana. */
export function angkaAtauNull(nilai: string | undefined): number | null {
  const bersih = (nilai ?? "").trim();
  return bersih === "" ? null : Number(bersih);
}

interface FormBarisProps {
  kolom: readonly KolomKarier[];
  nilai: NilaiBaris;
  onUbah: (nilai: NilaiBaris) => void;
  galat: GalatKolom;
  onSimpan: () => void;
  onBatal: () => void;
  sedangMenyimpan: boolean;
  /** Nama form untuk screen reader ("Tambah pengalaman kerja" / "Ubah …"). */
  namaForm: string;
}

function FormBaris({
  kolom,
  nilai,
  onUbah,
  galat,
  onSimpan,
  onBatal,
  sedangMenyimpan,
  namaForm,
}: FormBarisProps) {
  const t = useTeks();

  return (
    // `<form>` NATIF dengan `onSubmit`, bukan `<div>` berisi tombol: Enter di
    // dalam kolom teks mengirimkan form bawaan peramban, dan pengguna keyboard
    // memang mengharapkannya. Tanpa `<form>`, Enter tidak melakukan apa pun dan
    // satu-satunya jalan menyimpan adalah menemukan tombolnya.
    <form
      aria-label={namaForm}
      // `noValidate` — DAN ITU BUKAN MEMATIKAN VALIDASI, melainkan memilih
      // validasi yang mana.
      //
      // Kolom wajib menulis atribut `required` (lewat `KolomForm`), yang perlu
      // dipertahankan: screen reader mengumumkan "wajib diisi" darinya. Tetapi
      // `required` juga membuat peramban MEMBLOKIR submit dan menampilkan
      // gelembung bawaannya sendiri — dalam bahasa peramban, dengan gaya yang
      // tidak bisa diatur, hilang setelah beberapa detik, dan TIDAK terhubung
      // ke kolomnya lewat `aria-describedby`. Akibatnya seluruh pesan galat
      // kita — yang berbahasa Indonesia sederhana dan tersambung ke kolomnya —
      // tidak pernah berjalan sama sekali.
      //
      // Terbukti, bukan diduga: sebelum baris ini ada, menekan Simpan pada
      // formulir kosong tidak menghasilkan apa pun yang bisa dilihat maupun
      // didengar — `onSubmit` tidak pernah terpanggil.
      noValidate
      className="flex flex-col gap-4 rounded-md border border-gray-400 bg-gray-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (sedangMenyimpan) return;
        onSimpan();
      }}
    >
      {kolom.map((k) => (
        <KolomForm
          key={k.nama}
          label={t(k.label)}
          bantuan={k.bantuan === undefined ? undefined : t(k.bantuan)}
          wajib={k.wajib}
          galat={galat[k.nama]}
        >
          {k.jenis === "area" ? (
            <AreaTeks
              value={nilai[k.nama] ?? ""}
              maxLength={k.maks}
              onChange={(e) => {
                onUbah({ ...nilai, [k.nama]: e.target.value });
              }}
            />
          ) : (
            <Masukan
              value={nilai[k.nama] ?? ""}
              maxLength={k.maks}
              // `inputMode` memunculkan papan tik angka di ponsel tanpa
              // mengubah tipe kolomnya menjadi `number` — yang akan membawa
              // tombol naik-turun yang sulit dipakai dan menolak isian
              // sementara yang belum lengkap.
              inputMode={k.jenis === "angka" ? "numeric" : undefined}
              placeholder={k.jenis === "tanggal" ? "2024-03-01" : undefined}
              onChange={(e) => {
                onUbah({ ...nilai, [k.nama]: e.target.value });
              }}
            />
          )}
        </KolomForm>
      ))}

      <div className="flex flex-wrap gap-2">
        <Tombol type="submit" aria-disabled={sedangMenyimpan} aria-busy={sedangMenyimpan}>
          {sedangMenyimpan ? t("profil.aksi.menyimpan") : t("profil.karier.simpanBaris")}
        </Tombol>
        <Tombol type="button" varian="sekunder" onClick={onBatal}>
          {t("profil.karier.batal")}
        </Tombol>
      </div>
    </form>
  );
}

export interface DaftarKarierProps<Item> {
  konfig: KonfigKarier<Item>;
  klien: ApiClient;
}

export function DaftarKarier<Item>({ konfig, klien }: DaftarKarierProps<Item>) {
  const t = useTeks();
  const klienQuery = useQueryClient();

  /** `null` = tidak sedang menyunting; `"baru"` = form tambah; selain itu id baris. */
  const [sunting, setSunting] = useState<string | null>(null);
  const [nilai, setNilai] = useState<NilaiBaris>(() => nilaiKosong(konfig.kolom));
  const [galatKolom, setGalatKolom] = useState<GalatKolom>({});
  const [kabar, setKabar] = useState("");

  const daftar = useQuery({
    queryKey: konfig.kunciQuery,
    queryFn: () => konfig.api.list(klien),
  });

  function selesai(pesan: string): void {
    setSunting(null);
    setGalatKolom({});
    setKabar(pesan);
    void klienQuery.invalidateQueries({ queryKey: konfig.kunciQuery });
  }

  const simpan = useMutation({
    mutationFn: (arg: { id: string | null; badan: Record<string, unknown> }) =>
      arg.id === null
        ? konfig.api.create(klien, arg.badan as never)
        : konfig.api.update(klien, arg.id, arg.badan as never),
    onSuccess: (item, arg) => {
      selesai(
        t(arg.id === null ? "profil.karier.ditambah" : "profil.karier.diubah", {
          judul: konfig.judulItem(item),
        }),
      );
    },
  });

  const hapus = useMutation({
    mutationFn: (arg: { id: string; judul: string }) => konfig.api.remove(klien, arg.id),
    onSuccess: (_kosong, arg) => {
      selesai(t("profil.karier.dihapus", { judul: arg.judul }));
    },
  });

  function mulaiTambah(): void {
    setNilai(nilaiKosong(konfig.kolom));
    setGalatKolom({});
    setSunting("baru");
  }

  function mulaiUbah(item: Item): void {
    setNilai(konfig.keNilai(item));
    setGalatKolom({});
    setSunting(konfig.idItem(item));
  }

  function kirim(): void {
    // Dikosongkan lebih dulu supaya pengumuman yang SAMA dua kali berturut-turut
    // tetap terdengar: live region hanya mengumumkan perubahan.
    setKabar("");
    const hasil = periksa(konfig.skemaBuat, konfig.keBadan(nilai));
    if (!hasil.ok) {
      setGalatKolom(hasil.galat);
      return;
    }
    setGalatKolom({});
    simpan.mutate({ id: sunting === "baru" ? null : sunting, badan: hasil.nilai as Record<string, unknown> });
  }

  const satuan = t(konfig.satuan);
  const sibuk = simpan.isPending || hapus.isPending;
  const galat =
    simpan.isError || hapus.isError
      ? pesanGalatSimpan(simpan.error ?? hapus.error, t)
      : Object.keys(galatKolom).length > 0
        ? t("profil.galat.periksaKolom")
        : null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`karier-${konfig.satuan}`}>
      <h3 id={`karier-${konfig.satuan}`} className="text-base font-semibold text-gray-900">
        {t(konfig.judul)}
      </h3>

      <WilayahMemuat memuat={daftar.isPending} label={t("profil.memuat")}>
        {daftar.data !== undefined && daftar.data.length === 0 && sunting !== "baru" ? (
          <p className="text-base text-gray-700">{t(konfig.kosong)}</p>
        ) : null}

        {daftar.data !== undefined && daftar.data.length > 0 && (
          // `<ul>`: jumlah barisnya diumumkan lebih dulu ("daftar, 3 item"),
          // sehingga pengguna tahu seberapa panjang sebelum menyusurinya.
          <ul className="flex list-none flex-col gap-2 p-0">
            {daftar.data.map((item) => {
              const id = konfig.idItem(item);
              const judul = konfig.judulItem(item);
              const keterangan = konfig.ringkas(item);

              return (
                <li key={id} className="rounded-md border border-gray-300 p-3">
                  {sunting === id ? (
                    <FormBaris
                      kolom={konfig.kolom}
                      nilai={nilai}
                      onUbah={setNilai}
                      galat={galatKolom}
                      onSimpan={kirim}
                      onBatal={() => {
                        setSunting(null);
                      }}
                      sedangMenyimpan={simpan.isPending}
                      namaForm={t("profil.karier.ubahLabel", { judul })}
                    />
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-base font-medium text-gray-900">{judul}</span>
                        {keterangan !== null && (
                          <span className="text-sm text-gray-700">{keterangan}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Tombol
                          varian="sekunder"
                          ukuran="kecil"
                          aria-label={t("profil.karier.ubahLabel", { judul })}
                          onClick={() => {
                            mulaiUbah(item);
                          }}
                        >
                          {t("profil.karier.ubah")}
                        </Tombol>
                        <Tombol
                          varian="sekunder"
                          ukuran="kecil"
                          aria-label={t("profil.karier.hapusLabel", { judul })}
                          aria-disabled={sibuk}
                          onClick={() => {
                            if (sibuk) return;
                            setKabar("");
                            hapus.mutate({ id, judul });
                          }}
                        >
                          {t("profil.karier.hapus")}
                        </Tombol>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </WilayahMemuat>

      {sunting === "baru" ? (
        <FormBaris
          kolom={konfig.kolom}
          nilai={nilai}
          onUbah={setNilai}
          galat={galatKolom}
          onSimpan={kirim}
          onBatal={() => {
            setSunting(null);
          }}
          sedangMenyimpan={simpan.isPending}
          namaForm={t("profil.karier.tambah", { bagian: satuan })}
        />
      ) : (
        <div>
          <Tombol varian="sekunder" onClick={mulaiTambah}>
            {t("profil.karier.tambah", { bagian: satuan })}
          </Tombol>
        </div>
      )}

      {galat !== null && (
        <p role="alert" className="text-base font-medium text-red-700">
          {galat}
        </p>
      )}

      <p role="status" className="sr-only">
        {kabar}
      </p>
    </section>
  );
}

/** Dipakai konfigurasi untuk merangkai baris kedua tanpa memikirkan pemisahnya. */
export function gabungKeterangan(...bagian: ReadonlyArray<string | null>): string | null {
  const isi = bagian.filter((b): b is string => b !== null && b !== "");
  return isi.length === 0 ? null : isi.join(" · ");
}

/** Tipe bantu supaya konfigurasi tidak perlu menyebut ulang `ReactNode`. */
export type IsiKarier = ReactNode;
