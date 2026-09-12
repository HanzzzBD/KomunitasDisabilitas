// Tabel — AC PR-052: "AdminTable: header terasosiasi, sortable via keyboard,
// caption". Dipakai lintas fitur admin (PR-053, PR-057, PR-077, PR-081,
// PR-083, PR-085) — karena itu ia tinggal di sini, bukan di salah satu fitur
// itu (lihat catatan batas "punya domain, bukan baru" di index.ts).
//
// DIBANGUN DI ATAS <table> NATIF, sama alasannya dengan `Tombol`: elemen natif
// sudah memberi peran `columnheader`/`cell`/`row` dan asosiasi header→sel tanpa
// satu atribut ARIA pun ditulis tangan. Yang ditambahkan di sini hanya DUA hal
// yang tidak dimiliki HTML polos — pengurutan dan keadaan kosong.
//
// PENGURUTAN TERKENDALI PEMANGGIL (`urutan`/`onUrutkan`), bukan Tabel yang
// mengurutkan `data` sendiri. Komponen ini tidak tahu apa pun tentang tipe
// datanya di luar `kunci`/`render` — mengurutkan berarti membandingkan nilai,
// dan perbandingan yang benar (tanggal, angka, string berlokal) hanya
// diketahui pemanggil yang tahu bentuk datanya.
//
// TOMBOL URUT ADALAH <button> NATIF DI DALAM <th>. Itulah seluruh jawaban atas
// "sortable via keyboard": tombol native sudah fokusabel lewat Tab dan
// teraktivasi Enter/Spasi tanpa satu baris penanganan tombol pun. `aria-sort`
// ditaruh di <th> (bukan di tombolnya) sesuai WAI-ARIA APG — sebagian screen
// reader membacakannya sebagai "diurutkan menaik" begitu fokus memasuki
// kolom itu.
import type { ReactNode } from "react";
import { gabungKelas } from "./gabung-kelas.js";

export interface KolomTabel<T> {
  /** Nama field sumber data — dipakai isi sel bawaan DAN sebagai id pengurutan. */
  kunci: keyof T & string;
  label: ReactNode;
  /** Isi sel kustom (format tanggal, badge status, tautan, dsb). */
  render?: (baris: T) => ReactNode;
  /** Kolom ini boleh diurutkan — header-nya menjadi tombol. */
  urut?: boolean;
}

export interface UrutanTabel {
  kunci: string;
  arah: "asc" | "desc";
}

export interface TabelProps<T> {
  kolom: ReadonlyArray<KolomTabel<T>>;
  data: readonly T[];
  /** React key SEKALIGUS identitas baris — harus stabil antar render. */
  kunciBaris: (baris: T) => string;
  /**
   * Nama tabel — dirender sebagai `<caption>`. WAJIB, sama alasannya dengan
   * `label` pada `Tab`: tanpanya, pengguna screen reader yang berpindah antar
   * beberapa tabel di satu halaman tidak tahu tabel mana yang sedang ia
   * jelajahi.
   */
  judul: ReactNode;
  /**
   * Ditampilkan menggantikan baris saat `data` kosong. WAJIB — lihat alasan
   * yang sama di `KeadaanKosong`: layar kosong tanpa penjelasan membuat
   * pengguna menebak apakah ia salah memfilter atau memang belum ada apa-apa.
   */
  kosong: ReactNode;
  urutan?: UrutanTabel;
  /** Dipanggil dengan `kunci` kolom yang tombolnya ditekan/diaktifkan. */
  onUrutkan?: (kunci: string) => void;
  className?: string;
}

export function Tabel<T>({
  kolom,
  data,
  kunciBaris,
  judul,
  kosong,
  urutan,
  onUrutkan,
  className,
}: TabelProps<T>) {
  return (
    // Pembungkus gulir mendatar: tabel admin biasanya punya lebih banyak
    // kolom daripada muat di 320px, dan tabel adalah salah satu dari sedikit
    // elemen yang BOLEH menggulir sendiri alih-alih memaksa seluruh halaman
    // bergeser (WCAG 1.4.10 Reflow).
    <div className="overflow-x-auto">
      <table className={gabungKelas("w-full border-collapse text-left text-base", className)}>
        <caption className="mb-2 text-left text-sm font-semibold text-gray-700">{judul}</caption>
        <thead>
          <tr className="border-b border-gray-400">
            {kolom.map((k) => {
              // `urutan !== undefined && …` (bukan `urutan?.kunci === …`)
              // supaya TypeScript menyempitkan `urutan` di CABANG BENAR ternary
              // ini — penyempitan lewat optional chaining tidak menjalar ke
              // `urutan.arah` di bawah meski secara logika keduanya setara.
              const arahAktif: "asc" | "desc" | null =
                urutan !== undefined && urutan.kunci === k.kunci ? urutan.arah : null;
              const ariaSort =
                !k.urut ? undefined : arahAktif === null ? "none" : arahAktif === "asc" ? "ascending" : "descending";

              return (
                <th
                  key={k.kunci}
                  scope="col"
                  aria-sort={ariaSort}
                  className="p-2 font-semibold text-gray-900"
                >
                  {k.urut ? (
                    <button
                      type="button"
                      onClick={() => onUrutkan?.(k.kunci)}
                      className={gabungKelas(
                        "min-h-sentuh inline-flex items-center gap-1 rounded",
                        "hover:bg-gray-100",
                        "transition-colors gerak-minimal:transition-none",
                      )}
                    >
                      {k.label}
                      {/* Panah, `aria-hidden`: keadaannya sudah dinyatakan `aria-sort`
                          di <th>; panah ini murni penguat visual. */}
                      <span aria-hidden="true" className="text-sm">
                        {arahAktif === null ? "↕" : arahAktif === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  ) : (
                    k.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={kolom.length} className="p-4">
                {kosong}
              </td>
            </tr>
          ) : (
            data.map((baris) => (
              <tr key={kunciBaris(baris)} className="border-b border-gray-200">
                {kolom.map((k) => (
                  <td key={k.kunci} className="p-2 text-gray-900">
                    {k.render ? k.render(baris) : renderBawaan(baris[k.kunci])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Isi sel bawaan bagi kolom tanpa `render` — nilai mentah sebagai teks. */
function renderBawaan(nilai: unknown): ReactNode {
  if (nilai === null || nilai === undefined) return "";
  if (typeof nilai === "string" || typeof nilai === "number") return nilai;
  return String(nilai);
}
